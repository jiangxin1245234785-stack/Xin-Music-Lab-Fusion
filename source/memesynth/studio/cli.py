"""The command behind `memesynth.cmd`: one dispatcher, so the .cmd can stay ASCII.

cmd.exe parses a batch file in the console's current code page, so Chinese inside the
.cmd itself garbles on some machines. Everything the user reads is printed from here
instead, under PYTHONUTF8. `USAGE` below is that text — keep it out of this docstring,
which is a note to whoever edits the file and not something to print at anyone.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
REPO = ROOT.parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

KITS_DIR = ROOT / 'kits'
DEFAULT_OUT = REPO / 'work' / 'memesynth-out'

USAGE = """用法（在仓库根目录跑 memesynth.cmd）：

  memesynth                      这份帮助，外加已装好的音色
  memesynth 某首.mid             交互式导出：先体检，再问你导哪几套
                                 （把 .mid 拖到 memesynth.cmd 图标上，走的也是这条）
  memesynth check 某首.mid       只看转谱体检，不渲染
  memesynth export 某首.mid      非交互导出，后面可跟全部参数：
                                   -o <目录>      输出到哪（默认下面那个）
                                   -k <名字...>   只导这几套（默认全部）
                                   --stems        同时写出每条路由的分轨
  memesynth studio [某首.mid]    开图形界面（和双击 音色工作台.cmd 一样）
  memesynth kits                 列出音色
  memesynth build [名字...]      重新生成音色（改了 tools/kitdefs/ 之后用）
  memesynth vocals <人声.wav>    把人声分轨转成 MIDI（调 XLD 的 pYIN 后端）
                                 也可以直接给曲目文件夹，自己找 stems/*/vocals.wav
                                   --merge <merged.mid>  再合成一份带主旋律的 MIDI
                                   -o <输出.mid>         指定输出"""


def kit_names():
    return [p.parent.name for p in sorted(KITS_DIR.glob('*/kit.json'))]


def show_kits():
    names = kit_names()
    if not names:
        print('一套音色都没有。先跑：memesynth build')
        return
    print(f'已装好 {len(names)} 套音色：')
    for name in names:
        kit = json.loads((KITS_DIR / name / 'kit.json').read_text(encoding='utf-8'))
        print(f'  {name:<11} {kit.get("name", "")}')


def show_help():
    print(USAGE)
    print()
    show_kits()
    print(f'\n输出目录默认：{DEFAULT_OUT}')


def ask(prompt, default=''):
    try:
        answer = input(f'{prompt}').strip()
    except (EOFError, KeyboardInterrupt):
        print()
        raise SystemExit(0)
    return answer or default


def interactive(midi):
    """What dropping a .mid on the launcher does: look at it, then ask three questions."""
    from studio.batch import export, inspect

    print()
    inspect(midi)
    names = kit_names()
    if not names:
        print('\n一套音色都没有。先跑：memesynth build')
        return 2
    print('\n可选音色：' + '、'.join(names))
    chosen = ask('导哪几套？（回车=全部，或用空格分开写名字）：').split()
    bad = [n for n in chosen if n not in names]
    if bad:
        print('没有这些音色：' + '、'.join(bad))
        return 2
    chosen = chosen or names
    stems = ask('要同时写出每条路由的分轨吗？（y/回车=不要）：').lower().startswith('y')
    out = Path(ask(f'输出到哪？（回车={DEFAULT_OUT}）：', str(DEFAULT_OUT))).expanduser()

    print(f'\n渲染 {len(chosen)} 套 -> {out}')
    score, results = export(midi, [KITS_DIR / n / 'kit.json' for n in chosen], out,
                            stems=stems, progress=lambda f, m: print(f'  [{f * 100:3.0f}%] {m}'))
    print()
    written = 0
    for item in results:
        if item.error:
            print(f'  ! {item.kit}：{item.error}')
            continue
        written += len(item.files)
        extra = f'，{item.truncated} 个音符被素材长度截断' if item.truncated else ''
        print(f'  {item.kit}: {len(item.files)} 个文件{extra}')
    print(f'\n共 {written} 个 wav 写到 {out}')
    if written and ask('打开这个目录吗？（回车=打开，n=不用）：').lower() not in ('n', 'no'):
        import os
        os.startfile(str(out))  # noqa: S606
    return 0


def run_tool(script, args):
    """Run one of the repo's own scripts with this interpreter, from the right folder."""
    return subprocess.call([sys.executable, '-u', str(script), *args], cwd=str(ROOT))


# --- the one place this launcher reaches outside memesynth ---------------------------
# memesynth is a separate component on purpose and its package imports nothing from XLD.
# This command spawns XLD's own runner as a subprocess rather than importing it, so the
# coupling is a path in a CLI dispatcher and not a dependency in the renderer. The point
# is that the MIDI you listen to here is the one XLD's production path actually writes,
# velocity pass and all.
XLD_RUNNER = REPO / 'source' / 'xld-runtime-baseline' / 'analysis-midi' / 'runner.py'


