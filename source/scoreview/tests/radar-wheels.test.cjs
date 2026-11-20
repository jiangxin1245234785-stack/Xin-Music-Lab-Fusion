'use strict';
// SPEC-WHEELS (work/score-depth-20261118/SPEC-WHEELS.md): the radar's three chord wheels are servo-driven drums. A
// change turns a drum the short way (ties upward) at a fixed speed through every cell between, a new chord re-targets
// it from wherever it is, and its position is a pure function of the chord list and song time.
const test = require('node:test');
const assert = require('node:assert/strict');
const Radar = require('../score-radar.js');

const W = Radar.wheels;
const STEP = .01, LIMIT = W.speed * STEP + 1e-9;   // the most a drum can move in 10 ms
const glyphAt = (k, cell) => { const c = W.cells[k], n = c.length; return c[((Math.round(cell) % n) + n) % n]; };
// The cells a drum stands on, in order, from t0 to t1 (1 ms samples, nearest cell).
function visited(plan, k, t0, t1) {
  const out = [];
  for (let t = t0; t <= t1 + 1e-9; t += .001) {
    const cell = Math.round(W.at(plan, k, t).pos);
    if (out[out.length - 1] !== cell + 0) out.push(cell + 0);
  }
  return out;
}

test('the wheels\' cells: root round the circle of fifths, accidental thrice, quality in the kinship order', () => {
  assert.deepEqual([...W.cells[0]], ['', 'F', 'C', 'G', 'D', 'A', 'E', 'B']);
  assert.deepEqual([...W.cells[1]], ['', '#', 'b', '', '#', 'b']);
  assert.deepEqual([...W.cells[2]], ['', 'maj7', '7', 'sus4', '6', 'sus2', 'dim7', 'dim', 'm7b5', 'aug', 'm6', 'm', 'm7']);
  // The spec's kinships sit side by side on the quality ring.
  const q = W.cells[2], n = q.length, d = (a, b) => { const x = Math.abs(q.indexOf(a) - q.indexOf(b)); return Math.min(x, n - x); };
  for (const [a, b] of [['', 'maj7'], ['', 'm7'], ['m', 'm7'], ['m', 'm6'], ['dim', 'dim7'], ['dim', 'm7b5']]) assert.equal(d(a, b), 1, a + ' ~ ' + b);
});

test('the short way: direction and every cell passed, per wheel; equally far both ways turns upward', () => {
  // [wheel, from chord, to chord, direction (+1 = toward higher cell numbers), the glyphs the window shows on the way]
  const cases = [
    [0, 'C', 'G', +1, ['C', 'G']],
    [0, 'C', 'F', -1, ['C', 'F']],
    [0, 'G', 'F', -1, ['G', 'C', 'F']],
    [0, 'F', 'B', -1, ['F', '', 'B']],          // F down through the blank cell to B, not up through C .. E
    [0, 'B', 'F', +1, ['B', '', 'F']],          // and back up the same way
    [0, 'C', 'A', +1, ['C', 'G', 'D', 'A']],
    [0, 'C', 'B', -1, ['C', 'F', '', 'B']],
    [0, 'G', 'B', +1, ['G', 'D', 'A', 'E', 'B']], // four cells either way: upward
    [0, 'A', 'F', +1, ['A', 'E', 'B', '', 'F']],  // four cells either way: upward
    [1, 'C', 'F#', +1, ['', '#']],
    [1, 'C', 'Bb', -1, ['', 'b']],
    [1, 'F#', 'Bb', +1, ['#', 'b']],
    [1, 'Bb', 'F#', -1, ['b', '#']],
    [1, 'Bb', 'C', +1, ['b', '']],
    [2, 'C', 'Cmaj7', +1, ['', 'maj7']],
    [2, 'C', 'C7', +1, ['', 'maj7', '7']],
    [2, 'C', 'Cm', -1, ['', 'm7', 'm']],
    [2, 'Cm', 'Cm7', +1, ['m', 'm7']],
    [2, 'Cm', 'Cm6', -1, ['m', 'm6']],
    [2, 'Cdim', 'Cdim7', -1, ['dim', 'dim7']],
    [2, 'Cm7b5', 'Cdim', -1, ['m7b5', 'dim']],
    [2, 'C', 'Caug', -1, ['', 'm7', 'm', 'm6', 'aug']],
    [2, 'C', 'Cm7b5', -1, ['', 'm7', 'm', 'm6', 'aug', 'm7b5']],
  ];
  for (const [k, a, b, dir, glyphs] of cases) {
    const plan = W.plan([[0, 2, a], [2, 4, b]]);
    const cells = visited(plan, k, 1.9, 3);
    assert.deepEqual(cells.map(c => glyphAt(k, c)), glyphs, `wheel ${k}: ${a} -> ${b}`);
    assert.equal(Math.sign(cells[cells.length - 1] - cells[0]), dir, `wheel ${k}: ${a} -> ${b} direction`);
    cells.slice(1).forEach((c, i) => assert.equal(c - cells[i], dir, 'one cell at a time'));
    // Settled on the cell, exactly.
    assert.equal(W.at(plan, k, 3.5).pos, cells[cells.length - 1]);
    assert.equal(W.at(plan, k, 3.5).moving, false);
  }
  // Blank -> D on the root wheel: cell 4 either way, so upward through F, C, G.
  assert.deepEqual(visited(W.plan([[0, 2, 'D']]), 0, -.1, 1), [0, 1, 2, 3, 4]);
});

