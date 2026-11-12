"""UK garage — a bass that bends into each note, an organ stab, and a voice cut into syllables.

Two-step took house and removed weight from it. The bass is round and short and slides
down onto its pitch, so it bounces rather than drones. The chords are a percussive organ.
And where a singer would be there is a vocal chopped into single vowels and played like a
keyboard, which is what the lead here imitates: a buzz through a moving mouth shape.
The drums are small and crisp; the swing that makes them garage is in the score, not here.
"""
import numpy as np

from drumkit import crash, hat, hit, kick, pitched, snare
from synth import (SUSTAIN, attack, decay, detuned, formants, normalise, partials, phase, saw, saw_curve, seconds, svf,
                   triangle, vibrato)

rng = np.random.default_rng(2000)
ROOT = 220.0


def bounce(length=SUSTAIN['bass']):
    """Starts a semitone high and lands in 40 ms."""
    t = seconds(length)
    curve = 110.0 * 2.0 ** (100.0 * np.exp(-70.0 * t) / 1200.0)
    voice = phase(curve) + 0.35 * phase(curve * 2) + 0.15 * phase(curve * 3)
    return normalise(np.tanh(voice * 1.3) * attack(length, 500.0) * decay(length, 2.2))


def organ(length=SUSTAIN['piano']):
    """Octaves only, with a knock on the front: the garage organ."""
    voice = partials(ROOT, [(1, 1.0, 1.8), (2, 0.7, 2.0), (4, 0.5, 2.6), (8, 0.2, 4.0), (3, 0.1, 12.0)], length)
    return normalise(voice * attack(length, 1500.0))


def chop(length=SUSTAIN['guitar']):
    voice = formants(saw(ROOT, length), ((600.0, 1.0), (1700.0, 0.6), (2500.0, 0.3)), 4.0) + 0.3 * svf(saw(ROOT, length), 500.0, 0.8, 'low')
    return normalise(voice * attack(length, 300.0) * decay(length, 4.0))


def pad(length=SUSTAIN['strings']):
    voice = svf(detuned(rng, ROOT, length, (-8, 0, 8), wave=triangle), 1600.0, 0.8, 'low')
    return normalise(voice * attack(length, 3.0) * decay(length, 0.12))


def vowel(length=SUSTAIN['vocals']):
    """ "Oh" opening to "ah" over the first quarter-second."""
    t = seconds(length)
    source = saw_curve(vibrato(ROOT, length, rate_hz=5.0, cents=10.0, onset=0.4), harmonics=36)
    opening = 1.0 - np.exp(-10.0 * t)
    voice = svf(source, 450.0 + 350.0 * opening, 5.0, 'band') + 0.6 * svf(source, 850.0 + 400.0 * opening, 5.0, 'band')
    voice += 0.2 * svf(source, 2600.0, 5.0, 'band') + 0.3 * svf(source, 500.0, 0.8, 'low')
    return normalise(voice * attack(length, 200.0) * decay(length, 0.5))


def block():
    t = seconds(0.12)
    return normalise((np.sin(2 * np.pi * 820 * t) + 0.4 * np.sin(2 * np.pi * 1930 * t)) * decay(0.12, 45.0))


NAME = 'UK Garage · 2-step'

SAMPLES = {
    'bounce': (bounce, 110.0, '弹跳贝斯 · 滑入'),
    'garageorgan': (organ, ROOT, '八度风琴'),
    'chop': (chop, ROOT, '人声切片拨奏'),
    'warmpad': (pad, ROOT, '暖垫'),
    'vowel': (vowel, ROOT, '人声切片主音 · “噢—啊”'),
    'kick': (lambda: kick(rng, 140.0, 58.0, 0.22, 50.0, 16.0, drive=1.4, click=0.25), 58.0, '短底鼓'),
    'snare': (lambda: snare(rng, 300.0, 0.16, 30.0, cutoff=2600.0, body=0.6), 300.0, '高调军鼓'),
    'hat': (lambda: hat(rng, 0.035, 160.0, 8500.0), 8500.0, '闭镲'),
    'openhat': (lambda: hat(rng, 0.2, 16.0, 8500.0), 8500.0, '开镲'),
    'block': (block, 820.0, '木鱼'),
    'crash': (lambda: crash(rng, 1.4, 3.0), 5500.0, '吊镲'),
}

VOICES = {
    'bass': pitched('bounce', 1.36, fade=0.008),
    'guitar': pitched('chop', 1.04, 0.28, fade=0.01),
    'piano': pitched('garageorgan', 0.6, -0.15),
    'strings': pitched('warmpad', 0.21, 0.15, fade=0.05, transpose=12),
    'vocals': pitched('vowel', 0.9, fade=0.015),
    'drums/kick': hit('kick', 1.54),
    'drums/snare': hit('snare', 1.67),
    'drums/hihat': hit('hat', 2.06, 0.2),
    'drums/openhat': hit('openhat', 1.54, 0.2),
    'drums/tom': hit('block', 1.28),
    'drums/crash': hit('crash', 1.03, -0.4),
    'drums/ride': hit('openhat', 1.41, 0.42, maxDur=0.12),
}
