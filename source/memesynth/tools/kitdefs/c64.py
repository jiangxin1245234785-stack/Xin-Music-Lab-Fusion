"""Commodore 64 — the SID chip: pulse widths that never sit still, and one resonant filter.

The NES gave its pulse channels four fixed widths. The SID let the width be swept
continuously, and every composer for it did, all the time: that slow phasing is the sound
of the machine. It also had a real analogue filter, a ring modulator, and a trick for
drums: with no sample playback, a drum was a few frames of one waveform followed by a few
frames of noise, played through the 4-bit volume register.
"""
import numpy as np

from synth import (SUSTAIN, attack, crush, decay, hold, noise, normalise, pulse, pwm, seconds, svf, swept_sine,
                   triangle, vibrato)

rng = np.random.default_rng(1982)
ROOT = 220.0


def bass(length=SUSTAIN['bass']):
    t = seconds(length)
    voice = pwm(110.0, length, 0.5 - 0.35 * np.exp(-6.0 * t))
    voice = svf(voice, 300.0 + 2200.0 * np.exp(-8.0 * t), 2.5, 'low')
    return normalise(crush(voice, 8) * attack(length, 800.0) * decay(length, 0.6))


def keys(length=SUSTAIN['piano']):
    """Width swinging three times a second: the SID arpeggio chord's timbre, one note at a time."""
    t = seconds(length)
    voice = pwm(ROOT, length, 0.3 + 0.2 * np.sin(2 * np.pi * 3.1 * t))
    return normalise(voice * attack(length, 600.0) * decay(length, 1.1))


def ring(length=SUSTAIN['guitar']):
    """Triangle ring-modulated by a pulse an octave up: hollow and metallic, still in tune."""
    voice = triangle(ROOT, length) * pulse(ROOT * 2, length, 0.5)
    return normalise(voice * attack(length, 800.0) * decay(length, 2.8))


def pad(length=SUSTAIN['strings']):
    t = seconds(length)
    voice = pwm(ROOT, length, 0.25 + 0.2 * np.sin(2 * np.pi * 0.6 * t))
    voice += 0.5 * pwm(ROOT * 1.006, length, 0.25 + 0.2 * np.sin(2 * np.pi * 0.45 * t + 1.0))
    return normalise(svf(voice, 2400.0, 1.5, 'low') * attack(length, 12.0) * decay(length, 0.15))


def lead(length=SUSTAIN['vocals']):
    t = seconds(length)
    curve = vibrato(ROOT, length, rate_hz=6.0, cents=22.0, onset=0.2)
    voice = pwm(curve, length, 0.5 - 0.3 * np.exp(-3.0 * t))
    return normalise(voice * attack(length, 400.0) * decay(length, 0.3))


def digi(audio):
    """Through the 4-bit volume register, as SID drums were."""
    return normalise(crush(audio, 4))


def kick():
    body = swept_sine(300.0, 50.0, 0.25, 40.0) * decay(0.25, 12.0)
    return digi(body + hold(noise(rng, 0.25), 4) * decay(0.25, 400.0) * 0.5)


def snare():
    return digi(hold(noise(rng, 0.2), 4) * decay(0.2, 22.0) + 0.6 * pulse(180.0, 0.2, 0.5) * decay(0.2, 60.0))


def hat(length, rate):
    voice = svf(hold(noise(rng, length), 2), 6000.0, 0.9, 'high') * decay(length, rate)
    return normalise(voice - voice.mean())


def tom():
    return digi(swept_sine(400.0, 120.0, 0.3, 20.0) * decay(0.3, 9.0))


def crash():
    return digi(hold(noise(rng, 1.0), 5) * decay(1.0, 3.5))


NAME = 'Commodore 64 · SID'

SAMPLES = {
    'sidbass': (bass, 110.0, '脉宽贝斯 + 谐振滤波'),
    'sidkeys': (keys, ROOT, '脉宽摆动'),
    'sidring': (ring, ROOT, '环形调制'),
    'sidpad': (pad, ROOT, '双脉宽垫'),
    'sidlead': (lead, ROOT, '脉宽主音 · 颤音'),
    'sidkick': (kick, 50.0, '底鼓'),
    'sidsnare': (snare, 180.0, '军鼓'),
    'sidhat': (lambda: hat(0.04, 130.0), 6000.0, '闭镲'),
    'sidopen': (lambda: hat(0.25, 14.0), 6000.0, '开镲'),
    'sidtom': (tom, 120.0, '嗵鼓'),
    'sidcrash': (crash, 3000.0, '吊镲'),
}

VOICES = {
    'bass': {'sample': 'sidbass', 'gain': 1.9, 'follow': 'note', 'fade': 0.006},
    'guitar': {'sample': 'sidring', 'gain': 0.5, 'pan': 0.28, 'follow': 'note', 'fade': 0.006},
    'guitar/distorted electric guitar': {'sample': 'sidlead', 'gain': 0.38, 'pan': -0.3, 'follow': 'note', 'fade': 0.006},
    'piano': {'sample': 'sidkeys', 'gain': 0.5, 'pan': -0.15, 'follow': 'note', 'fade': 0.008},
    'strings': {'sample': 'sidpad', 'transpose': 12, 'gain': 0.28, 'pan': 0.15, 'follow': 'note', 'fade': 0.04},
    'vocals': {'sample': 'sidlead', 'gain': 0.8, 'pan': 0.0, 'follow': 'note', 'fade': 0.008},
    'drums/kick': {'sample': 'sidkick', 'pitched': False, 'follow': 'sample', 'gain': 1.5},
    'drums/snare': {'sample': 'sidsnare', 'pitched': False, 'follow': 'sample', 'gain': 1.5},
    'drums/hihat': {'sample': 'sidhat', 'pitched': False, 'follow': 'sample', 'gain': 1.9, 'pan': 0.2},
    'drums/openhat': {'sample': 'sidopen', 'pitched': False, 'follow': 'sample', 'gain': 1.5, 'pan': 0.2},
    'drums/tom': {'sample': 'sidtom', 'pitched': False, 'follow': 'sample', 'gain': 1.5},
    'drums/crash': {'sample': 'sidcrash', 'pitched': False, 'follow': 'sample', 'gain': 0.7, 'pan': -0.4},
    'drums/ride': {'sample': 'sidopen', 'pitched': False, 'follow': 'sample', 'maxDur': 0.16, 'gain': 1.0, 'pan': 0.42},
}
