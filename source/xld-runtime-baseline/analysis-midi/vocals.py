"""Monophonic lead-vocal transcription from the separated vocals stem (pYIN + segmentation).

The lead is the most recognisable line in a song, and until now it was the one stem XLD
separated but never transcribed. Re-voiced without it, a song often cannot be identified
at all.

pYIN gives a pitch per frame and a probability that the frame is voiced at all. Three
things stand between that and notes, and each is a real failure mode rather than a tuning
preference:

* A separated vocal is full of breath, consonants and bleed, all of which pYIN will
  happily assign a pitch to. The gate is therefore on pYIN's own voicing probability *and*
  on the stem's short-time level relative to its own loud passages — an absolute dB floor
  would depend on how hot the separation happened to be.
* pYIN reports the octave wrong on a minority of frames, most often on low or breathy
  notes. Left alone those become notes an octave out in the middle of a phrase, which is
  far more audible than a missing note. `correct_octaves` pulls a frame back when ±12
  semitones lands it closer to what the singer is doing around it.
* Vibrato is ±50 cents or more, and portamento slides through every semitone between two
  notes. Rounding frame by frame would shatter one held note into a dozen, so the contour
  is median-filtered in the semitone domain and a new pitch has to hold for several frames
  before it is committed.

Velocity is not set here. The backend returns a constant and declares it, and the profile
carries `velocityFromStem`, so the runner's existing stem-energy pass gives the part its
dynamics from the same vocals stem — the same code path the guitar and strings use.
"""
import math

FMIN, FMAX = 65.0, 1047.0           # C2..C6, wide enough for any sung lead
FRAME_LENGTH = 2048


def ready(profile):
    import importlib.util
    return all(importlib.util.find_spec(name) for name in ('librosa', 'numpy', 'soundfile', 'pretty_midi'))


def read_mono(audio_path, rate):
    """Mono float32 at `rate`. pYIN costs time proportional to the sample rate and gains
    nothing above a few kHz of bandwidth for an f0 under 1 kHz."""
    import numpy as np
    import librosa
    import soundfile as sf
    audio, source_rate = sf.read(str(audio_path), dtype='float32', always_2d=True)
    mono = audio.mean(axis=1) if audio.shape[1] > 1 else audio[:, 0]
    if source_rate != rate:
        mono = librosa.resample(mono, orig_sr=source_rate, target_sr=rate)
    return np.ascontiguousarray(mono), source_rate


def active_regions(rms, hop, rate, floor_db, pad_seconds, join_seconds):
    """Frame ranges where the stem is loud enough to be worth tracking.

    pYIN is by far the most expensive step, and on a separated vocal most of the song is
    silence between phrases — on a real track about two thirds of the frames are thrown
    away by the gate *after* paying to pitch them. Finding the loud stretches first costs
    one RMS pass and skips that work. Regions are padded and then merged, so a phrase is
    never cut at its edges and pYIN still sees whole phrases rather than arbitrary chunks.
    """
    import numpy as np
    level = 20 * np.log10(np.maximum(rms, 1e-7))
    finite = level[np.isfinite(level)]
    if not finite.size:
        return []
    loud = level >= float(np.percentile(finite, 90)) + floor_db
    if not loud.any():
        return []
    pad = max(1, int(round(pad_seconds * rate / hop)))
    join = max(1, int(round(join_seconds * rate / hop)))
    edges = np.flatnonzero(np.diff(np.concatenate(([0], loud.view(np.int8), [0]))))
    regions = []
    for start, end in zip(edges[::2], edges[1::2]):
        start, end = max(0, int(start) - pad), min(len(rms), int(end) + pad)
        if regions and start - regions[-1][1] <= join:
            regions[-1][1] = end
        else:
            regions.append([start, end])
    return [tuple(region) for region in regions]


def contour(mono, rate, hop, fmin, fmax, floor_db=-66.0, pad_seconds=.25, join_seconds=.3):
    """(f0 in Hz, voiced flag, voicing probability, frame rms) — all the same length.

    pYIN runs only on the loud regions; everything else stays unvoiced, which is what the
    gate would have decided anyway.
    """
    import numpy as np
    import librosa
    rms = librosa.feature.rms(y=mono, frame_length=FRAME_LENGTH, hop_length=hop)[0]
    frames = len(rms)
    f0 = np.full(frames, np.nan)
    voiced = np.zeros(frames, bool)
    probability = np.zeros(frames)

    for start, end in active_regions(rms, hop, rate, floor_db, pad_seconds, join_seconds):
        chunk = mono[start * hop:min(len(mono), end * hop + FRAME_LENGTH)]
        if chunk.size < FRAME_LENGTH:
            continue
        part_f0, part_voiced, part_probability = librosa.pyin(
            chunk, fmin=fmin, fmax=fmax, sr=rate, frame_length=FRAME_LENGTH, hop_length=hop)
        width = min(len(part_f0), frames - start)
        f0[start:start + width] = part_f0[:width]
        voiced[start:start + width] = part_voiced[:width]
        probability[start:start + width] = np.nan_to_num(part_probability[:width])
    return f0, voiced, probability, rms


