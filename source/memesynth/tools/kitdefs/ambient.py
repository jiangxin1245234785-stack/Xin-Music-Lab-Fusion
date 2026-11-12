"""Ambient — slow edges and a long room; the drums are barely there.

The room is the instrument. Every sound here is simple, a few harmonics at most, and
then sits in two or three seconds of reverb, so notes overlap into one another and the
harmony smears. Attacks are slow, which has a cost that is also the point: a fast run
does not speak, it turns into a cloud. The melody voice keeps a quicker edge than the
rest so that a tune stays a tune.

The reverb is baked into each sample, so it is transposed with the note: high notes get
a shorter, brighter room. It sounds like a smaller space, not like a mistake.
"""
import numpy as np

from synth import (SUSTAIN, attack, decay, detuned, fm, noise, normalise, partials, reverb, saw, saw_curve, seconds,
                   sine, svf, swept_sine, triangle, vibrato)

rng = np.random.default_rng(1978)
ROOT = 220.0


def sub(length=SUSTAIN['bass']):
    voice = (sine(110.0, length) + 0.3 * triangle(110.0, length)) * attack(length, 25.0) * decay(length, 0.25)
    return normalise(reverb(rng, voice, length=1.5, mix=0.15))


def glass(length=SUSTAIN['piano']):
    """A few harmonics that outlast one another, in three seconds of room."""
    voice = partials(ROOT, [(1, 1.0, 0.5), (2, 0.4, 0.9), (3, 0.15, 1.4), (4, 0.12, 2.0)], length)
    return normalise(reverb(rng, voice * attack(length, 40.0), length=3.0, mix=0.45))


def harp(length=SUSTAIN['guitar']):
    voice = fm(ROOT, 1.0, 1.2, length, index_decay=8.0) * decay(length, 1.6) * attack(length, 200.0)
    return normalise(reverb(rng, voice, length=2.5, mix=0.4))


def pad(length=SUSTAIN['strings']):
    """Five triangles and a little saw, breathing slowly, most of it room."""
    t = seconds(length)
    voice = detuned(rng, ROOT, length, (-12, -5, 0, 5, 12), wave=triangle)
    voice += 0.3 * svf(detuned(rng, ROOT, length, (-7, 7), wave=saw), 1200.0, 0.8, 'low')
    voice *= 1.0 + 0.15 * np.sin(2 * np.pi * 0.3 * t)
    return normalise(reverb(rng, voice * attack(length, 1.6) * decay(length, 0.08), length=3.0, mix=0.5))


def choir(length=SUSTAIN['vocals']):
    """A saw through three vowel bands: an "ah" that carries the tune."""
    source = saw_curve(vibrato(ROOT, length, rate_hz=4.6, cents=16.0, onset=0.5), harmonics=30)
    vowel = sum(gain * svf(source, centre, 4.0, 'band') for centre, gain in ((700.0, 1.0), (1150.0, 0.6), (2600.0, 0.25)))
    voice = vowel + 0.3 * svf(source, 500.0, 0.8, 'low')
    return normalise(reverb(rng, voice * attack(length, 14.0) * decay(length, 0.2), length=2.5, mix=0.35))


def kick():
    thump = swept_sine(80.0, 42.0, 0.8, 12.0) * decay(0.8, 5.0) * attack(0.8, 200.0)
    return normalise(reverb(rng, thump, length=1.2, mix=0.25, tail=0.6))


def brush():
    swish = svf(noise(rng, 0.5), 2200.0, 0.8, 'band') * attack(0.5, 60.0) * decay(0.5, 12.0)
    return normalise(reverb(rng, swish, length=1.6, mix=0.4, tail=0.8))


def shaker(length, rate):
    return normalise(svf(noise(rng, length), 7000.0, 0.9, 'high') * attack(length, 400.0) * decay(length, rate))


def tom():
    body = swept_sine(140.0, 90.0, 0.7, 10.0) * decay(0.7, 5.0)
    return normalise(reverb(rng, body, length=1.6, mix=0.35, tail=0.8))


def wash():
    return normalise(reverb(rng, svf(noise(rng, 3.0), 3000.0, 0.75, 'high') * attack(3.0, 6.0) * decay(3.0, 1.3),
                            length=2.5, mix=0.5))


def bell():
    ring = partials(1320.0, [(1, 1.0, 3.0), (2.76, 0.5, 4.5), (5.4, 0.25, 6.5)], 1.5)
    return normalise(reverb(rng, ring * attack(1.5, 500.0), length=2.0, mix=0.4, tail=0.5))


NAME = '氛围 · Ambient'

SAMPLES = {
    'sub': (sub, 110.0, '低音涌动'),
    'glass': (glass, ROOT, '玻璃琴 · 3 秒混响'),
    'harp': (harp, ROOT, 'FM 竖琴 · 混响'),
    'cloud': (pad, ROOT, '云垫 · 慢起音'),
    'choir': (choir, ROOT, '“啊”元音合唱'),
    'softkick': (kick, 42.0, '远处的底鼓'),
    'brush': (brush, 2200.0, '鼓刷'),
    'shaker': (lambda: shaker(0.08, 70.0), 7000.0, '沙锤'),
    'longshaker': (lambda: shaker(0.5, 8.0), 7000.0, '长沙锤'),
    'softtom': (tom, 90.0, '远嗵鼓'),
    'wash': (wash, 3000.0, '长吊镲 · 慢起'),
    'bell': (bell, 1320.0, '小钟'),
}

VOICES = {
    'bass': {'sample': 'sub', 'gain': 1.0, 'follow': 'note', 'fade': 0.06},
    'guitar': {'sample': 'harp', 'gain': 0.55, 'pan': 0.28, 'follow': 'note', 'fade': 0.08},
    'guitar/distorted electric guitar': {'sample': 'choir', 'gain': 0.4, 'pan': -0.3, 'follow': 'note', 'fade': 0.08},
    'piano': {'sample': 'glass', 'gain': 0.65, 'pan': -0.15, 'follow': 'note', 'fade': 0.12},
    'strings': {'sample': 'cloud', 'transpose': 12, 'gain': 0.34, 'pan': 0.15, 'follow': 'note', 'fade': 0.2},
    'vocals': {'sample': 'choir', 'gain': 0.9, 'pan': 0.0, 'follow': 'note', 'fade': 0.08},
    'drums/kick': {'sample': 'softkick', 'pitched': False, 'follow': 'sample', 'gain': 1.0},
    'drums/snare': {'sample': 'brush', 'pitched': False, 'follow': 'sample', 'gain': 0.9},
    'drums/hihat': {'sample': 'shaker', 'pitched': False, 'follow': 'sample', 'gain': 0.9, 'pan': 0.2},
    'drums/openhat': {'sample': 'longshaker', 'pitched': False, 'follow': 'sample', 'gain': 0.7, 'pan': 0.2},
    'drums/tom': {'sample': 'softtom', 'pitched': False, 'follow': 'sample', 'gain': 1.0},
    'drums/crash': {'sample': 'wash', 'pitched': False, 'follow': 'sample', 'gain': 0.6, 'pan': -0.4},
    'drums/ride': {'sample': 'bell', 'pitched': False, 'follow': 'sample', 'gain': 0.5, 'pan': 0.42},
}
