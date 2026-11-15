"""Stem-energy relative velocity for backends that transcribe pitch but not dynamics.

MuScriptor and YourMT3 return every note at velocity 100 (`velocityMode: constant-100`),
and plain ADTOF at a fixed velocity from its profile. Downstream that is a part with no
dynamics at all: XLD's own audition and any re-voicing of the export play every note at
one level.

The technique here is the one `drumkit.py` already uses for drum hits (R3, freeze v1 §6),
lifted to pitched parts: each onset's short-time RMS peak (dB) is measured on the very
stem the notes were transcribed from, and the run's onsets are mapped onto a velocity
range by percentile. Like the drum path this is a *relative* dynamic -- this track's own
loud and quiet -- not the recording's true performance velocity.

Two things differ from the drum path, both because a pitched stem is one signal rather
than six separated kit stems:

* Notes that share an onset share a velocity. A strummed chord is one gesture with one
  energy; measuring six notes separately on the same audio would only return the same
  number six times, and grouping says so explicitly.
* One percentile scale covers the whole run, not one per track. MuScriptor splits a
  guitar stem into acoustic / clean / distorted tracks that all sound in that one stem,
  so scaling each separately would normalise away the balance between them -- a quiet
  doubling track would come back as loud as the lead. Drum classes keep a scale each,
  as they do in `drumkit.py`, because a kick and a hi-hat are not comparable in dB.
"""
import math


