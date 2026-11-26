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

test('stable train data reuses the panel, digits and route; only changing regions are rebuilt', () => {
  const m = mockCanvas(1123,200), g = m.canvas.getContext('2d'), rect = {x:10,y:8,w:1103,h:100};
  const route = Led.prepareRoute(sections), frame = t => Led.drawHeader(g,rect,data(t,{route}));
  assert.equal(frame(104.1),'cold');
  m.reset(); made = 0;
  assert.equal(frame(104.11),'hit'); assert.equal(made,0);
  assert.equal(m.calls.filter(c=>c.name==='drawImage').length,3);
  m.reset();
  assert.equal(frame(105.1),'partial');
  const digits = m.calls.filter(c=>c.name==='drawImage')[1];
  assert.ok(digits.args[3] < rect.w && digits.args[4] < rect.h * .7);
  assert.equal(frame(140),'cold');
});

test('the running readouts and the R2 route occupy disjoint rows', () => {
  const model = Led.headerModel(data(104.4),414,50,16,12);
  assert.ok(model.regions.route && model.lines.live.length);
  for (const f of [...model.lines.fields,model.lines.title,model.lines.artist,model.lines.nextLine]) assert.ok(f.y1 <= model.routeY-2);
  const none = Led.headerModel(data(104.4,{sections:[]}),414,50,16,12);
  assert.equal(none.regions.route,null);
  assert.equal(none.map.a.slice((none.routeY-2)*414).some(Boolean),false);
});

test('a scrolling lyric moves a whole character at a time and never shows half of one at the edges', () => {
  const very = '我们坐着火车横穿过那一片望不到头的荒原，窗外的远山一重接着一重，像是永远也走不完的路，直到夕阳把最后一座山染成了琥珀色';
  const edges = [0]; for (const ch of Array.from(very)) edges.push(edges.at(-1) + Led.glyph(ch, 12).w);
  for (const p of [0, .2, .37, .5, .81, 1]) {
    const plan = Led.lyricPlan(very, p, 900, 44);
    assert.ok(edges.includes(plan.offset), 'offset on a character edge at ' + p + ': ' + plan.offset);
  }
});

test('long tags scroll independently on whole glyphs with both ends readable', () => {
  const title = '夜空'.repeat(32), artist = 'Artist 海'.repeat(18);
  const at = t => Led.headerModel(data(t,{title,artist,readout:'miles',speedMps:16}),414,50,16,12).lines;
  assert.equal(at(0).board.mode,'full-artist');
  for (const field of ['title','artist']) {
    const line = at(0)[field], edges = [0];
    for (const ch of line.str) edges.push(edges.at(-1)+Led.glyph(ch,line.size).w);
    const end = at(edges.length * .6)[field];
    assert.equal(line.offset,0); assert.ok(line.scroll && end.offset>0 && end.total-end.offset<=end.room);
    for (const t of [1,4,9,21,45]) assert.ok(edges.includes(at(t)[field].offset));
  }
  assert.ok(at(9).title.y1 <= at(9).artist.y0);
});

test('missing artist and no sections leave their respective cells dark', () => {
  const cols=414;
  for (const artist of ['', 'Unknown Artist','未知艺术家']) {
    const m=Led.headerModel(data(31,{title:'Untitled',artist,sections:[],readout:'miles',speedMps:16}),cols,50,16,12);
    assert.equal(m.lines.artist.str,''); assert.equal(m.lines.name,'END'); assert.equal(m.lines.remaining,'4:32');
    assert.ok(m.lines.fields.some(f=>f.str===' MI'));
    assert.equal(m.map.a.slice(18*cols,33*cols).some((v,i)=>v && i%cols<m.lines.artist.x1),false);
    assert.equal(m.map.a.slice(33*cols).some(Boolean),false);
  }
});

test('real title fit table at 1440×900 and 1123×778; changing the artist never consumes title columns', () => {
  const {layout} = require('../score-terrain.js')._internal;
  const tracks = [
    ['in Silence / in Siren', "world's end girlfriend", true], ['MEGURI', "world's end girlfriend", true],
    ['birthday resistance / 誕生日抵抗日', "world's end girlfriend", true],
    ['グッドバイ Goodbye　Album Version feat. Toki Asako 土岐麻子', 'toe', false],
    ["Ceremony (12' Version with Gillian Gilbert)", 'New Order', true], ['周杰伦 - 七里香', 'Unknown Artist', true],
  ];
  for (const [w,h] of [[1440,900], [1123,778]]) {
    const {header} = layout(w,h), rows = Led.headerRows(16,12), pitch = header.h / (rows + 2.6);
    const cols = Math.floor(header.w / pitch - 3.4);
    assert.equal(cols,414);
    for (const [title,artist,fits] of tracks) {
      const model = Led.headerModel(data(226,{title,artist,readout:'miles',speedMps:5/.316}),cols,rows,16,12);
      assert.equal(!model.lines.title.scroll,fits, w + ' ' + title);
      assert.equal(model.lines.artist.scroll,false, w + ' ' + artist);
    }
  }
});

