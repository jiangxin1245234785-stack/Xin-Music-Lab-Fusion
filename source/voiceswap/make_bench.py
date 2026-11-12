"""Prepare swap runs for the listening bench page: matched mp3s plus its manifest.

    python source/voiceswap/make_bench.py voiceswap-out --source vocals.wav --caption "七里香 · 239–269 秒"
    python source/voiceswap/make_bench.py swap-out rvc-out --before swap-old rvc-old --source vocals.wav

Writes `<out>/index.html` (bench.html with the manifest inlined) and `<out>/audio/`:
`original.mp3`, `v-<name>.mp3` per converted voice and `r-<name>.mp3` per reference.
That folder is what gets published as the page.

Several run directories go on one page, which is how the two backends sit side by side:
`swap.py` (the synthesised library, each voice with its TTS reference) and `rvc.py` (the
community models, which have no reference clip; their octave comes from the run record).

The page switches voices by gain on sources that all loop one shared span, so every clip
is cut to a common length and padded past it. The loop end is set explicitly; padding
keeps a decoder that trims a few milliseconds from shortening one buffer below it, which
would put that voice out of step with the rest.

Which voices sit close together is measured here with campplus (see `speaker.py`),
because that is the question the page exists to settle by ear.
"""
import argparse
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import numpy as np
import soundfile as sf

import make_audition
import rvc_models
import voices as catalog

RATE = make_audition.RATE
PAD_SECONDS = 0.3
RVC_GROUP = 'RVC 社区模型'

#: Checked in order, so the dialect prefixes win over plain zh-CN.
GROUPS = (('zh-CN-liaoning', '方言'), ('zh-CN-shaanxi', '方言'), ('zh-CN', '普通话'),
          ('zh-HK', '粤语'), ('ja-', '日语'), ('ko-', '韩语'), ('en-', '英语口音'))


def group_of(voice_id):
    return next(label for prefix, label in GROUPS if voice_id.startswith(prefix))


def librosa_note(midi):
    import librosa
    return librosa.midi_to_note(int(round(midi)), unicode=False)


def write_mp3(path, audio, level):
    sf.write(str(path), np.asarray(audio, dtype=np.float32), RATE, format='MP3',
             bitrate_mode='CONSTANT', compression_level=level)


def find_runs(directories):
    """Each voice's converted file, taken from the first directory that has one."""
    found = {}
    for name in [*catalog.VOICES, *rvc_models.MODELS]:
        found[name] = next((path for directory in directories
                            for path in directory.glob(f'*__{name}.wav')), None)
    return {name: path for name, path in found.items() if path}


