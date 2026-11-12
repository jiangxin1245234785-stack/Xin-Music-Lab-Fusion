"""Synthwave — the 1980s as remembered: a Juno bass, poly brass, and a gated snare.

Three things carry the style and none of them is a waveform. The bass filter snaps shut
within a tenth of a second, so every note is a thump with a tail. The brass opens fast
and falls slowly, which is what makes a chord sound like a stab rather than an organ.
And the snare has a room on it that is cut off dead after a quarter of a second: the
gated reverb. Take the gate away and it is just a snare in a hall.
"""
import numpy as np

from synth import (SUSTAIN, attack, decay, detuned, noise, normalise, pulse, reverb, saw, saw_curve,
                   seconds, svf, swept_sine, vibrato)

rng = np.random.default_rng(1984)
ROOT = 220.0


def juno_bass(length=SUSTAIN['bass']):
    t = seconds(length)
    voice = saw(110.0, length) + 0.6 * pulse(110.0, length, 0.5)
    voice = svf(voice, 180.0 + 2600.0 * np.exp(-9.0 * t), 1.6, 'low')
    return normalise(np.tanh(voice * 1.2) * attack(length, 400.0) * decay(length, 0.5))


def brass(length=SUSTAIN['piano']):
    """Three saws, a filter that opens in 20 ms and closes over a second."""
    t = seconds(length)
    voice = detuned(rng, ROOT, length, (-7, 0, 7))
    cutoff = 420.0 + 3600.0 * (1.0 - np.exp(-60.0 * t)) * np.exp(-2.5 * t)
    return normalise(svf(voice, cutoff, 1.2, 'low') * attack(length, 300.0) * decay(length, 0.55))


def arp(length=SUSTAIN['guitar']):
    t = seconds(length)
    voice = pulse(ROOT, length, 0.25) + 0.5 * saw(ROOT, length)
    voice = svf(voice, 300.0 + 5000.0 * np.exp(-14.0 * t), 2.0, 'low')
    return normalise(voice * attack(length, 600.0) * decay(length, 2.6))


def pad(length=SUSTAIN['strings']):
    t = seconds(length)
    voice = detuned(rng, ROOT, length, (-11, -4, 4, 11))
    voice = svf(voice, 900.0 + 1600.0 * (1.0 - np.exp(-1.2 * t)), 1.0, 'low')
    return normalise(voice * attack(length, 3.0) * decay(length, 0.12))


def lead(length=SUSTAIN['vocals']):
    """A saw with a late vibrato: the solo over the sunset."""
    curve = vibrato(ROOT, length, rate_hz=5.5, cents=18.0, onset=0.25)
    voice = saw_curve(curve, harmonics=40) + 0.4 * pulse(ROOT, length, 0.5)
    voice = svf(voice, 2600.0, 1.4, 'low')
    return normalise(voice * attack(length, 160.0) * decay(length, 0.35))


def kick():
    body = swept_sine(160.0, 52.0, 0.4, 45.0) * decay(0.4, 9.0)
    return normalise(np.tanh(body * 1.5) + noise(rng, 0.4) * decay(0.4, 700.0) * 0.2)


def gated_snare():
    t = seconds(0.3)
    shell = (np.sin(2 * np.pi * 185 * t) + 0.6 * np.sin(2 * np.pi * 330 * t)) * decay(0.3, 22.0)
    wires = svf(noise(rng, 0.3), 1200.0, 0.7, 'high') * decay(0.3, 9.0)
    wet = reverb(rng, 0.5 * shell + 0.9 * wires, length=0.9, mix=0.55, tail=0.2)
    gate = np.exp(-90.0 * np.maximum(0.0, seconds(0.5) - 0.26))
    return normalise(wet * gate)


def hat(length, rate):
    return normalise(svf(noise(rng, length), 8000.0, 0.9, 'high') * decay(length, rate))


def simmons_tom():
    body = swept_sine(260.0, 110.0, 0.5, 14.0) * decay(0.5, 7.0)
    return normalise(body + noise(rng, 0.5) * decay(0.5, 90.0) * 0.2)


def crash():
    wash = svf(noise(rng, 1.6), 4800.0, 0.75, 'high') * decay(1.6, 2.6)
    return normalise(reverb(rng, wash, length=1.2, mix=0.3))


NAME = '合成器浪潮 · 80 年代'

SAMPLES = {
    'junobass': (juno_bass, 110.0, 'Juno 式贝斯 · 滤波器快关'),
    'brass': (brass, ROOT, '复音铜管 · 三锯齿'),
    'arp': (arp, ROOT, '琶音拨奏'),
    'pad': (pad, ROOT, '宽垫'),
    'lead': (lead, ROOT, '锯齿主音 · 晚颤音'),
    'kick': (kick, 52.0, '底鼓'),
    'gatedsnare': (gated_snare, 185.0, '门限混响军鼓'),
    'hat': (lambda: hat(0.05, 110.0), 8000.0, '闭镲'),
    'openhat': (lambda: hat(0.3, 13.0), 8000.0, '开镲'),
    'tom': (simmons_tom, 110.0, '电子嗵鼓'),
    'crash': (crash, 4800.0, '吊镲'),
}

VOICES = {
    'bass': {'sample': 'junobass', 'gain': 1.0, 'follow': 'note', 'fade': 0.008},
    'guitar': {'sample': 'arp', 'gain': 0.5, 'pan': 0.28, 'follow': 'note', 'fade': 0.008},
    'guitar/distorted electric guitar': {'sample': 'lead', 'gain': 0.42, 'pan': -0.3, 'follow': 'note', 'fade': 0.008},
    'piano': {'sample': 'brass', 'gain': 0.75, 'pan': -0.15, 'follow': 'note', 'fade': 0.012},
    'strings': {'sample': 'pad', 'transpose': 12, 'gain': 0.3, 'pan': 0.15, 'follow': 'note', 'fade': 0.05},
    'vocals': {'sample': 'lead', 'gain': 0.9, 'pan': 0.0, 'follow': 'note', 'fade': 0.01},
    'drums/kick': {'sample': 'kick', 'pitched': False, 'follow': 'sample', 'gain': 1.0},
    'drums/snare': {'sample': 'gatedsnare', 'pitched': False, 'follow': 'sample', 'gain': 1.1},
    'drums/hihat': {'sample': 'hat', 'pitched': False, 'follow': 'sample', 'gain': 1.6, 'pan': 0.2},
    'drums/openhat': {'sample': 'openhat', 'pitched': False, 'follow': 'sample', 'gain': 1.5, 'pan': 0.2},
    'drums/tom': {'sample': 'tom', 'pitched': False, 'follow': 'sample', 'gain': 1.3},
    'drums/crash': {'sample': 'crash', 'pitched': False, 'follow': 'sample', 'gain': 0.9, 'pan': -0.4},
    'drums/ride': {'sample': 'openhat', 'pitched': False, 'follow': 'sample', 'maxDur': 0.16, 'gain': 1.3, 'pan': 0.42},
}
