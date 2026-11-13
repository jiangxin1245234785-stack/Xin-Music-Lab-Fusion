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
import functools
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
    no scipy, librosa or soxr and is not getting one for this (SPEC §6).

    Output sample n sits at input position n·down/up, so every `down` input samples give
    exactly `up` output samples: a stretch that starts on a multiple of `down` resamples to
    the same numbers as that stretch of the whole file (`window_48k` relies on this)."""
    import numpy as np
    from numpy.lib.stride_tricks import as_strided

    audio = np.asarray(audio, dtype=np.float32)
    if audio.ndim == 1:
        audio = audio[:, None]
    if audio.shape[1] == 1:
        audio = np.repeat(audio, 2, axis=1)
    audio = audio[:, :2]
    if int(rate) == SAMPLE_RATE:
        return audio
    up, down, kernels = resampler(int(rate))
    frames = len(audio) * up // down
    out = np.zeros((frames, 2), dtype=np.float32)
    padded = np.ascontiguousarray(np.pad(audio, ((RESAMPLE_HALF, RESAMPLE_HALF + 1), (0, 0))))
    row, column = padded.strides
    for phase in range(up):
        count = len(range(phase, frames, up))
        if not count:
            continue
        # The samples of one phase read the input `down` apart: a strided view, no gathered copy.
        first = (phase * down) // up + 1                   # taps start at 1 - half; the padding adds half
        view = as_strided(padded[first:], shape=(count, kernels.shape[1], 2), strides=(down * row, row, column),
                          writeable=False)
        out[phase::up] = np.einsum('mtc,t->mc', view, kernels[phase])
    return out


RESAMPLE_HALF, RESAMPLE_BETA = 16, 8.0


@functools.lru_cache(maxsize=8)
def resampler(rate):
    """(up, down, one Kaiser-windowed sinc kernel per output phase) for `rate` to SAMPLE_RATE."""
    import numpy as np
    from fractions import Fraction

    ratio = Fraction(SAMPLE_RATE, rate)                    # 160 / 147 from 44.1 kHz
    up, down = ratio.numerator, ratio.denominator
    cutoff = min(1.0, up / down)
    taps = np.arange(-RESAMPLE_HALF + 1, RESAMPLE_HALF + 1)
    kernels = np.zeros((up, taps.size), dtype=np.float32)
    for phase in range(up):
        offset = ((phase * down) % up) / up                # the same for every sample of this phase
        x = taps - offset
        window = np.i0(RESAMPLE_BETA * np.sqrt(np.clip(1.0 - (x / RESAMPLE_HALF) ** 2, 0.0, 1.0))) / np.i0(RESAMPLE_BETA)
        kernel = cutoff * np.sinc(cutoff * x) * window
        kernels[phase] = (kernel / kernel.sum()).astype(np.float32)
    return up, down, kernels


def window_48k(path, start, span):
    """Seconds `start` to `start + span` of a wav file at SAMPLE_RATE: the same samples as that stretch
    of `to_48k` over the whole file, without converting the whole file.

    The read starts and ends on a multiple of the resampler's block (`down` input samples) with
    enough whole blocks to spare either side for the filter's 17-sample reach, so the filter sees what it would see in the whole file; the
    spare is cut off after. Shorter than `span` where the file ends."""
    a, n = int(round(start * SAMPLE_RATE)), int(round(span * SAMPLE_RATE))
    with soundfile.SoundFile(str(path)) as handle:
        rate, length = handle.samplerate, handle.frames
        if rate == SAMPLE_RATE:
            first, offset = max(0, min(length, a)), 0
            count = max(0, min(length, a + n) - first)
        else:
            up, down, _ = resampler(rate)
            spare = -(-(RESAMPLE_HALF + 1) // down) + 1        # whole blocks covering the filter's reach, and one more
            block = max(0, a // up - spare)
            first = block * down
            last = min(length, (-(-(a + n) // up) + spare) * down)
            count, offset = max(0, last - first), a - block * up
        handle.seek(min(first, length))
        audio = handle.read(count, dtype='float32', always_2d=True)
    out = to_48k(audio, rate)
    return out[offset:offset + n] if rate != SAMPLE_RATE else out


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


LAYER_DEFAULT = {'oct': 0, 'db': -6}
LAYER_LIMITS = {'oct': (-1, 1), 'db': (-12, 0)}


def clean_layer(value, name, known):
    """A track's `layer` ({kit, oct, db}, SPEC v24) cleaned, or None. The page's `cleanLayer` is the same rule:
    an unknown kit drops the layer; oct and db are whole numbers clamped to their range, anything that is not a
    number takes the default; the vocal never has one and the drums have no octave."""
    if name == 'vocals' or not isinstance(value, dict) or not isinstance(value.get('kit'), str) or value['kit'] not in known:
        return None
    out = {'kit': value['kit']}
    for key, (low, high) in LAYER_LIMITS.items():
        number = value.get(key)
        if isinstance(number, bool) or not isinstance(number, (int, float)) or not math.isfinite(number):
            number = LAYER_DEFAULT[key]
        out[key] = max(low, min(high, int(math.floor(number + 0.5))))     # rounds halves up, as Math.round
    if name == 'drums':
        out['oct'] = 0
    return out


def layer_notes(played, name, octave):
    """The notes a track's layer plays: that track's notes as already shaped, moved by whole octaves (drums are
    not moved). Notes that land outside 0–127 are left out. Returns (score, how many were left out)."""
    notes, dropped = [], 0
    for note in played.notes:
        if track_of(note.route) != name:
            continue
        pitch = note.pitch if (note.is_drum or name == 'drums') else note.pitch + 12 * octave
        if not 0 <= pitch <= 127:
            dropped += 1
            continue
        notes.append(dataclasses.replace(note, pitch=pitch))
    return dataclasses.replace(played, notes=tuple(notes)), dropped


# --- the project pack (SPEC v25): what any DAW can take, no DAW's own project format ---------------------
PACK_ORDER = ('drums', 'bass', 'guitar', 'piano', 'other', 'vocals')
PACK_ZH = {'drums': '鼓', 'bass': '贝斯', 'guitar': '吉他', 'piano': '钢琴', 'other': '其他', 'vocals': '人声'}
PACK_KEYS = (('oct', '八度'), ('vel', '力度'), ('gate', '长短'), ('late', '前后'), ('loose', '松紧'), ('thin', '疏密'),
             ('tone', '明暗'), ('echo', '回声'), ('room', '混响'))
PACK_TICKS = 960                                   # ticks per second: 480 a beat at a fixed 120 BPM, like merged.mid
PACK_DRUM_SECONDS = 0.1                            # drum notes carry no length in the score


def pack_midi(notes, name, drums):
    """One instrument of `notes` (studio Notes, seconds) as a standard MIDI file: 120 BPM, 4/4, 480 ticks a beat.
    Starts and lengths are each rounded to the nearest tick (≤ half a tick off); drums go on channel 10 at 0.1 s.
    Notes outside 0–127 cannot be written and are left out. One MIDI track cannot hold two notes of the same
    pitch sounding at once (the note-offs pair up with either note-on), so where they overlap the earlier note
    ends where the later one starts, and two that start on the same tick become one (the longer).
    Returns (PrettyMIDI, {'skipped', 'shortened', 'merged'}).
    The track name is plain ASCII ('bass - hoover'): a MIDI text event has no character set, and a DAW that
    guesses wrong shows anything else as garbage."""
    import pretty_midi
    midi = pretty_midi.PrettyMIDI(resolution=480, initial_tempo=120.0)
    midi.time_signature_changes.append(pretty_midi.TimeSignature(4, 4, 0.0))
    part = pretty_midi.Instrument(program=0, is_drum=drums, name=name.encode('ascii', 'replace').decode('ascii'))
    counts = {'skipped': 0, 'shortened': 0, 'merged': 0}
    by_pitch = {}
    for note in notes:
        if not 0 <= note.pitch <= 127:
            counts['skipped'] += 1
            continue
        start = int(round(note.start * PACK_TICKS))
        length = max(1, int(round((PACK_DRUM_SECONDS if drums else note.duration) * PACK_TICKS)))
        by_pitch.setdefault(int(note.pitch), []).append([start, start + length, max(1, min(127, int(note.velocity)))])
    for pitch, rows in by_pitch.items():
        rows.sort(key=lambda row: (row[0], -row[1]))
        kept = []
        for row in rows:
            if kept and row[0] == kept[-1][0]:
                kept[-1][1] = max(kept[-1][1], row[1])
                counts['merged'] += 1
                continue
            if kept and row[0] < kept[-1][1]:
                kept[-1][1] = row[0]
                counts['shortened'] += 1
            kept.append(row)
        for start, end, velocity in kept:
            part.notes.append(pretty_midi.Note(velocity=velocity, pitch=pitch, start=start / PACK_TICKS, end=end / PACK_TICKS))
    part.notes.sort(key=lambda n: (n.start, n.pitch))
    midi.instruments.append(part)
    return midi, counts


def write_pack(folder, title, preset, tracks, applied, pump, layers, mix, factor, played, stacked, sung, voice, record):
    """The project pack's files in `folder` (already unique): the mix, one wav per sounding track padded to the mix's
    length, one MIDI per swapped track that has notes (and one per sounding layer), the plan and a note to read.
    Returns (files, per-MIDI counts)."""
    import datetime
    import json

    import numpy as np

    folder.mkdir(parents=True)
    frames = len(mix)
    files, midis = [], {}
    path = folder / '00 混音.wav'
    soundfile.write(str(path), mix * factor, SAMPLE_RATE, subtype='PCM_24')
    files.append(str(path))
    lines_files = ['  00 混音.wav — 整首混音（和普通导出的混音同一份）']
    for index, name in enumerate(PACK_ORDER, 1):
        if name not in layers:
            continue
        tag = f'{index:02d} {PACK_ZH[name]} {name}'
        audio = np.zeros((frames, 2), dtype=np.float32)
        audio[:len(layers[name])] = layers[name]
        path = folder / f'{tag}.wav'
        soundfile.write(str(path), audio * factor, SAMPLE_RATE, subtype='PCM_24')
        files.append(str(path))
        lines_files.append(f'  {tag}.wav — {PACK_ZH[name]}这条轨的全部声音（含叠层、抽吸、明暗 / 回声 / 混响、音量）')
    for index, name in enumerate(PACK_ORDER, 1):
        choice = tracks[name]
        if name not in layers or choice['mode'] != 'swap' or (name == 'vocals' and sung):
            continue
        tag, kit = f'{index:02d} {PACK_ZH[name]} {name}', choice['kit'] or preset
        mine = [note for note in played.notes if track_of(note.route) == name]
        if mine:
            label = sample_label(choice['sample'], kit) if choice.get('sample') else kit     # SPEC v26: 'bass - sample'
            midi, counts = pack_midi(mine, f'{name} - {label}', name == 'drums')
            path = folder / f'{tag}.mid'
            midi.write(str(path))
            files.append(str(path))
            midis[path.name] = {'notes': len(midi.instruments[0].notes), **counts}
            lines_files.append(f'  {tag}.mid — {PACK_ZH[name]}调整之后的音符（干的，{sample_words(choice["sample"], kit) if choice.get("sample") else kit}）')
        extra = stacked.get(name)
        if extra and extra['audio'] is not None:
            part, _ = layer_notes(played, name, extra['layer']['oct'])
            midi, counts = pack_midi(part.notes, f'{name} - layer {extra["layer"]["kit"]}', name == 'drums')
            path = folder / f'{tag}.叠层.mid'
            midi.write(str(path))
            files.append(str(path))
            midis[path.name] = {'notes': len(midi.instruments[0].notes), **counts}
            lines_files.append(f'  {tag}.叠层.mid — {PACK_ZH[name]}叠层的音符（已移八度，{extra["layer"]["kit"]}）')
    path = folder / '方案.json'
    path.write_text(json.dumps(record, ensure_ascii=False, indent=1), encoding='utf-8')
    files.append(str(path))
    lines_files += ['  方案.json — 用了什么（和普通导出写的方案一样）', '  说明.txt — 这个文件']

    rows = []
    for name in PACK_ORDER:
        choice, sound = tracks[name], applied[name]
        if choice['mode'] == 'mute':
            rows.append(f'  {PACK_ZH[name]}：静音')
            continue
        if name == 'vocals' and sung:
            said = ['原声' if (voice or 'original') == 'original' else f'换 · 声音 {voice}']
            done = next((row.get('treat') for row in record.get('written', []) if row['track'] == 'vocals'), None)
            if done and done != 'none':
                from studio import vocalfx
                said.append(f'处理 {vocalfx.NAMES[done]}')               # SPEC v27
        elif choice['mode'] == 'orig':
            said = ['原声']
        elif choice.get('sample'):
            said = ['换', sample_words(choice['sample'], choice['kit'] or preset)]
        else:
            said = ['换', choice['kit'] or preset]
        extra = stacked.get(name)
        if extra:
            octave = {1: ' 高八度', -1: ' 低八度'}.get(extra['layer']['oct'], '')
            said.append(f'叠层 {extra["layer"]["kit"]}{octave} {extra["layer"]["db"]} dB'.replace('-', '−'))
        numbers = ' '.join(f'{zh} {sound[key]}' for key, zh in PACK_KEYS if sound.get(key))
        if numbers:
            said.append(numbers.replace('-', '−'))
        said.append(f'音量 {float(choice.get("db") or 0.0):g} dB'.replace('-', '−'))
        if name not in layers:
            said.append('没出声')
        rows.append(f'  {PACK_ZH[name]}：' + ' · '.join(said))
    if pump['depth']:
        rows.append(f'  抽吸：深度 {pump["depth"]}，恢复 {pump["release"]} 毫秒')
    fixed = [f'{file}：{c["shortened"]} 个截短' + (f'、{c["merged"]} 个并掉' if c['merged'] else '') + (f'、{c["skipped"]} 个超出音域没写' if c['skipped'] else '')
             for file, c in midis.items() if c['shortened'] or c['merged'] or c['skipped']]
    text = '\n'.join([
        f'XLR 工程包 · {title}',
        f'预设：{preset}',
        f'导出时间：{datetime.datetime.now().strftime("%Y-%m-%d %H:%M")}',
        '',
        '文件夹里有：',
        *lines_files,
        '',
        '每条轨：',
        *rows,
        '',
        '怎么拖进编曲软件：',
        '  所有 wav 都从 0 秒开始、一样长（48 kHz、24 位），都拖到工程最开头就对齐；把它们加在一起就是混音。',
        '  MIDI 按固定 120 BPM、4/4 写（每拍 480 tick，时间取到最近的 tick，差不到 0.6 毫秒）：先把工程速度设成 120，再拖进来，音符才和 wav 对得上。',
        '  这和 XLD 转谱出来的 merged.mid 是同一个约定：小节线是假的，不代表这首歌真实的拍子。',
        '  MIDI 是干的音符：疏密、八度、力度、长短、前后、松紧都已经算进去；明暗、回声、混响、抽吸、音量只在 wav 里。',
        '  鼓的 MIDI 在第 10 通道，每个音一律 0.1 秒；别的 MIDI 的乐器号都是 0，用什么音色看轨道名。',
        '  MIDI 里的轨道名是英文（如 bass - hoover、bass - layer wobble），避免编曲软件显示乱码；文件名照旧中英都有。',
        *(['  同一个音高的两个音叠在一起时，MIDI 的一条轨放不下（关音会对不上），所以前一个音截到后一个音开始，同一刻开始的两个合成一个：',
            *[f'    {line}' for line in fixed]] if fixed else []),
        '',
    ])
    path = folder / '说明.txt'
    path.write_text(text, encoding='utf-8-sig')
    files.append(str(path))
    return files, midis


def plan_tracks(plan, known, samples_dir=None, lost=None):
    """A plan, cleaned: (tracks, preset, pump). `known` is the kit names. Used by `rebuild` and `/api/shapecheck`.

    A track's own sample (SPEC v26) is checked by `samples.clean`; with `samples_dir` it is also dropped when its
    file is not there, and `lost` (a dict) gets track -> one sentence for each such track. Without `samples_dir`
    the files are not looked at."""
    from studio import samples
    if not known:
        raise ValueError('音色库是空的')
    plan = plan if isinstance(plan, dict) else {}
    tracks = {name: dict(mode='swap', kit=None, db=0.0, solo=False) for name in TRACKS}
    for name, choice in (plan.get('tracks') or {}).items():
        if name in tracks and isinstance(choice, dict):
            tracks[name].update({k: v for k, v in choice.items()
                                 if k in ('mode', 'kit', 'db', 'solo') or k in effects.DEFAULTS
                                 or (name == 'vocals' and k in ('follow', 'treat')) or (name != 'vocals' and k in ('layer', 'sample'))})
    # A plan can come from a file someone edited or from an older studio: whatever in it does
    # not make sense falls back to the default instead of failing the whole export.
    for name, choice in tracks.items():
        layer = clean_layer(choice.pop('layer', None), name, known)
        if layer:
            choice['layer'] = layer                      # kept whatever the mode; it only sounds on a swapped track
        if choice['mode'] not in ('orig', 'swap', 'mute'):
            choice['mode'] = 'swap'
        if choice['kit'] not in known:
            choice['kit'] = None
        try:
            choice['db'] = max(-60.0, min(12.0, float(choice['db'] or 0.0)))
        except (TypeError, ValueError):
            choice['db'] = 0.0
        choice.update(effects.settings(choice))
    # The vocal's tone, echo and room come from the whole-song preset while it follows (SPEC v15);
    # the plan keeps its own numbers and the flag, the report says what was applied.
    tracks['vocals']['follow'] = effects.follows(tracks['vocals'])
    # SPEC v27: the vocal's second tier; written only when it does not follow the preset.
    treat = effects.clean_treat(tracks['vocals'].pop('treat', None))
    if treat is not None:
        tracks['vocals']['treat'] = treat
    preset = plan.get('preset') if plan.get('preset') in known else known[0]
    for name, choice in tracks.items():
        sample = samples.clean(choice.pop('sample', None), name)
        if sample and samples_dir is not None and samples.path_of(samples_dir, sample['id']) is None:
            if lost is not None:
                lost[name] = f'{PACK_ZH[name]} 的采样 {sample["name"]} 找不到了，用回 {choice["kit"] or preset}'
            sample = None                                 # back to the kit it had (SPEC v26 §3)
        if sample:
            choice['sample'] = sample                     # kept whatever the mode; it only sounds on a swapped track
    return tracks, preset, effects.pump_settings(plan.get('pump'))


def sample_notes(played, name):
    """Only the notes of one track: what its sample kit plays."""
    return dataclasses.replace(played, notes=tuple(note for note in played.notes if track_of(note.route) == name))


def sample_label(sample, kit):
    """How a track's sample is named where only ASCII will do (a MIDI track name): 'sample', 'hoover + sample kick'."""
    return f'{kit} + sample {sample["part"]}' if 'part' in sample else 'sample'


