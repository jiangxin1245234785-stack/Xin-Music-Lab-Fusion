'use strict';
// node --test source/scoreview/tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {ScoreView, mockCanvas, fullModel, lanesOnly, OPTIONAL_LAYERS, BENCH} = require('./helpers.cjs');

const view = (model, options, size = [800, 400]) => {
  const surface = mockCanvas(...size);
  return {surface, view: ScoreView.create(surface.canvas, model, () => 0, {...BENCH, ...options})};
};

test('the defaults are what gate one decided', () => {
  const {windowSeconds, playhead, simplify, mergeTimbres} = ScoreView.DEFAULTS;
  assert.deepEqual({windowSeconds, playhead, simplify, mergeTimbres},
    {windowSeconds: 16, playhead: 0.35, simplify: true, mergeTimbres: true});
  const surface = mockCanvas(800, 400);
  const plain = ScoreView.create(surface.canvas, fullModel(), () => 0);
  assert.deepEqual(plain.lanes().map(lane => lane.id), ['vocals', 'guitar', 'bass', 'drums']);
  assert.ok(plain.lanes().find(lane => lane.id === 'guitar').removed, '默认应当是简化画法');
});

test('the three required keys are required, and the error says which one', () => {
  for (const key of ['contract', 'track', 'audio', 'lanes']) {
    const model = fullModel();
    delete model[key];
    assert.throws(() => ScoreView.inspect(model), new RegExp(key), `没有 ${key} 应当被拒绝`);
  }
  assert.throws(() => ScoreView.inspect({...fullModel(), contract: 'xin.score-view/2'}), /契约版本/);
  assert.throws(() => ScoreView.inspect(null), /不是对象/);
});

test('every optional layer may be missing, alone or all at once, and the lanes still draw', () => {
  const reference = view(fullModel());
  const expected = reference.view.draw(10);
  assert.ok(expected.notes > 0 && expected.hits > 0, '完整模型在 10 秒处应当画出音符和鼓');
  const strip = keys => { const model = fullModel(); for (const key of keys) delete model[key]; return model; };
  for (const keys of [...OPTIONAL_LAYERS.map(key => [key]), OPTIONAL_LAYERS]) {
    const {view: stripped} = view(strip(keys));
    const frame = stripped.draw(10);
    assert.deepEqual([frame.notes, frame.hits, frame.lanes], [expected.notes, expected.hits, expected.lanes],
      `去掉 ${keys.join('+')} 之后画出来的音符变了`);
    for (const key of keys) assert.equal(stripped.layers()[key], false, `${key} 去掉后 layers() 还说有`);
  }
});

test('a malformed optional layer counts as missing instead of throwing', () => {
  const model = fullModel();
  Object.assign(model, {chords: 'D#m', chordTones: [3, 6, 10], sections: {}, bars: [1, 2], captions: 7, energy: {hop: 0.1}, levels: 'loud', cover: 'front.jpg'});
  const {view: tolerant} = view(model);
  assert.doesNotThrow(() => tolerant.draw(10));
  const layers = tolerant.layers();
  for (const key of OPTIONAL_LAYERS) assert.equal(layers[key], false, key);
});

test('an unsteady beat grid is not reported as bars', () => {
  const model = fullModel();
  model.bars = {beatsPerBar: null, bpm: 150, beats: [0, 0.4, 0.8], downbeats: [], steady: false};
  const layers = ScoreView.inspect(model);
  assert.equal(layers.bars, false);
  assert.equal(layers.beats, true);
});

test('a model with no lanes at all draws a frame', () => {
  const {view: empty, surface} = view({contract: 'xin.score-view/1', track: {}, audio: {}, lanes: []});
  const frame = empty.draw(3);
  assert.deepEqual([frame.lanes, frame.notes, frame.hits], [0, 0, 0]);
  assert.equal(surface.bars().length, 0);
});

test('lanes of an unknown kind or with broken notes are skipped and named', () => {
  const model = fullModel();
  model.lanes.push({id: 'mystery', kind: 'hologram', notes: []}, {id: 'broken', kind: 'pitched', notes: 'none'}, null);
  const layers = ScoreView.inspect(model);
  assert.equal(layers.lanes, 5);
  assert.deepEqual(layers.skipped, ['mystery', 'broken', 'lane-7']);
});

