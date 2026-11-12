"""Measure the range a Seed-VC voice can sing in, and keep it next to the voice.

    python -X utf8 voice_range.py <sung source wav> --voice xiaoxiao [--work <dir>]
    python -X utf8 voice_range.py --voice xiaoxiao --decide     # re-apply the rule only

Seed-VC keeps the source's pitch, but only inside what its spoken reference can carry.
Above that the output falls back an octave (晓晓: a lead moved to D#5 came out at D#4);
below it the pitch is still followed but the voice turns into a 公鸭嗓 (晓晓 on a D#3
harmony, heard in rounds 1 and 3). So the range is measured, not assumed: one sung phrase
is moved with WORLD to a ladder of transpositions, each is converted, and per rung:
  - follow: share of frames sung within 50 cents of the moved source;
  - fallback: share an octave away from it;
  - likeness: campplus between the output and the voice's own reference.
Follow is also counted per source note across all rungs. `decide()` turns the table into
`low` / `high`; the rule is written into the file with the numbers it used.

Needs pyworld from `runtime/addons/voiceswap-deps` and Applio's RMVPE (envs/highres).
Writes `voices/<voice>/range.json`; `make_voices.py` rewrites voice.json, so it lives apart.
"""
import argparse
import json
import os
import sys
import tempfile
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
APPLIO = REPO / 'runtime' / 'addons' / 'applio-v1'
sys.path.insert(0, str(HERE))
LADDER = list(range(-14, 13, 2))
FOLLOW, ENOUGH, LIKENESS_DROP, CENTS = 0.85, 30, 0.03, 0.5
NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
name = lambda midi: f'{NAMES[int(midi) % 12]}{int(midi) // 12 - 1}'


def decide(table):
    """`high`: going up from the reference's median, the last note still followed ≥85%,
    pooled with the semitone either side (single notes are noisy: transitions and vibrato
    land on the odd ones). Above it the output starts falling back an octave.
    `low`: going down from the rung most like the voice's reference, the median of the last
    rung within 0.03 of it. Pitch is still followed far below that; what goes is the voice.
    On 晓晓 the likeness knee sits between G3 and F3, where the ear put the 公鸭嗓 (D#3 bad).
    The upper bound is a hard measurement; the lower one is a proxy fitted to that ear."""
    notes = {int(k): v for k, v in table['notes'].items()}

    def pooled(midi):
        rows = [notes[n] for n in (midi - 1, midi, midi + 1) if n in notes]
        frames = sum(r[0] for r in rows)
        return sum(r[0] * r[1] for r in rows) / frames if frames >= ENOUGH else 0.0

    start = int(round(table['referenceMedian']))
    high = start
    while pooled(high + 1) >= FOLLOW:
        high += 1
    ladder = sorted(table['ladder'], key=lambda r: r['shift'])
    best = max(range(len(ladder)), key=lambda i: ladder[i]['likeness'])
    low = ladder[best]['median']
    for rung in reversed(ladder[:best]):
        if rung['likeness'] < ladder[best]['likeness'] - LIKENESS_DROP:
            break
        low = rung['median']
    rule = (f'high：从参考说话中位 {name(start)} 往上，连同上下各一个半音合计「跟住 ≥{FOLLOW:.0%}」的最后一个音；'
            f'low：从最像本人（campplus）的一档往下，像本人不比它低 {LIKENESS_DROP} 的最后一档，取它的中位音')
    return low, high, rule


