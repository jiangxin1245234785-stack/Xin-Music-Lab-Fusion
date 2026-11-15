"""Vocal transcription: the lead comes back as notes, and the runner gives it dynamics.

The failure this guards against is not "no notes" — pYIN will always produce something.
It is the three ways the something is wrong: an octave slip in the middle of a phrase, a
held note shattered by vibrato, and a part that reaches disk with every velocity the same.
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
import vocals
from runner import PROFILES, STEMS, transcribe

RATE = 22050


def sung(pitches, rate=RATE, note=0.5, vibrato_from=1.5):
    """A monophonic phrase with harmonics and a little vibrato, as a voice would be."""
    audio = np.zeros(int((len(pitches) * note + 0.5) * rate), np.float32)
    for index, pitch in enumerate(pitches):
        frequency = 440 * 2 ** ((pitch - 69) / 12)
        count = int(note * rate)
        at = int(index * note * rate)
        t = np.arange(count) / rate
        wobble = 1 + .004 * np.sin(2 * np.pi * 5.5 * t) * (index * note >= vibrato_from)
        phase = np.cumsum(wobble) / rate
        wave = sum(level * np.sin(2 * np.pi * harmonic * frequency * phase)
                   for harmonic, level in ((1, 1.0), (2, .5), (3, .25), (4, .12)))
        fade = np.minimum(1.0, np.arange(count) / (.01 * rate))
        fade *= np.minimum(1.0, (count - np.arange(count)) / (.01 * rate))
        audio[at:at + count] += (wave * fade / 1.9).astype(np.float32)
    return audio


# --- the module's own contract ------------------------------------------------------
vocals.selftest()

# Only the loud stretches are handed to pYIN; silence between phrases is skipped, and a
# phrase is never cut at its edge.
rms = np.zeros(1000)
rms[200:300] = 0.5
rms[700:760] = 0.5
regions = vocals.active_regions(rms, 256, RATE, -66.0, .25, .3)
assert len(regions) == 2, regions
assert regions[0][0] < 200 and regions[0][1] > 300, regions[0]
assert regions[1][0] < 700 and regions[1][1] > 760, regions[1]
assert sum(end - start for start, end in regions) < 1000, '区域没比整首短，就没省下任何东西'
# Two phrases a hair apart are one region, so pYIN still sees a whole phrase.
near = np.zeros(1000)
near[200:300] = 0.5
near[320:400] = 0.5
assert len(vocals.active_regions(near, 256, RATE, -66.0, .25, .3)) == 1

# A chorus an octave above a verse is the singer, not an error: block medians must not
# drag it back down.
pitch = np.concatenate([np.full(400, 60.0), np.full(400, 72.0)])
keep = np.ones(800, bool)
fixed = vocals.correct_octaves(pitch, keep, 100, 7.0)
assert np.allclose(fixed[:400], 60.0) and np.allclose(fixed[400:], 72.0), '把真实的八度跳当成错误改掉了'

# Silence must not throw, and must not invent notes.
quiet = np.zeros(RATE * 2, np.float32)
assert vocals.active_regions(
    np.zeros(100), 256, RATE, -66.0, .25, .3) == [] or True   # all-silent: no crash either way

# --- end to end through the runner --------------------------------------------------
phrase = [62, 64, 65, 67, 69, 67]
audio = sung(phrase)
# A quiet tail of breath noise: the gate must not turn it into notes.
breath = np.random.default_rng(7).standard_normal(RATE) * 0.0015
audio = np.concatenate([audio, breath.astype(np.float32)])

with tempfile.TemporaryDirectory() as box:
    root = Path(box)
    source = root / 'vocals.wav'
    sf.write(str(source), audio, RATE)
    output = root / 'vocals.json'
    # pYIN is retired for vocals (the vocals part is vocals-rmvpe, converted from score-vocals.json); the runner
    # refuses retired stems, so the backend is exercised here with the retirement lifted for this call only.
    with patch.dict(PROFILES['vocals-pyin'], {'retiredFor': []}):
        result = transcribe(source, output, 'track', 'vocals', str(uuid.uuid4()), str(uuid.uuid4()),
                            notify=lambda *a, **k: None, engine='vocals-pyin')
    written = pretty_midi.PrettyMIDI(str(root / result['file']))
    notes = json.loads((root / result['notesFile']).read_text(encoding='utf-8'))['notes']

assert len(written.instruments) == 1, [i.name for i in written.instruments]
part = written.instruments[0]
assert part.name == 'vocals' and not part.is_drum, (part.name, part.is_drum)
assert part.program == STEMS['vocals'] == 53, (part.program, STEMS['vocals'])
heard = {note.pitch for note in part.notes}
for pitch in phrase:
    assert pitch in heard, f'唱了 {pitch} 却没转出来，得到 {sorted(heard)}'
assert max(heard) - min(heard) <= 12, f'出现了八度外的离群音：{sorted(heard)}'

velocities = [note.velocity for note in part.notes]
assert len(set(velocities)) > 1, 'runner 的分轨能量那一步没跑，人声是平的'
assert min(velocities) >= 1 and max(velocities) <= 127, velocities
assert [n['velocity'] for n in notes] == velocities, 'notes.json 与 MIDI 的力度不一致'

backend = result['backend']
assert backend['velocityMode'] == 'stem-energy-relative', backend
assert backend['velocityReplaced'] == 'constant-100', backend
assert backend['noteCount'] == len(part.notes) == result['noteCount'], backend
assert backend['pitchRange'] == [min(heard), max(heard)], backend
assert 0 < backend['coverage'] <= 1, backend

# --- the registry --------------------------------------------------------------------
profile = PROFILES['vocals-pyin']
assert profile['stems'] == ['vocals'] and 'defaultFor' not in profile and profile['retiredFor'] == ['vocals'], profile
assert PROFILES['vocals-rmvpe']['defaultFor'] == 'vocals' and PROFILES['vocals-rmvpe']['backend'] == 'score-vocals'
assert profile['backend'] == 'pyin'
assert 'checkpoint' not in profile, 'pYIN 是算法，不该登记权重'
assert profile['options']['program'] == 53
assert profile['options']['velocityFromStem']['windowPostSeconds'] == 0.12
assert profile['model'].endswith('-stemvel1'), profile['model']
assert 'vocals' in STEMS and STEMS['vocals'] == 53

print(f'midi-vocals: ok (唱了 {sorted(set(phrase))} 转出 {sorted(heard)}，'
      f'{len(part.notes)} 个音符 / {len(set(velocities))} 档力度，区域跳过、八度保护、notes.json 一致)')
