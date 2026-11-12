"""Render one MIDI through several kits and write the WAVs. No GUI, no server.

The studio server calls `export`; `python -m studio.batch` calls the same function, so the
thing the button does and the thing the command line does cannot drift apart.

Failure is per kit: a kit whose samples are missing reports itself and the rest still run,
because finding out after a long render that one of eight kits was broken is worse than
finding out which one.
"""
from __future__ import annotations

import argparse
import dataclasses
import math
import sys
from pathlib import Path

import soundfile

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from memesynth.cli import slug                      # noqa: E402
from memesynth.kit import KitError, load_kit        # noqa: E402
from memesynth.render import peak_factor, render    # noqa: E402
from memesynth.score import MIN_DURATION, read_score  # noqa: E402
from studio import effects                          # noqa: E402

SAMPLE_RATE = 48000


@dataclasses.dataclass
class Written:
    """One kit's result: the files it produced, or why it produced none."""

    kit: str
    files: list
    seconds: float
    rendered: int
    truncated: int
    unresolved: dict
    error: str = ''


def unique(path: Path) -> Path:
    """`name.wav` -> `name-2.wav` -> `name-3.wav`. Never overwrites (SPEC §2)."""
    if not path.exists():
        return path
    for index in range(2, 1000):
        candidate = path.with_name(f'{path.stem}-{index}{path.suffix}')
        if not candidate.exists():
            return candidate
    raise OSError(f'同名文件太多：{path}')


def with_voice(mix, factor, lead, vocal, peak_db):
    """A kit's mix with its transcribed lead taken out and a sung vocal put in (SPEC v2 §4).

    The instruments keep the exact level of the kit's own file (`factor`), the vocal keeps
    the level it was given, and only if the sum then goes over `peak_db` is the whole thing
    pulled down by one factor.
    """
    import numpy as np

    instruments = (mix - lead if lead is not None else mix) * factor
    frames = max(len(instruments), len(vocal))
    out = np.zeros((frames, 2), dtype=np.float32)
    out[:len(instruments)] += instruments
    out[:len(vocal)] += vocal[:, None]
    return out * peak_factor([out], peak_db)


def export(midi_path, kit_paths, out_dir, stems=False, min_duration=MIN_DURATION,
           peak_db=-1.0, progress=None, vocal=None, voice=''):
    """Render `midi_path` through each kit and write WAVs into `out_dir`.

    `progress(fraction, message)` is called as each kit starts and finishes, so a caller
    with a progress bar needs to know nothing about rendering. With `vocal` (mono, 48 kHz,
    already at its final level) every kit also gets `<midi>.<kit>.<voice>.wav`, where the
    sung vocal replaces the kit's `vocals` route.
    """
    midi_path, out_dir = Path(midi_path), Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    score = read_score(midi_path, min_duration=min_duration)
    if not score.notes:
        raise ValueError('这个 MIDI 里没有可路由的音符')
    results, total = [], max(1, len(kit_paths))
    if vocal is not None and stems:
        import numpy as np
        vocal_path = unique(out_dir / f'{midi_path.stem}.{slug(voice)}.vocal.wav')
        soundfile.write(str(vocal_path), np.repeat(vocal[:, None], 2, axis=1), SAMPLE_RATE, subtype='PCM_24')

    for index, kit_path in enumerate(kit_paths):
        name = Path(kit_path).parent.name
        say = lambda fraction, text: progress and progress((index + fraction) / total, text)
        say(0.0, f'{name} · 渲染中')
        try:
            kit = load_kit(kit_path, sample_rate=SAMPLE_RATE)
        except KitError as error:
            results.append(Written(name, [], 0.0, 0, 0, {}, '；'.join(error.problems)))
            continue
        try:
            result = render(score, kit)
            # One factor across the mix and every stem, so the stems still sum to the mix.
            factor = peak_factor([result.mix] + [result.stereo_stem(route) for route in result.stems], peak_db)
            files = []
            mix_path = unique(out_dir / f'{midi_path.stem}.{name}.wav')
            soundfile.write(str(mix_path), result.mix * factor, SAMPLE_RATE, subtype='PCM_24')
            files.append(str(mix_path))
            if vocal is not None:
                leads = [result.stereo_stem(r) for r in result.stems if r == 'vocals' or r.startswith('vocals/')]
                lead = sum(leads) if leads else None
                voice_path = unique(out_dir / f'{midi_path.stem}.{name}.{slug(voice)}.wav')
                soundfile.write(str(voice_path), with_voice(result.mix, factor, lead, vocal, peak_db),
                                SAMPLE_RATE, subtype='PCM_24')
                files.append(str(voice_path))
            if stems:
                for position, route in enumerate(sorted(result.stems)):
                    say((position + 1) / (len(result.stems) + 1), f'{name} · 分轨 {route}')
                    stem_path = unique(out_dir / f'{midi_path.stem}.{name}.{slug(route)}.wav')
                    soundfile.write(str(stem_path), result.stereo_stem(route) * factor,
                                    SAMPLE_RATE, subtype='PCM_24')
                    files.append(str(stem_path))
            results.append(Written(name, files, result.mix.shape[0] / SAMPLE_RATE,
                                   result.rendered, result.truncated, dict(result.unresolved)))
        except Exception as error:                   # noqa: BLE001 — one kit must not stop the rest
            results.append(Written(name, [], 0.0, 0, 0, {}, f'{type(error).__name__}: {error}'))
        say(1.0, f'{name} · 完成')
    return score, results


