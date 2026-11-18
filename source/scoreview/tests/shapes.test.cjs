'use strict';
// Notes shaped by how the instrument sounds (showShapes, work/score-shapes-20261114/SPEC.md). Off (the default) must
// draw exactly what 0.16.0 drew. On: piano and guitar notes (struck) as a head at the onset and a body tapering to a
// thin tail; the bass the same a step thicker; bowed strings and every other lane exactly as before. Colours, light,
// positions and effects do not change. Each rule has an entry in mutations.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {ScoreView, mockCanvas, fullModel, alike} = require('./helpers.cjs');
// The models here have no drum lane: a drum dot is then the widest one can be (drawDrums: 4 px tall, 1.6 times as wide).
const DOT = 1.6 * 4;

const BEFORE = require('./fixtures/score-view-0.16.0.js');
const DATA = path.join(__dirname, '..', '..', '..', 'work', 'scoreview-20261110', 'data');
const S = ScoreView.SHAPES;
const steps = (from, to, count) => Array.from({length: count}, (_, i) => from + (to - from) * i / (count - 1));
const near = (a, b, eps = 0.01) => Math.abs(a - b) < eps;
const pilot = name => JSON.parse(fs.readFileSync(path.join(DATA, name, 'bundle.json'), 'utf8'));

function frames(core, model, options, times) {
  const surface = mockCanvas(800, 400);
  const view = core.create(surface.canvas, model, () => 0, options);
  view.setCover({width: 480, height: 480});
  view.draw(0);
  return {view, list: times.map(time => { surface.reset(); const stats = view.draw(time); return {calls: JSON.stringify(surface.calls), stats, bars: surface.bars(), surface: surface.calls.slice()}; })};
}
const LOOK = {effects: 'off', simplify: false, mergeTimbres: false, laneHeights: 'fixed'};

// One lane of a group, notes far apart: a long one (2 s, tapers then holds), a short one (only a head), and two
// notes a semitone apart at known times (to read the semitone and the pixels a second off the frame).
function oneLane(group, kind = 'pitched') {
  const model = fullModel();
  for (const key of ['chords', 'chordTones', 'sections', 'captions', 'bars']) delete model[key];
  model.lanes = [{id: group, label: group, kind, group, notes: [[4, 2, 60, 90], [8, 0.02, 64, 90], [10, 0.4, 62, 90], [11, 0.4, 63, 90]]}];
  return model;
}
// The frame's geometry for oneLane, read from the bars drawn off: thickness, centre of each note, semitone, pps.
function geometry(off) {
  const bars = off.bars.slice().sort((a, b) => a.x - b.x);
  assert.equal(bars.length, 4, '关着时四个音四条');
  const [long, short, a, b] = bars;
  return {long, short, a, b, T: long.height, centre: bar => bar.y + bar.height / 2,
          semitone: Math.abs((a.y + a.height / 2) - (b.y + b.height / 2)), pps: (b.x - a.x) / 1};
}
// The straight sides drawn in one fill path, and the rects in it.
function paths(calls) {
  const out = [];
  let current = null;
  for (const call of calls) {
    if (call.name === 'beginPath') current = {rects: [], points: []};
    else if (!current) continue;
    else if (call.name === 'rect' || call.name === 'roundRect') current.rects.push(call.args);
    else if (call.name === 'moveTo' || call.name === 'lineTo') current.points.push({x: call.args[0], y: call.args[1], pen: call.name === 'lineTo'});
    else if (call.name === 'fill') { out.push({...current, style: call.fillStyle, shadow: [call.state.shadowColor, call.state.shadowBlur]}); current = null; }
  }
  return out;
}
const fills = frame => frame.surface.filter(call => call.name === 'fill').map(call => [call.fillStyle, call.state.shadowColor, call.state.shadowBlur, call.alpha]);

