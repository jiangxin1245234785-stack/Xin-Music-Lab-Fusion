"""Convert a separated vocal stem into one or more of the library's voices.

    python source/voiceswap/swap.py vocals.wav --voice xiaoxiao
    python source/voiceswap/swap.py vocals.wav --voice xiaoxiao yunjian ana --out 试听
    python source/voiceswap/swap.py vocals.wav --all

Seed-VC lives in `runtime/addons/seedvc-v1` (override with `XLD_SEEDVC_ROOT`), outside the
repo, like drumsep-v1 and muscriptor-v1: third-party code and weights are never committed.

The point of doing several voices in one call is that the model is loaded once. Upstream's
`main()` loads it on its first line, so `load_models` is memoised rather than copied —
`inference.py` is an archived upstream that will not move under us, and reimplementing its
conversion loop here would be the thing most likely to drift from what was verified.
"""
import argparse
import hashlib
import json
import os
import shutil
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
ADDON = Path(os.environ.get('XLD_SEEDVC_ROOT') or REPO / 'runtime' / 'addons' / 'seedvc-v1')

#: Pinned so a swapped-out addon is caught here rather than as a strange-sounding render.
#: Regenerate with `git -C <addon>/upstream rev-parse HEAD` and `sha256sum` on the bin.
UPSTREAM_COMMIT = '51383efd921027683c89e5348211d93ff12ac2a8'
CAMPPLUS_SHA256 = '3388cf5fd3493c9ac9c69851d8e7a8badcfb4f3dc631020c4961371646d5ada8'

sys.path.insert(0, str(HERE))
import voices as catalog

#: How much quieter than stored the reference is handed to Seed-VC (see `convert`).
REFERENCE_HEADROOM_DB = -6.0

#: Per-conversion state for the f0 guard: which call is the source's, what it changed, and
#: the guarded contour with its frame rate, which `main` saves for rvc.py to follow.
REPAIR = {'enabled': True, 'seconds': None, 'lifted': [], 'contour': None}


def lift_octave_dips(f0, fps, longest=0.6, tolerance=1.0, settle=0.15, spikes=True):
    """Lift short dips that sit exactly an octave under the note before them.

    Where a harmony doubles the lead an octave down, RMVPE can lock onto the lower voice for
    the length of a note, and every converted voice then sings that note an octave low:
    七里香's 「就像雨水」 at 251.0 s, where all 18 voices dropped D#4 → D#3 on 「水」.
    A real melody rarely falls a full octave for a fraction of a second and then stops or
    comes straight back, so only that shape is lifted. A longer stretch, any other interval,
    or a dip that carries on somewhere else is left exactly as RMVPE heard it.

    Notes are compared, not frames: RMVPE often slides into the dip (「水」 went D#4, a gap,
    then E3 → D#3 → D3), so the first frame alone is not an octave under. The contour is cut
    into notes at unvoiced frames and at frame-to-frame jumps over 4 semitones, and a note
    is lifted when its median sits an octave under the end of the note before it.

    Before the notes are cut, a single frame that leaps over 4 semitones away from two
    neighbours that agree with each other is put back between them (`spikes`). RMVPE throws
    such a frame now and then, and one inside a dip cuts it in two, after which neither half
    looks like a dip that comes back: 七里香's phrase end at 248.2 s went D#4, then D#3 …
    a lone C#5 … C#3, and stayed an octave low in every voice. The frame is changed in the
    returned f0 too, so that it is lifted with the dip instead of left an octave above it.

    Returns the repaired f0 and the lifted spans as (start s, end s, note before, note in dip).
    """
    import numpy as np

    f0 = np.asarray(f0).copy()
    note = np.full(f0.shape, np.nan)
    voiced = f0 > 1
    note[voiced] = 69 + 12 * np.log2(f0[voiced] / 440.0)
    n = len(f0)
    if spikes:
        for k in range(1, n - 1):
            left, here, right = note[k - 1], note[k], note[k + 1]
            if (np.isfinite(left) and np.isfinite(here) and np.isfinite(right) and abs(left - right) <= 2
                    and abs(here - left) > 4 and abs(here - right) > 4):
                note[k] = (left + right) / 2
                f0[k] = 440.0 * 2 ** ((note[k] - 69) / 12)
    segments, start = [], None
    for k in range(n):
        if not np.isfinite(note[k]):
            if start is not None:
                segments.append((start, k))
                start = None
        elif start is None:
            start = k
        elif abs(note[k] - note[k - 1]) > 4:
            segments.append((start, k))
            start = k
    if start is not None:
        segments.append((start, n))

    look, gap = max(1, int(settle * fps)), max(1, int(0.1 * fps))
    lifted = []
    for index in range(1, len(segments)):
        a, b = segments[index]
        before_start, before_end = segments[index - 1]
        if b - a > longest * fps or a - before_end > gap:
            continue
        # Read the note before from `note`, which is updated as notes are lifted, so a
        # glitch already put back does not become the level the next note is judged by.
        level = float(np.median(note[max(before_start, before_end - look):before_end]))
        dip = float(np.median(note[a:b]))
        if abs(level - dip - 12) > tolerance:
            continue
        if b < n and np.isfinite(note[b]):           # cut by a jump, not by silence:
            following = note[b:b + gap]               # it has to come straight back up
            if not np.any(np.abs(following[np.isfinite(following)] - level) <= 2):
                continue
        f0[a:b] = f0[a:b] * 2
        note[a:b] = note[a:b] + 12
        lifted.append((a / fps, b / fps, level, dip))
    return f0, lifted