test('a changed marquee offset redraws its overlay and reuses the panel, clock and route', () => {
  const m = mockCanvas(1000,175), ctx = m.canvas.getContext('2d'), rect = {x:0,y:0,w:1000,h:175};
  const d = {title:'山道'.repeat(38),artist:'toe', sections, duration:303, now:104, readout:'miles',speedMps:.1};
  Led.drawHeader(ctx,rect,{...d,time:0});
  assert.equal(Led.drawHeader(ctx,rect,{...d,time:12}), 'partial');
  const calls = m.calls.filter(c=>c.name==='drawImage');
  for (let i=0;i<3;i++) assert.equal(calls[i].args[0],calls[i+4].args[0]);
  assert.notEqual(calls[3].args[0],calls[7].args[0]);
});

// levels: 1 dimmest (stations ahead), 2 dim (passed), 3 medium (artist, next station), 4 brightest (title, now)
const at = (M, x, y) => M.a[y * M.cols + x];
const maxIn = (M, x0, x1, y0, y1) => { let m = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m = Math.max(m, at(M, x, y)); return m; };

test('the short title, next stop and mileage have separate columns and brightness levels', () => {
  const m=Led.headerModel(data(104,{readout:'miles',speedMps:16}),414,50,16,12), l=m.lines;
  assert.equal(l.board.mode,'columns'); assert.equal(l.title.str,'七里香'); assert.equal(l.artist.str,'周杰伦');
  assert.ok(l.title.x1<=l.dividers[0] && l.artist.x1<=l.dividers[0]);
  assert.ok(l.nextLine.x0>l.dividers[0] && l.nextLine.x1<l.dividers[1]);
  for (const f of l.fields) {
    assert.ok(f.x0>l.dividers[0] && (f.x1<=l.dividers[1] || f.x0>l.dividers[1]));
    assert.ok(f.x1<=l.board.end && f.y1<=33);
    if (['NEXT ','IN ',' MI'].includes(f.str)) assert.equal(f.level,2);
  }
  assert.equal(maxIn(m.map,1,l.title.x1,0,16),4); assert.equal(maxIn(m.map,1,l.artist.x1,l.artist.y0,l.artist.y1),3);
});

test('each station switches on the exact boundary, including rapid stops, gaps and the terminus', () => {
  const stops=[[2,4,'引子'],[4,4.4,'主歌 1'],[4.4,9,'副歌 1'],[9,14,'间奏']];
  const route=Led.prepareRoute(stops), model=t=>Led.headerModel(data(t,{route,duration:14}),414,50,16,12).lines;
  const dividers=model(0).dividers;
  for (let i=0;i<stops.length;i++) {
    const before=model(stops[i][0]-.01), exact=model(stops[i][0]), after=model(stops[i][0]+.01);
    assert.equal(before.name,route.names[i]); assert.equal(before.remaining,'0:00');
    assert.equal(exact.name,route.names[i+1]||'END'); assert.equal(after.name,exact.name);
    for (const line of [before,exact,after]) assert.deepEqual(line.dividers,dividers);
  }
  assert.equal(model(14).remaining,'0:00');
  const long=Led.headerModel(data(4,{title:'名字很长的真实曲名'.repeat(3),artist:'周杰伦',route,readout:'miles',speedMps:16}),414,50,16,12).lines;
  assert.equal(long.board.mode,'full-title'); assert.equal(long.artist.scroll,false);
  assert.equal(long.board.info.showClock,false);
  assert.ok(long.title.y1<=long.artist.y0 && long.title.x1===long.board.end);
});

test('no artist in the tags and a title "artist - title": split, title first; a real artist tag is kept as is', () => {
  assert.deepEqual(Led.splitTitle('周杰伦 - 七里香', ''), {title: '七里香', artist: '周杰伦'});
  assert.deepEqual(Led.splitTitle('周杰伦 - 七里香', '周杰伦'), {title: '周杰伦 - 七里香', artist: '周杰伦'});
  assert.deepEqual(Led.splitTitle('Hey - Jude', 'The Beatles'), {title: 'Hey - Jude', artist: 'The Beatles'});
  assert.deepEqual(Led.splitTitle('七里香', ''), {title: '七里香', artist: ''});
  // a tagger's placeholder is no artist (七里香 in the user's library: "Unknown Artist")
  assert.deepEqual(Led.splitTitle('周杰伦 - 七里香', 'Unknown Artist'), {title: '七里香', artist: '周杰伦'});
  assert.deepEqual(Led.splitTitle('周杰伦 - 七里香', '未知艺术家'), {title: '七里香', artist: '周杰伦'});
  assert.deepEqual(Led.splitTitle('Untitled', 'Unknown Artist'), {title: 'Untitled', artist: ''}, 'the placeholder itself is not shown');
  const r = Led.headerModel(data(104, {title: '周杰伦 - 七里香', artist: ''}), 520, Led.headerRows(16, 12), 16, 12);
  assert.equal(r.title, '七里香');
});

