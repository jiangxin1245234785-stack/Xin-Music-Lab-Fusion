"""Build a reference voice from a recording, for voices that have no trained model.

    python -I source/voiceswap/make_clip_voice.py otto shuodedaoli      # clips pinned in voices.py
    python -I source/voiceswap/make_clip_voice.py shanniruo --file 某段录音.wav --start 3 --end 18
    python -I source/voiceswap/make_clip_voice.py --list

Seed-VC takes only the timbre from its reference, and about ten seconds of a voice is
enough for that, so a voice nobody has trained an RVC model for can still be offered. It
will be less like the person than a trained model, and it follows `swap.py`'s rules for
everything else (octaves, range, harmony).

A clip voice is an entry in `voices.py` with `clip` in place of the TTS `voice`:
- `files` of a pinned GitHub revision, each with its sha256: downloaded, checked, joined;
- or `local=True`: a recording the user handed over, given here with `--file`. Its sha256
  goes into `voice.json`, which is then the only thing that pins it.
`reverse=True` plays the joined clip backwards before it is used.

Run it with `-I`: what it reads is downloaded from strangers. Nothing is executed from it;
the files are decoded as audio and nothing else.
"""
import argparse
import hashlib
import json
import sys
import tempfile
import time
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import numpy as np
import soundfile as sf

import voices as catalog
from make_voices import RATE, check

GAP = 0.12                  # seconds of silence between joined pieces
EDGE_DB = 40.0              # silence this far under the piece's peak is trimmed off its ends


def sha256(path):
    with Path(path).open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def download(repo, revision, path, destination, attempts=4):
    url = f'https://raw.githubusercontent.com/{repo}/{revision}/' + urllib.parse.quote(path)
    for attempt in range(1, attempts + 1):
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'python-urllib'})
            with urllib.request.urlopen(request, timeout=60) as response:
                destination.write_bytes(response.read())
            return
        except OSError as error:
            if attempt == attempts:
                raise SystemExit(f'下载失败：{url}\n{error}')
            time.sleep(2 ** attempt)


def load(path, start=None, end=None):
    """One recording as mono float32 at RATE, with the silence at its ends trimmed."""
    audio, rate = sf.read(str(path), dtype='float32', always_2d=True)
    mono = audio.mean(axis=1)
    if start is not None or end is not None:
        mono = mono[int((start or 0) * rate):int(end * rate) if end is not None else None]
    if rate != RATE:
        import librosa
        mono = librosa.resample(np.ascontiguousarray(mono), orig_sr=rate, target_sr=RATE)
    loud = np.flatnonzero(np.abs(mono) > np.abs(mono).max() * 10 ** (-EDGE_DB / 20)) if len(mono) else []
    return mono[loud[0]:loud[-1] + 1] if len(loud) else mono


def join(pieces):
    gap = np.zeros(int(GAP * RATE), dtype=np.float32)
    parts = []
    for piece in pieces:
        peak = float(np.abs(piece).max())
        parts += [piece / peak * 0.9 if peak > 0 else piece, gap]     # one level, whatever each was recorded at
    return np.concatenate(parts[:-1]) if parts else np.zeros(0, dtype=np.float32)


def build(name, out_root, local=None, start=None, end=None):
    recipe = catalog.VOICES[name]
    clip = recipe.get('clip')
    if not clip:
        raise SystemExit(f'{name} 不是用录音做的声音（它走 make_voices.py）')
    source = {}
    if clip.get('local'):
        if not local or not Path(local).is_file():
            raise SystemExit(f'{name} 要一段你给的录音：--file <路径>')
        pieces = [load(local, start, end)]
        source = {'file': str(Path(local).resolve()), 'sha256': sha256(local), 'start': start, 'end': end}
    else:
        pieces = []
        with tempfile.TemporaryDirectory() as scratch:
            for number, (path, expected) in enumerate(clip['files'].items()):
                target = Path(scratch) / f'piece-{number}{Path(path).suffix}'
                download(clip['repo'], clip['revision'], path, target)
                found = sha256(target)
                if expected and found != expected:
                    raise SystemExit(f'{name}：{path} 的 sha256 和目录表里钉的不一致（{found}），没有用')
                if not expected:
                    print(f'    {path}  sha256 {found}   ← 还没钉，写进 voices.py')
                pieces.append(load(target))
        source = {'repo': clip['repo'], 'revision': clip['revision'], 'files': list(clip['files'])}
    audio = join(pieces)
    if clip.get('reverse'):
        audio = audio[::-1].copy()
    audio = audio[:int(catalog.MAX_SECONDS * RATE)]
    peak = float(np.abs(audio).max()) if len(audio) else 0.0
    audio = audio / peak * 0.95 if peak > 0 else audio
    measured = check(name, audio)

    directory = out_root / name
    directory.mkdir(parents=True, exist_ok=True)
    sf.write(str(directory / 'reference.wav'), audio, RATE)
    manifest = {'name': name, 'label': recipe['label'], 'engine': 'clip', 'source': source,
                'reverse': bool(clip.get('reverse')), 'reference': 'reference.wav', 'sampleRate': RATE,
                '_note': '由 make_clip_voice.py 用录音生成。measured 是生成时实测。', 'measured': measured}
    (directory / 'voice.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'  {name:<12} {measured["seconds"]:5.1f}s  rms {measured["rmsDb"]:6.1f} dBFS  '
          f'中位 {measured["medianHz"]:5.1f} Hz  有声 {100 * measured["voicedShare"]:3.0f}%  {recipe["label"]}')
    return manifest


def main(argv=None):
    parser = argparse.ArgumentParser(description='用一段录音做 voiceswap 的参考声音')
    parser.add_argument('voices', nargs='*', help='声音名（voices.py 里带 clip 的）')
    parser.add_argument('--file', type=Path, help='你给的录音（clip 是 local 的声音要它）')
    parser.add_argument('--start', type=float, help='录音里从第几秒开始用')
    parser.add_argument('--end', type=float, help='用到第几秒')
    parser.add_argument('--out', type=Path, default=HERE / 'voices')
    parser.add_argument('--list', action='store_true')
    args = parser.parse_args(argv)

    clips = {name: recipe for name, recipe in catalog.VOICES.items() if recipe.get('clip')}
    if args.list or not args.voices:
        for name, recipe in clips.items():
            built = '' if (args.out / name / 'reference.wav').is_file() else '  （未生成）'
            print(f'  {name:<12} {recipe["label"]}{built}')
        return 0
    unknown = [name for name in args.voices if name not in clips]
    if unknown:
        raise SystemExit(f'不是用录音做的声音：{", ".join(unknown)}；--list 看有哪些')
    if args.file and len(args.voices) != 1:
        raise SystemExit('--file 一次只给一个声音')
    for name in args.voices:
        build(name, args.out, args.file, args.start, args.end)
    return 0


if __name__ == '__main__':
    sys.exit(main())