def follow_octaves(f0, fps, decided, decided_fps, offset=0.0, tolerance=2.0):
    """Put this contour in the octaves another contour of the same source settled on.

    Each backend tracks the source with its own RMVPE pass on differently prepared audio,
    and on borderline notes the two land in different octaves. Over the whole of 七里香
    the two guards disagreed on 3 of 17 spans, and where Seed-VC's contour needed no help
    at all Applio's still sat an octave low (89.1 s, which is 「水」 again, then 169.8,
    170.1 and 182.1 s). Sharing the lifted spans was not enough for that, so the whole
    decided contour is shared: wherever this contour is one octave away from it, the frame
    moves to the decided octave. Everything else — every frame the two agree on to within
    `tolerance` semitones of an octave, and all fine detail — stays as this contour has it.

    `decided` is the guarded contour in source time at `decided_fps`; `offset` is how far
    this contour's clock runs ahead of the source's. Returns the contour and the moved
    stretches as (start s, end s, decided note, note before), in this contour's time.
    """
    import numpy as np

    f0 = np.asarray(f0, dtype=np.float64).copy()
    decided = np.asarray(decided, dtype=np.float64)
    at = np.round((np.arange(len(f0)) / fps - offset) * decided_fps).astype(int)
    inside = (at >= 0) & (at < len(decided))
    target = np.zeros(len(f0))
    target[inside] = decided[at[inside]]
    both = (f0 > 1) & (target > 1)
    gap = np.zeros(len(f0))
    gap[both] = 12 * np.log2(target[both] / f0[both])
    octaves = np.round(gap / 12)
    move = both & (np.abs(octaves) == 1) & (np.abs(gap - 12 * octaves) <= tolerance)
    before = f0.copy()
    f0[move] *= 2.0 ** octaves[move]

    note = lambda hz: float(np.median(69 + 12 * np.log2(hz / 440.0)))
    edges = np.flatnonzero(np.diff(np.concatenate([[0], move.astype(int), [0]])))
    moved = [(a / fps, b / fps, note(target[a:b]), note(before[a:b]))
             for a, b in zip(edges[::2], edges[1::2])]
    return f0, moved


