"""analysis-midi/evidence.py against audio whose contents are known because this test made them.

The stem holds four tones with harmonics. The MIDI written for it gets one thing right and four things wrong on
purpose: a note in a silent stretch, a note at a pitch the stem never plays, a note that stops a second before
its tone does, and a drum hit in silence. The verdicts have to name each of them, and nothing else.

Run with a MIDI runtime that has librosa and pretty_midi (XLD_HIGHRES_PYTHON or XLD_MIDI_PYTHON):
    python tests/midi-evidence.py
"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import pretty_midi
import soundfile as sf

RATE = 44100
SCRIPT = Path(__file__).resolve().parent.parent / 'analysis-midi' / 'evidence.py'


def tone(pitch, seconds):
    t = np.arange(int(seconds * RATE)) / RATE
    f = 440.0 * 2 ** ((pitch - 69) / 12)
    wave = sum(a * np.sin(2 * np.pi * f * h * t) for h, a in ((1, 1.0), (2, 0.5), (3, 0.3), (4, 0.2)))
    fade = np.minimum(1, np.minimum(t / 0.01, (seconds - t) / 0.05))
    return 0.2 * wave * fade


def main():
    with tempfile.TemporaryDirectory() as folder:
        folder = Path(folder)
        audio = np.zeros(int(12 * RATE))
        # (pitch, start, length) actually sounding in the stem; 6 s to 9 s is digital silence
        for pitch, start, length in ((60, 0.5, 1.0), (64, 2.0, 1.0), (55, 3.5, 2.0), (67, 9.5, 1.0)):
            at = int(start * RATE)
            sound = tone(pitch, length)
            audio[at:at + len(sound)] += sound
        wav = folder / 'stem.wav'
        sf.write(str(wav), np.stack([audio, audio], axis=1), RATE, subtype='PCM_16')

        midi = pretty_midi.PrettyMIDI(initial_tempo=120, resolution=960)
        part = pretty_midi.Instrument(program=0, name='piano')
        written = [
            (60, 0.5, 1.5),    # right
            (64, 2.0, 3.0),    # right
            (55, 3.5, 4.5),    # right pitch, but the tone runs to 5.5: written short
            (70, 7.0, 7.05),   # in the silent stretch
            (73, 9.5, 10.5),   # the stem plays 67 here, not 73
            (67, 9.5, 10.5),   # right
        ]
        for pitch, start, end in written:
            part.notes.append(pretty_midi.Note(velocity=80, pitch=pitch, start=start, end=end))
        drums = pretty_midi.Instrument(program=0, is_drum=True, name='drums')
        drums.notes.append(pretty_midi.Note(velocity=100, pitch=36, start=0.5, end=0.6))    # the stem sounds here
        drums.notes.append(pretty_midi.Note(velocity=100, pitch=36, start=7.5, end=7.6))    # silence
        midi.instruments.extend([part, drums])
        mid = folder / 'part.mid'
        midi.write(str(mid))

        output = folder / 'out' / 'evidence.json'
        done = subprocess.run([sys.executable, '-X', 'utf8', '-B', str(SCRIPT), '--midi', str(mid), '--wav', str(wav), '--output', str(output)],
                              capture_output=True, text=True, encoding='utf-8')
        assert done.returncode == 0, done.stderr[-600:]
        summary = json.loads(done.stdout.strip().splitlines()[-1])
        result = json.loads(output.read_text(encoding='utf-8'))
        assert result['kind'] == 'midi-evidence' and result['schemaVersion'] == 1
        assert summary['totals'] == result['totals']

        # pretty_midi reads notes back in its own order, so verdicts are matched to what was written by pitch
        back = pretty_midi.PrettyMIDI(str(mid))
        piano = result['instruments'][0]
        by_pitch = {int(n.pitch): (piano['verdicts'][i], piano['extend'].get(str(i))) for i, n in enumerate(back.instruments[0].notes)}
        assert by_pitch[60] == (0, None), by_pitch
        assert by_pitch[64] == (0, None), by_pitch
        assert by_pitch[67] == (0, None), by_pitch
        assert by_pitch[70][0] == 3, by_pitch                      # silent
        assert by_pitch[73][0] == 2, by_pitch                      # the stem sounds, the pitch is not there
        verdict, until = by_pitch[55]
        assert verdict == 0 and until is not None and 5.2 <= until <= 5.7, by_pitch    # written to 4.5, sounds to 5.5
        assert result['instruments'][1]['isDrum'] and result['instruments'][1]['verdicts'] == [0, 3], result['instruments'][1]
        assert result['instruments'][1]['extend'] == {}
        assert result['totals'] == {'notes': 8, 'silent': 2, 'noPitch': 1, 'weak': 0, 'short': 1}, result['totals']

        # A stem that is separation residue from end to end (nothing above -70 dBFS) has no loud level to be
        # 50 dB under; every note written on it is in silence all the same.
        residue = folder / 'residue.wav'
        hiss = np.random.default_rng(3).standard_normal(int(12 * RATE)) * 10 ** (-90 / 20)
        sf.write(str(residue), np.stack([hiss, hiss], axis=1), RATE, subtype='FLOAT')
        quiet_out = folder / 'out' / 'residue.json'
        quiet = subprocess.run([sys.executable, '-X', 'utf8', '-B', str(SCRIPT), '--midi', str(mid), '--wav', str(residue), '--output', str(quiet_out)],
                               capture_output=True, text=True, encoding='utf-8')
        assert quiet.returncode == 0, quiet.stderr[-600:]
        quiet_result = json.loads(quiet_out.read_text(encoding='utf-8'))
        assert all(v == 3 for item in quiet_result['instruments'] for v in item['verdicts']), quiet_result['instruments']
        assert quiet_result['totals']['silent'] == 8 and quiet_result['totals']['short'] == 0, quiet_result['totals']

        # "Written short" is only claimed where nothing else explains the sound. A note an octave or a twelfth
        # below puts its partials on the earlier pitch, and in the bass register the analysis cannot separate a
        # neighbour two semitones away: neither may read as the earlier note still sounding. (七里香 bass: 59
        # notes "written short" under the first rule, 52 of them lying under such a note.)
        line = np.zeros(int(15 * RATE))
        # (pitch, start, length): each pair is legato, the second note explaining the sound after the first
        # The first note of a pair lasts a whole number of its own periods, so the partial of the second note
        # that lands on its pitch continues it in phase: the hand-over has no dip for the old rule to stop at.
        def whole(pitch, about):
            f = 440.0 * 2 ** ((pitch - 69) / 12)
            return round(f * about) / f
        played = []
        for first, second, start in ((64, 52, 1.0), (45, 33, 4.5), (72, 53, 8.0)):
            length = whole(first, 1.0)
            played += [(first, start, length), (second, start + length, 1.5)]
        played.append((36, 11.5, 2.0))
        for pitch, start, length in played:
            at = int(start * RATE)
            sound = tone(pitch, length)
            line[at:at + len(sound)] += sound
        line_wav = folder / 'line.wav'
        sf.write(str(line_wav), np.stack([line, line], axis=1), RATE, subtype='PCM_16')
        line_midi = pretty_midi.PrettyMIDI(initial_tempo=120, resolution=960)
        bass = pretty_midi.Instrument(program=33, name='bass')
        for pitch, start, length in played:
            # everything as played, except the last note: written to 12.5, sounds to 13.5, nothing under it
            bass.notes.append(pretty_midi.Note(velocity=80, pitch=pitch, start=start, end=12.5 if pitch == 36 else start + length))
        line_midi.instruments.append(bass)
        line_mid = folder / 'line.mid'
        line_midi.write(str(line_mid))
        line_out = folder / 'out' / 'line.json'
        ran = subprocess.run([sys.executable, '-X', 'utf8', '-B', str(SCRIPT), '--midi', str(line_mid), '--wav', str(line_wav), '--output', str(line_out)],
                             capture_output=True, text=True, encoding='utf-8')
        assert ran.returncode == 0, ran.stderr[-600:]
        line_result = json.loads(line_out.read_text(encoding='utf-8'))['instruments'][0]
        line_back = pretty_midi.PrettyMIDI(str(line_mid)).instruments[0].notes
        longer = {int(line_back[int(index)].pitch): until for index, until in line_result['extend'].items()}
        assert set(longer) == {36}, longer                       # not 64 (52 follows), 45 (33 follows) or 72 (53 follows)
        assert 13.2 <= longer[36] <= 13.7, longer
        assert all(v == 0 for v in line_result['verdicts']), line_result['verdicts']

        # refusals carry a stable code, never a bare traceback
        missing = subprocess.run([sys.executable, '-X', 'utf8', '-B', str(SCRIPT), '--midi', str(mid), '--wav', str(folder / 'none.wav'), '--output', str(output)],
                                 capture_output=True, text=True, encoding='utf-8')
        assert missing.returncode != 0 and 'ValueError: evidence-audio-missing' in missing.stderr.strip().splitlines()[-1]
        probe = subprocess.run([sys.executable, '-X', 'utf8', '-B', str(SCRIPT), '--engines'], capture_output=True, text=True, encoding='utf-8')
        assert json.loads(probe.stdout.strip().splitlines()[-1]) == [{'id': 'midi-evidence', 'available': True}]
    print('midi evidence (python): ok (silent, wrong pitch, written short, drum in silence, all-residue stem, no lengthening under an octave below; right notes left alone)')


if __name__ == '__main__':
    main()
