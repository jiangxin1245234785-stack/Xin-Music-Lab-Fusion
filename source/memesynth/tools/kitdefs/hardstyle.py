"""Hardstyle — the kick is the song: distorted until it has a pitch, with a screech on top.

A hardstyle kick is an ordinary kick drum driven so hard into distortion that its tail
turns from a thud into a held, buzzing note. Producers tune it to the key of the track.
The bass is the same idea turned around: a distorted tone that swells in after the beat
rather than landing on it. Over that sits the screech, a saw through a narrow resonant
filter that is swept quickly, and the big detuned chords of the euphoric half of the genre.
"""
import numpy as np

from drumkit import clap, crash, hat, hit, pitched, tom
from synth import (SUSTAIN, attack, decay, detuned, noise, normalise, pulse, saw_curve, seconds, sine, svf,
                   swept_sine, vibrato)

rng = np.random.default_rng(2003)
ROOT = 220.0


def hard_kick():
    """A punch that falls three octaves in a few hundredths of a second, then a clipped tail at 55 Hz."""
    sweep = swept_sine(700.0, 55.0, 0.6, 55.0)
    tail = np.tanh(sweep * 7.0 * decay(0.6, 4.0))
    return normalise(svf(tail, 3000.0, 1.0, 'low') + noise(rng, 0.6) * decay(0.6, 900.0) * 0.3)


def reverse_bass(length=SUSTAIN['bass']):
    voice = svf(np.tanh(sine(110.0, length) * 5.0), 1200.0, 1.0, 'low')
    return normalise(voice * attack(length, 30.0) * decay(length, 0.5))


def stab(length=SUSTAIN['piano']):
    """Detuned pulses, clipped: brighter and rougher than a supersaw."""
    t = seconds(length)
    voice = np.tanh(detuned(rng, ROOT, length, (-16, -6, 6, 16), wave=lambda f, n: pulse(f, n, 0.35)) * 3.0)
    return normalise(svf(voice, 900.0 + 5000.0 * np.exp(-4.0 * t), 1.0, 'low') * attack(length, 500.0) * decay(length, 0.8))


def pluck(length=SUSTAIN['guitar']):
    t = seconds(length)
    voice = svf(np.tanh(pulse(ROOT, length, 0.5) * 2.0), 400.0 + 5000.0 * np.exp(-14.0 * t), 1.5, 'low')
    return normalise(voice * attack(length, 800.0) * decay(length, 3.0))


def pad(length=SUSTAIN['strings']):
    voice = detuned(rng, ROOT, length, (-20, -9, 0, 9, 20)) + 0.5 * detuned(rng, ROOT * 2, length, (-12, 12))
    return normalise(svf(voice, 400.0, 0.8, 'high') * attack(length, 6.0) * decay(length, 0.1))


def screech(length=SUSTAIN['vocals']):
    t = seconds(length)
    source = saw_curve(vibrato(ROOT, length, rate_hz=6.5, cents=25.0, onset=0.15), harmonics=40)
    sweep = 1400.0 + 1500.0 * np.exp(-6.0 * t) + 300.0 * np.sin(2 * np.pi * 7.0 * t)
    voice = np.tanh(svf(source, sweep, 6.0, 'band') * 2.5) + 0.3 * svf(source, 800.0, 0.8, 'low')
    return normalise(voice * attack(length, 300.0) * decay(length, 0.3))


NAME = 'Hardstyle · 失真底鼓'

SAMPLES = {
    'reversebass': (reverse_bass, 110.0, '反向贝斯 · 失真正弦'),
    'hardstab': (stab, ROOT, '削波脉冲和弦'),
    'hardpluck': (pluck, ROOT, '失真拨奏'),
    'euphoric': (pad, ROOT, '宽锯齿垫'),
    'screech': (screech, ROOT, '尖叫主音'),
    'hardkick': (hard_kick, 55.0, '失真底鼓 · 带音高的尾巴'),
    'clap': (lambda: clap(rng, 0.4, 1400.0, 22.0), 1400.0, '拍手'),
    'hat': (lambda: hat(rng, 0.05, 120.0, 8500.0), 8500.0, '闭镲'),
    'openhat': (lambda: hat(rng, 0.35, 10.0, 8500.0), 8500.0, '开镲'),
    'tom': (lambda: tom(400.0, 110.0, 0.35, 30.0, 10.0), 110.0, '下扫嗵鼓'),
    'crash': (lambda: crash(rng, 2.2, 1.8, 6000.0), 6000.0, '吊镲'),
}

VOICES = {
    'bass': pitched('reversebass', 1.0, fade=0.012),
    'guitar': pitched('hardpluck', 0.45, 0.28, fade=0.008),
    'piano': pitched('hardstab', 0.55, -0.15),
    'strings': pitched('euphoric', 0.45, 0.15, fade=0.05, transpose=12),
    'vocals': pitched('screech', 0.8),
    'drums/kick': hit('hardkick', 0.51),
    'drums/snare': hit('clap', 0.56),
    'drums/hihat': hit('hat', 0.68, 0.2),
    'drums/openhat': hit('openhat', 0.56, 0.2),
    'drums/tom': hit('tom', 0.47),
    'drums/crash': hit('crash', 0.34, -0.4),
    'drums/ride': hit('openhat', 0.47, 0.42, maxDur=0.16),
}
