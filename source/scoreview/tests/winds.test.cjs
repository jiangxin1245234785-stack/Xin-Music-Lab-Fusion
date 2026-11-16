'use strict';
// 0.23.0 (work/winds-20261115/SPEC.md W2): winds as a lane kind of its own: a colour that keeps the family's rules, an
// icon, spindles like the strings (one line to change), thickness by pitch, numbered icons when split, and the names a
// host may use for a wind group falling back to it. The adapter names wind instruments, and a name it does not know.
const test = require('node:test');
const assert = require('node:assert/strict');
const {ScoreView, mockCanvas} = require('./helpers.cjs');
const {partLabel} = require('../adapter/track-model.cjs');

// sRGB hex -> OKLab (Björn Ottosson), and the family's distances (work/xml-palette-20261114/REPORT.md).
function oklab(hex) {
  const n = parseInt(hex.slice(1), 16), lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const r = lin(n >> 16), g = lin((n >> 8) & 255), b = lin(n & 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
const dE = (a, b) => Math.hypot(...oklab(a).map((v, i) => v - oklab(b)[i]));
const hue = hex => { const [, a, b] = oklab(hex); return (Math.atan2(b, a) * 180 / Math.PI + 360) % 360; };
const AMBER = '#f0a830';

test('the winds colour keeps the family rules: ΔE ≥ 0.10 from every track, ≥ 0.12 and 30° of hue from the amber', () => {
  const colours = ScoreView.GROUP_COLORS, winds = colours.winds;
  assert.equal(winds, '#7c9206', '0.23.1：用户挑的橄榄');
  for (const [group, colour] of Object.entries(colours)) {
    if (group === 'winds') continue;
    assert.ok(dE(winds, colour) >= 0.10, `离 ${group} ${dE(winds, colour).toFixed(3)}`);
  }
  assert.ok(dE(winds, AMBER) >= 0.12);
  const gap = Math.abs(((hue(winds) - hue(AMBER)) + 540) % 360 - 180);
  assert.ok(gap >= 30, `色相差 ${gap}`);
  // Light enough on the dark ground (OKLab L of the ground #1a1d21 is about 0.23).
  assert.ok(oklab(winds)[0] > 0.6);
});

const model = (lanes, duration = 30) => ({contract: 'xin.score-view/1', track: {id: 't', title: '', duration}, audio: {src: '', offset: 0}, lanes});
const winds = (id = 'winds', group = 'winds', notes = [[2, 1.5, 60, 100], [3.55, 1.5, 62, 100], [6, 0.4, 67, 90]]) =>
  ({id, label: id, kind: 'pitched', group, groupLabel: '管乐', notes});
function frame(m, options, time = 3) {
  const surface = mockCanvas(800, 400);
  const view = ScoreView.create(surface.canvas, m, () => 0, {effects: 'off', laneHeights: 'fixed', ...options});
  view.draw(time); surface.reset();
  const stats = view.draw(time);
  return {surface, stats, view};
}
const iconMoves = surface => {
  const calls = surface.calls, out = [];
  for (let i = 0; i < calls.length; i++) {
    if (calls[i].name !== 'save') continue;
    let j = i + 1;
    while (j < calls.length && calls[j].name !== 'restore') j++;
    const inside = calls.slice(i + 1, j);
    if (inside.length > 2 && inside[0].name === 'beginPath' && inside[inside.length - 1].name === 'stroke' && inside[inside.length - 1].lineCap === 'round')
      out.push(JSON.stringify(inside.map(c => [c.name, ...c.args.map(v => Math.round(v * 10))])));
    i = j;
  }
  return out;
};

test('a winds lane: drawn in its colour, with its own icon; other names for a wind group take that icon', () => {
  const {surface, stats} = frame(model([winds()]), {laneLabels: 'icon'});
  assert.ok(surface.calls.some(c => c.name === 'fill' && /^rgba\(124,146,6,/.test(c.fillStyle)), '管乐的颜色');
  assert.equal(stats.labels[0].shown, 'icon');
  const own = iconMoves(surface)[0];
  for (const other of ['strings', 'other', 'piano', 'guitar']) assert.notEqual(iconMoves(frame(model([winds('x', other)]), {laneLabels: 'icon'}).surface)[0], own, `和 ${other} 的图标不同`);
  for (const name of ['brass', 'woodwinds', 'wind', 'sax']) assert.equal(iconMoves(frame(model([winds('x', name)]), {laneLabels: 'icon'}).surface)[0], own, `${name} 用管乐的图标`);
});

test('winds are spindles with the shapes on (like the strings), and their single lines are linked', () => {
  const look = {showShapes: true, shapeSet: 'spindle', shapeLinks: true};
  const w = frame(model([winds()]), look).stats, s = frame(model([winds('s', 'strings')]), look).stats;
  assert.ok(w.shaped > 0);
  assert.equal(w.shaped, s.shaped, '和弦乐一样按梭状画');
  assert.equal(w.strands, s.strands);
  assert.ok(w.strands >= 1, '单线条处连起来');
  assert.deepEqual([...ScoreView.SPINDLE_GROUPS], ['strings', 'violin', 'winds']);
  // Shapes off: plain bars, as every lane.
  assert.equal(frame(model([winds()]), {}).stats.shaped, undefined);
});

test('thickness by pitch reaches winds; simplifying joins them as held notes (not as strikes)', () => {
  assert.ok(ScoreView.WEIGHT_GROUPS.includes('winds'));
  assert.ok(!ScoreView.STRUCK_GROUPS.includes('winds'));
  const chain = Array.from({length: 6}, (_, i) => [2 + i * 0.25, 0.25, 60, 100]);
  assert.equal(frame(model([winds('winds', 'winds', chain)]), {simplify: true}).view.lanes()[0].shown, 1, '同音高首尾相接的几段接成一个长音');
});

test('several wind instruments apart: one icon each, numbered; together: one lane, one icon', () => {
  const lanes = [winds('winds/0', 'winds', [[2, 1, 60, 90]]), winds('winds/1', 'winds', [[2, 1, 48, 90]]), winds('winds/2', 'winds', [[2, 1, 72, 90]])];
  const apart = frame(model(lanes), {laneLabels: 'icon', mergeTimbres: false}).stats.labels;
  assert.deepEqual(apart.map(l => [l.shown, l.number]), [['icon', 1], ['icon', 2], ['icon', 3]]);
  const together = frame(model(lanes), {laneLabels: 'icon'}).stats.labels;
  assert.deepEqual(together.map(l => [l.shown, l.number || 0]), [['icon', 0]]);
});

test('the adapter names wind instruments: by GM program, by MuScriptor name, else the stem with the raw name', () => {
  assert.equal(partLabel({program: 56}, '管乐'), '小号');
  assert.equal(partLabel({program: 60}, '管乐'), '圆号');
  assert.equal(partLabel({program: 71}, '管乐'), '单簧管');
  assert.equal(partLabel({program: 999, name: 'tenor_sax'}, '管乐'), '次中音萨克斯');
  assert.equal(partLabel({program: 72, name: 'flutes'}, '管乐'), '长笛', 'the name MuScriptor gave wins over its program (72 = piccolo)');
  assert.equal(partLabel({program: 72}, '管乐'), '短笛');
  assert.equal(partLabel({name: 'French Horn'}, '管乐'), '圆号');
  assert.equal(partLabel({name: 'brass_section'}, '管乐'), '铜管组');
  assert.equal(partLabel({name: 'kazoo'}, '管乐'), '管乐·kazoo', '不认识的名字：声部名加原名');
  assert.equal(partLabel({program: 200}, '管乐'), '管乐', '什么都没有：声部名');
  // The names that were there are as they were.
  assert.equal(partLabel({program: 42}, '弦乐'), '大提琴');
  assert.equal(partLabel({program: 29}, '吉他'), '过载吉他');
});
