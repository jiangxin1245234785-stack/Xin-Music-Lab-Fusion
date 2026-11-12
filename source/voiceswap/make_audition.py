"""Stitch a swap run into one file for listening, each segment announcing itself.

    python source/voiceswap/make_audition.py voiceswap-out --source vocals.wav
    python source/voiceswap/make_audition.py voiceswap-out --source vocals.wav --seconds 20

Eighteen unlabelled clips in a row make you count to know which voice you are on, so each
is introduced by a spoken name — synthesised with the same engine that made the library,
which is already installed.

Loudness is matched across segments. Conversions come back several dB hotter than the
source, and an A/B where one side is louder only tells you which side is louder.
"""
import argparse
import asyncio
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
DEPS = REPO / 'runtime' / 'addons' / 'voicelib-v1' / 'deps'
if DEPS.is_dir():
    sys.path.insert(0, str(DEPS))
sys.path.insert(0, str(HERE))

import numpy as np
import soundfile as sf

import voices as catalog

RATE, LABEL_VOICE = 44100, 'zh-CN-YunyangNeural'


def load(path, target_db=-16.0):
    audio, rate = sf.read(str(path), dtype='float32', always_2d=True)
    mono = audio.mean(axis=1)
    if rate != RATE:
        import librosa
        mono = librosa.resample(np.ascontiguousarray(mono), orig_sr=rate, target_sr=RATE)
    rms = float(np.sqrt(np.mean(mono.astype(np.float64) ** 2)))
    scaled = mono * (10 ** (target_db / 20) / max(rms, 1e-9))
    peak = float(np.abs(scaled).max())
    return scaled / peak * 0.97 if peak > 0.97 else scaled


def excerpt(signal, start, seconds):
    if seconds <= 0:
        return signal
    begin = int(start * RATE)
    return signal[begin:begin + int(seconds * RATE)]


async def say(text, destination):
    import edge_tts
    for attempt in range(1, 5):
        try:
            await edge_tts.Communicate(text, LABEL_VOICE).save(str(destination))
            return
        except Exception:
            if attempt == 4:
                raise SystemExit(f'报名字失败：{text}')
            await asyncio.sleep(2 * attempt)


async def build(args):
    labels = args.out.parent / '_labels'
    labels.mkdir(parents=True, exist_ok=True)
    gap = np.zeros(int(RATE * 0.6), dtype=np.float32)
    pieces = []

    segments = [('原唱', args.source)] if args.source else []
    for name, recipe in catalog.VOICES.items():
        found = list(args.directory.glob(f'*__{name}.wav'))
        if found:
            segments.append((recipe['label'].split(' · ')[0] + '，' +
                             recipe['label'].split(' · ')[-1], found[0]))
    if not segments:
        raise SystemExit(f'{args.directory} 里没有 *__<声音名>.wav，先跑 swap.py')

    for index, (label, path) in enumerate(segments):
        spoken = labels / f'{index}.mp3'
        await say(label, spoken)
        pieces += [load(spoken, target_db=-20.0), gap,
                   excerpt(load(path), args.start, args.seconds), gap]
        print(f'  {label}')

    args.out.parent.mkdir(parents=True, exist_ok=True)
    audio = np.concatenate(pieces).astype(np.float32)
    if args.out.suffix.lower() == '.mp3':
        sf.write(str(args.out), audio, RATE, format='MP3',
                 bitrate_mode='CONSTANT', compression_level=0.3)
    else:
        sf.write(str(args.out), audio, RATE)
    for leftover in labels.glob('*.mp3'):
        leftover.unlink()
    labels.rmdir()
    print(f'\n  {len(segments)} 段 / {len(audio) / RATE:.0f}s → {args.out}')


def main(argv=None):
    parser = argparse.ArgumentParser(description='把一次 swap 的结果拼成试听文件')
    parser.add_argument('directory', type=Path, help='swap.py 的输出目录')
    parser.add_argument('--source', type=Path, help='原始人声分轨，放在最前面做参照')
    parser.add_argument('--out', type=Path, default=Path('audition.mp3'))
    parser.add_argument('--seconds', type=float, default=15.0, help='每段截取秒数，0＝整段')
    parser.add_argument('--start', type=float, default=5.0, help='从第几秒开始截')
    asyncio.run(build(parser.parse_args(argv)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
