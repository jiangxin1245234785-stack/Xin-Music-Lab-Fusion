"""Test the Other stem against a synthetic MuScriptor decode."""
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from unittest.mock import patch
from uuid import uuid4

import numpy as np
import pretty_midi as pm
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'analysis-midi'))
from muscriptor_backend import instrument_names
from runner import PROFILES, transcribe


for size in ('medium', 'large'):
    profile = PROFILES[f'other-muscriptor-{size}']
    strings = PROFILES[f'strings-muscriptor-{size}']
    expected_options = {key: value for key, value in strings['options'].items()
                        if key not in ('instruments', 'instrumentsByTarget', 'gapFillMs')}
    assert profile['options'] == {**expected_options, 'oneTrack': {'dedupeMs': 50}}
    assert profile['checkpoint'] == strings['checkpoint']
    assert profile['backend'] == 'muscriptor' and profile['stems'] == ['other']
    assert profile['options']['preludeForcing'] is False
    assert instrument_names(profile) is None
    assert (profile.get('defaultFor') == 'other') == (size == 'large')


def part(name, program, notes, *, drum=False):
    instrument = pm.Instrument(program, name=name, is_drum=drum)
    instrument.notes = [pm.Note(100, pitch, start, end) for pitch, start, end in notes]
    return instrument


with TemporaryDirectory() as temporary:
    root = Path(temporary)
    audio = root / 'other.wav'
    sf.write(audio, [0.] * 16000, 8000)
    detected = pm.PrettyMIDI(initial_tempo=120, resolution=960)
    detected.instruments = [
        part('drums', np.int64(0), [(60, 0.49, 0.70), (36, 0.60, 0.70),
                          (37, 1.0, 1.15), (38, 1.1, 1.15)], drum=True),
        part('synth', 81, [(60, 0.50, 0.80), (63, 1.0, 1.20), (64, 1.1, 1.35)]),
        part('piano', 0, [(60, 0.52, 0.85), (60, 0.56, 0.95)]),
    ]
    with patch('muscriptor_backend.predict', return_value=(detected, {})):
        result = transcribe(audio, root / 'other.json', 'test', 'other', str(uuid4()),
                            str(uuid4()), notify=lambda *_: None, engine='other-muscriptor-large')

    backend = result['backend']
    assert (backend['droppedDrumTracks'], backend['droppedDrumNotes']) == (1, 4)
    assert backend['droppedDrumSourceTracks'] == [{'name': 'drums', 'program': 0, 'noteCount': 4}]
    assert backend['sourceTracks'] == [
        {'name': 'synth', 'program': 81, 'noteCount': 3},
        {'name': 'piano', 'program': 0, 'noteCount': 2},
    ]
    assert backend['deduplicatedNotes'] == 1 and backend['extraOverlapTracks'] == 1
    assert backend['velocityMode'] == 'stem-energy-relative'
    written = pm.PrettyMIDI(str(root / result['file']))
    assert [(track.name, track.program, track.is_drum) for track in written.instruments] == [
        ('other', 81, False), ('other / overlap 2', 81, False),
    ]
    timeline = sorted((note.pitch, round(note.start, 3), round(note.end, 3))
                      for track in written.instruments for note in track.notes)
    assert timeline == [(60, 0.50, 0.80), (60, 0.56, 0.95), (63, 1.0, 1.20), (64, 1.1, 1.35)]
    assert result['noteCount'] == len(timeline)

    output = root / 'failed.json'
    run_id = str(uuid4())
    error = RuntimeError('chunk 12 (seek=60.0s) did not emit EOS within 2000 tokens')
    with patch('muscriptor_backend.predict', side_effect=error):
        try:
            transcribe(audio, output, 'test', 'other', str(uuid4()), run_id,
                       notify=lambda *_: None, engine='other-muscriptor-large')
        except ValueError as failure:
            assert 'MuScriptor' in str(failure) and str(error) in str(failure)
        else:
            raise AssertionError('Strict decoding failure was not reported')
    assert not output.exists() and not (root / 'midi' / 'other' / run_id).exists()

print('other-muscriptor: ok')
