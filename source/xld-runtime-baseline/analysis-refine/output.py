"""Compact results; audition gain is applied by the bounded PCM player.

Since 2026-11-15 (audit fix 2) each file is a marked 24-bit FLAC at half level (analysis-midi/stem_audio.py), which
XLD and XML read with the gain applied. A result too loud even for that (a sample at or above 2.0) is written as a
float WAV as before; readers accept either."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'analysis-midi'))


def save_waves(folder, waves, sample_rate, keep_original=False):
    import numpy as np
    import soundfile as sf
    import stem_audio
    peaks = {}
    files = {}
    for name, data in waves.items():
        peaks[name] = 0.
        for offset in range(0, len(data), sample_rate * 10):
            block = data[offset:offset + sample_rate * 10]
            if not np.isfinite(block).all():
                raise ValueError('结果包含无效采样')
            peaks[name] = max(peaks[name], float(np.max(np.abs(block))))
        if name != 'original' or keep_original:
            if peaks[name] < stem_audio.FLAC_GAIN:
                stem_audio.write_stem(folder / (name + '.flac'), data, sample_rate)
                files[name] = folder.name + '/' + name + '.flac'
            else:
                sf.write(folder / (name + '.wav'), data, sample_rate, subtype='FLOAT')
                files[name] = folder.name + '/' + name + '.wav'
    gain = min(1., .95 / max(max(peaks.values()), .95))
    return files, dict(mode='dynamic', gain=gain, peaks=peaks)