def selftest():
    """The shapes the guard must and must not touch, on synthetic 100 fps contours."""
    import numpy as np

    hz = lambda midi: 440.0 * 2 ** ((midi - 69) / 12)
    def contour(*parts):
        return np.concatenate([np.full(int(seconds * 100), hz(midi) if midi else 0.0) for midi, seconds in parts])

    held, low = 63, 51                                  # D#4, and D#3 an octave under it
    cases = [
        ('「水」：短八度下坠后换气', contour((held, 1.0), (low, 0.3), (None, 0.2)), 1),
        ('「水」实测形状：断一下再从 E3 滑进 D3', contour((held, 1.0), (None, 0.03), (low + 1, 0.05),
                                                     (low, 0.2), (low - 1, 0.05), (None, 0.2)), 1),
        ('短八度下坠后回原位', contour((held, 1.0), (low, 0.3), (held, 0.5)), 1),
        ('长的低八度音（真旋律）', contour((held, 1.0), (low, 1.0), (None, 0.2)), 0),
        ('小三度下行（真旋律）', contour((held, 1.0), (held - 3, 0.3), (None, 0.2)), 0),
        ('八度跳下后继续唱别的音', contour((held, 1.0), (low, 0.3), (low + 2, 0.5)), 0),
        ('乐句尾下坠被一帧毛刺切开', contour((held, 1.0), (low, 0.07), (low + 22, 0.01), (low - 1, 0.03),
                                             (None, 0.2)), 1),
        ('长音里一帧毛刺', contour((held, 0.5), (held + 12, 0.01), (held, 0.5), (None, 0.2)), 0),
    ]
    for label, f0, expected in cases:
        repaired, lifted = lift_octave_dips(f0, 100)
        assert len(lifted) == expected, f'{label}: 预期抬 {expected} 段，实际 {len(lifted)}'
        if expected:
            dip = repaired[100:130]
            dip = 69 + 12 * np.log2(dip[dip > 1] / 440.0)
            assert dip.size and np.all(np.abs(dip - held) <= 1.5), f'{label}: 抬完不在原八度'
    repaired, _ = lift_octave_dips(cases[-1][1], 100)
    assert abs(69 + 12 * np.log2(repaired[50] / 440.0) - held) <= 0.5, '长音里的毛刺没放回去'

    # Following: one contour decides, another that saw the same notes differently follows.
    # (label, decided contour, this contour, offset, frames checked, note expected, moves?)
    decided, _ = lift_octave_dips(contour((held, 1.0), (low, 0.3), (None, 0.2)), 100)
    note = lambda f: 69 + 12 * np.log2(f[f > 1] / 440.0)
    follows = [
        ('滑进去的低八度', decided,
         contour((held, 1.0), (None, 0.03), (low + 1, 0.1), (low - 1, 0.17), (None, 0.2)),
         0, slice(103, 130), held, True),
        ('本来就在原八度', decided, contour((held, 1.3), (None, 0.2)), 0, slice(0, 130), held, False),
        ('定下来的没掉、自己掉了', contour((held, 1.3), (None, 0.2)),
         contour((held, 0.5), (low, 0.3), (held, 0.5)), 0, slice(50, 80), held, True),
        ('时间偏移', decided, np.concatenate([np.zeros(100), contour((held, 1.0), (low, 0.3), (None, 0.2))]),
         1.0, slice(200, 230), held, True),
        ('真低音跟着低下来', contour((held, 1.0), (low, 1.0), (None, 0.2)),
         contour((held, 2.0), (None, 0.2)), 0, slice(100, 200), low, True),
    ]
    for label, reference, mine, offset, span, expect, moves in follows:
        followed, moved = follow_octaves(mine, 100, reference, 100, offset=offset)
        assert bool(moved) == moves, f'跟随·{label}：该动没动或不该动动了'
        assert np.all(np.abs(note(followed[span]) - expect) <= 2), f'跟随·{label}：没到定下来的八度'
    print(f'  八度守卫自测通过（{len(cases)} 种形状 + {len(follows)} 种跟随）')


def file_sha256(path):
    with path.open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def verify():
    """Check the addon is the one these settings were validated against."""
    upstream = ADDON / 'upstream'
    if not (upstream / 'inference.py').is_file():
        raise SystemExit(f'找不到 Seed-VC：{upstream}\n'
                         f'设 XLD_SEEDVC_ROOT 指向 addon 目录，或按 SPEC.md 装一次。')
    campplus = upstream / 'campplus_cn_common.bin'
    if not campplus.is_file():
        raise SystemExit(f'缺说话人编码器权重：{campplus}')
    if file_sha256(campplus) != CAMPPLUS_SHA256:
        raise SystemExit('说话人编码器权重校验失败：campplus_cn_common.bin 和验证时的不是同一个')
    return upstream


