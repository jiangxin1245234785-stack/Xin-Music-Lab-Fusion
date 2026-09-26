"""CPU-conscious harmony analysis for Xin's Local Deck.

Three independent lanes share one cached chroma extraction.  The lanes are
deliberately not fused so the listener can compare their behaviour directly.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
from pathlib import Path

import librosa
import numpy as np


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

SAMPLE_RATE = 22050
HOP_LENGTH = 2048
CACHE_VERSION = 2
CACHE_NAME = f"harmony-features-v{CACHE_VERSION}.npz"
SEPARATION_MODES = ("none", "hpss", "demucs")
# >1 isolates the harmonic (pitched) layer more aggressively; chord/chroma
# engines read cleaner once drums/transients are suppressed.
HPSS_MARGIN = 3.0
# Demucs v4 stem model. We keep bass+other (vocals + drums removed) — the
# harmonic accompaniment — which measurably lifts the chroma engines on
# tonal/drum-heavy material. Weights live under TORCH_HOME (set to D: by the
# launcher). The model is loaded once per process and reused across engines.
DEMUCS_MODEL_NAME = "htdemucs"
_DEMUCS_MODEL = None
# BTC posterior-aware smoothing: flicker shorter than BTC_MIN_SECONDS is folded
# into its higher-confidence neighbour, but a short span the model is sure about
# (posterior >= BTC_KEEP_CONFIDENCE) is treated as a genuine fast change and kept.
BTC_MIN_SECONDS = 0.5
BTC_KEEP_CONFIDENCE = 0.7
PITCHES = ("C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B")

ENGINES = [
    {
        "id": "chord-cqt",
        "name": "Librosa · CQT / HMM",
        "family": "harmony",
        "status": "24 大小三和弦 + N · 瞬态响应较快",
        "description": "Librosa CQT chroma · template likelihood · Viterbi smoothing",
        "resource": "CPU LIGHT",
        "vocabulary": "maj-min",
        "feature": "cqt",
        "change_penalty": 2.15,
        "minimum_seconds": 1.15,
    },
    {
        "id": "chord-cens",
        "name": "Librosa · CENS / HMM",
        "family": "harmony",
        "status": "24 大小三和弦 + N · 稳定和声优先",
        "description": "Librosa CENS chroma · template likelihood · strong Viterbi smoothing",
        "resource": "CPU LIGHT",
        "vocabulary": "maj-min",
        "feature": "cens",
        "change_penalty": 3.25,
        "minimum_seconds": 2.20,
    },
    {
        "id": "chord-hybrid",
        "name": "Hybrid · Bass + Extended",
        "family": "harmony",
        "status": "根音加权 · 7 / maj7 / m7 / sus / dim",
        "description": "Librosa CQT chroma + bass chroma · extended chord templates · Viterbi",
        "resource": "CPU MEDIUM",
        "vocabulary": "extended",
        "feature": "hybrid",
        "change_penalty": 1.85,
        "minimum_seconds": 0.95,
    },
    {
        "id": "chord-btc",
        "name": "BTC · Transformer",
        "family": "harmony",
        "status": "神经网络 · 170 类和弦(7/maj7/m7/6/dim/aug/sus)· GPU 高可靠",
        "description": "Bi-directional Transformer for Chord Recognition (ISMIR19) · large vocabulary",
        "resource": "GPU",
        "vocabulary": "btc-large",
        "source": "https://github.com/jayg996/BTC-ISMIR19",
        "weights": "btc",
    },
    {
        "id": "chord-chordmini",
        "name": "ChordMini · BTC-CL",
        "family": "harmony",
        "status": "神经网络 · 170 类 · BTC 同架构蒸馏版(伪标签 1000 h + 选择性蒸馏)· GPU",
        "description": "ChordMini BTC-CL student (Phan et al., DAFx26 preprint) · same CQT front end and 170-class vocabulary as BTC",
        "resource": "GPU",
        "vocabulary": "btc-large",
        "source": "https://github.com/ptnghia-j/ChordMini",
        "weights": "chordmini",
    },
    {
        "id": "chord-consonance",
        "name": "consonance-ACE · Conformer",
        "family": "harmony",
        "status": "神经网络 · 根音 / 低音 / 音级分解输出 · 含转位与扩展和弦 · GPU",
        "description": "Decomposed Conformer (Poltronieri, Serra, Rocamora, ISMIR 2025) · root / bass / pitch-class heads · Harte labels",
        "resource": "GPU",
        "vocabulary": "harte-decomposed",
        "source": "https://github.com/andreamust/consonance-ACE",
        "weights": "consonance-ace",
    },
]


def emit(message: str, progress: float | None = None, **metadata) -> None:
    payload = {"message": message, **metadata}
    if progress is not None:
        payload["progress"] = progress
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def engine_list() -> list[dict]:
    out = []
    for engine in ENGINES:
        weights = engine.get("weights")
        if weights == "btc":
            available = btc_available()
            status = engine["status"] if available else "BTC 权重或 torch 缺失,运行 setup-ai.ps1"
        elif weights == "chordmini":
            available = btc_available() and chordmini_weights().is_file()
            status = engine["status"] if available else "ChordMini 权重缺失(runtime/addons/chords-v1/models/chordmini)"
        elif weights == "consonance-ace":
            available = consonance_available()
            status = engine["status"] if available else "chords-v1 环境或 consonance-ACE 权重缺失(XLD_CHORDS_ROOT / XLD_CHORDS_PYTHON)"
        else:
            available, status = True, engine["status"]
        out.append({**{k: v for k, v in engine.items() if k != "weights"}, "available": available, "status": status})
    return out


# --- BTC (Bi-directional Transformer for Chord recognition, ISMIR19) ---------
# Neural chord engine; far richer/more reliable than the librosa template lanes.
# Runs on the GPU via the AI venv. Code is vendored under ./btc (two modern-Python
# fixes applied: yaml Loader, np.float alias). Weights stay in the runtime tree:
# <XLD_RUNTIME_ROOT>/analysis-harmony/btc/weights, with the old in-tree location as fallback.
BTC_DIR = Path(__file__).resolve().parent / "btc"


def btc_weights() -> Path:
    runtime_root = os.environ.get("XLD_RUNTIME_ROOT")
    candidates = []
    if runtime_root:
        candidates.append(Path(runtime_root) / "analysis-harmony" / "btc" / "weights" / "btc_model_large_voca.pt")
    candidates.append(BTC_DIR / "weights" / "btc_model_large_voca.pt")
    return next((c for c in candidates if c.is_file()), candidates[0])


BTC_WEIGHTS = btc_weights()


# --- R2 chord engines (runtime/addons/chords-v1) --------------------------------------
def chords_root() -> Path | None:
    value = os.environ.get("XLD_CHORDS_ROOT")
    return Path(value) if value else None


def chordmini_weights() -> Path:
    root = chords_root()
    return (root / "models" / "chordmini" / "btc_model_best.pth") if root else Path("chordmini-weights-missing")


def consonance_weights() -> Path:
    root = chords_root()
    return (root / "models" / "consonance-ace" / "conformer_decomposed_smooth.ckpt") if root else Path("consonance-weights-missing")


ACE_DIR = Path(__file__).resolve().parent / "vendor" / "ace"


def consonance_available() -> bool:
    python = os.environ.get("XLD_CHORDS_PYTHON")
    return bool(python) and Path(python).is_file() and consonance_weights().is_file() and (ACE_DIR / "ACE" / "inference.py").is_file()


def file_sha256(path: Path) -> str:
    import hashlib
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()

_ROOT_SPELL = {
    "C": "C", "C#": "C#", "Db": "C#", "D": "D", "D#": "Eb", "Eb": "Eb", "E": "E",
    "F": "F", "F#": "F#", "Gb": "F#", "G": "G", "G#": "Ab", "Ab": "Ab", "A": "A",
    "A#": "Bb", "Bb": "Bb", "B": "B",
}
_QUAL_SUFFIX = {
    "": "", "maj": "", "min": "m", "dim": "dim", "aug": "aug", "min6": "m6",
    "maj6": "6", "min7": "m7", "minmaj7": "mM7", "maj7": "maj7", "7": "7",
    "dim7": "dim7", "hdim7": "m7b5", "sus2": "sus2", "sus4": "sus4",
    "9": "9", "maj9": "maj9", "min9": "m9",
}


def mirex_to_label(mirex: str) -> str:
    """MIREX chord label (e.g. 'F#:7', 'C#:min', 'G#', 'N') -> XLD style ('F#7',
    'C#m', 'Ab', 'N'), normalising enharmonic roots to the app's spelling."""
    if not mirex or mirex in ("N", "X"):
        return "N"
    root, _, qual = mirex.partition(":")
    root = root.split("/")[0].strip()
    qual = qual.split("/")[0].strip()
    return f"{_ROOT_SPELL.get(root, root)}{_QUAL_SUFFIX.get(qual, qual)}"


