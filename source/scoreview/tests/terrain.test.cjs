'use strict';
// 车窗地貌 (terrain), rebuilt 2026-11-19: one stem one range, height from loudness, near fast / far slow, plain at both
// ends, fixed afternoon light with a mild cover tint, a train window frame. Written against the new picture; the old
// strata look had no tests of its own.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const {mockCanvas} = require('./helpers.cjs');
const terrain = require('../score-terrain.js');
const {layout, analysePixels, coverMild, BASE, geometry} = terrain._internal;

const D = 120;
const level = (from, to, db = -18) => Array.from({length: D}, (_, i) => i >= from && i < to ? db : -90);
const notes = (from, to, every, len, vel = 96) => { const out = []; for (let t = from; t < to; t += every) out.push([t, len, 60 + (out.length % 12), vel]); return out; };
const song = (extra = {}) => ({
  track: {id: 'terrain-test', title: 'Test', duration: D},
  lanes: [
    {id: 'gtr', group: 'guitar', kind: 'pitched', notes: notes(20, 100, .12, .1)},
    {id: 'vox', group: 'vocals', kind: 'pitched', notes: notes(20, 100, 1.5, 1.2)},
    {id: 'vn', group: 'violin', kind: 'pitched', notes: notes(30, 100, .5, .4)},
    {id: 'kit', group: 'drums', kind: 'drums', hits: [[30, 0, 100], [31, 1, 100]]}
  ],
  levels: {hop: 1, groups: {bass: level(20, 100), guitar: level(20, 100), violin: level(30, 100), vocals: level(20, 100), drums: level(20, 100, -10)}},
  ...extra
});
const frame = (s, time, extra = {}) => ({song: s, w: 1123, h: 783, time, ...extra});

test('one stem one range, near to far; drums are not a range; a stem the song lacks has none; violin is kept', () => {
  const d = terrain.inspect(frame(song(), 60)).detail;
  assert.deepEqual(d.ranges.map(r => r.id), ['bass', 'guitar', 'violin', 'vocals']);
  assert.deepEqual(d.ranges.map(r => r.span), [10, 16.67, 23.33, 30]);
  assert.equal(d.basis, 'levels');
});

test('a pitched other range uses the strings position and reacts to the other levels', () => {
  const mock = (group, label, kind = 'pitched') => song({
    lanes: [{id: group, group, kind, label, notes: notes(20, 100, .5, .4)}],
    levels: {hop: 1, groups: {guitar: level(20, 100), winds: level(20, 100), [group]: level(20, 100)}}
  });
  const ranges = (group, label, kind) => terrain.inspect(frame(mock(group, label, kind), 60)).detail.ranges;
  const synth = ranges('other', '合成');
  assert.deepEqual(synth.map(r => r.id), ['guitar', 'winds', 'strings']);
  assert.equal(synth[2].name, '合成');
  assert.equal(synth[2].heightAtNow, ranges('strings', 'Strings')[2].heightAtNow);
  assert.deepEqual(ranges('other', 'Texture', 'texture').map(r => r.id), ['guitar', 'other', 'winds']);
});

test('height follows loudness: ranges stand while their stem sounds and sink into the plain when it is quiet', () => {
  const s = song({levels: {hop: 1, groups: {bass: level(20, 100), guitar: level(20, 100), vocals: level(20, 60).map((v, i) => i >= 80 && i < 100 ? -18 : v)}}});
  const loud = terrain.inspect(frame(s, 50)).detail.ranges.find(r => r.id === 'vocals');
  const quiet = terrain.inspect(frame(s, 70)).detail.ranges.find(r => r.id === 'vocals');
  assert.ok(loud.heightAtNow > 60, 'vocals stand at 0:50: ' + loud.heightAtNow);
  assert.ok(quiet.heightAtNow < 1, 'vocals sunk at 1:10: ' + quiet.heightAtNow);
});

test('the song opens and closes on the plain: nothing in the window at the first and the last second', () => {
  const s = song();
  for (const t of [0, .5, D - .5, D]) {
    const d = terrain.inspect(frame(s, t)).detail;
    for (const r of d.ranges) assert.ok(r.maxHeight < .5, `${r.id} at ${t}: ${r.maxHeight}`);
  }
  assert.ok(terrain.inspect(frame(s, 60)).detail.ranges.every(r => r.maxHeight > 20));
});