def measure(source, voice, work):
    sys.path.insert(0, str(REPO / 'runtime' / 'addons' / 'voiceswap-deps'))
    sys.path.insert(0, str(APPLIO / 'deps'))
    sys.path.insert(0, str(APPLIO / 'upstream'))
    os.environ['APPLIO_CONFIG_FILE'] = str(APPLIO / 'config.json')
    import librosa
    import numpy as np
    import pyworld
    import soundfile as sf
    import torch
    from rvc.lib.predictors.RMVPE import RMVPE0Predictor

    rmvpe = RMVPE0Predictor(str(APPLIO / 'upstream/rvc/models/predictors/rmvpe.pt'),
                            device='cuda' if torch.cuda.is_available() else 'cpu')

    def contour(y, rate, frames):
        f0 = rmvpe.infer_from_audio(librosa.resample(y.astype(np.float32), orig_sr=rate, target_sr=16000), thred=0.03)
        return np.pad(f0, (0, max(0, frames - len(f0))))[:frames].astype(np.float64)

    def notes(f0):
        n = np.full(len(f0), np.nan)
        n[f0 > 1] = 69 + 12 * np.log2(f0[f0 > 1] / 440.0)
        return n

    y, rate = sf.read(str(source), dtype='float64')
    y = y.mean(axis=1) if y.ndim > 1 else y
    frames = len(y) * 100 // rate + 1
    f0 = contour(y, rate, frames)
    t = np.arange(frames) / 100.0
    sp, ap = pyworld.cheaptrick(y, f0, t, rate), pyworld.d4c(y, f0, t, rate)
    reference = HERE / 'voices' / voice / 'reference.wav'
    ref_y, ref_rate = sf.read(str(reference), dtype='float64')
    ref_notes = notes(contour(ref_y.mean(axis=1) if ref_y.ndim > 1 else ref_y, ref_rate,
                              len(ref_y) * 100 // ref_rate + 1))

    import speaker
    import swap
    swap.REPAIR['enabled'] = False          # measure what the model does, not the guard
    engine = swap.load_engine(swap.verify())
    mine = speaker.embed(reference)
    ladder, per_note = [], {}
    work.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as scratch:
        for shift in LADDER:
            moved = Path(scratch) / f'shift{shift:+d}.wav'
            sf.write(str(moved), pyworld.synthesize(f0 * 2 ** (shift / 12), sp, ap, rate, frame_period=10.0)
                     .astype(np.float32), rate)
            out = work / f'{voice}.shift{shift:+d}.wav'
            swap.convert(engine, moved, reference, out, 30, 0.7)
            sung, sung_rate = sf.read(str(out), dtype='float64')
            want = notes(f0) + shift
            got = notes(contour(sung.mean(axis=1) if sung.ndim > 1 else sung, sung_rate, frames))
            both = np.isfinite(want) & np.isfinite(got)
            off = got[both] - want[both]
            followed = np.abs(off) < CENTS
            for midi, hit in zip(np.round(want[both]).astype(int), followed):
                count = per_note.setdefault(int(midi), [0, 0])
                count[0] += 1
                count[1] += int(hit)
            rung = {'shift': shift, 'median': float(np.median(want[both])), 'bottom': float(np.percentile(want[both], 5)),
                    'follow': float(np.mean(followed)), 'fallback': float(np.mean(np.abs(np.abs(off) - 12) < 0.5)),
                    'likeness': float(np.dot(speaker.embed(out), mine))}
            ladder.append(rung)
            print(f'  {shift:+3d}  中位 {name(round(rung["median"])):>4}  最低 {name(round(rung["bottom"])):>4}'
                  f'  跟住 {rung["follow"]:4.0%}  掉八度 {rung["fallback"]:4.0%}  像本人 {rung["likeness"]:.3f}', flush=True)
    return {'voice': voice, 'source': Path(source).name, 'measured': date.today().isoformat(),
            'referenceMedian': float(np.nanmedian(ref_notes)), 'ladder': ladder,
            'notes': {str(k): [v[0], v[1] / v[0]] for k, v in sorted(per_note.items())}}


def main(argv=None):
    parser = argparse.ArgumentParser(description='量一个 Seed-VC 声音实际能唱的音域')
    parser.add_argument('source', type=Path, nargs='?', help='一段唱的人声（单声部）')
    parser.add_argument('--voice', required=True)
    parser.add_argument('--work', type=Path, default=Path(tempfile.gettempdir()) / 'voice-range')
    parser.add_argument('--decide', action='store_true', help='不重转，只用已存的测量重新定 low/high')
    args = parser.parse_args(argv)
    target = HERE / 'voices' / args.voice / 'range.json'
    if args.decide:
        table = json.loads(target.read_text(encoding='utf-8'))
    else:
        if not args.source:
            parser.error('要量音域，得给一段唱的人声')
        table = measure(args.source.resolve(), args.voice, args.work.resolve())
    low, high, rule = decide(table)
    table.update(low=None if low is None else int(round(low)), high=high, rule=rule)
    target.write_text(json.dumps(table, ensure_ascii=False, indent=1), encoding='utf-8')
    shown = '—' if table['low'] is None else name(table['low'])
    print(f'  {args.voice}：{shown}–{name(high)}（参考说话中位 {name(round(table["referenceMedian"]))}）→ {target}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
