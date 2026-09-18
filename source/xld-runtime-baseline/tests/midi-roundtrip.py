"""MIDI serialization regression: nearly simultaneous notes are unordered."""
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'analysis-midi'))
import pretty_midi
from runner import validate_midi_roundtrip


class RoundTripTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='xld-midi-roundtrip-')
        self.addCleanup(self.directory.cleanup)
        self.file = Path(self.directory.name) / 'test.mid'
        self.midi = pretty_midi.PrettyMIDI(initial_tempo=120, resolution=960)
        part = pretty_midi.Instrument(24)
        # Actual Nancy guitar onsets: 75 microseconds apart, same saved tick.
        part.notes = [pretty_midi.Note(100, 58, 9.803786277770996, 10.130000114440918),
                      pretty_midi.Note(99, 55, 9.803861618041992, 10.130000114440918),
                      pretty_midi.Note(80, 60, 390.0032, 396.5832)]
        part.control_changes = [pretty_midi.ControlChange(64, 127, 3), pretty_midi.ControlChange(64, 0, 12)]
        self.midi.instruments = [part]
        self.midi.write(str(self.file))

    def test_close_onsets_and_long_timestamps(self):
        reread = pretty_midi.PrettyMIDI(str(self.file))
        self.assertEqual(sorted(reread.instruments[0].notes, key=lambda n:(n.start,n.pitch))[0].pitch, 55)
        validate_midi_roundtrip(self.midi, self.file)
        self.assertEqual(len(reread.instruments[0].control_changes), 2)

    def test_real_corruption_is_rejected(self):
        for field, value in [('start', 9.9), ('end', 10.2), ('pitch', 62), ('velocity', 42)]:
            with self.subTest(field=field):
                self.midi.write(str(self.file))
                changed = pretty_midi.PrettyMIDI(str(self.file))
                setattr(changed.instruments[0].notes[0], field, value)
                changed.write(str(self.file))
                with self.assertRaisesRegex(ValueError, '时间校验失败'):
                    validate_midi_roundtrip(self.midi, self.file)

    def test_missing_and_extra_notes_are_rejected(self):
        for delta in [-1, 1]:
            with self.subTest(delta=delta):
                self.midi.write(str(self.file))
                changed = pretty_midi.PrettyMIDI(str(self.file))
                if delta < 0:
                    changed.instruments[0].notes.pop()
                else:
                    changed.instruments[0].notes.append(pretty_midi.Note(70, 80, 1, 2))
                changed.write(str(self.file))
                with self.assertRaisesRegex(ValueError, '数量校验失败'):
                    validate_midi_roundtrip(self.midi, self.file)

    def test_empty_result(self):
        self.midi.instruments[0].notes.clear()
        self.midi.write(str(self.file))
        validate_midi_roundtrip(self.midi, self.file)


if __name__ == '__main__':
    unittest.main()
