"""Hammond drawbars and a stopped pipe rank — the kit that never decays.

A tonewheel organ is pure additive synthesis: nine sine drawbars at fixed harmonic
ratios, no filter, no envelope beyond a key click. That makes it the opposite of every
other kit here — the note holds at full level until the score lets go, so held chords
come out as held chords rather than as a row of decaying plucks.

Two details do the work. The key click is a few milliseconds of broadband noise at the
attack, and without it the organ sounds like a synthesiser imitating one. The Leslie is
faked as a slow pitch-and-amplitude wobble; a real one is a rotating horn and this is
only a gesture at it, but a dead-steady organ sounds wrong in a way listeners notice
even when they cannot say why.
"""
import numpy as np

from synth import RATE, SUSTAIN, attack, decay, noise, normalise, partials, phase, seconds, svf

rng = np.random.default_rng(1935)
ROOT = 220.0

#: Classic registrations. The numbers are drawbar footages as harmonic multiples of the
#: key: 8' is the fundamental, 5 1/3' the third harmonic, 4' the octave, and so on.
#:
#: The 16' sub-octave drawbar is deliberately left out of all three. Drawing it puts real
#: energy an octave below the key, which makes the waveform's period — and so the pitch
#: the renderer has to be told about — the sub-octave rather than the note. Keeping the
#: written pitch as the loudest and lowest partial is worth more here than the extra
#: depth, and the pedal rank below supplies that depth on the bass route anyway.
FULL = [(1.0, 1.00), (1.5, 0.42), (2.0, 0.70), (3.0, 0.35), (4.0, 0.45),
        (5.0, 0.18), (6.0, 0.22), (8.0, 0.28)]
MELLOW = [(1.0, 1.00), (2.0, 0.50), (3.0, 0.20), (4.0, 0.14)]
BRIGHT = [(1.0, 1.00), (2.0, 0.62), (3.0, 0.48), (4.0, 0.52), (6.0, 0.34), (8.0, 0.40)]


def drawbars(registration, length, leslie=5.6, depth_cents=7.0, tremolo=0.07):
    """Sum the drawbars, then wobble the whole thing slowly."""
    t = seconds(length)
    wobble = np.sin(2 * np.pi * leslie * t)
    voice = np.zeros_like(t)
    for multiple, amplitude in registration:
        frequency = ROOT * multiple
        if frequency >= RATE * 0.45:
            continue
        curve = frequency * (1.0 + (2 ** (depth_cents / 1200.0) - 1.0) * wobble)
        voice += amplitude * phase(curve)
    voice *= 1.0 + tremolo * wobble
    click = noise(rng, length) * decay(length, 520.0) * 0.25
    return normalise((voice * attack(length, 900.0)) + click)


def pipe(length=SUSTAIN['strings']):
    """A stopped flue pipe: odd harmonics only, slow to speak, no wobble at all."""
    voice = partials(ROOT, [(1.0, 1.0, 0.0), (3.0, 0.26, 0.0), (5.0, 0.11, 0.0),
                            (7.0, 0.05, 0.0), (9.0, 0.03, 0.0)], length)
    chiff = svf(noise(rng, length), 2600.0, 0.9, 'high') * decay(length, 38.0) * 0.3
    return normalise(voice * attack(length, 16.0) + chiff)


def pedal(length=SUSTAIN['bass']):
    """The pedalboard: 16' and 8' with almost nothing above them."""
    voice = partials(55.0, [(1.0, 1.0, 0.0), (2.0, 0.45, 0.0), (3.0, 0.10, 0.0)], length)
    return normalise(voice * attack(length, 60.0))


# --- a brushed jazz kit, because this is the room an organ lives in ----------------

def soft_kick():
    t = seconds(0.36)
    body = np.sin(2 * np.pi * (62.0 + 70.0 * np.exp(-34.0 * t)) * t) * decay(0.36, 11.0)
    return normalise(body + noise(rng, 0.36) * decay(0.36, 420.0) * 0.15)


def brush(length, decay_rate, cutoff):
    return normalise(svf(noise(rng, length), cutoff, 0.8, 'high') * decay(length, decay_rate))


