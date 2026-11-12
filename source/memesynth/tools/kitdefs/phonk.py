"""Phonk — the 808 cowbell played as a melody, over a bass that is mostly distortion.

Drift phonk has one unmistakable idea: take the TR-808's cowbell, a clank made of two
square waves, and play tunes on it. Here the two squares are set a fifth apart, so each
note is a small power chord and still reads as one pitch. Under it is an 808 bass clipped
almost square, and everything else is degraded on purpose: eight bits, a third of the
sample rate, as if lifted from a worn cassette.
"""
import numpy as np

from drumkit import clap, hit, kick, metal_hat, pitched, tom
from synth import (SUSTAIN, attack, crush, decay, detuned, hold, normalise, phase, pulse, seconds, svf, triangle)

rng = np.random.default_rng(901)
ROOT = 220.0


def bell(length, ring):
    """The cowbell, tuned: squares at the note and a fifth above, through a band-pass that rings."""
    clank = svf(pulse(ROOT, length, 0.5) + 0.8 * pulse(ROOT * 1.5, length, 0.5), ROOT * 3.0, 3.0, 'band')
    clank += 0.35 * svf(pulse(ROOT, length, 0.5), 700.0, 0.8, 'low')
    return normalise(clank * (0.35 * decay(length, ring) + 0.65 * decay(length, 40.0)) * attack(length, 2500.0))


def tape(audio, bits=8, factor=3):
    return normalise(crush(hold(np.asarray(audio, dtype=np.float64), factor), bits))


def bass(length=SUSTAIN['bass']):
    t = seconds(length)
    voice = np.tanh(phase(55.0 * (1.0 + 0.6 * np.exp(-50.0 * t))) * 6.0)
    return normalise(svf(voice, 1500.0, 0.9, 'low') * attack(length, 900.0) * decay(length, 0.8, hold=0.2))


def memphis(length=SUSTAIN['guitar']):
    return tape(svf(triangle(ROOT, length), 2000.0, 0.8, 'low') * attack(length, 800.0) * decay(length, 4.0))


def choir(length=SUSTAIN['strings']):
    voice = svf(detuned(rng, ROOT, length, (-12, 0, 12)), 800.0, 1.2, 'low')
    return tape(voice * attack(length, 3.0) * decay(length, 0.12))


NAME = 'Phonk · 牛铃'

SAMPLES = {
    'clipbass': (bass, 55.0, '削波 808 贝斯'),
    'cowbellkeys': (lambda: bell(SUSTAIN['piano'], 2.2), ROOT, '牛铃 · 当键盘弹'),
    'memphis': (memphis, ROOT, '8 位三角波拨奏'),
    'tapechoir': (choir, ROOT, '磁带暗垫'),
    'cowbelllead': (lambda: bell(SUSTAIN['vocals'], 1.4), ROOT, '牛铃主音'),
    'kick': (lambda: tape(kick(rng, 160.0, 50.0, 0.35, 45.0, 9.0, drive=3.5, click=0.2), 8, 2), 50.0, '失真底鼓'),
    'clap': (lambda: tape(clap(rng, 0.3, 1200.0, 30.0)), 1200.0, '磁带拍手'),
    'hat': (lambda: tape(metal_hat(0.035, 170.0), 8, 2), 7000.0, '闭镲'),
    'openhat': (lambda: tape(metal_hat(0.3, 12.0), 8, 2), 7000.0, '开镲'),
    'tom': (lambda: tape(tom(160.0, 100.0, 0.45, 18.0, 7.0)), 100.0, '808 嗵鼓'),
    'crash': (lambda: tape(metal_hat(1.4, 2.8, 5000.0), 8, 2), 5000.0, '吊镲'),
}

VOICES = {
    'bass': pitched('clipbass', 1.0, fade=0.012),
    'guitar': pitched('memphis', 0.66, 0.28, fade=0.008),
    'piano': pitched('cowbellkeys', 1.80, -0.15),
    'strings': pitched('tapechoir', 0.21, 0.15, fade=0.05, transpose=12),
    'vocals': pitched('cowbelllead', 0.9, transpose=12),
    'drums/kick': hit('kick', 0.76),
    'drums/snare': hit('clap', 0.82),
    'drums/hihat': hit('hat', 0.95, 0.2),
    'drums/openhat': hit('openhat', 0.70, 0.2),
    'drums/tom': hit('tom', 0.70),
    'drums/crash': hit('crash', 0.44, -0.4),
    'drums/ride': hit('openhat', 0.63, 0.42, maxDur=0.14),
}
