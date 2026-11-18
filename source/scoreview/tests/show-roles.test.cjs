'use strict';
// Lead / accompaniment drawn inside a lane by shape (showRoles, work/score-roles-20261114/SPEC-3.md; SPEC-2's
// fainter-and-thinner look was withdrawn). Off (the default) must draw exactly what 0.15.0 drew, with roles in
// the model or not; on, accompaniment notes sounding together become a block (a stepped outline from the
// lowest to the highest accompaniment note, edges, a tick at each onset), a lone one stays a note, lead notes
// are drawn exactly as before and the notes of one lead line are joined. No brightness or colour tells the two
// apart. Each rule has an entry in mutations.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {ScoreView, mockCanvas, fullModel, alike} = require('./helpers.cjs');
const adapter = require(process.env.SCOREVIEW_ADAPTER || path.join(__dirname, '..', 'adapter', 'track-model.cjs'));

const BEFORE = require('./fixtures/score-view-0.15.0.js');
const DATA = path.join(__dirname, '..', '..', '..', 'work', 'scoreview-20261110', 'data');
const steps = (from, to, count) => Array.from({length: count}, (_, i) => from + (to - from) * i / (count - 1));
const R = ScoreView.ROLES;
const rgbaOf = style => { const m = /^rgba\((\d+,\d+,\d+),([\d.]+)\)$/.exec(String(style)); return m ? {rgb: m[1], alpha: Number(m[2])} : null; };
const near = (a, b, eps = 0.01) => Math.abs(a - b) < eps;