def btc_available() -> bool:
    if not BTC_WEIGHTS.is_file():
        return False
    try:
        import importlib.util
        return importlib.util.find_spec("torch") is not None
    except Exception:
        return False


def analyze_btc(engine: dict, input_path: str, output_path: str, separation: str = "none") -> dict:
    started = time.time()
    import torch

    if str(BTC_DIR) not in sys.path:
        sys.path.insert(0, str(BTC_DIR))
    from btc_model import BTC_model
    from utils.hparams import HParams
    from utils.mir_eval_modules import audio_file_to_features, idx2voca_chord

    config = HParams.load(str(BTC_DIR / "run_config.yaml"))
    config.feature["large_voca"] = True
    config.model["num_chords"] = 170
    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    weights = chordmini_weights() if engine.get("weights") == "chordmini" else BTC_WEIGHTS
    if not weights.is_file():
        raise FileNotFoundError(f"和弦模型权重缺失: {weights}")
    emit(f"{engine['name']} 正在加载模型(设备 {device})", 0.12, phase="model")
    model = BTC_model(config=config.model).to(device)
    checkpoint = torch.load(str(weights), map_location=device, weights_only=False)
    if "model_state_dict" in checkpoint:
        # ChordMini checkpoint layout: state dict + normalization dict + its own idx_to_chord
        # (same 170 slots as BTC, enharmonic spellings differ; mirex_to_label normalises roots).
        mean, std = float(checkpoint["normalization"]["mean"]), float(checkpoint["normalization"]["std"])
        model.load_state_dict(checkpoint["model_state_dict"])
        idx_to_chord = {int(k): str(v) for k, v in checkpoint["idx_to_chord"].items()}
    else:
        mean, std = checkpoint["mean"], checkpoint["std"]
        model.load_state_dict(checkpoint["model"])
        idx_to_chord = idx2voca_chord()
    model.eval()
    checkpoint_meta = {"file": weights.name, "sha256": file_sha256(weights)}

    btc_input = input_path
    separated_tmp: Path | None = None
    if separation != "none":
        import soundfile as sf
        emit(f"BTC 正在分离音轨 · {separation}", 0.22, phase="separate")
        if separation == "demucs":
            sr = 44100
            y = demucs_harmonic_mono(input_path, sr)
        else:
            y, native = librosa.load(input_path, sr=None, mono=True)
            y = separate_harmonic(y, separation)
            sr = int(native)
        separated_tmp = Path(output_path).with_name(f"{Path(output_path).stem}.sep-{separation}.{os.getpid()}.wav")
        sf.write(str(separated_tmp), y, int(sr))
        btc_input = str(separated_tmp)

    emit("BTC 正在提取 CQT 特征", 0.32, phase="features")
    try:
        feature, frame_seconds, duration = audio_file_to_features(btc_input, config)
    finally:
        if separated_tmp is not None:
            separated_tmp.unlink(missing_ok=True)
    feature = ((feature.T) - mean) / std
    n_timestep = config.model["timestep"]
    num_pad = n_timestep - (feature.shape[0] % n_timestep)
    feature = np.pad(feature, ((0, num_pad), (0, 0)), mode="constant", constant_values=0)
    num_instance = feature.shape[0] // n_timestep

    emit(f"BTC 推理(设备 {device})", 0.50, phase="infer", durationSeconds=duration)
    # Per-frame top-1 chord index + its softmax posterior. The posterior is the
    # model's real confidence; the previous code discarded it and stamped a
    # constant 0.9. Chord labels are unchanged (argmax is identical) — this only
    # surfaces how sure BTC is, which the consensus/colour layers can use.
    frame_indices: list[int] = []
    frame_confidences: list[float] = []
    with torch.no_grad():
        feat = torch.tensor(feature, dtype=torch.float32).unsqueeze(0).to(device)
        for t in range(num_instance):
            attn, _ = model.self_attn_layers(feat[:, n_timestep * t:n_timestep * (t + 1), :])
            logits = model.output_layer.output_projection(attn)
            probs = torch.softmax(logits, dim=-1).squeeze(0)
            conf, pred = probs.max(dim=-1)
            frame_indices.extend(int(value) for value in pred.tolist())
            frame_confidences.extend(float(value) for value in conf.tolist())

    raw: list[tuple[float, float, str, float]] = []
    start_time = 0.0
    prev = None
    seg_conf: list[float] = []
    for abs_idx, (cur, conf_value) in enumerate(zip(frame_indices, frame_confidences)):
        if prev is None:
            prev = cur
            seg_conf = [conf_value]
            continue
        if cur != prev:
            raw.append((start_time, frame_seconds * abs_idx, idx_to_chord[prev], sum(seg_conf) / max(1, len(seg_conf))))
            start_time = frame_seconds * abs_idx
            prev = cur
            seg_conf = [conf_value]
        else:
            seg_conf.append(conf_value)
    if prev is not None:
        raw.append((start_time, min(duration, frame_seconds * len(frame_indices)), idx_to_chord[prev], sum(seg_conf) / max(1, len(seg_conf))))

    segments: list[dict] = []
    for s, e, mirex, conf_value in raw:
        e = min(float(e), duration)
        if e <= s:
            continue
        label = mirex_to_label(mirex)
        if segments and segments[-1]["label"] == label:
            # Duration-weighted confidence when stitching adjacent same-label spans.
            previous = segments[-1]
            prev_dur = previous["end"] - previous["start"]
            this_dur = e - float(s)
            total = prev_dur + this_dur
            if total > 0:
                previous["confidence"] = round((previous["confidence"] * prev_dur + conf_value * this_dur) / total, 4)
            previous["end"] = round(e, 3)
        else:
            segments.append({"start": round(float(s), 3), "end": round(e, 3), "label": label, "confidence": round(float(conf_value), 4), "rawLabel": mirex})

    # Posterior-aware flicker cleanup: BTC's raw per-frame argmax produces many
    # sub-0.5s blips; fold the uncertain ones into their better-supported
    # neighbour while keeping short spans the model is confident about.
    raw_segment_count = len(segments)
    segments = merge_short_segments(segments, BTC_MIN_SECONDS, keep_confidence=BTC_KEEP_CONFIDENCE)

    non_n = [seg for seg in segments if seg["label"] != "N"]
    no_chord_seconds = sum(seg["end"] - seg["start"] for seg in segments if seg["label"] == "N")
    result = {
        "schemaVersion": 2,
        "kind": "harmony",
        "duration": round(float(duration), 3),
        "segments": segments,
        "engine": {
            "id": engine["id"],
            "name": engine["name"],
            "family": "harmony",
            "description": engine["description"],
            "resource": engine["resource"],
            "vocabulary": engine["vocabulary"],
            "source": engine.get("source", "https://github.com/jayg996/BTC-ISMIR19"),
            "checkpoint": checkpoint_meta,
        },
        "metrics": {
            "chordChanges": max(0, len(segments) - 1),
            "uniqueChords": len({seg["label"] for seg in non_n}),
            "meanConfidence": round(float(np.mean([seg["confidence"] for seg in segments])) if segments else 0, 4),
            "noChordRatio": round(no_chord_seconds / max(duration, 1e-8), 4),
            "rawSegments": raw_segment_count,
            "smoothing": {"minSeconds": BTC_MIN_SECONDS, "keepConfidence": BTC_KEEP_CONFIDENCE},
        },
        "featureCacheHit": False,
        "separation": separation,
        "elapsedSeconds": round(time.time() - started, 3),
        "source": str(Path(input_path).resolve()),
    }
    write_result(output_path, result)
    emit(f"{engine['name']} 和弦识别完成 · 结果已写入 Harmony Lab", 1.0, phase="complete", durationSeconds=duration)
    return result