test('speed: one cell per 60 ms; the farthest root turn about .24 s and quality about .36 s; the detent once, at most .06 cell', () => {
  const settle = (rows, k, t0) => { const plan = W.plan(rows); let t = t0; while (W.at(plan, k, t).moving) t += .001; return {t: t - t0, plan}; };
  const root = settle([[0, 2, 'A'], [2, 4, 'F']], 0, 2), quality = settle([[0, 2, 'C'], [2, 4, 'Cm7b5']], 2, 2);
  // Travel at 60 ms a cell plus the ease (25 ms) and the detent (detent run + 60 ms pull back).
  assert.ok(root.t > .24 && root.t < .36, 'four cells: ' + root.t);
  assert.ok(quality.t > .36 && quality.t < .48, 'six cells... ' + quality.t);
  // Past the cell once by no more than .06, then back; never past it again (no spring wobble).
  let over = 0, crossings = 0, prev = null;
  const end = W.at(root.plan, 0, 3).pos;   // A up four cells to F
  assert.equal(end - W.at(root.plan, 0, 2).pos, 4);
  for (let t = 2; t < 3; t += .001) {
    const x = W.at(root.plan, 0, t).pos - end;
    over = Math.max(over, x);
    if (prev !== null && Math.sign(prev) !== Math.sign(x) && x !== 0) crossings++;
    prev = x;
  }
  assert.ok(over > 0 && over <= .06, 'detent overshoot ' + over);
  assert.equal(crossings, 1, 'crosses its cell once');
});

