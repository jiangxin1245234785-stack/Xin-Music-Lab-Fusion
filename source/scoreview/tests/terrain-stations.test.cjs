'use strict';
// 车窗地貌 batch 6: passing stations - a town for a big section, a sign for every other change, at the LED's own moment.
const assert = require('node:assert/strict');
const test = require('node:test');
const {mockCanvas} = require('./helpers.cjs');
const terrain = require('../score-terrain.js');
const {stations, layout} = terrain._internal;

const D = 200;
const level = (from, to, db = -18) => Array.from({length: D}, (_, i) => i >= from && i < to ? db : -90);
const song = sections => ({
  track: {id: 'stations', title: 'S', duration: D},
  lanes: [{id: 'k', group: 'drums', kind: 'drums', rows: ['kick', 'snare', 'hihat', 'openhat', 'tom', 'crash', 'ride'],
    hits: Array.from({length: 80}, (_, i) => [20 + i * 2, 5, 120])}],
  levels: {hop: 1, groups: {bass: level(10, 190), guitar: level(10, 190), vocals: level(10, 190)}},
  sections
});

test('which changes get a town, a sign or nothing: kind first, name when there is no kind; the plains, the ends, close changes', () => {
  const s = song([
    [5, 20, '引子', 'x', 'intro'],          // the first section's start: no station
    [20, 40, '主歌 1', 'x', 'verse'],       // sign
    [40, 60, '副歌 1', 'x', 'chorus'],      // town
    [60, 80, 'Solo', 'x', ''],              // no kind: name says solo -> town
    [80, 85, '主歌 2', 'x', 'verse'],       // sign
    [85, 87, '导歌', 'x', 'pre-chorus'],    // 5 s after the last: sign anyway
    [87, 110, '副歌 2', 'x', 'chorus'],     // 2 s after: nothing
    [110, 115, '间奏', 'x', 'interlude'],   // town? 23 s after the last drawn (85): town
    [115, 150, '副歌 3', 'x', 'chorus'],    // 5 s after: downgraded to a sign
    [150, 196, '尾奏', 'x', 'outro'],       // sign
    [196, 200, '尾声', 'x', 'outro']        // in the closing plain: nothing
  ]);
  const list = stations(s);
  assert.deepEqual(list.map(x => [x.t, x.kind]), [[20, 'sign'], [40, 'town'], [60, 'town'], [80, 'sign'], [85, 'sign'], [110, 'town'], [115, 'sign'], [150, 'sign']]);
  assert.deepEqual(list.table.map(r => r.why), ['', '', '', '', '', 'close', '', 'close', '', 'plain']);
  assert.deepEqual(list.filter(x => x.kind === 'town').map(x => x.variant), [0, 1, 3], 'towns turn by which big section it is (the 4th big one, 副歌 2, had none)');
  // the same song gives the same stations every time
  assert.deepEqual(stations(song(s.sections)).map(x => [x.t, x.kind, x.variant]), list.map(x => [x.t, x.kind, x.variant]));
  assert.equal(stations(song([])).length, 0, 'no sections, no stations');
  assert.equal(stations(song(undefined)).length, 0);
  assert.equal(stations(song([[5, 100, 'one', 'x', 'verse']])).length, 0, 'one section: no change to pass');
});

