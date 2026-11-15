"""Check every note of a transcribed MIDI against the stem it was transcribed from.

No model is involved. For each written note the stem is asked two questions: is there any sound at that moment,
and is there energy at that pitch. The answers are a verdict per note; nothing is changed here. Applying them
(dropping the notes that sit in silence, lengthening the ones that were written short) is a hand-edit revision
made by core/midi-evidence.cjs through the ordinary revision path, so the original result always survives.

Verdicts, in the order they are tested:

  3 silent    the stem is silent where the note is written. Certain: nothing there can be heard.
  2 no-pitch  the stem sounds, but neither the fundamental nor the harmonic sum is at the note's pitch.
  1 weak      some energy at the pitch, below what agreed notes normally show. Kept, shown dimmed.
  0 ok

WHERE THE THRESHOLDS CAME FROM (work/midi-quality-20261113, 2026-11-13; fixed before any human label)

  silence   Across the library's 136,302 active notes the level at a note, relative to its stem's loud level,
            has a valley between -50 and -40 dB. The rule sits on the quiet side: 50 dB under AND under -60 dBFS.
            2,650 notes (1.9 %) qualify, nearly all piano-transkun (26.9 % of its notes) — it writes 40-50 ms
            notes on silent input.
  no-pitch  The loosest pair that removes at most ~0.4 % of the notes that several independent engines agree on
            (20 of 5,016 on MEGURI guitar/strings and Nancy piano) while taking 4-21 % of the notes only one
            engine wrote. Agreement between engines is a stand-in for truth, not truth: this tier only marks.
  short     A note is "written short" when the stem keeps sounding its pitch for at least 0.15 s and a quarter
            of the note's own length past the written end — and nothing else explains that sound. Two things do,
            and the first version of this rule (audio-evidence-1) took both for the old note ringing on: a note
            an octave, a twelfth or two octaves below has partials on this pitch, and under about C3 the analysis
            cannot tell neighbours two semitones apart. So the pitch has to be the strongest fundamental within
            two semitones for as long as it is followed, and it is never followed under a written note 12, 19 or
            24 semitones below. On audio made for the purpose (work/midi-quality-20261113/REPORT-LENGTH.md) the
            first version called 0-5.7 % of correctly written legato notes short; this one none, and it still
            finds 84-100 % of notes written 0.3 s short, reading their end within -22..+26 ms. 七里香 bass went
            from 59 of 305 to 2: the first count was mostly the next note. A bass note that really rings into the
            next one is not seen by this rule; it leaves those alone.

Drum instruments get the silence test only: a drum hit has no pitch to look for.
"""
import argparse
import hashlib
import json
from pathlib import Path

SR = 22050
HOP = 256
BPO = 36                       # three bins per semitone
P_LO, P_HI = 21, 108           # A0..C8
N_BINS = 3 * (123 - P_LO)      # top bin just under 10 kHz
WEIGHTS = (1.0, 0.8, 0.64, 0.51, 0.41, 0.33)
FPS = SR / HOP
LEVEL_HOP = 512

PARAMS = {
    'silenceRelDb': -50.0, 'silenceAbsDb': -60.0,
    'noPitchH1Db': -40.0, 'noPitchSalDb': -30.0,
    'weakH1Db': -30.0, 'weakSalDb': -20.0,
    'shortMinSeconds': 0.15, 'shortMinShare': 0.25, 'shortMaxSeconds': 4.0,
    'shortSalDropDb': 12.0, 'shortSalFloorDb': -25.0, 'shortH1DropDb': 15.0, 'shortH1FloorDb': -35.0,
    'shortGapSeconds': 0.03, 'shortPeakSemitones': 2, 'shortBelowSemitones': [12, 19, 24],
}
METHOD = 'audio-evidence-2'    # core/midi-evidence.cjs reads no other: a sidecar from an older rule is stale
OK, WEAK, NO_PITCH, SILENT = 0, 1, 2, 3
QUIET_STEM_DB = -120.0         # read_levels' loud level for a stem with nothing above -70 dBFS


