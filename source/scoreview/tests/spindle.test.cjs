'use strict';
// Spindles for bowed strings (shapeSet: 'spindle', work/score-shapes-20261114/SPEC-3.md): strings and violin thin at
// both ends, full in the middle; struck lanes as in the two-way set; everything else as before. The three-way set is
// gone: 'three' reads as 'two'. Off, on without a set, 'two', 'three' and unknown values draw exactly what 0.17.0 drew.
// Each rule has an entry in mutations.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {ScoreView, mockCanvas, fullModel} = require('./helpers.cjs');

const BEFORE = require('./fixtures/score-view-0.17.0.js');
const DATA = path.join(__dirname, '..', '..', '..', 'work', 'scoreview-20261110', 'data');
const P = ScoreView.SPINDLE;
const steps = (from, to, count) => Array.from({length: count}, (_, i) => from + (to - from) * i / (count - 1));
const near = (a, b, eps = 0.01) => Math.abs(a - b) < eps;
const pilot = name => JSON.parse(fs.readFileSync(path.join(DATA, name, 'bundle.json'), 'utf8'));
const SPIN = {showShapes: true, shapeSet: 'spindle'};

function frames(core, model, options, times) {
  const surface = mockCanvas(800, 400);
  const view = core.create(surface.canvas, model, () => 0, options);
  view.setCover({width: 480, height: 480});
  view.draw(0);
  return {view, list: times.map(time => { surface.reset(); const stats = view.draw(time); return {calls: JSON.stringify(surface.calls), stats, bars: surface.bars(), surface: surface.calls.slice()}; })};
}
const LOOK = {effects: 'off', simplify: false, mergeTimbres: false, laneHeights: 'fixed'};
// One lane: a long note (4 s: ramps, then a flat middle), a short one (0.3 s: an olive), two notes a semitone apart.
function oneLane(group, kind = 'pitched') {
  const model = fullModel();
  for (const key of ['chords', 'chordTones', 'sections', 'captions', 'bars']) delete model[key];
  model.lanes = [{id: group, label: group, kind, group, notes: [[4, 4, 60, 90], [9, 0.3, 64, 90], [10, 0.4, 62, 90], [11, 0.4, 63, 90]]}];
  return model;
}
function geometry(off) {
  const bars = off.bars.slice().sort((a, b) => a.x - b.x);
  assert.equal(bars.length, 4);
  const [long, short, a, b] = bars;
  return {long, short, T: long.height, centre: bar => bar.y + bar.height / 2,
          semitone: Math.abs((a.y + a.height / 2) - (b.y + b.height / 2)), pps: (b.x - a.x) / 1};
}
// The fill paths of a frame: every point the outline passes through (curve controls apart), and its curves.
function paths(calls) {
  const out = [];
  let current = null;
  for (const call of calls) {
    if (call.name === 'beginPath') current = {rects: [], points: [], curves: []};
    else if (!current) continue;
    else if (call.name === 'rect' || call.name === 'roundRect') current.rects.push(call.args);
    else if (call.name === 'moveTo' || call.name === 'lineTo') current.points.push({x: call.args[0], y: call.args[1]});
    else if (call.name === 'quadraticCurveTo') { current.points.push({x: call.args[2], y: call.args[3]}); current.curves.push(call.args); }
    else if (call.name === 'fill') { out.push({...current, style: call.fillStyle, shadow: call.state.shadowBlur}); current = null; }
  }
  return out;
}
const spindles = frame => paths(frame.surface).filter(p => p.curves.length);
const fills = frame => frame.surface.filter(call => call.name === 'fill').map(call => [call.fillStyle, call.state.shadowColor, call.state.shadowBlur, call.alpha]);

test("shapeSet: 'two' by default; 'spindle' taken; 'three' (withdrawn) and anything else read as 'two'", () => {
  assert.equal(ScoreView.VERSION, '0.19.0');
  assert.equal(ScoreView.DEFAULTS.shapeSet, 'two');
  const view = ScoreView.create(mockCanvas().canvas, oneLane('strings'), () => 0);
  for (const value of ['three', 'four', 3, null, 'SPINDLE']) { view.setOptions({shapeSet: value}); assert.equal(view.options().shapeSet, 'two', String(value)); }
  view.setOptions({shapeSet: 'spindle'});
  assert.equal(view.options().shapeSet, 'spindle');
  assert.deepEqual([...ScoreView.SPINDLE_GROUPS], ['strings', 'violin']);
});

