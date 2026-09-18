"""YourMT3 stem export: correct timbre, preserved note timing and overlap."""
import sys, tempfile, unittest, uuid
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'analysis-midi'))
import numpy as np
import soundfile as sf
import pretty_midi
import runner

class GuitarExportTest(unittest.TestCase):
    def test_guitar_and_strings_keep_timing_and_timbre(self):
        with tempfile.TemporaryDirectory(prefix='xld-yourmt3-guitar-') as tmp:
            folder=Path(tmp); source=folder/'输入.wav'; sf.write(source,np.zeros(44100*4,dtype=np.float32),44100)
            for stem,program in [('guitar',24),('strings',48)]:
                detected=pretty_midi.PrettyMIDI(resolution=960)
                part=pretty_midi.Instrument(80,name='YourMT3 program 80')
                part.notes=[pretty_midi.Note(100,60,.1,3.2),pretty_midi.Note(100,60,.3,1.3),pretty_midi.Note(100,67,1.0,2.0)]
                extra=pretty_midi.Instrument(24,name='YourMT3 program 24')
                extra.notes=[pretty_midi.Note(100,72,2.0,3.0)]
                detected.instruments=[part,extra]
                with patch('yourmt3.predict',return_value=(detected,{})):
                    result=runner.transcribe(source,folder/(stem+'.json'),'test',stem,str(uuid.uuid4()),str(uuid.uuid4()),notify=lambda *a:None,engine='yourmt3-plus')
                midi=pretty_midi.PrettyMIDI(str(folder/result['file']))
                self.assertTrue(all(p.program==program and not p.is_drum for p in midi.instruments))
                self.assertEqual(sum(len(p.notes) for p in midi.instruments),4)
                self.assertEqual(len(midi.instruments),2 if stem=='guitar' else 3)
                notes=sorted((n.pitch,round(n.start,3),round(n.end,3)) for p in midi.instruments for n in p.notes)
                self.assertEqual(notes,[(60,.1,3.2),(60,.3,1.3),(67,1.0,2.0),(72,2.0,3.0)])
                self.assertFalse(result['backend']['noteTimingAdjusted'])
                self.assertIn('source-'+('string' if stem=='strings' else 'guitar')+'-timbre',result['backend']['programMode'])
                if stem=='guitar':self.assertNotIn('sourceTarget',result)

if __name__=='__main__':unittest.main()
