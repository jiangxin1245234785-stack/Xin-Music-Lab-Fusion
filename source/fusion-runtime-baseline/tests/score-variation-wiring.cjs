'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {ScoreView, mockCanvas} = require('../../scoreview/tests/helpers.cjs');

const scripts = (files, context) => {
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
};

const model = (id, offset = 0) => ({
  contract: 'xin.score-view/1', track: {id, duration: 40, title: id}, audio: {},
  sections: [[2+offset, 8+offset, '主歌 1'], [12+offset, 18+offset, '主歌 2'], [22+offset, 28+offset, '副歌']],
  bars: {beats: Array.from({length: 81}, (_, i) => i / 2)},
  lanes: [{id: 'piano', group: 'piano', kind: 'pitched', notes: [[4+offset, 1, 60, 100], [14+offset, 1, 63, 94]]}]
});

function renderer() {
  const context = vm.createContext({XinScoreView: ScoreView, XinScoreMood: require('../../scoreview/score-style.cjs')});
  scripts(['score-surface','score-variation','score-presentation'].map(name => '../scoreview/' + name + '.js'), context);
  const document = {createElement() {
    const {canvas} = mockCanvas(1280, 720);
    Object.assign(canvas.getContext('2d'), {clearRect(){}, getImageData(){return {data:[]};}, putImageData(){}, setLineDash(){}});
    canvas.ownerDocument = document;
    return canvas;
  }};
  return {Presentation: context.XinScorePresentation, canvas: document.createElement()};
}

test('the chosen reference follows the same clock in Starry, Paper and export', () => {
  const {Presentation, canvas} = renderer();
  const song = model('one');
  const view = Presentation.create(canvas, song, () => 4.1, {variationEnabled: true, offsetSeconds: -.1});
  const ordinary = view.draw();
  assert.equal(ordinary.variation.active, 'a');
  assert.ok(Math.abs(ordinary.variation.alternateTime - 14) < .00001);
  assert.ok(ordinary.variation.marks);
  const selection = view.options().variation;
  view.setOptions({scoreStyle: 'paper', presentationLayout: true});
  const immersive = view.draw();
  assert.equal(immersive.style, 'paper');
  assert.ok(immersive.variation.marks);
  assert.equal(immersive.variation.alternateTime, ordinary.variation.alternateTime);
  const exported = Presentation.create(canvas.ownerDocument.createElement('canvas'), song, () => 0,
    {scoreStyle: 'paper', presentationLayout: true, variation: selection});
  assert.ok(exported.draw(4).variation.marks);
  assert.equal(Presentation.variationSnapshot(selection, 'other'), null);
  const stale = Presentation.create(canvas.ownerDocument.createElement('canvas'), model('other'), () => 4,
    {scoreStyle: 'paper', presentationLayout: true, variation: selection});
  assert.equal(stale.draw().variation, undefined);
});

test('hiding subtitles retains the same lyric-aligned beat in listening and export', () => {
  const {Presentation, canvas} = renderer();
  const song = model('timed');
  const lyrics = {trackId:song.track.id, enabled:true, alignment:true, offset:0,
    lines:[{time:4,text:'第一句同步歌词'}, {time:5,text:'第二句同步歌词'}, {time:15,text:'第一句同步歌词'}, {time:16,text:'第二句同步歌词'}]};
  const view = Presentation.create(canvas, song, () => 4.5,
    {scoreStyle:'paper', presentationLayout:true, variationEnabled:true});
  view.setLyrics(lyrics);
  const visible = view.draw();
  assert.equal(visible.presentation.lyric, '第一句同步歌词');
  assert.equal(visible.variation.basis, 'lyric');
  assert.equal(visible.variation.alternateTime, 15.5);
  const captionsOff = {...lyrics, enabled:false};
  view.setLyrics(captionsOff);
  const hidden = view.draw();
  assert.equal(hidden.presentation.lyric, '');
  assert.equal(hidden.variation.alternateTime, visible.variation.alternateTime);
  const options = view.options();
  const exported = Presentation.create(canvas.ownerDocument.createElement('canvas'), song, () => 0, options);
  const saved = Presentation.lyricsSnapshot(captionsOff, song.track.id, Boolean(options.variation));
  exported.setLyrics(saved);
  const encoded = exported.draw(4.5);
  assert.equal(encoded.presentation.lyric, '');
  assert.equal(encoded.variation.alternateTime, visible.variation.alternateTime);
  exported.setLyrics({...captionsOff, hidden:true});
  assert.equal(exported.draw(4.5).variation.alternateTime, 14.5);
  assert.equal(Presentation.lyricsSnapshot({...captionsOff, hidden:true}, song.track.id, true).lines.length, 0);
  assert.equal(Presentation.lyricsSnapshot(captionsOff, 'stale', true).lines.length, 0);
  assert.equal(Presentation.lyricsSnapshot(captionsOff, song.track.id, false).lines.length, 0);
});

