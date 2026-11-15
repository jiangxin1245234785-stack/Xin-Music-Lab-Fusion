"""The vocals part as a MIDI run, from the track's score-vocals result (engine `vocals-rmvpe`).

No inference happens here. The vocal line is recognised once, by analysis-score/vocals_runner.py (karaoke lead
split -> RMVPE -> octave guard -> vocals.segment), and stored in `<track>/score-vocals.json`. This backend copies
that lane's notes, unchanged, into the same MIDI run every other backend writes (runner.py does the writing).

Whether the result is current for the vocal stem being transcribed is decided before this runs, in Node, by
core/score-vocals.cjs (the one judgement every caller uses). The service passes the file it judged together with
its SHA-256; this backend refuses any other content, so what is converted is exactly what was judged.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path


def ready(profile):
    import importlib.util
    return all(importlib.util.find_spec(name) is not None for name in ('pretty_midi', 'soundfile', 'numpy'))


def predict(score_vocals: Path, expected_sha256: str, notify, duration: float):
    import pretty_midi
    if score_vocals is None or not expected_sha256:
        raise ValueError('人声转谱需要当前的人声曲线（score-vocals.json）')
    raw = Path(score_vocals).read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if digest != expected_sha256:
        raise ValueError('人声曲线在转谱前发生变化，请重试')
    value = json.loads(raw.decode('utf-8'))
    if value.get('kind') != 'score-vocals':
        raise ValueError('score-vocals-invalid')
    lane = value.get('lane')
    if not lane or not isinstance(lane.get('notes'), list):
        raise ValueError('这首歌没有人声')
    notify('读取人声曲线', 0.5, 'transcribe')
    detected = pretty_midi.PrettyMIDI(initial_tempo=120, resolution=960)
    part = pretty_midi.Instrument(program=53, name='vocals')
    for note in lane['notes']:
        start, length, pitch = float(note[0]), float(note[1]), int(note[2])
        velocity = int(note[3]) if len(note) > 3 else 90
        part.notes.append(pretty_midi.Note(velocity, pitch, start, start + length))
    detected.instruments.append(part)
    provenance = value.get('provenance') or {}
    split = provenance.get('split') or {}
    backend = {
        'name': 'score-vocals', 'device': 'none',
        'scoreVocals': {
            'sha256': digest,
            'stemRunId': (value.get('source') or {}).get('stemRunId'),
            'notes': len(lane['notes']),
            'splitRunId': split.get('runId'),
            'splitModel': split.get('model'),
            'pitch': provenance.get('pitch'),
            'chain': provenance.get('chain'),
        },
    }
    return detected, backend
