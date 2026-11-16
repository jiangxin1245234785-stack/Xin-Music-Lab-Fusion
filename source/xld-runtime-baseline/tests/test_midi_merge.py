"""Check that different MIDI tempo maps merge in seconds, with expression intact."""
import importlib.util
import tempfile
from pathlib import Path
import mido
import pretty_midi

spec=importlib.util.spec_from_file_location('merge',Path(__file__).parents[1]/'analysis-midi/merge.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
with tempfile.TemporaryDirectory() as temporary:
    root=Path(temporary)
    parts=[]
    for stem,program,tempo in [('bass',33,500000),('piano',0,1000000),('guitar',25,250000)]:
        midi=mido.MidiFile(ticks_per_beat=480)
        track=mido.MidiTrack();midi.tracks.append(track)
        track.extend([mido.MetaMessage('set_tempo',tempo=tempo),mido.Message('program_change',program=program),
            mido.Message('note_on',note=60,velocity=80,time=480),mido.Message('control_change',control=64,value=127,time=120),
            mido.Message('pitchwheel',pitch=100,time=120),mido.MetaMessage('set_tempo',tempo=tempo*2,time=120),
            mido.Message('note_off',note=60,velocity=0,time=120),mido.Message('control_change',control=64,value=0,time=120)])
        file=root/(stem+'.mid');midi.save(file);parts.append({'stem':stem,'path':str(file)})
    output=root/'merged.mid';result=module.merge(parts,output)
    assert result['noteCount']==3 and result['instrumentCount']==3
    merged=pretty_midi.PrettyMIDI(str(output))
    for source,destination in zip(parts,merged.instruments):
        original=pretty_midi.PrettyMIDI(source['path']).instruments[0]
        assert original.program==destination.program
        assert abs(original.notes[0].start-destination.notes[0].start)<.001
        assert abs(original.notes[0].end-destination.notes[0].end)<.001
        assert destination.name==source['stem']
    encoded=mido.MidiFile(output)
    assert encoded.type==1
    assert len({msg.channel for track in encoded.tracks for msg in track if msg.type=='note_on'})==3
print('MIDI merge: PASS (tempo maps, instrument channels, timing, sustain and pitch bend)')
# Two YourMT3 parts can contain many same-timbre tracks; merge without losing notes.
with tempfile.TemporaryDirectory() as temporary:
    from collections import Counter
    root=Path(temporary);parts=[];expected=Counter()
    for stem,program in [('guitar',24),('strings',48)]:
        midi=pretty_midi.PrettyMIDI(resolution=960)
        for i in range(10):
            instrument=pretty_midi.Instrument(program)
            instrument.notes=[pretty_midi.Note(90,60+i,0.1,2.5)]
            if i==1:instrument.notes.append(pretty_midi.Note(80,60,.5,1.5))
            midi.instruments.append(instrument)
        file=root/(stem+'.mid');midi.write(str(file));parts.append({'stem':stem,'path':str(file)})
        expected.update((program,n.pitch,n.velocity,round(n.start,3),round(n.end,3)) for p in midi.instruments for n in p.notes)
    output=root/'compact.mid';summary=module.merge(parts,output);saved=pretty_midi.PrettyMIDI(str(output))
    assert summary['instrumentCount']==4
    actual=Counter((p.program,n.pitch,n.velocity,round(n.start,3),round(n.end,3)) for p in saved.instruments for n in p.notes)
    assert actual==expected
    # Expression tracks are independent even when they share a timbre.
    expressive=pretty_midi.PrettyMIDI()
    for bend in [100,-100]:
        p=pretty_midi.Instrument(24);p.notes=[pretty_midi.Note(100,60,0,2)];p.pitch_bends=[pretty_midi.PitchBend(bend,1)];expressive.instruments.append(p)
    assert len(module.compact_plain_tracks(expressive,expressive))==2
    # W1: more pitched tracks than a MIDI file has channels (winds, one track per instrument, beside the rest): the part
    # with the most is folded onto its most-used program; every note is kept; the result says which part was folded.
    winds=pretty_midi.PrettyMIDI()
    for i,program in enumerate([56,57,58,60,61,64,66,67,68,69,70,71,73]):
        p=pretty_midi.Instrument(program,name='wind %d'%i);p.notes=[pretty_midi.Note(80,60+i,i*.5,i*.5+(3 if i==0 else .4))]
        if i==0:p.notes.append(pretty_midi.Note(80,62,.2,.9))
        winds.instruments.append(p)
    other=pretty_midi.PrettyMIDI()
    for program in [0,24,33]:
        p=pretty_midi.Instrument(program);p.notes=[pretty_midi.Note(90,50,0,1)];other.instruments.append(p)
    wf=root/'winds.mid';winds.write(str(wf));of=root/'band.mid';other.write(str(of))
    summary=module.merge([{'stem':'band','path':str(of)},{'stem':'winds','path':str(wf)}],root/'folded.mid')
    assert summary['folded']==['winds'],summary
    assert {p['stem']:p['noteCount'] for p in summary['parts']}=={'band':3,'winds':14},'every note kept'
    saved=pretty_midi.PrettyMIDI(str(root/'folded.mid'))
    assert sum(not i.is_drum for i in saved.instruments)<=15
    assert {i.program for i in saved.instruments if i.name.startswith('winds')}=={56},'the winds play with their most-used program'
print('Channel compaction: PASS (same-timbre grouping, overlapping notes, exact timing, expression isolation, folding when channels run out)')
