'use strict';
// String links (shapeLinks, work/score-shapes-20261114/SPEC-4.md C, redone by SPEC-6.md part 1): with the spindles on,
// a string lane's notes are joined only where a single line hands over: the gap, the overlap, the pitch step, both
// notes long enough, and no other note of the lane anywhere across the bend. The bend runs from where the earlier
// note's core starts to taper to where the later one's is full, a slow S level at both ends; the two cores stop square
// there; its first half is the earlier note's (light, thickness), its second the later note's. Off by default, only
// with the spindles. Each rule has an entry in mutations.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const {ScoreView, mockCanvas, fullModel} = require('./helpers.cjs');

const S = ScoreView.STRANDS, P = ScoreView.SPINDLE;
const near = (a, b, eps = 0.01) => Math.abs(a - b) < eps;
const LOOK = {effects: 'off', simplify: false, mergeTimbres: false, laneHeights: 'fixed'};
const ON = {...LOOK, showShapes: true, shapeSet: 'spindle', shapeLinks: true};
const OFF = {...ON, shapeLinks: false};

function lane(notes, group = 'strings') {
  const model = fullModel();
  for (const key of ['chords', 'chordTones', 'sections', 'captions', 'bars']) delete model[key];
  model.lanes = [{id: group, label: group, kind: 'pitched', group, notes}];
  return model;
}
function frame(model, options, time = 0.5) {
  const surface = mockCanvas(800, 400);
  const view = ScoreView.create(surface.canvas, model, () => 0, options);
  view.setCover({width: 480, height: 480});
  view.draw(0);
  surface.reset();
  const stats = view.draw(time);
  return {stats, calls: surface.calls.slice(), json: JSON.stringify(surface.calls), bars: surface.bars()};
}
// The half curves of a frame: where each starts, its controls and end, its stroke style and width.
function halves(calls) {
  const out = [];
  let from = null, pending = [];
  for (const call of calls) {
    if (call.name === 'beginPath') pending = [];
    else if (call.name === 'moveTo') from = call.args;
    else if (call.name === 'bezierCurveTo') pending.push({from, args: call.args});
    else if (call.name === 'stroke') { for (const h of pending) out.push({...h, style: call.strokeStyle, width: call.lineWidth}); pending = []; }
  }
  return out;
}
// The spindle paths of a frame, layer by layer (each bucket: the halo, then the core), with their calls.
function layers(calls, which) {
  const out = [];
  let current = null, spindle = 0;
  for (const call of calls) {
    if (call.name === 'beginPath') current = {moves: [], curves: 0, lines: [], calls: []};
    else if (!current) continue;
    if (current && call.name !== 'fill') current.calls.push([call.name, call.args]);
    if (call.name === 'moveTo') current.moves.push(call.args);
    else if (call.name === 'lineTo') current.lines.push(call.args);
    else if (call.name === 'quadraticCurveTo') current.curves++;
    else if (call.name === 'fill') { if (current.curves || current.moves.length) { if (spindle++ % 2 === (which === 'core' ? 1 : 0)) out.push({...current, style: call.fillStyle}); } current = null; }
  }
  return out;
}
const linkCount = (notes, group = 'strings', time = 0.5) => frame(lane(notes, group), ON, time).stats.strands || 0;
const centre = bar => bar.y + bar.height / 2;
// A melody that hands over cleanly: a = 0–1 s at 60, b = 1.05–2.05 s at 62.
const PAIR = [[0, 1, 60, 90], [1.05, 1, 62, 90]];

test('shapeLinks: off by default, booleans only; nothing drawn unless the spindles are on', () => {
  assert.equal(ScoreView.DEFAULTS.shapeLinks, false);
  const view = ScoreView.create(mockCanvas().canvas, lane(PAIR), () => 0);
  for (const value of ['yes', 1, null]) { view.setOptions({shapeLinks: value}); assert.equal(view.options().shapeLinks, false, String(value)); }
  view.setOptions({shapeLinks: true});
  assert.equal(view.options().shapeLinks, true);
  assert.equal(linkCount(PAIR), 1, '梭状 + 连线：连');
  for (const options of [OFF, {...ON, shapeSet: 'two'}, {...ON, showShapes: false}, {...LOOK, shapeLinks: true}]) {
    const with_ = frame(lane(PAIR), options), without = frame(lane(PAIR), {...options, shapeLinks: false});
    assert.equal(halves(with_.calls).length, 0, JSON.stringify(options));
    assert.equal(with_.json, without.json, `${JSON.stringify(options)}：连线开关不该改变画面`);
  }
});

