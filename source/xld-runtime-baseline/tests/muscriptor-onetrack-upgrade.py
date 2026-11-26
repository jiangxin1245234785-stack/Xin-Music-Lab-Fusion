"""The historical two-file output must prove the group and exact time of each note."""
import copy
import hashlib
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

import numpy as np
import pretty_midi as pm
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'analysis-midi'))
import runner
from onetrack_upgrade import restore

engine = 'muscriptor-medium'
profile = runner.PROFILES[engine]
source_id, track_id, stem = str(uuid4()), 'same-track', 'guitar'
def unique():
    return str(uuid4())
def save(file, value):
    file.write_text(json.dumps(value), encoding='utf-8')
def checksum(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()

def one_case(root, empty=False):
    root.mkdir()
    source = root / 'stem.wav'
    rate = 16000
    samples = np.sin(np.arange(rate * 3) / 5) * np.linspace(0, .9, rate * 3)
    sf.write(str(source), samples, rate, subtype='FLOAT')
    detected = pm.PrettyMIDI()
    if not empty:
        for program, name, notes in [(25,'acoustic guitar',[(.301032,.831026,60),(.8,1.4,64),(1.8,2.11,65)]),
                                     (30,'distorted guitar',[(.351031,.792,60),(.850001,1.2,64)])]:
            part = pm.Instrument(program, name=name)
            part.notes = [pm.Note(100, pitch, start, end) for start,end,pitch in notes]
            detected.instruments.append(part)
    backend = dict(name='muscriptor', version=profile['options']['codeRevision'], velocityMode='constant-100',
                   checkpointSha256=profile['checkpoint']['sha256'], nativePrograms=[p.program for p in detected.instruments])
    legacy = copy.deepcopy(profile)
    legacy['model'] = profile['model'].removesuffix('-onetrack1')
    del legacy['options']['oneTrack']
    legacy['options']['adapterVersion'] = 1
    def predicted(*args, **kwargs):
        return copy.deepcopy(detected), copy.deepcopy(backend)
    with patch('muscriptor_backend.predict', side_effect=predicted):
        with patch.dict(runner.PROFILES, {engine:legacy}):
            old = runner.transcribe(source, root/'legacy.json', track_id, stem, source_id, unique(), lambda *x:None, engine=engine)
        fresh = runner.transcribe(source, root/'fresh.json', track_id, stem, source_id, unique(), lambda *x:None, engine=engine)
    record = root/'midi'/stem/'runs'/(old['runId']+'.json')
    record.parent.mkdir()
    manifest_source = source.with_name('STEM.WAV') if sys.platform == 'win32' else source
    if sys.platform == 'win32':
        assert manifest_source.samefile(source) and str(manifest_source) != str(source.resolve())
    old['source']['path'] = str(manifest_source.absolute())
    save(record, old)
    def check(file=record, directory=None, wanted=None):
        return restore(file, directory, engine, profile, track_id, stem, source_id, source, source.stat(), wanted)
    source_files = [record, root/old['file'], root/old['notesFile']]
    before = [checksum(f) for f in source_files]
    old_paths = list(root.rglob('*'))
    check()
    check(root/'legacy.json', root, old['runId'])
    assert list(root.rglob('*')) == old_paths
    args = SimpleNamespace(input=manifest_source, check_onetrack=None, upgrade_onetrack=record, track_directory=root,
                           engine=engine, track_id=track_id, stem=stem, source_run_id=source_id,
                           upgrade_from_run_id=old['runId'], run_id=unique(), output=root/'upgraded.json')
    with patch('muscriptor_backend.predict', side_effect=AssertionError('model called during upgrade')):
        upgraded = runner.upgrade_onetrack(args)
    assert upgraded['source']['path'] == old['source']['path'] == str(manifest_source.absolute())
    assert [checksum(f) for f in source_files] == before
    assert upgraded['digests']['midi'] == fresh['digests']['midi']
    read_notes = lambda result: json.loads((root/result['notesFile']).read_text())['notes']
    assert read_notes(upgraded) == read_notes(fresh)
    assert upgraded['backend']['deduplicatedNotes'] == (0 if empty else 1)
    assert upgraded['backend']['oneTrackUpgrade']['fromRunId'] == old['runId']
    assert 'torch' not in sys.modules
    if empty:
        return
    for change in [{'backend':{**old['backend'],'nativePrograms':[25]}},
                   {'revision':{'parentRunId':unique()}}, {'model':profile['model']},
                   {'digests':{**old['digests'],'notes':'0'*64}},
                   {'source':{**old['source'],'size':1}}]:
        save(record,{**old,**change})
        try: check()
        except ValueError: pass
        else: raise AssertionError(change)
    doc = json.loads((root/old['notesFile']).read_text())
    doc['notes'][0],doc['notes'][-1] = doc['notes'][-1],doc['notes'][0]
    save(root/old['notesFile'],doc)
    save(record,{**old,'digests':{**old['digests'],'notes':checksum(root/old['notesFile'])}})
    try: check()
    except ValueError as error: assert 'group-notes' in str(error)
    else: raise AssertionError('flattened/reordered notes accepted')

with TemporaryDirectory() as temp:
    one_case(Path(temp)/'pitched')
    one_case(Path(temp)/'empty', empty=True)
print('onetrack1 upgrade: PASS (exact note floats, velocities and MIDI bytes; empty result; source path spelling preserved; source, identity, group and digest rejection; no model/GPU)')