def jazz_ride(length=1.4):
    """A ride needs a ping on top of the wash, or it is just a cymbal."""
    ping = partials(1180.0, [(1.0, 1.0, 5.0), (2.37, 0.5, 6.5), (3.91, 0.3, 8.0)], length)
    wash = svf(noise(rng, length), 5600.0, 0.8, 'high') * decay(length, 3.2)
    return normalise(0.7 * ping + 0.55 * wash)


def jazz_tom():
    t = seconds(0.4)
    return normalise(np.sin(2 * np.pi * (150.0 + 70.0 * np.exp(-24.0 * t)) * t) * decay(0.4, 10.0))


NAME = '电风琴 / 管风琴'

SAMPLES = {
    'drawbar_full': (lambda: drawbars(FULL, SUSTAIN['piano']), ROOT, '全拉杆 · 最厚'),
    'drawbar_mellow': (lambda: drawbars(MELLOW, SUSTAIN['guitar']), ROOT, '柔和拉杆'),
    'drawbar_bright': (lambda: drawbars(BRIGHT, SUSTAIN['vocals'], leslie=6.4), ROOT, '明亮拉杆 · 主音'),
    'pipe': (pipe, ROOT, '闭管风琴 · 纯奇次'),
    'pedal': (pedal, 55.0, '脚键盘贝斯'),
    'kick_soft': (soft_kick, 62.0, '软底鼓'),
    'brush_snare': (lambda: brush(0.26, 14.0, 2800.0), 1000.0, '刷扫军鼓'),
    'brush_hat': (lambda: brush(0.055, 125.0, 7400.0), 8000.0, '闭镲'),
    'brush_open': (lambda: brush(0.32, 11.0, 6400.0), 8000.0, '开镲'),
    'jazz_tom': (jazz_tom, 150.0, '嗵鼓'),
    'jazz_ride': (jazz_ride, 1180.0, '叮叮镲'),
}

#: Every melodic voice follows the score, with no maxDur anywhere: an organ holding a
#: note is the entire reason to pick this kit, and capping it would throw that away.
VOICES = {
    'bass': {'sample': 'pedal', 'gain': 1.0, 'follow': 'note', 'fade': 0.012},
    'guitar': {'sample': 'drawbar_mellow', 'gain': 0.45, 'pan': 0.3, 'follow': 'note', 'fade': 0.01},
    'guitar/distorted electric guitar': {'sample': 'drawbar_bright', 'gain': 0.4, 'pan': -0.3, 'follow': 'note', 'fade': 0.01},
    'piano': {'sample': 'drawbar_full', 'gain': 0.5, 'pan': -0.15, 'follow': 'note', 'fade': 0.012},
    'strings': {'sample': 'pipe', 'transpose': 12, 'gain': 0.3, 'pan': 0.15, 'follow': 'note', 'fade': 0.04},
    'vocals': {'sample': 'drawbar_bright', 'gain': 0.85, 'pan': 0.0, 'follow': 'note', 'fade': 0.012},
    'drums/kick': {'sample': 'kick_soft', 'pitched': False, 'follow': 'sample', 'gain': 1.25},
    'drums/snare': {'sample': 'brush_snare', 'pitched': False, 'follow': 'sample', 'gain': 1.7},
    'drums/hihat': {'sample': 'brush_hat', 'pitched': False, 'follow': 'sample', 'gain': 2.2, 'pan': 0.2},
    'drums/openhat': {'sample': 'brush_open', 'pitched': False, 'follow': 'sample', 'gain': 1.5, 'pan': 0.2},
    'drums/tom': {'sample': 'jazz_tom', 'pitched': False, 'follow': 'sample', 'gain': 1.2},
    'drums/crash': {'sample': 'jazz_ride', 'pitched': False, 'follow': 'sample', 'gain': 0.85, 'pan': -0.4},
    'drums/ride': {'sample': 'jazz_ride', 'pitched': False, 'follow': 'sample', 'maxDur': 0.3, 'gain': 1.1, 'pan': 0.42},
}