test(`the gap: up to ${S.gap} s after the end, up to ${S.overlap} s before it; both notes at least ${S.minDur} s`, () => {
  assert.equal(linkCount([[0, 1, 60, 90], [1 + S.gap - 0.01, 1, 62, 90]]), 1, '空隙在范围内');
  assert.equal(linkCount([[0, 1, 60, 90], [1 + S.gap + 0.03, 1, 62, 90]]), 0, '空隙太大');
  assert.equal(linkCount([[0, 1, 60, 90], [1 - S.overlap + 0.01, 1, 62, 90]]), 1, '略微重叠');
  assert.equal(linkCount([[0, 1, 60, 90], [1 - S.overlap - 0.03, 1, 62, 90]]), 0, '重叠太多');
  assert.equal(linkCount([[0, S.minDur - 0.03, 60, 90], [S.minDur, 1, 62, 90]]), 0, '前一个音太短');
  assert.equal(linkCount([[0, 1, 60, 90], [1.05, S.minDur - 0.03, 62, 90]]), 0, '后一个音太短');
  assert.equal(linkCount([[0, S.minDur + 0.03, 60, 90], [S.minDur + 0.06, S.minDur + 0.03, 62, 90]]), 1, '够长就连');
});

test(`the pitch step: at most ${S.step} semitones, up or down`, () => {
  assert.equal(linkCount([[0, 1, 60, 90], [1.05, 1, 60 + S.step, 90]]), 1);
  assert.equal(linkCount([[0, 1, 60, 90], [1.05, 1, 60 - S.step, 90]]), 1);
  assert.equal(linkCount([[0, 1, 60, 90], [1.05, 1, 60 + S.step + 1, 90]]), 0);
});

test('only a single line: any other note of the lane sounding across the bend (not only at the hand-over) and there is no link', () => {
  // The bend runs from 1 - 0.4 = 0.6 s (where a starts to taper) to 1.05 + 0.4 = 1.45 s (where b is full).
  assert.equal(linkCount([...PAIR, [0.62, 0.1, 72, 90]]), 0, '前一个音收尖的那段里有别的音');
  assert.equal(linkCount([...PAIR, [1.3, 0.1, 72, 90]]), 0, '后一个音鼓起来的那段里有别的音');
  assert.equal(linkCount([...PAIR, [0, 3, 72, 90]]), 0, '和声：一直有别的音在响');
  assert.equal(linkCount([...PAIR, [0, 0.5, 72, 90], [1.5, 0.5, 72, 90]]), 1, '弯的前后有别的音不算');
  // Two candidates: each sounds across the other's bend, so neither is joined; one note joins out once at most.
  assert.equal(linkCount([[0, 1, 60, 90], [1.05, 1, 62, 90], [1.05, 1, 64, 90]]), 0, '分成两个声部：不连');
  assert.equal(linkCount([[0, 1, 60, 90], [0, 1, 64, 90], [1.05, 1, 62, 90]]), 0, '两个音交给一个：不连');
  // A chain: each note joins on to the next.
  assert.equal(linkCount([[0, 1, 60, 90], [1.05, 1, 62, 90], [2.1, 1, 64, 90], [3.15, 1, 65, 90]], 'violin', 2), 3, '一串音连成一条线');
});

test('the bend: from where the earlier core starts to taper to where the later core is full, a slow S level at both ends, cut at its middle', () => {
  const model = lane(PAIR);
  const hs = halves(frame(model, ON).calls);
  assert.equal(hs.length, 2, '一条连线是前后两半');
  const bars = frame(model, LOOK).bars.sort((a, b) => a.x - b.x);
  const rampA = Math.min(bars[0].width * P.share, P.rampMax * 1e9), rampB = Math.min(bars[1].width * P.share, P.rampMax * 1e9);
  const a = bars[0].x + bars[0].width - rampA, b = bars[1].x + rampB, ya = centre(bars[0]), yb = centre(bars[1]);
  const [first, second] = hs.sort((p, q) => p.from[0] - q.from[0]);
  const m = (a + b) / 2, ym = (ya + yb) / 2;
  assert.ok(near(first.from[0], a) && near(first.from[1], ya), '从前一个音的芯开始收尖处出发');
  assert.ok(near(second.args[4], b) && near(second.args[5], yb), '到后一个音的芯鼓满处');
  assert.ok(near(first.args[1], ya), '起点切线水平');
  assert.ok(near(second.args[3], yb), '终点切线水平');
  assert.ok(near(first.args[4], m) && near(first.args[5], ym) && near(second.from[0], m) && near(second.from[1], ym), '在正中分成两半，接得上');
  // Tangent continuity at the middle: the incoming and outgoing directions are the same.
  const din = [first.args[4] - first.args[2], first.args[5] - first.args[3]], dout = [second.args[0] - second.from[0], second.args[1] - second.from[1]];
  assert.ok(near(din[0] * dout[1] - din[1] * dout[0], 0, 1e-6) && din[0] * dout[0] >= 0, '中间没有折角');
  assert.ok(b - a > (bars[1].x - (bars[0].x + bars[0].width)) + 10, '弯占了两个音的收尖段，不是两根条之间搭桥');
});

