'use strict';
// Stage A2: the chord panel and the section bar.
const test = require('node:test');
const assert = require('node:assert/strict');
const {ScoreView, mockCanvas, fullModel, lanesOnly, BENCH} = require('./helpers.cjs');

const view = (model, options, size = [800, 400]) => {
  const surface = mockCanvas(...size);
  return {surface, view: ScoreView.create(surface.canvas, model, () => 0, {...BENCH, ...options})};
};
const alpha = style => Number(/,([\d.]+)\)$/.exec(style)[1]);
const rgb = style => style.replace(/,[\d.]+\)$/, '');
const labels = chords => chords.map(chord => chord[2]);
const seconds = chords => chords.reduce((sum, chord) => sum + chord[1] - chord[0], 0);
// On an 800 x 400 canvas the section bar sits at y 363..391, from x 16 to 784.
const BAR = {top: 363, bottom: 391, left: 16, right: 784};
const barX = time => BAR.left + time / 60 * (BAR.right - BAR.left);

/* --- chords --------------------------------------------------------------- */

test('the chord that is sounding is named, with its tones under it', () => {
  const {view: panel, surface} = view(fullModel());
  let frame = panel.draw(10);
  assert.equal(frame.chord, 'F#');
  let texts = surface.texts().map(item => item.text);
  for (const text of ['F#', 'A#', 'C#']) assert.ok(texts.includes(text), `10 秒处没有画 ${text}`);
  assert.ok(!texts.includes('和弦'), '和弦名旁边又画了「和弦」两个字');
  assert.equal(texts.filter(text => text === 'F#').length, 2, '和弦名一次，根音小块一次');
  surface.reset();
  frame = panel.draw(2);
  assert.equal(frame.chord, 'D#m');
  texts = surface.texts().map(item => item.text);
  for (const text of ['D#m', 'D#', 'F#', 'A#']) assert.ok(texts.includes(text));
});

test('between chords the panel is empty: no name, no tag', () => {
  const {view: panel, surface} = view(fullModel());
  const frame = panel.draw(25);
  assert.equal(frame.chord, null);
  const texts = surface.texts().map(item => item.text);
  assert.ok(!texts.includes('和弦') && !texts.includes('F#') && !texts.includes('Cm'));
});