test('short chords (1a4ce24 kept): a turn takes at most half its chord; 200 ms or less lands at once; no other jumps', () => {
  // 300 ms chords: six quality cells at 60 ms a cell would take .45 s; squeezed into the first 150 ms.
  const rows = [[1, 1.3, 'C'], [1.3, 1.6, 'Cm7b5'], [1.6, 1.9, 'Eb'], [1.9, 2.05, 'F#7'], [2.05, 2.2, 'Gsus4'], [2.2, 4, 'A']];
  const plan = W.plan(rows), parsed = rows.map(r => Radar.chordParts(r[2]).wheels);
  rows.forEach(([start, end], i) => {
    const half = start + (end - start) / 2;
    for (let k = 0; k < 3; k++) {
      // From the chord's middle to its end the drum stands still on the chord's own face.
      for (let t = half; t < end - 1e-9; t += .005) {
        const a = W.at(plan, k, t);
        assert.equal(a.moving, false, `${rows[i][2]} wheel ${k} still turning at ${t}`);
        assert.equal(glyphAt(k, a.pos), parsed[i][k]);
        assert.equal(a.pos, Math.round(a.pos), 'on the cell, centred');
      }
    }
  });
  // 150 ms chords (F#7, Gsus4): straight on their cells at the onset, no turn.
  assert.deepEqual([0, 1, 2].map(k => glyphAt(k, W.at(plan, k, 1.9).pos)), parsed[3]);
  assert.deepEqual([0, 1, 2].map(k => W.at(plan, k, 1.9).moving), [false, false, false]);
  // Longer than 200 ms: no jump; a 1 ms step stays under the squeezed speed of this song's shortest turn.
  for (let k = 0; k < 3; k++) {
    let prev = W.at(plan, k, .9).pos;
    for (let t = .901; t < 1.9 - 1e-9; t += .001) {
      const pos = W.at(plan, k, t).pos;
      assert.ok(Math.abs(pos - prev) < .1, `wheel ${k} jumps ${Math.abs(pos - prev)} at ${t}`);
      prev = pos;
    }
  }
  // A chord ending with nothing after it: the drums go back to blank the same way, within half the gap.
  const tail = W.plan([[0, 1, 'F#m7'], [1.3, 3, 'C']]);
  [0, 1, 2].forEach(k => {
    assert.equal(glyphAt(k, W.at(tail, k, 1.15).pos), '');
    assert.equal(W.at(tail, k, 1.15).fade, 0, 'a blank drum at rest shows no neighbours');
  });
  // The same record as the lamps: wherever a drum is at rest, its face is the lamps' chord (or blank without one).
  const lampRows = [[0, .5, 'C'], [.5, .5, 'D'], [.5, .62, 'Em'], [.62, .7, 'N'], [.7, 1.4, 'Fmaj7'], [1.4, 2.4, 'Fmaj7'], [2.6, 3, 'G7']];
  const lp = W.plan(lampRows);
  for (let i = 0; i < 350; i++) { const t = i / 100;
    const cue = lampRows.filter(r => r[1] > r[0] && r[0] <= t).pop();
    const glyphs = cue && t < cue[1] && Radar.chordParts(cue[2]) ? Radar.chordParts(cue[2]).wheels : ['', '', ''];
    for (let k = 0; k < 3; k++) {
      const a = W.at(lp, k, t);
      if (!a.moving) assert.equal(glyphAt(k, a.pos), glyphs[k], `at ${t.toFixed(2)} wheel ${k}`);
    }
  }
});

test('re-targeting stays in the planner: a turn re-planned from a moving state does not jump', () => {
  // Chords never interrupt a turn now (each turn ends by half its chord), so the moving start is checked directly.
  const plan = W.plan([[0, 2, 'C'], [2, 4, 'B']]);
  const mid = W.at(plan, 0, 2.05);
  assert.ok(mid.moving && Math.abs(mid.v) > 0);
  assert.equal(mid.turn.x0, W.at(plan, 0, 2).pos);
});

test('determinism: the same moment gives the same position whatever was asked before, and a fresh plan agrees', () => {
  const rows = [[0, .5, 'C'], [.5, .6, 'G7'], [.6, .65, 'Ebm'], [.65, 2, 'F#sus2'], [2.5, 3, 'Bdim']];
  const times = Array.from({length: 320}, (_, i) => i * .01);
  const plan = W.plan(rows), forward = times.map(t => [0, 1, 2].map(k => W.at(plan, k, t).pos));
  const back = times.slice().reverse().map(t => [0, 1, 2].map(k => W.at(plan, k, t).pos)).reverse();
  assert.deepEqual(back, forward);
  const again = W.plan(rows.map(r => r.slice()));
  const shuffled = times.map((t, i) => times[(i * 97) % times.length]);
  for (const t of shuffled) for (let k = 0; k < 3; k++) assert.equal(W.at(again, k, t).pos, forward[Math.round(t * 100)][k]);
});

test('nothing early: 1 ms before a chord the drum is where the last state left it', () => {
  const plan = W.plan([[0, 2, 'C'], [2, 4, 'Ebm7'], [4.1, 6, 'Ab']]);
  assert.deepEqual([0, 1, 2].map(k => W.at(plan, k, 1.999).pos), [2, 0, 0], 'on C, at rest');
  assert.deepEqual([0, 1, 2].map(k => W.at(plan, k, 1.999).moving), [false, false, false]);
  assert.deepEqual([0, 1, 2].map(k => W.at(plan, k, -.001).pos), [0, 0, 0], 'blank before the first chord');
  // After the chord ends (4.0) the drums go back to blank; the next chord (4.1) turns them from where they are then.
  const before = W.at(plan, 0, 4.099).pos, at = W.at(plan, 0, 4.1);
  assert.ok(Math.abs(at.pos - before) <= W.speed * .001 + 1e-9);
  assert.equal(at.turn.t0, 4.1);
});