test('notes with nonsense values are dropped one by one, not the whole lane', () => {
  const model = fullModel();
  model.lanes = [{id: 'bass', label: '贝斯', kind: 'pitched',
                  notes: [[1, 1, 40, 90], [NaN, 1, 40, 90], [2, 0, 40, 90], [3, -1, 40, 90], [4, 1, 400, 90], 'x', [5, 1, 41]]}];
  const {view: cleaned} = view(model);
  assert.equal(cleaned.lanes()[0].count, 2);
});

test('only notes on screen are drawn', () => {
  const {view: scoped, surface} = view(lanesOnly(), {windowSeconds: 10, playhead: 0.5});
  // At 10 s with a 10 s window the screen shows 5..15 s: nothing of the notes at 30, 40 and 50 s.
  const frame = scoped.draw(10);
  assert.equal(frame.notes, 3 + 5 + 2 + 2 - 1, '人声 2 + 电吉他 5 + 木吉他 2 + 贝斯 2（30 秒和 40 秒的不该画）');
  assert.equal(frame.hits, 5);
  for (const bar of surface.bars()) assert.ok(bar.x < 800 && bar.x + bar.width > 0, `有一条画在了屏幕外：x=${bar.x}`);
  surface.reset();
  const far = scoped.draw(100);
  assert.deepEqual([far.notes, far.hits], [0, 0]);
});

test('the score scrolls: one second later every note is one second of pixels further left', () => {
  const model = lanesOnly();
  model.lanes = [model.lanes[3]];                       // bass: two notes, 8 s and 10 s
  const {view: scrolling, surface} = view(model, {windowSeconds: 8, playhead: 0.5});
  scrolling.draw(9);
  const before = surface.bars().map(bar => bar.x).sort((a, b) => a - b);
  surface.reset();
  scrolling.draw(10);
  const after = surface.bars().map(bar => bar.x).sort((a, b) => a - b);
  assert.equal(before.length, 2);
  before.forEach((x, index) => assert.ok(Math.abs(x - after[index] - 100) < 1e-3, `移动了 ${x - after[index]} 像素，应当是 100`));
});

test('a note starts on the play line at the moment it starts', () => {
  const model = lanesOnly();
  model.lanes = [model.lanes[3]];
  for (const playhead of [0.35, 0.62]) {
    const {view: lined, surface} = view(model, {windowSeconds: 10, playhead});
    lined.draw(10);                                     // the second bass note starts at 10 s
    const line = Math.round(800 * playhead);
    assert.ok(surface.bars().some(bar => Math.abs(bar.x - line) < 1e-3), `播放线在 ${playhead} 时音符没有落在线上`);
    assert.ok(Math.abs(lined.xOf(10, 10) - 800 * playhead) < 1e-6);
    assert.ok(Math.abs(lined.timeAt(800 * playhead, 10) - 10) < 1e-6);
  }
});

test('past notes are bright, coming ones dim, the one across the line is lit', () => {
  const model = lanesOnly();
  model.lanes = [{id: 'bass', label: '贝斯', kind: 'pitched', notes: [[5, 1, 36, 100], [9.5, 1, 38, 100], [12, 1, 40, 100]]}];
  const {view: shaded, surface} = view(model);
  const frame = shaded.draw(10);
  assert.equal(frame.active, 1);
  const alpha = style => Number(/,([\d.]+)\)$/.exec(style)[1]);
  const byX = surface.bars().sort((a, b) => a.x - b.x);
  assert.deepEqual(byX.map(bar => alpha(bar.style)), [0.92, 1, 0.34]);
});

test('the latency offset moves the picture and nothing else', () => {
  const model = lanesOnly();
  model.lanes = [model.lanes[3]];
  const {view: shifted, surface} = view(model, {windowSeconds: 10, playhead: 0.5, offsetSeconds: -0.2});
  shifted.draw(10);
  const late = Math.max(...surface.bars().map(bar => bar.x));
  assert.ok(Math.abs(late - (400 + 0.2 * 80)) < 1e-3, '推迟 200 ms 后，10 秒起的音符应当还在线右边 16 像素');
});