test("the cores stop square where the bend takes over; the halos are unchanged", () => {
  const on = frame(lane(PAIR), ON), off = frame(lane(PAIR), OFF);
  const curves = paths => paths.reduce((sum, p) => sum + p.curves, 0);
  const coreOn = layers(on.calls, 'core'), coreOff = layers(off.calls, 'core');
  assert.equal(curves(coreOff), 8, '不连时两个音各四段曲线');
  assert.equal(curves(coreOn), 4, '连上的一头各少两段：前一个音的尾、后一个音的头是方的');
  const bars = frame(lane(PAIR), LOOK).bars.sort((p, q) => p.x - q.x);
  const ramp = bars[1].width * P.share;
  assert.ok(coreOn.some(p => p.moves.some(mv => near(mv[0], bars[1].x + ramp))), '后一个音的芯从鼓满处开始');
  assert.deepEqual(layers(on.calls, 'halo').map(p => [p.calls, p.style]), layers(off.calls, 'halo').map(p => [p.calls, p.style]), '晕不变');
});

test("each half takes its own note's light and core thickness", () => {
  const notes = [[2, 1, 60, 90], [3.05, 1, 62, 90]];
  const styles = time => halves(frame(lane(notes), ON, time).calls).sort((p, q) => p.from[0] - q.from[0]).map(h => h.style);
  assert.deepEqual(styles(1).map(s => /0\.34\)$/.test(s)), [true, true], '都还没弹');
  const crossing = styles(3.02);
  assert.match(crossing[0], /0\.92\)$/, '前一半：前一个音已弹完');
  assert.match(crossing[1], /0\.34\)$/, '后一半：后一个音还没弹');
  assert.match(styles(2.5)[0], /,1\)$/, '前一个音正在响：前一半亮');
  const bars = frame(lane(notes), LOOK, 1).bars;
  const T = bars[0].height, core = Math.min(T, Math.max(P.coreMin, T * P.core));
  for (const h of halves(frame(lane(notes), ON, 1).calls)) assert.ok(near(h.width, Math.round(core * 4) / 4), `线宽 ${h.width} = 芯 ${core}`);
  // With thickness by pitch, each half is its own note's core.
  const wide = [[2, 1, 40, 90], [3.05, 1, 45, 90], [9, 0.4, 96, 90]];
  const ws = halves(frame(lane(wide), {...ON, pitchWeight: true}, 1).calls).sort((p, q) => p.from[0] - q.from[0]).map(h => h.width);
  assert.equal(ws.length, 2);
});

test('only string lanes; drawn under the notes; the notes themselves otherwise unchanged', () => {
  for (const group of ['piano', 'guitar', 'bass', 'vocals', 'synth']) assert.equal(linkCount(PAIR, group), 0, group);
  const on = frame(lane(PAIR), ON).calls;
  const firstFill = on.findIndex(call => call.name === 'fill'), firstStroke = on.findIndex(call => call.name === 'stroke' && call.strokeStyle.startsWith('rgba(217'));
  assert.ok(firstStroke >= 0 && firstStroke < firstFill, '连线画在音符下面');
  // A note with no link keeps its core exactly.
  const lone = [[0, 1, 60, 90], [1.05, 1, 62, 90], [5, 1, 70, 90]];
  const count = options => layers(frame(lane(lone), options).calls, 'core').reduce((sum, p) => sum + p.curves, 0);
  assert.equal(count(OFF) - count(ON), 4, '只有连上的两头变方，第三个音照旧');
});
