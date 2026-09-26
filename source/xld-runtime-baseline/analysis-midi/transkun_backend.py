"""Transkun V2 adapter (Yan & Duan, ISMIR 2024; pip package ``transkun`` 2.0.1).

Uses the checkpoint shipped inside the pip package: trained with data augmentation and
without pedal extension of notes, so note lengths do not include sustain-pedal extension.
Predicted velocities and the sustain pedal (CC64) are kept as the model emits them.
No quantization, no tempo detection; the runner re-encodes at the fixed 120 BPM timebase.
Audio is read with soundfile (the package's own pydub path is not used); stems are 44.1 kHz,
which is the model's sample rate, so no resampling normally happens.
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
    }
