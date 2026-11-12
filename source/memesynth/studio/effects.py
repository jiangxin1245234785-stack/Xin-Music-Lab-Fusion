"""What a track can have done to it beyond its level: octave, dynamics, tone, echo, room (SPEC v14).

Two kinds of thing live here. `shape` changes the notes before anything is rendered: a
track moved by octaves, its dynamics flattened or exaggerated. `apply` changes the sound
after: a tone filter, an echo, a room.

Every number here has a twin in `app.html` (`FX`, `shapedScore`, `fxChain`), where the page
does the same with Web Audio nodes while it plays. The page auditions and this file
exports, so the two have to agree: the filter is Web Audio's own biquad formula, the echo
is the same delay and feedback, and the room is one impulse response that the page
downloads from here (`/reverb.wav`) rather than making its own.

Numpy only. The filters are applied by block FFT convolution with the filter's impulse
response, because a sample-by-sample loop over a whole song in Python takes minutes.
"""
from __future__ import annotations

import dataclasses
import functools
import math

import numpy as np

RATE = 48000
ECHO_SECONDS, ECHO_FEEDBACK, ECHO_WET = 0.3, 0.4, 0.7      # wet is the level at 100
LOOP_LATENCY = 128                                          # samples; measured in Edge, see `apply`
ROOM_SECONDS, ROOM_WET = 1.8, 0.6
TAIL_SECONDS = 2.5                                          # what an echo or a room adds after the last note
DEFAULTS = {'oct': 0, 'vel': 0, 'tone': 0, 'echo': 0, 'room': 0}
LIMITS = {'oct': (-2, 2), 'vel': (-100, 100), 'tone': (-100, 100), 'echo': (0, 100), 'room': (0, 100)}


def settings(choice):
    """The five numbers of one track, from a plan that may be old, hand-edited or wrong."""
    out = {}
    for name, default in DEFAULTS.items():
        try:
            value = int(round(float((choice or {}).get(name, default) or 0)))
        except (TypeError, ValueError):
            value = default
        out[name] = max(LIMITS[name][0], min(LIMITS[name][1], value))
    return out


# --- before rendering: the notes ---------------------------------------------------------------

def shape(score, by_track, track_of):
    """The score with each track's octave and dynamics applied. `by_track` maps a track to its settings.

    Dynamics: every velocity is moved away from (or toward) the track's own average by a
    factor of 2^(vel/50), so -100 leaves a quarter of the spread and +100 makes it four
    times wider. Drums keep their pitch; an octave means nothing to a snare.
    """
    if not any(s['oct'] or s['vel'] for s in by_track.values()):
        return score
    sums, counts = {}, {}
    for note in score.notes:
        track = track_of(note.route)
        sums[track] = sums.get(track, 0) + note.velocity
        counts[track] = counts.get(track, 0) + 1
    notes = []
    for note in score.notes:
        track = track_of(note.route)
        chosen = by_track.get(track)
        if not chosen or not (chosen['oct'] or chosen['vel']):
            notes.append(note)
            continue
        mean = sums[track] / counts[track]
        velocity = int(math.floor(mean + (note.velocity - mean) * 2.0 ** (chosen['vel'] / 50.0) + 0.5))
        notes.append(dataclasses.replace(note, velocity=max(1, min(127, velocity)),
                                         pitch=note.pitch if note.is_drum else note.pitch + 12 * chosen['oct']))
    return dataclasses.replace(score, notes=tuple(notes))


# --- after rendering: the sound ----------------------------------------------------------------

def tone_filter(tone):
    """(kind, Hz) for a tone setting, or None at 0. Below 0 darkens (18 kHz down to 250 Hz); above, thins (30 Hz up to 2.5 kHz)."""
    if tone < 0:
        return 'lowpass', 18000.0 * (250.0 / 18000.0) ** (-tone / 100.0)
    if tone > 0:
        return 'highpass', 30.0 * (2500.0 / 30.0) ** (tone / 100.0)
    return None


