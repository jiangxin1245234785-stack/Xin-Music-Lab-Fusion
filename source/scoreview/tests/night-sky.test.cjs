'use strict';
// 0.30.0 (work/score-depth-20261118/SPEC.md batch 2): the starry score as a night sky (nightSky), and 「原样」 ('plain'),
// the starry drawing as it was. Off, every frame is what the core drew before; the presentation turns it on for 'starry'.
const test = require('node:test');
const assert = require('node:assert/strict');
const {ScoreView, mockCanvas, fullModel} = require('./helpers.cjs');
const Presentation = require('../score-presentation.js');
const styles = require('../score-style.cjs');

const STARRY = {meteorMotion: true, quietText: true, drumNotation: true, showTexture: true};
function frame(options, time = 10.3, model = fullModel()) {
  const surface = mockCanvas(800, 400);
  const view = ScoreView.create(surface.canvas, model, () => 0, options);
  view.draw(time); surface.reset();
  const stats = view.draw(time);
  return {stats, calls: surface.calls, json: JSON.stringify(surface.calls), view};
}

test('night sky: off by default, booleans only, bounded amounts; off draws exactly what the starry core drew', () => {
  assert.equal(ScoreView.VERSION, '0.30.0');
  assert.equal(ScoreView.DEFAULTS.nightSky, false);
  assert.equal(ScoreView.DEFAULTS.starDim, .34);
  assert.equal(ScoreView.DEFAULTS.meteorTail, 1.5);
  const {view} = frame(STARRY);
  view.setOptions({nightSky: 'yes', starDim: 2, meteorTail: 0});
  assert.deepEqual([view.options().nightSky, view.options().starDim, view.options().meteorTail], [false, .34, 1.5]);
  view.setOptions({nightSky: true, starDim: .22, meteorTail: 2.2});
  assert.deepEqual([view.options().nightSky, view.options().starDim, view.options().meteorTail], [true, .22, 2.2]);
  for (const t of [9.2, 10.3, 12.5]) assert.equal(frame({...STARRY, nightSky: false}, t).json, frame(STARRY, t).json);
  // Without meteorMotion the option does nothing.
  assert.equal(frame({nightSky: true}).json, frame({}).json);
});

test('night sky: a still sky colour, no section wash, a horizon without the marker dot, dimmer stars ahead', () => {
  const plain = frame(STARRY), sky = frame({...STARRY, nightSky: true});
  assert.notEqual(sky.json, plain.json);
  assert.deepEqual(sky.stats.backdrop, {sky: [...ScoreView.NIGHT.sky]});
  assert.equal(sky.calls[1].fillStyle, `rgba(${ScoreView.NIGHT.sky.join(',')},1)`);
  // The same sky at any moment (the background is still).
  for (const t of [3, 21, 50]) assert.deepEqual(frame({...STARRY, nightSky: true}, t).stats.backdrop, sky.stats.backdrop);
  // The play line: no round marker at its top, a soft glow and a fine line instead.
  const dot = c => c.name === 'arc' && Math.abs(c.args[2] - 2.6) < 1e-9;
  assert.ok(plain.calls.some(dot) && !sky.calls.some(dot));
  // Notes to come are dimmer points (the preview dots' light is starDim, not .78).
  assert.ok(plain.calls.some(c => c.name === 'fill' && /,0\.78\)$/.test(c.fillStyle)));
  assert.ok(sky.calls.some(c => c.name === 'fill' && /,0\.34\)$/.test(c.fillStyle)));
  assert.ok(!sky.calls.some(c => c.name === 'fill' && /,0\.78\)$/.test(c.fillStyle)));
});

test('the cover tints the sky by its hue only: a bright cover never lifts the night', () => {
  const luma = rgb => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  // A stand-in OffscreenCanvas whose 8 x 8 read-back is one colour.
  const average = colour => {
    const saved = globalThis.OffscreenCanvas;
    globalThis.OffscreenCanvas = class { getContext() { return {drawImage() {}, getImageData: () => ({data: Uint8ClampedArray.from({length: 256}, (_, i) => (i % 4 === 3 ? 255 : colour[i % 4]))})}; } };
    try {
      const surface = mockCanvas(800, 400);
      const view = ScoreView.create(surface.canvas, fullModel(), () => 0, {...STARRY, nightSky: true});
      view.setCover({width: 480, height: 480});
      view.draw(10);
      return view.draw(10).backdrop.sky;
    } finally { globalThis.OffscreenCanvas = saved; }
  };
  const night = luma(ScoreView.NIGHT.sky);
  for (const colour of [[240, 220, 120], [220, 60, 40], [60, 90, 170]]) {
    const sky = average(colour);
    assert.ok(Math.abs(luma(sky) - night) < 2.5, `${colour} → ${sky}`);
  }
  assert.ok(average([220, 60, 40])[0] > average([60, 90, 170])[0], '红封面的天偏红');
});

test('「原样」 is a look of its own: the presentation draws starry as the night sky and plain as before', () => {
  assert.ok(styles.styles.includes('plain'));
  assert.equal(styles.normalize('plain'), 'plain');
  const look = style => {
    const surface = mockCanvas(800, 400);
    const view = Presentation.create(surface.canvas, fullModel(), () => 0, {...STARRY, scoreStyle: style});
    return view.options().nightSky;
  };
  globalThis.XinScoreMood = {normalize: value => styles.normalize(value)};
  try {
    assert.equal(look('starry'), true);
    assert.equal(look('plain'), false);
  } finally { delete globalThis.XinScoreMood; }
});