def sample_words(sample, kit):
    """The same in words (说明.txt): 「采样 x.wav（A2，−3.2 dB）」 or 「鼓 hoover，底鼓换成采样 x.wav」."""
    from studio import samples
    if 'part' in sample:
        return f'鼓 {kit}，{samples.PART_ZH[sample["part"]]}换成采样 {sample["name"]}'
    note, _ = samples.note_of(sample['root'])
    return f'采样 {sample["name"]}（{note}，{format(sample["db"], "g").replace("-", "−")} dB）'


def shaped_notes(score, tracks):
    """The score as the kits play it: the note controls of the tracks a kit plays, and only those
    (a kept stem's track is rendered as written, because that render is what its level is measured against)."""
    return effects.shape(score, {name: tracks[name] for name in TRACKS if tracks[name]['mode'] == 'swap'}, track_of)


def rebuild(midi_path, plan, out_dir, kits_dir, stems=None, vocal=None, voice='', write_tracks=False,
            min_duration=MIN_DURATION, peak_db=-1.0, progress=None, listen_path=None, pack=False, samples_dir=None,
            treat_vocal=None):
    """Write one rebuild of a song: every track kept, replaced or silent, as `plan` says (SPEC v5).

    `plan` is `{'preset': kit, 'tracks': {track: {'mode': 'orig' | 'swap' | 'mute', 'kit': kit or None,
    'db': float, 'solo': bool, and the five numbers of `effects.DEFAULTS`}}}`; the vocal entry may
    also carry `follow` (`effects.vocal_settings`, SPEC v15). `stems` maps a track to its separated wav, for the tracks kept
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
    known = sorted(p.parent.name for p in Path(kits_dir).glob('*/kit.json'))
    lost = {}                                            # SPEC v26: a sample whose file is gone, said in words
    # Without a samples folder no sample can be found, so each one is reported lost and the track plays its kit.
    tracks, preset, pump = plan_tracks(plan, known, samples_dir=Path(samples_dir) if samples_dir is not None else Path(kits_dir) / '.none',
                                       lost=lost)
    applied = {name: tracks[name] for name in TRACKS}
    applied['vocals'] = effects.vocal_settings(tracks['vocals'], preset)
    stems = stems or {}
    soloed = [name for name in TRACKS if tracks[name].get('solo')]
    sounding = lambda name: tracks[name]['mode'] != 'mute' and (not soloed or name in soloed)
    sung = vocal is not None and tracks['vocals']['mode'] in ('orig', 'swap')
    # SPEC v27: a sung vocal's second tier. `treat_vocal(name, note)` gives the treated vocal at the same level as
    # `vocal` (the caller reads the cached file, making it first if it has to); without one the vocal stays as it is.
    treat = effects.vocal_treat(tracks['vocals'], preset) if sung else None
    if sung and treat != 'none' and treat_vocal is not None:
        vocal = treat_vocal(treat, lambda text: say(0.02, text))

    # Every kit that plays a track, and the preset as the level reference for kept stems.
    wanted = {preset}
    for name in TRACKS:
        if tracks[name]['mode'] == 'swap' and not (name == 'vocals' and sung) and 'root' not in (tracks[name].get('sample') or {}):
            wanted.add(tracks[name]['kit'] or preset)    # a pitched track with its own sample does not need its kit
    played = shaped_notes(score, tracks)
    kicks = effects.kick_times(played)                   # the pump follows the kicks as they are played (SPEC v20)
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
    # A layer (SPEC v24): the track's own shaped notes, moved, played by a second kit; only these notes are rendered.
    stacked = {}
    for name in TRACKS:
        layer = tracks[name].get('layer')
        if not layer or name == 'vocals' or tracks[name]['mode'] != 'swap':
            continue
        if not any(track_of(note.route) == name for note in played.notes):
            continue                                      # no transcription: nothing for either layer to play
        part, dropped = layer_notes(played, name, layer['oct'])
        say(0.55, f'{name} · 叠层 {layer["kit"]}')
        audio, done, cut = None, 0, 0
        if part.notes:
            result = render(part, load_kit(Path(kits_dir) / layer['kit'] / 'kit.json', sample_rate=SAMPLE_RATE))
            for route in result.stems:
                audio = result.stereo_stem(route) if audio is None else audio + result.stereo_stem(route)
            done, cut = result.rendered, result.truncated
        stacked[name] = {'audio': audio, 'layer': layer, 'rendered': done, 'truncated': cut, 'dropped': dropped}
    # A track's own sample (SPEC v26): an ordinary kit.json written for it, loaded and rendered as any kit is,
    # over this track's shaped notes only.
    sampled = {}
    for name in TRACKS:
        sample = tracks[name].get('sample')
        if not sample or name == 'vocals' or tracks[name]['mode'] != 'swap':
            continue
        part = sample_notes(played, name)
        if not part.notes:
            continue
        import tempfile
        from studio import samples
        base = tracks[name]['kit'] or preset
        say(0.57, f'{name} · 采样 {sample["name"]}')
        with tempfile.TemporaryDirectory() as scratch:
            path = Path(scratch) / 'kit.json'
            routes = sorted(route for route in score.routes if track_of(route) == name)
            path.write_text(json.dumps(samples.kit_json(sample, name, routes, samples_dir, Path(kits_dir) / base),
                                       ensure_ascii=False), encoding='utf-8')
            result = render(part, load_kit(path, sample_rate=SAMPLE_RATE))
        audio = None
        for route in result.stems:
            audio = result.stereo_stem(route) if audio is None else audio + result.stereo_stem(route)
        sampled[name] = {'audio': audio, 'how': sample_label(sample, base), 'rendered': result.rendered,
                         'truncated': result.truncated}

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
        choice, sound = tracks[name], applied[name]
        gain = 10.0 ** (float(choice.get('db') or 0.0) / 20.0)
        if name == 'vocals' and sung:
            audio, how = np.repeat(np.asarray(vocal, dtype=np.float32)[:, None], 2, axis=1), voice or 'original'
        elif choice['mode'] == 'orig' and name in originals:
            audio, how = originals[name] * factors.get(name, spare), 'orig'
        elif name in sampled and sampled[name]['audio'] is not None:
            audio, how = sampled[name]['audio'], sampled[name]['how']
        elif name in sampled or (choice['mode'] == 'swap' and 'root' in (choice.get('sample') or {})):
            audio, how = None, 'empty'                           # its sample had nothing to play
        elif choice['mode'] == 'swap' and name in rendered[choice['kit'] or preset]:
            audio, how = rendered[choice['kit'] or preset][name], choice['kit'] or preset
        elif name in stacked and stacked[name]['audio'] is not None:
            audio, how = None, choice['kit'] or preset          # only the layer sounds (the main kit has nothing for this track)
        else:
            audio, how = None, 'mute' if choice['mode'] == 'mute' else 'empty'
        extra = stacked.get(name)
        if extra and extra['audio'] is not None:
            # Added before anything else this track goes through: the pump, tone / echo / room and the level are shared.
            top = extra['audio'] * np.float32(10.0 ** (extra['layer']['db'] / 20.0))
            if audio is None:
                audio = top
            else:
                both = np.zeros((max(len(audio), len(top)), 2), dtype=np.float32)
                both[:len(audio)] += audio
                both[:len(top)] += top
                audio = both
        report.append({'track': name, 'mode': choice['mode'], 'by': how, 'db': float(choice.get('db') or 0.0),
                       'sounding': audio is not None and sounding(name),
                       'emptyStem': how == 'orig' and name in level_notes['empty'],
                       **({'follow': choice['follow']} if name == 'vocals' else {}),
                       **({'treat': treat} if name == 'vocals' and treat is not None else {}),
                       **({'layer': extra['layer'], 'layerRendered': extra['rendered'], 'layerTruncated': extra['truncated'],
                           'layerDropped': extra['dropped']} if extra else {}),
                       **({'sample': choice['sample'], 'sampleRendered': sampled[name]['rendered'],
                           'sampleTruncated': sampled[name]['truncated']} if name in sampled else {}),
                       **({'sampleLost': lost[name]} if name in lost else {}),
                       **{key: sound[key] for key in effects.DEFAULTS if sound[key]}})
        if audio is not None and sounding(name):
            if sound['tone'] or sound['echo'] or sound['room']:
                say(0.82, f'{name} · 效果')
            audio = audio * gain
            if pump['depth'] and name in effects.PUMPED and kicks:
                # before tone / echo / room, so the room rings through the dip
                audio = audio * effects.pump_envelope(kicks, len(audio), pump['depth'], pump['release'])[:, None]
            layers[name] = effects.apply(audio, sound)

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
                       'seconds': frames / SAMPLE_RATE, 'sampleNotes': list(lost.values())}
    if pack:
        # SPEC v25: everything goes into one new folder; nothing is written beside it.
        folder = unique(out_dir / f'{midi_path.stem}.{preset}.工程包')
        record = {'preset': preset, 'tracks': tracks, 'voice': voice if sung else '',
                  **({'pump': pump} if pump['depth'] else {}), 'written': report}
        files, midis = write_pack(folder, midi_path.stem, preset, tracks, applied, pump, layers, mix, factor, played,
                                  stacked, sung, voice, record)
        say(1.0, '完成')
        return score, {'files': files, 'folder': str(folder), 'midi': midis, 'tracks': report, 'kits': notes,
                       'factor': factor, 'seconds': frames / SAMPLE_RATE, 'sampleNotes': list(lost.values())}
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
                                     **({'pump': pump} if pump['depth'] else {}),
                                     'written': report}, ensure_ascii=False, indent=1), encoding='utf-8')
    files.append(str(plan_path))
    say(1.0, '完成')
    return score, {'files': files, 'tracks': report, 'kits': notes, 'factor': factor,
                   'seconds': frames / SAMPLE_RATE, 'sampleNotes': list(lost.values())}


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