def biquad(kind, hz, q_db=-3.0):
    """Web Audio's low-pass / high-pass coefficients (b0, b1, b2, a1, a2), where Q is in decibels."""
    w = 2.0 * math.pi * hz / RATE
    alpha = math.sin(w) / (2.0 * 10.0 ** (q_db / 20.0))
    cosine = math.cos(w)
    if kind == 'lowpass':
        b = ((1.0 - cosine) / 2.0, 1.0 - cosine, (1.0 - cosine) / 2.0)
    else:
        b = ((1.0 + cosine) / 2.0, -(1.0 + cosine), (1.0 + cosine) / 2.0)
    a0 = 1.0 + alpha
    return b[0] / a0, b[1] / a0, b[2] / a0, -2.0 * cosine / a0, (1.0 - alpha) / a0


@functools.lru_cache(maxsize=256)
def filter_response(tone, taps=8192):
    """The tone filter's impulse response, long enough to have died away."""
    b0, b1, b2, a1, a2 = biquad(*tone_filter(tone))
    out = np.zeros(taps, dtype=np.float64)
    x1 = x2 = y1 = y2 = 0.0
    for index in range(taps):
        x0 = 1.0 if index == 0 else 0.0
        y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        out[index] = y0
        x2, x1, y2, y1 = x1, x0, y1, y0
    return out


@functools.lru_cache(maxsize=1)
def impulse():
    """The room: 1.8 s of decaying noise, a different one for each ear, each of unit energy."""
    rng = np.random.default_rng(20261112)
    count = int(ROOM_SECONDS * RATE)
    t = np.arange(count) / RATE
    room = rng.standard_normal((count, 2)) * np.exp(-t * 6.9 / 1.6)[:, None]
    for _ in range(4):                                     # darker than white noise, as rooms are
        room = 0.5 * (room + np.roll(room, 1, axis=0))
    start = int(0.012 * RATE)
    room[:start] *= np.linspace(0.0, 1.0, start)[:, None] ** 2
    room /= np.sqrt(np.sum(room * room, axis=0, keepdims=True))
    return room.astype(np.float32)


def convolve(signal, kernel, block=1 << 16):
    """`signal` convolved with `kernel`, in blocks so a whole song never sits in one FFT."""
    signal = np.asarray(signal, dtype=np.float64)
    kernel = np.asarray(kernel, dtype=np.float64)
    size = 1 << int(math.ceil(math.log2(block + kernel.size)))
    spectrum = np.fft.rfft(kernel, size)
    out = np.zeros(signal.size + kernel.size - 1, dtype=np.float64)
    for start in range(0, signal.size, block):
        piece = signal[start:start + block]
        wet = np.fft.irfft(np.fft.rfft(piece, size) * spectrum, size)[:piece.size + kernel.size - 1]
        out[start:start + wet.size] += wet
    return out


def apply(audio, chosen):
    """One track (frames × 2) with its tone, echo and room. Longer than it came in when it rings on."""
    tone, echo, room = chosen['tone'], chosen['echo'], chosen['room']
    if not (tone or echo or room):
        return audio
    frames = len(audio)
    dry = np.asarray(audio, dtype=np.float64)
    if tone:
        kernel = filter_response(tone)
        dry = np.stack([convolve(dry[:, side], kernel)[:frames] for side in (0, 1)], axis=1)
    if not (echo or room):
        return dry.astype(np.float32)
    out = np.zeros((frames + int(TAIL_SECONDS * RATE), 2), dtype=np.float64)
    out[:frames] = dry
    if echo:
        step, level = int(round(ECHO_SECONDS * RATE)), ECHO_WET * echo / 100.0
        for repeat in range(1, 16):
            # The page's delay sits in a feedback loop, and a browser runs such a loop one block
            # (128 samples) late each time round: so every repeat after the first is that much later.
            shift = repeat * step + (repeat - 1) * LOOP_LATENCY
            if shift >= len(out):
                break
            count = min(frames, len(out) - shift)
            out[shift:shift + count] += dry[:count] * (level * ECHO_FEEDBACK ** (repeat - 1))
    if room:
        space, level = impulse(), ROOM_WET * room / 100.0
        for side in (0, 1):
            wet = convolve(dry[:, side], space[:, side])
            count = min(len(out), wet.size)
            out[:count, side] += level * wet[:count]
    return out.astype(np.float32)
