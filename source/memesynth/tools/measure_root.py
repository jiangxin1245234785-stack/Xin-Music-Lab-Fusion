"""Measure a sample's root frequency, to be pasted into kit.json as `rootHz`.

Deliberately outside the `memesynth` package: this is the one step that needs librosa,
and SPEC §10 keeps that dependency out of the renderer. Run it once per sample with any
interpreter that has librosa — XLD's own runtime has one:

    runtime/0.5.0/envs/basic/python.exe source/memesynth/tools/measure_root.py samples/*.wav

`--mode pitch` (default) runs pYIN and reports the median voiced f0. Use it for sung or
spoken material such as 哈基米, where a real fundamental exists.

`--mode peak` reports the loudest spectral bin instead. Use it for 大狗叫 and 叮咚鸡:
they are noisy and inharmonic, pYIN will either fail or lock onto an octave error, and
what you actually want is the frequency the ear reads as "the note".
"""
import argparse
import sys
from pathlib import Path

import librosa
import numpy as np


def measure_pitch(audio, rate):
    """Median voiced f0 via pYIN, or None when nothing is voiced enough."""
    f0, voiced, _ = librosa.pyin(audio, sr=rate, fmin=float(librosa.note_to_hz('C2')),
                                 fmax=float(librosa.note_to_hz('C7')))
    voiced_f0 = f0[voiced & ~np.isnan(f0)]
    return float(np.median(voiced_f0)) if voiced_f0.size else None


def measure_peak(audio, rate):
    """Frequency of the loudest bin of the average magnitude spectrum."""
    spectrum = np.abs(librosa.stft(audio, n_fft=8192)).mean(axis=1)
    return float(librosa.fft_frequencies(sr=rate, n_fft=8192)[int(spectrum.argmax())])


def main(argv=None):
    parser = argparse.ArgumentParser(description='测素材基频，结果写进 kit.json 的 rootHz')
    parser.add_argument('files', nargs='+', type=Path)
    parser.add_argument('--mode', choices=['pitch', 'peak', 'both'], default='both')
    args = parser.parse_args(argv)

    for path in args.files:
        if not path.is_file():
            print(f'{path}: 文件不存在', file=sys.stderr)
            continue
        audio, rate = librosa.load(str(path), sr=None, mono=True)  # sr=None 保留原采样率
        parts = [f'{path.name}', f'{len(audio) / rate:.3f}s @ {rate}Hz']
        if args.mode in {'pitch', 'both'}:
            value = measure_pitch(audio, rate)
            parts.append(f'pyin={value:.2f}Hz ({librosa.hz_to_note(value)})' if value else 'pyin=无声部')
        if args.mode in {'peak', 'both'}:
            value = measure_peak(audio, rate)
            parts.append(f'peak={value:.2f}Hz ({librosa.hz_to_note(value)})')
        print('  '.join(parts))
    return 0


if __name__ == '__main__':
    sys.exit(main())
