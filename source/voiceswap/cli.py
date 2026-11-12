"""Entry point for `换人声.cmd` — drag a vocal stem on, get every voice to listen to.

Thin on purpose: it runs `swap.py` and then `make_audition.py`, which both work on their
own. Everything it knows that they do not is what a drag-and-drop should default to.

    换人声.cmd vocals.wav              全部 18 个声音 + 试听文件
    换人声.cmd vocals.wav xiaoxiao ana  只做这两个
    换人声.cmd                         列出声音库
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import voices as catalog


def main(argv):
    paths = [Path(a) for a in argv if not a.startswith('-')]
    audio = [p for p in paths if p.suffix.lower() in ('.wav', '.flac', '.mp3', '.ogg')]
    names = [a for a in argv if a in catalog.VOICES]

    if not audio:
        print('把分离出来的人声 wav 拖到这个 .cmd 上，就会用全部声音各换一遍。\n')
        print(f'声音库（{len(catalog.VOICES)} 个）：')
        for name, recipe in catalog.VOICES.items():
            built = '' if (HERE / 'voices' / name / 'reference.wav').is_file() else '  （未生成）'
            print(f'  {name:<12} {recipe["label"]}{built}')
        print('\n只想要其中几个，就在命令行里把名字跟在文件后面。')
        return 0

    # Resolve before anything runs: swap.py chdirs into the Seed-VC upstream, after which
    # a relative path from the drop would point somewhere else entirely.
    source = audio[0].resolve()
    out = source.parent / f'{source.stem}-换声'
    import swap
    chosen = names or list(catalog.VOICES)
    print(f'源：{source}\n输出：{out}\n声音：{len(chosen)} 个\n')
    swap.main([str(source), '--out', str(out), *(['--voice', *chosen])])

    # The point of a drag-and-drop run is to hear the result, so make the file that lets
    # you do that rather than leaving eighteen wavs in a folder.
    import make_audition
    audition = out / '试听.mp3'
    print('\n拼试听文件……')
    make_audition.main([str(out), '--source', str(source), '--out', str(audition)])
    print(f'\n好了，听这个：{audition}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
