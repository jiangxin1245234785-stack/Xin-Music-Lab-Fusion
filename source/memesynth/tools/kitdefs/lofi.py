"""Lo-fi — everything played back off a tired cassette, drums off a 12-bit sampler.

None of these sounds is interesting clean. What makes the style is what the medium does
to them: the tape runs unevenly (a slow wow of a few cents and a faster flutter on top),
it has no treble left, it saturates, and it hisses. `tape` does those four things and
every pitched voice goes through it. The drums go through `dust` instead: half the
sample rate and twelve bits, the SP-1200's sound.
"""
import numpy as np

from synth import (RATE, SUSTAIN, attack, crush, decay, detuned, fm, hold, karplus, noise, normalise, saw_curve,
                   seconds, sine, svf, swept_sine, triangle, vibrato)

rng = np.random.default_rng(1996)
ROOT = 220.0


def tape(audio, cutoff=3200.0, wow=0.003, hiss=0.004):
    """Uneven transport, no treble, soft saturation, hiss. `wow` is the peak pitch error."""
    t = np.arange(audio.size) / RATE
    drift = (wow * RATE / (2 * np.pi * 0.7)) * np.sin(2 * np.pi * 0.7 * t + 1.0)
    drift += (0.0008 * RATE / (2 * np.pi * 6.3)) * np.sin(2 * np.pi * 6.3 * t)
    index = np.arange(audio.size, dtype=np.float64)
    played = np.interp(index + drift, index, audio)
    played = np.tanh(svf(played, cutoff, 0.7, 'low') * 1.3)
    return played + hiss * float(np.abs(played).max()) * rng.standard_normal(audio.size)


def dust(audio, cutoff=5200.0):
    return crush(hold(svf(audio, cutoff, 0.7, 'low'), 2), 12)


def keys(length=SUSTAIN['piano']):
    body = fm(ROOT, 1.0, 1.1, length, index_decay=3.0) * decay(length, 0.9)
    tine = fm(ROOT, 14.0, 1.2, length, index_decay=40.0) * decay(length, 9.0)
    return normalise(tape((body + 0.25 * tine) * attack(length, 400.0), cutoff=2600.0))


def bass(length=SUSTAIN['bass']):
    voice = svf(triangle(110.0, length) + 0.5 * sine(110.0, length), 500.0, 0.8, 'low')
    return normalise(tape(voice * attack(length, 300.0) * decay(length, 1.0), cutoff=1800.0, wow=0.0015))


def guitar(length=SUSTAIN['guitar']):
    return normalise(tape(karplus(rng, ROOT, length, damping=0.9965, brightness=0.35), cutoff=3000.0))


def pad(length=SUSTAIN['strings']):
    voice = svf(detuned(rng, ROOT, length, (-9, 0, 9), wave=triangle), 1800.0, 0.8, 'low')
    return normalise(tape(voice * attack(length, 2.2) * decay(length, 0.15), cutoff=2400.0, wow=0.005))


def lead(length=SUSTAIN['vocals']):
    curve = vibrato(ROOT, length, rate_hz=4.8, cents=12.0, onset=0.3)
    voice = svf(saw_curve(curve, harmonics=6), 1800.0, 0.9, 'low')
    return normalise(tape(voice * attack(length, 90.0) * decay(length, 0.4), cutoff=2800.0))


def kick():
    return normalise(dust(swept_sine(110.0, 50.0, 0.4, 30.0) * decay(0.4, 8.0), cutoff=900.0))


def snare():
    t = seconds(0.28)
    crack = svf(noise(rng, 0.28), 1800.0, 1.2, 'band') * decay(0.28, 20.0)
    shell = np.sin(2 * np.pi * 200 * t) * decay(0.28, 25.0)
    return normalise(dust(crack + 0.5 * shell, cutoff=4200.0))


def hat(length, rate):
    return normalise(dust(svf(noise(rng, length), 5500.0, 0.9, 'high') * decay(length, rate), cutoff=6500.0))


def tom():
    return normalise(dust(swept_sine(160.0, 95.0, 0.45, 18.0) * decay(0.45, 8.0), cutoff=1500.0))


def crash():
    return normalise(dust(svf(noise(rng, 1.2), 3500.0, 0.75, 'high') * decay(1.2, 3.5), cutoff=5000.0))


NAME = 'Lo-fi · 磁带'

SAMPLES = {
    'tapekeys': (keys, ROOT, '磁带电钢'),
    'roundbass': (bass, 110.0, '圆贝斯'),
    'nylon': (guitar, ROOT, '尼龙弦 · 磁带'),
    'tapepad': (pad, ROOT, '磁带垫 · 走带不稳'),
    'softlead': (lead, ROOT, '柔主音'),
    'dustkick': (kick, 50.0, '闷底鼓'),
    'dustsnare': (snare, 200.0, '12 位军鼓'),
    'dusthat': (lambda: hat(0.05, 90.0), 5500.0, '闭镲'),
    'dustopen': (lambda: hat(0.25, 14.0), 5500.0, '开镲'),
    'dusttom': (tom, 95.0, '嗵鼓'),
    'dustcrash': (crash, 3500.0, '吊镲'),
}

VOICES = {
    'bass': {'sample': 'roundbass', 'gain': 1.0, 'follow': 'note', 'fade': 0.01},
    'guitar': {'sample': 'nylon', 'gain': 0.55, 'pan': 0.28, 'follow': 'note', 'fade': 0.01},
    'guitar/distorted electric guitar': {'sample': 'softlead', 'gain': 0.42, 'pan': -0.3, 'follow': 'note', 'fade': 0.01},
    'piano': {'sample': 'tapekeys', 'gain': 0.7, 'pan': -0.15, 'follow': 'note', 'fade': 0.012},
    'strings': {'sample': 'tapepad', 'transpose': 12, 'gain': 0.32, 'pan': 0.15, 'follow': 'note', 'fade': 0.05},
    'vocals': {'sample': 'softlead', 'gain': 0.95, 'pan': 0.0, 'follow': 'note', 'fade': 0.012},
    'drums/kick': {'sample': 'dustkick', 'pitched': False, 'follow': 'sample', 'gain': 1.3},
    'drums/snare': {'sample': 'dustsnare', 'pitched': False, 'follow': 'sample', 'gain': 1.4},
    'drums/hihat': {'sample': 'dusthat', 'pitched': False, 'follow': 'sample', 'gain': 1.5, 'pan': 0.2},
    'drums/openhat': {'sample': 'dustopen', 'pitched': False, 'follow': 'sample', 'gain': 1.2, 'pan': 0.2},
    'drums/tom': {'sample': 'dusttom', 'pitched': False, 'follow': 'sample', 'gain': 1.2},
    'drums/crash': {'sample': 'dustcrash', 'pitched': False, 'follow': 'sample', 'gain': 0.8, 'pan': -0.4},
    'drums/ride': {'sample': 'dustopen', 'pitched': False, 'follow': 'sample', 'maxDur': 0.16, 'gain': 1.1, 'pan': 0.42},
}
