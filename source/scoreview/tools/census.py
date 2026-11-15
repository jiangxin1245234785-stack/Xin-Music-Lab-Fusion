"""Count, across the whole analysis root, which score-view layers every track really has.

    <envs/basic>/python.exe -X utf8 source/scoreview/tools/census.py [--root <analysis root>] [--json out.json]

Read-only. The plan's rule is that any claim of the form "the library has / lacks X" is
counted over every track before it is stated, so this is the script that does the counting.
It answers, per track: which stems are transcribed and by which engine, how many timbre
tracks each transcription was split into, whether the velocities carry any dynamics, which
chord and section engines have a result, and whether a beat grid or a vocal line exists.
"""
import argparse
import json
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
DEFAULT_ROOT = Path(r"D:\Caches\Xin's Local Deck\Analysis")
SKIP = {'.tmp', 'logs'}


def read_json(path):
    try:
        return json.loads(Path(path).read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return None


def track_directories(root):
    """Every `<album>/<track>` folder that holds a track.json."""
    for album in sorted(p for p in Path(root).iterdir() if p.is_dir() and p.name not in SKIP):
        for track in sorted(p for p in album.iterdir() if p.is_dir()):
            if (track / 'track.json').is_file():
                yield track


def active_record(track, stem):
    """The run record XLD treats as active for a stem, read the way `derived-assets.read` does.

    `midi/<stem>/by-source/<current source run>/active.json` wins over the flat
    `midi/<stem>.json`; the current source is the stems run, or for the bowed strings the
    refinement run named by `midi/<stem>-source.json`.
    """
    flat = read_json(track / 'midi' / f'{stem}.json')
    pointer = read_json(track / 'midi' / f'{stem}-source.json')
    stems = read_json(track / 'stems.json')
    source_run = (pointer or {}).get('runId') or (stems or {}).get('runId')
    by_source = read_json(track / 'midi' / stem / 'by-source' / str(source_run) / 'active.json') if source_run else None
    return by_source or flat, bool(by_source and flat and by_source.get('runId') != flat.get('runId'))


def midi_tracks(path):
    """[(name, is_drum, note count)] of one MIDI file, or None when it cannot be read."""
    try:
        import pretty_midi
        midi = pretty_midi.PrettyMIDI(str(path))
    except Exception:  # noqa: BLE001 - a census reports what it could not read, it does not stop
        return None
    return [(part.name, bool(part.is_drum), len(part.notes)) for part in midi.instruments if part.notes]


def census(root):
    rows = []
    for track in track_directories(root):
        meta = read_json(track / 'track.json') or {}
        row = {'dir': str(track.relative_to(root)), 'title': meta.get('title'), 'stems': {}, 'chords': [],
               'sections': [], 'beatGrid': False, 'vocalNotes': False, 'manualTags': 0}
        midi_dir = track / 'midi'
        stems = sorted(p.stem for p in midi_dir.glob('*.json') if not p.stem.endswith('-source')) if midi_dir.is_dir() else []
        for stem in stems:
            record, disagree = active_record(track, stem)
            if not record or record.get('kind') != 'midi':
                continue
            notes = read_json(track / record.get('notesFile', '')) or {}
            velocities = Counter(n.get('velocity') for n in notes.get('notes', []))
            parts = midi_tracks(track / record['file']) if record.get('file') else None
            timing = (record.get('backend') or {}).get('timing')
            row['stems'][stem] = {
                'engine': record.get('engine'), 'notes': record.get('noteCount'),
                'distinctVelocities': len(velocities),
                'velocityMode': (record.get('backend') or {}).get('velocityMode'),
                'timbreTracks': [name for name, _, _ in parts] if parts else None,
                'pointersDisagree': disagree, 'hasTiming': bool(timing),
            }
            row['beatGrid'] = row['beatGrid'] or bool(timing and timing.get('beats'))
            row['vocalNotes'] = row['vocalNotes'] or stem == 'vocals'
        for path in sorted(track.glob('chord-*.json')):
            body = read_json(path) or {}
            if body.get('segments'):
                row['chords'].append(path.stem)
        for name in ('songformer', 'msaf', 'msaf-sf', 'msaf-foote', 'msaf-cnmf'):
            body = read_json(track / f'{name}.json') or {}
            if body.get('segments'):
                row['sections'].append(name)
        bridge = read_json(track / 'music-lab.json') or {}
        row['manualTags'] = len(bridge.get('manualTags') or [])
        row['bridge'] = bool(bridge)
        rows.append(row)
    return rows


def main(argv=None):
    parser = argparse.ArgumentParser(description='清点分析根里每首歌有哪些谱面层')
    parser.add_argument('--root', type=Path, default=DEFAULT_ROOT)
    parser.add_argument('--json', type=Path, help='把明细另存为 JSON')
    args = parser.parse_args(argv)
    rows = census(args.root)
    total = len(rows)
    has = lambda test: sum(1 for row in rows if test(row))
    pitched = lambda row: [s for s in row['stems'] if s != 'drums']
    flat = lambda row: [s for s, v in row['stems'].items() if v['distinctVelocities'] <= 4]
    print(f'分析根：{args.root}')
    print(f'曲目：{total}')
    print(f'  有任一声部音符        {has(lambda r: bool(r["stems"]))} / {total}')
    print(f'  有鼓                  {has(lambda r: "drums" in r["stems"])} / {total}')
    print(f'  有和弦（任一引擎）    {has(lambda r: bool(r["chords"]))} / {total}')
    print(f'  有 ChordMini          {has(lambda r: "chord-chordmini" in r["chords"])} / {total}')
    print(f'  有段落（SongFormer）  {has(lambda r: "songformer" in r["sections"])} / {total}')
    print(f'  有段落（任一引擎）    {has(lambda r: bool(r["sections"]))} / {total}')
    print(f'  段落+和弦+≥3 个声部   {has(lambda r: r["sections"] and r["chords"] and len(r["stems"]) >= 3)} / {total}')
    print(f'  有人声音符            {has(lambda r: r["vocalNotes"])} / {total}')
    print(f'  有节拍网格            {has(lambda r: r["beatGrid"])} / {total}')
    print(f'  有人工标注            {has(lambda r: r["manualTags"] > 0)} / {total}')
    print(f'  有桥接文件            {has(lambda r: r["bridge"])} / {total}')
    print(f'  力度是平的声部（≤4 档）出现在 {has(lambda r: bool(flat(r)))} / {has(lambda r: bool(r["stems"]))} 首有音符的歌里')
    print()
    for row in rows:
        print(f'■ {row["dir"]}')
        print(f'    和弦 {row["chords"] or "—"} · 段落 {row["sections"] or "—"} · 人工标注 {row["manualTags"]}')
        for stem, value in row['stems'].items():
            timbres = value['timbreTracks']
            split = f' · {len(timbres)} 条音色轨 {timbres}' if timbres and len(timbres) > 1 else ''
            warn = ' · !两个指针不一致' if value['pointersDisagree'] else ''
            print(f'    {stem:<8} {value["engine"]:<28} {value["notes"]:>6} 音符 · 力度 {value["distinctVelocities"]:>3} 档'
                  f'（{value["velocityMode"] or "模型给的"}）{split}{warn}')
        if not row['stems']:
            print('    （没有任何声部音符）')
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')
        print(f'\n明细 → {args.json}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
