'use strict';
// Spindles for bowed strings (shapeSet: 'spindle', work/score-shapes-20261114/SPEC-3.md, SPEC-4.md): strings and
// violin drawn in two layers, a faint halo (the spindle's outline, thin at both ends, full in the middle) and a thin
// core of the same outline at the note's own light; struck lanes as in the two-way set; everything else as before.
// The three-way set is gone: 'three' reads as 'two'. Off, on without a set, 'two', 'three' and unknown values (with
// or without shapeLinks, pitchWeight off) draw exactly what 0.17.0 drew. Each rule has an entry in mutations.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {ScoreView, mockCanvas, fullModel, alike} = require('./helpers.cjs');

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
const fill = call => [call.fillStyle, call.state.shadowColor, call.state.shadowBlur, call.alpha];
const fills = frame => frame.surface.filter(call => call.name === 'fill').map(fill);
// The fills of a frame with the spindles' halos left out: each bucket's spindles are a halo fill, then a core fill.
function withoutHalos(frame) {
  const out = [];
  let curved = false, spindle = 0;
  for (const call of frame.surface) {
    if (call.name === 'beginPath') curved = false;
    else if (call.name === 'quadraticCurveTo') curved = true;
    else if (call.name === 'fill') {
      if (curved && spindle++ % 2 === 0) continue;
      out.push(fill(call));
    }
  }
  return out;
}
const alphaOf = style => Number(/,\s*([\d.]+)\)$/.exec(style)[1]);
const colourOf = style => style.replace(/,\s*[\d.]+\)$/, ')');
const heights = p => Array.from({length: p.points.length / 8}, (_, k) => {
  const ys = p.points.slice(k * 8, k * 8 + 8).map(q => q.y);
  return Math.max(...ys) - Math.min(...ys);
});

test("shapeSet: 'two' by default; 'spindle' taken; 'three' (withdrawn) and anything else read as 'two'", () => {
  assert.equal(ScoreView.VERSION, '0.28.3');
  assert.equal(ScoreView.DEFAULTS.shapeSet, 'two');
  const view = ScoreView.create(mockCanvas().canvas, oneLane('strings'), () => 0);
  for (const value of ['three', 'four', 3, null, 'SPINDLE']) { view.setOptions({shapeSet: value}); assert.equal(view.options().shapeSet, 'two', String(value)); }
  view.setOptions({shapeSet: 'spindle'});
  assert.equal(view.options().shapeSet, 'spindle');
  assert.deepEqual([...ScoreView.SPINDLE_GROUPS], ['strings', 'violin', 'winds']);
});

test('the three-way set is gone from the core, and so is the solid spindle', () => {
  const text = fs.readFileSync(process.env.SCOREVIEW_CORE || path.join(__dirname, '..', 'score-view.js'), 'utf8');
  for (const word of ['SHAPE_BY_GROUP_3', 'SHAPES_3', 'fillShapes3', "'plucked'", 'wedgeTaper', 'diamondCap', 'SPINDLE.lift', 'SPINDLE.room']) {
    assert.ok(!text.includes(word), `核心里还有残留：${word}`);
  }
  assert.equal(ScoreView.SHAPES_3, undefined);
  assert.equal(ScoreView.SPINDLE.lift, undefined);
});

test("shapes off (spindle and links given or not) draw exactly what 0.17.0 drew; on without a set, 'three' and unknown values (shapeLinks or not, pitchWeight off) draw exactly 'two'", () => {
  assert.equal(BEFORE.VERSION, '0.17.0');
  let compared = 0;
  // Both cores get the same input, one the old and the new rules agree on (helpers.alike).
  for (const model of [fullModel(), oneLane('strings'), oneLane('violin'), oneLane('piano'), pilot('qilixiang'), pilot('meguri')].map(alike)) {
    const times = steps(0, model.track.duration, 21).map(t => t + 0.013).concat([4.05, 6, 9.1, 10.2]);
    // Timbre tracks apart with names (0.22.0 numbers icons there instead: SPEC-7 ⑤, looks.test.cjs).
    for (const look of [{}, {fxPreset: 'strong'}, {focusGroup: 'strings', simplify: false, mergeTimbres: false, laneLabels: 'text'}]) {
      for (const shapes of [{}, {showShapes: true}]) {
        // With the shapes on, 'two' itself is the reference: 0.22.0 made the struck head smaller (SPEC-7).
        const old = shapes.showShapes ? frames(ScoreView, model, {...look, ...shapes, shapeSet: 'two'}, times).list : frames(BEFORE, model, {...look, ...shapes}, times).list;
        const givens = shapes.showShapes
          ? [...['two', 'three', 'x', undefined].map(set => ({...look, ...shapes, ...(set ? {shapeSet: set} : {})})),
             {...look, ...shapes, shapeSet: 'two', shapeLinks: true, pitchWeight: false}, {...look, ...shapes, shapeLinks: true}]
          : [{...look}, {...look, shapeSet: 'spindle'}, {...look, shapeSet: 'spindle', shapeLinks: true, pitchWeight: false}];
        for (const given of givens) {
          frames(ScoreView, model, given, times).list.forEach((frame, i) => {
            assert.equal(frame.calls, old[i].calls, `${JSON.stringify(given)} ${times[i]} 秒：和 ${shapes.showShapes ? '「two」' : '0.17.0'} 画的不一样`);
            assert.deepEqual(frame.stats, old[i].stats);
            compared++;
          });
        }
      }
    }
  }
  assert.ok(compared > 3000, String(compared));
});

