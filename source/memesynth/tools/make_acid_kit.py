"""Synthesise a TR-808 / TB-303 kit from scratch — no samples to source anywhere.

These two machines are the whole sound of acid house, and both are simple enough to
build from oscillators and envelopes. That makes them the fastest way to hear the
pipeline play real music: run this once and `kits/acid/` is ready.

Only numpy is needed. The filters below are per-sample Python loops, which would be far
too slow on a whole song but are nothing on the half-second buffers written here — and
they keep scipy out of the project (SPEC §4).

    python source/memesynth/tools/make_acid_kit.py source/memesynth/kits/acid
"""
import argparse
import json
import math
import sys
from pathlib import Path

import numpy as np
import soundfile

RATE = 48000
rng = np.random.default_rng(808)


def seconds(length):
    return np.arange(int(length * RATE), dtype=np.float64) / RATE


def svf(audio, cutoff, resonance, mode='low'):
    """Chamberlin state-variable filter. `cutoff` is a scalar or a per-sample curve.

    This is what gives the 303 its squelch: sweeping the cutoff of a steep resonant
    filter across a harmonically rich waveform.
    """
    cutoff = np.broadcast_to(np.asarray(cutoff, dtype=np.float64), audio.shape)
    damping = 1.0 / max(resonance, 0.5)
    low = band = 0.0
    out = np.empty_like(audio)
    for index, sample in enumerate(audio):
        f = 2.0 * math.sin(math.pi * min(float(cutoff[index]), RATE * 0.45) / RATE)
        low += f * band
        high = sample - low - damping * band
        band += f * high
        out[index] = {'low': low, 'high': high, 'band': band}[mode]
    return out


def saw(frequency, length):
    """Band-limited sawtooth by additive synthesis, so nothing aliases into the sweep."""
    t = seconds(length)
    harmonics = max(1, int((RATE * 0.45) / frequency))
    wave = np.zeros_like(t)
    for k in range(1, harmonics + 1):
        wave += ((-1) ** (k + 1)) * np.sin(2 * np.pi * k * frequency * t) / k
    return (2.0 / np.pi) * wave


def swept_sine(start_hz, end_hz, length, pitch_decay):
    """A sine whose pitch falls exponentially — the backbone of the 808 kick and toms."""
    t = seconds(length)
    frequency = end_hz + (start_hz - end_hz) * np.exp(-pitch_decay * t)
    return np.sin(2 * np.pi * np.cumsum(frequency) / RATE)


def noise(length):
    return rng.standard_normal(int(length * RATE))


def decay(length, rate_, hold=0.0):
    t = seconds(length)
    return np.exp(-rate_ * np.maximum(0.0, t - hold))


def normalise(audio, level=0.89):
    peak = float(np.abs(audio).max())
    return (audio * (level / peak)).astype(np.float32) if peak else audio.astype(np.float32)


# --- TR-808 ----------------------------------------------------------------------

def kick():
    """Long decaying sine with a pitch drop, plus a click for the attack."""
    body = swept_sine(120.0, 48.0, 0.75, 42.0) * decay(0.75, 5.2)
    click = noise(0.75) * decay(0.75, 900.0) * 0.5
    return normalise(body + click)


def snare():
    """Two detuned tones for the shell, filtered noise for the snares."""
    tone = (np.sin(2 * np.pi * 182 * seconds(0.25)) + 0.7 * np.sin(2 * np.pi * 331 * seconds(0.25)))
    tone *= decay(0.25, 34.0)
    snares = svf(noise(0.25), 3200.0, 0.9, 'high') * decay(0.25, 19.0)
    return normalise(0.55 * tone + 0.85 * snares)


def clap():
    """Three fast noise bursts plus a tail — the spacing is the whole character."""
    length = 0.42
    out = np.zeros(int(length * RATE))
    source = svf(noise(length), 1400.0, 1.4, 'high')
    for offset in (0.0, 0.009, 0.019):
        start = int(offset * RATE)
        burst = source[:len(out) - start] * decay(length, 320.0)[:len(out) - start]
        out[start:] += burst
    out += source * decay(length, 14.0, hold=0.022) * 0.6
    return normalise(out)


def hat(length, decay_rate):
    """Noise through a steep highpass. The real 808 uses six squares; this reads the same."""
    return normalise(svf(noise(length), 8200.0, 1.1, 'high') * decay(length, decay_rate))


def tom(start_hz=190.0, end_hz=92.0):
    return normalise(swept_sine(start_hz, end_hz, 0.4, 28.0) * decay(0.4, 11.0))


def cymbal():
    return normalise(svf(noise(1.6), 6000.0, 0.8, 'high') * decay(1.6, 3.4))


# --- TB-303 ----------------------------------------------------------------------

