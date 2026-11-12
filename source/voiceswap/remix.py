"""Swap the vocal of a whole song and put it back over the other stems.

    python source/voiceswap/remix.py <stems 目录> --voice xiaoxiao yunjian --rvc iu
    python source/voiceswap/remix.py <stems 目录> --voice xiaoxiao --out 整首

The stems directory is what XLD's separation writes: `vocals.wav` beside the other stems,
all the same length and rate. Into `--out` go:
- `vocals-mono.wav` — the conversion input, the vocal stem folded to mono;
- `vocals-mono__<name>.wav` — each converted vocal, as swap.py / rvc.py write it;
- `page/` — the listening page (`fullsong.html` with its manifest inlined) and, in
  `page/audio/`, the whole song once with the original vocal and once per voice, mixed
  identically, so that comparing them compares only the voice. That folder is what gets
  published.

With `--harmony` each voice keeps the backing vocals instead (`harmony.py`): the stem is
split into lead and backing, each part is converted, and the second voice is placed the
way the 七里香 listening rounds settled. Intermediates go to `--out/harmony/`. A whole-vocal
conversion already in `--out` (`vocals-mono__<name>.wav`) is mixed too, as the
comparison without harmony.

Both converters already take a whole song: Seed-VC converts in 30 s windows with
crossfades and Applio splits at quiet points. They run as subprocesses because each needs
its own upstream as the working directory for every call, which one process cannot give
both at once.

What the mix has to put back, because conversion takes it away:
- **level** — conversions come back several dB away from the source, so each is scaled to
  the original vocal's RMS over the frames where the original is singing;
- **placement** — conversion is mono, so the result goes back at the original vocal's
  left/right balance. Stereo width (reverb, doubled takes) is not recovered;
- **length** — a few samples either way, padded or trimmed to the stems'.
"""
import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import numpy as np
import soundfile as sf

#: The window for "is the original singing here", and how far under the loudest window
#: still counts. Level is matched over those windows only, so the instrumental stretches
#: (where the stem holds only separation residue) do not drag the match down.
WINDOW_SECONDS, ACTIVE_BELOW_PEAK_DB = 0.05, 40.0