class Field extends EventTarget {
  constructor() { super(); this.fields = {}; }
  replaceChildren(...children) { this.children = children; }
  setAttribute(key, value) { this.fields[key] = value; }
  getAttribute(key) { return this.fields[key]; }
  change() { this.dispatchEvent(new Event('change')); }
  click() { if (!this.disabled) this.dispatchEvent(new Event('click')); }
}

test('A/B controls scope saved pairs to the track and rapid seeks preserve transport state', () => {
  const fields = new Map(), kept = new Map(), audio = new EventTarget();
  Object.assign(audio, {currentTime: 4.1, paused: true});
  const byId = id => fields.get(id) || (fields.set(id, new Field()), fields.get(id));
  const stage = {dataset: {effect: 'score'}};
  const ctx = vm.createContext({document: {getElementById: byId, createElement: () => ({}), documentElement:{lang:'en-US'}},
    localStorage: {getItem: key => kept.get(key), setItem: (key, value) => kept.set(key, value)}});
  scripts(['score-compare-controls.js'], ctx);
  const {Presentation, canvas} = renderer();
  let trackId = 'one', view = Presentation.create(canvas, model(trackId), () => audio.currentTime, {offsetSeconds:-.1});
  const seeks = [];
  const compare = ctx.XinScoreCompareControls.attach({audio, stage, getView: () => view, getTrackId: () => trackId,
    isLoading: () => false, seek: time => seeks.push(time), say: (key, fallback) => fallback});
  const toggle = byId('scoreVariationEnabled');
  byId('scoreStyle').value = 'starry';
  compare.refresh('starry');
  assert.ok(byId('scoreVariationControls').hidden);
  toggle.checked = true;
  toggle.change();
  assert.equal(byId('scoreVariationControls').hidden, false);
  const jump = byId('scoreVariationJump');
  jump.click();
  jump.click();
  assert.deepEqual(seeks.map(s => s.toFixed(1)), ['14.1','4.1']);
  assert.equal(audio.paused, true);
  audio.paused = false;
  jump.click();
  assert.equal(audio.paused, false);
  assert.equal(seeks.at(-1).toFixed(1), '14.1');
  byId('scoreVariationB').value = 'section-2-22000';
  byId('scoreVariationB').change();
  assert.equal(view.options().variation.bId, 'section-2-22000');
  toggle.checked = false;
  toggle.change();
  assert.equal(view.options().variation, null);
  toggle.checked = true;
  toggle.change();
  assert.equal(view.options().variation.bId, 'section-2-22000');
  trackId = 'other';
  view.setModel(model(trackId, 1));
  view.setOptions(compare.options(trackId, 'starry'));
  compare.refresh('starry');
  assert.equal(view.options().variation.bId, 'section-1-13000');
  trackId = 'single';
  view.setModel({...model(trackId), sections: [[0, 10, '主歌']]});
  view.setOptions(compare.options(trackId, 'starry'));
  compare.refresh('starry');
  assert.match(byId('scoreVariationStatus').textContent, /至少两段/);
  assert.equal(jump.disabled, true);
});
