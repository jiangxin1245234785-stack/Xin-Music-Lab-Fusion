"""analysis-midi/transkun_backend.py drops the notes Transkun writes where the stem is silent.

Transkun rescales every 16 s window to unit variance, so its output does not depend on input gain and a window
holding only a faint separation residue is read like loud piano. The backend checks the decoded notes against
the stem's level with evidence.py's "silent" rule. This test checks the rule on audio it builds itself (and that
it agrees with evidence.judge note by note), then runs the real model on struck tones: at full level they must
survive untouched; a copy 80 dB down in windows of its own is transcribed too (that is the defect) and must be
dropped; a stem that is all such residue, and a digitally silent one, give 0 notes. The model part is skipped,
with a line saying so, when the Transkun weights are not installed in this runtime.

Run with the runtime that has transkun, librosa and pretty_midi (runtime/<ver>/envs/highres):
    python -B tests/transkun-silence.py
"""
import json
import sys
import tempfile
from pathlib import Path

import numpy as np
import pretty_midi
import soundfile as sf

ROOT = Path(__file__).resolve().parent.parent / 'analysis-midi'
sys.path.insert(0, str(ROOT))
import evidence  # noqa: E402
import transkun_backend as tk  # noqa: E402

RATE = 44100
failures = []


def check(ok, message):
    print(('ok   ' if ok else 'FAIL ') + message)
    if not ok:
        failures.append(message)


def tone(pitch, seconds, amp=0.2):
    t = np.arange(int(seconds * RATE)) / RATE
    f = 440.0 * 2 ** ((pitch - 69) / 12)
    wave = sum(a * np.sin(2 * np.pi * f * h * t) for h, a in ((1, 1.0), (2, 0.5), (3, 0.3)))
    return amp * wave * np.minimum(1, np.minimum(t / 0.01, (seconds - t) / 0.05))


def stem():
    """12 s, stereo: tones at 0.5-1.5 s and 2-3 s, -80 dBFS noise elsewhere, a -57 dBFS tone at 9-10 s."""
    rng = np.random.default_rng(7)
    mono = rng.normal(0, 10 ** (-80 / 20), int(12 * RATE))
    for pitch, start, length, amp in ((60, 0.5, 1.0, 0.2), (64, 2.0, 1.0, 0.2), (67, 9.0, 1.0, 0.0018)):
        at = int(start * RATE)
        sound = tone(pitch, length, amp)
        mono[at:at + len(sound)] += sound
    return np.stack([mono, mono * 0.5], axis=1).astype(np.float32)


def test_rule():
    check(tk.SILENCE_REL_DB == evidence.PARAMS['silenceRelDb'] and tk.SILENCE_ABS_DB == evidence.PARAMS['silenceAbsDb'],
          'thresholds equal evidence.PARAMS')
    check(tk.LEVEL_HOP == evidence.LEVEL_HOP, 'level hop equals evidence.LEVEL_HOP')
    audio = stem()
    level, fps, loud = tk.stem_levels(audio, RATE)
    check(abs(fps - RATE / 512) < 1e-9, 'level frame rate is the stem rate over 512')
    check(-25 < loud < -10, 'loud level is that of the tones (%.1f dBFS)' % loud)
    notes = [  # (start, end, silent?)
        (0.6, 0.65, False), (2.1, 2.5, False),            # on the tones
        (4.0, 4.045, True), (6.5, 6.55, True), (11.0, 11.04, True),  # residue only
        (3.02, 3.05, False),                              # just after a tone ends: the 30 ms pad reaches it
        (9.2, 9.25, False),                               # a quiet passage at about -57 dBFS stays
        (8.92, 8.94, False),                              # a short note whose 0.1 s window reaches that passage
    ]
    got = [tk.is_silent(s, e, level, fps, loud) for s, e, _ in notes]
    check(got == [n[2] for n in notes], 'silent verdicts as built: %s' % got)

    # the same notes through evidence.judge on a written WAV + MIDI must agree note by note
    rng = np.random.default_rng(3)
    many = [(float(s), float(s + rng.uniform(0.03, 0.6)), int(rng.integers(40, 90))) for s in rng.uniform(0, 11.5, 150)]
    many += [(s, e, 60) for s, e, _ in notes]
    with tempfile.TemporaryDirectory() as folder:
        folder = Path(folder)
        sf.write(folder / 'piano.wav', audio, RATE, subtype='FLOAT')
        midi = pretty_midi.PrettyMIDI(initial_tempo=120, resolution=960)
        part = pretty_midi.Instrument(program=0, name='piano')
        part.notes = [pretty_midi.Note(80, p, s, e) for s, e, p in many]
        midi.instruments.append(part)
        midi.write(str(folder / 'piano.mid'))
        judged = evidence.judge(folder / 'piano.mid', folder / 'piano.wav')
        reread = pretty_midi.PrettyMIDI(str(folder / 'piano.mid')).instruments[0].notes
        ours = [tk.is_silent(float(n.start), float(n.end), level, fps, loud) for n in reread]
        theirs = [v == evidence.SILENT for v in judged['instruments'][0]['verdicts']]
        check(ours == theirs, 'is_silent agrees with evidence.judge on all %d notes (%d silent)' % (len(ours), sum(ours)))

        # drop_silent works on a PrettyMIDI in place, keeps order and the notes themselves untouched
        midi = pretty_midi.PrettyMIDI(str(folder / 'piano.mid'))
        before = list(midi.instruments[0].notes)
        info = tk.drop_silent(midi, (level, fps, loud))
        after = midi.instruments[0].notes
        check(after == [n for n, s in zip(before, ours) if not s], 'drop_silent keeps exactly the audible notes, in order')
        check(info['dropped'] == sum(ours) and info['kept'] == len(after), 'info counts dropped %d, kept %d' % (info['dropped'], info['kept']))
        check(info['method'] == 'stem-level-1' and info['relDb'] == -50.0 and info['absDb'] == -60.0, 'info names the rule')

    level, fps, loud = tk.stem_levels(np.zeros((100, 2), np.float32), RATE)
    check(len(level) == 0 and tk.is_silent(0.0, 0.05, level, fps, loud), 'a stem shorter than one level frame gives silence, no crash')
    level, fps, loud = tk.stem_levels(np.zeros((RATE * 2, 1), np.float32), RATE)
    check(tk.is_silent(0.5, 0.55, level, fps, loud), 'an all-zero stem counts as silent')
    quiet = stem() * 10 ** (-70 / 20)          # everything under -70 dBFS: no loud level
    level, fps, loud = tk.stem_levels(quiet, RATE)
    check(loud == tk.NO_LOUD and all(tk.is_silent(s, e, level, fps, loud) for s, e, _ in notes),
          'on a stem with no frame above -70 dBFS every note is silent')