def write_result(output_path: str, result: dict) -> None:
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(f"{output.suffix}.{os.getpid()}.tmp")
    temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(output)


def harte_to_label(harte: str) -> str:
    """Harte label from consonance-ACE ('A#:7/3', 'D#:maj6', 'F:min7', 'C:(1,b3,5)', 'N') -> XLD style.
    The inversion is kept only in rawLabel / bass; interval lists that have no shorthand keep the raw quality."""
    if not harte or harte in ("N", "X"):
        return "N"
    root, _, rest = harte.partition(":")
    root = root.split("/")[0].strip()
    qual = rest.split("/")[0].strip()
    if qual in _QUAL_SUFFIX:
        return f"{_ROOT_SPELL.get(root, root)}{_QUAL_SUFFIX[qual]}"
    return f"{_ROOT_SPELL.get(root, root)}{qual}"


def analyze_consonance(engine: dict, input_path: str, output_path: str, separation: str = "none") -> dict:
    """consonance-ACE decomposed Conformer: per-frame root (13) / bass (13) / pitch-class (12) heads,
    decoded to Harte labels exactly like the upstream inference script (20 s chunks, 0.5 s minimum),
    plus a confidence taken from the root head's softmax."""
    started = time.time()
    import torch
    weights = consonance_weights()
    if not weights.is_file():
        raise FileNotFoundError(f"consonance-ACE 权重缺失: {weights}")
    if str(ACE_DIR) not in sys.path:
        sys.path.insert(0, str(ACE_DIR))
    from ACE.models.conformer_decomposed import ConformerDecomposedModel
    from ACE.preprocess.audio_processor import AudioChunkProcessor
    from ACE.preprocess.transforms import CQTransform
    from ACE.mir_evaluation import decode_chord, remove_short_chords

    device = "cuda" if torch.cuda.is_available() else "cpu"
    if device == "cuda":
        torch.cuda.reset_peak_memory_stats()
    emit(f"{engine['name']} 正在加载模型(设备 {device})", 0.12, phase="model")
    model = ConformerDecomposedModel.load_from_checkpoint(
        str(weights), vocabularies={"root": 13, "bass": 13, "onehot": 12}, map_location=device,
        loss="consonance_decomposed", vocab_path=str(ACE_DIR / "ACE" / "chords_vocab.joblib"), strict=False)
    model.eval().to(device)
    checkpoint_meta = {"file": weights.name, "sha256": file_sha256(weights)}

    source_path = input_path
    separated_tmp: Path | None = None
    if separation != "none":
        import soundfile as sf
        emit(f"{engine['name']} 正在分离音轨 · {separation}", 0.22, phase="separate")
        if separation == "demucs":
            sr = 44100
            y = demucs_harmonic_mono(input_path, sr)
        else:
            y, native = librosa.load(input_path, sr=None, mono=True)
            y = separate_harmonic(y, separation)
            sr = int(native)
        separated_tmp = Path(output_path).with_name(f"{Path(output_path).stem}.sep-{separation}.{os.getpid()}.wav")
        sf.write(str(separated_tmp), y, int(sr))
        source_path = str(separated_tmp)

    sample_rate, hop_length, chunk_seconds, threshold, min_seconds = 22050, 512, 20.0, 0.5, 0.5
    try:
        chunker = AudioChunkProcessor(audio_path=Path(source_path), target_sample_rate=sample_rate, hop_length=hop_length,
                                      max_sequence_length=chunk_seconds, device=device, transform=CQTransform(sample_rate, hop_length), normalize=True)
        duration = float(librosa.get_duration(path=str(source_path)))
    finally:
        if separated_tmp is not None:
            separated_tmp.unlink(missing_ok=True)
    chunks = max(1, int(math.ceil(duration / chunk_seconds)))
    emit(f"{engine['name']} 推理(设备 {device})", 0.30, phase="infer", durationSeconds=duration)
    frames: list[tuple[float, float, str, float]] = []  # start, end, harte, confidence
    with torch.no_grad():
        for index in range(chunks):
            onset = index * chunk_seconds
            features = chunker.process_chunk(onset=onset)
            if features.ndim == 2:
                features = features.unsqueeze(0).unsqueeze(0)
            elif features.ndim == 3:
                features = features.unsqueeze(0)
            outputs = model(features.to(device))
            root_probs = torch.softmax(outputs["root"], dim=-1).squeeze(0)
            root_conf, root = root_probs.max(dim=-1)
            bass = outputs["bass"].argmax(dim=-1).squeeze(0)
            chord = torch.sigmoid(outputs["onehot"]).squeeze(0)
            count = int(root.shape[0])
            frame_seconds = chunk_seconds / count
            for i in range(count):
                start = onset + i * frame_seconds
                if start >= duration:
                    break
                label = decode_chord(root=int(root[i]), bass=int(bass[i]), chord=chord[i].cpu().numpy(), threshold=threshold)
                frames.append((start, min(duration, start + frame_seconds), label, float(root_conf[i])))
            emit(f"{engine['name']} 推理 {index + 1}/{chunks}", 0.30 + 0.6 * (index + 1) / chunks, phase="infer", durationSeconds=duration)

    # Group identical consecutive frames, remove <0.5 s spans like upstream, then merge identical neighbours.
    grouped: list[list] = []
    for start, end, label, conf in frames:
        if grouped and grouped[-1][2] == label:
            grouped[-1][1] = end
            grouped[-1][3].append(conf)
        else:
            grouped.append([start, end, label, [conf]])
    intervals = np.array([[g[0], g[1]] for g in grouped]) if grouped else np.zeros((0, 2))
    labels = [g[2] for g in grouped]
    confidences = {(round(g[0], 6), g[2]): float(np.mean(g[3])) for g in grouped}
    intervals, labels = remove_short_chords(intervals, labels, min_duration=min_seconds)
    segments: list[dict] = []
    for (s, e), harte in zip(intervals, labels):
        s, e = float(s), min(float(e), duration)
        if e <= s:
            continue
        label = harte_to_label(harte)
        conf = confidences.get((round(s, 6), harte), 0.0)
        bass = harte.split("/")[1] if "/" in harte else None
        if segments and segments[-1]["label"] == label and segments[-1]["rawLabel"] == harte:
            previous = segments[-1]
            prev_dur = previous["end"] - previous["start"]
            this_dur = e - s
            previous["confidence"] = round((previous["confidence"] * prev_dur + conf * this_dur) / max(prev_dur + this_dur, 1e-8), 4)
            previous["end"] = round(e, 3)
        else:
            item = {"start": round(s, 3), "end": round(e, 3), "label": label, "confidence": round(conf, 4), "rawLabel": harte}
            if bass:
                item["bass"] = bass
            segments.append(item)
    non_n = [seg for seg in segments if seg["label"] != "N"]
    no_chord_seconds = sum(seg["end"] - seg["start"] for seg in segments if seg["label"] == "N")
    result = {
        "schemaVersion": 2,
        "kind": "harmony",
        "duration": round(duration, 3),
        "segments": segments,
        "engine": {
            "id": engine["id"],
            "name": engine["name"],
            "family": "harmony",
            "description": engine["description"],
            "resource": engine["resource"],
            "vocabulary": engine["vocabulary"],
            "source": engine["source"],
            "checkpoint": checkpoint_meta,
        },
        "metrics": {
            "chordChanges": max(0, len(segments) - 1),
            "uniqueChords": len({seg["label"] for seg in non_n}),
            "uniqueRawChords": len({seg["rawLabel"] for seg in non_n}),
            "inversions": sum(1 for seg in non_n if seg.get("bass")),
            "meanConfidence": round(float(np.mean([seg["confidence"] for seg in segments])) if segments else 0, 4),
            "noChordRatio": round(no_chord_seconds / max(duration, 1e-8), 4),
            "rawSegments": len(grouped),
            "smoothing": {"minSeconds": min_seconds, "method": "upstream remove_short_chords"},
            "decoding": {"threshold": threshold, "chunkSeconds": chunk_seconds, "sampleRate": sample_rate, "hopLength": hop_length, "confidence": "root softmax max"},
            "peakGpuMiB": round(torch.cuda.max_memory_allocated() / 1048576) if device == "cuda" else None,
        },
        "featureCacheHit": False,
        "separation": separation,
        "elapsedSeconds": round(time.time() - started, 3),
        "source": str(Path(input_path).resolve()),
    }
    write_result(output_path, result)
    emit(f"{engine['name']} 和弦识别完成 · 结果已写入 Harmony Lab", 1.0, phase="complete", durationSeconds=duration)
    return result


