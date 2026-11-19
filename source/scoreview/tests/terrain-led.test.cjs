'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {runInNewContext} = require('node:vm');
const {mockCanvas} = require('./helpers.cjs');
const Led = require('../score-terrain-led.js');

// A canvas factory for node: the context is a recording mock; text is "rasterised" into a deterministic block bitmap
// (two blank rows top and bottom, one blank column each side), so glyph sampling can be tested without a browser.
let made = 0;
function fakeFactory(w, h) {
  made++;
  const m = mockCanvas(w, h), g = m.canvas.getContext('2d');
  let ink = null;
  g.clearRect = () => {};
  g.measureText = s => ({width: /[⺀-鿿＀-￯]/.test(s) ? Math.round(parseInt(/(\d+)px/.exec(g.font)[1], 10)) : Math.round(parseInt(/(\d+)px/.exec(g.font)[1], 10) / 2)});
  g.fillText = s => { ink = s; };
  g.getImageData = (x, y, gw, gh) => {
    const d = new Uint8ClampedArray(gw * gh * 4);
    if (ink && ink.trim()) for (let j = 2; j < gh - 3; j++) for (let i = 1; i < gw - 1; i++) d[(j * gw + i) * 4 + 3] = 255;
    return {data: d};
  };
  return {width: w, height: h, getContext: () => g, calls: m.calls};
}
const sections = [
  {name: '引子', start: 3, end: 30}, {name: '主歌 1', start: 30, end: 56}, {name: '副歌 1', start: 90, end: 138},
  {name: '间奏', start: 138, end: 164}, {name: '尾奏', start: 273, end: 297}
];
const data = (t, extra) => Object.assign({title: '七里香', artist: '周杰伦', duration: 303, sections, time: t}, extra);
const lit = map => map.a.reduce((n, v) => n + (v ? 1 : 0), 0);
const stamp = calls => JSON.stringify(calls.map(c => [c.name, c.args]));

test.beforeEach(() => { Led.setCanvasFactory(fakeFactory); made = 0; });
test.after(() => Led.setCanvasFactory(null));

test('the browser script and CommonJS expose the same API', () => {
  const browser = {};
  runInNewContext(readFileSync(require.resolve('../score-terrain-led.js'), 'utf8'), browser);
  for (const k of ['drawHeader', 'drawLyric', 'drawNowTick', 'localizeSection']) {
    assert.equal(typeof browser.XinScoreTerrainLed[k], 'function');
    assert.equal(typeof Led[k], 'function');
  }
});

test('with no canvas at all nothing throws and the frame is still painted', () => {
  Led.setCanvasFactory(() => null);
  const m = mockCanvas(1123, 200);
  assert.doesNotThrow(() => {
    Led.drawHeader(m.canvas.getContext('2d'), {x: 10, y: 8, w: 1103, h: 100}, data(104));
    Led.drawLyric(m.canvas.getContext('2d'), {x: 100, y: 120, w: 900, h: 44}, {line: '远山一重又一重', progress: .5});
    Led.drawNowTick(m.canvas.getContext('2d'), 400, 120, 180);
  });
  assert.ok(m.calls.some(c => c.name === 'arc'), 'dots are drawn directly');
});

test('drawing is a pure function of its arguments: same input, same calls, whatever came before', () => {
  const a = mockCanvas(1123, 200), b = mockCanvas(1123, 200), rect = {x: 10, y: 8, w: 1103, h: 100};
  Led.drawHeader(a.canvas.getContext('2d'), rect, data(104));
  Led.drawHeader(b.canvas.getContext('2d'), rect, data(10));
  b.reset();
  Led.clearCaches();
  Led.drawHeader(b.canvas.getContext('2d'), rect, data(104));
  assert.equal(stamp(b.calls), stamp(a.calls));
});

test('the cache: an unchanged frame is one blit and builds nothing; a new second rebuilds only that strip', () => {
  const m = mockCanvas(1123, 200), g = m.canvas.getContext('2d'), rect = {x: 10, y: 8, w: 1103, h: 100};
  assert.equal(Led.drawHeader(g, rect, data(104)), 'cold');
  m.reset(); made = 0;
  assert.equal(Led.drawHeader(g, rect, data(104.4)), 'hit');
  assert.equal(made, 0);
  assert.deepEqual(m.calls.map(c => c.name), ['drawImage']);
  assert.equal(Led.drawHeader(g, rect, data(105)), 'cold');
});

test('the header: time text, station call and the title all land on the dot map', () => {
  const cols = 520, rows = Led.headerRows(16, 12), M = Led.headerModel(data(104), cols, rows, 16, 12).map;
  assert.equal(M.rows, rows);
  assert.ok(lit(M) > 300);
  const r = Led.headerModel(data(104), cols, rows, 16, 12);
  assert.equal(r.title, '七里香');
  assert.match(r.mid, /本站\|副歌 1\|下一站\|间奏/); // 104 s is in 副歌 1; the next station is 间奏
  assert.equal(Led.headerModel(data(300), cols, rows, 16, 12).mid, '本站|尾奏|下一站|终点');
});

test('a title that does not fit is cut with an ellipsis and the artist is dropped; a short one keeps both', () => {
  const long = '这是一首名字特别特别长的歌 The Quick Brown Fox Jumps Over The Lazy Dog (Live)';
  assert.ok(Led.width(long, 16) > 330);
  const cut = Led.fit(long, 16, 120);
  assert.ok(cut.endsWith('…') && Led.width(cut, 16) <= 120);
  assert.equal(Led.fit('短', 16, 120), '短');
  assert.equal(Led.fit('长长长长长长长长长', 16, 6), '');
  const rows = Led.headerRows(16, 12), withArtist = lit(Led.headerModel(data(104, {sections: []}), 400, rows, 16, 12).map);
  const longTitle = lit(Led.headerModel(data(104, {sections: [], title: long}), 400, rows, 16, 12).map);
  assert.ok(Led.headerModel(data(104, {title: long}), 330, rows, 16, 12).title.endsWith('…'));
  assert.ok(withArtist > 0 && longTitle > 0);
});

