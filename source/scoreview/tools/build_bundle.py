"""Build one song's score-view model (`xin.score-view/1`, see ../MODEL.md) from the analysis root.

    <envs/basic>/python.exe -X utf8 source/scoreview/tools/build_bundle.py <pilot>
    <envs/basic>/python.exe -X utf8 source/scoreview/tools/build_bundle.py --track-dir <dir> --out <bundle.json>

Read-only on the analysis root. For every stem it takes the transcription XLD has active
right now, splits it into the timbre tracks the transcriber wrote, and folds the drums onto
memesynth's seven classes. Layers the analysis root does not hold (a pilot's sections,
chords, beat grid, vocal line, loudness, page audio) are read from the pilot's data folder,
where `make_layers.py` put them. Any layer that is missing from both places is simply left
out of the model: only `track`, `audio` and `lanes` are always there.

Two things are computed here rather than copied, both by importing XLD's own code:

* Velocity. MuScriptor and plain ADTOF write every note at one velocity, and across the
  library that is every guitar and string part and most drum parts (census.py). Those
  parts get XLD's stem-energy velocity (`analysis-midi/velocity.apply`) measured on the
  stem they were transcribed from, with the engine profile's own settings. Parts whose
  model predicts velocity keep it.
* Chords. Every chord engine's result goes through XML's provider adapter
  (`chord_consensus.cjs`) so the model carries the chord XML itself would show.

The health table (`health.json`, also printed) lists, layer by layer, what the model got
and why anything is missing.
"""
import argparse
import json
import subprocess
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
MIDI = REPO / 'source' / 'xld-runtime-baseline' / 'analysis-midi'
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(REPO / 'source' / 'memesynth'))     # memesynth.score: DRUM_CLASSES (read-only import)
sys.path.insert(0, str(MIDI))                               # xld analysis-midi: velocity (read-only import)

CONTRACT = 'xin.score-view/1'
#: Top to bottom on screen: the line you sing along with, then the instruments from high to
#: low, the rhythm section last.
STEM_ORDER = ['vocals', 'guitar', 'piano', 'violin', 'strings', 'bass', 'drums']
STEM_LABELS = {'vocals': '人声', 'guitar': '吉他', 'piano': '钢琴', 'violin': '小提琴', 'strings': '弦乐',
               'bass': '贝斯', 'drums': '鼓'}
TIMBRE_LABELS = {
    'acoustic guitar': '木吉他', 'clean electric guitar': '电吉他', 'distorted electric guitar': '失真吉他',
    'violin': '弦·小提琴', 'viola': '弦·中提琴', 'cello': '弦·大提琴', 'contrabass': '弦·低音提琴',
    'string ensemble': '弦·合奏', 'orchestral harp': '竖琴',
}
#: Same engine order XML's adapter walks when it picks a structure result.
STRUCTURE_PRIORITY = ['songformer', 'msaf', 'msaf-cnmf', 'msaf-sf', 'msaf-foote']
#: A part with this few distinct velocities has no dynamics of its own (census: 1 or 2).
FLAT_VELOCITIES = 4
#: Drum engines without their own `velocityFromStem` settings borrow plain ADTOF's.
DRUM_VELOCITY_PROFILE = 'drums-adtof'


