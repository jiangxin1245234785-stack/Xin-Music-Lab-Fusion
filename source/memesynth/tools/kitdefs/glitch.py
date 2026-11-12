"""Glitch — a machine failing in time: few bits, stepped controls, retriggered envelopes.

Every sound here is broken in one of three ways. Too few bits (`crush`), so a smooth wave
becomes a staircase. A control that jumps instead of moving (`steps`): a filter or a pulse
width that takes a new random value every few hundredths of a second. Or an envelope
that keeps starting again (`retrigger`), a buffer stuck on its first few milliseconds.

What is never broken is the period of the waveform, so the notes stay the notes: this is
the score played by damaged hardware, not noise.
"""
import numpy as np

from synth import (RATE, SUSTAIN, attack, crush, decay, detuned, fm, hold, noise, normalise, pulse, seconds, svf,
                   swept_sine)

rng = np.random.default_rng(404)
ROOT = 220.0


def steps(length, every, values):
    """A control that holds one of `values`, picked at random, for `every` seconds at a time."""
    count = int(length * RATE)
    picks = rng.choice(np.asarray(values, dtype=np.float64), size=count // int(every * RATE) + 1)
    return np.repeat(picks, int(every * RATE))[:count]


def retrigger(length, rate_hz, sharpness):
    """An envelope that restarts `rate_hz` times a second."""
    return np.exp(-sharpness * ((seconds(length) * rate_hz) % 1.0) / rate_hz)


def bass(length=SUSTAIN['bass']):
    voice = svf(pulse(110.0, length, 0.3), 1400.0, 1.2, 'low')
    return normalise(crush(voice, 3) * attack(length, 800.0) * decay(length, 0.5))


def keys(length=SUSTAIN['piano']):
    """An FM pair whose depth jumps twenty times a second and settles as the note dies."""
    t = seconds(length)
    depth = steps(length, 0.05, (0.4, 1.0, 1.8, 2.6, 3.6)) * np.exp(-1.5 * t) + 0.3
    voice = np.sin(2 * np.pi * ROOT * t + depth * np.sin(2 * np.pi * ROOT * 2.0 * t))
    return normalise(crush(voice, 4) * attack(length, 600.0) * decay(length, 0.8))


def stutter(length=SUSTAIN['guitar']):
    """A pluck stuck on its own attack: eighteen restarts a second under one long decay."""
    voice = pulse(ROOT, length, 0.125) * retrigger(length, 18.0, 40.0)
    return normalise(crush(voice, 4) * decay(length, 2.2))


def pad(length=SUSTAIN['strings']):
    """Sample-and-hold on a resonant band-pass: the same chord, a new vowel every 70 ms."""
    source = detuned(rng, ROOT, length, (-10, 10))
    swept = svf(source, steps(length, 0.07, (500.0, 800.0, 1300.0, 2100.0, 3400.0)), 3.0, 'band')
    voice = swept + 0.4 * svf(source, 900.0, 0.8, 'low')
    return normalise(voice * attack(length, 8.0) * decay(length, 0.15))


def lead(length=SUSTAIN['vocals']):
    """A square wave whose width cannot make up its mind. The pitch never moves."""
    widths = (0.5, 0.25, 0.125)
    pick = steps(length, 0.04, (0, 1, 2)).astype(int)
    waves = np.stack([pulse(ROOT, length, width) for width in widths])
    voice = waves[pick, np.arange(pick.size)]
    return normalise(crush(voice, 5) * attack(length, 300.0) * decay(length, 0.3))


def kick():
    return normalise(crush(swept_sine(900.0, 45.0, 0.3, 70.0) * decay(0.3, 11.0), 6))


def snare():
    t = seconds(0.25)
    envelope = np.where(t < 0.105, np.exp(-45.0 * (t % 0.035)), np.exp(-30.0 * (t - 0.105)))
    return normalise(crush(hold(noise(rng, 0.25), 6) * envelope, 3))


def tick():
    click = np.sign(hold(noise(rng, 0.03), 4)) * decay(0.03, 150.0)
    return normalise(click - click.mean())


def buzz():
    voice = np.sign(hold(noise(rng, 0.22), 3)) * pulse(3100.0, 0.22, 0.5) * decay(0.22, 14.0)
    return normalise(voice - voice.mean())


def zap():
    return normalise(crush(swept_sine(1200.0, 90.0, 0.3, 30.0) * decay(0.3, 9.0), 4))


def crash():
    return normalise(crush(hold(noise(rng, 1.2), 8) * decay(1.2, 3.0), 3))


def ping():
    return normalise(crush(fm(2093.0, 1.41, 2.0, 0.4) * decay(0.4, 12.0), 4))


NAME = '故障 · Glitch'

SAMPLES = {
    'bitbass': (bass, 110.0, '3 位贝斯'),
    'datakeys': (keys, ROOT, '跳变 FM · 4 位'),
    'stutter': (stutter, ROOT, '卡带拨奏 · 每秒重触发 18 次'),
    'shpad': (pad, ROOT, '采样保持滤波垫'),
    'pwlead': (lead, ROOT, '脉宽乱跳主音'),
    'zapkick': (kick, 45.0, '下扫底鼓'),
    'stuttersnare': (snare, 1000.0, '三连重触发噪声'),
    'tick': (tick, 6000.0, '1 位嘀嗒'),
    'buzz': (buzz, 3100.0, '环形调制噪声'),
    'zap': (zap, 90.0, '下扫嗵鼓'),
    'bitcrash': (crash, 3000.0, '降采样噪声'),
    'ping': (ping, 2093.0, '金属短音'),
}

VOICES = {
    'bass': {'sample': 'bitbass', 'gain': 1.4, 'follow': 'note', 'fade': 0.006},
    'guitar': {'sample': 'stutter', 'gain': 1.0, 'pan': 0.28, 'follow': 'note', 'fade': 0.006},
    'guitar/distorted electric guitar': {'sample': 'pwlead', 'gain': 0.38, 'pan': -0.3, 'follow': 'note', 'fade': 0.006},
    'piano': {'sample': 'datakeys', 'gain': 0.55, 'pan': -0.15, 'follow': 'note', 'fade': 0.008},
    'strings': {'sample': 'shpad', 'transpose': 12, 'gain': 0.3, 'pan': 0.15, 'follow': 'note', 'fade': 0.04},
    'vocals': {'sample': 'pwlead', 'gain': 0.8, 'pan': 0.0, 'follow': 'note', 'fade': 0.008},
    'drums/kick': {'sample': 'zapkick', 'pitched': False, 'follow': 'sample', 'gain': 1.3},
    'drums/snare': {'sample': 'stuttersnare', 'pitched': False, 'follow': 'sample', 'gain': 1.2},
    'drums/hihat': {'sample': 'tick', 'pitched': False, 'follow': 'sample', 'gain': 1.2, 'pan': 0.2},
    'drums/openhat': {'sample': 'buzz', 'pitched': False, 'follow': 'sample', 'gain': 1.0, 'pan': 0.2},
    'drums/tom': {'sample': 'zap', 'pitched': False, 'follow': 'sample', 'gain': 1.2},
    'drums/crash': {'sample': 'bitcrash', 'pitched': False, 'follow': 'sample', 'gain': 0.7, 'pan': -0.4},
    'drums/ride': {'sample': 'ping', 'pitched': False, 'follow': 'sample', 'gain': 0.9, 'pan': 0.42},
}
