# xld-python: XLD_MUSCRIPTOR_PYTHON
"""Official gap-fill integration: group protection, off switch, and MIDI round-trip."""
import copy
import json
from pathlib import Path
import sys
import tempfile
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'analysis-midi'))
import muscriptor_backend as backend
import pretty_midi
profiles=json.loads((Path(__file__).resolve().parents[1]/'analysis-midi/models.json').read_text(encoding='utf-8'))
profile=next(p for p in profiles if p['id']=='strings-muscriptor-large')
raw=next(p for p in profiles if p['id']=='strings-muscriptor-large-raw')
assert profile['options']['gapFillMs']==50 and raw['options']['gapFillMs']==0
# The strings Large entries pin their own code revisions on purpose (4c03caf for large / raw, 8a1ef88 for the 0.4
# "tempo" variant added after this test was written, each in its own codeDirectory); every other MuScriptor entry runs
# the shared 7f213af code in `upstream` (B7, 2026-11-15: the test predated v04 - the test was out of date, not the fill).
pinned={'strings-muscriptor-large':'4c03caf','strings-muscriptor-large-raw':'4c03caf','strings-muscriptor-large-v04':'8a1ef88'}
for p in profiles:
    if p['backend']!='muscriptor':
        continue
    if p['id'] in pinned:
        assert p['options']['codeRevision'].startswith(pinned[p['id']]),p['id']
        assert backend.code_root(p).name!='upstream' or p['options']['codeRevision'].startswith('7f213af'),p['id']
    else:
        assert p['options']['codeRevision'].startswith('7f213af'),p['id']
        assert backend.code_root(p).name=='upstream',p['id']
assert next(p for p in profiles if p['id']=='strings-muscriptor-large-v04')['options']['gapFillMs']==50
midi=pretty_midi.PrettyMIDI(initial_tempo=120,resolution=960)
for name,notes in [('violin',[(60,.1,.46),(62,.5,.7),(64,.8,.9)]),
                   ('cello',[(48,.1,.2),(50,.25,.5)])]:
    part=pretty_midi.Instrument(48,name=name)
    part.notes=[pretty_midi.Note(90,pitch,start,end) for pitch,start,end in notes]
    midi.instruments.append(part)
untouched=copy.deepcopy(midi)
old=[[(n.start,n.end,n.pitch,n.velocity) for n in p.notes] for p in midi.instruments]
assert backend.finish_timing(untouched,raw)['gapFillNotesExtended']==0
assert old==[[(n.start,n.end,n.pitch,n.velocity) for n in p.notes] for p in untouched.instruments]
result=backend.finish_timing(midi,profile)
assert result['gapFillNotesExtended']==2,result
assert abs(midi.instruments[0].notes[0].end-.5)<1e-8
assert midi.instruments[0].notes[1].end==.7,'100 ms gap must remain'
assert abs(midi.instruments[1].notes[0].end-.25)<1e-8
assert midi.instruments[0].notes[2].end==.9
assert [p.name for p in midi.instruments]==['violin','cello']
assert [(n.start,n.pitch,n.velocity) for p in midi.instruments for n in p.notes]==[(n[0],n[2],n[3]) for p in old for n in p]
with tempfile.TemporaryDirectory(prefix='xld-gap-check-') as temp:
    file=Path(temp)/'弦乐.mid';midi.write(str(file));reread=pretty_midi.PrettyMIDI(str(file))
    assert len(reread.instruments)==2 and sum(len(p.notes) for p in reread.instruments)==5
    assert abs(reread.instruments[0].notes[0].end-.5)<1e-8
print('PASS: official gap filling, separate same-program groups, 50 ms threshold, original timing, all notes/onsets/velocity retained and MIDI round-trip')
