"""Percussion survives runner serialization and merging with pitched instruments."""
import sys
import tempfile
import importlib.util
from pathlib import Path
import mido
import pretty_midi
import numpy as np
import soundfile as sf
import uuid
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).parents[1]/'analysis-midi'))
from runner import validate_midi_roundtrip, transcribe
from merge import merge

with tempfile.TemporaryDirectory() as tmp:
    root=Path(tmp)
    drums=pretty_midi.PrettyMIDI(resolution=960)
    part=pretty_midi.Instrument(0,is_drum=True,name='drums')
    part.notes=[pretty_midi.Note(100,35,.123,.223),pretty_midi.Note(100,38,.503,.603),pretty_midi.Note(100,42,.503,.603)]
    drums.instruments.append(part)
    drums.write(str(root/'drums.mid'))
    validate_midi_roundtrip(drums,root/'drums.mid')
    piano=pretty_midi.PrettyMIDI(resolution=960)
    pitched=pretty_midi.Instrument(0,name='piano')
    pitched.notes=[pretty_midi.Note(80,60,.123,.7)]
    piano.instruments.append(pitched);piano.write(str(root/'piano.mid'))
    result=merge([{'stem':stem,'path':str(root/(stem+'.mid'))} for stem in ['piano','drums']],root/'merged.mid')
    assert result['noteCount']==4 and result['instrumentCount']==2
    saved=pretty_midi.PrettyMIDI(str(root/'merged.mid'))
    assert [p.is_drum for p in saved.instruments]==[False,True]
    for track in mido.MidiFile(root/'merged.mid').tracks:
        onsets=[m for m in track if m.type=='note_on' and m.velocity]
        if any(m.note==35 for m in onsets):assert all(m.channel==9 for m in onsets)
        elif onsets:assert all(m.channel!=9 for m in onsets)
    # A real runner roundtrip for rolls faster than the upstream 100 ms note duration.
    part.notes=[pretty_midi.Note(100,38,t,t+.1) for t in [.2,.24,.28,.32]]
    sf.write(root/'drums.wav',np.zeros((44100,2),dtype=np.float32),44100)
    with patch('drums.predict',return_value=(drums,{})):
        output=transcribe(root/'drums.wav',root/'result.json','test','drums',
                          str(uuid.uuid4()),str(uuid.uuid4()),notify=lambda *a:None,engine='drums-adtof')
    saved=pretty_midi.PrettyMIDI(str(root/output['file']))
    assert saved.instruments[0].is_drum and len(saved.instruments[0].notes)==4
    assert max(abs(a.start-b.start) for a,b in zip(part.notes,saved.instruments[0].notes))<.001
print('PASS: drum MIDI channel 10, class notes, timing, pitched/drum merge')
