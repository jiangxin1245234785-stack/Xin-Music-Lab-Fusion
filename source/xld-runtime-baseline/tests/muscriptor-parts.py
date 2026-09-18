from pathlib import Path
import sys,json,uuid,tempfile
from collections import Counter
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'analysis-midi'))
import runner,muscriptor_backend,pretty_midi,mido,soundfile as sf,numpy as np
# Exercise export with controlled predictions, independent of learned accuracy.
with tempfile.TemporaryDirectory(prefix='xld-muscriptor-parts-') as temp:
 root=Path(temp);audio=root/'源.wav';sf.write(audio,np.zeros((44100,2)),44100)
 def fake(input_path,profile,notify,duration,string_target='strings'):
  midi=pretty_midi.PrettyMIDI(initial_tempo=120)
  if profile['stems']==['drums']:
   part=pretty_midi.Instrument(0,is_drum=True)
   for pitch,start,end in [(38,.1,.2),(38,.15,.25),(46,.3,.4),(51,.5,.6)]:part.notes.append(pretty_midi.Note(100,pitch,start,end))
   midi.instruments.append(part)
  else:
   for program in [40,48]:
    part=pretty_midi.Instrument(program);part.notes.append(pretty_midi.Note(100,60,.1,.8));midi.instruments.append(part)
  return midi,{}
 muscriptor_backend.predict=fake
 for size in ['medium','large']:
  for stem in ['strings','drums']:
   engine=stem+'-muscriptor-'+size
   for target in (list(runner.STRING_PROGRAMS) if stem=='strings' else ['strings']):
    manifest=root/(str(uuid.uuid4())+'.json')
    r=runner.transcribe(audio,manifest,'track',stem,str(uuid.uuid4()),str(uuid.uuid4()),notify=lambda *a:None,engine=engine,string_target=target)
    file=root/r['file'];midi=pretty_midi.PrettyMIDI(str(file));notes=[n for p in midi.instruments for n in p.notes]
    assert len(notes)==r['noteCount'] and notes
    assert all(p.is_drum==(stem=='drums') for p in midi.instruments)
    channels={m.channel for t in mido.MidiFile(file).tracks for m in t if m.type=='note_on'}
    if stem=='drums':
     assert channels=={9};assert {n.pitch for n in notes}=={38,46,51}
     assert len(notes)==4
     assert all(abs((n.end-n.start)-.1)<.001 for n in notes if n.pitch!=38)
     assert abs(sorted(n.end for n in notes if n.pitch==38)[0]-.15)<.001
    else:
     assert all(p.program==runner.STRING_PROGRAMS[target] for p in midi.instruments)
     assert 9 not in channels
     assert len(notes)==2 and all(abs(n.end-.8)<.001 for n in notes)
     names=muscriptor_backend.instrument_names(runner.PROFILES[engine],target)
     assert 'drums' not in names
     if target=='cello':assert names==['cello']
 print('PASS: 12 string target/tier exports, 2 drum tiers, source timbre, overlapping strings, rapid drum hits and GM channel 10')
