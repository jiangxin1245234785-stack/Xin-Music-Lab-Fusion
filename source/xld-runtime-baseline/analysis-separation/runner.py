"""XLD six-stem separation. Importable core, JSON-line CLI, no GUI dependencies."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import importlib.metadata
import json
import os
from pathlib import Path
import sys
import time
import uuid

# Resolve the adjacent backend under an isolated, relocatable interpreter.
sys.path.insert(0, str(Path(__file__).resolve().parent))

MODEL = "htdemucs_6s"
OPTIONS = {"shifts": 1, "overlap": 0.25}
PROFILES = json.loads(Path(__file__).with_name("models.json").read_text(encoding="utf-8"))


def emit(message, progress=None, phase=None):
    print(json.dumps({"message": message, "progress": progress, "phase": phase}, ensure_ascii=False), flush=True)


def demucs_separate(mix, device, notify):
    import torch
    from demucs.pretrained import get_model
    import demucs.apply as apply_module
    model = get_model(MODEL)
    expected_frames = mix.shape[-1]
    reference = mix.mean(0)
    mean, std = reference.mean(), reference.std()
    notify("分离 bass / piano / guitar 等声部", 0.12, "separate")
    # Demucs exposes chunk progress through tqdm. Adapt that iterator locally;
    # no installed package or global application state is modified.
    original_progress = apply_module.tqdm.tqdm

    def progress_iterator(items, **_kwargs):
        count = len(items)
        for index, item in enumerate(items):
            yield item
            notify(f"分轨 {index + 1}/{count}", 0.12 + 0.73 * (index + 1) / max(1, count), "separate")

    try:
        apply_module.tqdm.tqdm = progress_iterator
        if float(std) < 1e-8:
            stems = torch.zeros(len(model.sources), 2, expected_frames)
        else:
            with torch.inference_mode():
                stems = apply_module.apply_model(model, ((mix - mean) / std)[None],
                    device=device, progress=True, split=True, **OPTIONS)[0]
            stems = stems * std + mean
    finally:
        apply_module.tqdm.tqdm = original_progress
    return list(model.sources), stems, {"name": "demucs", "version": importlib.metadata.version("demucs")}


def engines():
    import importlib.util
    statuses = []
    for profile in PROFILES:
        module = "demucs" if profile["backend"] == "demucs" else "bs_roformer"
        available = importlib.util.find_spec(module) is not None
        if profile["backend"] == "roformer":
            from roformer_backend import model_directory
            available = available and all((model_directory() / profile[key]["file"]).is_file() for key in ["checkpoint", "config"])
        statuses.append({"id": profile["id"], "name": profile["name"], "default": profile["default"], "available": available})
    return statuses


def separate(input_path: Path, output_path: Path, track_id: str, run_id: str, notify=emit, engine="demucs-6s"):
    import numpy as np
    import soundfile as sf
    import torch
    from torchaudio.functional import resample
    profile = next(profile for profile in PROFILES if profile["id"] == engine)

    run_id = str(uuid.UUID(run_id))
    started = time.monotonic()
    input_path = input_path.resolve()
    source_stat = input_path.stat()
    notify("读取音频", 0.02, "decode")
    audio, source_rate = sf.read(str(input_path), dtype="float32", always_2d=True)
    if not len(audio) or not np.isfinite(audio).all():
        raise ValueError("音频为空或包含无效采样")
    if audio.shape[1] == 1:
        audio = np.repeat(audio, 2, axis=1)
    elif audio.shape[1] != 2:
        raise ValueError("首版支持单声道或双声道音频")
    notify("加载六声部模型", 0.06, "model")
    device = "cuda" if torch.cuda.is_available() else "cpu"
    if device == "cuda":
        torch.cuda.reset_peak_memory_stats()
    torch.set_num_threads(min(8, os.cpu_count() or 1))
    torch.manual_seed(0)
    import random
    random.seed(0)
    mix = torch.from_numpy(audio.T.copy())
    expected_frames = round(len(audio) * 44100 / source_rate)
    del audio
    if source_rate != 44100:
        mix = resample(mix, source_rate, 44100)
    mix = mix[:, :expected_frames]
    if mix.shape[-1] < expected_frames:
        mix = torch.nn.functional.pad(mix, (0, expected_frames - mix.shape[-1]))
    if profile["backend"] == "demucs":
        names, stems, backend = demucs_separate(mix, device, notify)
    else:
        from roformer_backend import separate as roformer_separate
        names, stems, backend = roformer_separate(mix, profile, device, notify)
    if len(names) != 6 or set(names) != {"bass", "piano", "guitar", "drums", "vocals", "other"} or tuple(stems.shape) != (6, 2, expected_frames):
        raise ValueError("分轨声部或时长不完整")
    if not torch.isfinite(stems).all():
        raise ValueError("分轨包含无效采样")
    if device == "cuda":
        backend["peakAllocatedMiB"] = round(torch.cuda.max_memory_allocated() / 1024**2, 1)
    current_stat = input_path.stat()
    if (current_stat.st_size, current_stat.st_mtime_ns) != (source_stat.st_size, source_stat.st_mtime_ns):
        raise ValueError("分析期间原音频发生变化，请重试")
    assets = output_path.parent / "stems" / run_id
    assets.mkdir(parents=True, exist_ok=False)
    entries = []
    for index, (name, waveform) in enumerate(zip(names, stems)):
        notify(f"保存 {name}.wav", 0.86 + 0.12 * index / len(names), "save")
        file = assets / f"{name}.wav"
        sf.write(str(file), waveform.T.cpu().numpy(), 44100, subtype="FLOAT")
        info = sf.info(str(file))
        if (info.frames, info.channels, info.samplerate, info.subtype) != (expected_frames, 2, 44100, "FLOAT"):
            raise ValueError(f"输出校验失败：{name}")
        entries.append({"name": name, "file": file.relative_to(output_path.parent).as_posix(),
            "sampleRate": info.samplerate, "channels": info.channels, "frames": info.frames})
    result = {"schemaVersion": 1, "kind": "stems", "trackId": track_id, "runId": run_id,
        "source": {"path": str(input_path), "size": source_stat.st_size, "mtimeMs": source_stat.st_mtime_ns / 1e6},
        "engine": engine, "model": profile["model"], "backend": backend,
        "options": profile["options"], "device": device, "createdAt": datetime.now(timezone.utc).isoformat(),
        "elapsedSeconds": round(time.monotonic() - started, 3), "timeOrigin": 0,
        "stems": entries}
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    notify("分轨文件已生成", 1.0, "complete")
    return result


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    if "--engines" in sys.argv:
        print(json.dumps(engines(), ensure_ascii=False))
        return 0
    parser = argparse.ArgumentParser()
    parser.add_argument("--engine", default="demucs-6s", choices=[profile["id"] for profile in PROFILES])
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--track-id", required=True)
    parser.add_argument("--run-id", default=str(uuid.uuid4()))
    args = parser.parse_args()
    os.environ.setdefault("TORCH_HOME", r"D:\Caches\codex\models\xld")
    try:
        separate(args.input, args.output, args.track_id, args.run_id, engine=args.engine)
    except Exception as error:
        emit(str(error), phase="failed")
        print(str(error), file=sys.stderr, flush=True)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