#: The six tracks of a rebuild, the same as XLD's separated stems (SPEC v5 §1). A route belongs
#: to the first track whose test it passes; whatever is left over is `other`.
TRACKS = ('drums', 'bass', 'guitar', 'piano', 'vocals', 'other')


def track_of(route):
    if route.startswith('drums/'):
        return 'drums'
    if route == 'bass':
        return 'bass'
    if route.startswith('guitar'):
        return 'guitar'
    if route == 'piano':
        return 'piano'
    if route == 'vocals' or route.startswith('vocals/'):
        return 'vocals'
    return 'other'


def to_48k(audio, rate):
    """`audio` as stereo float32 at SAMPLE_RATE.

    A windowed-sinc polyphase resampler in numpy alone: the studio's own environment has
    no scipy, librosa or soxr and is not getting one for this (SPEC §6)."""
    import numpy as np
    from fractions import Fraction

    audio = np.asarray(audio, dtype=np.float32)
    if audio.ndim == 1:
        audio = audio[:, None]
    if audio.shape[1] == 1:
        audio = np.repeat(audio, 2, axis=1)
    audio = audio[:, :2]
    if int(rate) == SAMPLE_RATE:
        return audio
    ratio = Fraction(SAMPLE_RATE, int(rate))              # 160 / 147 from 44.1 kHz
    up, down = ratio.numerator, ratio.denominator
    half, beta = 16, 8.0
    cutoff = min(1.0, up / down)
    frames = len(audio) * up // down
    out = np.zeros((frames, 2), dtype=np.float32)
    padded = np.pad(audio, ((half, half + 1), (0, 0)))
    taps = np.arange(-half + 1, half + 1)
    for phase in range(up):
        n = np.arange(phase, frames, up)
        if not len(n):
            continue
        offset = ((phase * down) % up) / up                # the same for every sample of this phase
        x = taps - offset
        window = np.i0(beta * np.sqrt(np.clip(1.0 - (x / half) ** 2, 0.0, 1.0))) / np.i0(beta)
        kernel = cutoff * np.sinc(cutoff * x) * window
        kernel = (kernel / kernel.sum()).astype(np.float32)
        base = (n * down) // up
        out[n] = np.einsum('mtc,t->mc', padded[base[:, None] + taps[None, :] + half], kernel)
    return out


def rms(audio):
    import numpy as np
    return float(np.sqrt(np.mean(np.square(audio, dtype=np.float64)))) if audio.size else 0.0


#: A stem under this RMS over the whole song holds nothing (-60 dBFS), and no stem is scaled by
#: more than this many times the median of the others (+12 dB).
EMPTY_STEM, STEM_CAP = 10.0 ** (-60 / 20), 4.0


def file_rms(path):
    """RMS of a whole audio file, read in blocks."""
    import numpy as np
    energy, count = 0.0, 0
    for block in soundfile.blocks(str(path), blocksize=1 << 18, dtype='float32', always_2d=True):
        energy += float(np.sum(np.square(block, dtype=np.float64)))
        count += block.size
    return (energy / count) ** 0.5 if count else 0.0


