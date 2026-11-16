'use strict';
// 0.22.0 (work/score-shapes-20261114/SPEC-7.md): simplifying mends a cut-up note but never turns strikes into one line,
// the struck head is no bigger than a drum dot, and the kick's lift and the snare's flash come only on accents, spaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const {ScoreView, mockCanvas} = require('./helpers.cjs');

const {SIMPLIFY, SHAPES, DRUM_ACCENT, FX_PRESETS} = ScoreView;
const round = notes => notes.map(n => [n[0], Math.round(n[1] * 1000) / 1000, n[2], n[3]]);

test('the version and the new amounts', () => {
  assert.equal(ScoreView.VERSION, '0.23.0');
  assert.deepEqual({...SIMPLIFY}, {joinGap: 0.04, fade: 0.8, rise: 1.25, longest: 6, minDuration: 0.03, faint: 0.4, faintDur: 0.12});
  assert.deepEqual([...ScoreView.STRUCK_GROUPS], ['piano', 'guitar', 'bass']);
  assert.equal(SHAPES.head, 1.4);
  assert.equal(SHAPES.headOver, 1);
  assert.deepEqual({...DRUM_ACCENT, drums: [...DRUM_ACCENT.drums]}, {top: 0.75, standout: 1.1, around: 2, drums: ['kick', 'snare']});
});

test('struck: a tremolo of equally loud strikes stays strikes; a clearly softer piece is the tail and is joined', () => {
  const tremolo = Array.from({length: 40}, (_, i) => [10 + i * 0.21, 0.21, 49, 110 + (i % 3) * 5]);
  assert.equal(ScoreView.simplifyNotes(tremolo, {struck: true}).notes.length, 40, '同一个音连弹 40 下，还是 40 个');
  // Held (no `struck`): joined as before, but never past `longest` seconds.
  const held = ScoreView.simplifyNotes(tremolo, {}).notes;
  assert.ok(held.length > 1 && held.every(n => n[1] <= SIMPLIFY.longest + 1e-9), `拉的音接起来也不超过 ${SIMPLIFY.longest} 秒`);
  assert.ok(Math.abs(held.reduce((sum, n) => sum + n[1], 0) - 40 * 0.21) < 1e-6, '切开后总长不变');
  // A cut-up note: the strike, then softer pieces that touch it.
  const mended = ScoreView.simplifyNotes([[5, 1.3, 60, 100], [6.31, 0.2, 60, 78], [6.51, 0.2, 60, 70]], {struck: true}).notes;
  assert.deepEqual(round(mended), [[5, 1.71, 60, 100]], '被切碎的一个音接回来');
  // At exactly `fade` of the strike it is still the tail; a hair above, a new strike.
  assert.equal(ScoreView.simplifyNotes([[0, 0.5, 60, 100], [0.5, 0.5, 60, 80]], {struck: true}).notes.length, 1);
  assert.equal(ScoreView.simplifyNotes([[0, 0.5, 60, 100], [0.5, 0.5, 60, 81]], {struck: true}).notes.length, 2);
  // Swelling up again after a dip is struck again, though still under `fade` of the first strike.
  const swell = ScoreView.simplifyNotes([[0, 0.2, 60, 100], [0.2, 0.2, 60, 50], [0.4, 0.2, 60, 70]], {struck: true}).notes;
  assert.deepEqual(round(swell), [[0, 0.4, 60, 100], [0.4, 0.2, 60, 70]], '回升到 1.25 倍以上就是又弹了一下');
  assert.equal(ScoreView.simplifyNotes([[0, 0.2, 60, 100], [0.2, 0.2, 60, 50], [0.4, 0.2, 60, 62]], {struck: true}).notes.length, 1);
  // A note that long to begin with is left as it is.
  assert.deepEqual(round(ScoreView.simplifyNotes([[0, 11, 60, 90]], {struck: true}).notes), [[0, 11, 60, 90]]);
  assert.deepEqual(round(ScoreView.simplifyNotes([[0, 11, 60, 90]], {}).notes), [[0, 11, 60, 90]]);
  // A held chain is cut where adding a piece would pass `longest`; exactly `longest` is still one note.
  assert.equal(ScoreView.simplifyNotes([[0, 3, 60, 90], [3, 3, 60, 90]], {}).notes.length, 1);
  assert.equal(ScoreView.simplifyNotes([[0, 3, 60, 90], [3, 3.01, 60, 90]], {}).notes.length, 2);
});

