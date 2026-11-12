"""Gamelan — struck bronze, tuned to itself rather than to a piano.

The partials of a bronze key are not whole multiples of anything: a saron sits near 1,
2.34, 2.80 and 4.75. That is the opposite of the harmonic series every other kit here is
built on, and it is why a gamelan chord does not blend the way a piano chord does. Two
notes a tone apart beat against each other, and the beating is the music rather than a
mistake to tune out.

Because the partials share no common period, this kit has the least defined pitch in the
library. Each voice therefore carries a strong fundamental under the inharmonic ones — it
has to track the melody it is given, and a bar with no fundamental tracks nothing.
"""
import numpy as np

from synth import RATE, SUSTAIN, attack, decay, noise, normalise, partials, seconds, svf

rng = np.random.default_rng(1889)
ROOT = 220.0

#: (multiplier, amplitude, decay). The fundamental is kept loud and slow so the melody
#: reads; the inharmonic partials above it are what make it bronze rather than a bell.
SARON = [(1.00, 1.00, 0.9), (2.34, 0.46, 1.9), (2.80, 0.34, 2.3), (4.75, 0.20, 3.4), (6.98, 0.09, 4.6)]
GENDER = [(1.00, 1.00, 0.45), (2.01, 0.38, 0.9), (3.92, 0.18, 1.6), (5.86, 0.08, 2.4)]
BONANG = [(1.00, 1.00, 1.1), (1.52, 0.52, 1.7), (3.46, 0.30, 2.6), (5.11, 0.15, 3.8)]
GONG = [(1.00, 1.00, 0.28), (1.48, 0.40, 0.5), (2.03, 0.26, 0.8), (3.51, 0.12, 1.4)]


def bar(components, length, frequency=ROOT, strike=0.22, attack_rate=700.0):
    """One struck bar: the mallet, then the bronze."""
    voice = partials(frequency, components, length)
    mallet = svf(noise(rng, length), 1800.0, 1.1, 'low') * decay(length, 170.0) * strike
    return normalise((voice + mallet) * attack(length, attack_rate))


def gong(length=SUSTAIN['bass'], frequency=55.0):
    """The big gong: slow to bloom, and it never quite stops."""
    voice = partials(frequency, GONG, length)
    # Bronze shimmer — a slow wobble between the two lowest partials.
    voice *= 1.0 + 0.10 * np.sin(2 * np.pi * 2.3 * seconds(length))
    return normalise(voice * attack(length, 26.0))


def kendang(frequency, length, pitch_drop=1.9, tone=0.65):
    """A hand drum: skin tone with a short pitch drop, more thud than ring."""
    t = seconds(length)
    curve = frequency * (1.0 + pitch_drop * np.exp(-42.0 * t))
    body = np.sin(2 * np.pi * np.cumsum(curve) / RATE) * decay(length, 13.0)
    slap = svf(noise(rng, length), 2200.0, 0.9, 'high') * decay(length, 90.0)
    return normalise(tone * body + (1.0 - tone) * 2.0 * slap)


def kecer(length=0.4):
    """Small paired cymbals — bright, short, and deliberately out of tune with themselves."""
    voice = partials(3100.0, [(1.0, 1.0, 9.0), (1.37, 0.8, 11.0), (2.61, 0.5, 13.0)], length)
    return normalise(voice + svf(noise(rng, length), 7000.0, 0.9, 'high') * decay(length, 22.0) * 0.5)


NAME = '甘美兰 · 青铜打击'

SAMPLES = {
    'saron': (lambda: bar(SARON, SUSTAIN['guitar']), ROOT, '沙戎 · 金属键'),
    'saron_lead': (lambda: bar(SARON, SUSTAIN['vocals'], strike=0.3), ROOT, '沙戎 · 主音'),
    'gender': (lambda: bar(GENDER, SUSTAIN['piano'], attack_rate=420.0), ROOT, '甘德 · 柔长'),
    'bonang': (lambda: bar(BONANG, SUSTAIN['strings'], strike=0.18), ROOT, '波南 · 罐锣'),
    'gong_low': (gong, 55.0, '大锣'),
    'kendang_lo': (lambda: kendang(78.0, 0.5), 78.0, '手鼓 · 低'),
    'kendang_hi': (lambda: kendang(190.0, 0.3, pitch_drop=1.2, tone=0.4), 190.0, '手鼓 · 高'),
    'kendang_slap': (lambda: kendang(320.0, 0.14, pitch_drop=0.8, tone=0.2), 320.0, '手鼓 · 拍击'),
    'kecer': (kecer, 3100.0, '小钹'),
    'kecer_long': (lambda: kecer(1.3), 3100.0, '小钹 · 长'),
}

#: Everything melodic follows its own decay rather than the score: a struck bar rings for
#: as long as bronze rings, and cutting it at the notated length is the one thing that
#: makes a sampled gamelan sound like a synthesiser.
VOICES = {
    'bass': {'sample': 'gong_low', 'gain': 1.0, 'follow': 'sample', 'maxDur': 3.0},
    'guitar': {'sample': 'saron', 'gain': 0.52, 'pan': 0.3, 'follow': 'sample', 'maxDur': 2.4},
    'guitar/distorted electric guitar': {'sample': 'bonang', 'gain': 0.46, 'pan': -0.3, 'follow': 'sample', 'maxDur': 2.4},
    'piano': {'sample': 'gender', 'gain': 0.6, 'pan': -0.18, 'follow': 'sample', 'maxDur': 4.5},
    'strings': {'sample': 'bonang', 'transpose': 12, 'gain': 0.3, 'pan': 0.16, 'follow': 'sample', 'maxDur': 3.5},
    'vocals': {'sample': 'saron_lead', 'gain': 1.0, 'pan': 0.0, 'follow': 'sample', 'maxDur': 2.8},
    'drums/kick': {'sample': 'kendang_lo', 'pitched': False, 'follow': 'sample', 'gain': 1.3},
    'drums/snare': {'sample': 'kendang_hi', 'pitched': False, 'follow': 'sample', 'gain': 1.5},
    'drums/hihat': {'sample': 'kendang_slap', 'pitched': False, 'follow': 'sample', 'gain': 1.8, 'pan': 0.2},
    'drums/openhat': {'sample': 'kecer', 'pitched': False, 'follow': 'sample', 'gain': 1.2, 'pan': 0.2},
    'drums/tom': {'sample': 'kendang_hi', 'pitched': False, 'follow': 'sample', 'gain': 1.2},
    'drums/crash': {'sample': 'kecer_long', 'pitched': False, 'follow': 'sample', 'gain': 0.9, 'pan': -0.4},
    'drums/ride': {'sample': 'kecer', 'pitched': False, 'follow': 'sample', 'maxDur': 0.2, 'gain': 1.1, 'pan': 0.42},
}