for (const group of ['strings', 'violin']) {
  test(`${group}: two layers — a halo (the spindle, ${P.swell} times the note) and a core on the centre line (${P.core} of the note, never over it); each end ${P.share} of the note (never over ${P.rampMax} s)`, () => {
    const off = frames(ScoreView, oneLane(group), LOOK, [3]).list[0], on = frames(ScoreView, oneLane(group), {...LOOK, ...SPIN}, [3]).list[0];
    const g = geometry(off);
    const layers = spindles(on);
    assert.equal(layers.length, 2, '还没弹的这一桶：晕一次、芯一次');
    const [halo, core] = layers;
    const r = v => Math.round(v * 1000) / 1000;
    const c = g.centre(g.long), x = g.long.x, end = x + g.long.width;
    const ramp = Math.min(g.long.width * P.share, P.rampMax * g.pps);
    assert.ok(near(ramp, P.rampMax * g.pps), '4 秒的长音：收放封顶在 rampMax 秒');
    const fullOf = {halo: g.T * P.swell, core: Math.min(g.T, Math.max(P.coreMin, g.T * P.core))};
    const tipOf = {halo: Math.min(fullOf.halo, Math.max(P.tipMin, fullOf.halo * P.tip)), core: Math.min(fullOf.core, Math.max(P.coreTipMin, fullOf.core * P.tip))};
    assert.ok(fullOf.core <= g.T + 1e-9, '芯不粗于原来的等粗条');
    assert.ok(fullOf.halo > fullOf.core * 2, '晕比芯宽得多');
    for (const [name, p] of [['halo', halo], ['core', core]]) {
      const full = fullOf[name], tip = tipOf[name];
      const at = px => p.points.filter(q => near(q.x, px)).map(q => r(Math.abs(q.y - c))).sort((a, b) => a - b);
      assert.deepEqual(at(x), [tip / 2, tip / 2].map(r), `${name}：起音处收尖`);
      assert.deepEqual(at(end), [tip / 2, tip / 2].map(r), `${name}：音尾收尖`);
      assert.deepEqual(at(x + ramp), [full / 2, full / 2].map(r), `${name}：起音后鼓到满`);
      assert.deepEqual(at(end - ramp), [full / 2, full / 2].map(r), `${name}：音尾前开始收`);
      assert.equal(p.curves.length, 4 * 4, `${name}：每个音四段曲线，这一帧四个音`);
      assert.equal(p.rects.length, 0, '没有方头');
      const controls = p.curves.filter(cv => cv[0] >= x - 1e-6 && cv[0] <= end + 1e-6 && cv[2] >= x - 1e-6 && cv[2] <= end + 1e-6).map(cv => r(cv[0] - x)).sort((a, b) => a - b);
      assert.deepEqual(controls, [ramp / 2, ramp / 2, g.long.width - ramp / 2, g.long.width - ramp / 2].map(r), `${name}：曲线的控制点在收放段的正中`);
      for (const h of heights(p)) assert.ok(near(h, full), `${name}：每个音的满粗 ${h}，应是 ${full}`);
    }
    // The short note (0.3 s): ramps by share, a small olive.
    const sx = g.short.x, sw = g.short.width, sr = sw * P.share, sc = g.centre(g.short);
    assert.ok(sr < P.rampMax * g.pps, '短音的收放按比例');
    const sAt = px => halo.points.filter(q => near(q.x, px)).map(q => r(Math.abs(q.y - sc))).sort((a, b) => a - b);
    assert.deepEqual(sAt(sx + sr), [fullOf.halo / 2, fullOf.halo / 2].map(r), '短音按比例鼓到满');
    assert.deepEqual(sAt(sx), [tipOf.halo / 2, tipOf.halo / 2].map(r), '短音起音处收尖');
  });
}

test(`the halo is fainter than the core (${P.halo} of its light; never under ${P.haloFloor} for notes to come), and the states keep their order`, () => {
  const style = {};
  for (const [t, bucket] of [[3, 'future'], [12, 'past']]) {
    const [halo, core] = spindles(frames(ScoreView, oneLane('strings'), {...LOOK, ...SPIN}, [t]).list[0]);
    assert.equal(colourOf(halo.style), colourOf(core.style), '晕和芯同色');
    style[bucket] = {halo: alphaOf(halo.style), core: alphaOf(core.style)};
  }
  const lit = spindles(frames(ScoreView, oneLane('strings'), {...LOOK, ...SPIN}, [6]).list[0]).filter(p => p.shadow > 0);
  assert.equal(lit.length, 2, '正在响的音：晕和芯都带光');
  style.active = {halo: alphaOf(lit[0].style), core: alphaOf(lit[1].style)};
  assert.equal(style.future.core, 0.34);
  assert.equal(style.past.core, 0.92);
  assert.equal(style.active.core, 1);
  assert.ok(near(style.future.halo, Math.max(P.haloFloor, 0.34 * P.halo), 0.001), `未弹的晕 ${style.future.halo}`);
  assert.ok(near(style.past.halo, 0.92 * P.halo, 0.001), `已弹的晕 ${style.past.halo}`);
  assert.ok(near(style.active.halo, P.halo, 0.001), `正在响的晕 ${style.active.halo}`);
  for (const bucket of ['future', 'past', 'active']) assert.ok(style[bucket].halo < style[bucket].core / 2, `${bucket}：晕比芯淡得多`);
  // The order of the states is the cores' order, halos too: still to come < played <= sounding.
  assert.ok(style.future.halo < style.past.halo && style.past.halo <= style.active.halo, '晕把状态的次序弄反了');
  assert.ok(style.future.halo >= P.haloFloor - 1e-9, '未弹的晕不能淡到看不见');
});

