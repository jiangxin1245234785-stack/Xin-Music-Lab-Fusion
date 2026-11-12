"""TR-808 and TB-303 — the whole sound of acid house, and simple enough to build from
oscillators and envelopes.

Ported unchanged from the original `make_acid_kit.py`: same seed, same order of random
draws, same arithmetic, so the samples it writes are byte-identical to the ones already
in `kits/acid/`. Only the `vocals` route is new, because that route did not exist when
this kit was written.

The one thing to know about this kit is that its melodic samples are short — the stab is
0.45 s — so notes longer than that stop at the end of the sample. Measured on a real
export that is 59% of notes. It is left that way on purpose: this is the kit the project
was first listened to with, and the newer kits in this library are sized from the real
note-length distribution instead.
"""
import numpy as np

from synth import RATE, decay, noise, normalise, saw, seconds, svf, swept_sine

rng = np.random.default_rng(808)


# --- TR-808 ------------------------------------------------------------------------

def kick():
    """Long decaying sine with a pitch drop, plus a click for the attack."""
    body = swept_sine(120.0, 48.0, 0.75, 42.0) * decay(0.75, 5.2)
    click = noise(rng, 0.75) * decay(0.75, 900.0) * 0.5
    return normalise(body + click)


def snare():
    """Two detuned tones for the shell, filtered noise for the snares."""
    tone = (np.sin(2 * np.pi * 182 * seconds(0.25)) + 0.7 * np.sin(2 * np.pi * 331 * seconds(0.25)))
    tone *= decay(0.25, 34.0)
    snares = svf(noise(rng, 0.25), 3200.0, 0.9, 'high') * decay(0.25, 19.0)
    return normalise(0.55 * tone + 0.85 * snares)


def clap():
    """Three fast noise bursts plus a tail — the spacing is the whole character."""
    length = 0.42
    out = np.zeros(int(length * RATE))
    source = svf(noise(rng, length), 1400.0, 1.4, 'high')
    for offset in (0.0, 0.009, 0.019):
        start = int(offset * RATE)
        burst = source[:len(out) - start] * decay(length, 320.0)[:len(out) - start]
        out[start:] += burst
    out += source * decay(length, 14.0, hold=0.022) * 0.6
    return normalise(out)


def hat(length, decay_rate):
    """Noise through a steep highpass. The real 808 uses six squares; this reads the same."""
    return normalise(svf(noise(rng, length), 8200.0, 1.1, 'high') * decay(length, decay_rate))


def tom(start_hz=190.0, end_hz=92.0):
    return normalise(swept_sine(start_hz, end_hz, 0.4, 28.0) * decay(0.4, 11.0))


def cymbal():
    return normalise(svf(noise(rng, 1.6), 6000.0, 0.8, 'high') * decay(1.6, 3.4))


# --- TB-303 ------------------------------------------------------------------------

def bass303(root_hz=55.0, length=0.85):
    """Sawtooth through a resonant lowpass sweeping down, then driven into saturation.

    The sweep and the resonance are the acid sound. Saturation at the end is what the
    original's output stage does when the resonance peak gets loud, and leaving it out
    makes the result sound thin and polite.
    """
    t = seconds(length)
    cutoff = 220.0 + 2600.0 * np.exp(-7.0 * t)
    voice = svf(saw(root_hz, length), cutoff, 4.2, 'low')
    voice *= 1.0 - np.exp(-400.0 * t)          # fast attack, no click
    voice *= decay(length, 2.4)
    return normalise(np.tanh(voice * 2.6))


def stab(root_hz=220.0, length=0.45):
    """Detuned saws under a fixed lowpass — the house organ stab for the chord parts."""
    voice = saw(root_hz, length) + saw(root_hz * 1.006, length) + saw(root_hz * 0.5, length)
    voice = svf(voice, 1500.0, 1.8, 'low')
    voice *= 1.0 - np.exp(-300.0 * seconds(length))
    return normalise(voice * decay(length, 7.5))


NAME = 'Acid 808/303'

SAMPLES = {
    'kick808': (kick, 55.0, '808 底鼓'),
    'snare808': (snare, 182.0, '808 军鼓'),
    'clap808': (clap, 1000.0, '808 拍手'),
    'hat_closed': (lambda: hat(0.09, 130.0), 8000.0, '808 闭镲'),
    'hat_open': (lambda: hat(0.55, 11.0), 8000.0, '808 开镲'),
    'tom808': (tom, 190.0, '808 嗵鼓'),
    'cymbal808': (cymbal, 6000.0, '808 吊镲'),
    'bass303': (bass303, 55.0, '303 酸性贝斯'),
    # 110, not the 220 it is built at: the third oscillator is a sub-octave saw, so the
    # waveform's period is 110 Hz and that is the pitch the renderer has to divide by.
    # It was labelled 220 and two of the five voices carried a +12 transpose to cancel
    # the error while the other two did not — the piano and the distorted guitar played
    # an octave low. Declaring the real root and dropping the compensation fixes those
    # two and leaves the other three sounding exactly as before.
    'stab': (stab, 110.0, '合成器和弦刺'),
}

#: Only the bass gets the 303: two acid lines at once turn to mud, and the contrast
#: against the stabs is what makes the one line read. The drum gains look extreme next
#: to the melodic ones because they are compensating for the transcription's own
#: velocities — hi-hat velocity comes from stem RMS, so hats arrive far quieter than a
#: drum machine would play them, and house lives or dies on the hats.
VOICES = {
    'bass': {'sample': 'bass303', 'gain': 1.0, 'follow': 'note', 'fade': 0.004},
    'guitar': {'sample': 'stab', 'gain': 0.35, 'pan': 0.3, 'follow': 'note'},
    'guitar/distorted electric guitar': {'sample': 'stab', 'gain': 0.5, 'pan': -0.35, 'follow': 'note'},
    'piano': {'sample': 'stab', 'gain': 0.55, 'pan': -0.2, 'follow': 'note'},
    'strings': {'sample': 'stab', 'gain': 0.3, 'pan': 0.15, 'follow': 'note'},
    'vocals': {'sample': 'stab', 'gain': 0.9, 'pan': 0.0, 'follow': 'note', 'fade': 0.006},
    'drums/kick': {'sample': 'kick808', 'pitched': False, 'follow': 'sample', 'gain': 1.3},
    'drums/snare': {'sample': 'clap808', 'pitched': False, 'follow': 'sample', 'gain': 2.2},
    'drums/hihat': {'sample': 'hat_closed', 'pitched': False, 'follow': 'sample', 'gain': 2.6, 'pan': 0.2},
    'drums/openhat': {'sample': 'hat_open', 'pitched': False, 'follow': 'sample', 'gain': 1.8, 'pan': 0.2},
    'drums/tom': {'sample': 'tom808', 'pitched': False, 'follow': 'sample', 'gain': 1.4},
    'drums/crash': {'sample': 'cymbal808', 'pitched': False, 'follow': 'sample', 'gain': 1.0, 'pan': -0.4},
    'drums/ride': {'sample': 'hat_open', 'pitched': False, 'follow': 'sample', 'maxDur': 0.15, 'gain': 1.6, 'pan': 0.45},
}