def normalize_columns(values: np.ndarray) -> np.ndarray:
    values = np.maximum(np.asarray(values, dtype=np.float32), 0)
    return values / np.maximum(values.sum(axis=0, keepdims=True), 1e-8)


def aligned(values: np.ndarray, frames: int) -> np.ndarray:
    values = np.asarray(values, dtype=np.float32)
    if values.shape[-1] >= frames:
        return values[..., :frames]
    return np.pad(values, [(0, 0)] * (values.ndim - 1) + [(0, frames - values.shape[-1])], mode="edge")


def separate_harmonic(samples: np.ndarray, mode: str) -> np.ndarray:
    """Optional source-separation preprocessing applied before chroma/CQT.

    'hpss' runs librosa's median-filtering harmonic-percussive separation and
    keeps the harmonic (pitched) layer, dropping drums and broadband
    transients so chroma/template engines get a cleaner harmonic read. Returns
    the input unchanged for 'none'. This is the zero-install first rung; AI
    stem separation (Demucs / RoFormer) can replace it behind the same flag."""
    if mode == "none":
        return samples
    if mode == "hpss":
        return librosa.effects.harmonic(samples, margin=HPSS_MARGIN).astype(np.float32)
    raise ValueError(f"unknown separation mode: {mode}")


def demucs_available() -> bool:
    try:
        import demucs.pretrained  # noqa: F401
        return True
    except Exception:
        return False