def levels_from(by_track, stems):
    """How much each separated stem is scaled to sit where the kit puts that track.

    `by_track` is one kit's render of the whole song, per track. Returns the factor per track,
    their median (which a track with nothing to compare against takes, an empty stem included),
    and which stems were empty or held back. Measured over the
    whole song on purpose: over a short stretch a stem that happens to be silent there would
    be turned up into noise."""
    import numpy as np
    raw, empty = {}, []
    for name, path in (stems or {}).items():
        if name == 'vocals' or name not in by_track:
            continue
        reference, own = rms(by_track[name]), file_rms(path)
        if own < EMPTY_STEM:
            empty.append(name)                       # nothing was separated onto it: not a quiet instrument
        elif reference > 0:
            raw[name] = reference / own
    spare = float(np.median(list(raw.values()))) if raw else 1.0
    # A stem far quieter than the notes transcribed on its track is mostly bleed (the transcription
    # has phantom notes there). It is not turned up past a few times what the others get.
    factors = {name: min(value, STEM_CAP * spare) for name, value in raw.items()}
    notes = {'empty': sorted(empty), 'capped': sorted(name for name, value in raw.items() if value > STEM_CAP * spare)}
    return factors, spare, notes


def stem_levels(midi_path, kit_path, stems, min_duration=MIN_DURATION):
    """`levels_from` for a song and a preset kit: what the page asks the server for."""
    result = render(read_score(Path(midi_path), min_duration=min_duration), load_kit(kit_path, sample_rate=SAMPLE_RATE))
    by_track = {}
    for route in result.stems:
        name = track_of(route)
        by_track[name] = by_track.get(name, 0) + result.stereo_stem(route)
    return levels_from(by_track, stems)


