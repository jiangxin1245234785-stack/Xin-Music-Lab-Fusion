'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {mockCanvas} = require('./helpers.cjs');
const Weather = require('../score-terrain-weather.js');
const terrain = require('../score-terrain.js');
const {directCabinSun, layout, sillSunPatch} = terrain._internal;

const duration = 120;
const step = .5;
const samples = sample => Array.from({length: duration / step + 1}, (_, i) =>
  typeof sample === 'function' ? sample(i * step) : sample);
const song = moodCurve => ({track: {duration}, lanes: [], moodCurve});
const precipitation = ['rain', 'snow', 'sandstorm'];
const sizes = [
  [1123, 778], [1440, 778], [1440, 900], [1707, 1067],
  [2560, 1600], [3441, 1440], [1920, 1080], [3840, 2160],
];
const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-9,
  `${label}: ${actual} vs ${expected}`);

function curve(slow, fast = .5) {
  return {
    kind: 'mood-curve', schemaVersion: 1, formulaVersion: 'mood-direct-1', scaleVersion: 'mood-scale-1',
    engineVersion: 1, duration, step, loudnessMode: 'half', belowFlatnessGate: [],
    slow: samples(slow), fast: samples(fast),
    shape: {fast: samples(.5), slow: samples(.5)},
    components: {lufs: samples(-25), band28Dbfs: samples(-35), logFlatness: samples(-4)},
  };
}

test('cabin sunlight follows the clear-sky cloud amount continuously on the song clock', () => {
  const model = song(curve(t => t / duration, t => (1 + Math.sin(t)) / 2));
  const calm = song(curve(t => t / duration, 0));
  const read = (model, time) => Weather.sample(model, time, {terrainWeather: 'clear'});
  let prior = 1;
  for (let t = 0; t <= duration; t += .25) {
    const weather = read(model, t);
    assert.equal(weather.source, 'mood-curve');
    const direct = directCabinSun(weather, 'clear');
    assert.ok(direct >= 0 && direct <= prior + 1e-9 && prior - direct < .004, `sunlight at ${t}s`);
    close(direct, (1 - weather.cloudOpacity) / .65, `cloud complement at ${t}s`);
    close(direct, directCabinSun(read(calm, t), 'clear'), `fast curve at ${t}s`);
    prior = direct;
  }
  assert.equal(directCabinSun(read(model, 0), 'clear'), 1);
  assert.equal(directCabinSun(read(model, duration), 'clear'), 0);
  const target = directCabinSun(read(model, 47.13), 'clear');
  for (const t of [118, 0, 48, 1]) read(model, t);
  assert.equal(directCabinSun(read(model, 47.13), 'clear'), target);
  assert.equal(directCabinSun(read(song(), 60), 'clear'), 1);
  assert.equal(directCabinSun(read(song({...curve(.8), formulaVersion: 'unsupported'}), 60), 'clear'), 1);
  assert.equal(directCabinSun(undefined, 'clear'), 1);
});

test('precipitation blocks direct sunlight even before its renderer is ready', () => {
  const sunny = Weather.sample(song(curve(0)), 60, {terrainWeather: 'clear'});
  for (const mode of precipitation) {
    assert.equal(directCabinSun(undefined, mode), 0, mode);
    assert.equal(directCabinSun(sunny, mode), 0, mode);
    for (const level of [0, .5, 1]) {
      const weather = Weather.sample(song(curve(level)), 60, {terrainWeather: mode});
      assert.equal(directCabinSun(weather, mode), 0, `${mode} at ${level}`);
    }
  }
});

test('the fixed sill patch stays on the wooden shelf and slants away from upper-left light', () => {
  for (const [w, h] of sizes) {
    const L = layout(w, h);
    const {glass, shelf} = L.cabin;
    const {points, top, bottom} = sillSunPatch(L);
    const label = `${w}x${h}`;
    assert.ok(top > glass.y + glass.h && top <= shelf.back + 1e-9, label);
    assert.ok(bottom > shelf.back && bottom <= shelf.front + 1e-9, label);
    assert.equal(points.length, 4);
    const [backLeft, backRight, frontRight, frontLeft] = points;
    for (const [x, y] of points) {
      assert.ok(Number.isFinite(x) && y >= top && y <= bottom, label);
    }
    assert.ok(backLeft[0] >= 0 && backRight[0] <= w && frontLeft[0] < w, label);
    assert.ok(backLeft[0] < backRight[0] && frontLeft[0] < frontRight[0], label);
    assert.ok(frontLeft[0] > backLeft[0] && frontRight[0] > backRight[0], label);
    assert.deepEqual(sillSunPatch(layout(w, h)), {points, top, bottom});
  }
});

function draw(model, time, mode, w = 1440, h = 900) {
  const {canvas, calls} = mockCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.arcTo = () => {};
  terrain.draw(ctx, {w, h, time, song: model, terrainWeather: mode, terrainRoadside: 'off'});
  return calls;
}

