"""Wobble — dubstep: a bass whose filter opens and shuts four times a second.

Take a bright, heavy waveform, put a resonant low-pass on it, and drive the cutoff with a
slow oscillator: wub, wub, wub. That is the whole genre's signature. The lead does the same
with a band-pass, which turns the sweep into a vowel ("yoi"), and the snare is the other
half of the style: one huge hit in a room, on the third beat.

The cost of baking the wobble into a sample: it speeds up with the note. An octave higher
wobbles twice as fast.
"""
import numpy as np

from drumkit import crash, hat, hit, kick, pitched, snare, tom
from synth import (SUSTAIN, attack, decay, detuned, normalise, pulse, reverb, saw, saw_curve, seconds, svf, vibrato)

rng = np.random.default_rng(2010)
ROOT = 220.0


def wobble(length=SUSTAIN['bass']):
    t = seconds(length)
    voice = saw(110.0, length) + 0.7 * pulse(110.0, length, 0.5)
    sweep = 250.0 + 1900.0 * (0.5 - 0.5 * np.cos(2 * np.pi * 4.0 * t)) ** 1.5
    driven = np.tanh(svf(voice, sweep, 2.5, 'low') * 1.6)
    driven = svf(driven, 40.0, 0.7, 'high')            # the drive is lopsided and leaves an offset behind
    return normalise(driven * attack(length, 300.0) * decay(length, 0.2))


def talk(length=SUSTAIN['piano']):
    """A stab that says "yow": a band-pass sliding down across two detuned saws."""
    t = seconds(length)
    source = detuned(rng, ROOT, length, (-10, 10))
    voice = svf(source, 500.0 + 2200.0 * np.exp(-4.0 * t), 4.0, 'band') + 0.5 * svf(source, 600.0, 0.8, 'low')
    return normalise(voice * attack(length, 400.0) * decay(length, 0.9))


def pluck(length=SUSTAIN['guitar']):
    t = seconds(length)
    voice = svf(pulse(ROOT, length, 0.5), 350.0 + 3500.0 * np.exp(-15.0 * t), 2.2, 'low')
    return normalise(voice * attack(length, 700.0) * decay(length, 3.0))


def pad(length=SUSTAIN['strings']):
    voice = svf(detuned(rng, ROOT, length, (-8, 0, 8)), 900.0, 1.0, 'low')
    return normalise(voice * attack(length, 2.0) * decay(length, 0.12))


def yoi(length=SUSTAIN['vocals']):
    t = seconds(length)
    source = saw_curve(vibrato(ROOT, length, rate_hz=5.5, cents=10.0, onset=0.3), harmonics=40)
    sweep = 900.0 + 1300.0 * (0.5 - 0.5 * np.cos(2 * np.pi * 6.0 * t))
    voice = svf(source, sweep, 4.0, 'band') + 0.4 * svf(source, 700.0, 0.8, 'low')
    return normalise(np.tanh(voice * 1.5) * attack(length, 200.0) * decay(length, 0.3))


def big_snare():
    dry = snare(rng, 200.0, 0.3, 14.0, cutoff=1500.0, body=0.7, snap=0.5)
    return normalise(reverb(rng, dry, length=0.8, mix=0.35, tail=0.3))


NAME = 'Wobble · Dubstep'

SAMPLES = {
    'wobble': (wobble, 110.0, 'Wobble 贝斯 · 每秒 4 次'),
    'talk': (talk, ROOT, '会说话的和弦'),
    'pluck': (pluck, ROOT, '方波拨奏'),
    'darkpad': (pad, ROOT, '暗垫'),
    'yoi': (yoi, ROOT, '元音主音'),
    'kick': (lambda: kick(rng, 180.0, 45.0, 0.5, 30.0, 7.0, drive=2.2, click=0.3), 45.0, '重底鼓'),
    'bigsnare': (big_snare, 200.0, '大军鼓 · 带房间'),
    'hat': (lambda: hat(rng, 0.05, 120.0), 8000.0, '闭镲'),
    'openhat': (lambda: hat(rng, 0.3, 12.0), 8000.0, '开镲'),
    'tom': (lambda: tom(180.0, 90.0, 0.5, 14.0, 7.0), 90.0, '嗵鼓'),
    'crash': (lambda: crash(rng, 2.0, 2.0), 5500.0, '吊镲'),
}

VOICES = {
    'bass': pitched('wobble', 1.29, fade=0.012),
    'guitar': pitched('pluck', 0.64, 0.28, fade=0.008),
    'piano': pitched('talk', 1.01, -0.15),
    'strings': pitched('darkpad', 0.3, 0.15, fade=0.05, transpose=12),
    'vocals': pitched('yoi', 0.9),
    'drums/kick': hit('kick', 0.80),
    'drums/snare': hit('bigsnare', 0.87),
    'drums/hihat': hit('hat', 1.07, 0.2),
    'drums/openhat': hit('openhat', 0.80, 0.2),
    'drums/tom': hit('tom', 0.73),
    'drums/crash': hit('crash', 0.53, -0.4),
    'drums/ride': hit('openhat', 0.73, 0.42, maxDur=0.16),
}
