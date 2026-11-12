"""House — the Korg M1 years: an organ for a bass, a bright piano, and a string machine.

Around 1990 half of house music came out of one keyboard. Its "Organ 2" patch, played low
and short, became the bass of the genre: a few drawbar harmonics with a click on the
front. Its piano was thin and bright, nothing like a real one, which is exactly why it
cut through a club. The drums are the 707 and 909: softer kick than techno, a clap where
the snare would be.
"""
import numpy as np

from drumkit import clap, crash, hat, hit, kick, pitched, tom
from synth import (SUSTAIN, attack, decay, detuned, noise, normalise, partials, pwm, seconds, svf, vibrato)

rng = np.random.default_rng(1987)
ROOT = 220.0


def organ_bass(length=SUSTAIN['bass']):
    voice = partials(110.0, [(1, 1.0, 1.5), (2, 0.6, 1.8), (3, 0.35, 2.2), (4, 0.15, 3.0)], length)
    click = svf(noise(rng, length), 2000.0, 0.9, 'high') * decay(length, 400.0) * 0.25
    return normalise((voice + click) * attack(length, 900.0))


def piano(length=SUSTAIN['piano']):
    """Harmonics that fall off slowly, the high ones dying first: bright, hard, a little plastic."""
    voice = partials(ROOT, [(k, 1.0 / k ** 0.8, 0.7 + 0.45 * k) for k in range(1, 15)], length)
    hammer = svf(noise(rng, length), 3000.0, 0.9, 'high') * decay(length, 300.0) * 0.15
    return normalise((voice + hammer) * attack(length, 1500.0))


def stab(length=SUSTAIN['guitar']):
    t = seconds(length)
    source = detuned(rng, ROOT, length, (-8, 8)) + 0.5 * pwm(ROOT, length, 0.4)
    return normalise(svf(source, 500.0 + 3000.0 * np.exp(-9.0 * t), 1.3, 'low') * attack(length, 600.0) * decay(length, 3.5))


def string_machine(length=SUSTAIN['strings']):
    voice = detuned(rng, ROOT, length, (-12, -4, 4, 12)) + 0.4 * detuned(rng, ROOT * 2, length, (-8, 8))
    return normalise(svf(voice, 3000.0, 0.8, 'low') * attack(length, 8.0) * decay(length, 0.1))


def lead(length=SUSTAIN['vocals']):
    curve = vibrato(ROOT, length, rate_hz=5.5, cents=14.0, onset=0.3)
    return normalise(svf(pwm(curve, length, 0.5), 2200.0, 1.0, 'low') * attack(length, 150.0) * decay(length, 0.3))


def rim():
    t = seconds(0.07)
    return normalise((np.sin(2 * np.pi * 1900 * t) + 0.6 * np.sin(2 * np.pi * 520 * t)) * decay(0.07, 80.0))


NAME = 'House · M1 风琴贝斯'

SAMPLES = {
    'organbass': (organ_bass, 110.0, '风琴贝斯'),
    'm1piano': (piano, ROOT, 'House 钢琴 · 亮而硬'),
    'stab': (stab, ROOT, '和弦短音'),
    'strings': (string_machine, ROOT, '弦乐机'),
    'softlead': (lead, ROOT, '方波主音'),
    'kick707': (lambda: kick(rng, 150.0, 55.0, 0.35, 40.0, 10.0, drive=1.4, click=0.2), 55.0, '707 底鼓'),
    'clap707': (lambda: clap(rng, 0.32, 1200.0, 30.0), 1200.0, '拍手'),
    'hat707': (lambda: hat(rng, 0.05, 110.0, 7500.0), 7500.0, '闭镲'),
    'open707': (lambda: hat(rng, 0.35, 10.0, 7500.0), 7500.0, '开镲'),
    'conga': (lambda: tom(260.0, 200.0, 0.3, 30.0, 12.0), 200.0, '康加'),
    'rim': (rim, 1900.0, '鼓边'),
    'crash707': (lambda: crash(rng, 1.6, 2.6, 5500.0), 5500.0, '吊镲'),
}

VOICES = {
    'bass': pitched('organbass', 1.74, fade=0.008),
    'guitar': pitched('stab', 0.84, 0.28, fade=0.008),
    'piano': pitched('m1piano', 0.91, -0.15),
    'strings': pitched('strings', 0.19, 0.15, fade=0.05, transpose=12),
    'vocals': pitched('softlead', 0.9),
    'drums/kick': hit('kick707', 1.2),
    'drums/snare': hit('clap707', 1.3),
    'drums/hihat': hit('hat707', 1.6, 0.2),
    'drums/openhat': hit('open707', 1.3, 0.2),
    'drums/tom': hit('conga', 1.1),
    'drums/crash': hit('crash707', 0.8, -0.4),
    'drums/ride': hit('rim', 0.9, 0.42),
}
