'use strict';
// Trackside stations and the cabin route share the same song clock.
const assert = require('node:assert/strict');
const test = require('node:test');
const {mockCanvas} = require('./helpers.cjs');
const Led = require('../score-terrain-led.js');
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
  assert.deepEqual(list.map(x => x.name), ['VERSE 1', 'CHORUS 1', 'SOLO', 'VERSE 2', 'PRE', 'BREAK', 'CHORUS 3', 'OUTRO']);
  assert.equal(list.sections[6][2], 'CHORUS 2', 'the route still includes an outdoor stop suppressed by spacing');
  // the same song gives the same stations every time
  assert.deepEqual(stations(song(s.sections)).map(x => [x.t, x.kind, x.variant]), list.map(x => [x.t, x.kind, x.variant]));
  assert.equal(stations(song([])).length, 0, 'no sections, no stations');
  assert.equal(stations(song(undefined)).length, 0);
  assert.equal(stations(song([[5, 100, 'one', 'x', 'verse']])).length, 0, 'one section: no change to pass');
});

test('the plaque and cabin LED meet at 90 s, including direct seeks and alternate render sizes', () => {
  const s = song([[90, 120, '副歌 1', 'x', 'chorus'], [5, 20, '引子', 'x', 'intro'], [20, 90, '主歌 1', 'x', 'verse'], [120, 190, '主歌 2', 'x', 'verse']]);
  const prior = globalThis.OffscreenCanvas;
  let header, sill;
  globalThis.XinScoreTerrainLed = {...Led, drawHeader(ctx, rect, data) { header = data; },
    drawLyric(ctx, rect, data, opts) { sill = opts.standby; }};
  const painted = [];
  globalThis.OffscreenCanvas = function (w, h) {
    const m = mockCanvas(w, h), ctx = m.canvas.getContext('2d');
    Object.assign(ctx, {arcTo() {}, clearRect() {}, createImageData: (W, H) => ({data: new Uint8ClampedArray(W * H * 4)}), putImageData() {}, getTransform: () => ({a: 1, d: 1, e: 0, f: 0}),
      fillText(text) { if (ctx.font.includes('Georgia')) painted.push(text); }});
    return {width: Math.ceil(w), height: Math.ceil(h), getContext: () => ctx};
  };
  try {
    const draw = (t, mode, w = 1024, h = 576) => { const m = mockCanvas(w, h), ctx = m.canvas.getContext('2d'); Object.assign(ctx, {arcTo() {}, createPattern: () => ({}), getTransform: () => ({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0})}); return terrain.draw(ctx, {song: s, w, h, time: t, terrainRoadside: mode}); };
    const signAt = frame => frame.stations.find(x => x.kind === 'sign');
    const current = () => header.sections[Led.headerModel(header, 478, Led.headerRows(16, 12), 16, 12).plan.cur][2];
    const L = layout(1024, 576);
    const before = signAt(draw(89.75, 'off'));
    const signSpeed = 5 * (802 - 664), half = 14 + 8 * 9;
    assert.ok(!before || before.x - half > L.entryAt(802 - 51 - 36));
    assert.equal(current(), 'VERSE 1');
    const exact = draw(90, 'all');
    const board = signAt(exact);
    assert.deepEqual(board, {kind: 'sign', name: 'CHORUS 1', platform: true, t: 90, x: L.entryAt(802 - 51 - 36) + half});
    assert.equal(current(), board.name);
    const top = Led.headerModel(header, 478, Led.headerRows(16, 12), 16, 12);
    assert.equal(top.labels[top.plan.cur], 'C1');
    assert.equal(sill.tag, 'CHORUS 1');
    assert.equal(header.speedMps, 5 / .316);
    assert.equal(Led.readout(header, 90, D).now, '0.8');
    assert.ok(exact.stations.some(x => x.kind === 'town' && x.x === L.entryAt(736 - .7 * x.tall)));
    assert.ok(Math.abs(signAt(draw(90.25, 'kick-snare')).x - board.x + .25 * signSpeed) < 1e-9);
    assert.equal(draw(40, 'all').stations.length, 0);
    assert.deepEqual(signAt(draw(90, 'all')), board);
    assert.equal(painted.filter(name => name === 'CHORUS 1').length, 1, 'the scene paints one physical plaque');
    assert.deepEqual(signAt(draw(20, 'all')), {kind: 'sign', name: 'VERSE 1', platform: false, t: 20, x: L.entryAt(802 - 37 - 36) + 77});
    for (const [w, h] of [[1123, 786], [1707, 1067], [1920, 1080], [360, 640]]) {
      const other = signAt(draw(90, 'off', w, h));
      assert.equal(other.x - half, layout(w, h).entryAt(802 - 51 - 36));
      assert.equal(other.name, current());
    }
  } finally { globalThis.OffscreenCanvas = prior; globalThis.XinScoreTerrainLed = Led; }
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

test('near the station the tom, snare and pole make way for the plaque; farther away they stay', () => {
  const s = song([[5, 20, 'a', 'x', 'intro'], [20, 60, 'b', 'x', 'verse'], [60, 120, 'c', 'x', 'chorus'], [120, 190, 'd', 'x', 'verse']]);
  // a tom, a snare and a kick right at the town (60 s), and the same again far from any station (100 s)
  s.lanes[0].hits = [[60, 4, 110], [60.02, 1, 110], [60.04, 0, 110], [100, 4, 110], [100.02, 1, 110], [100.04, 0, 110]];
  const m = mockCanvas(1440, 778), ctx = Object.assign(m.canvas.getContext('2d'), {arcTo() {}});
  const at = t => terrain.draw(ctx, {song: s, w: 1440, h: 778, time: t, terrainRoadside: 'all'}).roadside;
  const town = at(60), open = at(100);
  assert.equal(town.yielded, 3);
  assert.equal(town.kick || 0, 0);
  assert.equal(open.yielded || 0, 0, 'nothing makes way away from a station');
  assert.equal(open.tom, 1); assert.equal(open.snare, 1); assert.equal(open.kick, 1);
});

test('station materials follow the selected weather while the route and signal phase follow song time', () => {
  const Weather = require('../score-terrain-weather.js');
  const prior = {OffscreenCanvas: globalThis.OffscreenCanvas, XinTerrainWeather: globalThis.XinTerrainWeather, XinTerrainRain: globalThis.XinTerrainRain};
  const s = song([[5, 20, 'Intro'], [20, 40, 'Chorus 1'], [40, 60, 'Chorus 2'], [60, 120, 'Chorus 3'], [120, 190, 'Outro']]);
  let surface = .8, bakes;
  globalThis.XinTerrainWeather = {sample(song, t, config) { return {...Weather.sample(song, t, config), surface}; }};
  globalThis.XinTerrainRain = {isReady: () => true, drawDistantRain() {}, drawGlass() {}};
  globalThis.OffscreenCanvas = function (w, h) {
    const m = mockCanvas(w, h);
    const g = Object.assign(m.canvas.getContext('2d'), {arcTo() {}, clearRect() {}, getTransform: () => ({a: 1, d: 1, e: 0, f: 0}),
      createImageData: (W, H) => ({data: new Uint8ClampedArray(W * H * 4)}), putImageData() {}});
    const fillText = g.fillText;
    g.fillText = (...args) => { if (g.font.includes('Georgia')) bakes.push({name: args[0], calls: m.calls}); fillText(...args); };
    return {width: Math.ceil(w), height: Math.ceil(h), getContext: () => g};
  };
  try {
    const draw = (mode, t = 61) => {
      bakes = [];
      const m = mockCanvas(1440, 900);
      const ctx = Object.assign(m.canvas.getContext('2d'), {arcTo() {}, createPattern: () => ({}), getTransform: () => ({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0})});
      const frame = terrain.draw(ctx, {song: s, w: 1440, h: 900, time: t, terrainWeather: mode});
      return {stations: frame.stations, calls: m.calls, bakes};
    };
    const clear = draw(undefined);
    assert.ok(clear.stations.some(st => st.kind === 'crossing'));
    assert.ok(clear.bakes.some(bake => bake.name === 'CHORUS 3'));
    for (const [mode, material] of [['rain', '44,58,69'], ['snow', '224,237,248'], ['sandstorm', '215,168,105']]) {
      const frame = draw(mode);
      assert.deepEqual(frame.stations, clear.stations);
      const plaque = frame.bakes.find(bake => bake.name === 'CHORUS 3');
      assert.ok(plaque.calls.some(call => JSON.stringify(call.fillStyle).includes(material)), mode);
      surface = .81;
      assert.equal(draw(mode).bakes.length, 0, 'nearby surface values reuse the sprite');
      surface = .8;
    }
    const signal = frame => frame.calls.findIndex(call => call.name === 'fill' && call.fillStyle.startsWith?.('rgba(232,74,52,'));
    const unlit = frame => frame.calls.findIndex(call => call.name === 'fill' && call.fillStyle === 'rgba(92,40,34,1)');
    assert.ok(signal(clear) >= 0 && signal(clear) < unlit(clear));
    const other = draw('rain', 61.5);
    assert.ok(unlit(other) >= 0 && unlit(other) < signal(other));
  } finally { Object.assign(globalThis, prior); }
});
