"""Electro — Kraftwerk's side of the family: a vocoder for a voice, an 808, and lasers.

A vocoder splits a buzzing synth into a dozen frequency bands and lets a voice decide how
loud each band is, so the synth appears to speak. With no voice to feed it, the bands
here are given random loudnesses that change eleven times a second, about the rate of
syllables: it says nothing, in a robot's voice, in tune. Around it: a square-wave bass, a
nasal stab, a laser zap for the plucks, and the 808 exactly as electro used it.
"""
import numpy as np

from drumkit import cowbell, hit, kick, metal_hat, pitched, snare, tom
from synth import (RATE, SUSTAIN, attack, decay, detuned, normalise, pulse, pwm, saw, seconds, svf, warp)

rng = np.random.default_rng(2600)
ROOT = 220.0
BANDS = (300.0, 420.0, 580.0, 800.0, 1100.0, 1500.0, 2000.0, 2700.0, 3600.0)


def vocode(source, every=0.09, steady=0.25):
    """Band gains that jump to new values every `every` seconds. `steady` is the part that never moves."""
    count, hop = source.size, int(every * RATE)
    out = np.zeros(count, dtype=np.float64)
    for centre in BANDS:
        gains = np.repeat(rng.uniform(0.0, 1.0, count // hop + 1) ** 2, hop)[:count]
        smooth = np.convolve(gains, np.ones(480) / 480.0, mode='same')        # 10 ms, so the jumps do not click
        out += svf(source, centre, 6.0, 'band') * (steady + (1.0 - steady) * smooth)
    return out


def robot(length=SUSTAIN['vocals']):
    source = saw(ROOT, length) + 0.6 * pulse(ROOT, length, 0.5)
    return normalise((vocode(source) + 0.25 * svf(source, 500.0, 0.8, 'low')) * attack(length, 300.0) * decay(length, 0.25))


def robot_choir(length=SUSTAIN['strings']):
    source = detuned(rng, ROOT, length, (-9, 0, 9))
    return normalise((vocode(source, every=0.4, steady=0.5) + 0.3 * svf(source, 500.0, 0.8, 'low'))
                     * attack(length, 10.0) * decay(length, 0.1))


def bass(length=SUSTAIN['bass']):
    t = seconds(length)
    voice = svf(pwm(110.0, length, 0.5 - 0.15 * np.exp(-8.0 * t)), 700.0, 1.2, 'low')
    return normalise(voice * attack(length, 800.0) * decay(length, 1.2))


def nasal(length=SUSTAIN['piano']):
    """A square wave through one fixed, ringing filter: the same vowel on every note."""
    voice = svf(pulse(ROOT, length, 0.5), 1200.0, 4.0, 'low')
    return normalise(voice * attack(length, 800.0) * decay(length, 1.2))


def zap(length=SUSTAIN['guitar']):
    """Two octaves down onto the note in 30 ms: a laser."""
    t = seconds(length)
    return normalise(warp(pulse(ROOT, length, 0.3), 2400.0 * np.exp(-110.0 * t)) * attack(length, 1500.0) * decay(length, 3.5))


NAME = 'Electro · 声码器'

SAMPLES = {
    'squarebass': (bass, 110.0, '方波贝斯'),
    'nasal': (nasal, ROOT, '鼻音方波'),
    'zap': (zap, ROOT, '激光拨奏'),
    'robotchoir': (robot_choir, ROOT, '声码器合唱'),
    'robot': (robot, ROOT, '声码器主音 · 每秒 11 个“音节”'),
    'kick808': (lambda: kick(rng, 140.0, 52.0, 0.55, 30.0, 5.5, drive=1.4, click=0.1), 52.0, '808 底鼓'),
    'snare808': (lambda: snare(rng, 180.0, 0.28, 16.0, body=0.6), 180.0, '808 军鼓'),
    'hat808': (lambda: metal_hat(0.045, 130.0), 7000.0, '808 闭镲'),
    'open808': (lambda: metal_hat(0.35, 10.0), 7000.0, '808 开镲'),
    'tom808': (lambda: tom(160.0, 105.0, 0.5, 18.0, 6.0), 105.0, '808 嗵鼓'),
    'crash808': (lambda: metal_hat(1.6, 2.4, 5000.0), 5000.0, '808 吊镲'),
    'cowbell': (cowbell, 540.0, '808 牛铃'),
}

VOICES = {
    'bass': pitched('squarebass', 1.50, fade=0.008),
    'guitar': pitched('zap', 0.61, 0.28, fade=0.008),
    'piano': pitched('nasal', 0.55, -0.15),
    'strings': pitched('robotchoir', 0.32, 0.15, fade=0.05),
    'vocals': pitched('robot', 0.9),
    'drums/kick': hit('kick808', 0.78),
    'drums/snare': hit('snare808', 0.85),
    'drums/hihat': hit('hat808', 0.98, 0.2),
    'drums/openhat': hit('open808', 0.72, 0.2),
    'drums/tom': hit('tom808', 0.72),
    'drums/crash': hit('crash808', 0.46, -0.4),
    'drums/ride': hit('cowbell', 0.52, 0.42),
}