test('hidden lanes are not drawn, and hiding one timbre track keeps its siblings', () => {
  const {view: hiding} = view(fullModel());
  const all = hiding.draw(10);
  hiding.setOptions({hidden: ['bass', 'drums']});
  const fewer = hiding.draw(10);
  assert.equal(fewer.lanes, all.lanes - 2);
  assert.equal(fewer.hits, 0);
  assert.equal(fewer.notes, all.notes - 2);
  assert.deepEqual(hiding.lanes().filter(lane => !lane.visible).map(lane => lane.id), ['bass', 'drums']);
});

test('merging timbre tracks gives one lane per stem and keeps the melody and the drums apart', () => {
  const {view: merged} = view(fullModel(), {mergeTimbres: true});
  const lanes = merged.lanes();
  assert.deepEqual(lanes.map(lane => lane.id), ['vocals', 'guitar', 'bass', 'drums']);
  const guitar = lanes[1];
  assert.equal(guitar.label, '吉他');
  assert.deepEqual(guitar.members, ['guitar/clean electric guitar', 'guitar/acoustic guitar']);
  assert.equal(guitar.count, 8);
  merged.setOptions({hidden: ['guitar/acoustic guitar']});
  assert.equal(merged.lanes()[1].count, 6, '藏掉一条音色轨后，合并轨里只剩另一条的音符');
  merged.setOptions({hidden: ['guitar/acoustic guitar', 'guitar/clean electric guitar']});
  assert.equal(merged.lanes()[1].visible, false);
});

test('simplify joins a chain on one pitch, then drops what is short, then what is quiet', () => {
  const {notes, stats} = ScoreView.simplifyNotes([
    [9, 0.2, 60, 100], [9.2, 0.2, 60, 60], [9.4, 0.2, 60, 30],      // a chain: one note, the loudest velocity
    [10, 0.03, 72, 100],                                             // a blip
    [11, 0.5, 67, 20],                                               // quiet
    [12, 0.05, 64, 30], [12.05, 0.05, 64, 30], [12.1, 0.05, 64, 90], // short pieces that add up to a real note
    [20, 0.5, 60, 100],                                              // the same pitch much later stays apart
    [20.1, 0.5, 61, 100]                                             // a neighbouring pitch is never joined
  ]);
  assert.deepEqual(notes.map(note => [note[0], Math.round(note[1] * 1000) / 1000, note[2], note[3]]),
    [[9, 0.6, 60, 100], [12, 0.15, 64, 90], [20, 0.5, 60, 100], [20.1, 0.5, 61, 100]]);
  assert.deepEqual(stats, {input: 10, joined: 4, short: 1, quiet: 1, output: 4});
});

test('simplify leaves its input alone and bridges only small gaps', () => {
  const input = [[0, 1, 60, 80], [1.03, 1, 60, 80], [2.2, 1, 60, 80]];
  const copy = JSON.parse(JSON.stringify(input));
  const {notes} = ScoreView.simplifyNotes(input);
  assert.deepEqual(input, copy);
  assert.equal(notes.length, 2, '30 ms 的缝合上，170 ms 的缝不合');
  assert.ok(Math.abs(notes[0][1] - 2.03) < 1e-9);
});

test('switching to simplified changes the notes but not where the lanes are', () => {
  const {view: toggled, surface} = view(lanesOnly());
  toggled.draw(10);
  const rawRows = new Set(surface.bars().map(bar => Math.round(bar.y)));
  const rawCount = toggled.lanes().find(lane => lane.id === 'guitar/clean electric guitar');
  surface.reset();
  toggled.setOptions({simplify: true});
  toggled.draw(10);
  const simple = toggled.lanes().find(lane => lane.id === 'guitar/clean electric guitar');
  assert.equal(rawCount.shown, 6);
  assert.equal(simple.shown, 2, '三连的 60 并成一个，72 的毛刺和力度 20 的 67 去掉，剩 60 和 55');
  assert.deepEqual(simple.removed, {input: 6, joined: 2, short: 1, quiet: 1, output: 2});
  for (const bar of surface.bars()) assert.ok(rawRows.has(Math.round(bar.y)), '简化后有音符换了行');
  assert.equal(toggled.lanes().find(lane => lane.id === 'drums').shown, 6, '鼓不做简化');
});

test('the sung lane carries note names and is drawn thicker than the others', () => {
  const {view: named, surface} = view(lanesOnly());
  named.draw(10.2);
  const texts = surface.texts().map(item => item.text);
  assert.ok(texts.includes('B3') && texts.includes('C#4'), `人声音名没画出来：${texts}`);
  const tallest = Math.max(...surface.bars().map(bar => bar.height));
  const vocal = surface.bars().filter(bar => bar.style.startsWith('rgba(215,138,181'))[0];
  assert.equal(vocal.height, tallest);
});

