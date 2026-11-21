"""Stem-energy velocity: pitched backends that return one velocity get this track's own dynamic.

Covers the module's contract and the runner wiring, and asserts the thing a passing test
suite has been wrong about before: that no part quietly disappeared. Counting notes is not
enough -- a class can survive as notes and still be inaudible -- so the drum case checks
that the quietest class keeps a usable velocity instead of being crushed by the loud one.
"""
import json
import sys
import tempfile
import uuid
from pathlib import Path
from unittest.mock import patch

import numpy as np
import pretty_midi
import soundfile as sf

sys.path.insert(0, str(Path(__file__).parents[1] / 'analysis-midi'))
import velocity
from runner import PROFILES, transcribe

RATE = 44100


def burst(audio, at, amplitude, length=.05):
    start = int(at * RATE)
    audio[start:start + int(length * RATE)] += amplitude


# --- the module's own contract -------------------------------------------------------
velocity.selftest()

# A chord and a ramp through the real entry point, with the window the guitar profile uses.
audio = np.zeros(RATE * 8, np.float32)
for index, amplitude in enumerate([.04, .09, .2, .45, .9]):
    burst(audio, .5 + index, amplitude)
burst(audio, 6.0, .25)
midi = pretty_midi.PrettyMIDI()
part = pretty_midi.Instrument(program=24, name='acoustic guitar')
part.notes = [pretty_midi.Note(100, 60 + i, .5 + i, 1.1 + i) for i in range(5)]
part.notes += [pretty_midi.Note(100, p, 6.0, 6.8) for p in (55, 59, 62)]
midi.instruments.append(part)
with tempfile.TemporaryDirectory() as tmp:
    stem = Path(tmp) / 'guitar.wav'
    sf.write(str(stem), audio, RATE)
    summary = velocity.apply(midi, stem, PROFILES['muscriptor-medium']['options']['velocityFromStem'])
ramp = [n.velocity for n in part.notes[:5]]
chord = [n.velocity for n in part.notes[5:]]
assert ramp == sorted(ramp) and len(set(ramp)) == 5, ramp
assert ramp[0] == 32 and ramp[-1] == 127, ramp
assert len(set(chord)) == 1, f'one strum must be one velocity, got {chord}'
assert summary['onsets'] == 6 and summary['notes'] == 8 and summary['groupedBy'] == 'onset', summary
assert set(summary['scales']) == {'all'}, 'a pitched stem keeps one scale across its tracks'

# Drums: each class is scaled on its own, so a quiet hi-hat is not crushed by a loud kick.
audio = np.zeros(RATE * 10, np.float32)
drums = pretty_midi.PrettyMIDI()
kit = pretty_midi.Instrument(program=0, is_drum=True)
for index in range(8):
    burst(audio, .5 * index, .8 if index % 2 == 0 else .03)   # kick loud, hat quiet
    kit.notes.append(pretty_midi.Note(100, 36 if index % 2 == 0 else 42, .5 * index, .5 * index + .1))
drums.instruments.append(kit)
with tempfile.TemporaryDirectory() as tmp:
    stem = Path(tmp) / 'drums.wav'
    sf.write(str(stem), audio, RATE)
    summary = velocity.apply(drums, stem, PROFILES['drums-adtof']['options']['velocityFromStem'], group_by_pitch=True)
hats = [n.velocity for n in kit.notes if n.pitch == 42]
kicks = [n.velocity for n in kit.notes if n.pitch == 36]
assert set(summary['scales']) == {'36', '42'}, summary['scales']
assert len(hats) == 4 and len(kicks) == 4, (hats, kicks)
# Both classes are internally even here, so neither has a dynamic to map and both land mid
# range. The floor would mean a 12 dB cut for a steadily played part -- the quiet failure
# this pass must not cause.
assert set(hats) == {79} and set(kicks) == {79}, (hats, kicks)
assert summary['scales']['42']['flat'] and summary['scales']['36']['flat'], summary['scales']
assert float(summary['scales']['42']['highDb']) < float(summary['scales']['36']['highDb']), \
    'each class is measured against itself, not against the loudest class'

# Give each class its own spread and the scales separate: the quiet class still reaches the
# ceiling on its own loudest hit rather than being crushed by the loud one.
audio = np.zeros(RATE * 12, np.float32)
drums = pretty_midi.PrettyMIDI()
kit = pretty_midi.Instrument(program=0, is_drum=True)
for index in range(8):
    loud = index % 2 == 0
    burst(audio, .5 * index, (.4 + .1 * index) if loud else (.01 + .004 * index))
    kit.notes.append(pretty_midi.Note(100, 36 if loud else 42, .5 * index, .5 * index + .1))
