from pathlib import Path
import sys,json,tempfile
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'analysis-midi'))
import pretty_midi
from yourmt3 import preserve_overlapping_notes
from runner import validate_midi_roundtrip
from merge import merge
with tempfile.TemporaryDirectory() as tmp:
    midi=pretty_midi.PrettyMIDI(initial_tempo=120,resolution=960)
    for program in (48,40):
        part=pretty_midi.Instrument(program)
        for start,end,pitch in [(0,3,60),(1,2,60),(2,4,60),(0,4,64),(3,5,60)]:
            part.notes.append(pretty_midi.Note(100,pitch,start,end))
        midi.instruments.append(part)
    metadata=preserve_overlapping_notes(midi)
    assert metadata['extraOverlapTracks']==2 and metadata['midiTracks']==4
    output=Path(tmp)/'test.mid';midi.write(str(output));validate_midi_roundtrip(midi,output)
    result=merge([{'stem':'strings','path':str(output)}],Path(tmp)/'merged.mid')
    assert result['noteCount']==10 and result['instrumentCount']==4
    print('YourMT3 export PASS: nested overlaps, adjacent notes, native groups, unchanged timing and merge roundtrip')
