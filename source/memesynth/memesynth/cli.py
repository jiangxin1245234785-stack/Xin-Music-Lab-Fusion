"""Command line front end. The modules below it never import this one."""
import argparse
import dataclasses
import math
import sys
from pathlib import Path

import soundfile

from . import __version__
from .kit import KitError, load_kit
from .render import peak_factor, render
from .score import MIN_DURATION, read_score


def slug(route):
    """`'guitar/distorted electric guitar'` -> `'guitar-distorted-electric-guitar'`."""
    return '-'.join(part for part in route.replace('/', ' ').split() if part)


def build_parser():
    parser = argparse.ArgumentParser(
        prog='memesynth',
        description='读 XLD 导出的 merged.mid，用 meme 素材渲染成 wav。')
    parser.add_argument('midi', type=Path, help='XLD「融合 / 导出」产出的 merged.mid')
    parser.add_argument('kit', type=Path, help='素材映射表 kit.json')
    parser.add_argument('-o', '--out', type=Path, default=Path('out'), help='输出目录（默认 out/）')
    parser.add_argument('--dry-run', action='store_true', help='只校验并打印路由报告，不渲染')
    parser.add_argument('--sample-rate', type=int, default=48000, help='输出采样率（默认 48000）')
    parser.add_argument('--min-duration', type=float, default=MIN_DURATION,
                        help=f'丢弃短于此秒数的音符（默认 {MIN_DURATION}）')
    parser.add_argument('--no-stems', action='store_true', help='只写总混音，不写分轨')
    parser.add_argument('--peak', type=float, default=-1.0, help='总混音削顶上限 dBFS（默认 -1.0）')
    parser.add_argument('--force', action='store_true', help='允许覆盖已存在的输出文件')
    parser.add_argument('--version', action='version', version=f'memesynth {__version__}')
    return parser


def report(lines, stream=sys.stdout):
    for line in lines:
        print(line, file=stream)


def progress_bar(stream=sys.stderr):
    """Return a `progress(fraction, message)` that redraws one line on `stream`."""
    def draw(fraction, message):
        filled = int(fraction * 30)
        stream.write(f'\r  [{"#" * filled}{"." * (30 - filled)}] {fraction * 100:3.0f}%  {message[:40]:<40}')
        stream.flush()
        if fraction >= 1.0:
            stream.write('\n')
    return draw


def plan_outputs(routes, out, name, write_stems):
    """Map every output path to the route it holds, mix first (`None` is the mix).

    Built from the score's routes rather than from a finished render, so the overwrite
    check can run before a long render rather than after it. Stems stay named rather
    than materialised, so only one stereo buffer exists at a time while writing.
    """
    targets = [(out / f'{name}.wav', None)]
    if write_stems:
        targets.extend((out / 'stems' / f'{name}.{slug(route)}.wav', route)
                       for route in sorted(routes))
    return targets


def main(argv=None):
    args = build_parser().parse_args(argv)
    if not args.midi.is_file():
        report([f'找不到 MIDI 文件：{args.midi}'], sys.stderr)
        return 2
    try:
        kit = load_kit(args.kit, sample_rate=args.sample_rate)
    except KitError as error:
        report(['kit 校验失败：'] + [f'  - {problem}' for problem in error.problems], sys.stderr)
        return 2

    score = read_score(args.midi, min_duration=args.min_duration)
    report([f'乐谱  {args.midi.name}'] + score.summary())
    report([f'套件  {kit.name}（{len(kit.samples)} 个素材 / {len(kit.voices)} 条声部）'])

    missing = sorted(route for route in score.routes if kit.resolve(route) is None)
    if missing:
        report(['  ! kit 未覆盖的路由：'] + [f'      {route}' for route in missing])
    if args.dry_run:
        report(['', '--dry-run：未渲染。'])
        return 0 if not missing else 1

    name = args.midi.stem
    playable = sorted(route for route in score.routes if kit.resolve(route) is not None)
    targets = plan_outputs(playable, args.out, name, not args.no_stems)
    existing = [path for path, _ in targets if path.exists()]
    if existing and not args.force:
        report(['输出文件已存在，未覆盖（加 --force 允许覆盖）：']
               + [f'  - {path}' for path in existing], sys.stderr)
        return 2

    result = render(score, kit, progress=progress_bar())
    report(result.summary())

    # One factor across the mix and every stem: a stem can peak higher than the mix
    # when panning or cancellation pulls the sum down, and scaling only the mix would
    # leave that stem clipping on disk.
    factor = peak_factor([result.mix] + [result.stereo_stem(route) for route in result.stems],
                         args.peak)
    if factor < 1.0:
        report([f'  超过 {args.peak:g} dBFS，总混音与全部分轨统一衰减 {20 * math.log10(factor):.1f} dB'])
    result = dataclasses.replace(result, mix=result.mix * factor)

    written = []
    for path, route in targets:
        if route is not None and route not in result.stems:
            continue  # the route resolved but produced no audio
        path.parent.mkdir(parents=True, exist_ok=True)
        audio = result.mix if route is None else result.stereo_stem(route) * factor
        soundfile.write(str(path), audio, result.sample_rate, subtype='PCM_24')
        written.append(path)
    report([''] + [f'写出  {path}' for path in written])
    return 0 if result.rendered else 1