def gate(f0, voiced, probability, rms, min_probability, level_floor_db):
    """Which frames are really the singer. The level floor is relative to this stem's own
    90th percentile, so it does not depend on how loud the separation came out."""
    import numpy as np
    level = 20 * np.log10(np.maximum(rms, 1e-7))
    usable = voiced & np.isfinite(level) & np.isfinite(f0)
    if not usable.any():
        return np.zeros(len(f0), bool)
    reference = float(np.percentile(level[usable], 90))
    return usable & (probability >= min_probability) & (level >= reference + level_floor_db)


def correct_octaves(pitch, keep, block_frames, tolerance):
    """Pull frames that pYIN put an octave out back toward the local melody.

    The reference is a median per block rather than one median for the song: a chorus an
    octave above a verse is the singer, not an error, and a single global centre would
    'correct' the whole chorus into the verse.
    """
    import numpy as np
    out = pitch.copy()
    blocks = max(1, int(math.ceil(len(pitch) / block_frames)))
    centres = np.full(blocks, np.nan)
    for index in range(blocks):
        chunk = pitch[index * block_frames:(index + 1) * block_frames]
        mask = keep[index * block_frames:(index + 1) * block_frames]
        if mask.sum() >= 5:
            centres[index] = float(np.median(chunk[mask]))
    if np.all(np.isnan(centres)):
        return out
    # Fill empty blocks from their neighbours so every frame has a reference.
    valid = np.flatnonzero(~np.isnan(centres))
    centres = np.interp(np.arange(blocks), valid, centres[valid])
    reference = np.repeat(centres, block_frames)[:len(pitch)]
    for shift in (12.0, -12.0, 24.0, -24.0):
        moved = out + shift
        better = keep & (np.abs(out - reference) > tolerance) & \
            (np.abs(moved - reference) + 3.0 < np.abs(out - reference))
        out[better] = moved[better]
    return out


def segment(pitch, keep, hop, rate, median_frames, hysteresis, min_note, join_gap):
    """Cut the gated, smoothed contour into (start, end, pitch) on the seconds timeline."""
    import numpy as np
    smoothed = pitch.copy()
    half = median_frames // 2
    if half:
        for index in np.flatnonzero(keep):
            window = pitch[max(0, index - half):index + half + 1]
            window = window[keep[max(0, index - half):index + half + 1]]
            if window.size:
                smoothed[index] = float(np.median(window))
    seconds = lambda frame: frame * hop / rate

    notes, start, current, held = [], None, None, 0
    for index in range(len(smoothed)):
        if not keep[index] or not np.isfinite(smoothed[index]):
            if current is not None:
                notes.append((seconds(start), seconds(index), current))
            start, current, held = None, None, 0
            continue
        rounded = int(round(smoothed[index]))
        if current is None:
            start, current, held = index, rounded, 0
        elif rounded == current:
            held = 0
        else:
            held += 1
            # A new pitch only counts once it has held: one frame across the boundary is
            # vibrato, or a portamento passing through on its way somewhere else.
            if held >= hysteresis:
                notes.append((seconds(start), seconds(index - held + 1), current))
                start, current, held = index - held + 1, rounded, 0
    if current is not None:
        notes.append((seconds(start), seconds(len(smoothed)), current))

    merged = []
    for note in notes:
        if merged and note[2] == merged[-1][2] and note[0] - merged[-1][1] < join_gap:
            merged[-1] = (merged[-1][0], note[1], note[2])
        else:
            merged.append(note)
    return [note for note in merged if note[1] - note[0] >= min_note]


def drop_outliers(notes, span):
    """Discard notes a long way from the median of what was actually sung.

    After octave correction the survivors are usually a handful of frames pYIN pitched off
    a consonant. `span` is generous on purpose: a real lead can cover two octaves.
    """
    import numpy as np
    if len(notes) < 8:
        return notes, 0
    centre = float(np.median([pitch for _, _, pitch in notes]))
    kept = [note for note in notes if abs(note[2] - centre) <= span]
    return kept, len(notes) - len(kept)