test('dropping (④): only a blip, or a note both faint for its lane and short; a fast soft run stays', () => {
  const lane = extra => [...Array.from({length: 20}, (_, i) => [i, 0.5, 60 + (i % 5), 100]), ...extra];
  const kept = extra => ScoreView.simplifyNotes(lane(extra), {struck: true}).notes.length - 20;
  assert.equal(kept([[30, 0.029, 72, 100]]), 0, '0.03 秒以下是毛刺');
  assert.equal(kept([[30, 0.03, 72, 100]]), 1, '正好 0.03 秒留下');
  // Faint: under 0.4 of the median (100) and under 0.12 s; either alone keeps it.
  assert.equal(kept([[30, 0.1, 72, 39]]), 0);
  assert.equal(kept([[30, 0.1, 72, 40]]), 1, '正好 0.4 倍留下');
  assert.equal(kept([[30, 0.12, 72, 20]]), 1, '弱但不短，留下');
  assert.equal(kept([[30, 0.05, 72, 45]]), 1, '短但不算弱（0.21.0 会把 0.06 秒以下的都去掉）');
  // A fast run of soft notes (velocity 35, 0.07 s each) in a soft lane: all kept (0.21.0 dropped every one).
  const run = Array.from({length: 16}, (_, i) => [i * 0.08, 0.07, 60 + (i % 7), 35]);
  assert.equal(ScoreView.simplifyNotes(run, {struck: true}).notes.length, 16);
  // The median is the lane's own, after joining: the same faint note is dropped in a loud lane, kept in a soft one.
  assert.equal(ScoreView.simplifyNotes([...run.map(n => [n[0], n[1], n[2], 100]), [5, 0.1, 50, 35]], {struck: true}).stats.quiet, 1);
  assert.equal(ScoreView.simplifyNotes([...run, [5, 0.1, 50, 35]], {struck: true}).stats.quiet, 0);
});

test('in the view: piano, guitar and bass lanes are simplified as struck; strings and the voice as held', () => {
  const chain = Array.from({length: 6}, (_, i) => [2 + i * 0.25, 0.25, 60, 100]);
  for (const [group, kind, expected] of [['piano', 'pitched', 6], ['guitar', 'pitched', 6], ['bass', 'pitched', 6], ['strings', 'pitched', 1], ['violin', 'pitched', 1], ['vocals', 'melody', 1]]) {
    const model = {contract: 'xin.score-view/1', track: {id: 't', title: '', duration: 30}, audio: {src: '', offset: 0},
      lanes: [{id: group, label: group, kind, group, notes: chain.map(n => n.slice())}]};
    const view = ScoreView.create(mockCanvas().canvas, model, () => 0, {effects: 'off'});
    assert.equal(view.lanes()[0].shown, expected, group);
  }
});

// A lane of one struck instrument and a drum lane whose rows are `rows` tall: the head against the dot.
function headAndDot(thickness, drums) {
  const lanes = [{id: 'guitar', label: '吉他', kind: 'pitched', group: 'guitar', notes: [[2, 1, 60, 100], [2, 1, 72, 100]]}];
  if (drums) lanes.push({id: 'drums', label: '鼓', kind: 'drums', group: 'drums', rows: ['kick', 'snare'], hits: [[2, 0, 100], [2.5, 1, 100]]});
  const model = {contract: 'xin.score-view/1', track: {id: 't', title: '', duration: 30}, audio: {src: '', offset: 0}, lanes};
  const surface = mockCanvas(1600, 900);
  const view = ScoreView.create(surface.canvas, model, () => 0, {effects: 'off', showShapes: true, laneHeights: 'fixed', windowSeconds: thickness});
  view.draw(1); surface.reset(); view.draw(1);
  const heads = surface.calls.filter(c => c.name === 'rect').map(c => c.args);
  const dots = surface.calls.filter(c => c.name === 'roundRect').map(c => c.args);
  const bodies = surface.calls.filter(c => c.name === 'moveTo').map(c => c.args);
  return {heads, dots, bodies};
}