def main(argv=None):
    parser = argparse.ArgumentParser(description='把一次 swap 的结果做成试听台的页面素材')
    parser.add_argument('directory', type=Path, nargs='+', help='swap.py / rvc.py 的输出目录，可多个')
    parser.add_argument('--source', type=Path, required=True, help='原始人声分轨（转换用的那段）')
    parser.add_argument('--out', type=Path, help='页面目录，默认第一个输出目录下的 bench')
    parser.add_argument('--library', type=Path, default=HERE / 'voices')
    parser.add_argument('--caption', default='', help='页面副标题里的出处，如「七里香 · 239–269 秒」')
    parser.add_argument('--baseline', type=Path, help='恒等转换的输出，用来标出"没换"是多少分')
    parser.add_argument('--before', type=Path, nargs='+', default=[],
                        help='修正前那几次的输出目录，页面上可以切换对比')
    parser.add_argument('--mark', action='append', default=[],
                        help='给修过的地方起名，如 12.1=就像雨水的「水」（可多次）')
    parser.add_argument('--close', type=float, default=0.75, help='两两相似度超过它就列为"可能分不开"')
    parser.add_argument('--level', type=float, default=0.65, help='mp3 压缩级别，0 最好 1 最小')
    args = parser.parse_args(argv)

    out = (args.out or args.directory[0] / 'bench').resolve()
    audio_dir = out / 'audio'
    audio_dir.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()

    converted = find_runs(args.directory)
    if not converted:
        raise SystemExit(f'{"、".join(map(str, args.directory))} 里没有 *__<声音名>.wav，先跑 swap.py 或 rvc.py')
    # What rvc.py actually used, which can differ from the catalog when --octave was given.
    rvc_runs = {}
    for directory in reversed(args.directory):
        for record_path in directory.glob('*.rvc-run.json'):
            rvc_runs.update(json.loads(record_path.read_text(encoding='utf-8'))['models'])

    clips = {'original.mp3': make_audition.load(args.source)}
    clips.update({f'v-{name}.mp3': make_audition.load(path) for name, path in converted.items()})
    before = {name: path for name, path in find_runs(args.before).items() if name in converted}
    clips.update({f'b-{name}.mp3': make_audition.load(path) for name, path in before.items()})
    # Every version loops the same span, so the shortest clip sets it for all of them.
    seconds = np.floor(min(len(c) for c in clips.values()) / RATE * 100) / 100
    span, pad = int(round(seconds * RATE)), np.zeros(int(PAD_SECONDS * RATE), dtype=np.float32)
    for filename, clip in clips.items():
        write_mp3(audio_dir / filename, np.concatenate([clip[:span], pad]), args.level)

    # What the octave guard changed. Glitches of a few frames are counted, not listed:
    # nobody can hear 20 ms, and pointing at them would bury the spot that matters.
    # Each backend records its own contour, and they lift the same places give or take a
    # frame or two (「水」 is 12.10–12.36 s in both), so a span that overlaps one already
    # taken is the same spot heard again and is skipped.
    spans = []
    for directory in args.directory:
        for record_path in sorted(directory.glob('*.f0-repairs.json')):
            for start, end, level, dip in json.loads(record_path.read_text(encoding='utf-8'))['lifted']:
                if not any(start < b and a < end for a, b, *_ in spans):
                    spans.append((start, end, level, dip))
    repairs, glitches = [], 0
    for start, end, level, dip in sorted(spans):
        if end - start >= 0.1:
            repairs.append({'start': start, 'end': end,
                            'from': librosa_note(dip), 'to': librosa_note(level)})
        else:
            glitches += 1
    for mark in args.mark:
        when, _, label = mark.partition('=')
        hit = next((r for r in repairs if r['start'] - 0.2 <= float(when) <= r['end'] + 0.2), None)
        if not hit:
            raise SystemExit(f'--mark {mark}：{when} 秒附近没有修过的地方')
        hit['label'] = label

    for name in converted:
        if name in catalog.VOICES:              # an RVC model has no reference clip
            reference = args.library / name / 'reference.wav'
            write_mp3(audio_dir / f'r-{name}.mp3', make_audition.load(reference, target_db=-18.0), args.level)

    import speaker
    print('  用 campplus 量音色…', flush=True)
    vectors = {name: speaker.embed(path) for name, path in converted.items()}
    original = speaker.embed(args.source)
    baseline = float(speaker.embed(args.baseline) @ original) if args.baseline else None
    names = list(converted)
    # Threshold on the raw score, round only for display: a pair at 0.7503 is over 0.75.
    raw = sorted(((float(vectors[a] @ vectors[b]), a, b)
                  for i, a in enumerate(names) for b in names[i + 1:]), reverse=True)
    pairs = [{'a': a, 'b': b, 'similarity': round(score, 3), 'close': score > args.close}
             for score, a, b in raw]

    entries = []
    for name in names:
        common = {'id': name, 'file': f'v-{name}.mp3',
                  'before': f'b-{name}.mp3' if name in before else None,
                  'likeOriginal': round(float(vectors[name] @ original), 3)}
        if name in rvc_models.MODELS:
            recipe = rvc_models.MODELS[name]
            title, _, desc = recipe['label'].partition(' · ')
            octave = rvc_runs.get(name, {}).get('octave', recipe['octave'])
            entries.append({**common, 'kind': 'rvc', 'name': title, 'desc': desc, 'group': RVC_GROUP,
                            'reference': None, 'refHz': None, 'octave': octave,
                            'who': recipe['who'], 'license': recipe['license']})
            continue
        recipe = catalog.VOICES[name]
        title, _, desc = recipe['label'].partition(' · ')
        measured = {}
        manifest_path = args.library / name / 'voice.json'
        if manifest_path.is_file():
            measured = json.loads(manifest_path.read_text(encoding='utf-8')).get('measured', {})
        entries.append({**common, 'kind': 'tts', 'name': title, 'desc': desc,
                        'group': group_of(recipe['voice']), 'reference': f'r-{name}.mp3',
                        'refHz': measured.get('medianHz')})

    manifest = {'caption': args.caption, 'seconds': float(seconds),
                'original': {'file': 'original.mp3'}, 'baseline': baseline and round(baseline, 3),
                'voices': entries,
                'close': [{k: p[k] for k in ('a', 'b', 'similarity')} for p in pairs if p['close']],
                'repairs': repairs, 'repairGlitches': glitches, 'hasBefore': bool(before),
                'closeThreshold': args.close,
                'meanPairSimilarity': round(float(np.mean([score for score, _, _ in raw])), 3),
                'generated': time.strftime('%Y-%m-%d %H:%M')}

    template = (HERE / 'bench.html').read_text(encoding='utf-8')
    placeholder = '/*@MANIFEST@*/null'
    if template.count(placeholder) != 1:
        raise SystemExit('bench.html 里的清单占位符不是恰好一个')
    # Inside a <script>, a literal "</" in any label would end the element early.
    page = template.replace(placeholder, json.dumps(manifest, ensure_ascii=False).replace('</', '<\\/'))
    (out / 'index.html').write_text(page, encoding='utf-8')

    sizes = sum(p.stat().st_size for p in audio_dir.glob('*.mp3'))
    references = sum(1 for name in converted if name in catalog.VOICES)
    print(f'  {len(clips)} 段 × {seconds:.2f}s + {references} 段参考 → {sizes / 1e6:.1f} MB')
    print(f'  可能分不开（>{args.close}）：' + ('、'.join(f"{p['a']}–{p['b']} {p['similarity']}"
                                                    for p in manifest['close']) or '无'))
    print(f'  {out}  用时 {time.monotonic() - started:.0f}s')
    return 0


if __name__ == '__main__':
    sys.exit(main())