test('the opening plain lasts until the first instrument, at most 8 s; the closing one the same', () => {
  assert.deepEqual(terrain.inspect(frame(song(), 60)).detail.plain, {start: 8, end: 112});
  const early = song({levels: {hop: 1, groups: {bass: level(0, 117), guitar: level(3, 116)}}});
  const p = terrain.inspect(frame(early, 60)).detail.plain;
  assert.ok(p.start <= .5, 'starts with the first instrument: ' + p.start);
  assert.ok(p.end >= 115.5, 'ends with the last one: ' + p.end);
});

test('a range eases out of the plain over a slope, never a wall (flank steepness capped per column)', () => {
  const s = song();
  for (const t of [9, 14, 40, 60, 104, 110]) {
    for (const R of geometry(frame(s, t)).ranges) {
      const cap = (R.i ? 1.5 + 1.3 : 6) * 2 + 1e-9;
      for (let j = R.ja + 1; j <= R.jb; j++) {
        const dh = Math.abs((R.foot[j] - R.ys[j]) - (R.foot[j - 1] - R.ys[j - 1]));
        assert.ok(dh <= cap, `${R.id} at ${t}: ${dh}`);
      }
    }
  }
});

test('feet step up with depth and the fixture with sustained loud stems shows multiple layers', () => {
  const G = geometry(frame(song(), 60));
  const at = (R, arr) => arr[Math.round((R.entryM - R.x0) / 2)];
  for (let i = 1; i < G.ranges.length; i++) {
    assert.ok(at(G.ranges[i], G.ranges[i].foot) < at(G.ranges[i - 1], G.ranges[i - 1].foot) - 10);
    let shows = 0;
    const R = G.ranges[i], Q = G.ranges[i - 1];
    for (let j = R.ja; j <= R.jb; j++) { const x = R.x0 + j * 2, q = Q.ys[Math.round((x - Q.x0) / 2)]; if (R.ys[j] < q - 8) shows++; }
    assert.ok(shows > (R.jb - R.ja) * .5, `${R.id} shows over ${Q.id} in ${shows} columns`);
  }
});

test('foreground can hide a quieter ridge until it passes', () => {
  const s = song({levels: {hop: 1, groups: {
    bass: level(20, 100, -10).map((db, i) => i >= 62 && i < 100 ? -28 : db),
    vocals: level(20, 100, -34)
  }}});
  const centralRidges = t => geometry(frame(s, t)).ranges.map(R => R.ys[Math.round((R.ja + R.jb) / 2)]);
  const [frontLoud, backLoud] = centralRidges(56);
  const [frontQuiet, backQuiet] = centralRidges(74);
  assert.ok(frontLoud < backLoud - 10, 'the loud near range covers the quiet ridge');
  assert.ok(backQuiet < frontQuiet - 10, 'the far ridge is exposed when the near range is shorter');
});

test('near fast, far slow: every ridge and foot translates rigidly on its own grid', () => {
  const levels = {hop: 1, groups: {
    bass: level(20, 100).map((db, i) => i >= 56 && i <= 64 ? -90 : db),
    guitar: level(20, 100).map((db, i) => i >= 62 && i <= 68 ? -32 : db),
    violin: level(30, 100), vocals: level(20, 100)
  }};
  const s = song({levels}), a = geometry(frame(s, 60)), b = geometry(frame(s, 60.75), 0);
  const speeds = a.ranges.map((R, i) => {
    const Q = b.ranges[i], k = R.k0 + Math.round((R.entryM - R.x0) / 2);
    const xa = R.x0 + (k - R.k0) * 2, xb = Q.x0 + (k - Q.k0) * 2;
    assert.ok(Math.abs(xa - R.entryM) <= 1);
    assert.ok(Math.abs(xb - (xa - .75 * R.layer.pps)) < 1e-9);
    for (let k = Math.max(R.k0 + R.ja, Q.k0 + Q.ja); k <= Math.min(R.k0 + R.jb, Q.k0 + Q.jb); k++) {
      const j = k - R.k0, q = k - Q.k0;
      assert.equal(Q.ys[q], R.ys[j], `${R.id} ridge at sample ${k}`);
      assert.equal(Q.foot[q], R.foot[j], `${R.id} foot at sample ${k}`);
    }
    return (xa - xb) / .75;
  });
  assert.ok(Math.abs(speeds[0] / speeds.at(-1) - 3) < 1e-9, speeds.join(' '));
  assert.ok(Math.abs(speeds[0] - 1312 / 10) < 1e-9);
});