test('the three-way set is gone from the core', () => {
  const text = fs.readFileSync(process.env.SCOREVIEW_CORE || path.join(__dirname, '..', 'score-view.js'), 'utf8');
  for (const word of ['SHAPE_BY_GROUP_3', 'SHAPES_3', 'fillShapes3', "'plucked'", 'wedgeTaper', 'diamondCap']) assert.ok(!text.includes(word), `核心里还有三类的残留：${word}`);
  assert.equal(ScoreView.SHAPES_3, undefined);
  assert.equal(ScoreView.SHAPE_BY_GROUP_3, undefined);
});

test("shapes off, on without a set, 'two', 'three' and unknown values draw exactly what 0.17.0 drew", () => {
  assert.equal(BEFORE.VERSION, '0.17.0');
  let compared = 0;
  for (const model of [fullModel(), oneLane('strings'), oneLane('violin'), oneLane('piano'), pilot('qilixiang'), pilot('meguri')]) {
    const times = steps(0, model.track.duration, 21).map(t => t + 0.013).concat([4.05, 6, 9.1, 10.2]);
    for (const look of [{}, {fxPreset: 'strong'}, {focusGroup: 'strings', simplify: false, mergeTimbres: false}]) {
      for (const shapes of [{}, {showShapes: true}]) {
        const old = frames(BEFORE, model, {...look, ...shapes}, times).list;
        const givens = shapes.showShapes ? ['two', 'three', 'x', undefined].map(set => ({...look, ...shapes, ...(set ? {shapeSet: set} : {})}))
          : [{...look}, {...look, shapeSet: 'spindle'}];
        for (const given of givens) {
          frames(ScoreView, model, given, times).list.forEach((frame, i) => {
            assert.equal(frame.calls, old[i].calls, `${JSON.stringify(given)} ${times[i]} 秒：和 0.17.0 画的不一样`);
            assert.deepEqual(frame.stats, old[i].stats);
            compared++;
          });
        }
      }
    }
  }
  assert.ok(compared > 2000, String(compared));
});

for (const group of ['strings', 'violin']) {
  test(`${group}: a spindle — each end ${P.share} of the note (never over ${P.rampMax} s), full in the middle (at least ${P.lift} px over the note; up to ${P.swell} times it within ${P.room} semitones), tips ${P.tip} of full (never under ${P.tipMin} px)`, () => {
    const off = frames(ScoreView, oneLane(group), LOOK, [3]).list[0], on = frames(ScoreView, oneLane(group), {...LOOK, ...SPIN}, [3]).list[0];
    const g = geometry(off);
    const full = Math.max(g.T + P.lift, Math.min(g.T * P.swell, g.semitone * P.room)), tip = Math.min(full, Math.max(P.tipMin, full * P.tip));
    assert.ok(full >= g.T + P.lift - 1e-9, '中间比原来的条明显粗');
    assert.ok(tip < full / 3 && tip >= P.tipMin, '两头明显细、不细于 1 像素');
    const [p] = spindles(on);
    assert.ok(p, '有梭状的路径');
    const c = g.centre(g.long), x = g.long.x, end = x + g.long.width;
    const ramp = Math.min(g.long.width * P.share, P.rampMax * g.pps);
    assert.ok(near(ramp, P.rampMax * g.pps), '4 秒的长音：收放封顶在 rampMax 秒');
    const at = px => p.points.filter(q => near(q.x, px)).map(q => Math.round(Math.abs(q.y - c) * 1000) / 1000).sort((a, b) => a - b);
    const r = v => Math.round(v * 1000) / 1000;
    assert.deepEqual(at(x), [tip / 2, tip / 2].map(r), '起音处收尖');
    assert.deepEqual(at(end), [tip / 2, tip / 2].map(r), '音尾收尖');
    assert.deepEqual(at(x + ramp), [full / 2, full / 2].map(r), '起音后鼓到满');
    assert.deepEqual(at(end - ramp), [full / 2, full / 2].map(r), '音尾前开始收');
    assert.ok(end - ramp > x + ramp + 1, '长音中间有一段等粗的身子');
    assert.equal(p.curves.length, 4 * 4, '每个音四段曲线（软的两头），这一帧四个音');
    assert.equal(p.rects.length, 0, '没有方头');
    // The curves' control points sit half way along each ramp, at full height: a soft taper, not a corner.
    const controls = p.curves.filter(cv => cv[2] >= x - 1e-6 && cv[2] <= end + 1e-6 && cv[0] >= x - 1e-6 && cv[0] <= end + 1e-6).map(cv => r(cv[0] - x)).sort((a, b) => a - b);
    assert.deepEqual(controls, [ramp / 2, ramp / 2, g.long.width - ramp / 2, g.long.width - ramp / 2].map(r), '曲线的控制点在收放段的正中');
    // The short note (0.3 s): ramps by share, a small olive with only a short flat middle.
    const sx = g.short.x, sw = g.short.width, sr = sw * P.share, sc = g.centre(g.short);
    assert.ok(sr < P.rampMax * g.pps, '短音的收放按比例');
    const sAt = px => p.points.filter(q => near(q.x, px)).map(q => r(Math.abs(q.y - sc))).sort((a, b) => a - b);
    assert.deepEqual(sAt(sx + sr), [full / 2, full / 2].map(r), '短音按比例鼓到满');
    assert.deepEqual(sAt(sx + sw - sr), [full / 2, full / 2].map(r), '短音按比例开始收');
    assert.deepEqual(sAt(sx), [tip / 2, tip / 2].map(r), '短音起音处收尖');
  });
}

