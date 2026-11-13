"""Dump what pretty_midi and memesynth produce, so verify_engine.js can diff the JS port.

    runtime/0.5.0/envs/basic/python.exe source/memesynth/studio/tests/dump_reference.py <某首.mid> <kit.json> [--library] [--out <目录>]

Writes into `studio/tests/ref/` (gitignored output; wav/json references are large), or `--out`.
The note tables come from every `artifacts/**/merged.mid`; with `--library`, from the merged.mid of every
song `studio.library.scan()` lists instead (read only: nothing is written next to them).
"""
import glob
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
REPO = ROOT.parents[1]
sys.path.insert(0, str(ROOT))

import numpy as np                                   # noqa: E402
import pretty_midi                                   # noqa: E402
import soundfile as sf                               # noqa: E402
from memesynth.kit import load_kit                   # noqa: E402
from memesynth.render import peak_factor, render     # noqa: E402
from memesynth.score import read_score               # noqa: E402

args = sys.argv[1:]
use_library = '--library' in args
args = [a for a in args if a != '--library']
out_dir = HERE / 'ref'
if '--out' in args:
    at = args.index('--out')
    out_dir = Path(args[at + 1])
    del args[at:at + 2]
out_dir.mkdir(parents=True, exist_ok=True)

if use_library:
    from studio import library
    sources = sorted({song['midi'] for song in library.scan(())[0]})
else:
    sources = sorted(glob.glob(str(REPO / 'artifacts' / '**' / 'merged.mid'), recursive=True))


def key_of(path):
    """Relative to the repo where it lies inside it, else absolute (verify_engine.js reads both)."""
    try:
        return os.path.relpath(path, REPO).replace('\\', '/') if Path(path).resolve().is_relative_to(REPO) else str(Path(path).resolve())
    except ValueError:                               # another drive
        return str(Path(path).resolve())


# 1. Note tables from pretty_midi, for every real export.
tables = {}
for path in sources:
    midi = pretty_midi.PrettyMIDI(path)
    rows = []
    for inst in midi.instruments:
        for note in inst.notes:
            rows.append([inst.name or '', int(inst.is_drum), round(float(note.start), 6),
                         round(float(note.end), 6), int(note.pitch), int(note.velocity)])
    rows.sort()
    tables[key_of(path)] = rows
(out_dir / 'notes_reference.json').write_text(
    json.dumps(tables, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(f'note tables: {len(tables)} files, {sum(len(v) for v in tables.values())} notes')

# 2. One real render, to compare sample by sample.
midi_path, kit_path = args[0], args[1]
score = read_score(midi_path)
kit = load_kit(kit_path, sample_rate=48000)
result = render(score, kit)
factor = peak_factor([result.mix] + [result.stereo_stem(r) for r in result.stems])
sf.write(str(out_dir / 'render_reference.wav'), result.mix * factor, 48000, subtype='FLOAT')
(out_dir / 'render_reference.json').write_text(json.dumps(
    {'midi': str(Path(midi_path).resolve()), 'kit': str(Path(kit_path).resolve()),
     'rendered': result.rendered, 'truncated': result.truncated, 'factor': factor,
     'frames': int(result.mix.shape[0]), 'repo': str(REPO)},
    ensure_ascii=False, indent=1), encoding='utf-8')
print(f'reference render: {result.rendered} notes, {result.mix.shape[0]} frames, factor {factor:.6f}')