test('cached visible ridges match the world samples after block crossings, seeks and resizes', () => {
  const s = song();
  for (const [time, w, h] of [[18, 1123, 783], [22, 1123, 783], [22, 1920, 1080], [104, 360, 640], [21.99, 1123, 783], [18, 1123, 783]]) {
    for (const R of geometry(frame(s, time, {w, h})).ranges) {
      const shape = terrain._internal.worldShape(s, w, h, R.id, R.k0, R.k0 + R.n - 1);
      assert.deepEqual(R.env, shape.env);
      assert.deepEqual(R.ys, shape.hg.map(height => R.layer.foot - height));
    }
  }
});

test('a frame is a function of song time: same picture after seeking around, no clock and no random numbers in the source', () => {
  const s = song();
  const fresh = JSON.stringify(geometry(frame(s, 61.3)).ranges.map(r => Array.from(r.ys.subarray(r.ja, r.jb))));
  geometry(frame(s, 10)); geometry(frame(s, 99)); geometry(frame(s, 61.2));
  const again = JSON.stringify(geometry(frame(song(), 61.3)).ranges.map(r => Array.from(r.ys.subarray(r.ja, r.jb))));
  assert.equal(again, fresh);
  const source = fs.readFileSync(path.join(__dirname, '..', 'score-terrain.js'), 'utf8');
  assert.doesNotMatch(source, /Math\.random|Date\.now|new Date|performance\.now/);
  // the old palette table keyed on two test songs' track ids is gone
  assert.doesNotMatch(source, /185c26ddfa52bc04f027409331b9b912b43458dd|0774d037b17b21de6bbb5ad9e6ea166cd426431a/);
});

test('a click in the window maps to time at the nearest range\'s speed; outside the window, nothing', () => {
  const model = song();
  for (const [w, h] of [[1123, 786], [1707, 1067], [1920, 1080], [360, 640]]) {
    const f = frame(model, 60, {w, h}), {detail: d, layout: L, ranges} = terrain.inspect(f);
    const y = d.top + .6 * (d.bottom - d.top);
    assert.equal(terrain.timeAt(d.playheadX, y, f), 60);
    assert.ok(Math.abs(terrain.timeAt(d.playheadX - d.pxPerSecond, y, f) - 59) < 1e-9);
    assert.equal(terrain.timeAt(d.playheadX, 0, f), null);
    assert.equal(terrain.timeAt(2, y, f), null);
    assert.ok(d.playheadX > d.left + .85 * (d.right - d.left) && d.playheadX < d.right);
    assert.ok(Math.abs(d.playheadX - (L.win.x + (ranges[0].entryM - L.left) * L.s)) < 1e-9);
    assert.equal(terrain.noteAt(d.playheadX, y, f), null);
  }
});

test('no levels: the notes stand in for loudness (onsets and velocity); no data at all is a bare plain, not an error', () => {
  const s = song({levels: undefined});
  const d = terrain.inspect(frame(s, 60)).detail;
  assert.equal(d.basis, 'notes');
  assert.deepEqual(d.ranges.map(r => r.id), ['guitar', 'violin', 'vocals']);
  assert.ok(d.ranges.every(r => r.heightAtNow > 20), d.ranges.map(r => r.heightAtNow).join(' '));
  const bare = {track: {id: 'bare', duration: 60}, lanes: []};
  const e = terrain.inspect(frame(bare, 30)).detail;
  assert.equal(e.basis, 'none');
  assert.deepEqual(e.ranges, []);
  const m = mockCanvas(1123, 783), bareCtx = Object.assign(m.canvas.getContext('2d'), {arcTo() {}});
  assert.ok(terrain.draw(bareCtx, frame(bare, 30)));
  // a stem with notes but no level row of its own (census: some winds / strings) is estimated from its notes
  const mixed = song({levels: {hop: 1, groups: {bass: level(20, 100)}}});
  const md = terrain.inspect(frame(mixed, 60)).detail;
  assert.deepEqual(md.ranges.map(r => r.id), ['bass', 'guitar', 'violin', 'vocals']);
  assert.deepEqual(md.estimated, ['guitar', 'vocals', 'violin']);
});

