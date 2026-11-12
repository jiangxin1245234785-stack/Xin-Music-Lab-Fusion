"""The songs XLD has already analysed, so the studio can open one with a click (SPEC v3).

Read-only: this module only lists and reads under XLD's analysis folders, never writes
there. A song is a folder with a `track.json`; it is listed when it has a merged MIDI.

    runtime/0.5.0/envs/basic/python.exe source/memesynth/studio/library.py

prints what the studio would list.
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
#: XLD's own default (core/analysis-service.cjs); XLD_ANALYSIS_ROOT overrides it.
DEFAULT_ROOT = Path(r"D:\Caches\Xin's Local Deck\Analysis")
#: The separated stems XLD writes for one run, by the name the studio's tracks use.
STEMS = ('drums', 'bass', 'guitar', 'piano', 'other', 'vocals')


def roots(extra=()):
    """(label, folder) for every place songs may be: XLD's library first, then copies in this repo."""
    found = [('XLD 曲库', Path(os.environ.get('XLD_ANALYSIS_ROOT') or DEFAULT_ROOT))]
    found += [(f'另加 · {Path(folder).name}', Path(folder)) for folder in extra]
    for copy in sorted((REPO / 'artifacts').glob('*/analysis')):
        found.append(('实验副本', copy))
    return found


def newest(paths):
    paths = [p for p in paths if p.is_file()]
    return max(paths, key=lambda p: p.stat().st_mtime) if paths else None


def read_song(folder: Path, where: str):
    """One song folder as the page lists it, or None when it has no merged MIDI yet."""
    track = json.loads((folder / 'track.json').read_text(encoding='utf-8'))
    midi = newest(folder.glob('midi/merged/*/merged.mid'))
    if midi is None:
        return None
    # The separation run XLD points at, or failing that the newest folder that holds a stem.
    run_dir = None
    manifest = folder / 'stems.json'
    if manifest.is_file():
        run = json.loads(manifest.read_text(encoding='utf-8')).get('runId') or ''
        if run and (folder / 'stems' / run).is_dir():
            run_dir = folder / 'stems' / run
    if run_dir is None:
        found = newest(p for name in STEMS for p in folder.glob(f'stems/*/{name}.wav'))
        run_dir = found.parent if found else None
    # Its stems are the tracks the studio can keep as they are; the vocal is one of them.
    stems = {name: str(run_dir / f'{name}.wav') for name in STEMS
             if run_dir is not None and (run_dir / f'{name}.wav').is_file()}
    vocal = Path(stems['vocals']) if 'vocals' in stems else None
    return {
        'key': hashlib.sha1(str(folder.resolve()).encode('utf-8')).hexdigest()[:12],
        'trackId': track.get('trackId') or folder.name,
        'title': track.get('title') or folder.name.rsplit('__', 1)[0],
        'artist': track.get('artist') or '', 'album': track.get('album') or '',
        'number': track.get('number') or 0, 'where': where,
        'midi': str(midi), 'vocal': str(vocal) if vocal else None, 'stems': stems,
    }


def scan(extra=()):
    """Every listable song, the folders looked in, and how many song folders could not be read.

    The same track in two places is listed once, from the first place that has it (XLD's
    own library comes first)."""
    songs, seen, looked, skipped = [], set(), [], 0
    for where, root in roots(extra):
        count = 0
        if root.is_dir():
            for manifest in sorted(root.glob('*/*/track.json')):
                try:
                    song = read_song(manifest.parent, where)
                except (OSError, ValueError):
                    skipped += 1
                    continue
                if song is None or song['trackId'] in seen:
                    continue
                seen.add(song['trackId'])
                songs.append(song)
                count += 1
        looked.append({'label': where, 'path': str(root), 'found': root.is_dir(), 'songs': count})
    songs.sort(key=lambda s: (s['vocal'] is None, s['artist'].lower(), s['album'].lower(), s['number'], s['title'].lower()))
    return songs, looked, skipped


def main():
    songs, looked, skipped = scan()
    for place in looked:
        print(f"  {place['label']}：{place['songs']} 首" + ('' if place['found'] else '（目录不存在）') + f"  {place['path']}")
    if skipped:
        print(f'  有 {skipped} 个歌曲目录读不了，跳过')
    for song in songs:
        print(f"  {song['key']}  {'人声' if song['vocal'] else '    '}  {song['artist']} · {song['album']} · {song['title']}  [{song['where']}]")
    return 0


if __name__ == '__main__':
    sys.exit(main())
