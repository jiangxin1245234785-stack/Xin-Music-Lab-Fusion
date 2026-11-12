"""Bowed strings, brass, harp and timpani — the one kit with a slow attack.

Every other kit in this library starts a note with a transient. A bowed string does not:
it takes 100 ms or more to speak, and the vibrato only arrives after the note has settled.
That changes what the same arrangement feels like more than the timbre does, which is why
this kit is worth having even though its oscillators are nothing exotic.

Vibrato is applied as a pitch curve rather than as tremolo, because the ear reads the two
completely differently — wobbling the level sounds like a broken amplifier, wobbling the
pitch sounds like a player.
"""
import numpy as np

from synth import (RATE, SUSTAIN, attack, decay, karplus, noise, normalise, partials,
                   saw_curve, seconds, svf, swept_sine, vibrato)

rng = np.random.default_rng(1824)
ROOT = 220.0


def bowed(length=SUSTAIN['strings'], cutoff=2400.0, cents=22.0, bow=7.0):
    """Sawtooth under a fixed lowpass, on a vibrato pitch curve, opened slowly."""
    voice = saw_curve(vibrato(ROOT, length, rate_hz=5.2, cents=cents, onset=0.3), harmonics=30)
    voice = svf(voice, cutoff, 1.0, 'low')
    # A hair of bow noise at the start: the rosin catching before the tone settles.
    voice += svf(noise(rng, length), 3000.0, 0.9, 'high') * decay(length, 26.0) * 0.08
    return normalise(voice * attack(length, bow) * decay(length, 0.1))


def contrabass(length=SUSTAIN['bass']):
    voice = saw_curve(vibrato(55.0, length, rate_hz=4.4, cents=14.0, onset=0.35), harmonics=40)
    voice = svf(voice, 900.0, 1.1, 'low')
    return normalise(voice * attack(length, 11.0) * decay(length, 0.12))


def brass(length=SUSTAIN['vocals']):
    """Brass bites as it gets loud: the filter opens with the envelope, not before it."""
    t = seconds(length)
    swell = 1.0 - np.exp(-9.0 * t)
    voice = saw_curve(vibrato(ROOT, length, rate_hz=5.6, cents=16.0, onset=0.4), harmonics=36)
    voice = svf(voice, 600.0 + 2600.0 * swell, 1.4, 'low')
    return normalise(np.tanh(voice * 1.5) * swell * decay(length, 0.2))


def harp(length=SUSTAIN['piano']):
    return normalise(karplus(rng, ROOT, length, damping=0.9987, brightness=0.4))


def pizzicato(length=SUSTAIN['guitar']):
    """Plucked rather than bowed, so the guitar part keeps its rhythm."""
    return normalise(karplus(rng, ROOT, length, damping=0.9955, brightness=0.3))


def timpani(start=130.0, end=88.0, length=1.1):
    """A tuned drum: the pitch drop is small, which is what separates it from a tom."""
    body = swept_sine(start, end, length, 22.0) * decay(length, 3.2)
    body += 0.3 * partials(end, [(2.0, 0.4, 4.0), (3.0, 0.2, 5.5)], length)
    return normalise(body + noise(rng, length) * decay(length, 260.0) * 0.12)


def orch_snare():
    """Tighter and drier than a kit snare, with the wires much louder than the shell."""
    t = seconds(0.22)
    shell = np.sin(2 * np.pi * 240 * t) * decay(0.22, 40.0)
    wires = svf(noise(rng, 0.22), 3600.0, 0.8, 'high') * decay(0.22, 24.0)
    return normalise(0.25 * shell + 1.0 * wires)


def suspended(length=2.0):
    return normalise(svf(noise(rng, length), 4200.0, 0.7, 'high') * attack(length, 24.0) * decay(length, 2.1))


def triangle_hit(length=1.0):
    return normalise(partials(2637.0, [(1.0, 1.0, 2.6), (2.76, 0.55, 3.4), (5.4, 0.3, 4.6)], length))


NAME = '管弦 · 弓弦与铜管'

SAMPLES = {
    'bowed': (bowed, ROOT, '弓弦 · 持续带揉弦'),
    'bowed_bright': (lambda: bowed(SUSTAIN['guitar'], cutoff=3400.0, cents=26.0, bow=12.0), ROOT, '弓弦 · 明亮'),
    'contrabass': (contrabass, 55.0, '低音提琴 · 弓奏'),
    'brass': (brass, ROOT, '铜管 · 渐强带咬口'),
    'harp': (harp, ROOT, '竖琴'),
    'pizz': (pizzicato, ROOT, '拨奏弦乐'),
    'timpani': (timpani, 88.0, '定音鼓'),
    'timpani_hi': (lambda: timpani(178.0, 124.0, 0.9), 124.0, '定音鼓 · 高'),
    'snare_orch': (orch_snare, 1000.0, '乐队小鼓'),
    'suspended': (suspended, 4200.0, '吊镲 · 渐强'),
    'triangle': (triangle_hit, 2637.0, '三角铁'),
}

#: The bowed voices follow the score with a long fade, because an orchestral note that
#: stops dead is the giveaway. Percussion follows its own sample: a timpani roll is the
#: drum's decay, not the notated length.
VOICES = {
    'bass': {'sample': 'contrabass', 'gain': 1.0, 'follow': 'note', 'fade': 0.04},
    'guitar': {'sample': 'pizz', 'gain': 0.55, 'pan': 0.28, 'follow': 'sample', 'maxDur': 2.4},
    'guitar/distorted electric guitar': {'sample': 'brass', 'gain': 0.42, 'pan': -0.3, 'follow': 'note', 'fade': 0.03},
    'piano': {'sample': 'harp', 'gain': 0.6, 'pan': -0.18, 'follow': 'sample', 'maxDur': 4.5},
    'strings': {'sample': 'bowed', 'transpose': 12, 'gain': 0.34, 'pan': 0.15, 'follow': 'note', 'fade': 0.06},
    'vocals': {'sample': 'brass', 'gain': 0.9, 'pan': 0.0, 'follow': 'note', 'fade': 0.03},
    'drums/kick': {'sample': 'timpani', 'pitched': False, 'follow': 'sample', 'gain': 1.1},
    'drums/snare': {'sample': 'snare_orch', 'pitched': False, 'follow': 'sample', 'gain': 1.6},
    'drums/hihat': {'sample': 'triangle', 'pitched': False, 'follow': 'sample', 'maxDur': 0.1, 'gain': 1.3, 'pan': 0.22},
    'drums/openhat': {'sample': 'triangle', 'pitched': False, 'follow': 'sample', 'maxDur': 0.45, 'gain': 1.1, 'pan': 0.22},
    'drums/tom': {'sample': 'timpani_hi', 'pitched': False, 'follow': 'sample', 'gain': 1.1},
    'drums/crash': {'sample': 'suspended', 'pitched': False, 'follow': 'sample', 'gain': 0.85, 'pan': -0.4},
    'drums/ride': {'sample': 'triangle', 'pitched': False, 'follow': 'sample', 'maxDur': 0.3, 'gain': 1.0, 'pan': 0.42},
}
