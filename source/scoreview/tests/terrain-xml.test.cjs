'use strict';
// 车窗地貌 in XML (batch 4, 2026-11-19): the roadside option passes the core's whitelist and reaches the look's frame;
// the sill gets the line being sung and how far into it the song is; the line is dark where nobody sings; listening,
// full screen and export hand the look the same frame and draw the same calls (the real look and LED module).
const assert = require('node:assert/strict');
const test = require('node:test');
const {mockCanvas, fullModel} = require('./helpers.cjs');
const P = require('../score-presentation.js');
const Core = require('../score-view.js');
const terrain = require('../score-terrain.js');
const Led = require('../score-terrain-led.js');

const lines = [{time: 22, text: '第一句'}, {time: 26, text: '第二句'}, {time: 40, text: '最后一句'}];
const snap = (extra = {}) => ({trackId: 't', enabled: true, offset: 0, lines, ...extra});
const canvasAt = (w, h) => {
  const m = mockCanvas(w, h);
  Object.assign(m.canvas.getContext('2d'), {arcTo() {}});
  m.canvas.ownerDocument = {createElement: () => mockCanvas().canvas};
  return m;
};
function withLook(run) {
  const prior = {art: globalThis.XinArt, led: globalThis.XinScoreTerrainLed, mood: globalThis.XinScoreMood, ratio: globalThis.devicePixelRatio};
  const frames = [];
  try {
    globalThis.XinScoreMood = require('../score-style.cjs');
    globalThis.XinScoreTerrainLed = Led;
    Led.setCanvasFactory(() => null);   // dots drawn directly: every lit dot is a recorded call
    globalThis.XinArt = {terrain: {...terrain, draw: (ctx, f) => { frames.push(f); return terrain.draw(ctx, f); }}};
    globalThis.devicePixelRatio = 1;
    run(frames);
  } finally {
    globalThis.XinArt = prior.art; globalThis.XinScoreTerrainLed = prior.led; globalThis.XinScoreMood = prior.mood; globalThis.devicePixelRatio = prior.ratio;
  }
}

test('the roadside option: a core default (off), checked by the whitelist, carried to the look\'s frame', () => {
  assert.equal(Core.DEFAULTS.terrainRoadside, 'off');
  withLook(frames => {
    const {canvas} = canvasAt(1123, 783);
    const view = P.create(canvas, fullModel(), () => 30, {scoreStyle: 'terrain', terrainRoadside: 'kick-snare'});
    assert.equal(view.options().terrainRoadside, 'kick-snare');
    view.draw(30);
    assert.equal(frames.at(-1).terrainRoadside, 'kick-snare');
    view.setOptions({terrainRoadside: 'poles'});
    assert.equal(view.options().terrainRoadside, 'kick-snare', 'an unknown value is dropped');
    view.setOptions({terrainRoadside: 'all'});
    view.draw(30);
    assert.equal(frames.at(-1).terrainRoadside, 'all');
    view.setOptions({scoreStyle: 'flag'});
    assert.equal(view.options().terrainRoadside, 'all', 'kept while another look is shown');
  });
});