test('the default is off; showShapes takes booleans only; the version moved up a step', () => {
  assert.equal(ScoreView.VERSION, '0.30.1');
  assert.equal(ScoreView.DEFAULTS.showShapes, false);
  const view = ScoreView.create(mockCanvas().canvas, oneLane('piano'), () => 0);
  assert.equal(view.options().showShapes, false);
  view.setOptions({showShapes: 'yes'});
  assert.equal(view.options().showShapes, false, '不认识的值不该被接受');
  view.setOptions({showShapes: true});
  assert.equal(view.options().showShapes, true);
  assert.deepEqual({...ScoreView.SHAPE_BY_GROUP}, {piano: 'struck', guitar: 'struck', bass: 'bass', strings: 'held', violin: 'held', winds: 'held'});
});

test('off, and nothing given, draw exactly what 0.16.0 drew (the strict canvas: every drawing state)', () => {
  assert.equal(BEFORE.VERSION, '0.16.0');
  let compared = 0;
  // Both cores get the same input, one the old and the new rules agree on (helpers.alike).
  for (const model of [fullModel(), oneLane('piano'), oneLane('bass'), pilot('qilixiang'), pilot('meguri')].map(alike)) {
    const times = steps(0, model.track.duration, 31).map(t => t + 0.013).concat([4.05, 9.02, 10, 10.02, 30.01]);
    for (const look of [{}, {fxPreset: 'strong'}, {laneLabels: 'text', sectionStyle: 'block', focusGroup: 'guitar', simplify: false, mergeTimbres: false}]) {
      const old = frames(BEFORE, model, look, times).list;
      for (const given of [look, {...look, showShapes: false}]) {
        frames(ScoreView, model, given, times).list.forEach((frame, i) => {
          assert.equal(frame.calls, old[i].calls, `${JSON.stringify(given)} ${times[i]} 秒：和 0.16.0 画的不一样`);
          assert.deepEqual(frame.stats, old[i].stats);
          compared++;
        });
      }
    }
  }
  assert.ok(compared > 1000, String(compared));
});

for (const group of ['piano', 'guitar']) {
  test(`struck (${group}): a head at the onset, as wide as tall, ${S.head} times the note at most, never over ${S.headCap} semitones taller nor wider than a drum dot, always ${S.headOver} px prouder; the body tapers to the tail over ${S.taper} s`, () => {
    const off = frames(ScoreView, oneLane(group), LOOK, [3]).list[0], on = frames(ScoreView, oneLane(group), {...LOOK, showShapes: true}, [3]).list[0];
    const g = geometry(off);
    const T = g.T, head = Math.max(T + S.headOver, Math.min(T * S.head, T + g.semitone * S.headCap, DOT)), tail = Math.max(S.tailMin, T * S.tail);
    assert.ok(head > T, '头要比音符粗');
    const shaped = paths(on.surface).filter(p => p.rects.length && p.points.length);
    assert.equal(shaped.length, 1, '这一帧的音符都在一条路径里（未弹那一桶）');
    const {rects, points} = shaped[0];
    // The long note: head at its onset, centred on the note's line.
    const headRect = rects.find(r => near(r[0], g.long.x));
    assert.ok(headRect, '长音的头');
    assert.ok(near(headRect[2], head) && near(headRect[3], head), `头 ${headRect[2]}×${headRect[3]}，应为 ${head}`);
    assert.ok(near(headRect[1] + headRect[3] / 2, g.centre(g.long)), '头在音符中线上');
    // The long note's body: full at the onset, the tail at onset + taper, the tail to the end.
    const body = points.filter(p => p.x >= g.long.x - 0.01 && p.x <= g.long.x + g.long.width + 0.01);
    const at = x => body.filter(p => near(p.x, x)).map(p => p.y);
    const c = g.centre(g.long), reach = g.long.x + Math.min(g.long.width, S.taper * g.pps);
    assert.deepEqual(at(g.long.x).map(y => Math.round(Math.abs(y - c) * 1000) / 1000).sort(), [T / 2, T / 2].map(v => Math.round(v * 1000) / 1000), '起音处满粗');
    assert.ok(g.long.width > S.taper * g.pps + 1, '长音要比收细的那段长');
    assert.equal(at(reach).length, 2, `在起音后 ${S.taper} 秒处收完（那里要有上下两个点）`);
    for (const y of at(reach)) assert.ok(near(Math.abs(y - c), tail / 2), `收完处 ${Math.abs(y - c) * 2}，应为尾 ${tail}`);
    for (const y of at(g.long.x + g.long.width)) assert.ok(near(Math.abs(y - c), tail / 2), '尾端保持尾的粗细');
    assert.ok(tail >= S.tailMin && tail >= T * S.tail - 1e-9 && tail < T, '尾端不细于下限、比满粗细细');
    // The short note is only a head.
    assert.ok(rects.some(r => near(r[0], g.short.x)), '短音有头');
    assert.ok(!points.some(p => p.x > g.short.x + 0.01 && p.x < g.short.x + head + 0.5), '短音没有身子');
    assert.equal(on.stats.shaped, 4);
  });
}