def rebuild(midi_path, plan, out_dir, kits_dir, stems=None, vocal=None, voice='', write_tracks=False,
            min_duration=MIN_DURATION, peak_db=-1.0, progress=None, listen_path=None):
    """Write one rebuild of a song: every track kept, replaced or silent, as `plan` says (SPEC v5).

    `plan` is `{'preset': kit, 'tracks': {track: {'mode': 'orig' | 'swap' | 'mute', 'kit': kit or None,
    'db': float, 'solo': bool, and the five numbers of `effects.DEFAULTS`}}}`. `stems` maps a track to its separated wav, for the tracks kept
    as they are. `vocal` is the sung vocal (mono, 48 kHz, already at its final level) when the
    vocal track sings; a vocal track that is `swap` without one is played by its kit.

    A kept stem is brought to the level its own track has when the preset kit plays it, over
    the whole song (`levels_from`), so keeping one track does not throw the balance the rest
    was mixed to. Returns the score and
    a dict of what was written.
    """
    import json

    import numpy as np

    midi_path, out_dir = Path(midi_path), Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    say = lambda fraction, text: progress and progress(fraction, text)
    score = read_score(midi_path, min_duration=min_duration)
    tracks = {name: dict(mode='swap', kit=None, db=0.0, solo=False) for name in TRACKS}
    known = sorted(p.parent.name for p in Path(kits_dir).glob('*/kit.json'))
    if not known:
        raise ValueError('音色库是空的')
    for name, choice in (plan.get('tracks') or {}).items():
        if name in tracks and isinstance(choice, dict):
            tracks[name].update({k: v for k, v in choice.items()
                                 if k in ('mode', 'kit', 'db', 'solo') or k in effects.DEFAULTS})
    # A plan can come from a file someone edited or from an older studio: whatever in it does
    # not make sense falls back to the default instead of failing the whole export.
    for choice in tracks.values():
        if choice['mode'] not in ('orig', 'swap', 'mute'):
            choice['mode'] = 'swap'
        if choice['kit'] not in known:
            choice['kit'] = None
        try:
            choice['db'] = max(-60.0, min(12.0, float(choice['db'] or 0.0)))
        except (TypeError, ValueError):
            choice['db'] = 0.0
        choice.update(effects.settings(choice))
    preset = plan.get('preset') if plan.get('preset') in known else known[0]
    stems = stems or {}
    soloed = [name for name in TRACKS if tracks[name].get('solo')]
    sounding = lambda name: tracks[name]['mode'] != 'mute' and (not soloed or name in soloed)
    sung = vocal is not None and tracks['vocals']['mode'] in ('orig', 'swap')

    # Every kit that plays a track, and the preset as the level reference for kept stems.
    wanted = {preset}
    for name in TRACKS:
        if tracks[name]['mode'] == 'swap' and not (name == 'vocals' and sung):
            wanted.add(tracks[name]['kit'] or preset)
    # Octave and dynamics change the notes of the tracks a kit plays, and only those: a kept
    # stem's track is rendered as written, because that render is what its level is measured against.
    played = effects.shape(score, {name: tracks[name] for name in TRACKS if tracks[name]['mode'] == 'swap'}, track_of)
    rendered, notes = {}, {}
    for index, kit_name in enumerate(sorted(wanted)):
        say(0.05 + 0.5 * index / len(wanted), f'{kit_name} · 渲染中')
        result = render(played, load_kit(Path(kits_dir) / kit_name / 'kit.json', sample_rate=SAMPLE_RATE))
        by_track = {}
        for route in result.stems:
            name = track_of(route)
            by_track[name] = by_track.get(name, 0) + result.stereo_stem(route)
        rendered[kit_name] = by_track
        notes[kit_name] = {'rendered': result.rendered, 'truncated': result.truncated}

    layers, report = {}, []
    kept = [name for name in TRACKS if tracks[name]['mode'] == 'orig' and name != 'vocals' and name in stems]
    originals = {}
    for index, name in enumerate(kept):
        say(0.6 + 0.2 * index / max(1, len(kept)), f'{name} · 读原声')
        audio, rate = soundfile.read(stems[name], dtype='float32', always_2d=True)
        originals[name] = to_48k(audio, rate)
    # The same numbers the page auditions with: every stem of the song against the preset.
    factors, spare, level_notes = levels_from(rendered[preset], stems) if kept else ({}, 1.0, {'empty': [], 'capped': []})
    for name in TRACKS:
        choice = tracks[name]
        gain = 10.0 ** (float(choice.get('db') or 0.0) / 20.0)
        if name == 'vocals' and sung:
            audio, how = np.repeat(np.asarray(vocal, dtype=np.float32)[:, None], 2, axis=1), voice or 'original'
        elif choice['mode'] == 'orig' and name in originals:
            audio, how = originals[name] * factors.get(name, spare), 'orig'
        elif choice['mode'] == 'swap' and name in rendered[choice['kit'] or preset]:
            audio, how = rendered[choice['kit'] or preset][name], choice['kit'] or preset
        else:
            audio, how = None, 'mute' if choice['mode'] == 'mute' else 'empty'
        report.append({'track': name, 'mode': choice['mode'], 'by': how, 'db': float(choice.get('db') or 0.0),
                       'sounding': audio is not None and sounding(name),
                       'emptyStem': how == 'orig' and name in level_notes['empty'],
                       **{key: choice[key] for key in effects.DEFAULTS if choice[key]}})
        if audio is not None and sounding(name):
            if choice['tone'] or choice['echo'] or choice['room']:
                say(0.82, f'{name} · 效果')
            layers[name] = effects.apply(audio * gain, choice)

    frames = max((len(a) for a in layers.values()), default=0)
    if not frames:
        raise ValueError('这个方案里没有一条出声的轨')
    mix = np.zeros((frames, 2), dtype=np.float32)
    for audio in layers.values():
        mix[:len(audio)] += audio
    factor = peak_factor([mix], peak_db)                   # one factor, so the track files still sum to the mix
    say(0.85, '写文件')
    if listen_path is not None:
        # A listen-through for the page: the same mix as the export, as one 16-bit file and nothing else.
        soundfile.write(str(listen_path), mix * factor, SAMPLE_RATE, subtype='PCM_16')
        say(1.0, '完成')
        return score, {'files': [str(listen_path)], 'tracks': report, 'kits': notes, 'factor': factor,
                       'seconds': frames / SAMPLE_RATE}
    files = []
    mix_path = unique(out_dir / f'{midi_path.stem}.重构.wav')
    soundfile.write(str(mix_path), mix * factor, SAMPLE_RATE, subtype='PCM_24')
    files.append(str(mix_path))
    if write_tracks:
        for name, audio in layers.items():
            path = unique(out_dir / f'{mix_path.stem}.{name}.wav')
            soundfile.write(str(path), audio * factor, SAMPLE_RATE, subtype='PCM_24')
            files.append(str(path))
    plan_path = mix_path.with_suffix('.json')
    plan_path.write_text(json.dumps({'preset': preset, 'tracks': tracks, 'voice': voice if sung else '',
                                     'written': report}, ensure_ascii=False, indent=1), encoding='utf-8')
    files.append(str(plan_path))
    say(1.0, '完成')
    return score, {'files': files, 'tracks': report, 'kits': notes, 'factor': factor,
                   'seconds': frames / SAMPLE_RATE}


