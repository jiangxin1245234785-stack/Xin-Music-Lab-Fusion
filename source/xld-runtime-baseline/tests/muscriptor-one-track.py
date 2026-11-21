"""MuScriptor track consolidation, unchanged stem bytes, and fusion names."""
import io
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from unittest.mock import patch
from uuid import uuid4

import pretty_midi as pm
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'analysis-midi'))
from merge import merge
from runner import PROFILES, merge_muscriptor_tracks, transcribe, validate_midi_roundtrip


def part(program, name, *notes):
    instrument = pm.Instrument(program, name=name)
    instrument.notes = [pm.Note(100, pitch, start, end) for pitch, start, end in notes]
    return instrument


def midi(*parts):
    result = pm.PrettyMIDI(initial_tempo=120, resolution=960)
    result.instruments = list(parts)
    return result


def notes(result):
    return sorted((n.pitch, n.start, n.end) for p in result.instruments for n in p.notes)


def write(result, path):
    result.write(str(path))
    validate_midi_roundtrip(result, path)
    return path


ACOUSTIC = 'acoustic guitar'
DISTORTED = 'distorted electric guitar'
ONETRACK = {f'{prefix}muscriptor-{size}' for prefix in ('', 'piano-', 'bass-')
            for size in ('medium', 'large')}
assert {engine for engine, profile in PROFILES.items() if 'oneTrack' in profile['options']} == (
    ONETRACK | {'other-muscriptor-medium', 'other-muscriptor-large'}
)
for engine in ONETRACK:
    profile = PROFILES[engine]
    assert profile['model'].endswith('-stemvel1-onetrack1')
    assert profile['options']['adapterVersion'] == 2
    assert profile['options']['oneTrack'] == {'dedupeMs': 50}

result = midi(part(25, ACOUSTIC, (60, 0.5, 0.8)),
              part(30, DISTORTED, (60, 0.55, 0.9), (64, 1.0, 1.4)))
summary = merge_muscriptor_tracks(result, 50)
assert [(p.program, p.name) for p in result.instruments] == [(30, DISTORTED)]
assert notes(result) == [(60, 0.55, 0.9), (64, 1.0, 1.4)]
assert summary['sourceTracks'] == [
    {'program': 25, 'name': ACOUSTIC, 'noteCount': 1},
    {'program': 30, 'name': DISTORTED, 'noteCount': 2},
]
assert summary['deduplicatedNotes'] == 1 and summary['extraOverlapTracks'] == 0
assert 'one track per stem' in summary['programMode']

chain = midi(part(30, DISTORTED, (60, 0.5, 0.6), (65, 1.0, 1.1), (69, 1.1, 1.2)),
             part(27, 'clean electric guitar', (60, 0.54, 0.64), (66, 1.0, 1.1)),
             part(25, ACOUSTIC, (60, 0.58, 0.68)))
assert merge_muscriptor_tracks(chain, 50)['deduplicatedNotes'] == 1
assert [event for event in notes(chain) if event[0] == 60] == [(60, 0.5, 0.6), (60, 0.58, 0.68)]

high = part(30, DISTORTED, (60, 0.5, 0.7))
low = part(25, ACOUSTIC, (63, 0.52, 0.72))
high.pitch_bends = [pm.PitchBend(40, 0.6)]
low.pitch_bends = [pm.PitchBend(-30, 0.4)]
high.control_changes = [pm.ControlChange(7, 30, 0.8)]
low.control_changes = [pm.ControlChange(7, 90, 0.2)]
result = midi(high, low)
assert merge_muscriptor_tracks(result, 50)['deduplicatedNotes'] == 0
assert [(p.program, p.name) for p in result.instruments] == [(25, ACOUSTIC)]
assert notes(result) == [(60, 0.5, 0.7), (63, 0.52, 0.72)]
assert [(n.pitch, n.time) for n in result.instruments[0].pitch_bends] == [(-30, 0.4), (40, 0.6)]
assert [(n.value, n.time) for n in result.instruments[0].control_changes] == [(90, 0.2), (30, 0.8)]