test('the sill line: the line being sung with its progress; dark before the first section, after the last, in intro / 器乐段 / outro', () => {
  const sections = [[3, 21, '引子', 'songformer', 'intro'], [21, 30, '主歌 1', 'songformer', 'verse'], [30, 38, '器乐段', 'songformer', 'inst'],
    [38, 50, '副歌', 'songformer', 'chorus'], [50, 58, '尾奏', 'songformer', 'outro']];
  const at = (t, s = snap()) => P.sillLyric(s, t, sections);
  assert.deepEqual(at(1, snap({lines: [{time: 0, text: '七里香 - 周杰伦'}]})), {line: '', progress: null}, 'before the first section row');
  assert.equal(at(10).line, '', 'intro');
  assert.deepEqual(at(24), {line: '第一句', progress: .5});
  assert.equal(at(27).line, '第二句');
  assert.equal(at(33).line, '', '器乐段 (lyricAt lets it through)');
  assert.equal(P.sillLyric(snap(), 33, [[30, 38, 'Solo', 'x', 'solo']]).line, '', 'kind says nobody sings');
  assert.deepEqual(at(45), {line: '最后一句', progress: .5}, 'the last line runs to its section\'s end');
  assert.equal(at(52).line, '', 'outro');
  assert.equal(at(59).line, '', 'after the last section row');
  assert.equal(at(24, snap({enabled: false})).line, '', '显示歌词 off: dark');
  assert.deepEqual(at(25, snap({offset: 1})), {line: '第一句', progress: .5}, 'the lyric offset is the score\'s own');
  assert.equal(P.sillLyric(snap(), 24, []).line, '第一句', 'no sections: every line shows');
});

test('the presentation hands the look the sill line and its progress; other looks keep lyricAt', () => {
  withLook(frames => {
    const {canvas} = canvasAt(1123, 783);
    const model = fullModel();
    const view = P.create(canvas, model, () => 0, {scoreStyle: 'terrain'});
    view.setLyrics(snap());
    const one = view.draw(24);
    assert.equal(frames.at(-1).lyric, '第一句');
    assert.equal(frames.at(-1).lyricProgress, .5);
    assert.equal(one.presentation.lyric, '第一句');
    view.draw(15);
    assert.equal(frames.at(-1).lyric, '', 'the intro');
    assert.equal('lyricProgress' in frames.at(-1), false);
    assert.equal(P.lyricAt(snap(), 47, 'Verse 2'), '最后一句', 'lyricAt itself is unchanged for the other looks');
  });
});

test('listening, full screen and export: the same frame and the same calls for 车窗地貌 (LED displays included)', () => {
  withLook(frames => {
    const model = fullModel();
    const settings = {scoreStyle: 'terrain', lang: 'zh-CN', terrainRoadside: 'all', offsetSeconds: -.125};
    globalThis.devicePixelRatio = 1.5;
    const live = canvasAt(960, 720);
    const view = P.create(live.canvas, model, () => 24.125, settings);
    view.setLyrics(snap());
    view.draw(undefined, true);
    assert.equal(frames.at(-1).time, 24);
    assert.equal(frames.at(-1).lyric, '第一句');
    live.canvas.clientWidth = 1280;
    view.setOptions({presentationLayout: true});
    view.draw();                            // warm (the first frame of a song rasterises its names)
    live.reset();
    const shown = view.draw(), shownFrame = frames.at(-1);
    const shownCalls = live.calls.slice();
    assert.ok(shownCalls.some(c => c.name === 'arc'), 'the LED dots are drawn');

    const out = canvasAt(1920, 1080);
    out.canvas.clientWidth = out.canvas.clientHeight = 0;
    const exported = P.create(out.canvas, model, () => 0, view.options());
    exported.setLyrics(snap());
    out.reset();
    const frame = exported.draw(24.125);
    const {song: a, ...restA} = frames.at(-1), {song: b, ...restB} = shownFrame;
    assert.equal(a, b);
    assert.deepEqual(restA, restB);
    assert.deepEqual(frame, shown);
    assert.deepEqual([out.canvas.width, out.canvas.height], [1920, 1080]);
    assert.deepEqual([live.canvas.width, live.canvas.height], [1920, 1080]);
    const first = out.calls.findIndex((c, i) => JSON.stringify(c) !== JSON.stringify(shownCalls[i]));
    assert.equal(first, -1, `export draws exactly what full screen draws (first difference at call ${first} of ${shownCalls.length}: ${JSON.stringify(out.calls[first])?.slice(0, 300)} vs ${JSON.stringify(shownCalls[first])?.slice(0, 300)})`);
    assert.equal(out.calls.length, shownCalls.length);
  });
});
