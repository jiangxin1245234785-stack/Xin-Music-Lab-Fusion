'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {fullModel, mockCanvas} = require('./helpers.cjs');
const Presentation = require('../score-presentation.js');
require('../score-mist.js');
globalThis.XinScorePresentation = Presentation;
globalThis.XinScoreMood = {normalize: style => style === 'mist' ? style : 'starry'};

function targetCanvas(width, height, raster = {bakes: 0}) {
  const {canvas} = mockCanvas(width, height);
  // The existing core mock does not simulate blitting or allocating image data.
  const paint = canvas.getContext();
  paint.clearRect = () => {};
  paint.createImageData = (w, h) => ({data: new Uint8ClampedArray(w * h * 4)});
  paint.putImageData = () => { raster.bakes++; };
  canvas.ownerDocument = {createElement: () => targetCanvas(width, height, raster).canvas};
  return {canvas, raster};
}

function listening(model, width = 1280, height = 720) {
  const {canvas, raster} = targetCanvas(width, height);
  const view = Presentation.create(canvas, model, () => 11, {
    drumNotation: true, showContour: true, showTexture: true,
    mergeTimbres: true, simplify: false, offsetSeconds: -.125
  });
  return {canvas, view, raster};
}

function guitar(frame) {
  return frame.mist.lanes.filter(lane => lane.group === 'guitar');
}

test('mist keeps the regular core layout, needle, and offset in both presentations', () => {
  const model = fullModel();
  const {view, canvas} = listening(model);
  for (const [presentationLayout, width, height] of [[false,1280,720], [true,1920,1080], [false,470,830]]) {
    canvas.clientWidth = width;
    canvas.clientHeight = height;
    view.setOptions({scoreStyle: 'starry', presentationLayout});
    const starry = view.draw(11);
    view.setOptions({scoreStyle: 'mist'});
    const mist = view.draw(11);
    assert.equal(mist.style, 'mist');
    assert.equal(mist.time, 10.875);
    assert.deepEqual(mist.layout, starry.layout);
    const {width: w, needle, pixelsPerSecond: s} = mist.layout;
    assert.deepEqual(mist.window, [mist.time - needle / s, mist.time + (w - needle) / s]);
  }
});

test('a recorded stem can remain visible after its last note, with conserved split and hidden shares', () => {
  const model = fullModel();
  model.levels.groups.guitar.fill(-20);
  model.levels.groups.bass.fill(-100.7);
  const {view} = listening(model);
  view.setOptions({scoreStyle:'mist'});
  const held = view.draw(11), release = view.draw(13.125);
  assert.ok(held.mist.held > 0);
  assert.equal(guitar(release)[0].db, -20);
  assert.equal(guitar(release)[0].sounding, false);
  assert.ok(guitar(release)[0].amount > 0);
  assert.ok(guitar(release)[0].wisps > 0);
  assert.equal(release.mist.lanes.find(lane => lane.group === 'bass').amount, 0);
  assert.equal(release.mist.lanes.find(lane => lane.group === 'bass').wisps, 0);
  assert.equal(release.mist.lanes.find(lane => lane.group === 'bass').exposure, 0);
  assert.ok(Math.abs(release.mist.lanes.reduce((sum, lane) => sum + lane.share, 0) - 1) < 1e-12);

  view.setOptions({mergeTimbres:false});
  const split = guitar(view.draw(13.125));
  assert.equal(split.length, 2);
  assert.equal(split.reduce((sum, lane) => sum + lane.amount, 0), guitar(release)[0].amount);
  assert.equal(split.reduce((sum, lane) => sum + lane.share, 0), guitar(release)[0].share);
  view.setOptions({hidden:[model.lanes[2].id]});
  const hidden = guitar(view.draw(13.125));
  assert.equal(hidden.length, 1);
  assert.equal(hidden[0].amount, split[0].amount);
  view.setOptions({mergeTimbres:true});
  assert.equal(guitar(view.draw(13.125))[0].amount, hidden[0].amount);
  view.setOptions({focusGroup:'bass'});
  const solo = view.draw(13.125);
  assert.equal(solo.focus, 'bass');
  assert.equal(guitar(solo)[0].amount, hidden[0].amount * .12);
});