def load_engine(upstream):
    """Import upstream and memoise its model loading. Returns its `main`.

    `inference.py` sets a *relative* HF_HUB_CACHE at import time, so the working directory
    has to be the upstream root before the import and stay there for every call — the
    weights live under `upstream/checkpoints/`, found only from there.
    """
    sys.path.insert(0, str(ADDON / 'deps'))
    sys.path.insert(0, str(upstream))
    os.chdir(upstream)

    import numpy as np
    import soundfile as sf
    import torchaudio

    def save(filepath, src, sample_rate, **_):
        """torchaudio 2.11 delegates `save` to TorchCodec and raises without it.

        Only this one call fails; the model itself runs fine on 2.11. Replacing it here
        keeps the archived upstream untouched and avoids pulling in TorchCodec.
        """
        data = src.detach().cpu().numpy()
        if data.ndim == 2:                      # torchaudio is (channels, samples)
            data = data.T
        sf.write(str(filepath), np.asarray(data, dtype=np.float32), int(sample_rate))

    torchaudio.save = save

    import inference
    loader, cache = inference.load_models, {}

    def guarded(extract):
        """RMVPE, with the octave guard applied to the source's contour only.

        `main()` calls it twice, reference first and source second; the source is the one
        whose length matches what `convert()` is converting. The reference contour only
        feeds a median (and only under auto_f0_adjust), so it passes through untouched.
        """
        def f0_fn(wave, *args, **kwargs):
            f0 = extract(wave, *args, **kwargs)
            seconds = wave.shape[-1] / 16000
            if REPAIR['enabled'] and REPAIR['seconds'] and abs(seconds - REPAIR['seconds']) < 0.1 and len(f0):
                f0, REPAIR['lifted'] = lift_octave_dips(f0, len(f0) / seconds)
                REPAIR['contour'] = (f0.copy(), len(f0) / seconds)
            return f0
        return f0_fn

    def memoised(args):
        key = (args.f0_condition, args.checkpoint, args.config, args.fp16)
        if key not in cache:
            loaded = list(loader(args))
            if loaded[2] is not None:            # (model, semantic_fn, f0_fn, vocoder_fn, ...)
                loaded[2] = guarded(loaded[2])
            cache[key] = tuple(loaded)
        return cache[key]

    inference.load_models = memoised
    return inference


def convert(engine, source, reference, destination, steps, cfg_rate):
    """Run one conversion and put the result at `destination`.

    Upstream names its output from the source and reference basenames, and every voice's
    reference is called `reference.wav` — so left alone they would all collide. Converting
    into a scratch directory and moving the one file out is robust to that naming instead
    of having to predict it.

    The reference goes in `REFERENCE_HEADROOM_DB` quieter than it is stored. The output's
    level follows the reference's, and at the stored level BigVGAN runs into its [-1, 1]
    clamp on loud notes: 11 of 18 voices clamped on the 30 s bench clip, christopher in 65
    places. At -6 dB the three worst clamped nowhere, and campplus put each result at
    0.971–0.980 against the 0 dB one — the same as two 0 dB runs score against each other
    (0.980). Every consumer rescales the level afterwards anyway.
    """
    import soundfile as sf

    info = sf.info(str(source))
    REPAIR.update(seconds=info.frames / info.samplerate, lifted=[], contour=None)
    with tempfile.TemporaryDirectory() as scratch, tempfile.TemporaryDirectory() as staging:
        quieter = Path(staging) / Path(reference).name
        audio, rate = sf.read(str(reference), dtype='float32')
        sf.write(str(quieter), audio * 10 ** (REFERENCE_HEADROOM_DB / 20), rate)
        args = argparse.Namespace(
            source=str(source), target=str(quieter), diffusion_steps=steps,
            length_adjust=1.0, inference_cfg_rate=cfg_rate, f0_condition=True,
            auto_f0_adjust=False, semi_tone_shift=0, checkpoint=None, config=None, fp16=True,
            output=scratch)
        engine.main(args)
        produced = list(Path(scratch).glob('*.wav'))
        if len(produced) != 1:
            raise SystemExit(f'预期 1 个输出，实际 {len(produced)} 个：{produced}')
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(produced[0]), str(destination))
    return list(REPAIR['lifted'])


