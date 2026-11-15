'use strict';
// Stage A4: the listening captions.
const test = require('node:test');
const assert = require('node:assert/strict');
const {ScoreView, mockCanvas, fullModel, lanesOnly, BENCH} = require('./helpers.cjs');

const view = (model, options, size = [800, 400]) => {
  const surface = mockCanvas(...size);
  return {surface, view: ScoreView.create(surface.canvas, model, () => 0, {...BENCH, ...options})};
};
const alpha = style => Number(/,([\d.]+)\)$/.exec(style)[1]);
const TEXT = '先听人声和吉他。';

test('a caption shows while it is due and not before or after', () => {
  const {view: guided, surface} = view(fullModel());
  assert.equal(guided.draw(8.9).caption, null);
  assert.equal(guided.draw(15.1).caption, null);
  surface.reset();
  assert.equal(guided.draw(12).caption, TEXT);
  const drawn = surface.texts().find(item => item.text === TEXT);
  assert.ok(drawn && drawn.x === 16 && alpha(drawn.style) === 0.94, JSON.stringify(drawn));
  const section = surface.texts().find(item => item.text === '引子' && item.y < 130);
  assert.ok(drawn.y > section.y + 12, '字幕应当在段名下面');
});

test('a caption fades in and out with the song clock', () => {
  const {view: guided, surface} = view(fullModel());
  const at = time => { surface.reset(); guided.draw(time); return alpha(surface.texts().find(item => item.text === TEXT).style); };
  assert.ok(Math.abs(at(9.15) - 0.47) < 0.01 && Math.abs(at(14.85) - 0.47) < 0.01);
  assert.ok(at(9.05) < at(9.2) && at(14.95) < at(14.8));
});

test('a long caption wraps by character, keeps clear of the chord, and ends in an ellipsis when it cannot fit', () => {
  const model = fullModel();
  const long = '再回到主歌，先听人声和吉他重新接上，然后注意贝斯在第二拍上的那个切分，还有弦乐慢慢铺进来的长音，最后鼓加了一个过门。'.repeat(6);
  model.captions = [[9, 15, long, 'manual']];
  const {view: guided, surface} = view(model);
  guided.draw(12);
  const lines = surface.texts().filter(item => item.x === 16 && item.y > 60 && item.y < 130 && item.text !== '引子');
  assert.ok(lines.length >= 2, `只画了 ${lines.length} 行`);
  for (const line of lines) assert.ok(line.text.length * 6 <= 784 - 16 - 190 + 6, `这一行伸进了和弦那一侧：${line.text.length} 个字`);
  assert.ok(lines[lines.length - 1].text.endsWith('…'));
  assert.ok(long.startsWith(lines.slice(0, -1).map(line => line.text).join('')), '换行不应当丢字');
  assert.ok(Math.max(...lines.map(line => line.y)) < 130, '字幕伸出了信息带');
});

test('captions can be switched off, and a song without them has nothing to switch', () => {
  const {view: guided} = view(fullModel(), {showCaptions: false});
  assert.equal(guided.draw(12).caption, null);
  guided.setOptions({showCaptions: true});
  assert.equal(guided.draw(12).caption, TEXT);
  const {view: plain} = view(lanesOnly());
  assert.equal(plain.draw(12).caption, null);
  assert.equal(plain.layers().captions, false);
});

test('a song with only lanes and captions still gets the band for them', () => {
  const model = lanesOnly();
  model.captions = [[9, 15, TEXT, 'rule']];
  const {view: guided, surface} = view(model);
  assert.equal(guided.draw(12).caption, TEXT);
  const drawn = surface.texts().find(item => item.text === TEXT);
  const notes = surface.bars().filter(item => item.height <= 8);
  assert.ok(drawn.y < Math.min(...notes.map(item => item.y)) - 10, '字幕压在了音符上');
});

test('broken caption rows are dropped, and overlapping ones show the later', () => {
  const model = fullModel();
  model.captions = [[9, 15, '第一句', 'rule'], [12, 18, '第二句', 'rule'], [20, 19, '坏的', 'rule'], [21, 22, '', 'rule'], 'x', [30, 31, 5]];
  const {view: guided} = view(model);
  assert.equal(guided.draw(10).caption, '第一句');
  assert.equal(guided.draw(13).caption, '第二句');
  assert.equal(guided.draw(21.5).caption, null);
});
