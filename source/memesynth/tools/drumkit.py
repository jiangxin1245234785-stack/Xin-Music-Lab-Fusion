"""Drum-machine voices shared by the electronic kits, and two helpers for writing `VOICES`.

The dance genres mostly agree on what a drum kit is made of and differ in how each piece
is tuned: how far and how fast the kick's pitch falls, how hard it is driven, how long the
snare's noise lasts. So the pieces live here with those as arguments and each recipe says
only what is particular to its style.
"""
import numpy as np

from synth import attack, decay, noise, normalise, pulse, seconds, svf, swept_sine

METAL = (205.3, 304.4, 369.6, 522.7, 540.0, 800.0)      # the TR-808 cymbal oscillators


def kick(rng, start, end, length, fall, rate, drive=1.5, click=0.2):
    """A sine falling from `start` to `end` Hz. `fall` is how fast the pitch drops, `rate` the volume."""
    body = np.tanh(swept_sine(start, end, length, fall) * decay(length, rate) * drive)
    return normalise(body + noise(rng, length) * decay(length, 800.0) * click)


def snare(rng, body_hz, length, rate, cutoff=1800.0, body=0.5, snap=0.0):
    """A two-mode shell under high-passed noise. `snap` adds a band of noise that dies at once: a clap layer."""
    t = seconds(length)
    shell = (np.sin(2 * np.pi * body_hz * t) + 0.6 * np.sin(2 * np.pi * body_hz * 1.8 * t)) * decay(length, rate * 1.3)
    wires = svf(noise(rng, length), cutoff, 0.7, 'high') * decay(length, rate)
    slap = svf(noise(rng, length), 1300.0, 1.5, 'band') * decay(length, rate * 2.0)
    return normalise(body * shell + 0.9 * wires + snap * slap)


def clap(rng, length=0.35, centre=1200.0, tail=28.0):
    """Three noise bursts 11 ms apart and then the room."""
    t = seconds(length)
    bursts = sum(np.exp(-200.0 * np.maximum(0.0, t - start)) * (t >= start) * (t < start + 0.011)
                 for start in (0.0, 0.011, 0.022))
    envelope = bursts + np.exp(-tail * np.maximum(0.0, t - 0.033)) * (t >= 0.033)
    return normalise(svf(noise(rng, length), centre, 1.5, 'band') * envelope)


def hat(rng, length, rate, cutoff=8000.0):
    """Noise through a high-pass: the 909's and every sampled hat's rough shape."""
    return normalise(svf(noise(rng, length), cutoff, 0.9, 'high') * decay(length, rate))


def metal_hat(length, rate, cutoff=7000.0):
    """Six square waves at fixed inharmonic pitches through a high-pass: the 808's."""
    metal = sum(pulse(frequency, length, 0.5) for frequency in METAL)
    return normalise(svf(metal, cutoff, 1.0, 'high') * decay(length, rate))


def tom(start, end, length=0.45, fall=18.0, rate=8.0):
    return normalise(swept_sine(start, end, length, fall) * decay(length, rate))


def crash(rng, length=1.6, rate=2.4, cutoff=5500.0):
    return normalise(svf(noise(rng, length), cutoff, 0.75, 'high') * decay(length, rate))


def cowbell(length=0.5, low=540.0, ratio=1.4815):
    """Two square waves through a band-pass, a sharp start and a short ring: the 808's again."""
    clank = svf(pulse(low, length, 0.5) + pulse(low * ratio, length, 0.5), low * 1.5, 3.0, 'band')
    return normalise(clank * (0.3 * decay(length, 9.0) + 0.7 * decay(length, 60.0)) * attack(length, 2000.0))


def pitched(sample, gain, pan=0.0, fade=0.01, **more):
    """A voice that follows the score."""
    return dict({'sample': sample, 'gain': gain, 'pan': pan, 'follow': 'note', 'fade': fade}, **more)


def hit(sample, gain, pan=0.0, **more):
    """A drum: plays at its own pitch for its own length."""
    return dict({'sample': sample, 'pitched': False, 'follow': 'sample', 'gain': gain, 'pan': pan}, **more)
