"""Lead-vocal notes and pitch contour, from voiceswap's lead split and its guarded RMVPE contour.

    <envs/basic>/python.exe -X utf8 layer_vocals.py <lead f0 .npy> <lead mono .wav> <out.json>

The contour is the one `source/voiceswap/swap.py` saves next to a conversion
(`<stem>.f0.npy`, Hz at 100 frames a second, 0 where unvoiced), taken on the *lead* that
`karaoke_split.py` separated from the vocal stem. That chain is the cleanest pitch source
the project has: on 七里香 the octave guard had nothing to lift on the separated lead,
where the whole vocal stem needed 69 lifts. `analysis-midi/vocals.py`'s pYIN contour is
deliberately not used as the curve (confirmed octave errors on a stem with harmony), but
its `segment` and `drop_outliers` are pitch-source agnostic and are reused as they are,
with the `vocals-pyin` profile's own settings, so notes are cut the way XLD cuts them.

Velocity comes from XLD's `velocity.apply` on the lead audio, the same stem-energy pass
every other constant-velocity part gets.

Everything is read-only on its inputs. Times are seconds from the audio zero of the stems,
which the lead split and RMVPE both preserve (frame k sits at k / 100 s).
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
MIDI = REPO / 'source' / 'xld-runtime-baseline' / 'analysis-midi'
FPS = 100                     # RMVPE: 160-sample hop at 16 kHz
LEVEL_FLOOR_DB = -40.0        # under the lead's own loud passages; RMVPE's voicing does the rest
FRAME = 1024


def profiles(node):
    if isinstance(node, dict):
        if 'id' in node and 'options' in node:
            yield node
        for value in node.values():
            yield from profiles(value)
    elif isinstance(node, list):
        for value in node:
            yield from profiles(value)


def frame_levels(audio, rate, frames):
    """Short-time level (dB) centred on each contour frame."""
    import numpy as np
    hop = rate / FPS
    padded = np.pad(audio, (FRAME // 2, FRAME))
    level = np.full(frames, -140.0)
    for k in range(frames):
        start = int(round(k * hop))
        chunk = padded[start:start + FRAME]
        if chunk.size:
            level[k] = 20 * np.log10(max(float(np.sqrt(np.mean(chunk ** 2))), 1e-7))
    return level


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    if len(argv) != 3:
        raise SystemExit(__doc__)
    f0_path, audio_path, out = (Path(a).resolve() for a in argv)
    sys.path.insert(0, str(MIDI))

    import numpy as np
    import pretty_midi
    import soundfile as sf
    import velocity
    import vocals

    options = next(p for p in profiles(json.loads((MIDI / 'models.json').read_text(encoding='utf-8')))
                   if p['id'] == 'vocals-pyin')['options']
    f0 = np.asarray(np.load(f0_path), dtype=np.float64)
    audio, rate = sf.read(str(audio_path), dtype='float32', always_2d=True)
    mono = np.ascontiguousarray(audio.mean(axis=1))
    seconds = len(mono) / rate
    if abs(len(f0) / FPS - seconds) > 0.05:
        raise SystemExit(f'音高曲线 {len(f0) / FPS:.2f}s 和主唱音频 {seconds:.2f}s 对不上，不是同一次分离')

    voiced = f0 > 1
    level = frame_levels(mono, rate, len(f0))
    reference = float(np.percentile(level[voiced], 90)) if voiced.any() else 0.0
    keep = voiced & (level >= reference + LEVEL_FLOOR_DB)
    pitch = np.full(len(f0), np.nan)
    pitch[keep] = 69 + 12 * np.log2(f0[keep] / 440.0)

    # hop=1, rate=FPS makes vocals.segment's `frame * hop / rate` come out in seconds.
    spans = vocals.segment(pitch, keep, 1, FPS,
                           int(options.get('medianFrames', 3)), max(1, int(options.get('hysteresisFrames', 2))),
                           float(options.get('minNoteSeconds', .06)), float(options.get('joinGapSeconds', .06)))
    spans, outliers = vocals.drop_outliers(spans, float(options.get('outlierSpanSemitones', 24.0)))

    midi = pretty_midi.PrettyMIDI()
    part = pretty_midi.Instrument(program=53, name='vocals')
    for start, end, value in spans:
        if 0 <= value <= 127 and end > start:
            part.notes.append(pretty_midi.Note(100, int(value), float(start), float(min(end, seconds))))
    midi.instruments.append(part)
    dynamics = velocity.apply(midi, audio_path, dict(options.get('velocityFromStem') or {}))

    notes = [[round(n.start, 3), round(n.end - n.start, 3), int(n.pitch), int(n.velocity)]
             for n in sorted(part.notes, key=lambda n: (n.start, n.pitch))]
    durations = np.array([n[1] for n in notes]) if notes else np.array([0.0])
    record = {
        'schemaVersion': 1, 'kind': 'vocal-line',
        'lane': {
            'id': 'vocals', 'label': '人声', 'kind': 'melody', 'notes': notes,
            'contour': {'hop': 1 / FPS, 'start': 0,
                        'midi': [None if not k else round(float(p), 2) for k, p in zip(keep, pitch)]},
        },
        'provenance': {
            'f0': str(f0_path), 'audio': str(audio_path),
            'pitchSource': 'voiceswap: karaoke lead split + RMVPE with octave guard (swap.py)',
            'segmentation': 'xld analysis-midi/vocals.segment + drop_outliers, vocals-pyin options',
            'velocity': dynamics.get('velocityMode'),
        },
        'stats': {
            'frames': int(len(f0)), 'voicedFrames': int(voiced.sum()), 'keptFrames': int(keep.sum()),
            'notes': len(notes), 'sungSeconds': round(float(durations.sum()), 1), 'outliersDropped': int(outliers),
            'pitchRange': [min(n[2] for n in notes), max(n[2] for n in notes)] if notes else None,
            'durationP10P50P90': [round(float(np.percentile(durations, p)), 3) for p in (10, 50, 90)],
            'under120ms': int((durations < 0.12).sum()),
        },
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(record, ensure_ascii=False), encoding='utf-8')
    stats = record['stats']
    print(f'  人声：{stats["notes"]} 个音符，唱了 {stats["sungSeconds"]} 秒，音域 {stats["pitchRange"]}，'
          f'时长中位 {stats["durationP10P50P90"][1]} 秒，短于 120 ms 的 {stats["under120ms"]} 个', flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