drums.instruments.append(kit)
with tempfile.TemporaryDirectory() as tmp:
    stem = Path(tmp) / 'drums.wav'
    sf.write(str(stem), audio, RATE)
    summary = velocity.apply(drums, stem, PROFILES['drums-adtof']['options']['velocityFromStem'], group_by_pitch=True)
hats = [n.velocity for n in kit.notes if n.pitch == 42]
kicks = [n.velocity for n in kit.notes if n.pitch == 36]
assert hats == sorted(hats) and hats[0] == 32 and hats[-1] == 127, hats
assert kicks == sorted(kicks) and kicks[0] == 32 and kicks[-1] == 127, kicks
assert not summary['scales']['42']['flat'] and not summary['scales']['36']['flat'], summary['scales']

# --- the runner wiring ---------------------------------------------------------------
# A mocked MuScriptor returning its usual flat 100 must reach disk with a real dynamic,
# with every onset, pitch and duration intact and the manifest saying what happened.
audio = np.zeros(RATE * 8, np.float32)
for index, amplitude in enumerate([.05, .15, .5, .95]):
    burst(audio, 1.0 + index, amplitude)
flat = pretty_midi.PrettyMIDI()
for name, program in (('acoustic guitar', 25), ('clean electric guitar', 27)):
    track = pretty_midi.Instrument(program=program, name=name)
    track.notes = [pretty_midi.Note(100, 60 + index, 1.0 + index, 1.6 + index) for index in range(4)]
    flat.instruments.append(track)
expected = sorted((round(n.start, 4), round(n.end, 4), n.pitch)
                  for n in flat.instruments[0].notes)

with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    source = root / 'guitar.wav'
    sf.write(str(source), audio, RATE)
    output = root / 'guitar.json'
    with patch('muscriptor_backend.predict', return_value=(flat, {'name': 'muscriptor', 'velocityMode': 'constant-100'})):
        result = transcribe(source, output, 'track', 'guitar', str(uuid.uuid4()), str(uuid.uuid4()),
                            notify=lambda *a, **k: None, engine='muscriptor-medium')
    written = pretty_midi.PrettyMIDI(str(root / result['file']))
    notes = json.loads((root / result['notesFile']).read_text(encoding='utf-8'))['notes']

velocities = [n.velocity for part in written.instruments for n in part.notes]
assert len(velocities) == 4 == result['noteCount'], (len(velocities), result['noteCount'])
assert len(set(velocities)) > 1, 'the runner must replace the backend constant'
assert min(velocities) >= 1 and max(velocities) <= 127, velocities
assert sorted((round(n.start, 4), round(n.end, 4), n.pitch)
              for part in written.instruments for n in part.notes) == expected, 'retained notes keep their timing'
assert [n['velocity'] for n in notes] == [n.velocity for part in written.instruments for n in part.notes], \
    'notes.json carries the same velocities as the MIDI'
backend = result['backend']
assert backend['velocityMode'] == 'stem-energy-relative' and backend['velocityReplaced'] == 'constant-100', backend
assert backend['onsets'] == 4 and backend['notes'] == 4 and backend['deduplicatedNotes'] == 4, backend
assert backend['referenceSampleRate'] == RATE, backend

# A backend that predicts its own velocity is left alone.
assert 'velocityFromStem' not in PROFILES['piano-transkun']['options']
assert 'velocityFromStem' not in PROFILES['bass-highres']['options']
assert 'velocityFromStem' not in PROFILES['drums-adtof-stems']['options'], \
    'the DrumSep engine already measures each hit on its own kit stem'
# Derived from the registry, not listed here: a hardcoded list goes stale the moment a new
# model lands, which is what happened when MuScriptor v0.4 arrived carrying the pass.
scaled = [name for name, profile in PROFILES.items() if 'velocityFromStem' in profile['options']]
assert len(scaled) >= 9, scaled
for engine in scaled:
    options = PROFILES[engine]['options']['velocityFromStem']
    assert 0 < options['windowPostSeconds'] <= .3 and options['velocityFloor'] < options['velocityCeil'] <= 127, (engine, options)
    suffix = '-stemvel1-onetrack1' if 'oneTrack' in PROFILES[engine]['options'] else '-stemvel1'
    assert PROFILES[engine]['model'].endswith(suffix), engine + ' must version its new output'

print('midi-velocity: ok (ramp, one strum one velocity, per-class drum scales, runner wiring, '
      'notes.json agreement, registry coverage)')
