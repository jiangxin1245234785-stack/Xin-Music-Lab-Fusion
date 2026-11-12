"""Plucked strings by physical model — nylon, steel, koto, harp and an upright bass.

Karplus-Strong: fill a delay line one period long with noise and damp it a little on
every pass. It costs nothing and it gives the one thing oscillators cannot fake, a real
pluck transient followed by harmonics that die at different rates.

This is the kit that stays closest to the original arrangement. Everything else in the
library replaces the performance; this one mostly replaces the instruments, so a listener
can still follow what the song was doing. That makes it the useful control: if a swap
sounds wrong here, the problem is in the transcription, not in the timbre.
"""
import numpy as np

from synth import RATE, SUSTAIN, decay, karplus, noise, normalise, seconds, svf

rng = np.random.default_rng(6)
ROOT = 220.0
LOW = 110.0


def string(frequency, length, damping, brightness, pick=0.0):
    """One plucked string, optionally with pick noise on top of the attack."""
    voice = karplus(rng, frequency, length, damping=damping, brightness=brightness)
    if pick:
        voice = voice + pick * noise(rng, length) * decay(length, 700.0)
    return normalise(voice)


def koto(length=SUSTAIN['guitar']):
    """Brighter and buzzier than a guitar: the bridge lets the string rattle."""
    voice = karplus(rng, ROOT, length, damping=0.9965, brightness=0.72)
    voice = voice + 0.12 * np.tanh(voice * 6.0) * decay(length, 9.0)
    return normalise(voice)


def body_hit():
    """A knock on the soundboard — the kick of an instrument that has no drums."""
    t = seconds(0.26)
    body = np.sin(2 * np.pi * (82.0 + 70.0 * np.exp(-40.0 * t)) * t) * decay(0.26, 19.0)
    knock = svf(noise(rng, 0.26), 320.0, 1.3, 'low') * decay(0.26, 95.0)
    return normalise(body + 0.6 * knock)


def brush(length, decay_rate, cutoff):
    return normalise(svf(noise(rng, length), cutoff, 0.85, 'high') * decay(length, decay_rate))


def woodblock(frequency=760.0, length=0.2):
    t = seconds(length)
    voice = np.sin(2 * np.pi * frequency * t) * decay(length, 38.0)
    voice += 0.45 * np.sin(2 * np.pi * frequency * 1.47 * t) * decay(length, 55.0)
    return normalise(voice + noise(rng, length) * decay(length, 480.0) * 0.3)


def string_cymbal(length=1.3):
    """A bowed-up shimmer rather than a crash, so it belongs with the strings."""
    return normalise(svf(noise(rng, length), 5200.0, 0.9, 'high') * decay(length, 3.8))


NAME = '拨弦物理建模'

SAMPLES = {
    'nylon': (lambda: string(ROOT, SUSTAIN['guitar'], 0.9940, 0.25), ROOT, '尼龙弦 · 软'),
    'steel': (lambda: string(ROOT, SUSTAIN['guitar'], 0.9972, 0.80, pick=0.18), ROOT, '钢弦 · 带拨片噪声'),
    'harp': (lambda: string(ROOT, SUSTAIN['strings'], 0.9986, 0.35), ROOT, '竖琴 · 长余音'),
    'koto': (koto, ROOT, '筝 · 带余振'),
    'upright': (lambda: string(LOW / 2, SUSTAIN['bass'], 0.9930, 0.18), LOW / 2, '低音提琴 · 拨奏'),
    'body': (body_hit, 82.0, '琴箱敲击'),
    'brush_snare': (lambda: brush(0.24, 15.0, 2600.0), 1000.0, '刷扫军鼓'),
    'brush_hat': (lambda: brush(0.05, 140.0, 7000.0), 8000.0, '闭镲'),
    'brush_open': (lambda: brush(0.28, 13.0, 6200.0), 8000.0, '开镲'),
    'woodblock': (woodblock, 760.0, '木块'),
    'shimmer': (string_cymbal, 5200.0, '弦噪吊镲'),
}

#: Three different strings for the three melodic parts, because the whole point of a
#: physical model is that you can tell a nylon string from a steel one. The guitar keeps
#: its sub-routes separate so a distorted part becomes the steel string rather than
#: collapsing into the same nylon as everything else.
VOICES = {
    'bass': {'sample': 'upright', 'gain': 1.0, 'follow': 'note', 'fade': 0.006},
    'guitar': {'sample': 'nylon', 'gain': 0.6, 'pan': 0.25, 'follow': 'sample', 'maxDur': 2.4},
    'guitar/distorted electric guitar': {'sample': 'steel', 'gain': 0.55, 'pan': -0.3, 'follow': 'sample', 'maxDur': 2.4},
    'guitar/acoustic guitar': {'sample': 'nylon', 'gain': 0.6, 'pan': 0.25, 'follow': 'sample', 'maxDur': 2.4},
    'piano': {'sample': 'harp', 'gain': 0.6, 'pan': -0.2, 'follow': 'sample', 'maxDur': 3.8},
    'strings': {'sample': 'koto', 'transpose': 12, 'gain': 0.34, 'pan': 0.18, 'follow': 'sample', 'maxDur': 2.4},
    'vocals': {'sample': 'steel', 'gain': 1.0, 'pan': 0.0, 'follow': 'sample', 'maxDur': 2.4},
    'drums/kick': {'sample': 'body', 'pitched': False, 'follow': 'sample', 'gain': 1.35},
    'drums/snare': {'sample': 'brush_snare', 'pitched': False, 'follow': 'sample', 'gain': 1.7},
    'drums/hihat': {'sample': 'brush_hat', 'pitched': False, 'follow': 'sample', 'gain': 2.2, 'pan': 0.2},
    'drums/openhat': {'sample': 'brush_open', 'pitched': False, 'follow': 'sample', 'gain': 1.5, 'pan': 0.2},
    'drums/tom': {'sample': 'woodblock', 'pitched': False, 'follow': 'sample', 'gain': 1.2},
    'drums/crash': {'sample': 'shimmer', 'pitched': False, 'follow': 'sample', 'gain': 0.8, 'pan': -0.4},
    'drums/ride': {'sample': 'shimmer', 'pitched': False, 'follow': 'sample', 'maxDur': 0.18, 'gain': 1.2, 'pan': 0.42},
}
