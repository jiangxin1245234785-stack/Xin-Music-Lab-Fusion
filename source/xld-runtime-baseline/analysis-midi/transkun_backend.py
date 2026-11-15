"""Transkun V2 adapter (Yan & Duan, ISMIR 2024; pip package ``transkun`` 2.0.1).

Uses the checkpoint shipped inside the pip package: trained with data augmentation and
without pedal extension of notes, so note lengths do not include sustain-pedal extension.
Predicted velocities and the sustain pedal (CC64) are kept as the model emits them.
No quantization, no tempo detection; the runner re-encodes at the fixed 120 BPM timebase.
Audio is read with soundfile (the package's own pydub path is not used); stems are 44.1 kHz,
which is the model's sample rate, so no resampling normally happens.

Notes in silence. The model rescales every 16 s window to unit variance before it looks at it
(Model_ablation.processFramesBatch, "gain normalization"), so its output does not depend on input gain: the
same 16 s of piano gives the same notes at 0 dB and at -80 dB. A window that holds only a separation residue
(-90 to -130 dBFS) therefore reaches the network as loudly as real piano, and it answers with 40-50 ms notes.
Digital zero stays zero and gives nothing; faint residue does not. In the library that was 2,762 of 8,966
Transkun notes on 2026-11-13; on Mirrors, a stem with almost no piano, 631 of 643. The model's input is left
alone (any change to it could move the real notes too); instead the decoded notes are checked against the
stem's own level with the rule analysis-midi/evidence.py uses for its "silent" verdict: the loudest
512-sample frame from 30 ms before the note to 30 ms after its end (at least 0.1 s after its start) is more
than 50 dB under the stem's loud level (95th percentile of frames above -70 dBFS) AND under -60 dBFS. On a
stem with no frame above -70 dBFS there is no loud level and the -60 dBFS test alone decides (evidence.py
finds nothing silent there). Such notes are dropped; the rest are the model's output untouched. The backend
info records it under 'silenceFilter'. tests/transkun-silence.py keeps the constants equal to evidence.PARAMS.
"""
from pathlib import Path
import hashlib
import importlib.metadata
import importlib.util
import math
import os
import time


def package_dir():
    spec = importlib.util.find_spec('transkun')
    return Path(spec.origin).parent if spec and spec.origin else None


def checkpoint_path(profile):
    root = package_dir()
    return root / profile['checkpoint']['file'] if root else None


def config_path(profile):
    root = package_dir()
    return root / 'pretrained' / profile['options']['configFile'] if root else None


def ready(profile):
    weight = checkpoint_path(profile)
    return bool(weight) and weight.is_file() and weight.stat().st_size == profile['checkpoint']['size'] \
        and config_path(profile).is_file() \
        and all(importlib.util.find_spec(name) for name in ['torch', 'moduleconf', 'pretty_midi', 'soundfile', 'mir_eval'])


LEVEL_HOP = 512           # evidence.LEVEL_HOP
SILENCE_REL_DB = -50.0    # evidence.PARAMS['silenceRelDb']
SILENCE_ABS_DB = -60.0    # evidence.PARAMS['silenceAbsDb']
LEVEL_PAD = 0.03
MIN_NOTE_WINDOW = 0.1
NO_LOUD = -120.0          # evidence.read_levels' loud level when no frame is above -70 dBFS