def read_json(path):
    try:
        return json.loads(Path(path).read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return None


def profiles(node):
    if isinstance(node, dict):
        if 'id' in node and 'options' in node:
            yield node
        for value in node.values():
            yield from profiles(value)
    elif isinstance(node, list):
        for value in node:
            yield from profiles(value)


def normalise(name):
    """`'Clean Electric Guitar'` -> `'clean electric guitar'`, the way memesynth routes."""
    return ' '.join((name or '').strip().lower().split())


def stem_audio(track_dir, record):
    """The audio a transcription was made from: the recorded path, or the same file under this root."""
    recorded = Path((record.get('source') or {}).get('path') or '')
    if recorded.is_file():
        return recorded
    for marker in ('stems', 'refinement'):
        if marker in recorded.parts:
            moved = track_dir.joinpath(*recorded.parts[recorded.parts.index(marker):])
            if moved.is_file():
                return moved
    return None


def build_lanes(track_dir, health):
    """Pitched lanes and the drum lane from every stem's active transcription."""
    import pretty_midi
    import velocity
    from census import active_record
    from memesynth.score import DRUM_CLASSES, DRUM_ROUTES

    engine_profiles = {p['id']: p for p in profiles(read_json(MIDI / 'models.json'))}
    lanes = []
    midi_dir = track_dir / 'midi'
    stems = sorted((p.stem for p in midi_dir.glob('*.json') if not p.stem.endswith('-source')),
                   key=lambda s: (STEM_ORDER.index(s) if s in STEM_ORDER else len(STEM_ORDER), s)) if midi_dir.is_dir() else []
    for stem in stems:
        record, _ = active_record(track_dir, stem)
        if not record or record.get('kind') != 'midi' or not record.get('noteCount'):
            if record and record.get('kind') == 'midi':
                health['lanes'].append({'stem': stem, 'engine': record.get('engine'), 'notes': 0, 'note': '转谱结果是空的'})
            continue
        midi = pretty_midi.PrettyMIDI(str(track_dir / record['file']))
        total = sum(len(part.notes) for part in midi.instruments)
        if total != record['noteCount']:
            raise SystemExit(f'{stem}：MIDI 里 {total} 个音符，记录写的是 {record["noteCount"]}，文件和记录对不上')

        distinct = len({note.velocity for part in midi.instruments for note in part.notes})
        velocity_source = 'model'
        is_drums = stem == 'drums'
        if distinct <= FLAT_VELOCITIES:
            audio = stem_audio(track_dir, record)
            profile = engine_profiles.get(record.get('engine')) or {}
            settings = (profile.get('options') or {}).get('velocityFromStem')
            if settings is None and is_drums:
                settings = engine_profiles[DRUM_VELOCITY_PROFILE]['options']['velocityFromStem']
            if audio is None or settings is None:
                velocity_source = 'flat'
            else:
                velocity.apply(midi, audio, dict(settings), group_by_pitch=is_drums)
                velocity_source = 'stem-energy'

        if is_drums:
            hits, unknown = [], Counter()
            for part in midi.instruments:
                for note in part.notes:
                    drum_class = DRUM_CLASSES.get(note.pitch)
                    if drum_class is None:
                        unknown[note.pitch] += 1
                        continue
                    hits.append([round(float(note.start), 3), DRUM_ROUTES.index(drum_class), int(note.velocity)])
            hits.sort()
            used = Counter(DRUM_ROUTES[row] for _, row, _ in hits)
            lanes.append({'id': 'drums', 'label': STEM_LABELS['drums'], 'kind': 'drums', 'group': 'drums',
                          'rows': list(DRUM_ROUTES), 'hits': hits,
                          'meta': {'engine': record.get('engine'), 'runId': record.get('runId'), 'velocity': velocity_source}})
            health['lanes'].append({'stem': stem, 'lane': 'drums', 'engine': record.get('engine'), 'notes': len(hits),
                                    'velocity': velocity_source, 'rows': dict(used),
                                    'emptyRows': [row for row in DRUM_ROUTES if row not in used],
                                    'droppedUnknownPitches': dict(unknown)})
            continue

        parts = [part for part in midi.instruments if part.notes and not part.is_drum]
        for part in parts:
            timbre = normalise(part.name)
            split = len(parts) > 1 or (timbre and timbre != stem and timbre in TIMBRE_LABELS)
            lane_id = f'{stem}/{timbre}' if split and timbre else stem
            label = TIMBRE_LABELS.get(timbre) if split else None
            if stem == 'violin':
                label = STEM_LABELS['violin']
            notes = sorted([round(float(n.start), 3), round(float(n.end - n.start), 3), int(n.pitch), int(n.velocity)]
                           for n in part.notes)
            lanes.append({'id': lane_id, 'label': label or STEM_LABELS.get(stem, stem), 'kind': 'pitched',
                          'group': stem, 'groupLabel': STEM_LABELS.get(stem, stem), 'notes': notes,
                          'meta': {'engine': record.get('engine'), 'runId': record.get('runId'),
                                   'timbre': timbre or None, 'velocity': velocity_source}})
            health['lanes'].append({'stem': stem, 'lane': lane_id, 'engine': record.get('engine'), 'notes': len(notes),
                                    'velocity': velocity_source})
    return lanes


def build_chords(track_dir, data_dir, duration, health):
    files = sorted(track_dir.glob('chord-*.json')) + (sorted(data_dir.glob('chord-*.json')) if data_dir else [])
    files = [f for f in files if (read_json(f) or {}).get('segments')]
    if not files:
        health['chords'] = {'ok': False, 'why': '分析根和数据目录里都没有任何和弦引擎的结果'}
        return None, None
    done = subprocess.run(['node', str(HERE / 'chord_consensus.cjs'), '--duration', repr(duration), *map(str, files)],
                          capture_output=True, text=True, encoding='utf-8')
    if done.returncode:
        raise SystemExit('和弦共识失败：' + done.stderr[-2000:])
    result = json.loads(done.stdout)
    covered = sum(end - start for start, end, _, _ in result['chords'])
    health['chords'] = {'ok': True, 'engines': result['engines'], 'segments': len(result['chords']),
                        'coverage': round(covered / duration, 3), 'via': f'XML adapter {result["adapterVersion"]}',
                        'from': ['分析根' if f.parent == track_dir else '数据目录' for f in files],
                        'labelsWithoutTones': result['unparsed']}
    return result['chords'], result['tones']


def name_sections(segments, engine, duration):
    """An engine's segments as `[start, end, name, engine, raw label]`, named by section-names.json.

    Only for stage one's bench builder: NOT kept in step with XLD. The names XLD, XML and the
    score view show come from source/xld-runtime-baseline/core/sections.cjs, which also merges
    neighbours, renames mid-song intros and keeps short pieces; this function does none of that.

    Segments are clipped to the song, a few milliseconds of overlap between neighbours is
    closed, slivers shorter than `minimumSeconds` are dropped, and labels the table maps to
    nothing (silence) leave a gap. Names that occur more than once are numbered in order.
    An engine that only clusters keeps its letters as names and is not numbered.
    """
    table = read_json(HERE.parent / 'section-names.json')
    names = table['semantic'].get(engine)
    rows = []
    for segment in sorted(segments, key=lambda s: s['start']):
        start, end = max(0.0, float(segment['start'])), min(float(duration), float(segment['end']))
        raw = str(segment.get('label', '')).strip()
        if rows and start < rows[-1][1]:
            rows[-1][1] = start
        rows.append([start, end, raw])
    rows = [row for row in rows if row[1] - row[0] >= table['minimumSeconds']]
    if names is not None:
        rows = [[start, end, names.get(raw.lower(), raw), raw] for start, end, raw in rows
                if names.get(raw.lower(), raw) is not None]
        total, seen = Counter(row[2] for row in rows), Counter()
        for row in rows:
            if total[row[2]] > 1:
                seen[row[2]] += 1
                row[2] = f'{row[2]} {seen[row[2]]}'
    else:
        rows = [[start, end, raw, raw] for start, end, raw in rows if raw]
    return [[round(start, 3), round(end, 3), name, engine, raw] for start, end, name, raw in rows]


def build_sections(track_dir, data_dir, duration, health):
    for engine in STRUCTURE_PRIORITY:
        for place, folder in (('分析根', track_dir), ('数据目录', data_dir)):
            body = read_json(folder / f'{engine}.json') if folder else None
            if body and body.get('segments'):
                sections = name_sections(body['segments'], engine, duration)
                health['sections'] = {'ok': True, 'engine': engine, 'segments': len(sections), 'from': place,
                                      'names': [section[2] for section in sections]}
                return sections
    health['sections'] = {'ok': False, 'why': '没有任何段落引擎的结果'}
    return None


def build_bars(data_dir, health):
    grid = read_json(data_dir / 'beats.json') if data_dir else None
    if not grid or not grid.get('beats'):
        health['bars'] = {'ok': False, 'why': '没有节拍网格（分析根里全库都没有，要用 make_layers.py 现跑）'}
        return None
    beats = grid['beats']
    downbeats = []
    if grid.get('stable'):
        # XLD's own rule: the bar starts on the tracked beat nearest the first downbeat,
        # then every beatsPerBar beats. Beats before it are a pickup and get no bar line.
        first = min(range(len(beats)), key=lambda i: abs(beats[i] - grid['firstDownbeat']))
        downbeats = beats[first::grid['beatsPerBar']]
    health['bars'] = {'ok': bool(grid.get('stable')), 'bpm': round(grid['bpm'], 2), 'beats': len(beats),
                      'bars': len(downbeats), 'beatsPerBar': grid.get('beatsPerBar'),
                      'why': None if grid.get('stable') else '网格不稳定，按 D4 退回秒刻度：' + '；'.join(grid.get('unstableBecause', [])),
                      'measured': grid.get('measured')}
    return {'beatsPerBar': grid.get('beatsPerBar') if grid.get('stable') else None, 'bpm': round(grid['bpm'], 3),
            'beats': beats, 'downbeats': downbeats, 'steady': bool(grid.get('stable'))}


def build(track_dir, data_dir=None, overrides=None):
    track_dir = Path(track_dir)
    meta = read_json(track_dir / 'track.json')
    stems = read_json(track_dir / 'stems.json')
    if not meta:
        raise SystemExit(f'{track_dir} 里没有 track.json')
    first = (stems or {}).get('stems', [None])[0]
    duration = first['frames'] / first['sampleRate'] if first else None
    health = {'track': meta.get('title'), 'lanes': []}

    lanes = build_lanes(track_dir, health)
    vocal = read_json(data_dir / 'vocals.json') if data_dir else None
    if vocal:
        lane = dict(vocal['lane'], group='vocals', groupLabel=STEM_LABELS['vocals'],
                    meta={'engine': vocal['provenance']['pitchSource'], 'velocity': vocal['provenance']['velocity']})
        lanes.insert(0, lane)
        frames = lane['contour']['midi']
        health['vocals'] = {'ok': True, 'notes': len(lane['notes']), 'stats': vocal['stats']}
        health['contour'] = {'ok': True, 'frames': len(frames), 'voiced': sum(v is not None for v in frames),
                             'hop': lane['contour']['hop']}
    else:
        health['vocals'] = {'ok': False, 'why': '没有人声转谱（分析根里全库都没有；这首也没有配主唱分离的缓存）'}
        health['contour'] = {'ok': False, 'why': '没有逐帧音高（同上）'}
    if duration is None:
        ends = [n[0] + n[1] for lane in lanes for n in lane.get('notes', [])] + [h[0] for lane in lanes for h in lane.get('hits', [])]
        duration = max(ends, default=0.0)

    track = {'id': meta.get('trackId', ''), 'title': meta.get('title', ''), 'artist': meta.get('artist', ''),
             'album': meta.get('album', ''), 'duration': round(duration, 3)}
    track.update(overrides or {})
    health['track'] = track['title']
    health['metadata'] = {'ok': True, 'overridden': sorted((overrides or {}).keys())}

    audio_record = read_json(data_dir / 'audio.json') if data_dir else None
    audio = {'src': audio_record['file'], 'offset': audio_record['offsetSeconds']} if audio_record else {'src': '', 'offset': 0}
    health['audio'] = ({'ok': True, 'bytes': audio_record['bytes'], 'kbps': audio_record['kbps'],
                        'offsetMs': round(audio_record['offsetSeconds'] * 1000, 2)} if audio_record
                       else {'ok': False, 'why': '还没有给试听页压音频'})

    model = {'contract': CONTRACT, 'track': track, 'audio': audio, 'lanes': lanes}
    chords, tones = build_chords(track_dir, data_dir, duration, health)
    if chords:
        model['chords'] = chords
        if tones:
            model['chordTones'] = tones
    sections = build_sections(track_dir, data_dir, duration, health)
    if sections:
        model['sections'] = sections
    bars = build_bars(data_dir, health)
    if bars:
        model['bars'] = bars
    captions = read_json(data_dir / 'captions.json') if data_dir else None
    if captions:
        model['captions'] = captions['captions'] if isinstance(captions, dict) else captions
        health['captions'] = {'ok': True, 'count': len(model['captions'])}
    else:
        health['captions'] = {'ok': False, 'why': '导赏文字还不存在，A4 才写'}
    energy = read_json(data_dir / 'energy.json') if data_dir else None
    if energy:
        model['energy'] = {'hop': energy['hop'], 'db': energy['db']}
        health['energy'] = {'ok': True, 'frames': len(energy['db'])}
    else:
        health['energy'] = {'ok': False, 'why': '响度包络还没算'}
    levels = read_json(data_dir / 'levels.json') if data_dir else None
    if levels:
        model['levels'] = {'hop': levels['hop'], 'groups': levels['groups']}
    cover = read_json(data_dir / 'cover.json') if data_dir else None
    if cover:
        model['cover'] = {'src': cover['src'], 'width': cover['width'], 'height': cover['height']}
        health['cover'] = {'ok': True, 'bytes': cover.get('bytes')}
    else:
        health['cover'] = {'ok': False, 'why': '原文件旁边没有封面图片'}
    return model, health


def report(health):
    """The health table, in the order of the plan's element list."""
    mark = lambda ok: '有' if ok else '缺'
    pitched = [lane for lane in health['lanes'] if lane.get('lane') and lane['lane'] != 'drums']
    drums = next((lane for lane in health['lanes'] if lane.get('lane') == 'drums'), None)
    rows = [
        ('1 曲名/专辑/艺人', True, '手工改过：' + '、'.join(health['metadata']['overridden']) if health['metadata']['overridden'] else '取自 track.json'),
        ('2 乐器音符轨', bool(pitched), f'{len(pitched)} 条 / {sum(l["notes"] for l in pitched)} 个音符；力度现算的 '
                                    f'{sum(1 for l in pitched if l["velocity"] == "stem-energy")} 条' if pitched else '没有任何声部音符'),
        ('3 鼓轨', bool(drums), (f'{drums["notes"]} 击，{drums["engine"]}，用到 {len(drums["rows"])} 类'
                               + (f'，空着的类：{"、".join(drums["emptyRows"])}' if drums['emptyRows'] else '')) if drums else '没有鼓的转谱'),
        ('4 播放线', True, '宿主提供时钟，不是数据'),
        ('5 和弦', health['chords']['ok'], (f'{health["chords"]["segments"]} 段，{"+".join(health["chords"]["engines"])}，'
                                         f'覆盖 {health["chords"]["coverage"]:.0%}，来自{"/".join(sorted(set(health["chords"]["from"])))}')
         if health['chords']['ok'] else health['chords']['why']),
        ('6 段落', health['sections']['ok'], (f'{health["sections"]["segments"]} 段，{health["sections"]["engine"]}，来自{health["sections"]["from"]}')
         if health['sections']['ok'] else health['sections']['why']),
        ('7 小节线', health['bars']['ok'], (f'{health["bars"]["bars"]} 小节，{health["bars"]["bpm"]} BPM，{health["bars"]["beatsPerBar"]} 拍')
         if health['bars']['ok'] else health['bars']['why']),
        ('8 人声音符', health['vocals']['ok'], f'{health["vocals"]["notes"]} 个音符' if health['vocals']['ok'] else health['vocals']['why']),
        ('9 人声音高曲线', health['contour']['ok'], (f'{health["contour"]["voiced"]} 帧有音高 / 共 {health["contour"]["frames"]} 帧，10 ms 一帧')
         if health['contour']['ok'] else health['contour']['why']),
        ('10 导赏文字', health['captions']['ok'], f'{health["captions"].get("count")} 条' if health['captions']['ok'] else health['captions']['why']),
        ('11 背景（段落+响度）', health['energy']['ok'] and health['sections']['ok'],
         '段落和响度包络都有' if health['energy']['ok'] and health['sections']['ok']
         else ('响度有，段落缺' if health['energy']['ok'] else health['energy']['why'])),
    ]
    lines = [f'■ {health["track"]}']
    lines += [f'  {name:<16} {mark(ok)}  {detail}' for name, ok, detail in rows]
    for lane in health['lanes']:
        if lane.get('lane'):
            lines.append(f'      {lane["lane"]:<36} {lane["notes"]:>5}  {lane["engine"]} · 力度：{lane["velocity"]}')
        else:
            lines.append(f'      {lane["stem"]:<36}     0  {lane["engine"]} · {lane["note"]}')
    return lines, [{'layer': name, 'ok': bool(ok), 'detail': detail} for name, ok, detail in rows]


def main(argv=None):
    parser = argparse.ArgumentParser(description='从分析根生成谱面模型')
    parser.add_argument('pilot', nargs='?')
    parser.add_argument('--track-dir', type=Path)
    parser.add_argument('--data-dir', type=Path)
    parser.add_argument('--out', type=Path)
    args = parser.parse_args(argv)
    overrides = {}
    if args.pilot:
        from make_layers import load_config
        config = load_config()
        pilot = config['pilots'][args.pilot]
        track_dir = config['analysisRoot'] / pilot['trackDir']
        data_dir = config['dataRoot'] / args.pilot
        overrides = pilot.get('track') or {}
        out = args.out or data_dir / 'bundle.json'
    elif args.track_dir and args.out:
        track_dir, data_dir, out = args.track_dir, args.data_dir, args.out
    else:
        parser.error('给一个试点名，或者 --track-dir 加 --out')
    model, health = build(track_dir, data_dir, overrides)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(model, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    lines, table = report(health)
    (out.parent / 'health.json').write_text(json.dumps({'table': table, 'detail': health}, ensure_ascii=False, indent=1),
                                           encoding='utf-8')
    print('\n'.join(lines))
    print(f'  → {out}（{out.stat().st_size / 1024:.0f} KB）')
    return 0


if __name__ == '__main__':
    sys.exit(main())
