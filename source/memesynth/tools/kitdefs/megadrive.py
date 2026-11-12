"""Mega Drive — the YM2612: FM pushed until it growls, and drums through an 8-bit DAC.

The same FM as a DX7, but with four operators instead of six and played by game
composers rather than session keyboardists, so the modulation is turned up: the bass
twangs like a slapped string, the "guitar" is an FM pair driven into something close to
a sawtooth and then clipped. One channel could be switched to raw 8-bit sample playback,
and that is where the drums lived, at a sample rate low enough to hear.
"""
import numpy as np

from synth import SUSTAIN, attack, crush, decay, fm, hold, noise, normalise, seconds, svf, swept_sine, vibrato, RATE

rng = np.random.default_rng(1988)
ROOT = 220.0


def bass(length=SUSTAIN['bass']):
    """High index that collapses in a fifth of a second: the twang."""
    voice = fm(110.0, 1.0, 4.5, length, index_decay=6.0) + 0.4 * fm(110.0, 3.0, 2.0, length, index_decay=14.0)
    return normalise(np.tanh(voice * 1.3) * attack(length, 600.0) * decay(length, 0.7))


def keys(length=SUSTAIN['piano']):
    body = fm(ROOT, 2.0, 2.2, length, index_decay=3.0) * decay(length, 1.0)
    edge = fm(ROOT, 5.0, 1.5, length, index_decay=12.0) * decay(length, 5.0)
    return normalise((body + 0.5 * edge) * attack(length, 600.0))


def overdrive(length=SUSTAIN['guitar']):
    """An FM pair at index 5 is nearly a saw; clip it and it is the console's rock guitar."""
    voice = fm(ROOT, 1.0, 5.0, length, index_decay=0.8) + 0.5 * fm(ROOT, 2.0, 3.0, length, index_decay=1.5)
    return normalise(np.tanh(voice * 2.5) * attack(length, 500.0) * decay(length, 1.2))


def strings(length=SUSTAIN['strings']):
    voice = fm(ROOT, 1.0, 1.8, length) + fm(ROOT * 1.004, 1.0, 1.8, length) + 0.3 * fm(ROOT * 2 * 0.997, 1.0, 1.0, length)
    return normalise(voice * attack(length, 10.0) * decay(length, 0.12))


def lead(length=SUSTAIN['vocals']):
    angle = 2 * np.pi * np.cumsum(vibrato(ROOT, length, rate_hz=5.8, cents=20.0, onset=0.25)) / RATE
    voice = np.sin(angle + 1.6 * np.sin(2 * angle))
    return normalise(voice * attack(length, 300.0) * decay(length, 0.3))


def dac(audio):
    """The sample channel: a quarter of the sample rate, eight bits."""
    return normalise(crush(hold(audio, 4), 8))


def kick():
    return dac(swept_sine(180.0, 50.0, 0.3, 40.0) * decay(0.3, 10.0))


def snare():
    t = seconds(0.25)
    return dac(noise(rng, 0.25) * decay(0.25, 18.0) + 0.6 * np.sin(2 * np.pi * 190 * t) * decay(0.25, 30.0))


def hat(length, rate):
    voice = svf(hold(noise(rng, length), 3), 6000.0, 0.9, 'high') * decay(length, rate)
    return normalise(voice - voice.mean())


def tom():
    return dac(swept_sine(260.0, 120.0, 0.4, 18.0) * decay(0.4, 8.0))


def crash():
    return dac(noise(rng, 1.2) * decay(1.2, 3.0))


NAME = 'Mega Drive · YM2612'

SAMPLES = {
    'twang': (bass, 110.0, 'FM 贝斯 · 弹拨感'),
    'mdkeys': (keys, ROOT, 'FM 键盘'),
    'overdrive': (overdrive, ROOT, 'FM 失真吉他'),
    'mdstrings': (strings, ROOT, 'FM 弦乐'),
    'mdlead': (lead, ROOT, 'FM 主音 · 颤音'),
    'dackick': (kick, 50.0, 'DAC 底鼓'),
    'dacsnare': (snare, 190.0, 'DAC 军鼓'),
    'psghat': (lambda: hat(0.05, 110.0), 6000.0, '噪声闭镲'),
    'psgopen': (lambda: hat(0.3, 12.0), 6000.0, '噪声开镲'),
    'dactom': (tom, 120.0, 'DAC 嗵鼓'),
    'daccrash': (crash, 3000.0, 'DAC 吊镲'),
}

VOICES = {
    'bass': {'sample': 'twang', 'gain': 1.0, 'follow': 'note', 'fade': 0.008},
    'guitar': {'sample': 'overdrive', 'gain': 0.42, 'pan': 0.28, 'follow': 'note', 'fade': 0.008},
    'piano': {'sample': 'mdkeys', 'gain': 0.65, 'pan': -0.15, 'follow': 'note', 'fade': 0.01},
    'strings': {'sample': 'mdstrings', 'transpose': 12, 'gain': 0.3, 'pan': 0.15, 'follow': 'note', 'fade': 0.05},
    'vocals': {'sample': 'mdlead', 'gain': 0.9, 'pan': 0.0, 'follow': 'note', 'fade': 0.01},
    'drums/kick': {'sample': 'dackick', 'pitched': False, 'follow': 'sample', 'gain': 1.1},
    'drums/snare': {'sample': 'dacsnare', 'pitched': False, 'follow': 'sample', 'gain': 1.2},
    'drums/hihat': {'sample': 'psghat', 'pitched': False, 'follow': 'sample', 'gain': 1.5, 'pan': 0.2},
    'drums/openhat': {'sample': 'psgopen', 'pitched': False, 'follow': 'sample', 'gain': 1.2, 'pan': 0.2},
    'drums/tom': {'sample': 'dactom', 'pitched': False, 'follow': 'sample', 'gain': 1.1},
    'drums/crash': {'sample': 'daccrash', 'pitched': False, 'follow': 'sample', 'gain': 0.7, 'pan': -0.4},
    'drums/ride': {'sample': 'psgopen', 'pitched': False, 'follow': 'sample', 'maxDur': 0.16, 'gain': 1.1, 'pan': 0.42},
}
