'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const terrain = require('../score-terrain.js');
const {wheelAngle} = terrain._internal;
const {mockCanvas} = require('./helpers.cjs');

test('windpump phase follows integrated wind and is stable after seeking', () => {
  const tau = 2 * Math.PI;
  const advance = (from, to) => (to - from + tau) % tau;
  const t = 70, index = 2, dt = .01;
  const calm = advance(wheelAngle(t, index), wheelAngle(t + dt, index));
  const gust = advance(wheelAngle(t, index, 20), wheelAngle(t + dt, index, 20 + dt));
  assert.ok(gust > 3 * calm, 'gusts turn the rotor faster');

  const sheltered = advance(wheelAngle(t, index, 20), wheelAngle(t + dt, index, 20));
  assert.ok(Math.abs(sheltered - calm) < 1e-12, 'once the gust passes, its accumulated phase remains but its speed boost is gone');
  const phase = wheelAngle(t, index, 20);
  assert.notEqual(phase, wheelAngle(t, index));
  wheelAngle(99, index, 38);
  wheelAngle(4, index, 1);
  assert.equal(wheelAngle(t, index, 20), phase);
});

test('snow cover changes opacity on the same roadside sprite after a direct seek', t => {
  const OriginalCanvas = globalThis.OffscreenCanvas, originalWeather = globalThis.XinTerrainWeather;
  t.after(() => {
    globalThis.OffscreenCanvas = OriginalCanvas;
    globalThis.XinTerrainWeather = originalWeather;
  });
  const canvas = (w, h) => {
    const result = mockCanvas(w, h);
    result.canvas.getContext('2d').arcTo = () => {};
    return result;
  };
  globalThis.OffscreenCanvas = class {
    constructor(w, h) { return canvas(w, h).canvas; }
  };
  let surface = 0;
  globalThis.XinTerrainWeather = {sample: () => ({snow: true, surface, stormDrive: 0})};
  const song = {track: {duration: 110}, sections: [], lanes: [
    {group: 'bass', notes: [[1, 107, 42, 96]]},
    {group: 'drums', kind: 'drums', rows: ['kick'], hits: [[50, 0, 96]]}
  ]};
  const draw = (time, coverage) => {
    surface = coverage;
    const result = canvas(1123, 783);
    const scene = terrain.draw(result.canvas.getContext('2d'), {song, w: 1123, h: 783, time, terrainWeather: 'snow', terrainRoadside: 'all'});
    return {poles: scene.roadside.poles, caps: result.calls.filter(call => call.name === 'drawImage' && call.alpha === coverage)};
  };
  const first = draw(50, .27);
  assert.ok(first.poles.length);
  assert.equal(first.caps.length, 1);
  draw(80, .09);
  const later = draw(50, .73);
  assert.equal(later.caps.length, 1);
  assert.deepEqual(later.poles, first.poles);
  assert.equal(later.caps[0].args[0], first.caps[0].args[0], 'continuous cover reuses the cached shape');
  assert.deepEqual(later.caps[0].args.slice(1), first.caps[0].args.slice(1));
});