def predict(audio_path, profile, notify, duration):
    import numpy as np
    import pretty_midi
    options = profile['options']
    rate = int(options.get('analysisRate', 22050))
    hop = int(options.get('hopLength', 256))
    fmin, fmax = float(options.get('fmin', FMIN)), float(options.get('fmax', FMAX))
    if not 0 < fmin < fmax:
        raise ValueError('人声音高范围无效')

    notify('读取人声分轨', .05, 'decode')
    mono, source_rate = read_mono(audio_path, rate)
    if mono.size < FRAME_LENGTH:
        raise ValueError('人声分轨太短')
    notify('pYIN · 正在跟踪音高', .1, 'transcribe')
    f0, voiced, probability, rms = contour(mono, rate, hop, fmin, fmax)

    notify('切分音符', .85, 'segment')
    keep = gate(f0, voiced, probability, rms,
                float(options.get('minVoicedProbability', .25)),
                float(options.get('levelFloorDb', -60.0)))
    pitch = np.full(len(f0), np.nan)
    pitch[keep] = 69 + 12 * np.log2(np.maximum(f0[keep], 1e-6) / 440.0)
    before = pitch.copy()
    pitch = correct_octaves(pitch, keep, max(1, int(options.get('octaveBlockSeconds', 2.0) * rate / hop)),
                            float(options.get('octaveToleranceSemitones', 7.0)))
    shifted = int(np.sum(keep & (np.abs(pitch - before) > 1e-6)))

    spans = segment(pitch, keep, hop, rate,
                    int(options.get('medianFrames', 3)),
                    max(1, int(options.get('hysteresisFrames', 2))),
                    float(options.get('minNoteSeconds', .06)),
                    float(options.get('joinGapSeconds', .06)))
    spans, outliers = drop_outliers(spans, float(options.get('outlierSpanSemitones', 24.0)))

    midi = pretty_midi.PrettyMIDI()
    part = pretty_midi.Instrument(program=int(options.get('program', 53)), is_drum=False, name='vocals')
    for start, end, value in spans:
        if 0 <= value <= 127 and end > start:
            part.notes.append(pretty_midi.Note(100, int(value), float(start), float(min(end, duration))))
    midi.instruments.append(part)

    sung = sum(note.end - note.start for note in part.notes)
    pitches = [note.pitch for note in part.notes]
    backend = {
        'name': 'pyin-monophonic', 'device': 'cpu', 'velocityMode': 'constant-100',
        'analysisRate': rate, 'hopLength': hop, 'sourceSampleRate': source_rate,
        'voicedFrames': int(voiced.sum()), 'gatedFrames': int(keep.sum()),
        'framesTotal': int(len(f0)), 'octaveCorrectedFrames': shifted,
        'outliersDropped': outliers, 'noteCount': len(part.notes),
        'sungSeconds': round(sung, 2),
        'coverage': round(sung / duration, 4) if duration else 0.0,
        'pitchRange': [min(pitches), max(pitches)] if pitches else None,
    }
    return midi, backend


def selftest():
    """Synthetic check: a sung phrase comes back as the notes it was built from, a held
    note with vibrato stays one note, and an octave slip is pulled back."""
    import json
    import tempfile
    from pathlib import Path
    import numpy as np
    import soundfile as sf

    rate = 22050
    phrase = [(60, .0, .5), (62, .5, 1.0), (64, 1.0, 1.5), (65, 1.5, 2.0), (67, 2.0, 3.0)]
    total = int(4.0 * rate)
    audio = np.zeros(total, np.float32)
    for pitch, start, end in phrase:
        frequency = 440 * 2 ** ((pitch - 69) / 12)
        index = np.arange(int((end - start) * rate))
        t = index / rate
        wobble = 1 + .004 * np.sin(2 * np.pi * 5.5 * t) * (t > .2)   # vibrato on the held note
        wave = np.zeros_like(t)
        for harmonic, level in ((1, 1.0), (2, .5), (3, .25), (4, .12)):
            wave += level * np.sin(2 * np.pi * harmonic * frequency * np.cumsum(wobble) / rate)
        envelope = np.minimum(1.0, index / (.01 * rate)) * np.minimum(1.0, (len(t) - index) / (.01 * rate))
        audio[int(start * rate):int(start * rate) + len(t)] += (wave * envelope / 1.9).astype(np.float32)

    profile = {'options': {'analysisRate': rate, 'program': 53}}
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / 'vocals.wav'
        sf.write(str(path), audio, rate)
        midi, backend = predict(path, profile, lambda *a, **k: None, 4.0)

    notes = midi.instruments[0].notes
    assert notes, 'nothing transcribed'
    heard = [note.pitch for note in notes]
    for pitch, _, _ in phrase:
        assert pitch in heard, f'{pitch} 没被转出来，得到 {heard}'
    held = [note for note in notes if note.pitch == 67]
    assert len(held) == 1, f'带揉弦的长音被切成了 {len(held)} 个'
    assert held[0].end - held[0].start > .7, f'长音只有 {held[0].end - held[0].start:.2f}s'
    assert backend['velocityMode'] == 'constant-100', backend
    assert {note.velocity for note in notes} == {100}, '力度由 runner 的分轨能量那一步给'

    # An octave slip in the middle of a phrase is pulled back, not kept.
    pitch = np.full(400, np.nan)
    keep = np.zeros(400, bool)
    pitch[50:350] = 60.0
    keep[50:350] = True
    pitch[180:190] = 48.0
    fixed = correct_octaves(pitch, keep, 100, 7.0)
    assert np.allclose(fixed[180:190], 60.0), fixed[180:190]
    assert np.allclose(fixed[200:210], 60.0), 'correct_octaves 动了本来就对的帧'
    print(json.dumps({'ok': True, 'notes': len(notes), 'pitches': sorted(set(heard)),
                      'coverage': backend['coverage']}, ensure_ascii=False))


if __name__ == '__main__':
    import sys
    if '--selftest' in sys.argv:
        selftest()
    else:
        raise SystemExit('usage: vocals.py --selftest')