test('a stem name the look does not know is folded into the "other" range (levels and notes alike); drums never are', () => {
  const s = song({levels: {hop: 1, groups: {bass: level(20, 100), keys: level(20, 100), synth: level(20, 100, -24), drums: level(20, 100, -10)}},
    lanes: [{id: 'k', group: 'keys', kind: 'pitched', notes: notes(20, 100, .3, .2)}, {id: 'kit', group: 'drums', kind: 'drums', hits: [[30, 0, 100]]}]});
  const d = terrain.inspect(frame(s, 60)).detail;
  assert.deepEqual(d.ranges.map(r => r.id), ['bass', 'other']);
  assert.deepEqual(d.estimated, []);
  const notesOnly = song({levels: undefined, lanes: [{id: 'k', group: 'keys', kind: 'pitched', notes: notes(20, 100, .3, .2)}]});
  assert.deepEqual(terrain.inspect(frame(notesOnly, 60)).detail.ranges.map(r => r.id), ['other']);
});

test('entering at the song\'s start: low hills first, gentle flanks, no block pushed in', () => {
  const s = song({levels: {hop: 1, groups: {bass: level(0, 117), guitar: level(0, 117)}},
    lanes: [{id: 'b', group: 'bass', kind: 'pitched', notes: Array.from({length: 400}, (_, i) => [i * .25, .2, 40, 110])}]});
  const G = geometry(frame(s, 3));
  const bass = G.ranges[0];
  let tallest = 0, steepest = 0;
  for (let j = bass.ja + 1; j <= bass.jb; j++) {
    const h = bass.foot[j] - bass.ys[j];
    tallest = Math.max(tallest, h);
    steepest = Math.max(steepest, Math.abs(h - (bass.foot[j - 1] - bass.ys[j - 1])));
  }
  // 3 s after the plain ends the bass range is still low hills at the right of the window (its full shape: ~150 px)
  assert.ok(tallest > 3 && tallest < 50, 'low hills at the window edge: ' + tallest);
  assert.ok(steepest < 2, 'gentle flank while entering: ' + steepest);
});

test('the window frame follows the picture\'s shape without stretching the scenery; the LED rooms stay free', () => {
  for (const [w, h] of [[1123, 702], [1123, 783], [1440, 900], [1920, 1080]]) {
    const L = layout(w, h), {win} = L;
    assert.ok(win.x > 0 && win.y > 0 && win.x + win.w < w && win.y + win.h < h);
    const opening = L.cabin.opening;
    assert.ok(L.header.y + L.header.h <= opening.y && L.sill.y >= opening.y + opening.h);
    // seconds across the window grow with its width: the scenery is scaled by height only
    const d = terrain.inspect({song: song(), w, h, time: 60}).detail;
    assert.ok(Math.abs(d.pxPerSecond - 1312 / 10 * win.h / 696) < 1e-9);
  }
  const at1440 = layout(1440, 900);
  assert.deepEqual([at1440.win.x, at1440.win.y, at1440.win.w, at1440.win.h, at1440.win.r], [64, 136, 1312, 696, 40]);
  assert.ok(terrain.inspect({song: song(), w: 1920, h: 1080, time: 60}).detail.span > terrain.inspect({song: song(), w: 1440, h: 900, time: 60}).detail.span);
});

test('light: a cover only turns the low sky and the haze; the zenith stays blue; a grey cover keeps the plain afternoon', () => {
  const px = (r, g, b, n = 64 * 64) => { const a = new Uint8ClampedArray(n * 4); for (let i = 0; i < n; i++) { a[i * 4] = r; a[i * 4 + 1] = g; a[i * 4 + 2] = b; a[i * 4 + 3] = 255; } return a; };
  const hue = c => { const [r, g, b] = c.map(v => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx === mn) return 0; const d = mx - mn; const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360; };
  for (const cover of [px(220, 90, 30), px(40, 90, 200), px(60, 170, 70)]) {
    const L = coverMild(analysePixels(cover));
    assert.equal(L.name, 'cover');
    const zen = L.sky[0][1];
    assert.ok(zen[2] > zen[0] && zen[2] > zen[1], 'zenith blue: ' + zen.map(Math.round));
    assert.ok(hue(zen) > 190 && hue(zen) < 240, 'zenith hue ' + hue(zen));
    assert.deepEqual(L.floor, BASE.floor);
    assert.deepEqual(L.light, BASE.light);
  }
  const warm = coverMild(analysePixels(px(220, 90, 30))), cold = coverMild(analysePixels(px(40, 90, 200)));
  assert.notDeepEqual(warm.haze, cold.haze);
  assert.notDeepEqual(warm.sky[2][1], cold.sky[2][1]);
  assert.equal(coverMild(analysePixels(px(128, 128, 128))), BASE);
  assert.equal(terrain.inspect(frame(song(), 60)).light, 'afternoon');
});

