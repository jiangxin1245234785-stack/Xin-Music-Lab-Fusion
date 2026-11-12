"""Supersaw — trance and big-room EDM: seven saws per note and a 909 underneath.

The JP-8000 put seven sawtooth oscillators behind one key, spread unevenly around the
centre pitch. Evenly spaced detune beats at one rate and sounds like a chorus pedal;
uneven spacing never lines up again, and that is the wall. Everything pitched in this
kit is that stack with a different filter envelope in front of it.
"""
import numpy as np

from synth import SUSTAIN, attack, decay, detuned, noise, normalise, saw, seconds, sine, svf, swept_sine

rng = np.random.default_rng(1999)
ROOT = 220.0
SPREAD = (-23, -14, -6, 0, 6, 14, 23)


def bass(length=SUSTAIN['bass']):
    t = seconds(length)
    voice = detuned(rng, 110.0, length, (-6, 0, 6)) + 0.8 * sine(110.0, length)
    voice = svf(voice, 220.0 + 1800.0 * np.exp(-7.0 * t), 1.3, 'low')
    return normalise(np.tanh(voice * 1.3) * attack(length, 400.0) * decay(length, 0.6))


def keys(length=SUSTAIN['piano']):
    """The chord stab: full stack, filter falling over a fifth of a second."""
    t = seconds(length)
    voice = svf(detuned(rng, ROOT, length, SPREAD), 700.0 + 6000.0 * np.exp(-5.0 * t), 0.9, 'low')
    return normalise(voice * attack(length, 400.0) * decay(length, 0.7))


def pluck(length=SUSTAIN['guitar']):
    t = seconds(length)
    voice = svf(detuned(rng, ROOT, length, SPREAD), 500.0 + 7000.0 * np.exp(-16.0 * t), 1.1, 'low')
    return normalise(voice * attack(length, 700.0) * decay(length, 3.0))


def pad(length=SUSTAIN['strings']):
    voice = detuned(rng, ROOT, length, SPREAD) + 0.35 * detuned(rng, ROOT * 2, length, (-9, 9))
    voice = svf(voice, 5200.0, 0.8, 'low')
    return normalise(voice * attack(length, 6.0) * decay(length, 0.1))


def lead(length=SUSTAIN['vocals']):
    voice = detuned(rng, ROOT, length, (-9, -3, 3, 9)) + 0.3 * saw(ROOT * 2, length)
    voice = svf(voice, 4200.0, 1.2, 'low')
    return normalise(voice * attack(length, 220.0) * decay(length, 0.3))


def kick_909():
    body = swept_sine(220.0, 48.0, 0.45, 60.0) * decay(0.45, 8.0)
    return normalise(np.tanh(body * 2.0) + noise(rng, 0.45) * decay(0.45, 900.0) * 0.3)


def clap():
    """Three noise bursts 11 ms apart and then the room: four hands, not one."""
    t = seconds(0.35)
    bursts = sum(np.exp(-200.0 * np.maximum(0.0, t - start)) * (t >= start) * (t < start + 0.011)
                 for start in (0.0, 0.011, 0.022))
    envelope = bursts + np.exp(-28.0 * np.maximum(0.0, t - 0.033)) * (t >= 0.033)
    return normalise(svf(noise(rng, 0.35), 1200.0, 1.5, 'band') * envelope)


def hat(length, rate):
    return normalise(svf(noise(rng, length), 9000.0, 0.9, 'high') * decay(length, rate))


def tom():
    body = swept_sine(200.0, 120.0, 0.45, 20.0) * decay(0.45, 8.0)
    return normalise(body + noise(rng, 0.45) * decay(0.45, 300.0) * 0.12)


def crash():
    return normalise(svf(noise(rng, 2.0), 6000.0, 0.75, 'high') * decay(2.0, 2.0))


NAME = '超级锯齿 · Trance / EDM'

SAMPLES = {
    'sawbass': (bass, 110.0, '锯齿贝斯 + 正弦垫底'),
    'sawkeys': (keys, ROOT, '七锯齿和弦 · 滤波下行'),
    'sawpluck': (pluck, ROOT, '七锯齿拨奏'),
    'sawpad': (pad, ROOT, '七锯齿垫'),
    'sawlead': (lead, ROOT, '四锯齿主音'),
    'kick909': (kick_909, 48.0, '909 底鼓'),
    'clap': (clap, 1200.0, '拍手'),
    'hat': (lambda: hat(0.05, 120.0), 9000.0, '闭镲'),
    'openhat': (lambda: hat(0.4, 10.0), 9000.0, '开镲'),
    'tom': (tom, 120.0, '嗵鼓'),
    'crash': (crash, 6000.0, '吊镲'),
}

VOICES = {
    'bass': {'sample': 'sawbass', 'gain': 1.0, 'follow': 'note', 'fade': 0.008},
    'guitar': {'sample': 'sawpluck', 'gain': 0.5, 'pan': 0.28, 'follow': 'note', 'fade': 0.008},
    'guitar/distorted electric guitar': {'sample': 'sawlead', 'gain': 0.42, 'pan': -0.3, 'follow': 'note', 'fade': 0.008},
    'piano': {'sample': 'sawkeys', 'gain': 0.8, 'pan': -0.15, 'follow': 'note', 'fade': 0.012},
    'strings': {'sample': 'sawpad', 'transpose': 12, 'gain': 0.28, 'pan': 0.15, 'follow': 'note', 'fade': 0.05},
    'vocals': {'sample': 'sawlead', 'gain': 0.9, 'pan': 0.0, 'follow': 'note', 'fade': 0.01},
    'drums/kick': {'sample': 'kick909', 'pitched': False, 'follow': 'sample', 'gain': 1.0},
    'drums/snare': {'sample': 'clap', 'pitched': False, 'follow': 'sample', 'gain': 1.1},
    'drums/hihat': {'sample': 'hat', 'pitched': False, 'follow': 'sample', 'gain': 1.6, 'pan': 0.2},
    'drums/openhat': {'sample': 'openhat', 'pitched': False, 'follow': 'sample', 'gain': 1.5, 'pan': 0.2},
    'drums/tom': {'sample': 'tom', 'pitched': False, 'follow': 'sample', 'gain': 1.3},
    'drums/crash': {'sample': 'crash', 'pitched': False, 'follow': 'sample', 'gain': 0.9, 'pan': -0.4},
    'drums/ride': {'sample': 'openhat', 'pitched': False, 'follow': 'sample', 'maxDur': 0.16, 'gain': 1.3, 'pan': 0.42},
}