def find_vocals(target: Path):
    """Accept a vocals.wav, or an XLD track folder and go looking for one."""
    if target.is_file():
        return target
    if target.is_dir():
        found = sorted(target.glob('stems/*/vocals.wav'))
        if found:
            return max(found, key=lambda p: p.stat().st_mtime)
        raise SystemExit(f'{target} 里没找到 stems/*/vocals.wav')
    raise SystemExit(f'找不到：{target}')


def transcribe_vocals(args):
    import shutil
    import uuid

    if not XLD_RUNNER.is_file():
        print(f'找不到 XLD 的转谱 runner：{XLD_RUNNER}')
        return 2
    rest = list(args)
    out_path = merge_into = None
    for flag, setter in (('-o', 'out'), ('--merge', 'merge')):
        if flag in rest:
            index = rest.index(flag)
            value = Path(rest[index + 1]).expanduser() if index + 1 < len(rest) else None
            if value is None:
                print(f'{flag} 后面要跟一个路径')
                return 2
            rest = rest[:index] + rest[index + 2:]
            if setter == 'out':
                out_path = value
            else:
                merge_into = value
    if not rest:
        print('要给一个人声 wav 或曲目文件夹')
        return 2
    # Absolute, because the runner is spawned with its own directory as cwd. The default
    # output is the usual out folder, never beside the source: the source normally lives
    # inside an analysis tree, which this command has no business writing into.
    source = find_vocals(Path(rest[0]).expanduser()).resolve()
    stem_name = source.parent.parent.parent.name if source.parent.parent.name == 'stems' else source.stem
    out_path = (out_path or DEFAULT_OUT / f'{stem_name}.vocals.mid').resolve()
    merge_into = merge_into.resolve() if merge_into else None

    import tempfile
    print(f'人声分轨：{source}')
    print('pYIN 跟踪音高中，整首歌大约要几分钟……')
    with tempfile.TemporaryDirectory() as box:
        staging = Path(box)
        code = subprocess.call(
            [sys.executable, '-u', str(XLD_RUNNER), '--engine', 'vocals-pyin', '--stem', 'vocals',
             '--input', str(source), '--output', str(staging / 'vocals.json'),
             '--track-id', 'cli', '--source-run-id', str(uuid.uuid4()), '--run-id', str(uuid.uuid4())],
            cwd=str(XLD_RUNNER.parent))
        if code != 0:
            print('转谱失败。')
            return code
        manifest = json.loads((staging / 'vocals.json').read_text(encoding='utf-8'))
        out_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(staging / manifest['file'], out_path)

    backend = manifest['backend']
    print(f'\n{manifest["noteCount"]} 个音符，唱了 {backend["sungSeconds"]} 秒'
          f'（占全曲 {backend["coverage"] * 100:.0f}%），音域 {backend["pitchRange"]}，'
          f'八度修正 {backend["octaveCorrectedFrames"]} 帧')
    print(f'写出 {out_path}')

    if merge_into:
        import pretty_midi
        combined = pretty_midi.PrettyMIDI(str(merge_into))
        lead = pretty_midi.PrettyMIDI(str(out_path)).instruments[0]
        if any(i.name == 'vocals' for i in combined.instruments):
            print(f'{merge_into.name} 里已经有 vocals 轨了，不重复加。')
        else:
            combined.instruments.append(lead)
            target = out_path.with_name(f'{merge_into.stem}.with-vocals.mid')
            combined.write(str(target))
            total = sum(len(i.notes) for i in combined.instruments)
            print(f'合并出 {target}（{len(combined.instruments)} 轨 / {total} 个音符）')
            print(f'试听：memesynth "{target}"')
    return 0


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    argv = [a for a in argv if a]                     # the .cmd passes "" when nothing was dropped
    if not argv:
        show_help()
        return 0

    first = argv[0]
    # A dropped file arrives as the first argument, not as a subcommand.
    if Path(first).suffix.lower() in ('.mid', '.midi') and Path(first).is_file():
        return interactive(Path(first))

    command, rest = first.lower(), argv[1:]
    if command in ('help', '-h', '--help', '/?'):
        show_help()
        return 0
    if command == 'kits':
        show_kits()
        return 0
    if command == 'build':
        return run_tool(ROOT / 'tools' / 'make_kits.py', rest or ['all'])
    if command == 'studio':
        from studio.server import main as serve
        return serve(rest)
    if command == 'check':
        if not rest:
            print('要给一个 MIDI：memesynth check 某首.mid')
            return 2
        from studio.batch import main as batch_main
        return batch_main([rest[0], '--inspect', *rest[1:]])
    if command == 'vocals':
        return transcribe_vocals(rest)
    if command == 'export':
        if not rest:
            print('要给一个 MIDI：memesynth export 某首.mid')
            return 2
        from studio.batch import main as batch_main
        return batch_main(rest)

    print(f'不认识的命令：{first}\n')
    show_help()
    return 2


if __name__ == '__main__':
    raise SystemExit(main())