test('a dense lane: cores never thicker than the bars (so they do not merge more than the bars do); tips at least their floor', () => {
  const model = fullModel();
  for (const key of ['chords', 'chordTones', 'sections', 'captions', 'bars']) delete model[key];
  model.lanes = Array.from({length: 8}, (_, k) => ({id: 'strings' + k, label: 's' + k, kind: 'pitched', group: 'strings',
    notes: [[4, 2, 40 + k, 90], ...Array.from({length: 30}, (_, i) => [20 + i * 0.5, 0.3, 40 + i * 2, 90]), [4, 2, 41 + k, 90]]}));
  const off = frames(ScoreView, model, LOOK, [3]).list[0], on = frames(ScoreView, model, {...LOOK, ...SPIN}, [3]).list[0];
  const T = off.bars[0].height;
  const layers = spindles(on);
  assert.equal(layers.length, 16, '八条轨，每条晕一次、芯一次');
  layers.forEach((p, n) => {
    for (const h of heights(p)) assert.ok(n % 2 ? h <= T + 1e-6 : near(h, T * P.swell), n % 2 ? `芯 ${h} 比等粗条 ${T} 粗` : `晕 ${h}`);
    for (let i = 0; i + 7 < p.points.length; i += 8) {
      assert.ok(Math.abs(p.points[i].y - p.points[i + 7].y) >= (n % 2 ? P.coreTipMin : P.tipMin) - 1e-6, '尖端不细于下限');
    }
  });
});

test("struck lanes draw exactly as in 'two'; vocals, drums, the texture band and unknown groups exactly as before", () => {
  for (const group of ['piano', 'guitar', 'bass']) {
    const two = frames(ScoreView, oneLane(group), {...LOOK, showShapes: true, shapeSet: 'two'}, [3, 4.1, 10.2]).list;
    const spin = frames(ScoreView, oneLane(group), {...LOOK, ...SPIN, shapeLinks: true}, [3, 4.1, 10.2]).list;
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

test('the cores keep the colours, light and order of the fills (one path a layer a bucket), the effects stay; a sounding note is a spindle too', () => {
  for (const look of [LOOK, {...LOOK, effects: 'light'}, {...LOOK, fxPreset: 'strong'}, {...LOOK, fxPreset: 'keys'}, {...LOOK, fxPreset: 'ink'}]) {
    for (const t of [3, 4.1, 6, 9.1, 10.2, 12]) {
      const off = frames(ScoreView, oneLane('strings'), look, [t]).list[0], on = frames(ScoreView, oneLane('strings'), {...look, ...SPIN}, [t]).list[0];
      assert.deepEqual(withoutHalos(on), fills(off), `${JSON.stringify(look)} ${t} 秒：芯的颜色、亮度或阴影变了`);
      assert.equal(fills(on).length - fills(off).length, spindles(on).length / 2, '每桶多一次（晕），不多不少');
      assert.deepEqual(on.stats.fx, off.stats.fx, '特效的分量和位置不该变');
    }
  }
  const on = frames(ScoreView, oneLane('strings'), {...LOOK, ...SPIN}, [6]).list[0];
  const lit = paths(on.surface).filter(p => p.shadow > 0);
  assert.ok(lit.length === 2 && lit.every(p => p.curves.length === 4), '正在响的音也是梭状（晕和芯）');
});

test('a lane listened to alone keeps its spindles; notes are shaped after simplifying', () => {
  for (const focusGroup of ['strings', 'piano']) {
    const frame = frames(ScoreView, oneLane('strings'), {...LOOK, ...SPIN, focusGroup}, [3]).list[0];
    assert.equal(spindles(frame).length, 2, focusGroup);
  }
  const pieces = oneLane('strings');
  pieces.lanes[0].notes = [[4, 0.5, 60, 90], [4.52, 0.5, 60, 90], [9, 0.5, 62, 90]];
  assert.equal(frames(ScoreView, pieces, {...LOOK, simplify: true, ...SPIN}, [3]).list[0].stats.shaped, 2);
  assert.equal(frames(ScoreView, pieces, {...LOOK, simplify: false, ...SPIN}, [3]).list[0].stats.shaped, 3);
});