cross_source = midi(part(30, DISTORTED, (60, 0.5, 0.8)),
                    part(25, ACOUSTIC, (60, 0.551, 0.9)))
same_source = midi(part(30, DISTORTED, (60, 0.5, 0.8), (60, 0.52, 0.9)))
disabled = midi(part(30, DISTORTED, (60, 0.5, 0.8)),
                part(25, ACOUSTIC, (60, 0.52, 0.9)))

with TemporaryDirectory() as temporary:
    root = Path(temporary)
    for result, window, name in ((cross_source, 50, ACOUSTIC), (same_source, 50, DISTORTED),
                                 (disabled, 0, ACOUSTIC)):
        expected = notes(result)
        summary = merge_muscriptor_tracks(result, window)
        assert summary['deduplicatedNotes'] == 0 and summary['extraOverlapTracks'] == 1
        assert [p.name for p in result.instruments] == [name, f'{name} / overlap 2']
        assert notes(result) == expected
        write(result, root / 'overlap.mid')

    audio = root / 'stem.wav'
    sf.write(audio, [0.] * 16000, 8000)
    for stem, group_names, input_programs, output_programs in (
        ('strings', ('violin', 'cello'), (40, 42), (48, 48)),
        ('winds', ('trumpet', 'clarinet'), (56, 71), (56, 71)),
    ):
        engine = f'{stem}-muscriptor-medium'
        fixture_notes = ((60, 0.5, 0.75), (60, 0.5, 1.25))
        detected = midi(*(part(program, name, event) for program, name, event
                          in zip(input_programs, group_names, fixture_notes)))
        expected = midi(*(part(program, name, event) for program, name, event
                          in zip(output_programs, group_names, fixture_notes)))
        for track in expected.instruments:
            track.notes[0].velocity = 79
        buffer = io.BytesIO()
        expected.write(buffer)
        with patch('muscriptor_backend.predict', return_value=(detected, {})):
            result = transcribe(audio, root / f'{stem}.json', 'test', stem,
                                str(uuid4()), str(uuid4()), notify=lambda *_: None, engine=engine)
        assert (root / result['file']).read_bytes() == buffer.getvalue(), stem
        assert 'sourceTracks' not in result['backend']

    detected = midi(part(25, ACOUSTIC, (60, 0.5, 0.75)),
                    part(30, DISTORTED, (60, 0.52, 1.25), (65, 1.0, 1.25)))
    with patch('muscriptor_backend.predict', return_value=(detected, {})):
        result = transcribe(audio, root / 'guitar.json', 'test', 'guitar',
                            str(uuid4()), str(uuid4()), notify=lambda *_: None, engine='muscriptor-medium')
    assert result['backend']['deduplicatedNotes'] == 1 and result['noteCount'] == 2

    piano = write(midi(part(0, 'acoustic piano', (60, 0.5, 1.0))), root / 'piano.mid')
    winds = write(midi(part(56, 'trumpet', (60, 0.5, 1.0)),
                       part(71, 'clarinet', (64, 0.6, 0.9))), root / 'winds.mid')
    merged = root / 'merged.mid'
    parts = [
        {'stem': 'guitar', 'model': result['model'], 'path': root / result['file']},
        {'stem': 'piano', 'model': PROFILES['piano-transkun']['model'], 'path': piano},
        {'stem': 'winds', 'model': PROFILES['winds-muscriptor-medium']['model'], 'path': winds},
    ]
    # Four tracks plus twelve others exceed the pitched-channel budget by one.
    parts.extend({'stem': f'fixture-{i}', 'path': piano} for i in range(12))
    summary = merge(parts, merged)
    assert summary['folded'] == ['winds']
    assert [p.name for p in pm.PrettyMIDI(str(merged)).instruments[:3]] == [
        f'guitar / {DISTORTED}', 'piano', 'winds']

print('muscriptor-one-track: ok')