def _get_demucs_model():
    global _DEMUCS_MODEL
    if _DEMUCS_MODEL is None:
        import torch
        from demucs.pretrained import get_model
        model = get_model(DEMUCS_MODEL_NAME)
        model.to("cuda" if torch.cuda.is_available() else "cpu").eval()
        _DEMUCS_MODEL = model
    return _DEMUCS_MODEL


def demucs_harmonic_mono(input_path: str, target_sr: int) -> np.ndarray:
    """Separate with Demucs v4 and return the harmonic accompaniment
    (bass + other = vocals and drums removed) as mono at target_sr.

    Demucs's own AudioFile shells out to ffmpeg (not installed here), so we load
    with librosa and feed the tensor to apply_model directly; chunking
    (split=True) keeps VRAM bounded regardless of track length."""
    import torch
    from demucs.apply import apply_model
    model = _get_demucs_model()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    stereo, _ = librosa.load(input_path, sr=model.samplerate, mono=False)
    if stereo.ndim == 1:
        stereo = np.stack([stereo, stereo])
    elif stereo.shape[0] > 2:
        stereo = stereo[:2]
    wav = torch.tensor(stereo, dtype=torch.float32)
    ref = wav.mean(0)
    wav = (wav - ref.mean()) / (ref.std() + 1e-8)
    with torch.no_grad():
        sources = apply_model(model, wav[None].to(device), split=True, overlap=0.25, progress=False, device=device)[0]
    sources = sources * ref.std() + ref.mean()
    index = {name: i for i, name in enumerate(model.sources)}
    harmonic = (sources[index["bass"]] + sources[index["other"]]).cpu().numpy()
    mono = harmonic.mean(axis=0).astype(np.float32)
    if int(model.samplerate) != int(target_sr):
        mono = librosa.resample(mono, orig_sr=int(model.samplerate), target_sr=int(target_sr), res_type="polyphase")
    return mono.astype(np.float32)


