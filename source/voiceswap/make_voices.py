"""Build the synthesised reference-voice library.

    python source/voiceswap/make_voices.py all
    python source/voiceswap/make_voices.py xiaoxiao yunjian
    python source/voiceswap/make_voices.py --list

Each voice lands in `voices/<name>/` as a `voice.json` plus `reference.wav`. The wav is
gitignored build output; the recipe in `voices.py` is the thing that is kept, so the
library is always reproducible.

edge-tts is a build-time tool only. It reaches Microsoft's read-aloud endpoint to make the
references; once they exist, conversion is entirely local and never touches the network.
So an endpoint that changes or goes away blocks adding new voices and nothing else.

Every reference is checked before it is written. A short, silent or voiceless clip is the
failure that nothing downstream reports: Seed-VC would accept it and quietly convert into
a timbre that carries none of the speaker.
"""
import argparse
import asyncio
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEPS = HERE.parents[1] / 'runtime' / 'addons' / 'voicelib-v1' / 'deps'
if DEPS.is_dir():
    sys.path.insert(0, str(DEPS))
sys.path.insert(0, str(HERE))

import numpy as np
import soundfile as sf

import voices as catalog

RATE = 44100


async def synthesise(voice_id, text, rate, destination):
    """Fetch one clip as mp3, retrying — the endpoint answers 503 intermittently.

    Seen in practice on the very first call of this session: a 503 that succeeded on an
    immediate retry. Without the retry the library build would fail halfway and leave a
    partial set behind.
    """
    import edge_tts
    for attempt in range(1, 5):
        try:
            await edge_tts.Communicate(text, voice_id, rate=rate).save(str(destination))
            return
        except Exception as error:
            if attempt == 4:
                raise SystemExit(f'{voice_id}: 合成失败 {type(error).__name__}: {error}')
            print(f'      第 {attempt} 次失败（{type(error).__name__}），{2 * attempt}s 后重试', flush=True)
            await asyncio.sleep(2 * attempt)


def to_reference(mp3_path):
    """Decode to mono float32 at 44.1 kHz and normalise to a consistent peak."""
    audio, source_rate = sf.read(str(mp3_path), dtype='float32', always_2d=True)
    mono = audio.mean(axis=1)
    if source_rate != RATE:
        import librosa
        mono = librosa.resample(np.ascontiguousarray(mono), orig_sr=source_rate, target_sr=RATE)
    peak = float(np.abs(mono).max())
    return mono / peak * 0.95 if peak > 0 else mono


def check(name, audio):
    """Refuse a reference that cannot carry a speaker. Returns its measurements."""
    seconds = len(audio) / RATE
    rms_db = 20 * np.log10(max(float(np.sqrt(np.mean(audio.astype(np.float64) ** 2))), 1e-9))
    if not catalog.MIN_SECONDS <= seconds <= catalog.MAX_SECONDS:
        raise SystemExit(f'{name}: 参考时长 {seconds:.1f}s 不在 '
                         f'{catalog.MIN_SECONDS:.0f}–{catalog.MAX_SECONDS:.0f}s 内')
    if rms_db < catalog.MIN_RMS_DB:
        raise SystemExit(f'{name}: 参考太轻（{rms_db:.1f} dBFS），里面得真有人在说话')
    # Loudness alone does not prove speech — noise would pass it. Require that a pitch
    # tracker actually finds a voice, which is the thing the speaker embedding reads.
    import librosa
    f0, voiced, _ = librosa.pyin(librosa.resample(audio, orig_sr=RATE, target_sr=22050),
                                 fmin=65, fmax=1047, sr=22050, frame_length=2048, hop_length=512)
    share = float(np.mean(voiced & np.isfinite(f0)))
    if share < 0.25:
        raise SystemExit(f'{name}: 只有 {100 * share:.0f}% 的帧检出人声，这段参考不可用')
    median_hz = float(np.nanmedian(f0[voiced & np.isfinite(f0)]))
    return dict(seconds=round(seconds, 2), rmsDb=round(rms_db, 1),
                voicedShare=round(share, 3), medianHz=round(median_hz, 1))


def build(name, out_root, quiet=False):
    """Synthesise one reference into `out_root/<name>/`. Returns its manifest."""
    recipe = catalog.VOICES[name]
    if recipe.get('clip'):
        raise SystemExit(f'{name} 是用录音做的声音：python -I source/voiceswap/make_clip_voice.py {name}')
    voice_id = recipe['voice']
    text = recipe.get('script') or catalog.script_for(voice_id)
    rate = recipe.get('rate', '+0%')

    directory = out_root / name
    directory.mkdir(parents=True, exist_ok=True)
    mp3 = directory / '_raw.mp3'
    started = time.monotonic()
    asyncio.run(synthesise(voice_id, text, rate, mp3))
    audio = to_reference(mp3)
    mp3.unlink()
    measured = check(name, audio)
    sf.write(str(directory / 'reference.wav'), audio, RATE)

    manifest = {'name': name, 'label': recipe['label'], 'engine': 'edge-tts',
                'voice': voice_id, 'rate': rate, 'script': text,
                'reference': 'reference.wav', 'sampleRate': RATE,
                '_note': '由 make_voices.py 生成，可随时重跑覆盖。measured 是生成时实测，'
                         '不必再量。',
                'measured': measured}
    (directory / 'voice.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2),
                                          encoding='utf-8')
    if not quiet:
        print(f'  {name:<10} {measured["seconds"]:5.1f}s  rms {measured["rmsDb"]:6.1f} dBFS  '
              f'中位 {measured["medianHz"]:5.1f} Hz  有声 {100 * measured["voicedShare"]:3.0f}%  '
              f'{time.monotonic() - started:4.0f}s  {recipe["label"]}')
    return manifest


def main(argv=None):
    parser = argparse.ArgumentParser(description='构建 voiceswap 的合成参考声音库')
    parser.add_argument('voices', nargs='*', help='声音名，或 all')
    parser.add_argument('--out', type=Path, default=HERE / 'voices')
    parser.add_argument('--list', action='store_true', help='列出可用的声音')
    parser.add_argument('--quiet', action='store_true', help='只打印汇总行')
    args = parser.parse_args(argv)

    if args.list or not args.voices:
        print(f'可用声音（{len(catalog.VOICES)}）：')
        for name, recipe in catalog.VOICES.items():
            print(f'  {name:<10} {recipe["label"]}')
        return 0

    # `all` is the synthesised library; a voice made from a recording has its own builder.
    names = [n for n, r in catalog.VOICES.items() if not r.get('clip')] if args.voices == ['all'] else args.voices
    unknown = [name for name in names if name not in catalog.VOICES]
    if unknown:
        raise SystemExit(f'未知声音：{", ".join(unknown)}；可用：{", ".join(catalog.VOICES)}')

    started = time.monotonic()
    for name in names:
        build(name, args.out, quiet=args.quiet)
    print(f'\n共 {len(names)} 个声音 → {args.out}  用时 {time.monotonic() - started:.0f}s')
    return 0


if __name__ == '__main__':
    sys.exit(main())