function sunlightDrawing(calls, L) {
  const sky = calls.find(call => call.name === 'fillRect' && call.composite === 'screen' && call.fillStyle?.circles);
  const patchPaints = calls.filter(call => call.name === 'drawImage' && call.args[0].hasSillPatch)
    .map(({args, alpha}) => ({args, alpha}));
  const glassBottom = L.cabin.glass.y + L.cabin.glass.h;
  for (const {args} of patchPaints) {
    const [x, y, w, h] = args.slice(-4);
    assert.ok(y >= glassBottom && y + h <= L.h, 'the sill light sprite stays below the glass on the canvas');
    assert.ok(x >= 0 && x + w <= L.w, 'the raster clips the patch at the frame edge');
  }
  return {patchPaints, sky: sky?.fillStyle.circles};
}

function recordSillSprites(t, L) {
  const priorCanvas = globalThis.OffscreenCanvas;
  const {points} = sillSunPatch(L);
  globalThis.OffscreenCanvas = function (w, h) {
    const {canvas, calls, reset} = mockCanvas(w, h);
    const ctx = canvas.getContext('2d');
    Object.assign(ctx, {
      arcTo() {}, clearRect() {}, putImageData() {},
      createImageData: (width, height) => ({data: new Uint8ClampedArray(width * height * 4)}),
    });
    const beginPath = ctx.beginPath;
    ctx.beginPath = () => { reset(); beginPath(); };
    const markPatch = paint => (...args) => {
      const path = calls.slice(calls.findLastIndex(call => call.name === 'beginPath'))
        .filter(call => call.name === 'moveTo' || call.name === 'lineTo').map(call => call.args);
      if (path.length === points.length) {
        // The same projected quad may be translated to the sprite's local origin.
        const [[x0, y0]] = path;
        const [[worldX, worldY]] = points;
        canvas.hasSillPatch ||= path.every(([x, y], i) =>
          Math.abs(x - x0 - (points[i][0] - worldX)) < 1e-9 &&
          Math.abs(y - y0 - (points[i][1] - worldY)) < 1e-9);
      }
      if (canvas.hasSillPatch && ctx.globalCompositeOperation === 'destination-out') {
        canvas.castMask ??= path;
      }
      paint(...args);
    };
    ctx.fill = markPatch(ctx.fill);
    ctx.clip = markPatch(ctx.clip);
    return canvas;
  };
  t.after(() => { globalThis.OffscreenCanvas = priorCanvas; });
}

test('the rendered sun stays upper-left and its shelf patch does not move across song times', t => {
  const priorRain = globalThis.XinTerrainRain;
  globalThis.XinTerrainRain = undefined;
  t.after(() => { globalThis.XinTerrainRain = priorRain; });
  const L = layout(1440, 900);
  recordSillSprites(t, L);
  const model = song(curve(time => time / duration));
  const at = (time, weather) => sunlightDrawing(draw(model, time, weather), L);
  const first = at(0, 'clear');
  assert.ok(first.sky && first.sky[0] < L.left + L.Wm / 2, 'clear sky light originates on the left');
  assert.ok(first.patchPaints.length, 'clear sky paints a sill patch');
  const [sprite] = first.patchPaints[0].args;
  const caseWidth = L.sillDeck.w / L.cabin.deckUnit;
  assert.ok(sprite.castMask?.some(([x]) => x > caseWidth), 'the radio occludes the patch to its right');
  const [[contactX, contactY], [projectedX, projectedY]] = sprite.castMask;
  assert.ok(projectedX > contactX && projectedY > contactY, 'the shadow travels right and toward the viewer');
  const similar = at(20, 'clear');
  assert.equal(similar.patchPaints[0].args[0], sprite, 'nearby sun strengths reuse their cached penumbra');
  assert.ok(similar.patchPaints[0].alpha < first.patchPaints[0].alpha, 'alpha varies within the cache bin');
  const cloudier = at(75, 'clear');
  assert.deepEqual(cloudier.sky, first.sky);
  assert.equal(cloudier.patchPaints.length, first.patchPaints.length);
  for (const [i, paint] of cloudier.patchPaints.entries()) {
    assert.deepEqual(paint.args.slice(1), first.patchPaints[i].args.slice(1), 'the sprite geometry remains fixed');
  }
  assert.ok(cloudier.patchPaints[0].alpha < first.patchPaints[0].alpha, 'clouds attenuate the painted patch');
  assert.deepEqual(at(120, 'clear').patchPaints, [], 'complete cloud cover blocks the patch');
  for (const ready of [false, true]) {
    globalThis.XinTerrainRain = {isReady: () => ready, prepare() {}};
    for (const mode of precipitation) {
      assert.deepEqual(at(0, mode).patchPaints, [], `${mode}, renderer ready: ${ready}`);
    }
  }
  assert.deepEqual(at(75, 'clear'), cloudier, 'seeking back to the same frame preserves the light');
});