def struck(pitch, seconds=1.5):
    """A tone with a 2 ms attack and decaying, slightly stretched harmonics: the model hears these as piano."""
    t = np.arange(int(seconds * RATE)) / RATE
    f = 440.0 * 2 ** ((pitch - 69) / 12)
    wave = sum((0.7 ** h) * np.sin(2 * np.pi * f * (h + 1) * t * (1 + 0.0004 * h * h)) * np.exp(-t * (2 + h))
               for h in range(8))
    return 0.3 * wave * np.minimum(1, t / 0.002)


PITCHES = (60, 64, 67, 72, 55, 59, 62, 67)


def phrase(seconds, at, gain_db=0.0):
    audio = np.zeros(int(seconds * RATE))
    for i, pitch in enumerate(PITCHES):
        tone = struck(pitch) * 10 ** (gain_db / 20)
        start = int((at + i * 1.7) * RATE)
        audio[start:start + len(tone)] += tone
    return audio


def predict(mono, profile, folder):
    wav = Path(folder) / ('%d.wav' % len(list(Path(folder).iterdir())))
    sf.write(wav, np.stack([mono, mono], axis=1).astype(np.float32), RATE, subtype='FLOAT')
    raw = []
    original = tk.drop_silent

    def spy(midi, levels):
        raw.extend((float(n.start), float(n.end), int(n.pitch), int(n.velocity)) for p in midi.instruments for n in p.notes)
        return original(midi, levels)
    tk.drop_silent = spy
    try:
        midi, info = tk.predict(wav, profile, lambda *a: None, len(mono) / RATE)
    finally:
        tk.drop_silent = original
    kept = [(float(n.start), float(n.end), int(n.pitch), int(n.velocity)) for p in midi.instruments for n in p.notes]
    return raw, kept, info['silenceFilter']


def test_model():
    profile = next(p for p in json.loads((ROOT / 'models.json').read_text(encoding='utf-8')) if p['id'] == 'piano-transkun')
    if not tk.ready(profile):
        print('skip the model run: Transkun is not ready in this runtime')
        return
    with tempfile.TemporaryDirectory() as folder:
        # struck tones at 1-15 s; the same phrase 80 dB down at 32-46 s, where no window also holds the loud part
        mono = phrase(48, 1.0) + phrase(48, 32.0, -80.0)
        raw, kept, info = predict(mono, profile, folder)
        loud_raw = [n for n in raw if n[0] < 20]
        quiet_raw = [n for n in raw if n[0] >= 28]
        check(len(loud_raw) >= 6, 'the model writes the loud phrase (%d notes)' % len(loud_raw))
        check(len(quiet_raw) >= 6, 'the model also writes the phrase 80 dB down (%d notes): the defect' % len(quiet_raw))
        check(sorted(kept) == sorted(loud_raw), 'only the loud notes are kept, unchanged (%d kept, %d dropped)' % (len(kept), info['dropped']))
        check(info['dropped'] == len(quiet_raw) and info['kept'] == len(kept) and info['quietStem'] is False,
              'the backend info records the filter')

        raw, kept, info = predict(phrase(16, 1.0, -80.0), profile, folder)
        check(len(raw) >= 6 and not kept and info['quietStem'] is True,
              'a stem that is all residue (peak about -80 dBFS) gives 0 notes (the model wrote %d)' % len(raw))

        raw, kept, info = predict(np.zeros(20 * RATE), profile, folder)
        check(not kept, 'a digitally silent 20 s stem gives 0 notes (the model wrote %d)' % len(raw))


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    test_rule()
    test_model()
    if failures:
        print('%d failed' % len(failures))
        sys.exit(1)
    print('all passed')
