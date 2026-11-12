"""Hyperpop — everything too loud: clipped saws, a kick with metal in it, a helium lead.

Pop production with every safety removed. Chords are a saw stack pushed into a hard
clipper, so the tops are sheared flat and the detuned copies grind against each other.
The kick has a pitched metallic ring welded to it. The lead imitates a vocal tuned so
hard it has no slide between notes and shifted up until the mouth sounds tiny: the vowel
bands sit half as high again as a real voice's.
"""
import numpy as np

from drumkit import crash, hat, hit, kick, pitched, snare, tom
from synth import (SUSTAIN, attack, decay, detuned, fm, formants, normalise, saw, seconds, sine, svf, warp)

rng = np.random.default_rng(2019)
ROOT = 220.0


def clip(audio, drive):
    return np.clip(audio * drive, -1.0, 1.0)


def chords(length=SUSTAIN['piano']):
    voice = detuned(rng, ROOT, length, (-19, -8, 8, 19)) + 0.6 * detuned(rng, ROOT * 2, length, (-9, 9))
    return normalise(clip(voice * attack(length, 600.0) * decay(length, 1.5), 4.0))


def bass(length=SUSTAIN['bass']):
    t = seconds(length)
    voice = clip(saw(110.0, length) * 0.6 + sine(110.0, length), 5.0)
    return normalise(warp(voice, 200.0 * np.exp(-40.0 * t)) * attack(length, 900.0) * decay(length, 0.7))


def bell(length=SUSTAIN['guitar']):
    t = seconds(length)
    voice = fm(ROOT, 5.0, 2.5, length, index_decay=12.0) * decay(length, 3.5)
    return normalise(warp(voice, 700.0 * np.exp(-150.0 * t)) * attack(length, 1500.0))


def pad(length=SUSTAIN['strings']):
    voice = svf(detuned(rng, ROOT, length, (-22, -11, 0, 11, 22)), 600.0, 0.8, 'high')
    return normalise(clip(voice, 1.8) * attack(length, 8.0) * decay(length, 0.1))


def helium(length=SUSTAIN['vocals']):
    source = saw(ROOT, length)
    voice = formants(source, ((1100.0, 1.0), (2600.0, 0.7), (3900.0, 0.4)), 4.0) + 0.3 * svf(source, 700.0, 0.8, 'low')
    return normalise(clip(voice / np.abs(voice).max() * attack(length, 500.0) * decay(length, 0.25), 2.0))


def metal_kick():
    body = kick(rng, 220.0, 50.0, 0.35, 50.0, 9.0, drive=3.0, click=0.3).astype(np.float64)
    ring = fm(380.0, 1.41, 3.0, 0.35) * decay(0.35, 14.0)
    return normalise(clip(body + 0.5 * ring, 2.5))


def bright_snare():
    body = snare(rng, 400.0, 0.25, 16.0, cutoff=2500.0, body=0.8, snap=0.4).astype(np.float64)
    return normalise(clip(body, 3.0))


NAME = 'Hyperpop · 削波'

SAMPLES = {
    'clipbass': (bass, 110.0, '削波贝斯'),
    'clipchords': (chords, ROOT, '削波锯齿和弦'),
    'bell': (bell, ROOT, 'FM 尖钟 · 下滑'),
    'brightpad': (pad, ROOT, '高亮垫'),
    'helium': (helium, ROOT, '氦气人声主音'),
    'metalkick': (metal_kick, 50.0, '带金属环音的底鼓'),
    'brightsnare': (bright_snare, 400.0, '高调削波军鼓'),
    'hat': (lambda: hat(rng, 0.04, 150.0, 9000.0), 9000.0, '闭镲'),
    'openhat': (lambda: hat(rng, 0.3, 12.0, 9000.0), 9000.0, '开镲'),
    'zaptom': (lambda: tom(900.0, 120.0, 0.3, 28.0, 10.0), 120.0, '下扫嗵鼓'),
    'crash': (lambda: normalise(clip(crash(rng, 1.6, 2.6, 6000.0).astype(np.float64), 2.5)), 6000.0, '削波吊镲'),
}

VOICES = {
    'bass': pitched('clipbass', 0.9, fade=0.008),
    'guitar': pitched('bell', 0.5, 0.28, fade=0.008),
    'piano': pitched('clipchords', 0.38, -0.15),
    'strings': pitched('brightpad', 0.25, 0.15, fade=0.05, transpose=12),
    'vocals': pitched('helium', 0.8),
    'drums/kick': hit('metalkick', 0.54),
    'drums/snare': hit('brightsnare', 0.54),
    'drums/hihat': hit('hat', 0.67, 0.2),
    'drums/openhat': hit('openhat', 0.54, 0.2),
    'drums/tom': hit('zaptom', 0.49),
    'drums/crash': hit('crash', 0.31, -0.4),
    'drums/ride': hit('openhat', 0.45, 0.42, maxDur=0.14),
}
