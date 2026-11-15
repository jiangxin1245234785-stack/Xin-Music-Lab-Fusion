'use strict';
// Note thickness by pitch (pitchWeight, work/score-shapes-20261114/SPEC-5.md): each note of a piano, guitar, bass or
// string lane is the lane's thickness times a weight from its pitch, the ear's filter width there (ERB, Glasberg &
// Moore 1990) in semitones against A4's, clamped; never thinner than the lane's thinnest, never more than a cap over
// the lane's thickness; the bass's own step up not added on top; vocals, drums and the texture band unchanged;
// colours, light and effects unchanged; independent of showShapes. Off by default. Each rule has a mutation.
const test = require('node:test');
const assert = require('node:assert/strict');
const {ScoreView, mockCanvas, fullModel} = require('./helpers.cjs');

const W = ScoreView.PITCH_WEIGHT, SH = ScoreView.SHAPES, SP = ScoreView.SPINDLE;
const near = (a, b, eps = 0.01) => Math.abs(a - b) < eps;
const LOOK = {effects: 'off', simplify: false, mergeTimbres: false, laneHeights: 'fixed'};

function lane(group, notes, kind = 'pitched') {
  const model = fullModel();
  for (const key of ['chords', 'chordTones', 'sections', 'captions', 'bars']) delete model[key];
  model.lanes = [{id: group, label: group, kind, group, notes}];
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
const centre = bar => bar.y + bar.height / 2;
// A lane wide enough to have room (two octaves and more), notes from low to high one after another, plus two
// notes a semitone apart to measure the semitone.
const SPREAD = [[1, 0.5, 36, 90], [2, 0.5, 48, 90], [3, 0.5, 60, 90], [4, 0.5, 69, 90], [5, 0.5, 84, 90], [6, 0.5, 96, 90], [7, 0.4, 60, 90], [8, 0.4, 61, 90]];
function measure(group, notes = SPREAD, kind = 'pitched') {
  const off = frame(lane(group, notes, kind), LOOK).bars.sort((a, b) => a.x - b.x);
  const on = frame(lane(group, notes, kind), {...LOOK, pitchWeight: true}).bars.sort((a, b) => a.x - b.x);
  const T = off[0].height, semitone = centre(off[off.length - 2]) - centre(off[off.length - 1]);   // the last two: a semitone apart
  return {off, on, T, semitone, expect: midi => Math.max(Math.min(T, kind === 'melody' ? 3.5 : 2), Math.min(T * ScoreView.pitchWeightOf(midi), T + semitone * W.cap))};
}

test('pitchWeight: off by default, booleans only', () => {
  assert.equal(ScoreView.DEFAULTS.pitchWeight, false);
  const view = ScoreView.create(mockCanvas().canvas, lane('piano', SPREAD), () => 0);
  for (const value of ['yes', 1, null]) { view.setOptions({pitchWeight: value}); assert.equal(view.options().pitchWeight, false, String(value)); }
  view.setOptions({pitchWeight: true});
  assert.equal(view.options().pitchWeight, true);
  assert.deepEqual([...ScoreView.WEIGHT_GROUPS], ['piano', 'guitar', 'bass', 'strings', 'violin']);
});

test('the ear\'s filter width in semitones: A2 ≈ 5.8, A3 ≈ 3.8, A4 ≈ 2.9, A5 ≈ 2.4, A6 ≈ 2.1', () => {
  for (const [midi, width] of [[45, 5.8], [57, 3.8], [69, 2.85], [81, 2.4], [93, 2.1]]) {
    assert.ok(near(ScoreView.erbSemitones(midi), width, 0.06), `MIDI ${midi}：${ScoreView.erbSemitones(midi)}，应约 ${width}`);
  }
  assert.equal(ScoreView.erbSemitones(0), Infinity, '带宽一半够到 0 Hz 时按无穷宽（取上限）');
  assert.equal(ScoreView.pitchWeightOf(69), 1, 'A4 是 1');
});

test(`the weight goes down as the pitch goes up, clamped to [${W.low}, ${W.high}]`, () => {
  let last = Infinity;
  for (let midi = 0; midi < 128; midi++) {
    const k = ScoreView.pitchWeightOf(midi);
    assert.ok(k <= last + 1e-9, `MIDI ${midi} 比低一个半音的还粗`);
    assert.ok(k >= W.low - 1e-6 && k <= W.high + 1e-6, `MIDI ${midi}：${k} 出了范围`);
    last = k;
  }
  assert.ok(near(ScoreView.pitchWeightOf(0), W.high, 1e-6) && near(ScoreView.pitchWeightOf(127), W.low, 1e-6), '两头取到范围的边');
  assert.ok(ScoreView.pitchWeightOf(57) > 1 && ScoreView.pitchWeightOf(81) < 1, 'A3 比 1 粗、A5 比 1 细');
  assert.equal(ScoreView.pitchWeightOf(60.4), ScoreView.pitchWeightOf(60), '按最近的半音');
});

for (const group of ['piano', 'guitar', 'bass', 'strings', 'violin']) {
  test(`${group}: each note the lane's thickness times its weight, on its own centre line; low notes thicker than high ones`, () => {
    const m = measure(group);
    m.on.forEach((bar, i) => {
      const midi = SPREAD[i][2];
      assert.ok(near(bar.height, m.expect(midi)), `MIDI ${midi}：${bar.height}，应是 ${m.expect(midi)}`);
      assert.ok(near(centre(bar), centre(m.off[i])), `MIDI ${midi}：中线不该动`);
      assert.equal(bar.x, m.off[i].x);
      assert.equal(bar.width, m.off[i].width);
    });
    assert.ok(m.on[0].height > m.on[3].height + 0.3, '低音明显比 A4 粗');
  });
}

test(`never thinner than the lane's thinnest (2 px; 3.5 on a melody lane), never more than ${W.cap} semitones over the lane's thickness`, () => {
  // A roomy lane (few semitones, thick notes): the high notes would go under the lane's thickness.
  const roomy = measure('piano', [[1, 0.5, 96, 90], [2, 0.5, 100, 90], [3, 0.5, 99, 90], [4, 0.5, 98, 90], [5, 0.5, 97, 90], [6, 0.5, 96, 90], [7, 0.4, 96, 90], [8, 0.4, 97, 90]]);
  assert.ok(roomy.T > 2, String(roomy.T));
  assert.ok(roomy.on[1].height < roomy.T, '高音比基准细');
  assert.ok(roomy.on[1].height >= 2 - 1e-9, '但不细于 2 像素');
  // A squeezed lane: the low notes would grow past the cap.
  const wide = measure('bass', [[1, 0.5, 24, 90], [2, 0.5, 100, 90], [3, 0.5, 60, 90], [4, 0.5, 69, 90], [5, 0.5, 84, 90], [6, 0.5, 96, 90], [7, 0.4, 60, 90], [8, 0.4, 61, 90]]);
  assert.ok(wide.T * W.high > wide.T + wide.semitone * W.cap, '这条轨里起作用的是半音上限');
  assert.ok(near(wide.on[0].height, wide.T + wide.semitone * W.cap), `最低音 ${wide.on[0].height}，应封顶在 ${wide.T + wide.semitone * W.cap}`);
  // A melody lane spread wide: its thickness sits on its 3.5 px floor, so a high note's weight would take it under.
  const melody = measure('piano', [[1, 0.5, 20, 90], [2, 0.5, 110, 90], [3, 0.5, 60, 90], [4, 0.5, 69, 90], [5, 0.5, 84, 90], [6, 0.5, 96, 90], [7, 0.4, 60, 90], [8, 0.4, 61, 90]], 'melody');
  assert.ok(melody.T * W.low < 3.5, `按系数会细过 3.5 像素（基准 ${melody.T}）`);
  assert.ok(near(melody.on[1].height, 3.5), `最高音 ${melody.on[1].height}，应停在旋律轨的最细 3.5 像素`);
  // On a thin lane the floor is the lane's own thickness.
  const thin = measure('guitar', [[1, 0.5, 20, 90], [2, 0.5, 110, 90], [3, 0.5, 60, 90], [4, 0.5, 69, 90], [5, 0.5, 84, 90], [6, 0.5, 96, 90], [7, 0.4, 60, 90], [8, 0.4, 61, 90]]);
  assert.ok(near(thin.on[1].height, Math.max(Math.min(thin.T, 2), thin.T * W.low)), '很高的音也看得见');
});

test("with the shapes on: the struck head and tail and the spindle's halo and core start from the weighted thickness; the bass's own step up is not added", () => {
  const notes = [[1, 1, 40, 90], [3, 1, 84, 90], [7, 0.4, 60, 90], [8, 0.4, 61, 90]];
  for (const group of ['piano', 'bass']) {
    const m = measure(group, notes);
    const shaped = frame(lane(group, notes), {...LOOK, showShapes: true, pitchWeight: true});
    const heads = shaped.calls.filter(call => call.name === 'rect').sort((a, b) => a.args[0] - b.args[0]);
    heads.forEach((head, i) => {
      const own = m.on[i].height, full = own;   // the bass is not made thicker on top of its weight
      assert.ok(near(head.args[3], Math.min(full * SH.head, full + m.semitone * SH.headCap)), `${group} 第 ${i + 1} 个音的头 ${head.args[3]}`);
      assert.ok(near(head.args[1] + head.args[3] / 2, centre(m.off[i])), '头在中线上');
    });
    // The body starts at the weighted thickness.
    m.off.forEach((bar, i) => {
      const move = shaped.calls.find(call => call.name === 'moveTo' && near(call.args[0], bar.x));
      assert.ok(move && near(centre(bar) - move.args[1], m.on[i].height / 2), `${group} 第 ${i + 1} 个音：身子从按音高的粗细开始`);
    });
  }
  // Off, the bass is still a step thicker.
  const bassOff = frame(lane('bass', notes), {...LOOK, showShapes: true});
  const T = frame(lane('bass', notes), LOOK).bars[0].height;
  const m = measure('bass', notes);
  const first = bassOff.calls.find(call => call.name === 'moveTo' && near(call.args[0], m.off[0].x));
  assert.ok(near(centre(m.off[0]) - first.args[1], Math.min(T * SH.bass, T + m.semitone * SH.bassCap) / 2), '关着时贝斯照旧粗一档');
  // The spindle: the halo is swell times the weighted thickness, the core never over it.
  const spun = frame(lane('strings', notes), {...LOOK, showShapes: true, shapeSet: 'spindle', pitchWeight: true});
  const ms = measure('strings', notes);
  const curves = spun.calls.filter(call => call.name === 'quadraticCurveTo');
  const lowHaloTop = Math.min(...curves.slice(0, 4).map(call => call.args[3]));
  assert.ok(near(centre(ms.off[0]) - lowHaloTop, ms.on[0].height * SP.swell / 2), '梭状的晕按按音高的粗细');
});

test('vocals, drums, the texture band and unknown groups are unchanged; colours, light, fills and effects are unchanged', () => {
  const model = fullModel();
  model.lanes = model.lanes.filter(l => l.group === 'vocals' || l.group === 'drums');
  model.lanes.push({id: 'texture', label: '其它', kind: 'texture', group: 'other', groupLabel: '其它', level: {hop: 1, db: Array(60).fill(-20)}});
  model.lanes.push({id: 'synth', label: 'synth', kind: 'pitched', group: 'synth', notes: SPREAD});
  for (const look of [{}, {fxPreset: 'strong', showTexture: true}]) {
    for (const t of [9.5, 10.2, 30.5]) assert.equal(frame(model, {...look, pitchWeight: true}, t).json, frame(model, look, t).json, `${t} 秒`);
  }
  const fills = f => f.calls.filter(call => call.name === 'fill' || call.name === 'fillRect').map(call => [JSON.stringify(call.fillStyle), call.state.shadowBlur, call.state.shadowColor, call.alpha]);
  for (const look of [LOOK, {...LOOK, effects: 'light'}, {...LOOK, fxPreset: 'strong'}, {...LOOK, fxPreset: 'keys'}]) {
    for (const t of [0.5, 1.2, 3.3, 9]) {
      const off = frame(lane('piano', SPREAD), look, t), on = frame(lane('piano', SPREAD), {...look, pitchWeight: true}, t);
      assert.deepEqual(fills(on), fills(off), `${JSON.stringify(look)} ${t} 秒`);
      assert.deepEqual(on.stats.fx, off.stats.fx, '特效的分量和位置不变');
      assert.equal(on.stats.notes, off.stats.notes);
    }
  }
});

test('the four ways with showShapes all draw, and pitchWeight off draws exactly as before', () => {
  for (const shapes of [{}, {showShapes: true}, {showShapes: true, shapeSet: 'spindle'}]) {
    for (const group of ['piano', 'bass', 'strings']) {
      const off = frame(lane(group, SPREAD), {...LOOK, ...shapes}), given = frame(lane(group, SPREAD), {...LOOK, ...shapes, pitchWeight: false});
      assert.equal(given.json, off.json, `${group} ${JSON.stringify(shapes)}：关着也给 false 一样`);
      const on = frame(lane(group, SPREAD), {...LOOK, ...shapes, pitchWeight: true});
      assert.notEqual(on.json, off.json, `${group} ${JSON.stringify(shapes)}：打开了却没变`);
      assert.equal(on.stats.notes, off.stats.notes);
    }
  }
});
