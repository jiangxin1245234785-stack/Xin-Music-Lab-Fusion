"""Psytrance — a bass that is a row of clicks, and filters that squeal.

The psytrance bass is not a held note. It is a saw whose filter slams shut in a few
hundredths of a second, so each note is a short "k" with a pitch, three of them between
every kick. The kick itself is all click and a very fast fall. Everything above is made
from one move: a resonant filter turned up until it whistles, swept quickly, which gives
the laser zaps and the squelching leads, then thrown into an echo.
"""
import numpy as np

from drumkit import crash, hat, hit, kick, pitched, snare, tom
from synth import (SUSTAIN, attack, decay, detuned, echo, fm, normalise, reverb, saw, saw_curve, seconds, svf,
                   vibrato)

rng = np.random.default_rng(604)
ROOT = 220.0


def kbass(length=SUSTAIN['bass']):
    t = seconds(length)
    voice = svf(saw(110.0, length), 180.0 + 2600.0 * np.exp(-35.0 * t), 1.8, 'low')
    return normalise(voice * attack(length, 1500.0) * decay(length, 6.0))


def squelch(length=SUSTAIN['piano']):
    """FM that starts very bright and closes over a second, through a band that slides down with it."""
    t = seconds(length)
    source = fm(ROOT, 1.0, 6.0, length, index_decay=3.5)
    voice = svf(source, 700.0 + 3000.0 * np.exp(-5.0 * t), 3.0, 'band') + 0.3 * source
    return normalise(voice * attack(length, 900.0) * decay(length, 1.4))


def laser(length=SUSTAIN['guitar']):
    t = seconds(length)
    voice = svf(saw(ROOT, length), 300.0 + 6000.0 * np.exp(-20.0 * t), 6.0, 'low')
    return normalise(voice * attack(length, 1200.0) * decay(length, 4.0))


def pad(length=SUSTAIN['strings']):
    t = seconds(length)
    source = detuned(rng, ROOT, length, (-10, 0, 10))
    sweep = 1200.0 + 900.0 * np.sin(2 * np.pi * 0.25 * t)
    voice = svf(source, sweep, 2.5, 'band') + 0.4 * svf(source, 700.0, 0.8, 'low')
    return normalise(reverb(rng, voice * attack(length, 4.0) * decay(length, 0.1), length=2.0, mix=0.3))


def lead(length=SUSTAIN['vocals']):
    t = seconds(length)
    source = saw_curve(vibrato(ROOT, length, rate_hz=6.0, cents=10.0, onset=0.3), harmonics=40)
    sweep = 1500.0 + 1100.0 * np.sin(2 * np.pi * 7.0 * t)
    voice = svf(source, sweep, 5.0, 'low') * attack(length, 400.0) * decay(length, 0.5)
    return normalise(echo(voice, 0.14, feedback=0.45, mix=0.3, repeats=5))


NAME = 'Psytrance · 滚动低音'

SAMPLES = {
    'kbass': (kbass, 110.0, '短促贝斯 · 滤波器瞬间关上'),
    'squelch': (squelch, ROOT, 'FM 挤压音'),
    'laser': (laser, ROOT, '谐振激光'),
    'phasepad': (pad, ROOT, '扫频垫'),
    'acidlead': (lead, ROOT, '谐振主音 · 带回声'),
    'psykick': (lambda: kick(rng, 420.0, 46.0, 0.25, 60.0, 12.0, drive=2.0, click=0.5), 46.0, 'Psy 底鼓'),
    'snare': (lambda: snare(rng, 240.0, 0.18, 28.0, cutoff=2400.0, body=0.5, snap=0.4), 240.0, '短军鼓'),
    'hat': (lambda: hat(rng, 0.03, 180.0, 9000.0), 9000.0, '闭镲'),
    'openhat': (lambda: hat(rng, 0.22, 15.0, 9000.0), 9000.0, '开镲'),
    'tom': (lambda: tom(300.0, 110.0, 0.3, 26.0, 11.0), 110.0, '嗵鼓'),
    'crash': (lambda: normalise(reverb(rng, crash(rng, 1.8, 2.4, 6000.0), length=1.5, mix=0.3)), 6000.0, '吊镲'),
}

VOICES = {
    'bass': pitched('kbass', 3.96, fade=0.006),
    'guitar': pitched('laser', 1.26, 0.28, fade=0.008),
    'piano': pitched('squelch', 0.70, -0.15),
    'strings': pitched('phasepad', 0.3, 0.15, fade=0.06, transpose=12),
    'vocals': pitched('acidlead', 0.85),
    'drums/kick': hit('psykick', 1.2),
    'drums/snare': hit('snare', 1.3),
    'drums/hihat': hit('hat', 1.6, 0.2),
    'drums/openhat': hit('openhat', 1.3, 0.2),
    'drums/tom': hit('tom', 1.1),
    'drums/crash': hit('crash', 0.8, -0.4),
    'drums/ride': hit('openhat', 1.1, 0.42, maxDur=0.14),
}
