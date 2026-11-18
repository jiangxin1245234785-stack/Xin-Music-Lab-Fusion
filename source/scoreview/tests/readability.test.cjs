'use strict';
// Readability over the album cover (work/score-shapes-20261114/SPEC-6.md part 3): coverAdapt (the veil behind the
// lanes from how bright and busy the cover is, worked out once when the host hands the cover over with its measure)
// and textureAdapt (the 「其它」 band lit to stand out from the cover behind it). Both off by default; off, or with
// nothing to work from, every frame is what 0.20.0 drew. Each rule has an entry in mutations.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {ScoreView, mockCanvas, fullModel, alike} = require('./helpers.cjs');

const BEFORE = require('./fixtures/score-view-0.20.0.js');
const A = ScoreView.COVER_ADAPT, T = ScoreView.TEXTURE_ADAPT;
const near = (a, b, eps = 0.001) => Math.abs(a - b) < eps;
const GROUND = (0.2126 * 0x1a + 0.7152 * 0x1d + 0.0722 * 0x21) / 255;
const MOST = 0.14 + 0.2;   // COVER_FAINT + COVER_SWELL

function model() {
  const m = fullModel();
  m.lanes.push({id: 'texture', label: '其它', kind: 'texture', group: 'other', groupLabel: '其它', level: {hop: 1, db: Array(60).fill(-20).map((v, i) => v + (i % 7))}});
  return m;
}
function frames(core, options, times, measure, picture = {width: 480, height: 480}) {
  const surface = mockCanvas(800, 400);
  const view = core.create(surface.canvas, alike(model()), () => 0, {showTexture: true, ...options});
  if (picture) measure === undefined ? view.setCover(picture) : view.setCover(picture, measure);
  view.draw(0);
  return times.map(t => { surface.reset(); const stats = view.draw(t); return {stats, calls: surface.calls.slice(), json: JSON.stringify(surface.calls)}; });
}
// The veil: the fillRect whose style is a gradient of the ground colour.
const veilOf = calls => {
  const call = calls.find(c => c.name === 'fillRect' && c.fillStyle && c.fillStyle.stops && c.fillStyle.stops.some(s => /^rgba\(26,29,33,/.test(s[1])));
  return call ? Number(/,([\d.]+)\)$/.exec(call.fillStyle.stops[1][1])[1]) : null;
};
const veilFor = m => {
  const bright = Math.min(1, Math.max(0, m.mean + A.spread * m.spread));
  const allowed = bright > A.bright ? (A.bright - GROUND) / (bright - GROUND) : Infinity;
  return Math.round(Math.min(A.high, Math.max(A.low, 1 - allowed / MOST)) * 1000) / 1000;
};
const BUSY = {mean: 0.71, spread: 0.32}, MID = {mean: 0.36, spread: 0.15}, PLAIN = {mean: 0.23, spread: 0.03}, DARK = {mean: 0.05, spread: 0.12};

test('coverAdapt and textureAdapt: off by default, booleans only; the version moved up a step', () => {
  assert.equal(ScoreView.VERSION, '0.30.0');
  assert.equal(ScoreView.DEFAULTS.coverAdapt, false);
  assert.equal(ScoreView.DEFAULTS.textureAdapt, false);
  const view = ScoreView.create(mockCanvas().canvas, model(), () => 0);
  for (const key of ['coverAdapt', 'textureAdapt']) {
    for (const value of ['yes', 1, null]) { view.setOptions({[key]: value}); assert.equal(view.options()[key], false, `${key} ${value}`); }
    view.setOptions({[key]: true});
    assert.equal(view.options()[key], true);
  }
});