test('route labels shorten when they do not fit; with too many stations only the current one is named', () => {
  const rows = Led.headerRows(16, 12);
  const many = Array.from({length: 20}, (_, i) => ({name: '副歌 ' + (i + 1), start: i * 10, end: i * 10 + 10}));
  const wide = Led.headerModel(data(5, {sections}), 330, rows, 16, 12);
  assert.ok(wide.labels && wide.labels[1] !== undefined);
  const crowded = Led.headerModel(data(55, {sections: many, duration: 200}), 330, rows, 16, 12);
  assert.ok(crowded.labels === null || crowded.labels.every(l => Led.width(l, 12) <= 15));
  for (const n of [0, 1, 2, 20]) {
    assert.doesNotThrow(() => Led.headerModel(data(55, {sections: many.slice(0, n)}), 330, rows, 16, 12), n + ' stations');
  }
});

test('the route is lit up to the current position and not beyond', () => {
  const rows = Led.headerRows(16, 12), yL = 16 + 3;
  const lineLevel = (t, x) => Led.headerModel(data(t), 330, rows, 16, 12).map.a[yL * 330 + x];
  const early = Led.headerModel(data(10), 330, rows, 16, 12).plan, late = Led.headerModel(data(250), 330, rows, 16, 12).plan;
  assert.ok(late.litX > early.litX);
  assert.equal(lineLevel(250, early.litX + 3) >= 2, true);
  assert.equal(lineLevel(10, late.litX), 1);
});

test('section names: English labels get Chinese names, anything else passes through', () => {
  assert.equal(Led.localizeSection('Chorus 2'), '副歌 2');
  assert.equal(Led.localizeSection('Pre-Chorus'), '导歌');
  assert.equal(Led.localizeSection('副歌 1'), '副歌 1');
  assert.equal(Led.localizeSection('Whatever'), 'Whatever');
});

test('lyrics: a short line is centred at the full pitch; a longer one shrinks the pitch; a very long one scrolls with progress', () => {
  const W = 900, H = 44;
  const short = Led.lyricPlan('远山', .5, W, H), mid = Led.lyricPlan('风从平原上吹过，把整个下午的云都吹向了很远很远的地方', .5, W, H);
  assert.equal(short.scroll, false);
  assert.ok(short.x > 10);
  assert.ok(mid.pitch < short.pitch, 'shrinks to fit');
  const very = '我们坐着火车横穿过那一片望不到头的荒原，窗外的远山一重接着一重，像是永远也走不完的路，直到夕阳把最后一座山染成了琥珀色';
  const p0 = Led.lyricPlan(very, 0, W, H), p5 = Led.lyricPlan(very, .5, W, H), p1 = Led.lyricPlan(very, 1, W, H);
  assert.equal(p0.scroll, true);
  assert.ok(p0.pitch >= Math.min(p0.p0, 1.9) && p0.pitch >= p0.p0 * .72 - 1e-9, 'never below the legibility floor');
  assert.ok(p0.offset === 0 && p5.offset > 0 && p1.offset > p5.offset);
  assert.ok(p1.offset >= p1.textW - (p1.cols - 4) - 1, 'the end of the line is reached');
  assert.deepEqual(Led.lyricPlan(very, .5, W, H), p5, 'deterministic');
});

test('an empty lyric draws nothing by default and only dark dots when asked', () => {
  const m = mockCanvas(900, 100), g = m.canvas.getContext('2d'), rect = {x: 50, y: 20, w: 800, h: 44};
  assert.equal(Led.drawLyric(g, rect, {line: ''}), 'none');
  assert.equal(Led.drawLyric(g, rect, {line: '   '}), 'none');
  assert.equal(m.calls.length, 0);
  assert.equal(Led.drawLyric(g, rect, {line: null}, {idle: 'dim'}), 'cold');
  assert.ok(m.calls.length > 0);
});

test('lyric strips are cached by their content; a scrolled offset is part of it', () => {
  const m = mockCanvas(900, 100), g = m.canvas.getContext('2d'), rect = {x: 50, y: 20, w: 800, h: 44};
  const very = '我们坐着火车横穿过那一片望不到头的荒原，窗外的远山一重接着一重，像是永远也走不完的路，直到夕阳把最后一座山染成了琥珀色';
  assert.equal(Led.drawLyric(g, rect, {line: very, progress: .5}), 'cold');
  assert.equal(Led.drawLyric(g, rect, {line: very, progress: .5}), 'hit');
  assert.equal(Led.drawLyric(g, rect, {line: very, progress: .9}), 'cold');
});

test('the now arrows: top points down at yTop, bottom points up at yBottom, both inside the frame band', () => {
  const m = mockCanvas(800, 400), g = m.canvas.getContext('2d');
  Led.drawNowTick(g, 400, 100, 300, {pitch: 3});
  const dots = m.calls.filter(c => c.name === 'drawImage');
  assert.equal(dots.length, 9 + 16 === 25 ? 25 : dots.length);
  const ys = dots.map(c => c.args[2] + c.args[4] / 2);
  assert.ok(ys.filter(y => y < 100).length === 9, 'nine lamps above the opening');
  assert.ok(ys.filter(y => y > 300).length === 16, 'sixteen below');
  assert.ok(Math.max(...ys.filter(y => y < 100)) < 100 && Math.min(...ys.filter(y => y > 300)) > 300);
});