def main(argv=None):
    parser = argparse.ArgumentParser(description='把人声分轨换成声音库里的音色')
    parser.add_argument('source', type=Path, nargs='?', help='人声分轨 wav（XLD 分离出的 vocals.wav）')
    parser.add_argument('--voice', nargs='+', default=[], help='声音名，可多个')
    parser.add_argument('--all', action='store_true', help='全部声音各转一遍')
    parser.add_argument('--out', type=Path, default=Path('voiceswap-out'))
    parser.add_argument('--library', type=Path, default=HERE / 'voices')
    parser.add_argument('--steps', type=int, default=30, help='扩散步数，越大越慢')
    parser.add_argument('--cfg-rate', type=float, default=0.7, help='越高越贴参考音色')
    parser.add_argument('--list', action='store_true', help='列出声音库')
    parser.add_argument('--keep-octaves', action='store_true',
                        help='不修音高曲线里的短八度下坠（默认会修，见 lift_octave_dips）')
    parser.add_argument('--selftest', action='store_true', help='只跑八度守卫的自测')
    args = parser.parse_args(argv)

    if args.selftest:
        selftest()
        return 0
    REPAIR['enabled'] = not args.keep_octaves
    if args.list:
        for name, recipe in catalog.VOICES.items():
            built = '' if (args.library / name / 'reference.wav').is_file() else '  （未生成）'
            print(f'  {name:<12} {recipe["label"]}{built}')
        return 0

    names = list(catalog.VOICES) if args.all else args.voice
    if not names:
        raise SystemExit('要么 --voice <名字>，要么 --all；--list 看有哪些')
    unknown = [n for n in names if n not in catalog.VOICES]
    if unknown:
        raise SystemExit(f'未知声音：{", ".join(unknown)}')
    missing = [n for n in names if not (args.library / n / 'reference.wav').is_file()]
    if missing:
        raise SystemExit(f'这些声音还没生成：{", ".join(missing)}\n'
                         f'先跑 python source/voiceswap/make_voices.py {" ".join(missing)}')
    if not args.source or not args.source.is_file():
        raise SystemExit(f'找不到人声分轨：{args.source}')

    source = args.source.resolve()
    library, out = args.library.resolve(), args.out.resolve()
    engine = load_engine(verify())          # chdir happens here; resolve paths first
    stem, started = source.stem, time.monotonic()
    for index, name in enumerate(names, 1):
        began = time.monotonic()
        destination = out / f'{stem}__{name}.wav'
        lifted = convert(engine, source, library / name / 'reference.wav',
                         destination, args.steps, args.cfg_rate)
        if index == 1 and REPAIR['enabled']:
            # The source contour is the same for every voice, so report and record it once;
            # make_bench.py reads the record to point the listener at these spots.
            spans = '、'.join(f'{a:.2f}–{b:.2f}s' for a, b, *_ in lifted) or '无'
            print(f'  音高曲线里抬回原八度的短下坠：{spans}', flush=True)
            import numpy as np
            contour, fps = REPAIR['contour']
            np.save(out / f'{stem}.f0.npy', np.asarray(contour, dtype=np.float32))
            record = {'source': str(source), 'seconds': round(REPAIR['seconds'], 3),
                      'contour': f'{stem}.f0.npy', 'fps': fps,
                      'lifted': [[round(a, 2), round(b, 2), round(level, 2), round(dip, 2)]
                                 for a, b, level, dip in lifted]}
            (out / f'{stem}.f0-repairs.json').write_text(
                json.dumps(record, ensure_ascii=False, indent=2), encoding='utf-8')
        print(f'  [{index}/{len(names)}] {name:<12} {time.monotonic() - began:5.0f}s  '
              f'{destination.name}  {catalog.VOICES[name]["label"]}', flush=True)
    print(f'\n共 {len(names)} 个 → {out}  用时 {time.monotonic() - started:.0f}s')
    return 0


if __name__ == '__main__':
    sys.exit(main())