test('measureCover: luma mean and spread of the middle half of the cover\'s height; nothing for nothing', () => {
  const W = 8, H = 8, data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = (y * W + x) * 4, inside = y >= 2 && y < 6;
    const v = inside ? (x % 2 ? 255 : 0) : 128;   // the outer quarters (grey) do not count
    data[k] = data[k + 1] = data[k + 2] = v; data[k + 3] = 255;
  }
  const m = ScoreView.measureCover(data, W, H);
  assert.ok(near(m.mean, 0.5) && near(m.spread, 0.5), JSON.stringify(m));
  const red = new Uint8ClampedArray(4 * 4 * 4).fill(0);
  for (let k = 0; k < red.length; k += 4) { red[k] = 255; red[k + 3] = 255; }
  assert.ok(near(ScoreView.measureCover(red, 4, 4).mean, 0.2126), '用 Rec. 709 的亮度');
  assert.equal(ScoreView.measureCover(null, 4, 4), null);
  assert.equal(ScoreView.measureCover(red, 0, 4), null);
  assert.equal(ScoreView.measureCover(red, 8, 8), null, '像素不够');
});

test('off, or with nothing to work from, every frame is what 0.20.0 drew', () => {
  assert.equal(BEFORE.VERSION, '0.20.0');
  const times = [0.5, 9.1, 10.2, 30.5, 45];
  let compared = 0;
  for (const look of [{}, {fxPreset: 'strong'}, {fxDynamics: 'off'}]) {
    const givens = [
      [{...look}, BUSY], [{...look, coverAdapt: false, textureAdapt: false}, BUSY],
      [{...look, coverAdapt: true, textureAdapt: true}, undefined],               // no measure handed over
      [{...look, coverAdapt: true, textureAdapt: true}, null],
      [{...look, coverAdapt: true, textureAdapt: true}, {mean: NaN, spread: 0.1}],
      [{...look, coverAdapt: true, textureAdapt: true, backdrop: 'section'}, BUSY],  // no cover in the picture
      [{...look, coverAdapt: true, textureAdapt: true, showBackdrop: false}, BUSY]
    ];
    for (const [given, measure] of givens) {
      const plain = {...given};
      delete plain.coverAdapt; delete plain.textureAdapt;
      const old = frames(BEFORE, plain, times, undefined);
      frames(ScoreView, given, times, measure).forEach((frame, i) => {
        assert.equal(frame.json, old[i].json, `${JSON.stringify(given)} ${JSON.stringify(measure)} ${times[i]} 秒：和 0.20.0 画的不一样`);
        assert.deepEqual(frame.stats, old[i].stats);
        compared++;
      });
    }
    // No picture at all.
    const bare = frames(BEFORE, look, times, undefined, null);
    frames(ScoreView, {...look, coverAdapt: true, textureAdapt: true}, times, undefined, null).forEach((frame, i) => { assert.equal(frame.json, bare[i].json); compared++; });
  }
  assert.ok(compared >= 100, String(compared));
});

test(`coverAdapt: the veil from the cover's bright end (mean + ${A.spread} spread), so that end stays at most ${A.bright} behind the lanes; within [${A.low}, ${A.high}]`, () => {
  const veils = {};
  for (const [name, m] of Object.entries({BUSY, MID, PLAIN, DARK})) {
    const [frame] = frames(ScoreView, {coverAdapt: true}, [10.2], m);
    const want = veilFor(m);
    assert.ok(near(veilOf(frame.calls), want), `${name}：遮罩 ${veilOf(frame.calls)}，应是 ${want}`);
    assert.ok(near(frame.stats.backdrop.behindNotes, Math.round(frame.stats.backdrop.cover * (1 - want) * 1000) / 1000), `${name}：音符后面露出的封面`);
    veils[name] = want;
    // Where the clamp does not hold it, the bright end behind the lanes lands on the target.
    if (want > A.low && want < A.high) {
      const bright = Math.min(1, m.mean + A.spread * m.spread), shows = MOST * (1 - want);
      assert.ok(near(GROUND * (1 - shows) + bright * shows, A.bright, 0.002), `${name}：音符后面封面最亮处 ${GROUND * (1 - shows) + bright * shows}`);
    }
  }
  assert.ok(veils.BUSY > 0.55 && veils.BUSY > veils.MID, '又亮又花的压得比固定的多');
  assert.equal(veils.PLAIN, A.low, '素的压得少');
  assert.equal(veils.DARK, A.low, '暗的压得少');
  assert.equal(veils.BUSY, A.high, `最亮最花的封顶在 ${A.high}`);
  assert.ok(veils.MID > A.low && veils.MID < A.high, '中等的封面落在中间');
  // Off: the fixed veil, and no veil in the frame's numbers.
  const [off] = frames(ScoreView, {}, [10.2], BUSY);
  assert.equal(veilOf(off.calls), 0.55);
  assert.equal(off.stats.backdrop.veil, undefined);
});