def extract_features(input_path: str, cache_path: Path, separation: str = "none") -> tuple[dict[str, np.ndarray | float], bool]:
    if cache_path.is_file():
        try:
            cached = np.load(cache_path, allow_pickle=False)
            if int(cached["version"]) == CACHE_VERSION:
                return {key: cached[key] for key in cached.files}, True
        except Exception:
            cache_path.unlink(missing_ok=True)

    emit("正在解码音频 · 22.05 kHz 单声道", 0.04, phase="decode", cacheHit=False)
    samples, native_rate = librosa.load(input_path, sr=None, mono=True)
    if int(native_rate) != SAMPLE_RATE:
        samples = librosa.resample(samples, orig_sr=int(native_rate), target_sr=SAMPLE_RATE, res_type="polyphase")
    sample_rate = SAMPLE_RATE
    duration = float(librosa.get_duration(y=samples, sr=sample_rate))
    if not len(samples) or duration <= 0:
        raise ValueError("empty-audio")

    # Keep the original mix for the loudness-based no-chord gate; only the
    # chroma source is swapped to the separated harmonic layer.
    rms_source = samples
    if separation == "hpss":
        emit("正在分离谐波分量 · HPSS", 0.09, phase="separate", durationSeconds=duration, cacheHit=False)
        samples = separate_harmonic(samples, separation)
    elif separation == "demucs":
        emit("正在用 Demucs 分离伴奏(去鼓+去人声)", 0.09, phase="separate", durationSeconds=duration, cacheHit=False)
        samples = demucs_harmonic_mono(input_path, sample_rate)

    emit("正在提取共享 CQT 色度特征", 0.14, phase="features", durationSeconds=duration, cacheHit=False)
    cqt = np.abs(librosa.cqt(
        y=samples,
        sr=sample_rate,
        hop_length=HOP_LENGTH,
        fmin=librosa.note_to_hz("C1"),
        n_bins=84,
        bins_per_octave=12,
        filter_scale=1.0,
    )).astype(np.float32)
    chroma_cqt = normalize_columns(librosa.feature.chroma_cqt(
        C=cqt, sr=sample_rate, hop_length=HOP_LENGTH, n_chroma=12, bins_per_octave=12
    ))
    chroma_cens = normalize_columns(librosa.feature.chroma_cens(
        C=cqt, sr=sample_rate, hop_length=HOP_LENGTH, n_chroma=12, bins_per_octave=12
    ))
    bass = normalize_columns(cqt[:36].reshape(3, 12, cqt.shape[1]).sum(axis=0))
    rms = librosa.feature.rms(y=rms_source, frame_length=4096, hop_length=HOP_LENGTH).astype(np.float32)
    frames = min(chroma_cqt.shape[1], chroma_cens.shape[1], bass.shape[1])
    feature_data = {
        "version": np.array(CACHE_VERSION, dtype=np.int16),
        "duration": np.array(duration, dtype=np.float64),
        "sample_rate": np.array(sample_rate, dtype=np.int32),
        "hop_length": np.array(HOP_LENGTH, dtype=np.int32),
        "cqt": aligned(chroma_cqt, frames),
        "cens": aligned(chroma_cens, frames),
        "bass": aligned(bass, frames),
        "rms": aligned(rms, frames),
    }
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = cache_path.with_name(f"{cache_path.stem}.{os.getpid()}.tmp.npz")
    np.savez(temporary, **feature_data)
    temporary.replace(cache_path)
    return feature_data, False


