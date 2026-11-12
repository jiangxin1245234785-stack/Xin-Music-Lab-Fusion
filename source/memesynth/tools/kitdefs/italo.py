"""Italo disco / Eurobeat — sequenced bass, a square-wave lead that sings, and a cowbell.

Italo was made by people with one polysynth, one sequencer and a drum machine, and it
sounds like it: a bass that is all attack, a lead that is a plain square wave given life
by nothing but vibrato, bright octave-doubled chords, and electronic toms that fall in
pitch like a dropped ball. Eurobeat is the same recipe played faster and harder.
"""
import numpy as np

from drumkit import clap, cowbell, crash, hat, hit, kick, pitched, tom
from synth import (SUSTAIN, attack, decay, detuned, normalise, pulse, pwm, reverb, saw, seconds, svf, vibrato)

rng = np.random.default_rng(1983)
ROOT = 220.0


def bass(length=SUSTAIN['bass']):
    t = seconds(length)
    voice = svf(saw(110.0, length) + 0.8 * pulse(110.0, length, 0.5), 250.0 + 3200.0 * np.exp(-14.0 * t), 1.4, 'low')
    return normalise(voice * attack(length, 900.0) * decay(length, 2.0))


def chords(length=SUSTAIN['piano']):
    """Saws with the octave above almost as loud, and a quarter-width pulse for the edge."""
    t = seconds(length)
    voice = detuned(rng, ROOT, length, (-5, 5)) + 0.8 * saw(ROOT * 2, length) + 0.5 * pulse(ROOT, length, 0.25)
    cutoff = 1500.0 + 4000.0 * np.exp(-3.0 * t)
    return normalise(svf(voice, cutoff, 1.0, 'low') * attack(length, 500.0) * decay(length, 0.7))


def sequence(length=SUSTAIN['guitar']):
    t = seconds(length)
    voice = svf(pulse(ROOT, length, 0.2), 500.0 + 4500.0 * np.exp(-18.0 * t), 2.5, 'low')
    return normalise(voice * attack(length, 900.0) * decay(length, 4.0))


def strings(length=SUSTAIN['strings']):
    voice = svf(detuned(rng, ROOT, length, (-11, -4, 4, 11)), 300.0, 0.8, 'high')
    return normalise(svf(voice, 4500.0, 0.8, 'low') * attack(length, 7.0) * decay(length, 0.1))


def square_lead(length=SUSTAIN['vocals']):
    curve = vibrato(ROOT, length, rate_hz=6.0, cents=24.0, onset=0.2)
    return normalise(svf(pwm(curve, length, 0.5), 3500.0, 1.0, 'low') * attack(length, 250.0) * decay(length, 0.3))


def room_clap():
    return normalise(reverb(rng, clap(rng, 0.3, 1300.0, 30.0), length=0.6, mix=0.3, tail=0.2))


NAME = 'Italo Disco · Eurobeat'

SAMPLES = {
    'seqbass': (bass, 110.0, '音序器贝斯'),
    'octavechords': (chords, ROOT, '八度叠加和弦'),
    'seqpluck': (sequence, ROOT, '音序拨奏'),
    'strings': (strings, ROOT, '亮弦乐'),
    'squarelead': (square_lead, ROOT, '方波主音 · 颤音'),
    'kick': (lambda: kick(rng, 200.0, 60.0, 0.22, 60.0, 14.0, drive=3.0, click=0.3), 60.0, '短硬底鼓'),
    'clap': (room_clap, 1300.0, '拍手 · 带房间'),
    'hat': (lambda: hat(rng, 0.045, 130.0), 8000.0, '闭镲'),
    'openhat': (lambda: hat(rng, 0.3, 12.0), 8000.0, '开镲'),
    'simmons': (lambda: tom(420.0, 100.0, 0.5, 9.0, 7.0), 100.0, '电子嗵鼓 · 音高下坠'),
    'crash': (lambda: crash(rng, 1.8, 2.3), 5500.0, '吊镲'),
    'cowbell': (cowbell, 540.0, '牛铃'),
}

VOICES = {
    'bass': pitched('seqbass', 2.23, fade=0.008),
    'guitar': pitched('seqpluck', 1.05, 0.28, fade=0.008),
    'piano': pitched('octavechords', 0.6, -0.15),
    'strings': pitched('strings', 0.39, 0.15, fade=0.05, transpose=12),
    'vocals': pitched('squarelead', 0.85),
    'drums/kick': hit('kick', 1.2),
    'drums/snare': hit('clap', 1.3),
    'drums/hihat': hit('hat', 1.6, 0.2),
    'drums/openhat': hit('openhat', 1.2, 0.2),
    'drums/tom': hit('simmons', 1.1),
    'drums/crash': hit('crash', 0.8, -0.4),
    'drums/ride': hit('cowbell', 0.8, 0.42),
}