test('the struck head: 1.4 times the note, never wider than a drum dot on the same screen, always 1 px prouder', () => {
  for (const drums of [false, true]) {
    const {heads, dots} = headAndDot(16, drums);
    assert.ok(heads.length >= 2);
    const dotWidth = drums ? Math.max(...dots.map(d => d[2])) : 1.6 * 4;
    for (const [, , w, h] of heads) {
      assert.ok(Math.abs(w - h) < 1e-9, '头是方的');
      assert.ok(w <= dotWidth + 1e-9, `头 ${w}，鼓点 ${dotWidth}（${drums ? '有' : '没有'}鼓轨）`);
    }
  }
  // The rule on its own numbers: thin notes get 1.4x, a note as thick as a dot gets the dot, a thicker one 1 px over.
  const headOf = (full, dot, semitone = 99) => Math.max(full + SHAPES.headOver, Math.min(full * SHAPES.head, full + semitone * SHAPES.headCap, dot));
  assert.equal(headOf(2, 6.4), 3);
  assert.ok(Math.abs(headOf(4, 6.4) - 5.6) < 1e-9);
  assert.equal(headOf(5, 6.4), 6.4);
  assert.equal(headOf(6.75, 6.4), 7.75);
});

test('on the drawn frame: every head is no wider than the widest drum dot, unless the body itself is (then 1 px over it)', () => {
  const {heads, dots} = headAndDot(16, true);
  const dotWidth = Math.max(...dots.map(d => d[2]));
  for (const [, , w] of heads) assert.ok(w <= dotWidth + 1e-9, `头 ${w}，鼓点 ${dotWidth}`);
});

test('a crowded, short screen: the drum dots shrink and so does the cap on the head (it follows the drum lane on screen)', () => {
  const lanes = [{id: 'guitar', label: 'g', kind: 'melody', group: 'guitar', notes: [[2, 1, 60, 100], [2, 1, 62, 100]]}];
  for (const group of ['piano', 'bass', 'strings']) lanes.push({id: group, label: group, kind: 'pitched', group, notes: [[2, 1, 40, 90], [3, 1, 80, 90]]});
  lanes.push({id: 'drums', label: 'd', kind: 'drums', group: 'drums', rows: ['kick', 'snare', 'hihat', 'openhat', 'tom', 'crash', 'ride'],
    hits: [0, 1, 2, 3, 4, 5, 6].map(row => [2 + row * 0.1, row, 100])});
  const model = {contract: 'xin.score-view/1', track: {id: 't', title: '', duration: 30}, audio: {src: '', offset: 0}, lanes};
  const surface = mockCanvas(800, 300);
  const view = ScoreView.create(surface.canvas, model, () => 0, {effects: 'off', showShapes: true, laneLabels: 'text', laneHeights: 'fixed'});
  view.draw(1); surface.reset(); view.draw(1);
  const dot = Math.min(...surface.calls.filter(c => c.name === 'roundRect').map(c => c.args[2]));
  assert.ok(dot < 6.4 - 1, `这一屏的鼓点应当变小了：${dot}`);
  // The melody guitar is 3.5 px thick: 1.4 times is 4.9, over the dot, so the head is the body and 1 px.
  // (The piano and bass heads, thin notes, are the body and 1 px: 3 px.)
  const guitar = surface.calls.filter(c => c.name === 'rect').map(c => c.args[2]).filter(w => w > 4);
  assert.equal(guitar.length, 2);
  for (const w of guitar) assert.ok(Math.abs(w - 4.5) < 1e-6, `头 ${w}，鼓点 ${dot}`);
});

// Drum accents.
const hitsOf = (list, rows = ['kick', 'snare', 'hihat']) => {
  const count = list.length, set = {count, time: new Float32Array(count), row: new Uint8Array(count), vel: new Uint8Array(count)};
  list.forEach((h, i) => { set.time[i] = h[0]; set.row[i] = h[1]; set.vel[i] = h[2]; });
  return [...ScoreView.drumAccents(set, rows)];
};

test('an accent: loud for this drum in this song and clearly louder than the same drum around it (or alone there)', () => {
  // Even snares: none stands out.
  assert.deepEqual(hitsOf([[0, 1, 100], [0.5, 1, 100], [1, 1, 100], [1.5, 1, 100]]), [0, 0, 0, 0]);
  // One 1.1 times the others around it: an accent; just under: not.
  assert.deepEqual(hitsOf([[0, 1, 100], [0.5, 1, 110], [1, 1, 100], [1.5, 1, 100]]), [0, 1, 0, 0]);
  assert.deepEqual(hitsOf([[0, 1, 100], [0.5, 1, 109], [1, 1, 100], [1.5, 1, 100]]), [0, 0, 0, 0]);
  // Alone within 2 s: an accent if loud for the song; a quiet one alone is not.
  assert.deepEqual(hitsOf([[0, 1, 120], [10, 1, 120], [20, 1, 40], [30, 1, 120]]), [1, 1, 0, 1]);
  // Other drums do not count against it, and are never accents (hats spark as before).
  assert.deepEqual(hitsOf([[0, 0, 100], [0.2, 2, 127], [0.4, 2, 127]]), [1, 0, 0]);
  // Kicks and snares are judged apart.
  assert.deepEqual(hitsOf([[0, 0, 60], [0.5, 1, 120], [1, 0, 60], [1.5, 1, 120]]), [0, 0, 0, 0]);
});