test('a squeezed lane: the tips stay at least a pixel, the middle never more than its cap above the note', () => {
  const model = fullModel();
  for (const key of ['chords', 'chordTones', 'sections', 'captions', 'bars']) delete model[key];
  model.lanes = Array.from({length: 8}, (_, k) => ({id: 'strings' + k, label: 's' + k, kind: 'pitched', group: 'strings',
    notes: [[4, 2, 40 + k, 90], ...Array.from({length: 30}, (_, i) => [20 + i * 0.5, 0.3, 40 + i * 2, 90])]}));
  const off = frames(ScoreView, model, LOOK, [3]).list[0], on = frames(ScoreView, model, {...LOOK, ...SPIN}, [3]).list[0];
  const T = off.bars[0].height;
  const bars = off.bars.slice().sort((a, b) => a.y - b.y);
  const semitone = Math.min(...bars.slice(1).map((b, i) => b.y - bars[i].y).filter(d => d > 1e-6));
  for (const p of spindles(on)) {
    const ys = p.points.map(q => q.y);
    const tallest = Math.max(...ys) - Math.min(...ys);
    assert.ok(tallest <= Math.max(T + P.lift, Math.min(T * P.swell, semitone * P.room)) + 1e-6, `中间 ${tallest} 超过上限`);
    // Each outline's first point and the point after it: the tip, at least tipMin tall.
    for (let i = 0; i + 7 < p.points.length; i += 8) assert.ok(Math.abs(p.points[i].y - p.points[i + 7].y) >= P.tipMin - 1e-6, '尖端不细于 1 像素');
  }
});

// Each note's outline is eight points (move, curve, line, curve, line, curve, line, curve): its height is its full thickness.
const noteHeights = p => Array.from({length: p.points.length / 8}, (_, k) => {
  const ys = p.points.slice(k * 8, k * 8 + 8).map(q => q.y);
  return Math.max(...ys) - Math.min(...ys);
});
test(`the full thickness: within ${P.room} semitones where the lane has room, but never less than ${P.lift} px over the note`, () => {
  // A melody-kind lane: thick notes on roomy semitones, so the semitone cap is what holds the swell back.
  const wide = oneLane('strings', 'melody');
  wide.lanes[0].notes.push([60, 1, 40, 90], [60, 1, 76, 90]);   // far out of the frame: they only widen the lane's range
  const off = frames(ScoreView, wide, LOOK, [3]).list[0], on = frames(ScoreView, wide, {...LOOK, ...SPIN}, [3]).list[0];
  const g = geometry(off);
  const capped = Math.max(g.T + P.lift, Math.min(g.T * P.swell, g.semitone * P.room));
  assert.ok(capped < g.T * P.swell - 0.5 && capped > g.T + P.lift + 0.5, `这条轨里起作用的是半音上限（${capped}，音符 ${g.T}，半音 ${g.semitone}）`);
  for (const h of noteHeights(spindles(on)[0])) assert.ok(near(h, capped), `满粗 ${h}，应是 ${capped}`);
  // A squeezed lane (under a pixel and a half a semitone): the cap would leave no swell, the lift keeps it.
  const model = fullModel();
  for (const key of ['chords', 'chordTones', 'sections', 'captions', 'bars']) delete model[key];
  model.lanes = Array.from({length: 8}, (_, k) => ({id: 'strings' + k, label: 's' + k, kind: 'pitched', group: 'strings',
    notes: [[2, 3, 40, 90], [2, 3, 88, 90], [2.5, 2, 41 + k, 90]]}));
  const sOff = frames(ScoreView, model, LOOK, [3]).list[0], sOn = frames(ScoreView, model, {...LOOK, ...SPIN}, [3]).list[0];
  const lane = sOff.bars.slice(0, 3).sort((a, b) => a.y - b.y);   // the first lane's three notes: 88, 41, 40
  assert.ok(near(lane[2].y - lane[1].y, (lane[2].y - lane[0].y) / 48), '前三个是同一条轨的音');
  const T = lane[0].height, semitone = (lane[2].y - lane[0].y) / 48;
  assert.ok(semitone * P.room < T + P.lift, `挤的轨（${semitone} 像素一个半音）：半音上限比底还低`);
  const heights = spindles(sOn).flatMap(noteHeights);
  assert.ok(heights.length >= 8);
  for (const h of heights) assert.ok(near(h, T + P.lift), `满粗 ${h}，应是音符 + ${P.lift} 像素 = ${T + P.lift}`);
});