test('the carriage: the LED header gets title, artist, the song\'s own sections and the time; the sill board is always there, lit only with a lyric; no window arrows', () => {
  const prior = globalThis.XinScoreTerrainLed, seen = [];
  globalThis.XinScoreTerrainLed = {
    stationName: require('../score-terrain-led.js').stationName, warm: list => seen.push(['warm', list]),
    drawHeader: (ctx, rect, d) => seen.push(['header', rect, d]), drawLyric: (ctx, rect, d, o) => seen.push(['lyric', rect, d, o]),
    drawNowTick: (ctx, x, top, bottom) => seen.push(['now', x, top, bottom])
  };
  try {
    const s = song({track: {id: 'led', title: '七里香', artist: '周杰伦', duration: D}, sections: [[3, 30, '引子'], [30, 60, '主歌 1'], [60, 90, 'Chorus 2']]});
    const draw = extra => { const m = mockCanvas(1123, 783); return terrain.draw(Object.assign(m.canvas.getContext('2d'), {arcTo() {}}), frame(s, 44, extra)); };
    const S = draw({lyric: ''});
    const header = seen.find(x => x[0] === 'header');
    assert.deepEqual([header[2].title, header[2].artist, header[2].time, header[2].duration], ['七里香', '周杰伦', 44, D]);
    assert.deepEqual(header[2].sections.map(r => r[2]), ['INTRO', 'VERSE 1', 'CHORUS 2'], 'batch 6: the route board speaks English');
    assert.equal(header[2].readout, 'miles', 'batch 6: the readout is the distance run');
    assert.equal(header[2].speedMps, 5 / .316);
    assert.deepEqual(header[1], S.layout.header);
    assert.ok(seen.every(([kind]) => kind !== 'now'), 'no arrow housings on the window frame');
    const idle = seen.filter(x => x[0] === 'lyric');
    assert.equal(idle.length, 1, 'no lyric: the sill board is still drawn');
    assert.equal(idle[0][2].line, '', 'no lyric: nothing lit');
    assert.equal(idle[0][3].idle, 'dim', 'no lyric: housing and unlit dots only');
    assert.deepEqual(idle[0][1], S.layout.sill);
    assert.equal(seen.filter(x => x[0] === 'warm').length, 1);
    seen.length = 0;
    draw({lyric: '窗外的远山一重又一重'});
    const lyric = seen.find(x => x[0] === 'lyric');
    assert.equal(lyric[2].line, '窗外的远山一重又一重');
    assert.ok(lyric[2].progress >= 0 && lyric[2].progress <= 1);
    assert.equal(seen.filter(x => x[0] === 'warm').length, 0, 'warmed once per song');
  } finally { globalThis.XinScoreTerrainLed = prior; }
});