test('a chord the model gives no tones for still shows its name', () => {
  const model = fullModel();
  delete model.chordTones;
  const {view: panel, surface} = view(model);
  assert.equal(panel.draw(10).chord, 'F#');
  assert.deepEqual(surface.texts().map(item => item.text).filter(text => /^[A-G][#b]?$/.test(text)), ['F#']);
  assert.equal(panel.layers().chordTones, false);
});

test('the chord panel sits at the right edge, under the header and above the lanes', () => {
  const {view: panel, surface} = view(fullModel());
  panel.draw(10);
  const name = surface.texts().find(item => item.text === 'F#' && /700/.test(item.font));
  assert.ok(name && name.x === 784 && name.y > 42 && name.y < 110, JSON.stringify(name));
  for (const bar of surface.bars().filter(item => item.height <= 8)) {
    assert.ok(bar.y > 110 && bar.y + bar.height < BAR.top, `有音符画进了和弦带或段落条：y=${bar.y}`);
  }
});

test('a chord dims out just before the next one and the next comes up just after, never two at once', () => {
  const {view: panel, surface} = view(fullModel());
  const big = time => {
    surface.reset();
    panel.draw(time);
    return surface.texts().filter(item => /700/.test(item.font) && item.y < 115 && item.x === 784);
  };
  let names = big(4.2 - 0.03);
  assert.deepEqual(names.map(item => item.text), ['D#m']);
  assert.ok(Math.abs(alpha(names[0].style) - 0.48) < 0.01, `变之前 30 ms，旧和弦应当暗到一半：${names[0].style}`);
  names = big(4.2 + 0.04);
  assert.deepEqual(names.map(item => item.text), ['F#']);
  assert.ok(Math.abs(alpha(names[0].style) - 0.48) < 0.01, `变之后 40 ms，新和弦应当亮到一半：${names[0].style}`);
  assert.equal(alpha(big(4.2 + 0.5)[0].style), 0.96);
  assert.equal(alpha(big(4.2 - 0.5)[0].style), 0.96);
  // Wherever a frame is caught — a pause, a screenshot — there is one chord name, not two.
  for (let time = 4.0; time < 4.4; time += 0.005) assert.equal(big(time).length, 1, `${time.toFixed(3)} 秒处画了 ${big(time).length} 个和弦名`);
  // The first chord of the song, a chord after a silence and a chord before one have
  // nothing to change with, so they are simply there.
  for (const time of [0.01, 30.01, 19.99, 39.99]) assert.equal(alpha(big(time)[0].style), 0.96, `${time} 秒`);
});

test('smoothing: a blip inside one chord disappears', () => {
  const smoothed = ScoreView.smoothChords([[0, 4, 'C', 0.9], [4, 4.3, 'G', 0.5], [4.3, 8, 'C', 0.9]], 0.5);
  assert.deepEqual(smoothed, [[0, 8, 'C', 0.9]]);
});

test('smoothing: a short chord joins the neighbour with its root, else the longer one', () => {
  // Cm7 sits between a long F and a shorter Cm: it belongs with the Cm, not with the longer one.
  const family = ScoreView.smoothChords([[0, 4, 'F', 1], [4, 4.4, 'Cm7', 1], [4.4, 6, 'Cm', 1]], 0.5);
  assert.deepEqual(family.map(chord => chord.slice(0, 3)), [[0, 4, 'F'], [4, 6, 'Cm']]);
  const longer = ScoreView.smoothChords([[0, 6, 'F', 1], [6, 6.4, 'G', 1], [6.4, 8, 'Am', 1]], 0.5);
  assert.deepEqual(longer.map(chord => chord.slice(0, 3)), [[0, 6.4, 'F'], [6.4, 8, 'Am']]);
  const ahead = ScoreView.smoothChords([[0, 1, 'F', 1], [1, 1.4, 'G', 1], [1.4, 8, 'Am', 1]], 0.5);
  assert.deepEqual(ahead.map(chord => chord.slice(0, 3)), [[0, 1, 'F'], [1, 8, 'Am']]);
});

test('smoothing never joins across a silence, and never changes how much of the song has a chord', () => {
  const apart = [[0, 4, 'C', 1], [5, 5.3, 'G', 1], [7, 9, 'Am', 1]];
  assert.deepEqual(ScoreView.smoothChords(apart, 0.5), apart);
  const busy = [[0, 3, 'C', 1], [3, 3.2, 'D', 1], [3.2, 3.4, 'E', 1], [3.4, 6, 'F', 1], [6, 6.1, 'G', 1]];
  const calm = ScoreView.smoothChords(busy, 0.5);
  assert.deepEqual(labels(calm), ['C', 'F']);
  assert.ok(Math.abs(seconds(calm) - seconds(busy)) < 1e-9);
  assert.ok(calm.every((chord, i) => i === 0 || chord[0] === calm[i - 1][1]), '并完之后中间出现了空隙');
});

test('smoothing leaves its input alone, and "as it is" really is as it is', () => {
  const input = [[0, 4, 'C', 0.9], [4, 4.3, 'G', 0.5], [4.3, 8, 'C', 0.9]];
  const copy = JSON.parse(JSON.stringify(input));
  const same = ScoreView.smoothChords(input, 0);
  ScoreView.smoothChords(input, 2);
  assert.deepEqual(input, copy);
  assert.deepEqual(same, copy);
  assert.notEqual(same[0], input[0]);
});

test('the four settings: as it is, half a second, one beat of this song, one second', () => {
  const model = fullModel();
  model.chords = [[0, 2, 'C', 1], [2, 2.3, 'G', 1], [2.3, 5, 'C', 1], [5, 5.8, 'Am', 1], [5.8, 9, 'F', 1], [9, 9.55, 'G', 1], [9.55, 20, 'C', 1]];
  model.bars = {beatsPerBar: 4, bpm: 100, beats: [0, 0.6, 1.2, 1.8, 2.4, 3.0], downbeats: [0, 2.4], steady: true};
  const {view: panel} = view(model);
  assert.deepEqual(panel.chordCounts(), {raw: 7, half: 5, beat: 4, second: 3});
  assert.ok(Math.abs(panel.layers().beatSeconds - 0.6) < 1e-9);
  assert.equal(panel.draw(2.1).chord, 'G');
  panel.setOptions({chordSmoothing: 'half'});
  assert.equal(panel.draw(2.1).chord, 'C');
  assert.equal(panel.draw(9.2).chord, 'G', '0.55 秒的和弦在「半秒」这一档还在');
  panel.setOptions({chordSmoothing: 'beat'});
  assert.equal(panel.draw(9.2).chord, 'C', '一拍是 0.6 秒，0.55 秒的和弦并掉了');
  panel.setOptions({chordSmoothing: 'nonsense'});
  assert.equal(panel.options().chordSmoothing, 'beat', '不认识的档位不应当改掉现有设置');
});

test('"one beat" needs a beat grid: without one the chords are left as they are', () => {
  const model = fullModel();
  model.chords = [[0, 2, 'C', 1], [2, 2.3, 'G', 1], [2.3, 5, 'C', 1]];
  delete model.bars;
  const {view: panel} = view(model, {chordSmoothing: 'beat'});
  assert.equal(panel.layers().beatSeconds, null);
  assert.equal(panel.chordCounts().beat, 3);
  assert.equal(panel.draw(2.1).chord, 'G');
});

test('chord tones are spelled from the root, not from a table of sharps', () => {
  const cases = {
    Cm: [[0, 3, 7], 'C Eb G'], Bb: [[10, 2, 5], 'Bb D F'], Abmaj7: [[8, 0, 3, 7], 'Ab C Eb G'],
    F7: [[5, 9, 0, 3], 'F A C Eb'], Fm7: [[5, 8, 0, 3], 'F Ab C Eb'], 'D#m': [[3, 6, 10], 'D# F# A#'],
    'F#m': [[6, 9, 1], 'F# A C#'], Fsus4: [[5, 10, 0], 'F Bb C'], Am6: [[9, 0, 4, 6], 'A C E F#'],
    Em: [[4, 7, 11], 'E G B'], Ebmaj7: [[3, 7, 10, 2], 'Eb G Bb D'], Absus2: [[8, 10, 3], 'Ab Bb Eb'],
    // Where the proper letter would be Cb, E# or a double sharp, the everyday name is used.
    Abm: [[8, 11, 3], 'Ab B Eb'], Baug: [[11, 3, 7], 'B D# G'], 'C#': [[1, 5, 8], 'C# F G#'],
    Caug: [[0, 4, 8], 'C E G#'], 'C7#11': [[0, 4, 7, 10, 6], 'C E G Bb F#'], Cm7b5: [[0, 3, 6, 10], 'C Eb Gb Bb'],
    Cdim7: [[0, 3, 6, 9], 'C Eb Gb A'], 'C7#9': [[0, 4, 7, 10, 3], 'C E G Bb D#']
  };
  for (const [label, [tones, expected]] of Object.entries(cases)) {
    assert.equal(ScoreView.toneNames(label, tones).join(' '), expected, label);
  }
  assert.deepEqual(ScoreView.toneNames('N', [0, 4, 7]), []);
  assert.deepEqual(ScoreView.toneNames('Cm', undefined), []);
});

/* --- sections -------------------------------------------------------------- */

test('the section bar lays the whole song out left to right, and lights the section being played', () => {
  const {view: bar, surface} = view(fullModel());
  bar.draw(10);
  const blocks = surface.bars().filter(item => item.y === BAR.top && item.width < 700).sort((a, b) => a.x - b.x);
  assert.equal(blocks.length, 3);
  [0, 21, 50].forEach((start, index) => assert.ok(Math.abs(blocks[index].x - barX(start)) < 1e-6, `第 ${index + 1} 段的位置不对`));
  assert.ok(Math.abs(blocks[0].width - (barX(21) - barX(0) - 1.5)) < 1e-6);
  assert.deepEqual(blocks.map(block => alpha(block.style)), [0.66, 0.17, 0.17]);
  assert.equal(rgb(blocks[1].style), rgb(blocks[2].style), '两段主歌应当是同一个颜色');
  assert.notEqual(rgb(blocks[0].style), rgb(blocks[1].style));
  surface.reset();
  bar.draw(30);
  const later = surface.bars().filter(item => item.y === BAR.top && item.width < 700).sort((a, b) => a.x - b.x);
  assert.deepEqual(later.map(block => alpha(block.style)), [0.3, 0.66, 0.17]);
  const marker = surface.fills().find(fill => fill.width === 2 && fill.y === BAR.top - 3);
  assert.ok(marker && Math.abs(marker.x + 1 - barX(30)) < 1e-6, '进度标记不在 30 秒处');
  const progress = surface.fills().find(fill => fill.height === 2 && fill.y === BAR.bottom + 2);
  assert.ok(progress && Math.abs(progress.width - (barX(30) - BAR.left)) < 1e-6);
});

test('the name of the section being played is at the top left, and nothing is there between sections', () => {
  const {view: named, surface} = view(fullModel());
  assert.equal(named.draw(10).section, '引子');
  const text = surface.texts().find(item => item.text === '引子' && item.y < 110);
  assert.ok(text && text.x === 16);
  assert.equal(named.draw(30).section, '主歌 1');
  surface.reset();
  assert.equal(named.draw(47).section, null);
  assert.ok(!surface.texts().some(item => item.y < 110 && /引子|主歌/.test(item.text)));
});

test('a section name that does not fit its block loses its number, then all but its first character', () => {
  const model = fullModel();
  model.sections = [[0, 10, '主歌 1', 'songformer', 'verse'], [10, 12, '主歌 2', 'songformer', 'verse'],
                    [12, 13.2, '主歌 3', 'songformer', 'verse'], [13.2, 13.7, '主歌 4', 'songformer', 'verse'],
                    [20, 60, '副歌', 'songformer', 'chorus']];
  const {view: bar, surface} = view(model);
  bar.draw(30);
  const inBar = surface.texts().filter(item => item.y > BAR.top && item.y < BAR.bottom).sort((a, b) => a.x - b.x).map(item => item.text);
  assert.deepEqual(inBar, ['主歌 1', '主歌', '主', '副歌']);
});

test('touching the section bar says which section, and where it starts', () => {
  const {view: bar} = view(fullModel());
  assert.equal(bar.hit(100, 377), null, '还没画过一帧，不知道段落条在哪');
  bar.draw(10);
  assert.deepEqual(bar.hit(100, 377), {kind: 'section', time: 0, end: 21, name: '引子', index: 0});
  assert.deepEqual(bar.hit(barX(55), 377), {kind: 'section', time: 50, end: 60, name: '主歌 2', index: 2});
  const between = bar.hit(barX(47), 377);
  assert.equal(between.kind, 'bar');
  assert.ok(Math.abs(between.time - 47) < 1e-6);
  assert.equal(bar.hit(100, 200).kind, 'lane', '谱面中间是轨，不是段落条');
  assert.notEqual((bar.hit(100, 340) || {}).kind, 'section');
});

test('sections with only a cluster letter can show the letter, their place in the song, or nothing', () => {
  const model = fullModel();
  model.sections = [[0, 20, 'A', 'msaf', 'A'], [20, 40, 'B', 'msaf', 'B'], [40, 60, 'A', 'msaf', 'A']];
  const {view: plain, surface} = view(model);
  assert.equal(plain.layers().plainSections, true);
  assert.equal(plain.draw(50).section, 'A');
  const blocks = surface.bars().filter(item => item.y === BAR.top && item.width < 700).sort((a, b) => a.x - b.x);
  assert.equal(rgb(blocks[0].style), rgb(blocks[2].style), '同一个字母应当同色');
  plain.setOptions({plainSections: 'numbered'});
  assert.equal(plain.draw(50).section, '第 3 段');
  assert.equal(plain.hit(barX(30), 377).name, '第 2 段');
  surface.reset();
  plain.setOptions({plainSections: 'hidden'});
  assert.equal(plain.draw(50).section, null);
  assert.ok(!surface.texts().some(item => /^[A-E]$|段/.test(item.text)), '藏起来之后不应当有任何段落文字');
  assert.equal(surface.bars().filter(item => item.y === BAR.top && item.width < 700).length, 3, '色块还在');
  assert.equal(plain.hit(barX(30), 377).name, 'B', '跳转时仍然说得出是哪一段');
  // Named sections are never touched by this setting.
  const {view: named} = view(fullModel(), {plainSections: 'hidden'});
  assert.equal(named.draw(10).section, '引子');
  assert.equal(named.layers().plainSections, false);
});

test('a song with sections but no chords, or chords but no sections, shows what it has', () => {
  const onlySections = fullModel();
  delete onlySections.chords;
  let made = view(onlySections);
  let frame = made.view.draw(10);
  assert.deepEqual([frame.section, frame.chord], ['引子', null]);
  assert.ok(made.view.hit(100, 377));
  const onlyChords = fullModel();
  delete onlyChords.sections;
  made = view(onlyChords);
  frame = made.view.draw(10);
  assert.deepEqual([frame.section, frame.chord], [null, 'F#']);
  assert.notEqual((made.view.hit(100, 377) || {}).kind, 'section');
  assert.equal(made.surface.bars().filter(item => item.y === BAR.top).length, 0, '没有段落就没有段落条');
});

test('without chords and sections the lanes get the room back', () => {
  const top = model => {
    const {view: made, surface} = view(model);
    made.draw(10);
    const notes = surface.bars().filter(item => item.height <= 8);
    return [Math.min(...notes.map(item => item.y)), Math.max(...notes.map(item => item.y + item.height))];
  };
  const [fullTop, fullBottom] = top(fullModel());
  const [bareTop, bareBottom] = top(lanesOnly());
  assert.ok(bareTop < fullTop - 40 && bareBottom > fullBottom + 20, `${[bareTop, fullTop, bareBottom, fullBottom]}`);
});

test('broken chord and section rows are dropped one by one', () => {
  const model = fullModel();
  model.chords = [[0, 4, 'C', 0.5], [4, 4, 'G', 1], ['x', 5, 'G', 1], [6, 8, '', 1], [8, 10, 'Am'], null, [12, 14, 'F', 'high']];
  model.sections = [[0, 20, '引子', 'songformer'], [20, 10, '主歌', 'songformer'], [30, 40, 42, 'songformer'], [40, 500, '尾奏', 'songformer']];
  const {view: tolerant} = view(model);
  assert.deepEqual(tolerant.chordCounts().raw, 3);
  assert.equal(tolerant.draw(9).chord, 'Am');
  assert.equal(tolerant.draw(50).section, '尾奏');
  assert.equal(tolerant.hit(barX(59), 377).end, 60, '段落不应当伸到曲子外面');
});