test(`bass: struck, ${S.bass} times as thick, never more than ${S.bassCap} semitones thicker`, () => {
  const off = frames(ScoreView, oneLane('bass'), LOOK, [3]).list[0], on = frames(ScoreView, oneLane('bass'), {...LOOK, showShapes: true}, [3]).list[0];
  const g = geometry(off);
  const full = Math.min(g.T * S.bass, g.T + g.semitone * S.bassCap), head = Math.max(full + S.headOver, Math.min(full * S.head, full + g.semitone * S.headCap, DOT));
  assert.ok(full > g.T, '贝斯要粗一档');
  const [shaped] = paths(on.surface).filter(p => p.rects.length && p.points.length);
  const c = g.centre(g.long);
  const start = shaped.points.filter(p => near(p.x, g.long.x)).map(p => Math.abs(p.y - c));
  assert.ok(start.length === 2 && start.every(v => near(v, full / 2)), `起音处 ${start.map(v => v * 2)}，应为 ${full}`);
  const headRect = shaped.rects.find(r => near(r[0], g.long.x));
  assert.ok(near(headRect[3], head));
});

test('a held lane (bowed strings, violin), a group the table does not know, vocals, drums and the texture band are drawn exactly as before', () => {
  for (const model of [oneLane('strings'), oneLane('violin'), oneLane('synth'), oneLane('other')]) {
    const off = frames(ScoreView, model, LOOK, [3, 10.2]).list, on = frames(ScoreView, model, {...LOOK, showShapes: true}, [3, 10.2]).list;
    on.forEach((frame, i) => assert.equal(frame.calls, off[i].calls, model.lanes[0].group));
  }
  const model = fullModel();
  model.lanes = model.lanes.filter(lane => lane.group === 'vocals' || lane.group === 'drums');
  model.lanes.push({id: 'texture', label: '其它', kind: 'texture', group: 'other', groupLabel: '其它', level: {hop: 1, db: Array(60).fill(-20)}});
  for (const look of [{}, {fxPreset: 'strong', showTexture: true}]) {
    const off = frames(ScoreView, model, look, [9.5, 10.2, 30.5]).list, on = frames(ScoreView, model, {...look, showShapes: true}, [9.5, 10.2, 30.5]).list;
    on.forEach((frame, i) => assert.equal(frame.calls, off[i].calls, '人声、鼓、带子不该变'));
  }
});

test('the same colours and light in every state, the same fills in the same order (one path a bucket), the same effects', () => {
  for (const look of [LOOK, {...LOOK, effects: 'light'}, {...LOOK, fxPreset: 'strong'}, {...LOOK, fxPreset: 'keys'}]) {
    for (const t of [3, 4.1, 5, 8.01, 10.2, 12]) {
      for (const group of ['piano', 'bass']) {
        const off = frames(ScoreView, oneLane(group), look, [t]).list[0], on = frames(ScoreView, oneLane(group), {...look, showShapes: true}, [t]).list[0];
        assert.deepEqual(fills(on), fills(off), `${JSON.stringify(look)} ${t} 秒：颜色、亮度或阴影变了`);
        assert.deepEqual(on.stats.fx, off.stats.fx, '特效的分量和位置不该变');
      }
    }
  }
});