test('the roadside: off by default; kick-snare keeps only poles and posts; a pole shaft enters at its hit; the plains stay bare', () => {
  const kit = {id: 'kit', group: 'drums', kind: 'drums', rows: ['kick', 'snare', 'hihat', 'openhat', 'tom', 'crash', 'ride'],
    hits: [[50, 0, 110], [50.2, 0, 90], [51, 1, 100], [50.5, 2, 80], [50.7, 2, 80], [52, 4, 90], [53, 5, 120], [55, 5, 120], [56, 5, 120], [62, 5, 120], [2, 0, 120], [118, 0, 120]]};
  const s = song({lanes: [...song().lanes.filter(l => l.kind !== 'drums'), kit]});
  const draw = (t, mode) => { const m = mockCanvas(1123, 783); return terrain.draw(Object.assign(m.canvas.getContext('2d'), {arcTo() {}}), frame(s, t, mode ? {terrainRoadside: mode} : {})); };
  assert.equal(draw(50).roadside, null);
  const all = draw(53.15, 'all').roadside, ks = draw(51.1, 'kick-snare').roadside;
  assert.ok(all.fence >= 2 && all.tom >= 1 && all.crash >= 1);
  assert.deepEqual(Object.keys(ks).filter(k => k !== 'poles' && ks[k]).sort(), ['kick', 'kickstub', 'snare']);
  const L = layout(1123, 783);
  const at50 = draw(50, 'all').roadside.poles.find(p => p.t === 50);
  const shaftEntry = L.entryAt(136 + .60 * 696);
  assert.ok(Math.abs(at50.x - shaftEntry) < 1e-9, 'the shaft is at the right curtain at the kick');
  const pole = time => draw(time, 'all').roadside.poles.find(p => p.t === 50);
  const speed = 5 * (790 - 664);
  assert.ok(Math.abs(pole(49.9).x - (shaftEntry + .1 * speed)) < 1e-8);
  assert.ok(Math.abs(pole(50.25).x - (shaftEntry - .25 * speed)) < 1e-8);
  // tall or stub is fixed per hit for the whole song, whatever else is in the window
  assert.deepEqual(draw(49.5, 'all').roadside.poles.map(p => p.tall), draw(50.3, 'all').roadside.poles.filter(p => p.t >= 50).map(p => p.tall));
  assert.deepEqual(draw(50, 'all').roadside.poles.filter(p => p.t >= 50).map(p => p.tall), [true, false]);
  // crashes: a windpump, a flock 2 s later, nothing 1 s after that (a flock within 3 s), a windpump again after 7 s
  const road = terrain._internal.roadLines(s);
  assert.deepEqual(road.crash.map(o => o.t), [53, 62]);
  assert.deepEqual(road.flock.map(o => o.t), [55]);
  for (const t of [0, 1, D - 1, D]) { const r = draw(t, 'all').roadside; assert.equal(r.poles.length + (r.snare || 0) + (r.fence || 0), 0, 'bare plain at ' + t); }
});

test('fewer birds (batch 6): a flock is 2-3 birds, a ride run within 2 s is one bird at its first hit, at most 8 in the air', () => {
  const rows = ['kick', 'snare', 'hihat', 'openhat', 'tom', 'crash', 'ride'];
  // crashes every 2.5 s after a windpump (each one a flock while a pump stands within 7 s): flocks at 22.5, 25.5 ...
  const hits = [];
  for (let t = 20; t < 60; t += 3.2) hits.push([t, 5, 120]);
  // ride: a run 30, 30.5 ... 33.5 (each within 2 s of the last) = one; then a lone hit at 36; a dense ride from 40 to 60
  for (let t = 30; t <= 33.5; t += .5) hits.push([t, 6, 100]);
  hits.push([36, 6, 100]);
  for (let t = 40; t < 60; t += 2.1) hits.push([t, 6, 100]);
  const s = song({lanes: [...song().lanes.filter(l => l.kind !== 'drums'), {id: 'kit', group: 'drums', kind: 'drums', rows, hits}]});
  const road = terrain._internal.roadLines(s);
  assert.deepEqual(road.ride.slice(0, 2).map(o => o.t), [30, 36], 'a run counts once, at its first hit');
  for (const o of road.flock) assert.ok(o.n >= 0 && o.n <= 3);
  assert.ok(road.flock.some(o => o.n >= 2), 'flocks of 2-3');
  for (const o of road.ride) assert.ok(o.n <= 1);
  // never more than 8 birds in the air at once: a group flies until its last bird clears the window top
  const groups = [...road.flock, ...road.ride];
  let most = 0;
  for (let t = 15; t < 65; t += .01) {
    const n = groups.filter(o => o.t <= t && t < o.t + o.life).reduce((a, o) => a + o.n, 0);
    most = Math.max(most, n);
  }
  assert.ok(most <= 8, 'most birds at once: ' + most);
  assert.ok(most >= 3, 'flocks and ride birds overlap in this dense stretch: ' + most);
  for (const o of groups) assert.ok(o.life > 1 && o.life < 4, 'flight ' + o.life);
});