// A drum lane of busy, equally loud snares and kicks with a few accents, under the preset `fxPreset`.
function busy() {
  const hits = [];
  for (let t = 0; t < 60; t += 0.25) { hits.push([t, 0, 90]); hits.push([t + 0.125, 1, 90]); }
  for (const t of [5, 7, 13, 30, 33]) { hits.push([t + 0.06, 0, 127]); hits.push([t + 0.19, 1, 127]); }
  hits.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return {contract: 'xin.score-view/1', track: {id: 'b', title: '', duration: 60}, audio: {src: '', offset: 0},
    lanes: [{id: 'drums', label: '鼓', kind: 'drums', group: 'drums', rows: ['kick', 'snare'], hits}]};
}

test('busy drums: only accents lift and flash, at least the preset\'s gap apart; the same frame however it is reached', () => {
  const steps = Array.from({length: 1200}, (_, i) => i * 0.05 + 0.01);
  for (const fxPreset of ['clear', 'strong', 'stage', 'keys']) {
    const gap = FX_PRESETS[fxPreset].accentGap;
    const view = ScoreView.create(mockCanvas().canvas, busy(), () => 0, {fxPreset});
    const lifts = [], flashes = [];
    for (const t of steps) {
      const fx = view.draw(t).fx;
      if (fx.breathe > 0) lifts.push(t);
      if (fx.snare > 0) flashes.push(t);
    }
    // Group frames into events (a lift lasts 0.12 s, a flash 0.1 s).
    const events = list => list.filter((t, i) => i === 0 || t - list[i - 1] > 0.2);
    const kicks = events(lifts), snares = events(flashes);
    // Nothing fires before the first accents (5.06 s kick, 5.19 s snare): the even hits before them are not accents.
    assert.ok(kicks[0] > 5 && snares[0] > 5, `${fxPreset}：第一次在 ${kicks[0]} / ${snares[0]} 秒`);
    for (const list of [kicks, snares]) {
      assert.ok(list.length >= 2, `${fxPreset}：应当有几次 ${list.length}`);
      list.forEach((t, i) => i && assert.ok(t - list[i - 1] >= gap - 0.06, `${fxPreset}：两次之间 ${t - list[i - 1]} 秒，少于 ${gap}`));
    }
    // 480 kicks and 480 snares in a minute; a handful fire.
    assert.ok(kicks.length <= 60 / gap + 1 && snares.length <= 60 / gap + 1, `${fxPreset} ${kicks.length} / ${snares.length}`);
    // Drawn backwards, the same.
    const again = ScoreView.create(mockCanvas().canvas, busy(), () => 0, {fxPreset});
    for (const t of steps.slice().reverse()) assert.equal(again.draw(t).fx.breathe > 0, lifts.includes(t), `${fxPreset} ${t}`);
  }
  // One view, the preset changed: the spacing follows the preset now in use.
  const count = (view, fxPreset) => {
    view.setOptions({fxPreset});
    let events = 0, was = false;
    for (const t of steps) { const on = view.draw(t).fx.snare > 0; if (on && !was) events++; was = on; }
    return events;
  };
  const one = ScoreView.create(mockCanvas().canvas, busy(), () => 0, {fxPreset: 'clear'});
  const calm = count(one, 'clear'), lively = count(one, 'stage'), calmAgain = count(one, 'clear');
  assert.ok(lively > calm && calmAgain === calm, `同一个视图：清亮 ${calm} 次，舞台 ${lively} 次，再回清亮 ${calmAgain} 次`);
  // The gap per preset: the calm ones the longest.
  assert.ok(FX_PRESETS.clear.accentGap > FX_PRESETS.strong.accentGap && FX_PRESETS.strong.accentGap > FX_PRESETS.stage.accentGap);
});
