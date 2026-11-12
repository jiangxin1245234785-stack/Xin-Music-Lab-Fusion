"""Keep the harmony when a vocal is swapped: split it, convert each part, place the second voice.

Whole-vocal conversion loses the harmony: the converter follows one pitch, and at 七里香's
「水」 the low harmony came out 52 dB down. Five rounds by ear on that song
(`work/karaoke-20261027/`, settled 2026-11-07) gave this:
  - split the stem into lead and backing (`karaoke_split.py`, on envs/roformer);
  - convert the lead as before (octave guard on) and the backing on its own (guard off: its
    contour is the real lower part, not an octave slip);
  - inside a phrase the second voice keeps one relation to the lead. Moving pieces of it by
    different rules is what was heard as 割裂 / 跳脱 (rounds 3 and 4):
      * RVC voices move both parts by the model's octave, so the relation holds as sung.
        Where the harmony doubles the lead it goes 4 dB under the original ("IU的音色更加
        明亮，低八度还需要压4dB", round 2); where it goes its own way it is matched note
        to note (round 3, IU settled);
      * Seed-VC voices cannot sing outside what their spoken reference carries (公鸭嗓 below,
        an octave fallback above), so `harmony_plan` places the second voice per phrase
        against `voices/<v>/range.json`, measured on first use by `voice_range.py` from the
        song's own lead (round 5, 晓晓 settled);
  - levels are set on the notes, not broadband: the separated backing carries leaked lead,
    and a conversion sings all of it on the harmony's pitch, so a broadband match put the
    harmony's own line 4-7 dB too far forward.

`render()` is what `remix.py --harmony` and the studio bridge call. Intermediate files go
in its `work` folder and are reused when present (the split, each conversion, the lifted
backing), so a second voice or a re-mix only pays for what is new.
"""
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
sys.path.insert(0, str(HERE))

import numpy as np
import soundfile as sf

import harmony_plan
from remix import ACTIVE_BELOW_PEAK_DB, active_rms, fit, window_rms_db

APPLIO = REPO / 'runtime' / 'addons' / 'applio-v1'
ROFORMER_PYTHON = Path(os.environ.get('XLD_ROFORMER_PYTHON') or REPO / 'runtime' / '0.5.0' / 'envs' / 'roformer' / 'python.exe')
KARAOKE_MODEL = REPO / 'runtime' / 'addons' / 'karaoke-v1' / 'becruily' / 'model.ckpt'
FPS = harmony_plan.FPS
GATE_DB = 35.0              # backing frames this far under its loudest frame count as silent
WINDOW, FADE, EDGE = 0.05, 0.04, 0.1
OWN_SHORTEST, OWN_GAP = 0.15, 0.10
DOUBLE_DB = -4.0            # RVC: the lead-doubling part of the harmony, under the original
CALIBRATE_DB = (-12.0, 6.0)
EXCERPT = 30.0              # seconds of the song's lead a missing voice range is measured on


def available():
    return KARAOKE_MODEL.is_file() and ROFORMER_PYTHON.is_file()


def _run(arguments, python=None):
    result = subprocess.run([str(python or sys.executable), '-X', 'utf8', *map(str, arguments)],
                            capture_output=True, text=True, encoding='utf-8', errors='replace')
    if result.returncode:
        tail = (result.stderr or result.stdout).strip().splitlines()[-3:]
        raise SystemExit(f'{Path(str(arguments[0])).name} 失败：' + ' / '.join(tail))


def split(vocal_path, work):
    """lead / backing of the stem, stereo and folded to mono, cached in `work`."""
    work.mkdir(parents=True, exist_ok=True)
    if not (work / 'backing.wav').is_file():
        _run([HERE / 'karaoke_split.py', vocal_path, work], python=ROFORMER_PYTHON)
    for part in ('lead', 'backing'):
        if not (work / f'{part}-mono.wav').is_file():
            audio, rate = sf.read(str(work / f'{part}.wav'), dtype='float32', always_2d=True)
            sf.write(str(work / f'{part}-mono.wav'), audio.mean(axis=1), rate, subtype='FLOAT')
    return work / 'lead-mono.wav', work / 'backing-mono.wav'