test('a station passes "now" at the change (the LED moves its lamp then), roadside off or on; nothing outside the window', () => {
  const s = song([[5, 20, 'a', 'x', 'intro'], [20, 60, 'b', 'x', 'verse'], [60, 120, 'c', 'x', 'chorus'], [120, 190, 'd', 'x', 'verse']]);
  const prior = globalThis.OffscreenCanvas;
  globalThis.OffscreenCanvas = function (w, h) {
    const m = mockCanvas(w, h), ctx = m.canvas.getContext('2d');
    Object.assign(ctx, {arcTo() {}, clearRect() {}, createImageData: (W, H) => ({data: new Uint8ClampedArray(W * H * 4)}), putImageData() {}, getTransform: () => ({a: 1, d: 1, e: 0, f: 0})});
    return {width: Math.ceil(w), height: Math.ceil(h), getContext: () => ctx};
  };
  try {
    const draw = (t, mode) => { const m = mockCanvas(1440, 778), ctx = m.canvas.getContext('2d'); Object.assign(ctx, {arcTo() {}, createPattern: () => ({}), getTransform: () => ({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0})}); return terrain.draw(ctx, {song: s, w: 1440, h: 778, time: t, terrainRoadside: mode}); };
    const L = layout(1440, 778);
    for (const mode of ['off', 'all', 'kick-snare']) {
      const sign = draw(20, mode).stations.find(x => x.kind === 'sign');
      assert.ok(sign && Math.abs(sign.x - L.nowM) < 1e-9, mode + ': the sign at now at the change');
      const town = draw(60, mode).stations.find(x => x.kind === 'town');
      assert.ok(town && Math.abs(town.x - L.nowM) < 1e-9, mode + ': the town\'s tallest thing at now at the change');
    }
    assert.equal(draw(40, 'all').stations.length, 0, 'between changes: nothing');
    // the sign is in the window for a little over a second, the town for some seconds
    const seen = (from, to, kind) => { let n = 0; for (let t = from; t <= to; t += .05) if (draw(t, 'off').stations.some(x => x.kind === kind)) n++; return n * .05; };
    const signFor = seen(17, 23, 'sign'), townFor = seen(52, 68, 'town');
    assert.ok(signFor > .9 && signFor < 2, 'sign ' + signFor);
    assert.ok(townFor > 4 && townFor < 8, 'town ' + townFor);
  } finally { globalThis.OffscreenCanvas = prior; }
});

test('windpumps and flocks inside a town make way; elsewhere they stay', () => {
  const s = song([[5, 20, 'a', 'x', 'intro'], [20, 60, 'b', 'x', 'verse'], [60, 120, 'c', 'x', 'chorus'], [120, 190, 'd', 'x', 'verse']]);
  const list = stations(s), town = list.find(x => x.kind === 'town');
  assert.ok(town.span[0] < 0 && town.span[1] > 0);
  // the crash at 60 s (a windpump: the first in 8 s) stands right where the town is: it is not drawn; others are
  const m = mockCanvas(1440, 778), ctx = Object.assign(m.canvas.getContext('2d'), {arcTo() {}});
  const S = terrain.draw(ctx, {song: s, w: 1440, h: 778, time: 60, terrainRoadside: 'all'});
  assert.equal(S.roadside.yielded, 1);
  assert.ok(S.roadside.crash >= 1, 'the windpumps of 52 and 68 s still stand');
  assert.ok(town.tall >= 60 && town.tall <= 150 && town.tall <= Math.max(60, .8 * town.behind + 1e-9), 'no taller than 0.8 x the range behind (60-150): ' + town.tall + ' / ' + town.behind);
});

test('batch 7: inside a town\'s stretch the rock piles, sage and mile posts make way too; the poles do not', () => {
  const s = song([[5, 20, 'a', 'x', 'intro'], [20, 60, 'b', 'x', 'verse'], [60, 120, 'c', 'x', 'chorus'], [120, 190, 'd', 'x', 'verse']]);
  // a tom, a snare and a kick right at the town (60 s), and the same again far from any station (100 s)
  s.lanes[0].hits = [[60, 4, 110], [60.02, 1, 110], [60.04, 0, 110], [100, 4, 110], [100.02, 1, 110], [100.04, 0, 110]];
  const m = mockCanvas(1440, 778), ctx = Object.assign(m.canvas.getContext('2d'), {arcTo() {}});
  const at = t => terrain.draw(ctx, {song: s, w: 1440, h: 778, time: t, terrainRoadside: 'all'}).roadside;
  const town = at(60), open = at(100);
  assert.equal(town.yielded, 2, 'the tom and the snare at the town make way');
  assert.equal(town.kick, 1, 'the pole stays');
  assert.equal(open.yielded || 0, 0, 'nothing makes way away from a station');
  assert.equal(open.tom, 1); assert.equal(open.snare, 1);
});