const pilot = name => {
  const file = path.join(DATA, name, 'bundle.json');
  assert.ok(fs.existsSync(file), `试点 ${name} 的 bundle.json 不在`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
};
const withRoles = model => { const health = {}; adapter.rolesInto(model, health); return {model, health}; };

function frames(core, model, options, times) {
  const surface = mockCanvas(800, 400);
  const view = core.create(surface.canvas, model, () => 0, options);
  view.setCover({width: 480, height: 480});
  view.draw(0);
  return {view, list: times.map(time => { surface.reset(); const stats = view.draw(time); return {calls: JSON.stringify(surface.calls), stats, bars: surface.bars(), surface: surface.calls.slice()}; })};
}

// One guitar lane whose shapes are known by hand:
//   a block 4–8 s: 60 64 67 together 4–6, then 62 65 together 6–8 (two onsets, one step)
//   lead line one 4.2–6.4 s: 76 77 79 77; lead line two 7.0–8.0 s: 74 76 (no link between the two lines)
//   a lone accompaniment note at 10 s (stays a note), a pair at 12 / 12.35 s (0.05 s apart: a block of two)
const SHAPES = {
  comp: [[4, 2, 60], [4, 2, 64], [4, 2, 67], [6, 2, 62], [6, 2, 65], [10, 0.5, 62], [12, 0.3, 60], [12.35, 0.3, 64]],
  lead: [[4.2, 0.4, 76], [4.8, 0.4, 77], [5.4, 0.4, 79], [6.0, 0.4, 77], [7.0, 0.4, 74], [7.6, 0.4, 76]],
  lines: [[4.2, 6.4], [7.0, 8.0]]
};
function shapes(withRolesField = true) {
  const model = fullModel();
  const notes = [...SHAPES.comp.map(n => [...n, 90, 0]), ...SHAPES.lead.map(n => [...n, 90, 1])].sort((a, b) => a[0] - b[0] || a[2] - b[2]);
  const lane = {id: 'guitar', label: '吉他', kind: 'pitched', group: 'guitar', notes: notes.map(n => n.slice(0, 4))};
  if (withRolesField) { lane.roles = notes.map(n => n[4]); lane.leadLines = SHAPES.lines.map(l => l.slice()); }
  model.lanes = [lane];
  // Only the lane: no chord pills, section bar or captions drawn as rects among the notes.
  for (const key of ['chords', 'chordTones', 'sections', 'captions', 'bars']) delete model[key];
  return model;
}
const LOOK = {effects: 'off', simplify: false, mergeTimbres: false, laneHeights: 'fixed'};
// Where each note of `shapes()` sits in a frame drawn off: its bar, by start then pitch high to low.
function barsByNote(frame) {
  const notes = [...SHAPES.comp, ...SHAPES.lead].sort((a, b) => a[0] - b[0] || b[2] - a[2]);
  const bars = frame.bars.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  assert.equal(bars.length, notes.length, '关着时每个音符一条');
  return notes.map((note, i) => ({note, bar: bars[i]}));
}
const barOf = (map, start, pitch) => map.find(item => near(item.note[0], start) && item.note[2] === pitch).bar;
// Straight strokes of a frame: {x0, y0, x1, y1, style, width}.
function segments(calls) {
  const out = [];
  let at = null;
  for (const call of calls) {
    if (call.name === 'moveTo') at = call.args;
    else if (call.name === 'lineTo' && at) { out.push({x0: at[0], y0: at[1], x1: call.args[0], y1: call.args[1], style: call.strokeStyle, width: call.lineWidth}); at = call.args; }
    else if (call.name === 'beginPath') at = null;
  }
  return out;
}
const BLOCK_ALPHAS = [Math.round(0.92 * R.fill * 1000) / 1000, Math.round(0.34 * R.fill * 1000) / 1000];
const blockRects = frame => frame.bars.filter(bar => { const c = rgbaOf(bar.style); return c && BLOCK_ALPHAS.includes(c.alpha); });

test('the default is off; showRoles takes booleans only; the model says whether it has roles', () => {
  assert.equal(ScoreView.DEFAULTS.showRoles, false);
  assert.equal(ScoreView.VERSION, '0.31.1');
  const view = ScoreView.create(mockCanvas().canvas, shapes(), () => 0);
  assert.equal(view.options().showRoles, false);
  view.setOptions({showRoles: 'yes'});
  assert.equal(view.options().showRoles, false, '不认识的值不该被接受');
  view.setOptions({showRoles: true});
  assert.equal(view.options().showRoles, true);
  assert.equal(view.layers().roles, true);
  assert.equal(ScoreView.create(mockCanvas().canvas, shapes(false), () => 0).layers().roles, false);
  const plain = frames(ScoreView, shapes(), LOOK, [6.5]).list[0];
  assert.equal(blockRects(plain).length, 0, '缺省不该成块');
});

test('off, and nothing given, draw exactly what 0.15.0 drew, roles in the model or not (the strict canvas: every drawing state)', () => {
  assert.equal(BEFORE.VERSION, '0.15.0');
  let compared = 0;
  const pilots = ['qilixiang', 'meguri'].map(name => withRoles(pilot(name)));
  for (const p of pilots) assert.ok(p.health.roles.ok && p.health.roles.lead > 0, JSON.stringify(p.health.roles));
  // Both cores get the same input, one the old and the new rules agree on (helpers.alike).
  for (const model of [fullModel(), shapes(), shapes(false), ...pilots.map(p => p.model)].map(alike)) {
    const times = steps(0, model.track.duration, 31).map(t => t + 0.013).concat([4.05, 6.5, 9.02, 10, 12.1, 30.01]);
    for (const look of [{}, {fxPreset: 'strong'}, {laneLabels: 'text', sectionStyle: 'block', focusGroup: 'guitar', simplify: false, mergeTimbres: false}]) {
      const old = frames(BEFORE, model, look, times).list;
      for (const given of [look, {...look, showRoles: false}]) {
        frames(ScoreView, model, given, times).list.forEach((frame, i) => {
          assert.equal(frame.calls, old[i].calls, `${JSON.stringify(given)} ${times[i]} 秒：和 0.15.0 画的不一样`);
          assert.deepEqual(frame.stats, old[i].stats);
          compared++;
        });
      }
    }
  }
  assert.ok(compared > 1000, String(compared));
});

test('on: accompaniment notes sounding together are one block, its outline from the lowest to the highest of them, step by step', () => {
  const off = frames(ScoreView, shapes(), LOOK, [6.5]).list[0], on = frames(ScoreView, shapes(), {...LOOK, showRoles: true}, [6.5]).list[0];
  const map = barsByNote(off);
  const top = (start, pitch) => barOf(map, start, pitch).y, bottom = (start, pitch) => { const b = barOf(map, start, pitch); return b.y + b.height; };
  const x = start => map.find(item => near(item.note[0], start)).bar.x;
  const rects = blockRects(on);
  assert.ok(rects.length >= 3, `块的填充：${rects.length}`);
  // 4–6 s: 60 to 67; 6–8 s: 62 to 65 (the play line at 6.5 s cuts the second into played and to come).
  const first = rects.filter(r => r.x >= x(4) - 0.5 && r.x + r.width <= x(6) + 0.5);
  const second = rects.filter(r => r.x >= x(6) - 0.5 && r.x < x(10) - 1);
  assert.ok(first.length >= 1 && second.length >= 1);
  for (const r of first) { assert.ok(near(r.y, top(4, 67)), `顶：${r.y} vs ${top(4, 67)}`); assert.ok(near(r.y + r.height, bottom(4, 60)), '底'); }
  for (const r of second) { assert.ok(near(r.y, top(6, 65)), '第二段的顶'); assert.ok(near(r.y + r.height, bottom(6, 62)), '第二段的底'); }
  // Filled in the lane's own colour, see-through, at ROLES.fill of a note's light in the same state.
  const colour = rgbaOf(barOf(map, 4, 60).style).rgb;
  for (const r of rects) assert.equal(rgbaOf(r.style).rgb, colour, '块用这条轨自己的颜色');
  assert.ok(R.fill < 1);
  // The notes inside are not drawn one by one any more.
  const noteBars = on.bars.filter(b => !BLOCK_ALPHAS.includes((rgbaOf(b.style) || {}).alpha));
  for (const [start, , pitch] of SHAPES.comp.filter(n => n[0] !== 10)) assert.ok(!noteBars.some(b => near(b.x, barOf(map, start, pitch).x) && near(b.y, barOf(map, start, pitch).y) && b.height === barOf(map, start, pitch).height), `${start} 秒 ${pitch} 不该再单独画`);
  assert.equal(on.stats.blocked, 7);
});

test('on: a tick at every onset inside a block, the whole height of the block there; the block has top and bottom edges', () => {
  const off = frames(ScoreView, shapes(), LOOK, [6.5]).list[0], on = frames(ScoreView, shapes(), {...LOOK, showRoles: true}, [6.5]).list[0];
  const map = barsByNote(off);
  const segs = segments(on.surface);
  const vertical = segs.filter(s => near(s.x0, s.x1) && !near(s.y0, s.y1));
  const tickAt = (start, low, high) => {
    const xs = barOf(map, start, low).x, y0 = barOf(map, start, high).y, y1 = barOf(map, start, low).y + barOf(map, start, low).height;
    return vertical.some(s => near(s.x0, xs) && near(Math.min(s.y0, s.y1), y0) && near(Math.max(s.y0, s.y1), y1) && s.width === R.tick);
  };
  assert.ok(tickAt(4, 60, 67), '4 秒的起音');
  assert.ok(tickAt(6, 62, 65), '6 秒的起音');
  assert.ok(tickAt(12, 60, 60) || vertical.some(s => near(s.x0, barOf(map, 12, 60).x)), '12 秒的起音');
  assert.ok(tickAt(12.35, 64, 64) || vertical.some(s => near(s.x0, barOf(map, 12.35, 64).x)), '12.35 秒的起音');
  // Edges: a horizontal stroke along the top and the bottom of the first stretch.
  const horizontal = segs.filter(s => near(s.y0, s.y1) && s.width === R.edge);
  const topY = barOf(map, 4, 67).y, bottomY = barOf(map, 4, 60).y + barOf(map, 4, 60).height;
  assert.ok(horizontal.some(s => near(s.y0, topY)) && horizontal.some(s => near(s.y0, bottomY)), '块的上下沿');
});

test('on: a lone accompaniment note is a note; ROLES.blockMin notes are a block', () => {
  assert.equal(R.blockMin, 2);
  const off = frames(ScoreView, shapes(), LOOK, [6.5]).list[0], on = frames(ScoreView, shapes(), {...LOOK, showRoles: true}, [6.5]).list[0];
  const map = barsByNote(off);
  const lone = barOf(map, 10, 62);
  assert.ok(on.bars.some(b => JSON.stringify(b) === JSON.stringify(lone)), '单独的伴奏音照普通音符画');
  // The pair 0.05 s apart is a block (two notes); the lone note is not part of any.
  const pair = blockRects(on).filter(r => r.x >= barOf(map, 12, 60).x - 0.5);
  assert.ok(pair.length >= 1, '两个音成块');
  assert.ok(!blockRects(on).some(r => r.x <= lone.x + 0.5 && r.x + r.width >= lone.x + lone.width - 0.5), '单独的音不在块里');
});

test('on: lead notes are drawn exactly as before (size, colour, light), and above the blocks', () => {
  const look = {...LOOK, effects: 'light'};
  for (const t of [4.3, 5.5, 6.5, 7.7]) {
    const off = frames(ScoreView, shapes(), look, [t]).list[0], on = frames(ScoreView, shapes(), {...look, showRoles: true}, [t]).list[0];
    const offKeys = new Set(off.bars.map(b => JSON.stringify(b)));
    const map = barsByNote(frames(ScoreView, shapes(), LOOK, [t]).list[0]);
    for (const [start, , pitch] of SHAPES.lead) {
      const bar = barOf(map, start, pitch);
      const drawn = on.bars.find(b => near(b.x, bar.x) && near(b.y, bar.y) && b.height === bar.height);
      assert.ok(drawn, `${t} 秒：主音 ${start} 没画`);
      assert.ok(offKeys.has(JSON.stringify(drawn)), `${t} 秒：主音 ${start} 和关着时不一样`);
    }
    // Every lead note's fill comes after the blocks' fill.
    const calls = on.surface;
    const lastBlock = calls.reduce((at, call, i) => (call.name === 'rect' && BLOCK_ALPHAS.includes((rgbaOf(call.fillStyle) || {}).alpha) ? i : at), -1);
    const firstLead = calls.findIndex(call => (call.name === 'roundRect' || call.name === 'rect') && SHAPES.lead.some(([start, , pitch]) => {
      const bar = barOf(map, start, pitch); return near(call.args[0], bar.x) && near(call.args[1], bar.y);
    }));
    if (lastBlock >= 0) assert.ok(firstLead > lastBlock, `${t} 秒：主音画在块下面了`);
  }
});

test('on: the notes of one lead line are joined, end of one to the start of the next, note centre to note centre; two lines are not joined', () => {
  const off = frames(ScoreView, shapes(), LOOK, [6.5]).list[0], on = frames(ScoreView, shapes(), {...LOOK, showRoles: true}, [6.5]).list[0];
  const map = barsByNote(off);
  const centre = (start, pitch) => { const b = barOf(map, start, pitch); return b.y + b.height / 2; };
  const links = segments(on.surface).filter(s => s.width === R.link);
  // Line one: 3 links (all played at 6.5 s); line two: 1 (to come).
  assert.equal(on.stats.links, 4, JSON.stringify(on.stats));
  const ends = [[4.2, 76, 4.8, 77], [4.8, 77, 5.4, 79], [7.0, 74, 7.6, 76]];
  for (const [a, pa, b, pb] of ends) {
    const x0 = barOf(map, a, pa).x + (barOf(map, b, pb).x - barOf(map, a, pa).x) * 0.4 / (b - a);
    assert.ok(links.some(s => near(s.y0, centre(a, pa), 0.05) && near(s.y1, centre(b, pb), 0.05) && near(s.x1, barOf(map, b, pb).x, 0.05) && near(s.x0, x0, 0.05)), `${a}→${b} 没连`);
  }
  // Nothing from the last note of line one (77 at 6.0) to the first of line two (74 at 7.0).
  assert.ok(!links.some(s => near(s.y1, centre(7.0, 74), 0.05) && near(s.y0, centre(6.0, 77), 0.05)), '两条线段之间不该连');
  // Same colour as the lane's notes; a played note's light behind the line, a note-to-come's ahead.
  const colour = rgbaOf(barOf(map, 4.2, 76).style).rgb;
  for (const s of links) { const c = rgbaOf(s.style); assert.equal(c.rgb, colour); assert.ok([0.92, 0.34].includes(c.alpha), s.style); }
});

test('on, with the lane listened to alone: every note again, the links kept', () => {
  const look = {...LOOK, focusGroup: 'guitar'};
  const off = frames(ScoreView, shapes(), look, [6.5]).list[0], on = frames(ScoreView, shapes(), {...look, showRoles: true}, [6.5]).list[0];
  assert.equal(blockRects(on).length, 0, '聚焦时不收块');
  const offKeys = new Set(off.bars.map(b => JSON.stringify(b)));
  assert.equal(on.bars.filter(b => offKeys.has(JSON.stringify(b))).length, off.bars.length, '每个音都照逐音画');
  assert.equal(on.stats.links, 4, '连线保留');
  // Another lane listened to: this one is still drawn in blocks.
  const other = frames(ScoreView, shapes(), {...LOOK, focusGroup: 'piano', showRoles: true}, [6.5]).list[0];
  assert.ok(blockRects(other).length > 0);
});

test('on: lead and accompaniment are not told apart by light or colour: every note drawn as a note is drawn as it was off; the block takes the lane\'s colour', () => {
  for (const look of [LOOK, {...LOOK, effects: 'light'}, {...LOOK, fxPreset: 'strong'}]) {
    for (const t of [4.1, 6.5, 10.2, 12.1]) {
      const off = frames(ScoreView, shapes(), look, [t]).list[0], on = frames(ScoreView, shapes(), {...look, showRoles: true}, [t]).list[0];
      const offKeys = new Set(off.bars.map(b => JSON.stringify(b)));
      const colours = new Set(off.bars.map(b => (rgbaOf(b.style) || {}).rgb).filter(Boolean));
      for (const bar of on.bars) {
        const c = rgbaOf(bar.style);
        if (c && BLOCK_ALPHAS.includes(c.alpha)) { assert.ok(colours.has(c.rgb), '块的颜色只能取自这条轨'); continue; }
        assert.ok(offKeys.has(JSON.stringify(bar)) || (c && c.rgb === '255,255,255'), `${JSON.stringify(look)} ${t} 秒：多了一个关着时没有的样子 ${JSON.stringify(bar)}`);
      }
    }
  }
});

test('on: notes inside a block take no light of their own; a fresh onset tick lights up a little, never more than a sounding lead note', () => {
  const look = {...LOOK, fxPreset: 'strong'};
  const off = frames(ScoreView, shapes(), look, [4.02]).list[0], on = frames(ScoreView, shapes(), {...look, showRoles: true}, [4.02]).list[0];
  const haloPitches = frame => (frame.stats.fx ? frame.stats.fx.halos : []).map(h => h.pitch);
  assert.ok([60, 64, 67].every(p => haloPitches(off).includes(p)), '关着时这三个音有光晕');
  assert.ok(![60, 64, 67].some(p => haloPitches(on).includes(p)), '块里的音不该有自己的光晕');
  const fresh = frames(ScoreView, shapes(), {...LOOK, showRoles: true}, [6.05]).list[0], later = frames(ScoreView, shapes(), {...LOOK, showRoles: true}, [6.5]).list[0];
  const lit = frame => segments(frame.surface).filter(s => s.width === R.tick + 1);
  assert.ok(lit(fresh).length > 0, '刚起音的细纹要亮一下');
  for (const s of lit(fresh)) assert.ok(rgbaOf(s.style).alpha <= R.flash && R.flash < 1, s.style);
  assert.equal(lit(later).length, 0, `过了 ${R.flashLife} 秒就不亮`);
});

test('on: a lane without roles, and the vocal lane, are drawn exactly as before', () => {
  const {list: off} = frames(ScoreView, shapes(false), LOOK, [4.3, 6.5, 12.1]);
  const {list: on} = frames(ScoreView, shapes(false), {...LOOK, showRoles: true}, [4.3, 6.5, 12.1]);
  on.forEach((frame, i) => assert.equal(frame.calls, off[i].calls));
  // A vocal (melody) lane that carries roles anyway: the core takes roles from pitched lanes only (MODEL.md).
  const model = fullModel();
  model.lanes = [model.lanes[0]];
  model.lanes[0].roles = model.lanes[0].notes.map(() => 0);
  model.lanes[0].leadLines = [[0, 60]];
  const times = [9.9, 10.2, 10.7, 30.5];
  const a = frames(ScoreView, model, {effects: 'off', showRoles: true}, times).list, b = frames(ScoreView, model, {effects: 'off'}, times).list;
  a.forEach((frame, i) => assert.equal(frame.calls, b[i].calls, `${times[i]} 秒：人声被分了主 / 伴`));
  assert.equal(ScoreView.create(mockCanvas().canvas, model, () => 0).layers().roles, false);
});

test('merged timbres and simplified notes keep each note\'s role; a joined note is lead if any piece was; a lane without roles is drawn as notes', () => {
  const {notes} = ScoreView.simplifyNotes([[0, 0.5, 60, 90, 0], [0.52, 0.5, 60, 90, 1], [2, 0.5, 62, 90, 0]]);
  assert.deepEqual(notes.map(n => n[4]), [1, 0]);
  assert.deepEqual(ScoreView.simplifyNotes([[0, 0.5, 60, 90], [0.52, 0.5, 60, 90]]).notes, [[0, 1.02, 60, 90]]);
  // Merged: the clean guitar all accompaniment, the acoustic guitar without roles: the acoustic note at 12 s is a note.
  const model = fullModel();
  model.lanes[1].roles = model.lanes[1].notes.map(() => 0);
  const look = {effects: 'off', laneHeights: 'fixed', simplify: false};
  const off = frames(ScoreView, model, look, [12.2]).list[0], on = frames(ScoreView, model, {...look, showRoles: true}, [12.2]).list[0];
  const acoustic = off.bars.filter(b => !on.bars.some(o => JSON.stringify(o) === JSON.stringify(b)));
  assert.ok(on.stats.blocked > 0, '电吉他那三个连着的伴奏音成块');
  assert.ok(off.bars.length - acoustic.length > 0);
  // The acoustic guitar's two notes (9 s and 12 s) are bars in both drawings.
  const shown = on.bars.filter(b => off.bars.some(o => JSON.stringify(o) === JSON.stringify(b)));
  assert.ok(shown.length >= 2);
  // At 9 s both guitars strike 60 together: the clean guitar's note goes into its block, the acoustic one (no roles)
  // is still drawn as a note. Off there are two identical bars; on, exactly one.
  const at9 = frames(ScoreView, model, look, [9.05]).list[0], on9 = frames(ScoreView, model, {...look, showRoles: true}, [9.05]).list[0];
  const twins = at9.bars.filter((b, i) => at9.bars.some((o, j) => j !== i && JSON.stringify(o) === JSON.stringify(b)));
  assert.equal(twins.length, 2, '关着时 9 秒两把吉他同一个音画两次');
  assert.equal(on9.bars.filter(b => JSON.stringify(b) === JSON.stringify(twins[0])).length, 1, '没有主 / 伴的那一个照逐音画，另一个收进块');
});

test('roles that do not fit the notes are ignored, not guessed; lead lines without usable roles are ignored', () => {
  for (const roles of [[1, 0], 'lead', [1, 0, 1, 0, 1, 2]]) {
    const model = fullModel();
    model.lanes[1].roles = roles;
    model.lanes[1].leadLines = [[0, 60]];
    const view = ScoreView.create(mockCanvas().canvas, model, () => 0);
    assert.equal(view.layers().roles, false, JSON.stringify(roles));
  }
});

test('the blocks are made once from the model, not every frame', () => {
  const model = shapes();
  const view = ScoreView.create(mockCanvas(800, 400).canvas, model, () => 0, {...LOOK, showRoles: true});
  view.draw(6.5);
  // Breaking the notes after the first frame changes nothing drawn: the shapes were made from the model already.
  const before = (() => { const s = mockCanvas(800, 400); const v = ScoreView.create(s.canvas, shapes(), () => 0, {...LOOK, showRoles: true}); v.draw(0); s.reset(); v.draw(7); return JSON.stringify(s.calls); })();
  model.lanes[0].roles.fill(1);
  const s = mockCanvas(800, 400);
  const again = ScoreView.create(s.canvas, shapes(), () => 0, {...LOOK, showRoles: true});
  again.draw(0); s.reset(); again.draw(7);
  assert.equal(JSON.stringify(s.calls), before);
});
