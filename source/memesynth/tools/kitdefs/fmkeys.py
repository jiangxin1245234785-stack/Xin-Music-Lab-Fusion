"""DX7 territory — the FM electric piano, an FM bass and a wide analogue pad.

E.PIANO 1 is probably the most-played synth patch ever made, and the reason is a trick
worth copying exactly: a 1:1 FM pair for the body, plus a second pair at a very high
ratio whose modulation index collapses within about a tenth of a second. That brief
inharmonic clang is the hammer; what is left behind is almost a sine. Change nothing
else and the patch stops sounding like a Rhodes.

This is the kit with the thickest harmony, so the pad is long (4 s) and the keys longer
(5 s) — the 99th-percentile piano note in the corpus is 4.8 s and a short sample would
cut every held chord off at the knees.
"""
import numpy as np

from synth import RATE, SUSTAIN, attack, decay, fm, noise, normalise, saw, seconds, svf

rng = np.random.default_rng(1983)
ROOT = 220.0


def rhodes(length=SUSTAIN['piano']):
    """Body at 1:1, plus the high-ratio bell that dies almost at once."""
    body = fm(ROOT, 1.0, 1.6, length, index_decay=2.2) * decay(length, 0.85)
    tine = fm(ROOT, 14.0, 2.6, length, index_decay=34.0) * decay(length, 7.0)
    voice = body + 0.42 * tine
    return normalise(voice * attack(length, 420.0))


def fm_bass(length=SUSTAIN['bass']):
    """One pair at 1:1 with a falling index — round underneath, with bite on the attack."""
    voice = fm(110.0, 1.0, 3.4, length, index_decay=11.0) * decay(length, 1.3)
    voice += 0.25 * np.sin(2 * np.pi * 110.0 * seconds(length)) * decay(length, 0.9)
    return normalise(np.tanh(voice * 1.4) * attack(length, 320.0))


def pad(length=SUSTAIN['strings']):
    """Three saws a few cents apart, filtered soft and opened slowly. The width is the point."""
    voice = saw(ROOT, length) + saw(ROOT * 1.0043, length) + saw(ROOT * 0.9959, length)
    t = seconds(length)
    voice = svf(voice, 700.0 + 1400.0 * (1.0 - np.exp(-1.6 * t)), 1.1, 'low')
    return normalise(voice * attack(length, 3.2) * decay(length, 0.18))


def fm_pluck(length=SUSTAIN['guitar']):
    voice = fm(ROOT, 3.0, 3.2, length, index_decay=16.0) * decay(length, 3.4)
    return normalise(voice * attack(length, 700.0))


def lead(length=SUSTAIN['vocals']):
    """A 2:1 pair, bright and steady — the part that has to carry a melody."""
    voice = fm(ROOT, 2.0, 2.0, length, index_decay=3.0) * decay(length, 0.75)
    return normalise(voice * attack(length, 180.0))


# --- a linear-sampling drum machine, the kind that shipped beside these keyboards ---

def lin_kick():
    body = np.sin(2 * np.pi * (58.0 + 95.0 * np.exp(-38.0 * seconds(0.42))) * seconds(0.42))
    return normalise(body * decay(0.42, 9.5) + noise(rng, 0.42) * decay(0.42, 600.0) * 0.22)


def lin_snare():
    t = seconds(0.3)
    shell = (np.sin(2 * np.pi * 196 * t) + 0.6 * np.sin(2 * np.pi * 288 * t)) * decay(0.3, 26.0)
    wires = svf(noise(rng, 0.3), 2400.0, 0.7, 'high') * decay(0.3, 15.0)
    return normalise(0.5 * shell + 0.9 * wires)


def lin_hat(length, decay_rate):
    return normalise(svf(noise(rng, length), 7600.0, 0.9, 'high') * decay(length, decay_rate))


def lin_tom():
    t = seconds(0.45)
    body = np.sin(2 * np.pi * (165.0 + 80.0 * np.exp(-26.0 * t)) * t) * decay(0.45, 9.0)
    return normalise(body + noise(rng, 0.45) * decay(0.45, 300.0) * 0.14)


def lin_crash():
    return normalise(svf(noise(rng, 1.5), 5400.0, 0.75, 'high') * decay(1.5, 3.0))


NAME = 'FM 电钢 + 合成器垫'

SAMPLES = {
    'rhodes': (rhodes, ROOT, 'FM 电钢 · DX 式'),
    'fmbass': (fm_bass, 110.0, 'FM 贝斯'),
    'pad': (pad, ROOT, '失谐锯齿垫 · 慢起音'),
    'fmpluck': (fm_pluck, ROOT, 'FM 拨奏'),
    'lead': (lead, ROOT, 'FM 主音'),
    'kick_lin': (lin_kick, 58.0, '线性鼓机底鼓'),
    'snare_lin': (lin_snare, 196.0, '线性鼓机军鼓'),
    'hat_lin': (lambda: lin_hat(0.06, 120.0), 8000.0, '闭镲'),
    'openhat_lin': (lambda: lin_hat(0.34, 12.0), 8000.0, '开镲'),
    'tom_lin': (lin_tom, 165.0, '嗵鼓'),
    'crash_lin': (lin_crash, 5400.0, '吊镲'),
}

#: The pad follows the score rather than its own envelope, because a pad that stops when
#: the sample ends is the one thing that makes a synthetic string part sound fake.
VOICES = {
    'bass': {'sample': 'fmbass', 'gain': 1.0, 'follow': 'note', 'fade': 0.008},
    'guitar': {'sample': 'fmpluck', 'gain': 0.5, 'pan': 0.28, 'follow': 'note', 'fade': 0.008},
    'guitar/distorted electric guitar': {'sample': 'lead', 'gain': 0.42, 'pan': -0.3, 'follow': 'note', 'fade': 0.008},
    'piano': {'sample': 'rhodes', 'gain': 0.68, 'pan': -0.15, 'follow': 'note', 'fade': 0.01},
    'strings': {'sample': 'pad', 'transpose': 12, 'gain': 0.3, 'pan': 0.15, 'follow': 'note', 'fade': 0.05},
    'vocals': {'sample': 'lead', 'gain': 0.95, 'pan': 0.0, 'follow': 'note', 'fade': 0.01},
    'drums/kick': {'sample': 'kick_lin', 'pitched': False, 'follow': 'sample', 'gain': 1.3},
    'drums/snare': {'sample': 'snare_lin', 'pitched': False, 'follow': 'sample', 'gain': 1.6},
    'drums/hihat': {'sample': 'hat_lin', 'pitched': False, 'follow': 'sample', 'gain': 2.3, 'pan': 0.2},
    'drums/openhat': {'sample': 'openhat_lin', 'pitched': False, 'follow': 'sample', 'gain': 1.6, 'pan': 0.2},
    'drums/tom': {'sample': 'tom_lin', 'pitched': False, 'follow': 'sample', 'gain': 1.3},
    'drums/crash': {'sample': 'crash_lin', 'pitched': False, 'follow': 'sample', 'gain': 0.9, 'pan': -0.4},
    'drums/ride': {'sample': 'openhat_lin', 'pitched': False, 'follow': 'sample', 'maxDur': 0.16, 'gain': 1.4, 'pan': 0.42},
}