_rmvpe = []


def pitch(y, rate, frames, chunk=3000, context=100):
    """(MIDI notes with NaN where silent, f0 in Hz) per 10 ms frame, from RMVPE.

    A whole song goes through in 30 s pieces with 1 s of context either side: RMVPE runs
    its network over the entire input at once."""
    if not _rmvpe:
        sys.path.insert(0, str(APPLIO / 'deps'))
        sys.path.insert(0, str(APPLIO / 'upstream'))
        os.environ.setdefault('APPLIO_CONFIG_FILE', str(APPLIO / 'config.json'))
        import torch
        from rvc.lib.predictors.RMVPE import RMVPE0Predictor
        _rmvpe.append(RMVPE0Predictor(str(APPLIO / 'upstream/rvc/models/predictors/rmvpe.pt'),
                                      device='cuda' if torch.cuda.is_available() else 'cpu'))
    import librosa
    y16 = librosa.resample(np.asarray(y, dtype=np.float32), orig_sr=rate, target_sr=16000)
    pieces = []
    for first in range(0, len(y16) // 160 + 1, chunk):
        start = max(0, first - context)
        part = _rmvpe[0].infer_from_audio(y16[start * 160:(first + chunk + context) * 160], thred=0.03)
        pieces.append(part[first - start:first - start + chunk])
    f0 = np.concatenate(pieces)
    f0 = np.pad(f0, (0, max(0, frames - len(f0))))[:frames].astype(np.float64)
    notes = np.full(frames, np.nan)
    notes[f0 > 1] = 69 + 12 * np.log2(f0[f0 > 1] / 440.0)
    return notes, f0


def converted(work, source, name, rate, frames):
    """A conversion of `source` as written by swap.py / rvc.py, mono, at `rate`, `frames` long."""
    audio, own_rate = sf.read(str(work / f'{source.stem}__{name}.wav'), dtype='float32')
    audio = audio.mean(axis=1) if audio.ndim > 1 else audio
    if own_rate != rate:
        import soxr
        audio = soxr.resample(audio, own_rate, rate, 'VHQ').astype(np.float32)
    return fit(audio, frames)


def convert(work, source, names, backend, extra=()):
    """Run swap.py / rvc.py on `source` for the voices whose result is not in `work` yet."""
    missing = [n for n in names if not (work / f'{source.stem}__{n}.wav').is_file()]
    if missing:
        script, flag = ('swap.py', '--voice') if backend == 'seedvc' else ('rvc.py', '--model')
        _run([HERE / script, source, flag, *missing, '--out', work, *extra])
        record = work / f'{source.stem}.f0-repairs.json'
        if record.is_file():                    # each backend keeps its own octave decisions
            record.replace(work / f'{source.stem}.{backend}.f0-repairs.json')


def voice_range(name, lead_path, work):
    """(low, high) MIDI of a Seed-VC voice, measured from this song's lead if never measured."""
    path = HERE / 'voices' / name / 'range.json'
    if not path.is_file():
        lead, rate = sf.read(str(lead_path), dtype='float32')
        size = int(EXCERPT * rate)
        power = np.concatenate([[0.0], np.cumsum(lead.astype(np.float64) ** 2)])
        starts = np.arange(0, max(1, len(lead) - size + 1), rate)        # the loudest 30 s, on 1 s steps
        start = int(starts[np.argmax(power[np.minimum(starts + size, len(lead))] - power[starts])])
        excerpt = work / 'range-source.wav'
        sf.write(str(excerpt), lead[start:start + size], rate, subtype='FLOAT')
        _run([HERE / 'voice_range.py', excerpt, '--voice', name, '--work', work / 'range-sweep'])
    table = json.loads(path.read_text(encoding='utf-8'))
    return table['low'], table['high']


class Song:
    """The split parts of one stem, their notes, and the level tools every voice shares."""

    def __init__(self, lead_path, back_path):
        self.lead, self.rate = sf.read(str(lead_path), dtype='float32')
        self.back = sf.read(str(back_path), dtype='float32')[0]
        self.total, self.hop = len(self.lead), self.rate // FPS
        self.frames = self.total // self.hop + 1
        self.lead_notes, _ = pitch(self.lead, self.rate, self.frames)
        self.back_notes, self.back_f0 = pitch(self.back, self.rate, self.frames)
        padded = np.pad(self.back.astype(np.float64), (0, self.frames * self.hop - self.total))
        level = 10 * np.log10(np.mean(padded.reshape(self.frames, self.hop) ** 2, axis=1) + 1e-12)
        self.back_notes[level < level.max() - GATE_DB] = np.nan
        self.original = self.lead + self.back

    def matched(self, audio, reference):
        loudness, step = window_rms_db(reference, self.rate)
        active = loudness > loudness.max() - ACTIVE_BELOW_PEAK_DB
        return audio * active_rms(reference, active, step) / max(1e-9, active_rms(audio, active, step))

    def _windows(self, y):
        step = int(WINDOW * self.rate)
        count = len(y) // step
        return np.sqrt(np.mean(y[:count * step].reshape(count, step).astype(np.float64) ** 2, axis=1) + 1e-12), step

    def _per_sample(self, values, step):
        return np.interp(np.arange(self.total), (np.arange(len(values)) + 0.5) * step, values).astype(np.float32)

    def follow_source(self, audio):
        """The converted backing at the source backing's loudness, 50 ms at a time."""
        source, step = self._windows(self.back)
        mine, _ = self._windows(audio)
        gain = np.convolve(np.clip(source / mine, 0.25, 4.0), np.ones(3) / 3, mode='same')
        return audio * self._per_sample(gain, step)

    def follow_double(self, audio):
        """A derived double of the lead at the original backing's level against the lead."""
        lead_rms, step = self._windows(self.lead)
        back_rms, _ = self._windows(self.back)
        ratio = np.convolve(np.clip(back_rms / lead_rms, 0.0, 1.5), np.ones(3) / 3, mode='same')
        return self.matched(audio, self.lead) * self._per_sample(ratio, step)

    def note_ratio(self, harmony, melody, a, b, harmony_notes, melody_notes):
        """Median dB of `harmony` on the harmony's note against `melody` on the lead's, frames a..b."""
        import librosa
        cqt = lambda y: np.abs(librosa.cqt(y[a * self.hop:b * self.hop], sr=self.rate, hop_length=self.hop,
                                           fmin=librosa.midi_to_hz(24), n_bins=72)) ** 2
        h, m = cqt(harmony), cqt(melody)
        values = []
        for k in range(min(h.shape[1], m.shape[1], b - a)):
            if np.isfinite(melody_notes[a + k]) and np.isfinite(harmony_notes[a + k]):
                hi, li = int(round(harmony_notes[a + k])) - 24, int(round(melody_notes[a + k])) - 24
                if 0 <= hi < 72 and 0 <= li < 72:
                    values.append(10 * np.log10(h[hi, k] + 1e-12) - 10 * np.log10(m[li, k] + 1e-12))
        return float(np.median(values)) if len(values) >= 5 else None

    def calibration(self, harmony, melody, a, b, harmony_notes, melody_notes):
        """dB that puts the harmony note against the lead note where the original has it."""
        want = self.note_ratio(self.original, self.original, a, b, self.back_notes, self.lead_notes)
        have = self.note_ratio(harmony, melody, a, b, harmony_notes, melody_notes)
        return None if want is None or have is None else float(np.clip(want - have, *CALIBRATE_DB))

    def ramped(self, spans, fade=FADE):
        """1 inside each (start, end) frame range, linear ramps of `fade` seconds outside."""
        mask = np.zeros(self.total, dtype=np.float32)
        ramp = int(fade * self.rate)
        for a, b in spans:
            s, e = a * self.hop, min(self.total, b * self.hop)
            mask[s:e] = 1.0
            mask[max(0, s - ramp):s] = np.maximum(mask[max(0, s - ramp):s], np.linspace(0, 1, s - max(0, s - ramp), endpoint=False))
            mask[e:e + ramp] = np.maximum(mask[e:e + ramp], np.linspace(1, 0, len(mask[e:e + ramp]), endpoint=False))
        return mask

    def own_stretches(self):
        """Frame ranges where the harmony goes its own way (round 3's rule)."""
        own = harmony_plan.kinds(self.lead_notes, self.back_notes) == 'own'
        edges = np.flatnonzero(np.diff(np.concatenate([[0], own.astype(int), [0]])))
        spans = []
        for a, b in zip(edges[::2], edges[1::2]):
            if spans and a - spans[-1][1] < OWN_GAP * FPS:
                spans[-1][1] = b
            else:
                spans.append([a, b])
        return [(a, b) for a, b in spans if b - a >= OWN_SHORTEST * FPS]


def lift_backing(song, path):
    """The backing an octave up with WORLD, except where it already sits on the lead's pitch
    (in a separated backing that is mostly leaked lead; lifted it would be a ghost melody)."""
    if path.is_file():
        return
    sys.path.insert(0, str(REPO / 'runtime' / 'addons' / 'voiceswap-deps'))
    import pyworld
    stay = np.abs(song.lead_notes - song.back_notes) < harmony_plan.UNISON
    stay = np.convolve(stay.astype(float), np.ones(5) / 5, mode='same') > 0.5
    y = song.back.astype(np.float64)
    t = np.arange(song.frames) / FPS
    f0 = song.back_f0
    world = pyworld.synthesize(np.where(stay, f0, f0 * 2), pyworld.cheaptrick(y, f0, t, song.rate),
                               pyworld.d4c(y, f0, t, song.rate), song.rate, frame_period=1000 / FPS)
    sf.write(str(path), fit(world, song.total).astype(np.float32), song.rate, subtype='FLOAT')


def seedvc_second(song, plan, sources, lead_x):
    """The second voice for a Seed-VC voice: one placement per phrase, calibrated per phrase."""
    second = np.zeros(song.total, dtype=np.float32)
    ramp = int(FADE * song.rate)
    for i, p in enumerate(plan):
        if p['choice'] == 'drop':
            continue
        a, b = int(round(p['start'] * FPS)), int(round(p['end'] * FPS))
        gain = 1.0
        if p['choice'] != 'unison':
            target = harmony_plan.second_voice(p['choice'], song.lead_notes, song.back_notes)
            change = song.calibration(sources[p['choice']], lead_x, a, b, target, song.lead_notes)
            if change is not None:
                gain = 10 ** (change / 20)
                p['calibrationDb'] = round(change, 1)
        before = plan[i - 1]['end'] if i else 0.0
        after = plan[i + 1]['start'] if i + 1 < len(plan) else song.total / song.rate
        s = int(max(before, p['start'] - min(EDGE, (p['start'] - before) / 2)) * song.rate)
        e = int(min(after, p['end'] + min(EDGE, (after - p['end']) / 2)) * song.rate)
        window = np.zeros(song.total, dtype=np.float32)
        window[s:e] = 1.0
        window[s:s + ramp] = np.linspace(0, 1, len(window[s:s + ramp]))
        window[max(s, e - ramp):e] = np.linspace(1, 0, len(window[max(s, e - ramp):e]))
        second += sources[p['choice']] * gain * window
    return second


def rvc_second(song, back_x, lead_x, octave):
    """The second voice for an RVC voice: the double 4 dB under, its own line note-matched."""
    spans = song.own_stretches()
    weight = song.ramped(spans)
    own = song.follow_source(back_x)
    gains = np.ones(song.total, dtype=np.float32)
    ramp, shift, changes = int(FADE * song.rate), 12 * octave, []
    for a, b in spans:
        change = song.calibration(own, lead_x, a, b, song.back_notes + shift, song.lead_notes + shift)
        if change is not None:
            gains[max(0, a * song.hop - ramp):b * song.hop + ramp] = 10 ** (change / 20)
            changes.append(round(change, 1))
    second = back_x * 10 ** (DOUBLE_DB / 20) * (1 - weight) + own * gains * weight
    return second, {'ownStretches': len(spans), 'ownSeconds': round(sum(b - a for a, b in spans) / FPS, 2),
                    'calibrationDb': changes}


def render(vocal_path, work, seedvc=(), rvc=(), progress=lambda fraction, message: None):
    """{voice: (mono vocal at the stem's rate: lead + placed second voice, report)}."""
    import rvc_models

    progress(0.05, '分离主唱和和声')
    lead_path, back_path = split(Path(vocal_path), Path(work))
    work = Path(work)
    progress(0.2, '读主唱、和声的音高')
    song = Song(lead_path, back_path)

    plans, reports = {}, {}
    for name in seedvc:
        low, high = voice_range(name, lead_path, work)
        plans[name] = harmony_plan.plan(song.lead_notes, song.back_notes, low, high)
        check = harmony_plan.precheck(song.back_notes, low, high)
        reports[name] = {'range': [low, high], 'harmonyOutsideRange': round(check['below'] + check['above'], 3)}
    needs = {c: [n for n in seedvc if any(p['choice'] == c for p in plans[n])] for c in ('keep', 'up', 'unison')}

    progress(0.3, '转主唱')
    if seedvc:
        convert(work, lead_path, seedvc, 'seedvc')
    decided = work / f'{lead_path.stem}.seedvc.f0-repairs.json'
    if rvc:
        follow = ['--follow-octaves', decided] if decided.is_file() else []
        convert(work, lead_path, rvc, 'rvc', follow)
        convert(work, back_path, rvc, 'rvc', ['--keep-octaves'])
    progress(0.55, '转和声')
    if needs['keep']:
        convert(work, back_path, needs['keep'], 'seedvc', ['--keep-octaves'])
    if needs['up']:
        lift_backing(song, work / 'backing-up.wav')
        convert(work, work / 'backing-up.wav', needs['up'], 'seedvc', ['--keep-octaves'])
    if needs['unison']:
        double = work / 'lead-double.wav'
        if not double.is_file():
            shutil.copy(lead_path, double)
        convert(work, double, needs['unison'], 'seedvc')

    progress(0.85, '按原唱的轻重放回和声')
    out = {}
    for name in seedvc:
        lead_x = song.matched(converted(work, lead_path, name, song.rate, song.total), song.lead)
        sources = {}
        if name in needs['keep']:
            sources['keep'] = song.follow_source(song.matched(converted(work, back_path, name, song.rate, song.total), song.back))
        if name in needs['up']:
            up = converted(work, work / 'backing-up.wav', name, song.rate, song.total)
            sources['up'] = song.follow_source(song.matched(up, song.back))
        if name in needs['unison']:
            sources['unison'] = song.follow_double(converted(work, work / 'lead-double.wav', name, song.rate, song.total))
        plan = plans[name]
        second = seedvc_second(song, plan, sources, lead_x)
        chosen = {c: sum(1 for p in plan if p['choice'] == c) for c in harmony_plan.CHOICES}
        left = {k: sum(p['scores'][p['choice']][k] for p in plan) for k in ('range', 'cross', 'second', 'lost_own')}
        reports[name].update(phrases=len(plan), choices={harmony_plan.LABELS[c]: n for c, n in chosen.items() if n},
                             remaining=left, plan=[{k: v for k, v in p.items() if k != 'scores'} for p in plan])
        out[name] = (lead_x + second, reports[name])
    for name in rvc:
        lead_x = song.matched(converted(work, lead_path, name, song.rate, song.total), song.lead)
        back_x = song.matched(converted(work, back_path, name, song.rate, song.total), song.back)
        second, report = rvc_second(song, back_x, lead_x, rvc_models.MODELS[name]['octave'])
        out[name] = (lead_x + second, report)
    progress(1.0, '和声放好了')
    return out