test("struck lanes draw exactly as in 'two'; vocals, drums, the texture band and unknown groups exactly as before", () => {
  for (const group of ['piano', 'guitar', 'bass']) {
    const two = frames(ScoreView, oneLane(group), {...LOOK, showShapes: true, shapeSet: 'two'}, [3, 4.1, 10.2]).list;
    const spin = frames(ScoreView, oneLane(group), {...LOOK, ...SPIN}, [3, 4.1, 10.2]).list;
    spin.forEach((frame, i) => assert.equal(frame.calls, two[i].calls, group));
  }
  for (const model of [oneLane('synth'), oneLane('other')]) {
    const off = frames(ScoreView, model, LOOK, [3, 10.2]).list, on = frames(ScoreView, model, {...LOOK, ...SPIN}, [3, 10.2]).list;
    on.forEach((frame, i) => assert.equal(frame.calls, off[i].calls, model.lanes[0].group));
  }
  const model = fullModel();
  model.lanes = model.lanes.filter(lane => lane.group === 'vocals' || lane.group === 'drums');
  model.lanes.push({id: 'texture', label: '其它', kind: 'texture', group: 'other', groupLabel: '其它', level: {hop: 1, db: Array(60).fill(-20)}});
  for (const look of [{}, {fxPreset: 'strong', showTexture: true}]) {
    const off = frames(ScoreView, model, look, [9.5, 10.2, 30.5]).list, on = frames(ScoreView, model, {...look, ...SPIN}, [9.5, 10.2, 30.5]).list;
    on.forEach((frame, i) => assert.equal(frame.calls, off[i].calls));
  }
});

test('the same colours and light in every state, the same fills in the same order (one path a bucket), the same effects; a sounding note is a spindle too', () => {
  for (const look of [LOOK, {...LOOK, effects: 'light'}, {...LOOK, fxPreset: 'strong'}, {...LOOK, fxPreset: 'keys'}, {...LOOK, fxPreset: 'ink'}]) {
    for (const t of [3, 4.1, 6, 9.1, 10.2, 12]) {
      const off = frames(ScoreView, oneLane('strings'), look, [t]).list[0], on = frames(ScoreView, oneLane('strings'), {...look, ...SPIN}, [t]).list[0];
      assert.deepEqual(fills(on), fills(off), `${JSON.stringify(look)} ${t} 秒：颜色、亮度或阴影变了`);
      assert.deepEqual(on.stats.fx, off.stats.fx, '特效的分量和位置不该变');
    }
  }
  const on = frames(ScoreView, oneLane('strings'), {...LOOK, ...SPIN}, [6]).list[0];
  const lit = paths(on.surface).filter(p => p.shadow > 0);
  assert.ok(lit.length === 1 && lit[0].curves.length === 4, '正在响的音也是梭状');
});

test('a lane listened to alone keeps its spindles; notes are shaped after simplifying', () => {
  for (const focusGroup of ['strings', 'piano']) {
    const frame = frames(ScoreView, oneLane('strings'), {...LOOK, ...SPIN, focusGroup}, [3]).list[0];
    assert.equal(spindles(frame).length, 1, focusGroup);
  }
  const pieces = oneLane('strings');
  pieces.lanes[0].notes = [[4, 0.5, 60, 90], [4.52, 0.5, 60, 90], [9, 0.5, 62, 90]];
  assert.equal(frames(ScoreView, pieces, {...LOOK, simplify: true, ...SPIN}, [3]).list[0].stats.shaped, 2);
  assert.equal(frames(ScoreView, pieces, {...LOOK, simplify: false, ...SPIN}, [3]).list[0].stats.shaped, 3);
});