def window_rms_db(mono, rate):
    hop = int(WINDOW_SECONDS * rate)
    frames = mono[:len(mono) // hop * hop].reshape(-1, hop).astype(np.float64)
    return 10 * np.log10(np.mean(frames ** 2, axis=1) + 1e-20), hop


def active_rms(mono, active, hop):
    frames = mono[:len(active) * hop].reshape(-1, hop)[active].astype(np.float64)
    return float(np.sqrt(np.mean(frames ** 2)))


def fit(audio, frames):
    return np.pad(audio, (0, max(0, frames - len(audio))))[:frames]


def run(script, arguments, source, out, backend):
    command = [sys.executable, '-X', 'utf8', str(HERE / script), *arguments]
    print(f'  → {script} {" ".join(arguments[1:])}', flush=True)
    subprocess.run(command, check=True)
    # Both converters write their octave-guard record under the same name; keep each.
    record = out / f'{source.stem}.f0-repairs.json'
    if record.is_file():
        record.replace(out / f'{source.stem}.{backend}.f0-repairs.json')


def main(argv=None):
    parser = argparse.ArgumentParser(description='整首歌换人声，再和其余分轨混回去')
    parser.add_argument('stems', type=Path, help='分轨目录（vocals.wav 和其余分轨）')
    parser.add_argument('--voice', nargs='+', default=[], help='合成声音库里的声音（Seed-VC）')
    parser.add_argument('--rvc', nargs='+', default=[], help='社区 RVC 模型')
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--level', type=float, default=0.3, help='mp3 压缩级别，0 最好 1 最小')
    parser.add_argument('--title', help='页面上的歌名，默认读分轨旁边的 track.json')
    parser.add_argument('--mix-only', action='store_true', help='不重新转换，只用 --out 里已有的结果重新混音、出页面')
    parser.add_argument('--harmony', action='store_true',
                        help='保留和声：先分出主唱和和声，各转一遍，按乐句放回第二声部（harmony.py）')
    args = parser.parse_args(argv)

    stems, out = args.stems.resolve(), args.out.resolve()
    vocal_path = stems / 'vocals.wav'
    backing_paths = sorted(p for p in stems.glob('*.wav') if p.name != 'vocals.wav')
    if not vocal_path.is_file() or not backing_paths:
        raise SystemExit(f'{stems} 里要有 vocals.wav 和至少一条其余分轨')
    if not (args.voice or args.rvc):
        raise SystemExit('至少给一个 --voice 或 --rvc')
    out.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()

    vocal, rate = sf.read(str(vocal_path), dtype='float32', always_2d=True)
    backing = np.zeros_like(vocal)
    for path in backing_paths:
        stem, stem_rate = sf.read(str(path), dtype='float32', always_2d=True)
        if stem_rate != rate or stem.shape != vocal.shape:
            raise SystemExit(f'{path.name} 和 vocals.wav 的长度或采样率不一致')
        backing += stem
    mono = vocal.mean(axis=1)
    source = out / 'vocals-mono.wav'
    sf.write(str(source), mono, rate, subtype='FLOAT')
    print(f'  {len(backing_paths)} 条伴奏分轨 + 人声，{len(mono) / rate:.1f}s @ {rate} Hz', flush=True)

    # The octave guard decides once per song. Each backend tracks pitch on its own RMVPE
    # pass and they disagree on borderline notes, so with both in play RVC follows the
    # lifts Seed-VC decided — every voice then sings the same notes in the same octave.
    decided = out / f'{source.stem}.seedvc.f0-repairs.json'
    if args.harmony:
        import harmony
        if not harmony.available():
            raise SystemExit(f'保留和声要 karaoke 模型（{harmony.KARAOKE_MODEL}）和 envs/roformer（{harmony.ROFORMER_PYTHON}）')
        # Cached under out/harmony, so --mix-only costs only the placing, never a conversion.
        kept = harmony.render(vocal_path, out / 'harmony', args.voice, args.rvc,
                              progress=lambda fraction, message: print(f'  [{fraction:4.0%}] {message}', flush=True))
    else:
        if args.voice and not args.mix_only:
            run('swap.py', [str(source), '--voice', *args.voice, '--out', str(out)], source, out, 'seedvc')
        if args.rvc and not args.mix_only:
            follow = ['--follow-octaves', str(decided)] if args.voice else []
            run('rvc.py', [str(source), '--model', *args.rvc, '--out', str(out), *follow], source, out, 'rvc')

    loudness, hop = window_rms_db(mono, rate)
    active = loudness > loudness.max() - ACTIVE_BELOW_PEAK_DB
    target = active_rms(mono, active, hop)
    # Per-channel gain that puts a mono vocal back where the original sat left to right.
    balance = np.sqrt(np.mean(vocal.astype(np.float64) ** 2, axis=0)) / np.sqrt(np.mean(mono.astype(np.float64) ** 2))

    mixes, report = {'original': backing + vocal}, {}
    entries = []                                # (mix name, converted mono or None to read it, harmony report)
    for name in [*args.voice, *args.rvc]:
        if args.harmony:
            entries.append((name, *kept[name]))
            if (out / f'{source.stem}__{name}.wav').is_file():
                entries.append((f'{name}-plain', None, None))
        else:
            entries.append((name, None, None))
    for key, converted, kept_report in entries:
        if converted is None:
            converted, converted_rate = sf.read(str(out / f'{source.stem}__{key.removesuffix("-plain")}.wav'), dtype='float32')
            if converted.ndim > 1:
                converted = converted.mean(axis=1)
            if converted_rate != rate:
                raise SystemExit(f'{key} 的转换结果是 {converted_rate} Hz，分轨是 {rate} Hz')
        length_error = len(converted) - len(mono)
        converted = fit(converted, len(mono))
        gain = target / max(active_rms(converted, active, hop), 1e-9)
        mixes[key] = backing + (converted * gain)[:, None] * balance[None, :].astype(np.float32)
        report[key] = {'lengthErrorSamples': int(length_error), 'gainDb': round(20 * np.log10(gain), 2)}
        if kept_report:
            report[key]['harmony'] = kept_report
        print(f'  {key:<16} 长度差 {length_error:+d} 样本，响度对齐 {report[key]["gainDb"]:+.1f} dB', flush=True)

    # One gain for every mix, so the A/B stays a comparison of voices and not of levels.
    # The stems sum hotter than the master (1.28 for 七里香), and a new vocal no longer
    # cancels what the old one did against the backing, so peaks rise further.
    peaks = {name: float(np.abs(mix).max()) for name, mix in mixes.items()}
    common = min(1.0, 0.98 / max(peaks.values()))
    audio_dir = out / 'page' / 'audio'
    audio_dir.mkdir(parents=True, exist_ok=True)
    for name, mix in mixes.items():
        filename = 'original.mp3' if name == 'original' else f'v-{name}.mp3'
        sf.write(str(audio_dir / filename), mix * common, rate, format='MP3',
                 bitrate_mode='CONSTANT', compression_level=args.level)
    generated = time.strftime('%Y-%m-%d %H:%M')
    (out / 'remix.json').write_text(json.dumps(
        {'stems': str(stems), 'backing': [p.name for p in backing_paths], 'rate': rate,
         'activeShare': round(float(active.mean()), 3), 'balance': [round(float(b), 3) for b in balance],
         'peaks': {k: round(v, 3) for k, v in peaks.items()},
         'commonGainDb': round(20 * np.log10(common), 2), 'voices': report,
         'generated': generated}, ensure_ascii=False, indent=2), encoding='utf-8')
    write_page(out, stems, args, len(mono) / rate, generated)
    print(f'\n  {len(mixes)} 首 → {out / "page"}  公共增益 {20 * np.log10(common):+.1f} dB  '
          f'用时 {time.monotonic() - started:.0f}s')
    return 0


def write_page(out, stems, args, seconds, generated):
    """`fullsong.html` with its manifest inlined, beside the mixes it plays."""
    import librosa
    import rvc_models
    import voices

    track = stems.parent.parent / 'track.json'
    title = args.title or (json.loads(track.read_text(encoding='utf-8')).get('title')
                           if track.is_file() else stems.parent.parent.name)
    # With --harmony the converters ran on the split lead, in out/harmony.
    records, stem = (out / 'harmony', 'lead-mono') if args.harmony else (out, 'vocals-mono')
    run_record = records / f'{stem}.rvc-run.json'
    octaves = (json.loads(run_record.read_text(encoding='utf-8'))['models'] if run_record.is_file() else {})
    tracks = [{'id': 'original', 'name': '原唱', 'desc': '分离出来的人声，没换', 'engine': '参照',
               'file': 'original.mp3'}]
    entries = [(name, voices.VOICES[name]['label'], 'Seed-VC') for name in args.voice]
    for name in args.rvc:
        octave = octaves.get(name, {}).get('octave', rvc_models.MODELS[name]['octave'])
        entries.append((name, rvc_models.MODELS[name]['label'], 'RVC · 升一个八度' if octave == 1 else 'RVC'))
    for name, full_label, engine in entries:
        label, _, desc = full_label.partition(' · ')
        if args.harmony:
            tracks.append({'id': name, 'name': label, 'desc': desc, 'engine': engine + ' · 保留和声',
                           'file': f'v-{name}.mp3'})
            if (out / f'vocals-mono__{name}.wav').is_file():          # mixed beside it in main()
                tracks.append({'id': f'{name}-plain', 'name': label, 'desc': '整轨转（旧做法：和声跟着没了）',
                               'engine': engine, 'file': f'v-{name}-plain.mp3'})
        else:
            tracks.append({'id': name, 'name': label, 'desc': desc, 'engine': engine, 'file': f'v-{name}.mp3'})

    # The spots are the song's one decision: Seed-VC's when it ran, else RVC's own.
    spots, glitches = [], 0
    for backend in ('seedvc', 'rvc'):
        record = records / f'{stem}.{backend}.f0-repairs.json'
        if record.is_file():
            for start, end, level, dip in json.loads(record.read_text(encoding='utf-8'))['lifted']:
                if end - start >= 0.1:
                    spots.append({'start': start, 'end': end,
                                  'from': librosa.midi_to_note(int(round(dip)), unicode=False),
                                  'to': librosa.midi_to_note(int(round(level)), unicode=False)})
                else:
                    glitches += 1
            break

    manifest = {'title': title, 'seconds': round(seconds, 2), 'tracks': tracks,
                'spots': spots, 'glitches': glitches, 'generated': generated}
    template = (HERE / 'fullsong.html').read_text(encoding='utf-8')
    placeholder = '/*@MANIFEST@*/null'
    if template.count(placeholder) != 1:
        raise SystemExit('fullsong.html 里的清单占位符不是恰好一个')
    # Inside a <script>, a literal "</" in any label would end the element early.
    page = template.replace(placeholder, json.dumps(manifest, ensure_ascii=False).replace('</', '<\\/'))
    (out / 'page' / 'index.html').write_text(page, encoding='utf-8')


if __name__ == '__main__':
    sys.exit(main())
