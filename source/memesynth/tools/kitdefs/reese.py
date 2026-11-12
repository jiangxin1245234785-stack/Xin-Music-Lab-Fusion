"""Reese — drum and bass: two saws that will not agree, and drums cut from a break.

The Reese bass is the cheapest great sound in electronic music: two sawtooth waves a
fraction of a semitone apart through a low-pass filter. The detune makes them drift in
and out of phase, so the tone hollows out and fills in a few times a second, and it never
repeats exactly. Everything else in the kit stays out of its way: thin keys, a soft pad,
and drums shaped like a sampled funk break, short and bright with a 12-bit edge.
"""
import numpy as np

from drumkit import crash, hat, hit, kick, pitched, snare, tom
from synth import (SUSTAIN, attack, crush, decay, detuned, fm, normalise, partials, phase, saw, seconds, svf,
                   triangle, vibrato)

rng = np.random.default_rng(1994)
ROOT = 220.0


def reese(length=SUSTAIN['bass']):
    t = seconds(length)
    voice = detuned(rng, 110.0, length, (-18, 18)) + 0.6 * detuned(rng, 110.0, length, (-7, 7))
    voice = svf(voice, 520.0 + 260.0 * np.sin(2 * np.pi * 0.4 * t), 1.6, 'low')
    return normalise(np.tanh(voice * 2.0) * attack(length, 200.0) * decay(length, 0.2))


def keys(length=SUSTAIN['piano']):
    """Hollow, odd-harmonic keys: they sit above the bass instead of fighting it."""
    voice = partials(ROOT, [(1, 1.0, 0.9), (3, 0.55, 1.6), (5, 0.3, 2.6), (7, 0.12, 4.0), (2, 0.12, 1.2)], length)
    return normalise(voice * attack(length, 500.0))


def pluck(length=SUSTAIN['guitar']):
    t = seconds(length)
    voice = svf(saw(ROOT, length), 400.0 + 4200.0 * np.exp(-12.0 * t), 1.4, 'low')
    return normalise(voice * attack(length, 700.0) * decay(length, 3.0))


def pad(length=SUSTAIN['strings']):
    voice = svf(detuned(rng, ROOT, length, (-9, 0, 9), wave=triangle) + 0.3 * detuned(rng, ROOT, length, (-6, 6)),
                1500.0, 0.8, 'low')
    return normalise(voice * attack(length, 2.5) * decay(length, 0.12))


def lead(length=SUSTAIN['vocals']):
    curve = vibrato(ROOT, length, rate_hz=5.2, cents=12.0, onset=0.3)
    voice = phase(curve) + 0.35 * phase(curve * 2) + 0.2 * fm(ROOT, 2.0, 1.0, length, index_decay=4.0)
    return normalise(voice * attack(length, 150.0) * decay(length, 0.3))


def sampled(audio):
    """Off an old sampler: twelve bits."""
    return normalise(crush(audio, 12))


NAME = 'Reese · Drum & Bass'

SAMPLES = {
    'reese': (reese, 110.0, 'Reese 贝斯 · 两个失谐锯齿'),
    'hollowkeys': (keys, ROOT, '奇次泛音键盘'),
    'pluck': (pluck, ROOT, '锯齿拨奏'),
    'liquidpad': (pad, ROOT, '柔垫'),
    'liquidlead': (lead, ROOT, '正弦主音'),
    'breakkick': (lambda: sampled(kick(rng, 150.0, 60.0, 0.28, 45.0, 13.0, drive=1.8, click=0.35)), 60.0, 'Break 底鼓'),
    'breaksnare': (lambda: sampled(snare(rng, 230.0, 0.22, 24.0, cutoff=2400.0, body=0.7)), 230.0, 'Break 军鼓'),
    'breakhat': (lambda: sampled(hat(rng, 0.05, 110.0, 7000.0)), 7000.0, '闭镲'),
    'breakopen': (lambda: sampled(hat(rng, 0.28, 13.0, 7000.0)), 7000.0, '开镲'),
    'breaktom': (lambda: sampled(tom(240.0, 150.0, 0.3, 22.0, 11.0)), 150.0, '嗵鼓'),
    'breakcrash': (lambda: sampled(crash(rng, 1.4, 2.8, 5000.0)), 5000.0, '吊镲'),
}

VOICES = {
    'bass': pitched('reese', 1.0, fade=0.012),
    'guitar': pitched('pluck', 0.91, 0.28, fade=0.008),
    'piano': pitched('hollowkeys', 0.6, -0.15),
    'strings': pitched('liquidpad', 0.15, 0.15, fade=0.05, transpose=12),
    'vocals': pitched('liquidlead', 0.9),
    'drums/kick': hit('breakkick', 1.2),
    'drums/snare': hit('breaksnare', 1.3),
    'drums/hihat': hit('breakhat', 1.6, 0.2),
    'drums/openhat': hit('breakopen', 1.2, 0.2),
    'drums/tom': hit('breaktom', 1.1),
    'drums/crash': hit('breakcrash', 0.8, -0.4),
    'drums/ride': hit('breakopen', 1.1, 0.42, maxDur=0.16),
}