def bass303(root_hz=55.0, length=0.85):
    """Sawtooth through a resonant lowpass sweeping down, then driven into saturation.

    The sweep and the resonance are the acid sound. Saturation at the end is what the
    original's output stage does when the resonance peak gets loud, and leaving it out
    makes the result sound thin and polite.
    """
    t = seconds(length)
    cutoff = 220.0 + 2600.0 * np.exp(-7.0 * t)
    voice = svf(saw(root_hz, length), cutoff, 4.2, 'low')
    voice *= 1.0 - np.exp(-400.0 * t)          # fast attack, no click
    voice *= decay(length, 2.4)
    return normalise(np.tanh(voice * 2.6))


def stab(root_hz=220.0, length=0.45):
    """Detuned saws under a fixed lowpass — the house organ stab for the chord parts."""
    voice = saw(root_hz, length) + saw(root_hz * 1.006, length) + saw(root_hz * 0.5, length)
    voice = svf(voice, 1500.0, 1.8, 'low')
    voice *= 1.0 - np.exp(-300.0 * seconds(length))
    return normalise(voice * decay(length, 7.5))


SAMPLES = {
    'kick808': (kick, 55.0, '808 底鼓'),
    'snare808': (snare, 182.0, '808 军鼓'),
    'clap808': (clap, 1000.0, '808 拍手'),
    'hat_closed': (lambda: hat(0.09, 130.0), 8000.0, '808 闭镲'),
    'hat_open': (lambda: hat(0.55, 11.0), 8000.0, '808 开镲'),
    'tom808': (tom, 190.0, '808 嗵鼓'),
    'cymbal808': (cymbal, 6000.0, '808 吊镲'),
    'bass303': (bass303, 55.0, '303 酸性贝斯'),
    'stab': (stab, 220.0, '合成器和弦刺'),
}

#: Route -> voice. Drums keep `pitched: false` so they play at their own pitch; the
#: melodic parts become 303 and stabs, which is what turns the arrangement electronic.
#:
#: Only the bass gets the 303: two acid lines at once turn to mud, and the contrast
#: against the stabs is what makes the one line read. The drum gains look extreme next
#: to the melodic ones because they are compensating for the transcription's own
#: velocities — ADTOF derives hi-hat velocity from stem RMS, so hats arrive far quieter
#: than a drum machine would play them, and house lives or dies on the hats.
VOICES = {
    'bass': {'sample': 'bass303', 'gain': 1.0, 'follow': 'note', 'fade': 0.004},
    'guitar': {'sample': 'stab', 'transpose': 12, 'gain': 0.35, 'pan': 0.3, 'follow': 'note'},
    'guitar/distorted electric guitar': {'sample': 'stab', 'gain': 0.5, 'pan': -0.35, 'follow': 'note'},
    'piano': {'sample': 'stab', 'gain': 0.55, 'pan': -0.2, 'follow': 'note'},
    'strings': {'sample': 'stab', 'transpose': 12, 'gain': 0.3, 'pan': 0.15, 'follow': 'note'},
    'drums/kick': {'sample': 'kick808', 'pitched': False, 'follow': 'sample', 'gain': 1.3},
    'drums/snare': {'sample': 'clap808', 'pitched': False, 'follow': 'sample', 'gain': 2.2},
    'drums/hihat': {'sample': 'hat_closed', 'pitched': False, 'follow': 'sample', 'gain': 2.6, 'pan': 0.2},
    'drums/openhat': {'sample': 'hat_open', 'pitched': False, 'follow': 'sample', 'gain': 1.8, 'pan': 0.2},
    'drums/tom': {'sample': 'tom808', 'pitched': False, 'follow': 'sample', 'gain': 1.4},
    'drums/crash': {'sample': 'cymbal808', 'pitched': False, 'follow': 'sample', 'gain': 1.0, 'pan': -0.4},
    'drums/ride': {'sample': 'hat_open', 'pitched': False, 'follow': 'sample', 'maxDur': 0.15, 'gain': 1.6, 'pan': 0.45},
}


def main(argv=None):
    parser = argparse.ArgumentParser(description='合成 808 / 303 音色并写出一个可用的 kit')
    parser.add_argument('out', type=Path, help='kit 目录，例如 source/memesynth/kits/acid')
    args = parser.parse_args(argv)

    (args.out / 'samples').mkdir(parents=True, exist_ok=True)
    manifest = {}
    for name, (build, root_hz, label) in SAMPLES.items():
        audio = build()
        path = args.out / 'samples' / f'{name}.wav'
        soundfile.write(str(path), audio, RATE, subtype='PCM_24')
        manifest[name] = {'file': f'samples/{name}.wav', 'rootHz': root_hz, '_label': label}
        print(f'  {name:<12} {len(audio) / RATE:.2f}s  {label}')

    kit = {'name': 'Acid 808/303 (synthesised)',
           '_note': '由 tools/make_acid_kit.py 生成，可随时重跑覆盖。rootHz 是生成时的已知值，不必再测。',
           'samples': manifest, 'voices': VOICES}
    (args.out / 'kit.json').write_text(json.dumps(kit, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'\n写出 {args.out / "kit.json"}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
