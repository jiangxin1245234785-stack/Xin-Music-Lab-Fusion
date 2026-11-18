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
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
if str(HERE.parent) not in sys.path:            # run as a script, `studio` is not importable yet
    sys.path.insert(0, str(HERE.parent))

from studio import xld_stems  # noqa: E402
#: XLD's own default (core/analysis-service.cjs); XLD_ANALYSIS_ROOT overrides it.
DEFAULT_ROOT = Path(r"D:\Caches\Xin's Local Deck\Analysis")
#: The separated stems XLD writes for one run, by the name the studio's tracks use.
STEMS = ('drums', 'bass', 'guitar', 'piano', 'other', 'vocals')
COVER_NAMES = ('cover.jpg', 'cover.jpeg', 'cover.png', 'folder.jpg', 'folder.png', 'front.jpg', 'front.png')


def roots(extra=()):
    """(label, folder) for every place songs may be: XLD's library first, then copies in this repo."""
    analysis_root = os.environ.get('XLD_ANALYSIS_ROOT') or configured_root('analysisRoot') or DEFAULT_ROOT
    found = [('XLD 曲库', Path(analysis_root))]
    found += [(f'另加 · {Path(folder).name}', Path(folder)) for folder in extra]
    for copy in sorted((REPO / 'artifacts').glob('*/analysis')):
        found.append(('实验副本', copy))
    return found


def newest(paths):
    paths = [p for p in paths if p.is_file()]
    return max(paths, key=lambda p: p.stat().st_mtime) if paths else None


def album_info(directory):
    """XML names a release from its folder, independently of each track's artist tag."""
    artist, separator, album = directory.name.partition(' - ')
    return (artist.strip() if separator and artist.strip() else 'Unknown Artist',
            album.strip() if separator and album.strip() else directory.name)


def find_cover(directory):
    """Look for exactly the same sidecar images as XML, in its preference order."""
    # Covers come from local album folders only. A missing or offline source does not hide the MIDI.
    if not directory or str(directory).startswith(('\\\\', '//')):
        return None
    try:
        with os.scandir(directory) as entries:
            covers = {entry.name.lower(): Path(entry.path) for entry in entries
                      if entry.name.lower() in COVER_NAMES and entry.is_file(follow_symlinks=False)}
        return next((covers[name] for name in COVER_NAMES if name in covers), None)
    except OSError:
        return None


def number_of(track):
    try:
        return max(0, int(str(track.get('number') or '').partition('/')[0]))
    except ValueError:
        return 0


def configured_root(name):
    """Read the XLD settings used by the XML launcher, including a development release's own profile."""
    releases = REPO / 'releases'
    app_data = Path(os.environ['APPDATA']) if os.environ.get('APPDATA') else None
    settings_name = Path("Xin's Local Deck Beta") / 'settings.json'
    candidates = []
    try:
        pointer = (releases / 'current-release.cmd').read_text(encoding='utf-8-sig')
        match = re.search(r'XIN_CURRENT_RELEASE=([A-Za-z0-9][A-Za-z0-9._-]*)"', pointer)
        if match:
            version = match[1]
            seed = releases / version / 'development-settings.json'
            if seed.is_file():
                if app_data:
                    candidates.append(app_data / 'XinMusicDevelopment' / version / settings_name)
                candidates.append(seed)
            elif app_data:
                runtime = json.loads((releases / version / 'runtime.json').read_text(encoding='utf-8-sig'))
                if runtime.get('channel') == 'preview':
                    candidates.append(app_data / 'XinMusicPreview' / settings_name)
    except (OSError, ValueError):
        pass
    if app_data:
        candidates.append(app_data / settings_name)
    for candidate in candidates:
        try:
            config = json.loads(candidate.read_text(encoding='utf-8-sig'))
            location = config.get(name) if isinstance(config, dict) else None
            if isinstance(location, str) and Path(location).is_absolute():
                return Path(location)
        except (OSError, ValueError):
            continue
    return None


def read_song(folder: Path, where: str):
    """One song folder as the page lists it, or None when it has no merged MIDI yet."""
    track = json.loads((folder / 'track.json').read_text(encoding='utf-8'))
    midi = newest(folder.glob('midi/merged/*/merged.mid'))
    if midi is None:
        return None
    # The separation run XLD points at, or failing that the newest folder that holds a stem.
    # A stem is a float WAV or (since 2026-11-15) a marked 24-bit FLAC: the manifest's `file` says which.
    run_dir, listed = None, {}
    manifest = folder / 'stems.json'
    if manifest.is_file():
        run = json.loads(manifest.read_text(encoding='utf-8')).get('runId') or ''
        if run and (folder / 'stems' / run).is_dir():
            run_dir = folder / 'stems' / run
        listed = xld_stems.listed(folder)
    if run_dir is None:
        found = newest(p for name in STEMS for suffix in xld_stems.SUFFIXES for p in folder.glob(f'stems/*/{name}{suffix}'))
        run_dir = found.parent if found else None
    # Its stems are the tracks the studio can keep as they are; the vocal is one of them.
    stems = {}
    for name in STEMS:
        path = listed.get(name) or (xld_stems.find(run_dir, name) if run_dir is not None else None)
        if path is not None:
            stems[name] = str(path)
    vocal = Path(stems['vocals']) if 'vocals' in stems else None
    source = track.get('source')
    path = Path(source) if isinstance(source, str) and source else None
    album_dir = path.parent if path and path.is_absolute() else None
    return {
        'key': hashlib.sha1(str(folder.resolve()).encode('utf-8')).hexdigest()[:12],
        'trackId': track.get('trackId') or folder.name,
        'title': track.get('title') or folder.name.rsplit('__', 1)[0],
        'artist': track.get('artist') or '', 'album': track.get('album') or '',
        'number': number_of(track), 'where': where,
        'albumDirectory': album_dir, 'analysisAlbum': folder.parent,
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


def albums_for(songs):
    """Index XML's folder albums using XLD's saved source paths, including loose root files."""
    music_root = configured_root('libraryRoot')
    albums = {}
    for song in songs:
        directory = song['albumDirectory'] or song['analysisAlbum']
        if directory in albums:
            continue
        loose = bool(song['albumDirectory'] and directory == music_root)
        artist, title = ('Various Artists', '单曲 · Singles') if loose else album_info(directory)
        key = str(directory) + ('::loose-singles' if loose else '')
        albums[directory] = {'id': hashlib.sha1(key.encode('utf-8')).hexdigest(), 'artist': artist, 'title': title,
                             'cover': find_cover(song['albumDirectory']) if not loose else None}
    return albums


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
