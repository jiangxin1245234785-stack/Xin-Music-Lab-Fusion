"""Music box, celesta and glass — struck metal with a long, clean tail.

The point of this kit is mood rather than machinery: it takes the same arrangement and
makes it fragile. Everything is FM with a bell ratio, so the attack is a bright inharmonic
clang that falls away within a tenth of a second and leaves a near-sine ringing behind it.

A real music box comb is slightly inharmonic and dies after a couple of seconds, which is
what makes it sound like a toy rather than a glockenspiel. The partials below are detuned
away from whole multiples on purpose; tuning them exactly turns the kit cold.
"""
import numpy as np

from synth import RATE, SUSTAIN, attack, decay, fm, noise, normalise, partials, seconds, svf

rng = np.random.default_rng(1891)
ROOT = 440.0


def comb_tine(length=3.0, ratio=3.5, index=5.0, index_decay=26.0, body=2.6):
    """One music-box tooth: a bell-ratio FM attack over a tone that outlives it."""
    voice = fm(ROOT, ratio, index, length, index_decay=index_decay)
    voice *= decay(length, body)
    # The struck tooth itself, a touch sharp and much shorter than the ringing.
    voice += 0.35 * np.sin(2 * np.pi * ROOT * 4.02 * seconds(length)) * decay(length, 24.0)
    return normalise(voice * attack(length, 900.0))


def celesta(length=SUSTAIN['piano']):
    """Softer and rounder than the comb — a struck bar rather than a plucked tooth."""
    voice = fm(ROOT, 2.0, 2.4, length, index_decay=9.0) * decay(length, 1.5)
    voice += 0.3 * np.sin(2 * np.pi * ROOT * 2 * seconds(length)) * decay(length, 3.2)
    return normalise(voice * attack(length, 600.0))


def glass(length=SUSTAIN['strings']):
    """Slow to die: the sustained voice of the kit.

    Stretched rather than freely inharmonic. A bell's partials sit at 2.76, 5.40 and so
    on, which sounds wonderful struck once and has no usable pitch at all — the partials
    share no common period, so a chord of them is a wash. These are harmonics nudged a
    hair sharp, which keeps the shimmer while leaving the fundamental in charge.
    """
    voice = partials(ROOT, [(1.0, 1.0, 0.5), (2.0, 0.50, 0.9), (3.01, 0.28, 1.3),
                            (4.02, 0.16, 1.8), (6.05, 0.08, 2.5)], length)
    return normalise(voice * attack(length, 220.0))


def soft_bass(length=SUSTAIN['bass']):
    """A sine with just enough second harmonic to be heard under the bells."""
    t = seconds(length)
    voice = np.sin(2 * np.pi * 110.0 * t) + 0.3 * np.sin(2 * np.pi * 220.0 * t)
    voice += 0.08 * np.sin(2 * np.pi * 330.0 * t) * np.exp(-4.0 * t)
    return normalise(voice * decay(length, 1.1) * attack(length, 150.0))


def mallet():
    """Soft wood, for the kick: a low thud with no ring at all."""
    t = seconds(0.3)
    body = np.sin(2 * np.pi * (70.0 + 90.0 * np.exp(-50.0 * t)) * t) * decay(0.3, 17.0)
    return normalise(body + noise(rng, 0.3) * decay(0.3, 400.0) * 0.18)


def brush(length, decay_rate, cutoff=4200.0):
    return normalise(svf(noise(rng, length), cutoff, 0.8, 'high') * decay(length, decay_rate))


def ding(length=1.2):
    """A triangle-style ding for the cymbals — metal, but polite."""
    voice = partials(2093.0, [(1.0, 1.0, 2.2), (2.41, 0.6, 3.0), (4.17, 0.35, 4.1)], length)
    return normalise(voice)


def woodblock():
    t = seconds(0.18)
    voice = np.sin(2 * np.pi * 900.0 * t) * decay(0.18, 42.0)
    voice += 0.5 * np.sin(2 * np.pi * 1340.0 * t) * decay(0.18, 60.0)
    return normalise(voice + noise(rng, 0.18) * decay(0.18, 520.0) * 0.25)


NAME = '音乐盒 / 钟琴'

SAMPLES = {
    'tine': (lambda: comb_tine(SUSTAIN['guitar']), ROOT, '音乐盒梳齿'),
    'tine_long': (lambda: comb_tine(SUSTAIN['vocals'], ratio=3.5, index=4.2, body=1.7), ROOT, '音乐盒 · 长衰减主音'),
    'celesta': (celesta, ROOT, '钟琴 / celesta'),
    'glass': (glass, ROOT, '玻璃泛音 · 持续'),
    'soft_bass': (soft_bass, 110.0, '柔和正弦贝斯'),
    'mallet': (mallet, 70.0, '软槌低音'),
    'brush_snare': (lambda: brush(0.22, 17.0, 3000.0), 1000.0, '刷扫军鼓'),
    'shaker': (lambda: brush(0.05, 130.0, 6500.0), 8000.0, '沙锤'),
    'shaker_open': (lambda: brush(0.26, 14.0, 6000.0), 8000.0, '沙锤 · 长'),
    'ding': (ding, 2093.0, '三角铁'),
    'woodblock': (woodblock, 900.0, '木鱼'),
}

#: Everything melodic is a bell, so the parts are separated by decay length rather than
#: by timbre: the lead rings longest, the guitar is the short tooth, the strings are the
#: glass that never quite stops. The drum side is deliberately tiny — a music box has no
#: kit, and anything with a real transient would break the spell.
VOICES = {
    'bass': {'sample': 'soft_bass', 'gain': 1.0, 'follow': 'note', 'fade': 0.01},
    'guitar': {'sample': 'tine', 'gain': 0.5, 'pan': 0.28, 'follow': 'sample', 'maxDur': 2.4},
    'piano': {'sample': 'celesta', 'gain': 0.62, 'pan': -0.18, 'follow': 'sample', 'maxDur': 4.5},
    'strings': {'sample': 'glass', 'transpose': 12, 'gain': 0.3, 'pan': 0.15, 'follow': 'note', 'fade': 0.02},
    'vocals': {'sample': 'tine_long', 'gain': 1.0, 'pan': 0.0, 'follow': 'sample', 'maxDur': 2.8},
    'drums/kick': {'sample': 'mallet', 'pitched': False, 'follow': 'sample', 'gain': 1.2},
    'drums/snare': {'sample': 'brush_snare', 'pitched': False, 'follow': 'sample', 'gain': 1.5},
    'drums/hihat': {'sample': 'shaker', 'pitched': False, 'follow': 'sample', 'gain': 2.0, 'pan': 0.22},
    'drums/openhat': {'sample': 'shaker_open', 'pitched': False, 'follow': 'sample', 'gain': 1.4, 'pan': 0.22},
    'drums/tom': {'sample': 'woodblock', 'pitched': False, 'follow': 'sample', 'gain': 1.1},
    'drums/crash': {'sample': 'ding', 'pitched': False, 'follow': 'sample', 'gain': 0.7, 'pan': -0.35},
    'drums/ride': {'sample': 'ding', 'pitched': False, 'follow': 'sample', 'maxDur': 0.25, 'gain': 0.9, 'pan': 0.4},
}
