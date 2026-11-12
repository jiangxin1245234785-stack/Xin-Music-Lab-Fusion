"""Build the synthesised kit library — no samples to source anywhere.

    python source/memesynth/tools/make_kits.py all
    python source/memesynth/tools/make_kits.py chiptune musicbox
    python source/memesynth/tools/make_kits.py --list

Each kit lands in `kits/<name>/` as a `kit.json` plus its `samples/`. The wavs are
gitignored build output; the recipe in `kitdefs/` is the thing that is kept, so a kit
is always reproducible and never has to be found again.

Every kit is checked for full route coverage before it is written. A kit that misses a
route renders that part as silence, which no test downstream would report as a failure.
"""
import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import kitdefs
import synth


def build(name, out_root, quiet=False):
    """Synthesise one kit into `out_root/<name>/`. Returns its manifest."""
    recipe = kitdefs.load(name)
    missing = [route for route in kitdefs.REQUIRED if route not in recipe.VOICES]
    if missing:
        raise SystemExit(f'{name}: 路由缺失，渲染时会变成静音 — {", ".join(missing)}')
    unknown = [route for route, voice in recipe.VOICES.items() if voice['sample'] not in recipe.SAMPLES]
    if unknown:
        raise SystemExit(f'{name}: 路由引用了不存在的素材 — {", ".join(unknown)}')

    directory = out_root / name
    (directory / 'samples').mkdir(parents=True, exist_ok=True)
    manifest, started, total = {}, time.monotonic(), 0.0
    for sample, (make, root_hz, label) in recipe.SAMPLES.items():
        audio = make()
        synth.write(directory / 'samples' / f'{sample}.wav', audio)
        manifest[sample] = {'file': f'samples/{sample}.wav', 'rootHz': root_hz, '_label': label}
        total += len(audio) / synth.RATE
        if not quiet:
            print(f'    {sample:<14} {len(audio) / synth.RATE:5.2f}s  {label}')
    kit = {'name': recipe.NAME,
           '_note': f'由 tools/make_kits.py {name} 生成，可随时重跑覆盖。rootHz 是生成时的已知值，不必再测。',
           'samples': manifest, 'voices': recipe.VOICES}
    (directory / 'kit.json').write_text(json.dumps(kit, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'  {name:<10} {recipe.NAME} — {len(manifest)} 素材 / {len(recipe.VOICES)} 路由 / '
          f'{total:.1f}s 音频 / {time.monotonic() - started:.0f}s')
    return kit


def main(argv=None):
    parser = argparse.ArgumentParser(description='合成 memesynth 的音色库')
    parser.add_argument('kits', nargs='*', help="kit 名，或 all")
    parser.add_argument('--out', type=Path, default=Path(__file__).resolve().parents[1] / 'kits')
    parser.add_argument('--list', action='store_true', help='列出可用的 kit')
    parser.add_argument('--quiet', action='store_true', help='只打印每个 kit 的汇总行')
    args = parser.parse_args(argv)

    if args.list or not args.kits:
        for name in kitdefs.KITS:
            print(f'  {name:<10} {kitdefs.load(name).NAME}')
        return 0
    names = kitdefs.KITS if args.kits == ['all'] else args.kits
    for name in names:
        build(name, args.out, quiet=args.quiet)
    print(f'\n写出 {len(names)} 套 kit 到 {args.out}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
