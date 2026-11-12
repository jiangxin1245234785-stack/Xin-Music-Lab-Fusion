"""Oscillators, filters and envelopes shared by every kit recipe in `kitdefs/`.

Numpy only, as the rest of the project (SPEC §4). The two filters here are per-sample
Python loops, far too slow for a whole song but nothing on the few-second buffers a kit
is built from — and they keep scipy out.

Every oscillator is band-limited by additive synthesis. Aliasing in the *renderer* is
wanted and documented (SPEC §8: resampling moves the formants, that is the sound), but
aliasing baked into the source material is just dirt that follows the sample everywhere.

Sample lengths matter more than they look. `render.py` stops a note at the end of its
sample and counts it as truncated, so a voice whose notes follow the score needs a sample
at least as long as the notes it will play. Measured over the 31 exports under
`artifacts/`, the 99th percentile note is 2.4 s on guitar, 2.6 s on bass, 2.7 s on
strings and 4.8 s on piano; `SUSTAIN` below is sized from that.
"""
import math

import numpy as np
import soundfile

RATE = 48000

#: Sample length for a voice that holds a note, by what it will be routed to. Short
#: percussive material ignores this and uses its own natural decay.
SUSTAIN = {'bass': 3.0, 'guitar': 2.5, 'piano': 5.0, 'strings': 4.0, 'vocals': 3.0}


def seconds(length):
    """The time axis for a buffer of `length` seconds."""
    return np.arange(int(length * RATE), dtype=np.float64) / RATE


def noise(rng, length):
    return rng.standard_normal(int(length * RATE))


def decay(length, rate_, hold=0.0):
    """Exponential decay, optionally flat for the first `hold` seconds."""
    return np.exp(-rate_ * np.maximum(0.0, seconds(length) - hold))


def attack(length, rate_):
    """Rising edge; `rate_` around 300 is a click-free pluck, around 8 is a slow bow."""
    return 1.0 - np.exp(-rate_ * seconds(length))


def normalise(audio, level=0.89):
    peak = float(np.abs(audio).max())
    return (audio * (level / peak)).astype(np.float32) if peak else audio.astype(np.float32)


def write(path, audio, rate=RATE):
    soundfile.write(str(path), audio, rate, subtype='PCM_24')


# --- oscillators, all band-limited -------------------------------------------------

def _harmonics(frequency):
    return max(1, int((RATE * 0.45) / frequency))


def sine(frequency, length):
    return np.sin(2 * np.pi * frequency * seconds(length))


def saw(frequency, length):
    t = seconds(length)
    wave = np.zeros_like(t)
    for k in range(1, _harmonics(frequency) + 1):
        wave += ((-1) ** (k + 1)) * np.sin(2 * np.pi * k * frequency * t) / k
    return (2.0 / np.pi) * wave


def pulse(frequency, length, duty=0.5):
    """Square wave at `duty` occupancy. 0.125 and 0.25 are the NES channels."""
    t = seconds(length)
    wave = np.zeros_like(t)
    for k in range(1, _harmonics(frequency) + 1):
        wave += (math.sin(math.pi * k * duty) / k) * np.cos(2 * np.pi * k * frequency * t)
    return (4.0 / np.pi) * wave