def read_levels(path):
    """Frame level of the stem in dBFS (the louder channel, so a hard-panned part is not averaged away)."""
    import numpy as np
    import soundfile as sf
    audio, rate = sf.read(str(path), dtype='float32', always_2d=True)
    frames = (audio.shape[0] // LEVEL_HOP) * LEVEL_HOP
    if not frames:
        raise ValueError('evidence-audio-empty')
    energy = (audio[:frames] ** 2).reshape(-1, LEVEL_HOP, audio.shape[1]).mean(axis=1).max(axis=1)
    level = 10 * np.log10(energy + 1e-20)
    audible = level[level > -70]
    loud = float(np.percentile(audible, 95)) if audible.size else -120.0
    return audio.mean(axis=1), rate, level, rate / LEVEL_HOP, loud


class Salience:
    """Per-pitch harmonic salience of a whole stem, in dB relative to the stem's own loud tonal level."""

    def __init__(self, mono, rate):
        import numpy as np
        import librosa
        from scipy.ndimage import maximum_filter1d, median_filter
        if rate != SR:
            mono = librosa.resample(mono, orig_sr=rate, target_sr=SR, res_type='soxr_hq')
        self.tuning = float(librosa.estimate_tuning(y=mono, sr=SR, bins_per_octave=BPO)) if float(np.abs(mono).max()) > 1e-4 else 0.0
        magnitude = np.abs(librosa.vqt(mono, sr=SR, hop_length=HOP, fmin=librosa.midi_to_hz(P_LO), n_bins=N_BINS,
                                       bins_per_octave=BPO, tuning=self.tuning)).astype(np.float32)
        self.frames = magnitude.shape[1]
        # What stands above the local spectral floor: rejects broadband hits and noise.
        tonal = np.maximum(magnitude - median_filter(magnitude, size=(31, 1), mode='nearest'), 0.0)
        tonal = maximum_filter1d(tonal, size=3, axis=0, mode='nearest')          # a third of a semitone either way
        pitches = P_HI - P_LO + 1
        self.sal = np.zeros((pitches, self.frames), np.float32)
        self.h1 = np.zeros_like(self.sal)
        offsets = [int(round(BPO * np.log2(h))) for h in range(1, len(WEIGHTS) + 1)]
        for index in range(pitches):
            for k, offset in enumerate(offsets):
                row = 3 * index + offset
                if row >= N_BINS:
                    break
                self.sal[index] += tonal[row] * WEIGHTS[k]
                if k == 0:
                    self.h1[index] = tonal[row]
        self.reference = float(np.percentile(self.sal.max(axis=0), 99)) + 1e-9
        self.sal_db = 20 * np.log10(np.maximum(self.sal, 1e-12) / self.reference)
        self.h1_db = 20 * np.log10(np.maximum(self.h1, 1e-12) / self.reference)

    def span(self, start, end):
        first = max(0, int(start * FPS))
        last = min(self.frames, int(end * FPS) + 2)
        return first, max(last, first + 1)

    def at(self, pitch, start, end):
        """(harmonic sum, fundamental) at the frame where the note is at its 90th-percentile salience."""
        import numpy as np
        index = int(pitch) - P_LO
        if not 0 <= index <= P_HI - P_LO:
            return None
        first, last = self.span(start - 0.03, max(min(end, start + 0.5), start + 0.12) + 0.03)
        window = self.sal[index, first:last]
        frame = first + int(np.argsort(window)[int(0.9 * (len(window) - 1))])
        return float(self.sal_db[index, frame]), float(self.h1_db[index, frame])

    def sounds_until(self, pitch, end, limit, sal_level, h1_level, params):
        """How long past the written end the stem keeps sounding this pitch, and no neighbouring one louder."""
        index = int(pitch) - P_LO
        carries = ((self.sal_db[index] >= max(sal_level - params['shortSalDropDb'], params['shortSalFloorDb'])) &
                   (self.h1_db[index] >= max(h1_level - params['shortH1DropDb'], params['shortH1FloorDb'])))
        for step in range(1, int(params['shortPeakSemitones']) + 1):
            for other in (index - step, index + step):
                if 0 <= other < self.h1.shape[0]:
                    carries &= self.h1[index] >= self.h1[other]
        frame = min(self.frames - 1, int(end * FPS))
        last = min(self.frames - 1, int(limit * FPS))
        while frame + 1 <= last and carries[frame + 1]:
            frame += 1
        return frame / FPS


def judge(midi_path, wav_path, params=PARAMS):
    import pretty_midi
    midi = pretty_midi.PrettyMIDI(str(midi_path))
    mono, rate, level, level_fps, loud = read_levels(wav_path)
    pitched = any(not part.is_drum and part.notes for part in midi.instruments)
    salience = Salience(mono, rate) if pitched else None
    duration = len(mono) / rate
    # Every pitched note in the file, by pitch: a note in any part of this stem can explain sound at another pitch.
    written = {}
    for part in midi.instruments:
        if not part.is_drum:
            for note in part.notes:
                written.setdefault(int(note.pitch), []).append((float(note.start), float(note.end)))
    instruments = []
    totals = {'notes': 0, 'silent': 0, 'noPitch': 0, 'weak': 0, 'short': 0}
    for at, part in enumerate(midi.instruments):
        verdicts, measured = [], []
        for note in part.notes:
            first = max(0, int((note.start - 0.03) * level_fps))
            last = min(len(level), int((max(note.end, note.start + 0.1) + 0.03) * level_fps) + 1)
            local = float(level[first:last].max()) if last > first else -200.0
            reading = None if part.is_drum or salience is None else salience.at(note.pitch, note.start, note.end)
            # A stem with no frame above -70 dBFS has no loud level to be 50 dB under (read_levels gives -120), and
            # the relative test could then never pass: there the absolute test alone decides. New Order - Ceremony's
            # piano stem peaks at -87 dBFS and carried 341 notes that the two-part rule called fine.
            if local < params['silenceAbsDb'] and (loud <= QUIET_STEM_DB or local < loud + params['silenceRelDb']):
                verdict = SILENT
            elif reading is None:
                verdict = OK
            elif reading[1] < params['noPitchH1Db'] and reading[0] < params['noPitchSalDb']:
                verdict = NO_PITCH
            elif reading[1] < params['weakH1Db'] and reading[0] < params['weakSalDb']:
                verdict = WEAK
            else:
                verdict = OK
            verdicts.append(verdict)
            measured.append(reading)
        # Written short: only notes that passed, and never into the next note of the same pitch in this
        # instrument — the revision writer refuses same-pitch overlaps, and it is right to.
        extend = {}
        if salience is not None and not part.is_drum:
            starts = {}
            for note in part.notes:
                starts.setdefault(int(note.pitch), []).append(float(note.start))
            for values in starts.values():
                values.sort()
            for index, note in enumerate(part.notes):
                if verdicts[index] != OK or measured[index] is None or note.end <= note.start:
                    continue
                later = [s for s in starts[int(note.pitch)] if s > note.start + 1e-6]
                limit = min(duration, note.end + params['shortMaxSeconds'],
                            (later[0] - params['shortGapSeconds']) if later else duration)
                # ... and never under a note whose partials sit on this pitch
                for interval in params['shortBelowSemitones']:
                    for start, end in written.get(int(note.pitch) - interval, ()):
                        if end > note.end and start < limit:
                            limit = max(float(note.end), start - params['shortGapSeconds'])
                if limit <= note.end:
                    continue
                until = min(limit, salience.sounds_until(note.pitch, note.end, limit, measured[index][0], measured[index][1], params))
                gain = until - float(note.end)
                if gain >= params['shortMinSeconds'] and gain >= params['shortMinShare'] * (note.end - note.start):
                    extend[str(index)] = round(until, 4)
        instruments.append({
            'index': at, 'name': str(part.name), 'program': int(part.program), 'isDrum': bool(part.is_drum),
            'noteCount': len(part.notes), 'verdicts': verdicts, 'extend': extend,
        })
        totals['notes'] += len(part.notes)
        totals['silent'] += verdicts.count(SILENT)
        totals['noPitch'] += verdicts.count(NO_PITCH)
        totals['weak'] += verdicts.count(WEAK)
        totals['short'] += len(extend)
    return {
        'schemaVersion': 1, 'kind': 'midi-evidence', 'method': METHOD, 'params': params,
        'midiSha256': hashlib.sha256(Path(midi_path).read_bytes()).hexdigest(),
        'audio': {'loudDbfs': round(loud, 1), 'tuning': round(salience.tuning, 3) if salience else None,
                  'seconds': round(duration, 3)},
        'totals': totals, 'instruments': instruments,
    }


def selftest():
    """The runtime probe, in the shape every other runner answers it."""
    try:
        import librosa        # noqa: F401
        import numpy          # noqa: F401
        import pretty_midi    # noqa: F401
        import scipy.ndimage  # noqa: F401
        import soundfile      # noqa: F401
        return [{'id': 'midi-evidence', 'available': True}]
    except Exception as error:                                   # noqa: BLE001 - the probe reports, never raises
        return [{'id': 'midi-evidence', 'available': False, 'error': str(error)[:200]}]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--engines', action='store_true')
    parser.add_argument('--midi', type=Path)
    parser.add_argument('--wav', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    if args.engines:
        print(json.dumps(selftest()), flush=True)
        return
    if not args.midi or not args.wav or not args.output:
        raise SystemExit('evidence-job-required')
    if not args.midi.is_file():
        raise ValueError('evidence-midi-missing')
    if not args.wav.is_file():
        raise ValueError('evidence-audio-missing')
    result = judge(args.midi, args.wav)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result), encoding='utf-8')
    print(json.dumps({'ok': True, 'totals': result['totals'], 'midiSha256': result['midiSha256']}), flush=True)


if __name__ == '__main__':
    main()
