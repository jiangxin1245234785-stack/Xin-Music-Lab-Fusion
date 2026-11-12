"""Future bass — bright saw chords that pump, and a lead that scoops up into every note.

The chords are a supersaw, but they do not sit still: the volume ducks and swells several
times a second, as if a kick drum were pushing them out of the way (it is called
sidechaining, and here it is baked in). Plucks start with a tiny falling blip. The lead
imitates a pitched-up vocal chop, sliding up into its note from below.

Cost, as with the wobble: the pumping is in the sample, so it runs faster on higher notes.
"""
import numpy as np

from drumkit import clap, crash, hat, hit, kick, pitched, snare, tom
from synth import (SUSTAIN, attack, decay, detuned, formants, normalise, pulse, saw, saw_curve, seconds, sine, svf,
                   vibrato, warp)

rng = np.random.default_rng(2014)
ROOT = 220.0
SPREAD = (-21, -12, -5, 0, 5, 12, 21)


def pump(length, per_second=4.0, floor=0.3):
    """Volume that drops at each beat and swells back: 1 at the end of the cycle, `floor` at its start."""
    cycle = (seconds(length) * per_second) % 1.0
    return floor + (1.0 - floor) * np.sqrt(cycle)


def chords(length=SUSTAIN['piano']):
    voice = detuned(rng, ROOT, length, SPREAD) + 0.5 * detuned(rng, ROOT * 2, length, (-10, 0, 10))
    return normalise(svf(voice, 6000.0, 0.8, 'low') * pump(length) * attack(length, 300.0) * decay(length, 0.35))


def bass(length=SUSTAIN['bass']):
    voice = sine(110.0, length) + 0.5 * svf(saw(110.0, length), 900.0, 1.0, 'low')
    return normalise(np.tanh(voice * 1.3) * pump(length) * attack(length, 300.0) * decay(length, 0.4))


def pluck(length=SUSTAIN['guitar']):
    """Falls an octave onto the note in 15 ms: the blip."""
    t = seconds(length)
    voice = svf(pulse(ROOT, length, 0.3) + 0.6 * saw(ROOT, length), 600.0 + 6000.0 * np.exp(-12.0 * t), 1.2, 'low')
    return normalise(warp(voice, 1200.0 * np.exp(-200.0 * t)) * attack(length, 900.0) * decay(length, 3.2))


def pad(length=SUSTAIN['strings']):
    t = seconds(length)
    voice = svf(detuned(rng, ROOT, length, SPREAD), 1800.0 + 1200.0 * np.sin(2 * np.pi * 2.0 * t), 1.0, 'low')
    return normalise(voice * attack(length, 5.0) * decay(length, 0.1))


def chop(length=SUSTAIN['vocals']):
    t = seconds(length)
    curve = vibrato(ROOT, length, rate_hz=5.5, cents=12.0, onset=0.35) * 2.0 ** (-300.0 * np.exp(-35.0 * t) / 1200.0)
    source = saw_curve(curve, harmonics=40)
    voice = formants(source, ((950.0, 1.0), (1600.0, 0.6), (3200.0, 0.3)), 4.0) + 0.3 * svf(source, 600.0, 0.8, 'low')
    return normalise(voice * attack(length, 200.0) * decay(length, 0.3))


NAME = 'Future Bass · 侧链和弦'

SAMPLES = {
    'pumpbass': (bass, 110.0, '低音 · 带侧链起伏'),
    'pumpchords': (chords, ROOT, '七锯齿和弦 · 每秒 4 次起伏'),
    'blip': (pluck, ROOT, '下滑拨奏'),
    'movingpad': (pad, ROOT, '滤波摆动垫'),
    'chop': (chop, ROOT, '人声切片主音 · 上滑'),
    'kick': (lambda: kick(rng, 190.0, 50.0, 0.4, 40.0, 9.0, drive=1.8, click=0.3), 50.0, '底鼓'),
    'snare': (lambda: snare(rng, 210.0, 0.35, 12.0, cutoff=1600.0, body=0.5, snap=0.7), 210.0, '军鼓 + 拍手'),
    'hat': (lambda: hat(rng, 0.035, 170.0, 8500.0), 8500.0, '闭镲'),
    'openhat': (lambda: hat(rng, 0.3, 12.0, 8500.0), 8500.0, '开镲'),
    'tom': (lambda: tom(220.0, 120.0), 120.0, '嗵鼓'),
    'crash': (lambda: crash(rng, 2.0, 2.0, 6000.0), 6000.0, '吊镲'),
    'snap': (lambda: clap(rng, 0.12, 2400.0, 60.0), 2400.0, '响指'),
}

VOICES = {
    'bass': pitched('pumpbass', 1.0, fade=0.01),
    'guitar': pitched('blip', 0.5, 0.28, fade=0.008),
    'piano': pitched('pumpchords', 0.6, -0.15),
    'strings': pitched('movingpad', 0.28, 0.15, fade=0.05, transpose=12),
    'vocals': pitched('chop', 0.9, fade=0.015),
    'drums/kick': hit('kick', 1.2),
    'drums/snare': hit('snare', 1.3),
    'drums/hihat': hit('hat', 1.6, 0.2),
    'drums/openhat': hit('openhat', 1.2, 0.2),
    'drums/tom': hit('tom', 1.1),
    'drums/crash': hit('crash', 0.8, -0.4),
    'drums/ride': hit('snap', 0.9, 0.42),
}