def triangle(frequency, length):
    t = seconds(length)
    wave = np.zeros_like(t)
    for k in range(1, _harmonics(frequency) + 1, 2):
        wave += ((-1) ** ((k - 1) // 2)) * np.sin(2 * np.pi * k * frequency * t) / (k * k)
    return (8.0 / (np.pi ** 2)) * wave


def swept_sine(start_hz, end_hz, length, pitch_decay):
    """A sine whose pitch falls exponentially — the backbone of an 808 kick or a tom."""
    t = seconds(length)
    frequency = end_hz + (start_hz - end_hz) * np.exp(-pitch_decay * t)
    return np.sin(2 * np.pi * np.cumsum(frequency) / RATE)


def partials(frequency, components, length):
    """Additive tone from (multiplier, amplitude, decay rate) triples.

    Harmonic multipliers make an organ; inharmonic ones make a bell, and that single
    difference is most of what separates the metal kits from the pipe ones.
    """
    t = seconds(length)
    wave = np.zeros_like(t)
    for multiple, amplitude, decay_rate in components:
        partial = frequency * multiple
        if partial >= RATE * 0.45:
            continue
        wave += amplitude * np.sin(2 * np.pi * partial * t) * np.exp(-decay_rate * t)
    return wave


def fm(frequency, ratio, index, length, index_decay=0.0):
    """One FM pair. `index` is the modulation depth, falling at `index_decay` per second.

    Ratio 1:1 thickens, 1:3.5 rings like a bell, 1:14 is the bite on a DX electric piano.
    """
    t = seconds(length)
    depth = index * (np.exp(-index_decay * t) if index_decay else 1.0)
    return np.sin(2 * np.pi * frequency * t + depth * np.sin(2 * np.pi * frequency * ratio * t))


def karplus(rng, frequency, length, damping=0.996, brightness=0.5):
    """Karplus-Strong plucked string: noise in a damped comb filter.

    `damping` sets how long it rings, `brightness` how much of the pick noise survives
    the first pass — the difference between a nylon string and a steel one.
    """
    size = max(2, int(round(RATE / frequency)))
    buffer = rng.standard_normal(size)
    # Lowpass the excitation: all-noise sounds like a snare, filtered noise like a pluck.
    for _ in range(int((1.0 - brightness) * 8)):
        buffer = 0.5 * (buffer + np.roll(buffer, 1))
    # The averaging filter in the loop has unity gain at DC, so any offset in the noise
    # survives the whole decay as a thump under the note. Take it out at the source.
    buffer -= buffer.mean()
    count = int(length * RATE)
    out = np.empty(count, dtype=np.float64)
    previous = 0.0
    for index in range(count):
        position = index % size
        current = buffer[position]
        out[index] = current
        buffer[position] = damping * 0.5 * (current + previous)
        previous = current
    return out


def detuned(rng, frequency, length, cents, wave=None):
    """Copies of one waveform a few cents apart, each starting somewhere else in its cycle.

    Seven saws spread over about ±25 cents is the supersaw; three over ±7 is an analogue
    poly. Started together they would all peak on the first sample, so each copy is cut
    from a slightly longer buffer at its own offset. The pitch stays `frequency`.
    """
    wave = wave or saw
    count = int(length * RATE)
    out = np.zeros(count, dtype=np.float64)
    for offset in cents:
        skip = int(rng.integers(0, RATE // 20))
        out += wave(frequency * 2 ** (offset / 1200.0), length + 0.06)[skip:skip + count]
    return out / len(cents)


def pwm(frequency, length, duty, harmonics=40):
    """A pulse whose width moves. `frequency` and `duty` are each a scalar or a curve.

    A fixed pulse is one timbre; a width that drifts is the SID chip's whole personality.
    """
    count = int(length * RATE)
    frequency = np.broadcast_to(np.asarray(frequency, dtype=np.float64), (count,))
    duty = np.broadcast_to(np.asarray(duty, dtype=np.float64), (count,))
    angle = 2 * np.pi * np.cumsum(frequency) / RATE
    wave = np.zeros(count, dtype=np.float64)
    for k in range(1, min(harmonics, int(RATE * 0.45 / float(frequency.max()))) + 1):
        wave += np.sin(np.pi * k * duty) / k * np.cos(k * angle)
    return (4.0 / np.pi) * wave


def warp(audio, cents):
    """Play a finished buffer back at a pitch offset that changes over time (in cents).

    For sounds that cannot be bent while they are made: a plucked string that is pressed
    after the pluck, which is how a guzheng sings.
    """
    ratio = 2.0 ** (np.broadcast_to(np.asarray(cents, dtype=np.float64), audio.shape) / 1200.0)
    position = np.concatenate([[0.0], np.cumsum(ratio)[:-1]])
    return np.interp(position, np.arange(audio.size, dtype=np.float64), audio)


def formants(source, bands, sharpness=5.0):
    """Sum of resonant band-passes at (centre Hz, gain): the mouth in front of a buzz."""
    return sum(gain * svf(source, centre, sharpness, 'band') for centre, gain in bands)


def echo(audio, time, feedback=0.45, mix=0.4, repeats=6):
    """A feedback delay baked into the sample: each repeat `time` seconds later and quieter."""
    wet = np.zeros_like(audio, dtype=np.float64)
    step = int(time * RATE)
    for index in range(1, repeats + 1):
        shift = index * step
        if shift >= audio.size:
            break
        wet[shift:] += feedback ** (index - 1) * audio[:audio.size - shift]
    return audio + mix * wet


def crush(audio, bits):
    """Quantise to `bits` bits. The period is untouched, so the pitch is too."""
    peak = float(np.abs(audio).max()) or 1.0
    steps = 2 ** (bits - 1)
    out = np.round(audio / peak * steps) / steps
    return out - out.mean()


def hold(audio, factor):
    """Sample-rate reduction: every sample repeated `factor` times, the old-sampler grit."""
    return np.repeat(audio[::factor], factor)[:audio.size]


def reverb(rng, audio, length=2.0, mix=0.35, tail=0.0, damp=6):
    """A room made of decaying noise, convolved in one FFT. `tail` adds silence to ring into.

    The sample is cut where it ends, so the last 40 ms are faded: a voice that follows the
    score never reaches them, a drum that rings for its own length must not click there.
    """
    dry = np.concatenate([np.asarray(audio, dtype=np.float64), np.zeros(int(tail * RATE))])
    room = noise(rng, length) * decay(length, 6.9 / length)
    for _ in range(damp):
        room = 0.5 * (room + np.roll(room, 1))
    room[:int(0.004 * RATE)] = 0.0
    size = 1 << int(np.ceil(np.log2(dry.size + room.size)))
    wet = np.fft.irfft(np.fft.rfft(dry, size) * np.fft.rfft(room, size), size)[:dry.size]
    wet *= float(np.abs(dry).max()) / (float(np.abs(wet).max()) or 1.0)
    out = (1.0 - mix) * dry + mix * wet
    fade = min(out.size, int(0.04 * RATE))
    out[-fade:] *= np.linspace(1.0, 0.0, fade)
    return out


# --- filters -----------------------------------------------------------------------

def svf(audio, cutoff, resonance, mode='low'):
    """Chamberlin state-variable filter. `cutoff` is a scalar or a per-sample curve.

    Sweeping the cutoff of a steep resonant filter across a rich waveform is the squelch
    in an acid line and the vowel in a brass swell.
    """
    cutoff = np.broadcast_to(np.asarray(cutoff, dtype=np.float64), audio.shape)
    damping = 1.0 / max(resonance, 0.5)
    low = band = 0.0
    out = np.empty_like(audio)
    pick = {'low': 0, 'high': 1, 'band': 2}[mode]
    for index, sample in enumerate(audio):
        f = 2.0 * math.sin(math.pi * min(float(cutoff[index]), RATE * 0.45) / RATE)
        low += f * band
        high = sample - low - damping * band
        band += f * high
        out[index] = (low, high, band)[pick]
    return out


def vibrato(frequency, length, rate_hz=5.0, cents=25.0, onset=0.35):
    """A pitch curve for `frequency`, wobbling after `onset` seconds. Feed it to `phase`."""
    t = seconds(length)
    depth = frequency * (2 ** (cents / 1200.0) - 1.0)
    ramp = np.clip((t - onset) / max(onset, 1e-6), 0.0, 1.0)
    return frequency + depth * ramp * np.sin(2 * np.pi * rate_hz * t)


def phase(frequency_curve):
    """Integrate a per-sample frequency curve into a sine. Pairs with `vibrato`."""
    return np.sin(2 * np.pi * np.cumsum(np.asarray(frequency_curve, dtype=np.float64)) / RATE)


def saw_curve(frequency_curve, harmonics=24):
    """A sawtooth that follows a per-sample frequency curve, for bowed and vibrato parts."""
    angle = 2 * np.pi * np.cumsum(np.asarray(frequency_curve, dtype=np.float64)) / RATE
    wave = np.zeros_like(angle)
    for k in range(1, harmonics + 1):
        wave += ((-1) ** (k + 1)) * np.sin(k * angle) / k
    return (2.0 / np.pi) * wave