def stem_levels(samples, rate):
    """(frame level in dBFS of the louder channel, frames per second, loud level) — evidence.read_levels on samples in memory."""
    import numpy as np
    frames = (samples.shape[0] // LEVEL_HOP) * LEVEL_HOP
    if not frames:
        return np.zeros(0, np.float32), rate / LEVEL_HOP, NO_LOUD
    energy = (samples[:frames] ** 2).reshape(-1, LEVEL_HOP, samples.shape[1]).mean(axis=1).max(axis=1)
    level = 10 * np.log10(energy + 1e-20)
    audible = level[level > -70]
    loud = float(np.percentile(audible, 95)) if audible.size else NO_LOUD
    return level, rate / LEVEL_HOP, loud


def is_silent(start, end, level, fps, loud):
    """evidence.judge's silent verdict for a note from start to end (seconds).

    One addition: a stem with no frame above -70 dBFS has no loud level (it reads as NO_LOUD), and evidence.judge
    then finds nothing silent at all. Here the -60 dBFS test alone decides for such a stem, so a stem that is all
    residue gives no notes (New Order - Ceremony in the library: peak -87 dBFS, 341 Transkun notes)."""
    first = max(0, int((start - LEVEL_PAD) * fps))
    last = min(len(level), int((max(end, start + MIN_NOTE_WINDOW) + LEVEL_PAD) * fps) + 1)
    local = float(level[first:last].max()) if last > first else -200.0
    return local < SILENCE_ABS_DB and (loud <= NO_LOUD or local < loud + SILENCE_REL_DB)


def drop_silent(midi, levels):
    """Remove the notes that sit in silence from every instrument of a PrettyMIDI, in place; returns the info record."""
    level, fps, loud = levels
    dropped = 0
    for part in midi.instruments:
        kept = [note for note in part.notes if not is_silent(float(note.start), float(note.end), level, fps, loud)]
        dropped += len(part.notes) - len(kept)
        part.notes = kept
    return {'method': 'stem-level-1', 'relDb': SILENCE_REL_DB, 'absDb': SILENCE_ABS_DB,
            'loudDbfs': round(loud, 1), 'quietStem': loud <= NO_LOUD, 'dropped': dropped,
            'kept': sum(len(part.notes) for part in midi.instruments)}


def _digest(path):
    with path.open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def predict(audio_path, profile, notify, duration):
    if not ready(profile):
        raise ValueError('Transkun 环境或权重未就绪')
    import numpy as np
    import soundfile as sf
    import torch
    import moduleconf
    from transkun.Data import writeMidi

    weight, conf_file = checkpoint_path(profile), config_path(profile)
    digest = _digest(weight)
    if digest != profile['checkpoint']['sha256']:
        raise ValueError('Transkun 权重校验失败')
    options = profile['options']
    conf_digest = _digest(conf_file)
    if conf_digest != options['configSha256']:
        raise ValueError('Transkun 模型配置校验失败')
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    torch.set_num_threads(min(4, os.cpu_count() or 1))
    if device == 'cuda':
        torch.cuda.reset_peak_memory_stats()
    manager = moduleconf.parseFromFile(str(conf_file))
    TransKun = manager['Model'].module.TransKun
    conf = manager['Model'].config
    try:
        checkpoint = torch.load(str(weight), map_location=device, weights_only=True)
    except Exception:
        # The published checkpoint may carry plain Python objects next to the tensors; the file's
        # digest was verified above, so fall back to the full unpickler exactly as upstream does.
        checkpoint = torch.load(str(weight), map_location=device, weights_only=False)
    model = TransKun(conf=conf).to(device)
    model.load_state_dict(checkpoint.get('best_state_dict', checkpoint.get('state_dict')), strict=False)
    model.eval()

    samples, sr = sf.read(str(audio_path), dtype='float32', always_2d=True)  # (frames, channels)
    levels = stem_levels(samples, sr)
    if sr != model.fs:
        import torchaudio
        resampled = torchaudio.functional.resample(torch.from_numpy(samples.T.copy()), sr, model.fs)
        samples = resampled.T.contiguous().numpy()
    x = torch.from_numpy(np.ascontiguousarray(samples)).to(device)

    step_seconds = options.get('segmentHopSeconds') or model.segmentHopSizeInSecond
    segment_seconds = options.get('segmentSeconds') or model.segmentSizeInSecond
    # Mirror model.transcribe() padding to estimate how many windows it will process.
    pad = math.ceil((segment_seconds - step_seconds) * model.fs)
    step_samples = math.ceil(step_seconds * model.fs / model.hopSize) * model.hopSize
    total = max(1, math.ceil((x.shape[0] + 2 * pad) / step_samples))
    original = model.transcribeFrames
    done = [0]

    def counted(*args, **kwargs):
        done[0] += 1
        notify('Transkun · 正在识别音符', .08 + .80 * min(1.0, done[0] / total), 'transcribe')
        return original(*args, **kwargs)

    model.transcribeFrames = counted
    started = time.monotonic()
    with torch.no_grad():
        notes = model.transcribe(x, stepInSecond=step_seconds, segmentSizeInSecond=segment_seconds, discardSecondHalf=False)
    elapsed = time.monotonic() - started
    midi = writeMidi(notes)
    silence = drop_silent(midi, levels)
    return midi, {
        'name': 'transkun',
        'version': importlib.metadata.version('transkun'),
        'device': device,
        'checkpointSha256': digest,
        'configSha256': conf_digest,
        'checkpointVariant': options['checkpointVariant'],
        'transcribeSeconds': round(elapsed, 3),
        'peakGpuMiB': round(torch.cuda.max_memory_allocated() / 1048576) if device == 'cuda' else None,
        'segments': done[0],
        'velocityMode': 'predicted',
        'pedal': 'cc64-predicted',
        'noteLengthsIncludePedalExtension': False,
        'silenceFilter': silence,
    }