def onset_db(audio, onset, rate, options):
    """Peak short-time RMS (dB) of mono `audio` in [onset - pre, onset + post].

    `audio` is float32 (T,) mono at `rate`. Returns -120.0 for an empty window, which
    sorts below any real signal and so lands on the velocity floor.
    """
    import numpy as np
    frame = max(1, int(round(options.get('energyFrameSeconds', .005) * rate)))
    start = max(0, int(round((onset - options.get('windowPreSeconds', .01)) * rate)))
    end = min(audio.shape[-1], int(round((onset + options.get('windowPostSeconds', .12)) * rate)))
    if end <= start:
        return -120.0
    window = audio[start:end]
    count = (len(window) // frame) * frame
    if count == 0:
        rms = float(np.sqrt(np.mean(window ** 2)))
    else:
        frames = window[:count].reshape(-1, frame)
        rms = float(np.sqrt(np.mean(frames ** 2, axis=1)).max())
        if len(window) > count:
            rms = max(rms, float(np.sqrt(np.mean(window[count:] ** 2))))
    return 20 * math.log10(max(rms, 1e-7))


def read_mono(audio_path, rate=None):
    """Mono float32 samples of a stem plus its sample rate; no resampling, no copy of channels."""
    import sys
    import numpy as np
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import stem_audio  # a stem may be a marked FLAC at half level; read() applies the gain (XML's dynamics job too)
    samples, source_rate = stem_audio.read(str(audio_path), dtype='float32', always_2d=True)
    mono = samples.mean(axis=1) if samples.shape[1] > 1 else samples[:, 0]
    return np.ascontiguousarray(mono), source_rate


def scale_keys(values, floor, ceil, low_p, high_p, minimum, pool):
    """Map each key's dB list onto floor..ceil by percentile. Returns ({key: fn}, {key: summary}).

    A key with fewer than `minimum` onsets borrows `pool` -- too few hits to say what this
    key's own loud and quiet are, exactly as the drum path does for a rare cymbal.

    A key whose onsets are all the same loudness has no dynamic to map, and dividing by that
    zero range would send the whole key to the floor: a steady programmed hi-hat, or a part
    over silence, would come out 12 dB down for having been even. There is nothing to say
    about such a key, so every one of its notes gets the middle of the range instead.
    """
    import numpy as np
    functions, summary = {}, {}
    middle = (floor + ceil) // 2
    for key, dbs in values.items():
        measured = np.asarray(dbs, np.float64)
        borrowed = len(measured) < minimum
        source = np.asarray(pool, np.float64) if borrowed else measured
        low, high = float(np.percentile(source, low_p)), float(np.percentile(source, high_p))
        flat = high - low < 1e-6
        functions[key] = (lambda db: middle) if flat else (lambda low, high: lambda db: int(round(
            floor + (ceil - floor) * min(1.0, max(0.0, (db - low) / (high - low))))))(low, high)
        summary[key] = {'lowDb': round(low, 2), 'highDb': round(high, 2), 'onsets': int(len(measured)),
                        'pooled': bool(borrowed), 'flat': bool(flat)}
    return functions, summary


def apply(midi, audio_path, options, group_by_pitch=False):
    """Rewrite every note velocity in `midi` from the energy of `audio_path` at its onset.

    `midi` is a pretty_midi.PrettyMIDI whose notes were transcribed from `audio_path`.
    Notes are grouped by onset (and by pitch for drums, where each class gets its own
    scale); every note in a group takes the group's velocity. Returns a summary dict for
    the backend manifest. Mutates `midi` in place.
    """
    import numpy as np
    floor, ceil = int(options.get('velocityFloor', 32)), int(options.get('velocityCeil', 127))
    low_p, high_p = float(options.get('percentileLow', 10)), float(options.get('percentileHigh', 98))
    minimum = int(options.get('minimumOnsetsForScale', 4))
    quantum = float(options.get('onsetGroupSeconds', .01))
    if not 0 <= floor <= ceil <= 127:
        raise ValueError('力度范围必须满足 0 <= floor <= ceil <= 127')
    if quantum <= 0:
        raise ValueError('起音分组窗口必须为正')
    notes = [note for part in midi.instruments for note in part.notes]
    if not notes:
        return {'velocityMode': 'stem-energy-relative', 'onsets': 0, 'notes': 0, 'scales': {}}

    mono, rate = read_mono(audio_path)
    if mono.size == 0:
        raise ValueError('力度参考分轨为空')
    # One measurement per distinct onset (per class for drums): notes that sound together
    # share the audio they would each be measured on.
    groups = {}
    for note in notes:
        groups.setdefault((note.pitch if group_by_pitch else 'all', round(note.start / quantum)), []).append(note)
    energies = {key: onset_db(mono, bucket[0].start, rate, options) for key, bucket in groups.items()}

    by_key = {}
    for (key, _), db in energies.items():
        by_key.setdefault(key, []).append(db)
    pool = list(energies.values())
    functions, summary = scale_keys(by_key, floor, ceil, low_p, high_p, minimum, pool)
    for group_key, bucket in groups.items():
        velocity = functions[group_key[0]](energies[group_key])
        for note in bucket:
            note.velocity = velocity
    measured = np.asarray(pool, np.float64)
    return {'velocityMode': 'stem-energy-relative', 'onsets': len(groups), 'notes': len(notes),
            'velocityFloor': floor, 'velocityCeil': ceil,
            'groupedBy': 'onset+pitch' if group_by_pitch else 'onset',
            'onsetGroupSeconds': quantum, 'referenceSampleRate': rate,
            'medianDb': round(float(np.median(measured)), 2),
            'scales': {str(key): value for key, value in summary.items()}}


def selftest():
    """Synthetic check: louder bursts get higher velocity, a chord's notes share one."""
    import json
    import tempfile
    from pathlib import Path
    import numpy as np
    import pretty_midi
    import soundfile as sf

    rate = 44100
    audio = np.zeros(rate * 6, np.float32)
    for index, amplitude in enumerate([.05, .1, .2, .4, .8]):
        start = int((.5 + index) * rate)
        audio[start:start + 4410] = amplitude
    audio[int(5.5 * rate):int(5.5 * rate) + 4410] = .3  # the chord's onset
    midi = pretty_midi.PrettyMIDI()
    part = pretty_midi.Instrument(program=24, name='guitar')
    for index in range(5):
        part.notes.append(pretty_midi.Note(100, 60 + index, .5 + index, 1.2 + index))
    for pitch in (55, 59, 62, 67):  # one strum: four notes, one onset
        part.notes.append(pretty_midi.Note(100, pitch, 5.5, 6.0))
    midi.instruments.append(part)

    with tempfile.TemporaryDirectory() as directory:
        reference = Path(directory) / 'stem.wav'
        sf.write(str(reference), audio, rate)
        summary = apply(midi, reference, {})

    velocities = [note.velocity for note in midi.instruments[0].notes]
    ramp, chord = velocities[:5], velocities[5:]
    assert ramp == sorted(ramp), ramp
    assert ramp[0] == 32 and ramp[-1] == 127, ramp
    assert len(set(ramp)) == 5, ramp
    assert len(set(chord)) == 1, chord
    assert summary['onsets'] == 6 and summary['notes'] == 9, summary
    assert summary['velocityMode'] == 'stem-energy-relative'
    # A silent reference must not throw, and must not drive the part to the floor for
    # having no dynamic: an even part comes out even, in the middle of the range.
    silent = pretty_midi.PrettyMIDI()
    quiet = pretty_midi.Instrument(program=24, name='guitar')
    quiet.notes.extend(pretty_midi.Note(100, 60, index * .5, index * .5 + .2) for index in range(6))
    silent.instruments.append(quiet)
    with tempfile.TemporaryDirectory() as directory:
        reference = Path(directory) / 'silence.wav'
        sf.write(str(reference), np.zeros(rate * 6, np.float32), rate)
        flat_summary = apply(silent, reference, {})
    assert {note.velocity for note in silent.instruments[0].notes} == {79}, 'an even part is even, not quiet'
    assert flat_summary['scales']['all']['flat'] is True, flat_summary
    print(json.dumps({'ok': True, 'ramp': ramp, 'chord': chord, 'scales': summary['scales']}, ensure_ascii=False))


if __name__ == '__main__':
    import sys
    if '--selftest' in sys.argv:
        selftest()
    else:
        raise SystemExit('usage: velocity.py --selftest')