test('a lane listened to alone keeps its shapes; notes are shaped after simplifying (one joined note, one head)', () => {
  const model = oneLane('piano');
  const focused = frames(ScoreView, model, {...LOOK, focusGroup: 'piano', showShapes: true}, [3]).list[0];
  assert.ok(paths(focused.surface).some(p => p.rects.length && p.points.length), '聚焦时照样有形状');
  const other = frames(ScoreView, model, {...LOOK, focusGroup: 'bass', showShapes: true}, [3]).list[0];
  assert.ok(paths(other.surface).some(p => p.rects.length && p.points.length), '别的轨被聚焦时也照样有形状');
  // Two pieces of one pitch that simplifying joins (the second clearly softer: the tail of the same strike): one head.
  const pieces = oneLane('piano');
  pieces.lanes[0].notes = [[4, 0.5, 60, 90], [4.52, 0.5, 60, 60], [9, 0.5, 62, 90]];
  const joined = frames(ScoreView, pieces, {...LOOK, simplify: true, showShapes: true}, [3]).list[0];
  assert.equal(joined.stats.shaped, 2);
  const split = frames(ScoreView, pieces, {...LOOK, simplify: false, showShapes: true}, [3]).list[0];
  assert.equal(split.stats.shaped, 3);
  // As loud: struck again (0.22.0), so two heads even simplified.
  pieces.lanes[0].notes[1][3] = 90;
  assert.equal(frames(ScoreView, pieces, {...LOOK, simplify: true, showShapes: true}, [3]).list[0].stats.shaped, 3);
});

test('on the pilots: every shaped lane is a piano, guitar or bass lane; the strings, voice and drums draw as before', () => {
  for (const name of ['qilixiang', 'meguri']) {
    const model = pilot(name);
    const off = frames(ScoreView, model, {}, [62, 160, 306]).list, on = frames(ScoreView, model, {showShapes: true}, [62, 160, 306]).list;
    on.forEach((frame, i) => {
      assert.deepEqual(fills(frame), fills(off[i]), `${name}：颜色、亮度变了`);
      assert.deepEqual(frame.stats.fx, off[i].stats.fx, `${name}：特效变了`);
    });
    assert.ok(on.some(frame => frame.stats.shaped > 0));
  }
});

test('a squeezed lane still shows its heads: the limit counts how much the head adds, not its whole height', () => {
  // Eight piano lanes, each spread over five octaves, so a semitone is far under a note's thickness.
  const model = fullModel();
  for (const key of ['chords', 'chordTones', 'sections', 'captions', 'bars']) delete model[key];
  model.lanes = Array.from({length: 8}, (_, k) => ({id: 'piano' + k, label: 'p' + k, kind: 'pitched', group: 'piano',
    notes: [[4, 2, 40 + k, 90], ...Array.from({length: 30}, (_, i) => [20 + i * 0.5, 0.3, 40 + i * 2, 90])]}));
  const look = {...LOOK, mergeTimbres: false};
  const off = frames(ScoreView, model, look, [3]).list[0], on = frames(ScoreView, model, {...look, showShapes: true}, [3]).list[0];
  const T = off.bars[0].height;
  const heads = paths(on.surface).flatMap(p => p.rects);
  assert.ok(heads.length >= 8);
  for (const r of heads) assert.ok(r[3] >= T * 1.4, `挤的轨里头 ${r[3]} 应明显比音符 ${T} 高`);
});

test('a sounding note (lit, with its shadow) is drawn in the struck shape too', () => {
  const off = frames(ScoreView, oneLane('piano'), LOOK, [4.1]).list[0], on = frames(ScoreView, oneLane('piano'), {...LOOK, showShapes: true}, [4.1]).list[0];
  const lit = paths(on.surface).filter(p => p.shadow[1] > 0);
  assert.equal(lit.length, 1, '正在响的那一桶');
  assert.ok(lit[0].rects.length === 1 && lit[0].points.length > 0, '正在响的音也有头和变细的身子');
  assert.deepEqual(fills(on), fills(off), '颜色、亮度、阴影不变');
});
