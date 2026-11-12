"""Vaporwave — late-80s digital synths, slowed down, chorused, and left in a shopping mall.

The source material is the glossy end of the 1980s: glassy bell-pads, a rubbery FM bass, a
saxophone-ish lead, gated drums. What makes it vaporwave is the treatment. Everything is
doubled against a copy of itself that drifts a few cents either way (a slow, seasick
chorus), the top end is taken off, and it all sits in a long, cheap reverb. Bright sounds,
heard through a wall.
"""
import numpy as np

from drumkit import hit, kick, pitched, snare
from synth import (SUSTAIN, attack, decay, detuned, fm, formants, karplus, noise, normalise, partials, reverb,
                   saw_curve, seconds, svf, swept_sine, vibrato, warp)

rng = np.random.default_rng(2011)
ROOT = 220.0


def mall(audio, cutoff=2600.0, depth=9.0, room=0.3):
    """Chorus against a drifting copy, no treble, a long room."""
    t = np.arange(audio.size) / 48000.0
    drift = warp(audio, depth * np.sin(2 * np.pi * 0.35 * t + rng.uniform(0.0, 6.0)))
    return reverb(rng, svf(audio + drift, cutoff, 0.7, 'low'), length=2.2, mix=room)


def bellpad(length=SUSTAIN['piano']):
    """A struck glass on the front of a slow pad: the D-50 trick."""
    strike = partials(ROOT, [(1, 1.0, 1.5), (2, 0.4, 2.5), (4, 0.6, 3.0), (8, 0.3, 5.0), (3, 0.15, 3.0)], length)
    under = svf(detuned(rng, ROOT, length, (-7, 7)), 1200.0, 0.8, 'low') * attack(length, 3.0) * decay(length, 0.2)
    return normalise(mall(strike * attack(length, 800.0) + 0.5 * under, cutoff=3400.0))


def rubber(length=SUSTAIN['bass']):
    voice = svf(fm(110.0, 1.0, 2.5, length, index_decay=4.0), 900.0, 0.9, 'low')
    return normalise(mall(voice * attack(length, 400.0) * decay(length, 0.8), cutoff=1500.0, depth=5.0, room=0.12))


def guitar(length=SUSTAIN['guitar']):
    return normalise(mall(karplus(rng, ROOT, length, damping=0.9975, brightness=0.6), cutoff=3000.0, depth=12.0))


def pad(length=SUSTAIN['strings']):
    voice = svf(detuned(rng, ROOT, length, (-10, -3, 3, 10)), 1400.0, 0.8, 'low')
    return normalise(mall(voice * attack(length, 2.5) * decay(length, 0.1), cutoff=2000.0, room=0.4))


def sax(length=SUSTAIN['vocals']):
    source = saw_curve(vibrato(ROOT, length, rate_hz=5.0, cents=18.0, onset=0.35), harmonics=30)
    breath = svf(noise(rng, length), 2000.0, 1.0, 'band') * 0.06
    voice = formants(source, ((900.0, 1.0), (1800.0, 0.5)), 2.0) + 0.5 * svf(source, 800.0, 0.8, 'low') + breath
    return normalise(mall(voice * attack(length, 50.0) * decay(length, 0.25), cutoff=2800.0, depth=6.0))


def dull(audio, cutoff=5000.0):
    return normalise(svf(np.asarray(audio, dtype=np.float64), cutoff, 0.7, 'low'))


def gated_snare():
    wet = reverb(rng, snare(rng, 170.0, 0.3, 12.0, cutoff=1200.0, body=0.6), length=1.0, mix=0.6, tail=0.3)
    gate = np.exp(-70.0 * np.maximum(0.0, seconds(0.6) - 0.36))
    return dull(wet * gate, 4500.0)


NAME = 'Vaporwave · 商场回声'

SAMPLES = {
    'rubberbass': (rubber, 110.0, 'FM 橡皮贝斯'),
    'bellpad': (bellpad, ROOT, '玻璃钟 + 垫'),
    'chorusguitar': (guitar, ROOT, '合唱吉他'),
    'mallpad': (pad, ROOT, '商场垫'),
    'sax': (sax, ROOT, '萨克斯式主音'),
    'kick': (lambda: dull(kick(rng, 140.0, 50.0, 0.45, 30.0, 8.0, drive=1.3, click=0.15), 1500.0), 50.0, '闷底鼓'),
    'gatedsnare': (gated_snare, 170.0, '门限混响军鼓 · 放慢'),
    'hat': (lambda: dull(svf(noise(rng, 0.06), 6000.0, 0.9, 'high') * decay(0.06, 80.0)), 6000.0, '闭镲'),
    'openhat': (lambda: dull(svf(noise(rng, 0.35), 6000.0, 0.9, 'high') * decay(0.35, 10.0)), 6000.0, '开镲'),
    'tom': (lambda: dull(swept_sine(220.0, 90.0, 0.6, 10.0) * decay(0.6, 6.0), 2500.0), 90.0, '电子嗵鼓 · 放慢'),
    'crash': (lambda: dull(svf(noise(rng, 2.0), 4000.0, 0.75, 'high') * decay(2.0, 2.0), 4500.0), 4000.0, '吊镲'),
}

VOICES = {
    'bass': pitched('rubberbass', 1.44, fade=0.012),
    'guitar': pitched('chorusguitar', 1.40, 0.28, fade=0.012),
    'piano': pitched('bellpad', 0.97, -0.15, fade=0.03),
    'strings': pitched('mallpad', 0.32, 0.15, fade=0.08),
    'vocals': pitched('sax', 0.9, fade=0.03),
    'drums/kick': hit('kick', 0.78),
    'drums/snare': hit('gatedsnare', 0.78),
    'drums/hihat': hit('hat', 0.84, 0.2),
    'drums/openhat': hit('openhat', 0.65, 0.2),
    'drums/tom': hit('tom', 0.71),
    'drums/crash': hit('crash', 0.45, -0.4),
    'drums/ride': hit('openhat', 0.58, 0.42, maxDur=0.18),
}
