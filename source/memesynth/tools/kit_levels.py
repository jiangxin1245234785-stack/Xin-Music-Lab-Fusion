"""How loud each kit plays each track, relative to fmkeys — measured once, used by the studio.

    runtime/0.5.0/envs/basic/python.exe -X utf8 source/memesynth/tools/kit_levels.py

Re-run after any kit is rebuilt or added (`make_kits.py`). Writes `kits/levels.json`, whole.

Why: the studio plays a kept original stem at the level the preset's kit would play that track
(`studio/batch.py` `levels_from`). Measuring that takes a whole-song render, so for a preset not
measured yet the page borrows another preset's numbers for a few seconds. The borrowed number is
off by about how much louder one kit plays that track than the other, which is mostly a property
of the two kits, not of the song. This table is that difference, so the page can correct what it
borrows (SPEC v17, point 6).

Method: three real exports (the sorted `artifacts/**/merged.mid`, first 40, take the first, the
middle and the last), each rendered through every built kit; per track (drums, bass, guitar,
piano, other) the RMS over the whole song in dB minus fmkeys' RMS of the same track of the same
song; averaged over the songs where both sound. Also the spread (max minus min over the songs),
to show how constant the difference really is. Kit gains are not touched.
"""
from __future__ import annotations

import json
import math
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent                                  # source/memesynth
REPO = ROOT.parents[1]
sys.path.insert(0, str(ROOT))

TRACKS = ('drums', 'bass', 'guitar', 'piano', 'other')
REFERENCE = 'fmkeys'
OUT = ROOT / 'kits' / 'levels.json'


def reference_midis(repo=REPO):
    """The three songs: first, middle and last of the first 40 sorted exports."""
    found = sorted((repo / 'artifacts').glob('**/merged.mid'), key=lambda p: str(p).lower())[:40]
    if not found:
        raise SystemExit('artifacts/ 下没有 merged.mid')
    return [found[0], found[len(found) // 2], found[-1]]


def track_levels(score, kit_path):
    """RMS per track of one score rendered through one kit, as the studio groups routes into tracks."""
    from memesynth.kit import load_kit
    from memesynth.render import render
    from studio.batch import SAMPLE_RATE, rms, track_of

    result = render(score, load_kit(kit_path, sample_rate=SAMPLE_RATE))
    by_track = {}
    for route in result.stems:
        name = track_of(route)
        by_track[name] = by_track.get(name, 0) + result.stereo_stem(route)
    return {name: rms(audio) for name, audio in by_track.items() if name in TRACKS}


def table(levels, reference=REFERENCE):
    """`levels[song][kit][track]` = RMS → `{kit: {'db': {track: mean dB vs reference}, 'spread': {track: max - min}}}`.

    A track either side gives nothing for in a song is left out of that song; a kit and track with no
    song left gets 0 for both."""
    kits = sorted({kit for per_song in levels.values() for kit in per_song})
    out = {}
    for kit in kits:
        db, spread = {}, {}
        for track in TRACKS:
            diffs = []
            for per_song in levels.values():
                mine, ref = per_song.get(kit, {}).get(track, 0.0), per_song.get(reference, {}).get(track, 0.0)
                if mine > 0 and ref > 0:
                    diffs.append(20.0 * math.log10(mine / ref))
            db[track] = round(sum(diffs) / len(diffs), 2) if diffs else 0.0
            spread[track] = round(max(diffs) - min(diffs), 2) if len(diffs) > 1 else 0.0
        out[kit] = {'db': db, 'spread': spread}
    return out


def main():
    from studio.batch import read_score

    sys.path.insert(0, str(HERE))
    import kitdefs
    kits = [name for name in kitdefs.KITS if (ROOT / 'kits' / name / 'kit.json').is_file()]
    if REFERENCE not in kits:
        raise SystemExit(f'没有 {REFERENCE}，量不了')
    songs = reference_midis()
    levels = {}
    for song in songs:
        score = read_score(song)
        label = song.parents[3].name                 # the song's folder: every file here is called merged.mid
        levels[label] = {}
        for kit in kits:
            began = time.monotonic()
            levels[label][kit] = track_levels(score, ROOT / 'kits' / kit / 'kit.json')
            print(f'{kit:11s} {time.monotonic() - began:5.1f}s  {label}', flush=True)
    result = {
        'about': 'RMS of each track as each kit plays it, in dB relative to fmkeys playing the same track; '
                 'mean over the songs below, spread = max - min over them. Written by tools/kit_levels.py; re-run after kits change.',
        'reference': REFERENCE,
        'tracks': list(TRACKS),
        'measuredOn': list(levels),
        'kits': table(levels),
    }
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'写好了 {OUT}')


if __name__ == '__main__':
    main()