test('note names never overlap: a crowded phrase keeps only the names that fit', () => {
  const model = lanesOnly();
  model.lanes = [{id: 'vocals', label: '人声', kind: 'melody',
                  notes: Array.from({length: 20}, (_, i) => [10 + i * 0.07, 0.065, 60 + (i % 3), 90])}];
  const {view: crowded, surface} = view(model, {windowSeconds: 16});
  crowded.draw(10.5);
  // Octave marks sit in the right gutter and look like note names too; leave them out.
  const names = surface.texts().filter(item => /^[A-G]#?\d$/.test(item.text) && item.x < 780).sort((a, b) => a.x - b.x);
  assert.ok(names.length > 0 && names.length < 20);
  for (let i = 1; i < names.length; i++) {
    assert.ok(names[i].x >= names[i - 1].x + names[i - 1].text.length * 6, '两个音名叠在了一起');
  }
});

test('each drum class gets its own row, kick lowest, and rows without hits take no space', () => {
  const model = lanesOnly();
  model.lanes = [model.lanes[4]];
  const {view: kit, surface} = view(model);
  assert.deepEqual(kit.lanes()[0].rows, ['crash', 'hihat', 'snare', 'kick']);
  kit.draw(9.75);
  const rows = [...new Set(surface.bars().map(bar => Math.round(bar.y + bar.height / 2)))].sort((a, b) => a - b);
  assert.equal(rows.length, 3, '屏幕上有底鼓、军鼓、踩镲三行');
  const kick = surface.bars().filter(bar => Math.abs(bar.x - (800 * 0.62 + (10 - 9.75) * 80)) < 2)
    .map(bar => bar.y + bar.height / 2);
  assert.equal(Math.round(Math.max(...kick)), rows[rows.length - 1], '底鼓应当在最下面一行');
});

test('the header shows title, album and artist, and an untitled song draws no header text', () => {
  const titled = view(fullModel());
  titled.view.draw(0);
  const texts = titled.surface.texts().map(item => item.text);
  assert.ok(texts.includes('测试曲') && texts.includes('某专辑 — 某人'));
  const model = fullModel();
  model.track = {duration: 60};
  const bare = view(model);
  bare.view.draw(0);
  assert.ok(!bare.surface.texts().some(item => /测试曲|某专辑/.test(item.text)));
});

test('a canvas of any size draws, including a phone held upright', () => {
  for (const size of [[360, 300], [844, 390], [1600, 900], [0, 0]]) {
    const {view: sized} = view(fullModel(), {}, size);
    assert.doesNotThrow(() => sized.draw(10), `尺寸 ${size}`);
  }
});

test('layers() says what this version draws, so a host never guesses', () => {
  const {view: honest} = view(fullModel());
  const layers = honest.layers();
  assert.deepEqual(layers.drawn, ['header', 'lanes', 'drums', 'playhead', 'chords', 'sections', 'bars', 'contour', 'captions', 'backdrop']);
  assert.equal(layers.chords && layers.sections && layers.bars && layers.captions && layers.energy && layers.contour, true);
});

test('setModel swaps the song', () => {
  const {view: swapped} = view(fullModel());
  const model = fullModel();
  model.lanes = [model.lanes[3]];
  model.track.duration = 12;
  swapped.setModel(model);
  assert.equal(swapped.lanes().length, 1);
  assert.equal(swapped.duration(), 12);
});

test('no function in the core is defined and then never used', () => {
  // The timeline project twice shipped a method nothing called. A unit test cannot see
  // that from the inside, so this one reads the source.
  const source = fs.readFileSync(path.join(__dirname, '..', 'score-view.js'), 'utf8');
  const names = new Set();
  for (const match of source.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)) names.add(match[1]);
  for (const match of source.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g)) names.add(match[1]);
  assert.ok(names.size > 25, '没读到函数定义，这条检查失效了');
  const unused = [...names].filter(name =>
    (source.match(new RegExp(`(?<![\\w$.])${name.replace(/\$/g, '\\$')}(?![\\w$])`, 'g')) || []).length < 2);
  assert.deepEqual(unused, []);
});