test('a title row too long for its room scrolls a whole character at a time on song time; a short one stays put; never an ellipsis', () => {
  const long = '这是一首名字特别特别长的歌 The Quick Brown Fox Jumps Over The Lazy Dog (Live)';
  const rows = Led.headerRows(16, 12), cols = 330;
  const titleArea = t => Array.from(Led.headerModel(data(t, {title: long}), cols, rows, 16, 12).map.a.slice(0, 18 * cols)).join('');
  const seen = new Set([0, 3, 5, 6, 7, 9, 12].map(titleArea));
  assert.ok(seen.size >= 3, 'the long title moves with song time: ' + seen.size + ' positions');
  assert.equal(titleArea(5), titleArea(5), 'the same moment, the same position');
  const short = t => Array.from(Led.headerModel(data(t), cols, rows, 16, 12).map.a.slice(0, 18 * cols)).filter((v, i) => i % cols < 200).join('');
  assert.equal(short(3), short(7), 'a title that fits does not move');
  assert.ok(lit(Led.headerModel(data(104, {sections: [], title: long}), 400, rows, 16, 12).map) > 0);
});

test('stations: passed dim, this one brightest and boxed, the next one\'s name medium and its lamp blinking each song second, later ones dimmest', () => {
  const rows = Led.headerRows(16, 12), cols = 330, yL = rows - 15;
  const model = t => Led.headerModel(data(t), cols, rows, 16, 12);
  const m = model(104.2), sx = k => Math.round(m.plan.x0 + m.plan.step * k);
  assert.equal(m.plan.cur, 2); // 副歌 1
  assert.equal(at(m.map, sx(1), yL), 2, 'passed');
  assert.equal(at(m.map, sx(2), yL), 4, 'this station');
  assert.equal(at(m.map, sx(2), yL - 2), 4, 'boxed');
  assert.equal(at(m.map, sx(3), yL), 4, 'next lamp on in the first half of the second');
  assert.equal(at(model(104.7).map, sx(3), yL), 1, 'and off in the second half');
  assert.equal(at(m.map, sx(4), yL), 1, 'later');
  const name = (M, k) => maxIn(M, sx(k) - 1, sx(k) - 1 + Math.round(m.plan.step) - 1, yL + 3, rows);
  assert.deepEqual([0, 1, 2, 3, 4].map(k => name(m.map, k)), [2, 2, 4, 3, 1]);
});

test('a crowded route still names every station, including two-digit section numbers', () => {
  const rows = Led.headerRows(16, 12);
  const many = Array.from({length: 20}, (_, i) => ({name: '副歌 ' + (i + 1), start: i * 10, end: i * 10 + 10}));
  const wide = Led.headerModel(data(5, {sections}), 330, rows, 16, 12);
  assert.ok(wide.labels && wide.labels[1] !== undefined);
  const crowded = Led.headerModel(data(55, {sections: many, duration: 200}), 330, rows, 16, 12);
  assert.deepEqual(crowded.labels,many.map((_,i) => 'C'+(i+1)));
  for (const n of [0, 1, 2, 20]) {
    assert.doesNotThrow(() => Led.headerModel(data(55, {sections: many.slice(0, n)}), 330, rows, 16, 12), n + ' stations');
  }
});

test('the route is lit up to the current position and not beyond', () => {
  const rows = Led.headerRows(16, 12), yL = rows - 15;
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

test('vfd sill theme: renders lyrics and deterministic instrumental standby with VU bars and cached static strip', () => {
  Led.clearCaches();
  const rect = {x: 100, y: 20, w: 728, h: 39};
  const m1 = mockCanvas(960, 100), g1 = m1.canvas.getContext('2d');
  assert.equal(Led.drawLyric(g1, rect, {line: '窗外的远山一重又一重', progress: .2}, {idle: 'dim', theme: 'vfd'}), 'cold');
  assert.equal(Led.drawLyric(g1, rect, {line: '窗外的远山一重又一重', progress: .2}, {idle: 'dim', theme: 'vfd'}), 'hit');
  const sb = {bars: [.2, .4, .7, .9, .6, .5, .8, .4, .3, .2], tag: 'CHORUS 3', time: 245, duration: 358};
  const m2 = mockCanvas(960, 100), g2 = m2.canvas.getContext('2d');
  const m3 = mockCanvas(960, 100), g3 = m3.canvas.getContext('2d');
  assert.equal(Led.drawLyric(g2, rect, {line: '', progress: 0}, {idle: 'dim', theme: 'vfd', standby: sb}), 'cold');
  assert.equal(Led.drawLyric(g3, rect, {line: '', progress: 0}, {idle: 'dim', theme: 'vfd', standby: sb}), 'hit');
  assert.equal(m2.calls.filter(c => c.name === 'drawImage').length, m3.calls.filter(c => c.name === 'drawImage').length, 'deterministic VU + strip blits');
  assert.ok(m2.calls.filter(c => c.name === 'drawImage').length > 20, 'VU bars draw phosphor dot sprites over the cached base');
});