def chord_vocabulary(kind: str) -> tuple[list[str], list[int | None], np.ndarray]:
    qualities = [
        ("", (0, 4, 7), (1.0, .82, .68)),
        ("m", (0, 3, 7), (1.0, .82, .68)),
    ]
    if kind == "extended":
        qualities.extend([
            ("7", (0, 4, 7, 10), (1.0, .78, .62, .58)),
            ("maj7", (0, 4, 7, 11), (1.0, .78, .62, .58)),
            ("m7", (0, 3, 7, 10), (1.0, .78, .62, .58)),
            ("sus2", (0, 2, 7), (1.0, .76, .68)),
            ("sus4", (0, 5, 7), (1.0, .76, .68)),
            ("dim", (0, 3, 6), (1.0, .78, .66)),
        ])
    labels: list[str] = []
    roots: list[int | None] = []
    templates: list[np.ndarray] = []
    for suffix, intervals, weights in qualities:
        for root, pitch in enumerate(PITCHES):
            template = np.zeros(12, dtype=np.float32)
            for interval, weight in zip(intervals, weights):
                template[(root + interval) % 12] = weight
            template /= max(np.linalg.norm(template), 1e-8)
            labels.append(f"{pitch}{suffix}")
            roots.append(root)
            templates.append(template)
    labels.append("N")
    roots.append(None)
    templates.append(np.zeros(12, dtype=np.float32))
    return labels, roots, np.stack(templates)


def emissions(engine: dict, features: dict) -> tuple[list[str], list[int | None], np.ndarray, np.ndarray]:
    labels, roots, templates = chord_vocabulary(engine["vocabulary"])
    chroma = np.asarray(features["cqt"] if engine["feature"] != "cens" else features["cens"], dtype=np.float32)
    bass = np.asarray(features["bass"], dtype=np.float32)
    rms = np.asarray(features["rms"], dtype=np.float32).reshape(-1)
    frames = chroma.shape[1]
    rms = rms[:frames]
    chord_templates = templates[:-1]
    scores = chord_templates @ chroma
    if engine["feature"] == "hybrid":
        root_matrix = np.stack([bass[int(root)] for root in roots[:-1]])
        full_root = np.stack([chroma[int(root)] for root in roots[:-1]])
        scores = .86 * scores + .10 * root_matrix + .04 * full_root

    entropy = -(chroma * np.log(np.maximum(chroma, 1e-8))).sum(axis=0) / math.log(12)
    rms_db = librosa.amplitude_to_db(np.maximum(rms, 1e-9), ref=np.max)
    # N should describe silence or genuinely diffuse pitch content, not merely
    # a dense arrangement.  Tie it to both entropy and the best chord match.
    no_chord = .04 + .10 * entropy - .04 * np.max(scores, axis=0)
    no_chord = np.clip(no_chord, .025, .18)
    no_chord[rms_db < -52] = 1.25
    score_matrix = np.vstack([scores, no_chord[None, :]])
    sorted_scores = np.sort(score_matrix, axis=0)
    margin = np.maximum(0, sorted_scores[-1] - sorted_scores[-2])
    confidence = np.clip(.30 + margin * 2.4 + (1 - entropy) * .25, 0, 1)
    return labels, roots, score_matrix * 7.0, confidence


def transition_matrix(labels: list[str], roots: list[int | None], penalty: float) -> np.ndarray:
    states = len(labels)
    transition = np.full((states, states), -penalty, dtype=np.float32)
    np.fill_diagonal(transition, 0)
    for old in range(states):
        for new in range(states):
            if old == new:
                continue
            if roots[old] is None or roots[new] is None:
                transition[old, new] = -penalty * .72
                continue
            distance = (int(roots[new]) - int(roots[old])) % 12
            if roots[old] == roots[new]:
                transition[old, new] = -penalty * .42
            elif distance in (5, 7):
                transition[old, new] = -penalty * .62
    return transition


def viterbi_decode(score_matrix: np.ndarray, transition: np.ndarray) -> np.ndarray:
    states, frames = score_matrix.shape
    back = np.zeros((states, frames), dtype=np.int16)
    previous = score_matrix[:, 0].copy()
    for frame in range(1, frames):
        candidates = previous[:, None] + transition
        back[:, frame] = np.argmax(candidates, axis=0)
        previous = score_matrix[:, frame] + np.max(candidates, axis=0)
        previous -= np.max(previous)
    path = np.zeros(frames, dtype=np.int16)
    path[-1] = int(np.argmax(previous))
    for frame in range(frames - 1, 0, -1):
        path[frame - 1] = back[path[frame], frame]
    return path


def collapse_path(path: np.ndarray, labels: list[str], confidence: np.ndarray, duration: float, frame_seconds: float) -> list[dict]:
    segments: list[dict] = []
    start = 0
    for index in range(1, len(path) + 1):
        if index < len(path) and path[index] == path[start]:
            continue
        end_time = min(duration, index * frame_seconds)
        segments.append({
            "start": min(duration, start * frame_seconds),
            "end": end_time,
            "label": labels[int(path[start])],
            "confidence": float(np.mean(confidence[start:index])),
        })
        start = index
    return segments


