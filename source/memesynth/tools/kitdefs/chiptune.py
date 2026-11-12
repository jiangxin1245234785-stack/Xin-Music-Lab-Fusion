"""NES 2A03 — two pulse channels, a triangle bass and an LFSR noise channel.

The most recognisable synthetic timbre there is, and the furthest thing in this library
from the 808 kit: no filter anywhere, no decay on the oscillators unless the envelope
says so, and a bass that is a bare triangle wave.

Three details carry the character and are worth keeping: duty cycle is the only timbral
control the pulse channels have, so 12.5% / 25% / 50% have to do all the work; the volume
envelope is four bits, so fades step rather than glide; and the noise channel is a shift
register, which reads as metallic rather than as hiss.
"""
import numpy as np

from synth import RATE, SUSTAIN, decay, normalise, pulse, seconds, swept_sine, triangle

rng = np.random.default_rng(2003)
ROOT = 220.0


def steps(envelope, levels=16):
    """Quantise an envelope to a 4-bit volume, so fades step the way the hardware does."""
    return np.round(envelope * (levels - 1)) / (levels - 1)


def lfsr(length, period=7):
    """Sample-and-hold noise — the shift register's short period is why it rings."""
    count = int(length * RATE)
    source = rng.integers(0, 2, size=count // period + 2).astype(np.float64) * 2.0 - 1.0
    return np.repeat(source, period)[:count]


def channel(duty, length, decay_rate):
    voice = pulse(ROOT, length, duty) * steps(decay(length, decay_rate))
    return normalise(voice)


def tri_bass(length=SUSTAIN['bass']):
    """The triangle channel runs at a fixed level: the bass does not fade, it just stops."""
    return normalise(triangle(ROOT / 2, length) * steps(decay(length, 0.35)))


def noise_voice(length, decay_rate, period=7):
    return normalise(lfsr(length, period) * steps(decay(length, decay_rate)))


def chip_kick():
    """A pitch-swept triangle, which is how the NES fakes a kick without a sample."""
    body = swept_sine(150.0, 45.0, 0.22, 55.0) * decay(0.22, 16.0)
    return normalise(body + lfsr(0.22, 3) * decay(0.22, 240.0) * 0.35)


def chip_tom():
    return normalise(swept_sine(240.0, 110.0, 0.3, 30.0) * steps(decay(0.3, 13.0)))


NAME = '芯片音乐 NES 2A03'

SAMPLES = {
    'pulse12': (lambda: channel(0.125, SUSTAIN['guitar'], 0.8), ROOT, '脉冲波 12.5% · 细而尖'),
    'pulse25': (lambda: channel(0.25, SUSTAIN['vocals'], 0.5), ROOT, '脉冲波 25% · 经典主音'),
    'pulse50': (lambda: channel(0.5, SUSTAIN['piano'], 0.45), ROOT, '方波 50% · 最饱满'),
    'tri_bass': (tri_bass, ROOT / 2, '三角波贝斯'),
    'noise_kick': (chip_kick, 55.0, '扫频底鼓'),
    'noise_snare': (lambda: noise_voice(0.18, 22.0, 5), 1000.0, '噪声军鼓'),
    'noise_hat': (lambda: noise_voice(0.045, 150.0, 2), 8000.0, '噪声闭镲'),
    'noise_open': (lambda: noise_voice(0.3, 16.0, 2), 8000.0, '噪声开镲'),
    'noise_crash': (lambda: noise_voice(1.1, 4.5, 2), 6000.0, '噪声吊镲'),
    'chip_tom': (chip_tom, 240.0, '扫频嗵鼓'),
}

#: Duty cycle is the only timbral spread available, so it is spent on separating the
#: parts: 12.5% for the guitar so it stays thin behind everything, 50% for the piano
#: because chords need the body, 25% for the lead because that is the sound people
#: remember. Strings reuse the 50% square an octave up rather than getting a fourth
#: voice the hardware never had.
VOICES = {
    'bass': {'sample': 'tri_bass', 'gain': 1.0, 'follow': 'note', 'fade': 0.002},
    'guitar': {'sample': 'pulse12', 'gain': 0.5, 'pan': 0.3, 'follow': 'note', 'fade': 0.002},
    'guitar/distorted electric guitar': {'sample': 'pulse25', 'gain': 0.55, 'pan': -0.3, 'follow': 'note', 'fade': 0.002},
    'piano': {'sample': 'pulse50', 'gain': 0.5, 'pan': -0.15, 'follow': 'note', 'fade': 0.002},
    'strings': {'sample': 'pulse50', 'transpose': 12, 'gain': 0.32, 'pan': 0.18, 'follow': 'note', 'fade': 0.002},
    'vocals': {'sample': 'pulse25', 'gain': 1.0, 'pan': 0.0, 'follow': 'note', 'fade': 0.002},
    'drums/kick': {'sample': 'noise_kick', 'pitched': False, 'follow': 'sample', 'gain': 1.4},
    'drums/snare': {'sample': 'noise_snare', 'pitched': False, 'follow': 'sample', 'gain': 1.6},
    'drums/hihat': {'sample': 'noise_hat', 'pitched': False, 'follow': 'sample', 'gain': 2.2, 'pan': 0.2},
    'drums/openhat': {'sample': 'noise_open', 'pitched': False, 'follow': 'sample', 'gain': 1.5, 'pan': 0.2},
    'drums/tom': {'sample': 'chip_tom', 'pitched': False, 'follow': 'sample', 'gain': 1.3},
    'drums/crash': {'sample': 'noise_crash', 'pitched': False, 'follow': 'sample', 'gain': 0.9, 'pan': -0.4},
    'drums/ride': {'sample': 'noise_open', 'pitched': False, 'follow': 'sample', 'maxDur': 0.12, 'gain': 1.4, 'pan': 0.45},
}