test('draw paints the window through the presentation\'s frame and hands back the scene (rasters on, with a fake offscreen canvas)', () => {
  const prior = globalThis.OffscreenCanvas;
  const made = [];
  globalThis.OffscreenCanvas = function (w, h) {
    const m = mockCanvas(w, h), ctx = m.canvas.getContext('2d');
    Object.assign(ctx, {arcTo() {}, clearRect() {}, createImageData: (W, H) => ({data: new Uint8ClampedArray(W * H * 4)}), putImageData() {}, getTransform: () => ({a: 1, d: 1, e: 0, f: 0})});
    made.push(m);
    return {width: w, height: h, getContext: () => ctx};
  };
  try {
    const m = mockCanvas(1123, 783), ctx = m.canvas.getContext('2d');
    Object.assign(ctx, {arcTo() {}, createPattern: () => ({}), getTransform: () => ({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0})});
    const S = terrain.draw(ctx, frame(song(), 60));
    assert.ok(S && S.detail.ranges.length === 4);
    assert.ok(made.length > 3, 'sky, clouds, ground, glass rasters made: ' + made.length);
    assert.ok(m.calls.filter(c => c.name === 'drawImage').length >= 3);
    // batch 5: the ranges are filled on the composite (one fill per range body) and laid over with their tiles; the
    // composite goes onto the window in one drawImage
    const fills = made.reduce((n, x) => n + x.calls.filter(c => c.name === 'fill').length, 0);
    assert.ok(fills >= 4, 'range bodies and tile details filled offscreen: ' + fills);
    assert.equal(m.calls.filter(c => c.name === 'clip').length, 1, 'one clip a frame (the window), none per range');
    assert.equal(m.texts().length, 0, 'no text on the scenery: titles, sections and lyrics belong to the carriage');
    const again = mockCanvas(1123, 783), c2 = again.canvas.getContext('2d');
    Object.assign(c2, {arcTo() {}, createPattern: () => ({}), getTransform: () => ({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0})});
    terrain.draw(c2, frame(song(), 60));
    assert.equal(again.calls.length, m.calls.length);
  } finally { globalThis.OffscreenCanvas = prior; }
});

test('tiled ranges: the same moment draws the same calls whatever came before (cold tiles, warm tiles, other moments first)', () => {
  const prior = globalThis.OffscreenCanvas;
  const made = [];
  const install = () => {
    globalThis.OffscreenCanvas = function (w, h) {
      const m = mockCanvas(w, h), ctx = m.canvas.getContext('2d');
      const c = {width: Math.ceil(w), height: Math.ceil(h), getContext: () => ctx, calls: m.calls, reset: m.reset};
      Object.assign(ctx, {arcTo() {}, clearRect() { c.composite = true; }, createImageData: (W, H) => ({data: new Uint8ClampedArray(W * H * 4)}), putImageData() {}, getTransform: () => ({a: 1, d: 1, e: 0, f: 0})});
      made.push(c);
      return c;
    };
  };
  // what reaches the window and the composite, with every canvas named by its size (identity differs across modules)
  const record = (T, times) => {
    made.length = 0;
    const s = song();
    let out = null;
    for (const t of times) {
      const m = mockCanvas(1123, 783), ctx = m.canvas.getContext('2d');
      Object.assign(ctx, {arcTo() {}, createPattern: () => ({}), getTransform: () => ({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0})});
      for (const c of made) c.reset();
      T.draw(ctx, frame(s, t));
      const comp = made.find(c => c.composite);
      const blit = m.calls.find(c => c.name === 'drawImage' && c.args[0] === comp);
      assert.ok(comp && blit && comp.width < 1123 && comp.height < 783, 'only the visible window is composited');
      const name = v => v && typeof v === 'object' && 'width' in v && 'getContext' in v ? 'canvas ' + v.width + 'x' + v.height : v;
      // the drawing state counts on the calls that paint with it (a style left over from the previous frame and replaced
      // before any paint is not part of the picture)
      const paints = new Set(['fill', 'stroke', 'fillRect', 'strokeRect', 'drawImage', 'fillText', 'clip']);
      const flat = calls => JSON.stringify(calls.map(c => [c.name, c.args.map(name), paints.has(c.name) ? c.state : null]));
      out = {main: flat(m.calls), comp: flat(comp.calls), offset: blit.args.slice(1)};
    }
    return out;
  };
  const fresh = () => { delete require.cache[require.resolve('../score-terrain.js')]; return require('../score-terrain.js'); };
  try {
    install();
    const cold = record(fresh(), [61.5]);
    const B = JSON.parse(cold.comp);
    assert.ok(B && B.some(c => c[0] === 'drawImage'), 'tiles laid on the composite');
    const [, worldTransform] = B.findLast(c => c[0] === 'setTransform');
    assert.deepEqual(worldTransform, [1, 0, 0, 1, -cold.offset[0], -cold.offset[1]],
      'the composite preserves the original pixel grid after compensating for its offset');
    const warm = record(fresh(), [30, 90, 61.4, 61.5]);
    assert.equal(warm.main, cold.main, 'the window gets the same calls');
    const A = JSON.parse(warm.comp), at = A.findIndex((c, i) => JSON.stringify(c) !== JSON.stringify(B[i]));
    assert.equal(at, -1, 'the composite gets the same calls (tiles made before or now); first difference ' + at + ' of ' + A.length + '/' + B.length + ': ' + String(JSON.stringify(A[at])).slice(0, 300) + ' vs ' + String(JSON.stringify(B[at])).slice(0, 300));
  } finally { globalThis.OffscreenCanvas = prior; fresh(); }
});