def merge_short_segments(segments: list[dict], minimum_seconds: float, keep_confidence: float | None = None) -> list[dict]:
    items = [dict(segment) for segment in segments if segment["end"] > segment["start"]]
    changed = True
    while changed and len(items) > 1:
        changed = False
        for index, item in enumerate(items):
            if item["end"] - item["start"] >= minimum_seconds:
                continue
            if keep_confidence is not None and item["confidence"] >= keep_confidence:
                continue  # short but confident -> a genuine fast change, keep it
            if 0 < index < len(items) - 1 and items[index - 1]["label"] == items[index + 1]["label"]:
                left, right = items[index - 1], items[index + 1]
                total = right["end"] - left["start"]
                left["confidence"] = (left["confidence"] + item["confidence"] + right["confidence"]) / 3
                left["end"] = right["end"]
                items[index - 1:index + 2] = [left]
            elif index == 0:
                items[1]["start"] = item["start"]
                items[1]["confidence"] = (items[1]["confidence"] + item["confidence"]) / 2
                items.pop(0)
            else:
                target = index - 1 if index == len(items) - 1 or items[index - 1]["confidence"] >= items[index + 1]["confidence"] else index + 1
                if target < index:
                    items[target]["end"] = item["end"]
                    items[target]["confidence"] = (items[target]["confidence"] + item["confidence"]) / 2
                    items.pop(index)
                else:
                    items[target]["start"] = item["start"]
                    items[target]["confidence"] = (items[target]["confidence"] + item["confidence"]) / 2
                    items.pop(index)
            changed = True
            break

    merged: list[dict] = []
    for item in items:
        if merged and merged[-1]["label"] == item["label"]:
            previous = merged[-1]
            duration_a = previous["end"] - previous["start"]
            duration_b = item["end"] - item["start"]
            previous["confidence"] = (previous["confidence"] * duration_a + item["confidence"] * duration_b) / max(duration_a + duration_b, 1e-8)
            previous["end"] = item["end"]
        else:
            merged.append(item)
    for item in merged:
        item["start"] = round(float(item["start"]), 3)
        item["end"] = round(float(item["end"]), 3)
        item["confidence"] = round(float(item["confidence"]), 4)
    return merged


def analyze(engine: dict, input_path: str, output_path: str, separation: str = "none") -> dict:
    started = time.time()
    cache_path = Path.cwd() / CACHE_NAME
    if separation != "none":
        # Separated chroma must not collide with the baseline feature cache.
        cache_path = cache_path.with_name(f"harmony-features-v{CACHE_VERSION}.{separation}.npz")
    features, cache_hit = extract_features(input_path, cache_path, separation)
    duration = float(features["duration"])
    emit("共享色度缓存已就绪" if cache_hit else "共享色度特征已写入缓存", 0.54, phase="cache", durationSeconds=duration, cacheHit=cache_hit)
    labels, roots, score_matrix, confidence = emissions(engine, features)
    emit(f"正在解码 {len(labels)} 个和弦状态", 0.66, phase="decode-harmony", durationSeconds=duration, cacheHit=cache_hit)
    path = viterbi_decode(score_matrix, transition_matrix(labels, roots, float(engine["change_penalty"])))
    frame_seconds = float(features["hop_length"]) / float(features["sample_rate"])
    segments = merge_short_segments(
        collapse_path(path, labels, confidence, duration, frame_seconds),
        float(engine["minimum_seconds"]),
    )
    non_n = [segment for segment in segments if segment["label"] != "N"]
    no_chord_seconds = sum(segment["end"] - segment["start"] for segment in segments if segment["label"] == "N")
    result = {
        "schemaVersion": 2,
        "kind": "harmony",
        "duration": round(duration, 3),
        "segments": segments,
        "engine": {
            "id": engine["id"],
            "name": engine["name"],
            "family": "harmony",
            "description": engine["description"],
            "resource": engine["resource"],
            "vocabulary": engine["vocabulary"],
            "source": "https://github.com/librosa/librosa",
        },
        "metrics": {
            "chordChanges": max(0, len(segments) - 1),
            "uniqueChords": len({segment["label"] for segment in non_n}),
            "meanConfidence": round(float(np.mean([segment["confidence"] for segment in segments])) if segments else 0, 4),
            "noChordRatio": round(no_chord_seconds / max(duration, 1e-8), 4),
        },
        "featureCacheHit": cache_hit,
        "separation": separation,
        "elapsedSeconds": round(time.time() - started, 3),
        "source": str(Path(input_path).resolve()),
    }
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(f"{output.suffix}.{os.getpid()}.tmp")
    temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(output)
    emit("和弦识别完成 · 结果已写入 Harmony Lab", 1.0, phase="complete", durationSeconds=duration, cacheHit=cache_hit)
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--engines", action="store_true")
    parser.add_argument("--separation-modes", action="store_true")
    parser.add_argument("--engine")
    parser.add_argument("--input")
    parser.add_argument("--output")
    parser.add_argument("--separation", choices=SEPARATION_MODES, default="none",
                        help="optional source-separation preprocessing before chord analysis")
    args = parser.parse_args()
    if args.engines:
        print(json.dumps(engine_list(), ensure_ascii=False))
        return 0
    if args.separation_modes:
        modes = ["none", "hpss"] + (["demucs"] if demucs_available() else [])
        print(json.dumps(modes, ensure_ascii=False))
        return 0
    engine = next((item for item in ENGINES if item["id"] == args.engine), None)
    if not engine or not args.input or not args.output:
        parser.error("--engine, --input and --output are required")
    if engine.get("weights") in ("btc", "chordmini"):
        analyze_btc(engine, args.input, args.output, args.separation)
    elif engine.get("weights") == "consonance-ace":
        analyze_consonance(engine, args.input, args.output, args.separation)
    else:
        analyze(engine, args.input, args.output, args.separation)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"{type(error).__name__}: {error}", file=sys.stderr)
        raise
