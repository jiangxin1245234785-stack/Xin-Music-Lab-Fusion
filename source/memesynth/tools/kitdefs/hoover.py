"""Hoover — early-90s rave: the vacuum-cleaner lead, piano stabs and a 909.

The hoover came off a Roland Alpha Juno: a detuned sawtooth stack with the same thing
again one and two octaves up, all of it chorused, and a pitch that swoops up into the note
instead of starting on it. It sounds like a machine being switched on. Rave used it for
everything, so here it is the chords, the pad and the lead, at three lengths.
"""
import numpy as np

from drumkit import clap, crash, hat, hit, kick, pitched, tom
from synth import (SUSTAIN, attack, decay, detuned, normalise, partials, pwm, seconds, svf, warp)

rng = np.random.default_rng(1991)
ROOT = 220.0


def hoover(length, swoop=150.0):
    t = seconds(length)
    stack = detuned(rng, ROOT, length, (-25, -10, 0, 10, 25))
    stack += 0.8 * detuned(rng, ROOT * 2, length, (-20, 0, 20)) + 0.4 * detuned(rng, ROOT * 4, length, (-15, 15))
    return svf(warp(stack, -swoop * np.exp(-25.0 * t)), 3500.0, 1.2, 'low')


def stab(length=SUSTAIN['piano']):
    return normalise(hoover(length) * attack(length, 400.0) * decay(length, 1.2))


def pad(length=SUSTAIN['strings']):
    return normalise(svf(hoover(length, swoop=60.0), 1800.0, 0.9, 'low') * attack(length, 8.0) * decay(length, 0.12))


def lead(length=SUSTAIN['vocals']):
    return normalise(hoover(length, swoop=250.0) * attack(length, 300.0) * decay(length, 0.25))


def piano_stab(length=SUSTAIN['guitar']):
    """The rave piano: every harmonic present and loud, gone in half a second."""
    voice = partials(ROOT, [(k, 1.0 / k ** 0.7, 2.5 + 0.8 * k) for k in range(1, 12)], length)
    return normalise(voice * attack(length, 1500.0))


def bass(length=SUSTAIN['bass']):
    t = seconds(length)
    voice = svf(pwm(110.0, length, 0.5 - 0.3 * np.exp(-5.0 * t)), 300.0 + 1800.0 * np.exp(-7.0 * t), 1.8, 'low')
    return normalise(np.tanh(voice * 1.4) * attack(length, 500.0) * decay(length, 0.6))


NAME = 'Hoover · 90 年代 Rave'

SAMPLES = {
    'ravebass': (bass, 110.0, '脉宽贝斯'),
    'hooverstab': (stab, ROOT, 'Hoover 和弦'),
    'ravepiano': (piano_stab, ROOT, 'Rave 钢琴'),
    'hooverpad': (pad, ROOT, 'Hoover 垫'),
    'hooverlead': (lead, ROOT, 'Hoover 主音 · 上滑'),
    'kick909': (lambda: kick(rng, 240.0, 50.0, 0.4, 55.0, 9.0, drive=2.6, click=0.3), 50.0, '909 底鼓 · 过载'),
    'clap909': (lambda: clap(rng), 1200.0, '909 拍手'),
    'hat909': (lambda: hat(rng, 0.05, 120.0, 8500.0), 8500.0, '闭镲'),
    'open909': (lambda: hat(rng, 0.4, 9.0, 8500.0), 8500.0, '开镲'),
    'tom909': (lambda: tom(210.0, 120.0), 120.0, '嗵鼓'),
    'crash909': (lambda: crash(rng, 2.0, 2.0, 6000.0), 6000.0, '吊镲'),
}

VOICES = {
    'bass': pitched('ravebass', 1.0, fade=0.008),
    'guitar': pitched('ravepiano', 0.94, 0.28, fade=0.008),
    'piano': pitched('hooverstab', 1.06, -0.15),
    'strings': pitched('hooverpad', 0.3, 0.15, fade=0.05),
    'vocals': pitched('hooverlead', 0.85),
    'drums/kick': hit('kick909', 1.2),
    'drums/snare': hit('clap909', 1.3),
    'drums/hihat': hit('hat909', 1.6, 0.2),
    'drums/openhat': hit('open909', 1.3, 0.2),
    'drums/tom': hit('tom909', 1.1),
    'drums/crash': hit('crash909', 0.8, -0.4),
    'drums/ride': hit('open909', 1.1, 0.42, maxDur=0.16),
}
