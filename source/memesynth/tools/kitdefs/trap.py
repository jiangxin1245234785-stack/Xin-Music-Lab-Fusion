"""Trap — the 808 as a bass instrument, dark keys, and hats made of metal.

The 808 kick was a failure as a drum and a success as a bass: a sine that rings for
seconds, overdriven until it grows the odd harmonics a phone speaker can reproduce. So
the bass here is that kick, held and played by the score; the kick proper is its short
sibling. The hats are the 808's own recipe, six square waves at fixed inharmonic pitches
through a high-pass, which is why they sound like metal and not like air.
"""
import numpy as np

from synth import (SUSTAIN, attack, decay, detuned, fm, noise, normalise, partials, phase, pulse, seconds, svf,
                   swept_sine, triangle, vibrato)

rng = np.random.default_rng(808)
ROOT = 220.0
METAL = (205.3, 304.4, 369.6, 522.7, 540.0, 800.0)      # the TR-808 cymbal oscillators


def sub(length=SUSTAIN['bass']):
    """A sine with a 50 ms downward glide into the note, driven hard, ringing for seconds."""
    t = seconds(length)
    voice = phase(55.0 * (1.0 + 0.5 * np.exp(-60.0 * t)))
    return normalise(np.tanh(voice * 2.2) * attack(length, 900.0) * decay(length, 0.9, hold=0.15))


def keys(length=SUSTAIN['piano']):
    """A dark bell: the octave louder than the fundamental, and a second copy nine cents
    sharp so that every held chord slowly beats. Partials die from the top down."""
    voice = partials(ROOT, [(1, 0.6, 1.0), (2, 1.0, 1.8), (3, 0.5, 3.0), (4, 0.35, 4.5), (5, 0.2, 6.0),
                            (1.0052, 0.5, 1.0), (2.0104, 0.7, 1.8)], length)
    voice += 0.3 * fm(ROOT, 4.0, 1.5, length, index_decay=20.0) * decay(length, 6.0)
    return normalise(svf(voice, 3000.0, 0.8, 'low') * attack(length, 500.0))


def pluck(length=SUSTAIN['guitar']):
    voice = triangle(ROOT, length) * decay(length, 5.0)
    voice += 0.5 * fm(ROOT, 2.0, 2.0, length, index_decay=25.0) * decay(length, 9.0)
    return normalise(voice * attack(length, 700.0))


def pad(length=SUSTAIN['strings']):
    t = seconds(length)
    voice = svf(detuned(rng, ROOT, length, (-8, 0, 8)), 650.0 + 500.0 * (1.0 - np.exp(-t)), 1.0, 'low')
    return normalise(voice * attack(length, 2.5) * decay(length, 0.15))


def whistle(length=SUSTAIN['vocals']):
    """Nearly a sine, with a late vibrato: the flute-ish lead that sits over the 808."""
    curve = vibrato(ROOT, length, rate_hz=5.0, cents=14.0, onset=0.3)
    voice = phase(curve) + 0.25 * phase(curve * 2) + 0.12 * phase(curve * 3)
    return normalise(voice * attack(length, 60.0) * decay(length, 0.3))


def kick():
    return normalise(np.tanh(swept_sine(130.0, 50.0, 0.5, 35.0) * decay(0.5, 6.5) * 1.8))


def snare():
    t = seconds(0.3)
    shell = (np.sin(2 * np.pi * 180 * t) + 0.6 * np.sin(2 * np.pi * 330 * t)) * decay(0.3, 18.0)
    wires = svf(noise(rng, 0.3), 1800.0, 0.7, 'high') * decay(0.3, 14.0)
    slap = svf(noise(rng, 0.3), 1300.0, 1.5, 'band') * decay(0.3, 30.0)
    return normalise(0.5 * shell + 0.8 * wires + 0.5 * slap)


def metal(length):
    return sum(pulse(frequency, length, 0.5) for frequency in METAL)


def hat(length, rate):
    return normalise(svf(metal(length), 7000.0, 1.0, 'high') * decay(length, rate))


def tom():
    return normalise(swept_sine(150.0, 100.0, 0.5, 18.0) * decay(0.5, 6.0))


def crash():
    wash = 0.5 * svf(metal(1.6), 5000.0, 1.0, 'high') + svf(noise(rng, 1.6), 6000.0, 0.75, 'high')
    return normalise(wash * decay(1.6, 2.4))


NAME = 'Trap · 808'

SAMPLES = {
    'sub808': (sub, 55.0, '808 低音 · 过载正弦'),
    'darkkeys': (keys, ROOT, '暗色钟琴'),
    'pluck': (pluck, ROOT, '三角波拨奏'),
    'darkpad': (pad, ROOT, '暗垫'),
    'whistle': (whistle, ROOT, '哨音主音'),
    'kick808': (kick, 50.0, '808 底鼓'),
    'snare808': (snare, 180.0, '808 军鼓 + 拍手'),
    'hat808': (lambda: hat(0.04, 140.0), 7000.0, '金属闭镲'),
    'openhat808': (lambda: hat(0.35, 10.0), 7000.0, '金属开镲'),
    'tom808': (tom, 100.0, '808 嗵鼓'),
    'crash808': (crash, 5000.0, '808 吊镲'),
}

VOICES = {
    'bass': {'sample': 'sub808', 'gain': 1.1, 'follow': 'note', 'fade': 0.012},
    'guitar': {'sample': 'pluck', 'gain': 0.5, 'pan': 0.28, 'follow': 'note', 'fade': 0.008},
    'guitar/distorted electric guitar': {'sample': 'whistle', 'gain': 0.4, 'pan': -0.3, 'follow': 'note', 'fade': 0.008},
    'piano': {'sample': 'darkkeys', 'gain': 0.85, 'pan': -0.15, 'follow': 'note', 'fade': 0.01},
    'strings': {'sample': 'darkpad', 'transpose': 12, 'gain': 0.3, 'pan': 0.15, 'follow': 'note', 'fade': 0.05},
    'vocals': {'sample': 'whistle', 'gain': 0.9, 'pan': 0.0, 'follow': 'note', 'fade': 0.012},
    'drums/kick': {'sample': 'kick808', 'pitched': False, 'follow': 'sample', 'gain': 1.0},
    'drums/snare': {'sample': 'snare808', 'pitched': False, 'follow': 'sample', 'gain': 1.1},
    'drums/hihat': {'sample': 'hat808', 'pitched': False, 'follow': 'sample', 'gain': 1.4, 'pan': 0.2},
    'drums/openhat': {'sample': 'openhat808', 'pitched': False, 'follow': 'sample', 'gain': 1.0, 'pan': 0.2},
    'drums/tom': {'sample': 'tom808', 'pitched': False, 'follow': 'sample', 'gain': 1.0},
    'drums/crash': {'sample': 'crash808', 'pitched': False, 'follow': 'sample', 'gain': 0.7, 'pan': -0.4},
    'drums/ride': {'sample': 'openhat808', 'pitched': False, 'follow': 'sample', 'maxDur': 0.16, 'gain': 0.9, 'pan': 0.42},
}