test('coverAdapt moves only the veil: the cover, the notes, the wash, the header and the section bar are drawn as before', () => {
  const strip = calls => JSON.stringify(calls.filter(c => !(c.name === 'fillRect' && c.fillStyle && c.fillStyle.stops && c.fillStyle.stops.some(s => /^rgba\(26,29,33,/.test(s[1])))).map(c => [c.name, c.args, typeof c.fillStyle === 'string' ? c.fillStyle : JSON.stringify(c.fillStyle && c.fillStyle.stops), c.alpha]));
  for (const t of [0.5, 10.2, 30.5]) {
    const [on] = frames(ScoreView, {coverAdapt: true}, [t], BUSY), [off] = frames(ScoreView, {}, [t], BUSY);
    assert.equal(strip(on.calls), strip(off.calls), `${t} 秒`);
    assert.notEqual(veilOf(on.calls), veilOf(off.calls));
  }
});

test(`textureAdapt: the band's light raised by the cover showing behind it (gain ${T.gain}), within [the plain light, ${T.high}]; less once the veil is darker; never as bright as a played note`, () => {
  const light = (options, m, t = 10.2) => frames(ScoreView, {textureAdapt: true, ...options}, [t], m)[0].stats.texture.light || 0.3;
  const want = (m, veil) => Math.round(Math.min(T.high, Math.max(0.3, 0.3 * (1 + T.gain * MOST * (1 - veil) * (Math.max(0, m.mean - GROUND) + m.spread)))) * 1000) / 1000;
  for (const m of [BUSY, MID, PLAIN, DARK]) {
    assert.ok(near(light({}, m), want(m, 0.55)), `${JSON.stringify(m)}：${light({}, m)}，应是 ${want(m, 0.55)}`);
    assert.ok(near(light({coverAdapt: true}, m), want(m, veilFor(m))), '和封面压暗配合');
  }
  assert.ok(light({}, BUSY) > light({}, PLAIN), '花的封面上提得多');
  assert.ok(light({coverAdapt: true}, BUSY) < light({}, BUSY), '封面压暗之后不用提那么多');
  assert.ok(T.high < 0.92, '不比已弹的音亮');
  // The band's fills carry the raised light: its gradient's strongest stop.
  const peak = frame => Math.max(...frame.calls.filter(c => c.name === 'fill' && c.fillStyle && c.fillStyle.stops).flatMap(c => c.fillStyle.stops.map(s => Number(/,([\d.]+)\)$/.exec(s[1])[1]))));
  const [on] = frames(ScoreView, {textureAdapt: true, fxDynamics: 'off'}, [10.2], BUSY), [off] = frames(ScoreView, {fxDynamics: 'off'}, [10.2], BUSY);
  assert.ok(near(peak(on) / peak(off), on.stats.texture.light / 0.3, 0.02), `带子最亮处 ${peak(on)} / ${peak(off)}`);
  // Without the cover behind it, the band is as before.
  assert.equal(frames(ScoreView, {textureAdapt: true, backdrop: 'section'}, [10.2], BUSY)[0].stats.texture.light, undefined);
});

test('setCover keeps its measure per picture: a new picture without one goes back to the fixed veil', () => {
  const surface = mockCanvas(800, 400);
  const view = ScoreView.create(surface.canvas, model(), () => 0, {showTexture: true, coverAdapt: true});
  view.setCover({width: 480, height: 480}, BUSY);
  view.draw(0); surface.reset(); view.draw(10.2);
  assert.ok(near(veilOf(surface.calls), veilFor(BUSY)));
  view.setCover({width: 480, height: 480});
  surface.reset(); view.draw(10.2);
  assert.equal(veilOf(surface.calls), 0.55);
  assert.equal(view.setCover(null, BUSY), false);
});
void path;