test('all four weathers render mountains without ridge strokes or contour-following mist, cached and direct', t => {
  const priorCanvas = globalThis.OffscreenCanvas;
  const priorRain = globalThis.XinTerrainRain;
  const priorWeather = globalThis.XinTerrainWeather;
  t.after(() => {
    globalThis.OffscreenCanvas = priorCanvas;
    globalThis.XinTerrainRain = priorRain;
    globalThis.XinTerrainWeather = priorWeather;
  });
  globalThis.XinTerrainRain = {
    isReady: () => true,
    overcastLight: base => ({...base, weatherOvercast: true}),
    snowLight: base => ({...base, weatherOvercast: true, weatherSnow: true}),
    sandLight: base => ({...base, weatherOvercast: true, weatherSand: true}),
    drawGlass() {},
  };
  globalThis.XinTerrainWeather = {sample: (_song, _time, {terrainWeather}) => ({
    rain: terrainWeather === 'rain', snow: terrainWeather === 'snow', sand: terrainWeather === 'sandstorm',
    intensity: .65, surface: .72,
  })};

  const ridgeStrokes = calls => {
    const bodyEdges = new Set();
    let path = [], last, count = 0;
    for (const {name, args} of calls) {
      if (name === 'beginPath') { path = []; last = null; }
      else if (name === 'moveTo') last = args;
      else if (name === 'lineTo') {
        if (last) path.push(`${last}/${args}`);
        last = args;
      } else if (name === 'clip') {
        for (const edge of path) bodyEdges.add(edge);
      } else if (name === 'stroke') {
        count += path.filter(edge => bodyEdges.has(edge)).length;
      }
    }
    return count;
  };

  // A strip of mist traces the same ridge out and back at two fixed heights.
  const drawsContourMist = calls => {
    let points = [];
    for (const {name, args} of calls) {
      if (name === 'beginPath') points = [];
      if (name === 'moveTo' || name === 'lineTo') points.push(args);
      if (name !== 'fill' || points.length < 12 || points.length % 2) continue;
      const half = points.length / 2;
      const thickness = points.at(-1)[1] - points[0][1];
      if (thickness <= 0 || thickness > 20 || points[half - 1][0] - points[0][0] < 40) continue;
      if (points.slice(0, half).every(([x, y], i) => {
        const [otherX, otherY] = points[points.length - 1 - i];
        return otherX === x && Math.abs(otherY - y - thickness) < 1e-6;
      })) return true;
    }
    return false;
  };

  const directMatrix = () => ({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0});
  for (const cached of [false, true]) {
    const recordings = [];
    globalThis.OffscreenCanvas = cached ? function (w, h) {
      const capture = mockCanvas(w, h);
      const context = capture.canvas.getContext('2d');
      Object.assign(context, {arcTo() {}, clearRect() {}, putImageData() {}, getTransform: directMatrix,
        createImageData: (width, height) => ({data: new Uint8ClampedArray(width * height * 4)})});
      recordings.push(capture.calls);
      return capture.canvas;
    } : undefined;
    for (const mode of ['clear', 'rain', 'snow', 'sandstorm']) {
      recordings.length = 0;
      const {canvas, calls} = mockCanvas(1123, 783);
      const ctx = canvas.getContext('2d');
      ctx.arcTo = () => {};
      if (cached) ctx.getTransform = directMatrix;
      terrain.draw(ctx, frame(song(), 60, {terrainWeather: mode}));
      const drawings = [calls, ...recordings];
      const label = `${mode} ${cached ? 'cached' : 'direct'}`;
      assert.equal(drawings.some(set => ridgeStrokes(set) > 0), false, label + ' ridge strokes');
      assert.equal(drawings.some(drawsContourMist), false, label + ' contour-following mist');
    }
  }
});