def inspect(midi_path, min_duration=MIN_DURATION):
    """Print the transcription's vital signs — the same table the studio page shows.

    Velocity count alone lies: a track can hold 25 distinct values inside a 2 dB band and
    still sound dead, because the renderer maps velocity straight to amplitude. So the
    grade is the dB spread, not how many values there are.
    """
    import pretty_midi

    midi_path = Path(midi_path)
    midi = pretty_midi.PrettyMIDI(str(midi_path))
    score = read_score(midi_path, min_duration=min_duration)
    amplitude = lambda v: 20 * math.log10(max(v, 1) / 127)

    print(f'{midi_path.name} — {len(score.notes)} 个音符 / {score.duration:.1f} 秒 / '
          f'{len(score.routes)} 条路由 / {len(midi.instruments)} 条轨道\n')
    header = f'{"轨道":<34}{"音符":>7}{"力度":>10}{"档位":>6}{"动态":>12}{"时长中位":>10}{"<20ms":>9}'
    print(header)
    print('-' * 90)
    flat, narrow, short_total, total = [], [], 0, 0
    for part in midi.instruments:
        if not part.notes:
            continue
        velocities = [n.velocity for n in part.notes]
        durations = sorted(n.end - n.start for n in part.notes)
        distinct = len(set(velocities))
        spread = amplitude(max(velocities)) - amplitude(min(velocities))
        short = sum(1 for d in durations if d < 0.02)
        name = part.name or ('(鼓，无名)' if part.is_drum else '(无名)')
        grade = '平 ' if distinct <= 4 else ('窄 ' if spread < 6 else '  ')
        if distinct <= 4:
            flat.append((name, len(velocities)))
        elif spread < 6:
            narrow.append((name, spread))
        short_total += short
        total += len(velocities)
        print(f'{name[:33]:<34}{len(velocities):>7}{min(velocities):>5}-{max(velocities):<4}'
              f'{distinct:>6}{grade + f"{spread:.1f} dB":>12}'
              f'{durations[len(durations) // 2]:>9.2f}s{short:>9}')
    print()
    if flat:
        count = sum(n for _, n in flat)
        print(f'  ! {count} 个音符（{100 * count / max(1, total):.0f}%）在没有动态的轨上：'
              + '、'.join(name for name, _ in flat))
        print('    换完音色这些声部会是平的 —— 这是 L1 没做力度的痕迹。')
    else:
        print('  每条轨都有真实力度，没有恒定 velocity 的轨。')
    for name, spread in narrow:
        print(f'  ! {name} 有力度但只有 {spread:.1f} dB，听上去接近平的。')
    for reason, count in sorted(score.dropped.items()):
        print(f'  ! 渲染时会丢弃 {count} 个音符：{reason}')
    for text in score.warnings:
        print(f'  ! {text}')
    return score


def main(argv=None):
    parser = argparse.ArgumentParser(prog='studio.batch', description='把一个 MIDI 用多套音色导出成 wav')
    parser.add_argument('midi', type=Path)
    parser.add_argument('-o', '--out', type=Path, default=Path('out'))
    parser.add_argument('-k', '--kits', nargs='*', help='kit 名；留空就是全部')
    parser.add_argument('--stems', action='store_true', help='同时写出每条路由的分轨')
    parser.add_argument('--min-duration', type=float, default=MIN_DURATION)
    parser.add_argument('--inspect', action='store_true', help='只打印转谱体检，不渲染')
    args = parser.parse_args(argv)

    if args.inspect:
        inspect(args.midi, min_duration=args.min_duration)
        return 0

    available = sorted(p for p in (ROOT / 'kits').glob('*/kit.json'))
    chosen = [p for p in available if not args.kits or p.parent.name in args.kits]
    if not chosen:
        print('没有可用的 kit（先跑 tools/make_kits.py all）', file=sys.stderr)
        return 2
    score, results = export(args.midi, chosen, args.out, stems=args.stems,
                            min_duration=args.min_duration,
                            progress=lambda f, m: print(f'  [{f * 100:3.0f}%] {m}'))
    print(f'\n{len(score.notes)} 个音符 / {score.duration:.1f} 秒 / {len(score.routes)} 条路由')
    for item in results:
        if item.error:
            print(f'  ! {item.kit}：{item.error}')
            continue
        print(f'  {item.kit}: {len(item.files)} 个文件，{item.rendered} 个音符'
              + (f'，{item.truncated} 个被素材长度截断' if item.truncated else ''))
        for text in item.files:
            print(f'      {text}')
    return 1 if all(item.error for item in results) else 0


if __name__ == '__main__':
    raise SystemExit(main())