test('missing recording data leaves the score, measured vocal line and drum hits available', () => {
  const model = fullModel();
  model.lanes[0].contour = {start:10, hop:.01, midi:[60,60.1,null,60.4,60.7]};
  delete model.levels;
  const {view} = listening(model);
  view.setOptions({scoreStyle:'mist'});
  const frame = view.draw(10.145);
  assert.equal(frame.mist.leader, null);
  assert.deepEqual(frame.mist.lanes, []);
  assert.ok(frame.notes > 0);
  assert.ok(frame.hits > 0);
  assert.equal(frame.contour, 2);
  view.setOptions({showContour:false});
  assert.equal(view.draw(10.145).contour, 0);
});

test('mist emits from audible recording, keeps future MIDI clear and limits sustained packets', () => {
  const model = fullModel();
  const recording = model.levels.groups.guitar;
  recording.fill(-100.7);
  recording.fill(-11, 13, 40);
  const {view} = listening(model);
  view.setOptions({scoreStyle:'mist'});
  const before = view.draw(12);
  assert.equal(guitar(before)[0].wisps, 0);
  assert.ok(before.notes > 0, 'a future written note is visible ahead of measured sound');
  const fresh = guitar(view.draw(14.125))[0];
  assert.equal(fresh.sounding, false);
  assert.ok(fresh.wisps > 0);
  assert.ok(guitar(view.draw(24.125))[0].wisps <= 17);
  assert.equal(guitar(view.draw(44.125))[0].wisps, 0);
});

test('smoothed dB follows its source time and repeated seeks produce the same frame', () => {
  const model = fullModel();
  model.levels.groups.guitar[10] = -30;
  model.levels.groups.guitar[11] = -20;
  const {view, raster} = listening(model);
  view.setOptions({scoreStyle:'mist', presentationLayout:true});
  view.setCover({width:48, height:48});
  view.setLyrics({trackId:model.track.id, enabled:true, lines:[{time:26,text:'测试字幕'}]});
  assert.equal(guitar(view.draw(10.625))[0].db, -30);
  assert.equal(guitar(view.draw(11.125))[0].db, -25);
  assert.equal(guitar(view.draw(11.625))[0].db, -20);
  const first = view.draw(32);
  assert.equal(first.presentation.section, 'Verse 1');
  assert.equal(first.presentation.lyric, '测试字幕');
  assert.ok(first.presentation.coverSize > 0);
  const before = raster.bakes;
  view.draw(32.02);
  assert.ok(before > 0);
  assert.equal(raster.bakes, before);
  view.draw(59);
  assert.deepEqual(view.draw(32), first);
});

test('0.31.0: the fog bed runs along the whole timeline for each sounding stem; mistFog 0 leaves the mist as it was', () => {
  const ScoreView = require('../score-view.js');
  assert.equal(ScoreView.DEFAULTS.mistFog, .32);
  const {view} = listening(fullModel());
  view.setOptions({scoreStyle: 'mist'});
  const on = view.draw(11);
  assert.ok(on.mist.bed > 0, '有雾床');
  view.setOptions({scoreStyle: 'mist', mistFog: 0});
  assert.equal(view.draw(11).mist.bed, 0, 'mistFog 0：没有雾床');
  view.setOptions({mistFog: 2});
  assert.equal(view.options().mistFog, 0, '超出范围的值不收');
  view.setOptions({pressTint: .1}); assert.equal(view.options().pressTint, .1);
  view.setOptions({pressTint: .5}); assert.equal(view.options().pressTint, .1, 'pressTint 超出 0–0.3 不收');
});
