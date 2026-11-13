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

import bisect
import dataclasses
import functools
import math

import numpy as np

RATE = 48000
ECHO_SECONDS, ECHO_FEEDBACK, ECHO_WET = 0.3, 0.4, 0.7      # wet is the level at 100
LOOP_LATENCY = 128                                          # samples; measured in Edge, see `apply`
ROOM_SECONDS, ROOM_WET = 1.8, 0.6
TAIL_SECONDS = 2.5                                          # what an echo or a room adds after the last note
DEFAULTS = {'oct': 0, 'vel': 0, 'gate': 0, 'late': 0, 'loose': 0, 'thin': 0, 'tone': 0, 'echo': 0, 'room': 0}
LIMITS = {'oct': (-2, 2), 'vel': (-100, 100), 'gate': (-100, 100), 'late': (-60, 60), 'loose': (0, 100), 'thin': (0, 100),
          'tone': (-100, 100), 'echo': (0, 100), 'room': (0, 100)}
NOTE_KEYS = ('oct', 'vel', 'gate', 'late', 'loose', 'thin')     # these change the notes (SPEC v14, v19)
#: The page's track order, which `loose` hashes by (it is not `batch.TRACKS`).
HASH_ORDER = ('drums', 'bass', 'guitar', 'piano', 'other', 'vocals')
MIN_GATE = 0.03                                                   # seconds: no note is shortened below this
PUMP_DEFAULT = {'depth': 0, 'release': 180}
PUMP_LIMITS = {'depth': (0, 100), 'release': (60, 400)}
PUMPED = ('bass', 'guitar', 'piano', 'other')                     # what the kick pushes down (SPEC v20)
KICK_SLACK = 1e-9                                                 # seconds; see pump_envelope


def settings(choice):
    """The numbers of one track, from a plan that may be old, hand-edited or wrong."""
    out = {}
    for name, default in DEFAULTS.items():
        try:
            value = int(round(float((choice or {}).get(name, default) or 0)))
        except (TypeError, ValueError):
            value = default
        out[name] = max(LIMITS[name][0], min(LIMITS[name][1], value))
    return out


# --- the vocal follows the preset (SPEC v15) ---------------------------------------------------

#: What each whole-song preset does to the vocal track's sound: tone, echo, room. The page
#: reads these from `kits.json` (server.py), so this is the only copy. A kit missing here gets 0/0/0.
VOCAL_PRESETS = {name: {'tone': tone, 'echo': echo, 'room': room} for name, (tone, echo, room) in {
    'acid': (0, 15, 10), 'fmkeys': (0, 0, 20), 'synthwave': (0, 20, 30), 'italo': (0, 25, 20),
    'electro': (15, 10, 0), 'vaporwave': (-35, 20, 55), 'supersaw': (0, 25, 30), 'house': (0, 10, 20),
    'techno': (-10, 35, 15), 'garage': (0, 15, 15), 'futurebass': (0, 20, 30), 'psytrance': (0, 40, 20),
    'trap': (-5, 10, 15), 'reese': (0, 15, 25), 'wobble': (-10, 10, 20), 'phonk': (-30, 0, 15),
    'hoover': (0, 20, 20), 'hardstyle': (0, 15, 30), 'hyperpop': (25, 10, 10), 'lofi': (-45, 0, 15),
    'ambient': (-15, 30, 70), 'glitch': (10, 30, 0), 'chiptune': (20, 0, 0), 'c64': (20, 10, 0),
    'megadrive': (15, 10, 5), 'pluck': (0, 0, 15), 'organ': (0, 0, 35), 'orchestra': (0, 0, 40),
    'musicbox': (0, 10, 30), 'gamelan': (0, 10, 35),
}.items()}
SOUND_KEYS = ('tone', 'echo', 'room')


def vocal_preset(preset):
    """The tone / echo / room a preset gives the vocal."""
    return dict(VOCAL_PRESETS.get(preset) or {'tone': 0, 'echo': 0, 'room': 0})


def follows(choice):
    """Whether a vocal entry follows the preset. A plan from before v15 has no `follow`: it
    follows only when its own tone, echo and room are all 0, so nothing set by hand changes.
    A `follow` that is not true or false is read as missing."""
    choice = choice or {}
    if isinstance(choice.get('follow'), bool):
        return choice['follow']
    own = settings(choice)
    return not any(own[key] for key in SOUND_KEYS)


def vocal_settings(choice, preset):
    """The five numbers the vocal track really uses: its own octave and dynamics, and, while it
    follows, the whole-song preset's tone, echo and room in place of its own."""
    out = settings(choice)
    if follows(choice):
        out.update(vocal_preset(preset))
    return out


# --- before rendering: the notes ---------------------------------------------------------------

def jitter(n, salt, track_index):
    """A number in -1..1 that depends only on the note (its place n in its track), a salt and the track (SPEC v19).
    The page's `jitter` in app.html is the same arithmetic on 32-bit integers."""
    h = (n * 2654435761 + salt * 40503 + track_index * 97) & 0xFFFFFFFF
    h ^= h >> 15
    h = (h * 2246822519) & 0xFFFFFFFF
    h ^= h >> 13
    h = (h * 3266489917) & 0xFFFFFFFF
    h ^= h >> 16
    return h / 4294967296.0 * 2.0 - 1.0


