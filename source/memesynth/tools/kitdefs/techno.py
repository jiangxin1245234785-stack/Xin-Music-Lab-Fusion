"""Techno — a kick with a rumble under it, metal on top, and one chord in an echo.

Two sounds define the darker end of techno and neither is a melody. The rumble: the kick
is sent to a reverb, the reverb is low-passed until only the bottom octave is left, and
that murmur fills the gap between kicks. And the dub chord: a short, filtered stab fed to
a delay, so one hit becomes a fading row of them. Pitched parts are few and percussive on
purpose; this kit turns a song into a pattern.
"""
import numpy as np

from drumkit import clap, crash, hat, hit, kick, metal_hat, pitched, tom
from synth import (SUSTAIN, attack, decay, detuned, echo, fm, normalise, pulse, reverb, seconds, sine, svf, triangle)

rng = np.random.default_rng(1993)
ROOT = 220.0


def rumble_kick():
    dry = kick(rng, 170.0, 48.0, 0.3, 45.0, 11.0, drive=2.0, click=0.25).astype(np.float64)
    room = reverb(rng, dry, length=0.7, mix=1.0, tail=0.35)
    padded = np.concatenate([dry, np.zeros(room.size - dry.size)])
    return normalise(padded + 0.9 * svf(room, 110.0, 0.9, 'low'))


def sub(length=SUSTAIN['bass']):
    voice = svf(sine(110.0, length) + 0.3 * pulse(110.0, length, 0.5), 320.0, 0.9, 'low')
    return normalise(voice * attack(length, 400.0) * decay(length, 3.0))


def dub_chord(length=SUSTAIN['piano']):
    """A band-passed stab and its echoes, a fifth of a second apart."""
    t = seconds(length)
    source = detuned(rng, ROOT, length, (-6, 6)) + 0.6 * pulse(ROOT, length, 0.5)
    hit_ = svf(source, 700.0 + 900.0 * np.exp(-10.0 * t), 2.0, 'band') * attack(length, 500.0) * decay(length, 7.0)
    return normalise(echo(hit_, 0.19, feedback=0.55, mix=0.6, repeats=8))


def metal(length=SUSTAIN['guitar']):
    return normalise(fm(ROOT, 3.0, 4.0, length, index_decay=20.0) * attack(length, 900.0) * decay(length, 4.0))


def drone(length=SUSTAIN['strings']):
    t = seconds(length)
    voice = svf(detuned(rng, ROOT, length, (-7, 0, 7)), 500.0 + 300.0 * np.sin(2 * np.pi * 0.2 * t), 1.5, 'low')
    return normalise(voice * attack(length, 3.0) * decay(length, 0.1))


def bleep(length=SUSTAIN['vocals']):
    voice = (sine(ROOT, length) + 0.25 * triangle(ROOT * 2, length)) * attack(length, 600.0) * decay(length, 1.2)
    return normalise(echo(voice, 0.14, feedback=0.4, mix=0.35, repeats=5))


def rim():
    t = seconds(0.08)
    return normalise((np.sin(2 * np.pi * 1700 * t) + 0.5 * np.sin(2 * np.pi * 480 * t)) * decay(0.08, 70.0))


NAME = 'Techno · Rumble'

SAMPLES = {
    'sub': (sub, 110.0, '短低音'),
    'dubchord': (dub_chord, ROOT, 'Dub 和弦 · 带回声'),
    'metal': (metal, ROOT, 'FM 金属拨奏'),
    'drone': (drone, ROOT, '持续低鸣'),
    'bleep': (bleep, ROOT, 'Bleep · 带回声'),
    'rumblekick': (rumble_kick, 48.0, '底鼓 + 低频余震'),
    'clap': (lambda: clap(rng, 0.3, 1100.0, 34.0), 1100.0, '拍手'),
    'hat': (lambda: hat(rng, 0.04, 140.0, 8500.0), 8500.0, '闭镲'),
    'openhat': (lambda: hat(rng, 0.3, 11.0, 8500.0), 8500.0, '开镲'),
    'tom': (lambda: tom(150.0, 95.0, 0.35, 20.0, 10.0), 95.0, '低嗵鼓'),
    'ride': (lambda: metal_hat(0.5, 7.0, 6000.0), 6000.0, '金属叮镲'),
    'rim': (rim, 1700.0, '鼓边'),
    'crash': (lambda: crash(rng, 1.8, 2.2, 6000.0), 6000.0, '吊镲'),
}

VOICES = {
    'bass': pitched('sub', 1.78, fade=0.008),
    'guitar': pitched('metal', 0.45, 0.28, fade=0.008),
    'piano': pitched('dubchord', 1.60, -0.15, fade=0.02),
    'strings': pitched('drone', 0.3, 0.15, fade=0.06),
    'vocals': pitched('bleep', 0.9),
    'drums/kick': hit('rumblekick', 1.2),
    'drums/snare': hit('clap', 1.2),
    'drums/hihat': hit('hat', 1.6, 0.2),
    'drums/openhat': hit('openhat', 1.3, 0.2),
    'drums/tom': hit('tom', 1.1),
    'drums/crash': hit('crash', 0.8, -0.4),
    'drums/ride': hit('ride', 0.9, 0.42),
}
