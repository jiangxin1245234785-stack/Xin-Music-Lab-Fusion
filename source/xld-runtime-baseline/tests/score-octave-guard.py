"""analysis-score/octave_guard.py against the function it was copied from (source/voiceswap/swap.py).

    <any python with numpy> -X utf8 tests/score-octave-guard.py

Skips, saying so, when the voice-swap project is not in the tree (a packaged build).
"""
import ast
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ORIGINAL = HERE.parents[1] / 'voiceswap' / 'swap.py'
sys.path.insert(0, str(HERE.parent / 'analysis-score'))
from octave_guard import lift_octave_dips as copy

if not ORIGINAL.is_file():
    print('SKIP: source/voiceswap/swap.py is not here to compare with')
    sys.exit(0)
# Take the one function out of swap.py without importing the module (it loads a voice catalogue).
tree = ast.parse(ORIGINAL.read_text(encoding='utf-8'))
node = next(item for item in tree.body if isinstance(item, ast.FunctionDef) and item.name == 'lift_octave_dips')
scope = {}
exec(compile(ast.Module(body=[node], type_ignores=[]), str(ORIGINAL), 'exec'), scope)
original = scope['lift_octave_dips']

hz = lambda note: 440.0 * 2 ** ((note - 69) / 12)
rng = np.random.default_rng(7)
cases = []
steady = np.full(300, hz(63.0))
dip = steady.copy(); dip[120:150] = hz(51.0)                      # a note an octave down that comes back
cases.append(('octave dip that returns', dip))
long_dip = steady.copy(); long_dip[100:200] = hz(51.0)            # too long to be a slip
cases.append(('long octave stretch', long_dip))
fifth = steady.copy(); fifth[120:150] = hz(56.0)                  # another interval
cases.append(('a fifth down', fifth))
spike = dip.copy(); spike[135] = hz(73.0)                         # a lone frame inside the dip
cases.append(('dip cut by a spike', spike))
gaps = dip.copy(); gaps[115:120] = 0; gaps[150:156] = 0
cases.append(('dip between silences', gaps))
for index in range(20):                                           # random melodies with random slips
    notes = np.repeat(rng.integers(55, 72, 30).astype(float), 20)
    for at in rng.integers(40, 560, 4):
        notes[at:at + int(rng.integers(5, 70))] -= 12
    f0 = hz(notes + rng.normal(0, 0.05, notes.size))
    f0[rng.random(notes.size) < 0.03] = 0
    cases.append((f'random {index}', f0))
lifted_total = 0
for name, f0 in cases:
    a, a_lifted = copy(f0.copy(), 100.0)
    b, b_lifted = original(f0.copy(), 100.0)
    assert np.array_equal(a, b) and a_lifted == b_lifted, name
    lifted_total += len(a_lifted)
assert lifted_total > 10, 'the cases never exercised the guard'
assert len(copy(dip.copy(), 100.0)[1]) == 1 and len(copy(long_dip.copy(), 100.0)[1]) == 0 and len(copy(fifth.copy(), 100.0)[1]) == 0
print(f'PASS: octave guard equals its source on {len(cases)} contours ({lifted_total} lifts)')