def shape(score, by_track, track_of):
    """The score with each track's note controls applied. `by_track` maps a track to its settings.

    Inside a track, in this order (SPEC v14, v19):
    thin  – drops floor(count · 0.7 · thin/100) notes, the quietest as written first (then the
            shorter, then the later, then the later in the score);
    oct   – whole octaves (drums keep their pitch);
    vel   – every velocity moved away from or toward the track's average (of the notes left) by 2^(vel/50);
    gate  – durations × 2^(gate/50), never under 30 ms, and a lengthened note never past the next
            note of the same pitch on the same route (drums: no effect, they ring for their sample);
    late  – every start moved by late ms, never before 0;
    loose – start ± 30 ms · loose/100 and velocity ± 20 · loose/100, from `jitter` of the note's
            place n among its track's notes in the score as written.
    Then the whole score is sorted as `read_score` sorts it. The page's `shapedScore` does the same.
    """
    if not any(any(s[key] for key in NOTE_KEYS) for s in by_track.values()):
        return score
    groups = {}
    for note in score.notes:
        groups.setdefault(track_of(note.route), []).append(note)
    notes = []
    for track, mine in groups.items():
        chosen = by_track.get(track)
        if not chosen or not any(chosen[key] for key in NOTE_KEYS):
            notes.extend(mine)
            continue
        items = list(enumerate(mine))                              # (n, note): n is the note's place as written
        if chosen['thin']:
            drop = int(math.floor(len(items) * 0.7 * chosen['thin'] / 100))
            # Times compared in whole microseconds: the page parses the MIDI itself and its times differ
            # from pretty_midi's in the 14th digit, which must not decide which of two equal notes goes.
            micro = lambda seconds: int(math.floor(seconds * 1e6 + 0.5))
            order = sorted(range(len(items)), key=lambda j: (items[j][1].velocity, micro(items[j][1].duration),
                                                                -micro(items[j][1].start), -j))
            gone = set(order[:drop])
            items = [item for j, item in enumerate(items) if j not in gone]
        if not items:
            continue
        mean = sum(note.velocity for _, note in items) / len(items)
        shaped = []
        for n, note in items:
            velocity = note.velocity
            if chosen['vel']:
                velocity = max(1, min(127, int(math.floor(mean + (velocity - mean) * 2.0 ** (chosen['vel'] / 50.0) + 0.5))))
            pitch = note.pitch if note.is_drum else note.pitch + 12 * chosen['oct']
            shaped.append([n, note, note.start, note.duration, pitch, velocity])
        if chosen['gate'] and track != 'drums':
            factor = 2.0 ** (chosen['gate'] / 50.0)
            starts = {}
            for row in shaped:
                starts.setdefault((row[1].route, row[4]), []).append(row[2])
            for key in starts:
                starts[key].sort()
            for row in shaped:
                length = row[3] * factor
                if chosen['gate'] > 0:
                    same = starts[(row[1].route, row[4])]
                    at = bisect.bisect_right(same, row[2])             # the next start strictly after this one
                    if at < len(same):
                        length = min(length, same[at] - row[2])
                row[3] = max(MIN_GATE, length)
        if chosen['late']:
            for row in shaped:
                row[2] = max(0.0, row[2] + chosen['late'] / 1000.0)
        if chosen['loose']:
            index = HASH_ORDER.index(track) if track in HASH_ORDER else len(HASH_ORDER)
            for row in shaped:
                row[2] = max(0.0, row[2] + jitter(row[0], 1, index) * (0.03 * chosen['loose'] / 100.0))
                row[5] = max(1, min(127, int(math.floor(row[5] + jitter(row[0], 2, index) * (20.0 * chosen['loose'] / 100.0) + 0.5))))
        for n, note, start, duration, pitch, velocity in shaped:
            notes.append(dataclasses.replace(note, start=start, duration=duration, pitch=pitch, velocity=velocity))
    notes.sort(key=lambda item: (item.start, item.route, item.pitch))
    return dataclasses.replace(score, notes=tuple(notes))


def kick_times(score):
    """When the kicks of a (shaped) score hit: what the pump follows."""
    return [note.start for note in score.notes if note.route == 'drums/kick']


def pump_settings(value):
    """The plan's `pump`, cleaned: {'depth': 0..100, 'release': 60..400 ms}."""
    out = {}
    for name, default in PUMP_DEFAULT.items():
        try:
            number = int(round(float((value or {}).get(name, default) if isinstance(value, dict) else default)))
        except (TypeError, ValueError):
            number = default
        out[name] = max(PUMP_LIMITS[name][0], min(PUMP_LIMITS[name][1], number))
    return out


def pump_envelope(kicks, frames, depth, release, start=0):
    """Gain per sample for samples start … start+frames-1 (at RATE) of the song (SPEC v20).

    After the most recent kick k ≤ t: 1 − d · min(1, (t−k)/5 ms) · exp(−(t−k)/release), with d = 0.8 · depth/100.
    Before any kick, or at depth 0: 1. The page's `pumpEnvelope` is the same formula sample by sample."""
    out = np.ones(frames, dtype=np.float64)
    if not depth or not len(kicks) or frames <= 0:
        return out
    hits = np.sort(np.asarray(kicks, dtype=np.float64))
    t = (start + np.arange(frames)) / RATE
    # A kick counts from 1 ns before its time: a kick on a sample must belong to that sample in the page
    # too, whose MIDI parser puts it 1e-13 s away from pretty_midi's.
    last = np.searchsorted(hits, t + KICK_SLACK, side='right') - 1
    live = last >= 0
    x = np.maximum(0.0, t[live] - hits[last[live]])
    d = 0.8 * depth / 100
    out[live] = 1 - d * np.minimum(1, x / 0.005) * np.exp(-x / (release / 1000))
    return out


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
