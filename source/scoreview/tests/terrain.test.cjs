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

test('feet step up: where every range is up, each farther foot sits higher, and every sounding range shows above the one in front', () => {
  const G = geometry(frame(song(), 60));
  const L = G.L, now = L.nowM;
  const at = (R, arr) => arr[Math.round((now - R.x0) / 2)];
  for (let i = 1; i < G.ranges.length; i++) {
    assert.ok(at(G.ranges[i], G.ranges[i].foot) < at(G.ranges[i - 1], G.ranges[i - 1].foot) - 10);
    let shows = 0;
    const R = G.ranges[i], Q = G.ranges[i - 1];
    for (let j = R.ja; j <= R.jb; j++) { const x = R.x0 + j * 2, q = Q.ys[Math.round((x - Q.x0) / 2)]; if (R.ys[j] < q - 8) shows++; }
    assert.ok(shows > (R.jb - R.ja) * .5, `${R.id} shows over ${Q.id} in ${shows} columns`);
  }
});

test('near fast, far slow: a world point moves .25 s x its own speed, the nearest three times the farthest; shapes stay rigid', () => {
  const s = song(), a = geometry(frame(s, 60)), b = geometry(frame(s, 60.25));
  const speeds = a.ranges.map((R, i) => {
    const Q = b.ranges[i], k = R.k0 + Math.round((a.L.nowM - R.x0) / 2);
    const xa = R.x0 + (k - R.k0) * 2, xb = Q.x0 + (k - Q.k0) * 2;
    return (xa - xb) / .25;
  });
  assert.ok(Math.abs(speeds[0] / speeds.at(-1) - 3) < 1e-9, speeds.join(' '));
  assert.ok(Math.abs(speeds[0] - 1312 / 10) < 1e-9);
  // the nearest range has nothing in front of it: the same world sample has exactly the same height a quarter second later
  const R = a.ranges[0], Q = b.ranges[0];
  for (let k = Q.k0 + Q.ja; k <= R.k0 + R.jb; k++) assert.equal(Q.ys[k - Q.k0], R.ys[k - R.k0]);
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
  const f = frame(song(), 60), d = terrain.inspect(f).detail;
  assert.equal(terrain.timeAt(d.playheadX, 400, f), 60);
  assert.ok(Math.abs(terrain.timeAt(d.playheadX + d.pxPerSecond, 400, f) - 61) < 1e-9);
  assert.equal(terrain.timeAt(d.playheadX, 10, f), null); // the LED display's room above the window
  assert.equal(terrain.timeAt(2, 400, f), null);
  assert.ok(Math.abs((d.playheadX - d.left) / (d.right - d.left) - .37) < 1e-9);
  assert.equal(terrain.noteAt(d.playheadX, 400, f), null);
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
    assert.ok(L.header.y + L.header.h <= win.y && L.sill.y >= win.y + win.h);
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

test('the carriage: the LED header gets title, artist, the song\'s own sections and the time; the sill lights only with a lyric; arrows at now', () => {
  const prior = globalThis.XinScoreTerrainLed, seen = [];
  globalThis.XinScoreTerrainLed = {
    localizeSection: n => n === 'Chorus 2' ? '副歌 2' : n, warm: list => seen.push(['warm', list]),
    drawHeader: (ctx, rect, d) => seen.push(['header', rect, d]), drawLyric: (ctx, rect, d) => seen.push(['lyric', rect, d]),
    drawNowTick: (ctx, x, top, bottom) => seen.push(['now', x, top, bottom])
  };
  try {
    const s = song({track: {id: 'led', title: '七里香', artist: '周杰伦', duration: D}, sections: [[3, 30, '引子'], [30, 60, '主歌 1'], [60, 90, 'Chorus 2']]});
    const draw = extra => { const m = mockCanvas(1123, 783); return terrain.draw(Object.assign(m.canvas.getContext('2d'), {arcTo() {}}), frame(s, 44, extra)); };
    const S = draw({lyric: ''});
    const header = seen.find(x => x[0] === 'header'), now = seen.find(x => x[0] === 'now');
    assert.deepEqual([header[2].title, header[2].artist, header[2].time, header[2].duration], ['七里香', '周杰伦', 44, D]);
    assert.deepEqual(header[2].sections.map(r => r[2]), ['引子', '主歌 1', '副歌 2']);
    assert.deepEqual(header[1], S.layout.header);
    assert.deepEqual(now.slice(1), [S.detail.playheadX, S.layout.win.y, S.layout.win.y + S.layout.win.h]);
    assert.equal(seen.some(x => x[0] === 'lyric'), false, 'no lyric: the sill stays dark');
    assert.equal(seen.filter(x => x[0] === 'warm').length, 1);
    seen.length = 0;
    draw({lyric: '窗外的远山一重又一重'});
    const lyric = seen.find(x => x[0] === 'lyric');
    assert.equal(lyric[2].line, '窗外的远山一重又一重');
    assert.ok(lyric[2].progress >= 0 && lyric[2].progress <= 1);
    assert.equal(seen.filter(x => x[0] === 'warm').length, 0, 'warmed once per song');
  } finally { globalThis.XinScoreTerrainLed = prior; }
});

test('draw paints the window through the presentation\'s frame and hands back the scene (rasters on, with a fake offscreen canvas)', () => {
  const prior = globalThis.OffscreenCanvas;
  const made = [];
  globalThis.OffscreenCanvas = function (w, h) {
    const m = mockCanvas(w, h), ctx = m.canvas.getContext('2d');
    Object.assign(ctx, {arcTo() {}, createImageData: (W, H) => ({data: new Uint8ClampedArray(W * H * 4)}), putImageData() {}, getTransform: () => ({a: 1, d: 1, e: 0, f: 0})});
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
    assert.ok(m.calls.filter(c => c.name === 'fill').length >= 4);
    assert.equal(m.texts().length, 0, 'no text on the scenery: titles, sections and lyrics belong to the carriage');
    const again = mockCanvas(1123, 783), c2 = again.canvas.getContext('2d');
    Object.assign(c2, {arcTo() {}, createPattern: () => ({}), getTransform: () => ({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0})});
    terrain.draw(c2, frame(song(), 60));
    assert.equal(again.calls.length, m.calls.length);
  } finally { globalThis.OffscreenCanvas = prior; }
});
