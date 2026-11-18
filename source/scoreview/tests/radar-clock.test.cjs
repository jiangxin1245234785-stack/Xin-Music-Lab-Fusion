'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const {runInNewContext} = require('node:vm');
const {mockCanvas, ScoreView, fullModel} = require('./helpers.cjs');
const Presentation = require('../score-presentation.js');

const source = readFileSync(join(__dirname, '../score-mood.js'), 'utf8');
const song = fullModel();
const options = {scoreStyle: 'glass', presentationLayout: true, mergeTimbres: true, offsetSeconds: 0};

function listener(model, width = 1280, height = 720, initial = options) {
  const output = mockCanvas(width, height), stage = mockCanvas();
  output.canvas.getContext().clearRect = () => {};
  let stages = 0;
  output.canvas.ownerDocument = {createElement: () => ++stages === 1 ? stage.canvas : mockCanvas().canvas};
  const globals = {
    URL, document: {currentScript: {src: 'https://test.invalid/score-mood.js'}},
    Image: class {decode() {return Promise.resolve();}}, XinScoreView: ScoreView, XinScorePresentation: Presentation
  };
  runInNewContext(source, globals);
  const view = globals.XinScoreMood.create(output.canvas, model, () => 0, initial);
  const frame = at => JSON.parse(JSON.stringify(view.draw(at)));
  return {view, frame, stage, canvas: output.canvas};
}

test('the phosphor uses absolute beat age and expires at one turn across an irregular-tempo wrap', () => {
  const beats = Array.from({length: 100}, (_, i) => i * .4 + i * i * .006);
  const at = b => {
    const i = Math.floor(b);
    return beats[i] + (b - i) * (beats[i + 1] - beats[i]);
  };
  const model = {...song, track: {...song.track, duration: beats.at(-1)}, bars: {bpm: 120, beats},
    lanes: [{id: 'g', kind: 'pitched', group: 'guitar', notes: [[at(31.75), .1, 60, 116]]}]};
  const {view, frame, stage, canvas} = listener(model);
  const before = frame(at(31.7)).motion;
  assert.equal(before.echoes, 0);
  assert.equal(before.previews, 1);
  const near = frame(at(31.99)).motion;
  const wrapped = frame(at(32.01)).motion;
  assert.ok(near.angle > 359 && wrapped.angle < 1);
  assert.ok(near.afterglow > wrapped.afterglow && wrapped.afterglow > .65);
  for (const b of [33, 38, 41, 59, 63.74]) {
    const old = frame(at(b)).motion;
    assert.equal(old.echoes, 1);
    assert.ok(old.afterglow > 0 && old.afterglow < wrapped.afterglow);
  }
  assert.equal(frame(at(63.75)).motion.afterglow, 0);
  assert.equal(frame(at(63.75)).motion.echoes, 0);
  assert.deepEqual(frame(at(32.01)).motion, wrapped);
  stage.reset();
  frame(at(32.01));
  const paused = JSON.stringify(stage.calls);
  stage.reset();
  frame(at(32.01));
  assert.equal(JSON.stringify(stage.calls), paused);

  const targetBeat = 33.25, a = -Math.PI / 2 + targetBeat / 32 * Math.PI * 2;
  const scale = canvas.clientHeight / 1080;
  const hit = view.hit((wrapped.cx + wrapped.radius * .72 * Math.cos(a)) * scale,
    (wrapped.cy + wrapped.radius * .72 * Math.sin(a)) * scale);
  assert.ok(Math.abs(hit.time - at(targetBeat)) < 1e-8);
});

test('a sustained pitch is painted progressively across turn zero and returns to the same state on seek', () => {
  const model = {...song, bars: {bpm: 120}, lanes: [
    {id: 'p', label: '钢琴', kind: 'pitched', group: 'keys', notes: [[15.75, 1.12, 66, 100]]}
  ]};
  const {frame, stage} = listener(model);
  const previous = frame(15.99).motion;
  const wrapped = frame(16.01).motion;
  assert.ok(previous.angle > 359 && wrapped.angle < 1);
  assert.ok(previous.echoes > 0 && wrapped.echoes >= previous.echoes);
  const visibleArcs = stage.calls.filter(c => c.name === 'arc' && typeof c.strokeStyle === 'string' && c.strokeStyle.startsWith('rgba(128,227,104,'));
  // Confirm both sides of the accounting boundary are still drawn at a common radius.
  assert.ok(visibleArcs.some(c => c.args[3] < Math.PI * 1.5 && c.args[4] <= Math.PI * 1.5 + .001));
  assert.ok(visibleArcs.some(c => c.args[3] >= Math.PI * 1.5 && c.args[4] > Math.PI * 1.5));
  frame(50);
  assert.deepEqual(frame(16.01).motion, wrapped);
});

test('record plaque, CRT, lyric window and instruments fit desktop and portrait canvases, with honest fallbacks', () => {
  const lyric = '夜里每一段未听清的旋律都落回窗边，与很轻很轻的鼓声一道熄灭';
  const model = {...song, bars: {bpm: 100}, energy: null};
  const {frame, view, stage, canvas} = listener(model);
  view.setLyrics({trackId: song.track.id, enabled: true, lines: [{time: 22, text: lyric}]});
  for (const [width, height] of [[1800, 700], [1120, 1080], [1119, 1080], [640, 900], [360, 900], [280, 980]]) {
    canvas.clientWidth = width;canvas.clientHeight = height;
    stage.reset();
    const rendered = frame(25);
    const {cx, cy, radius, layout, trace, density, visibleRoutes} = rendered.motion;
    const {crt, plate, transmission, gauge, routes} = layout;
    assert.equal(rendered.presentation.lyric, lyric);
    assert.equal(rendered.beatSource, 'seconds');
    assert.equal(trace.source, 'missing');
    assert.equal(trace.samples, 0);
    assert.equal(trace.floor, null);
    assert.equal(density.beats, 4);
    assert.equal(visibleRoutes, 4);
    assert.ok(cx-radius-17 >= crt.x && cx+radius+17 <= crt.x+crt.w);
    assert.ok(cy-radius-17 > crt.y && cy+radius+17 < crt.y+crt.h);
    for (const {x,y,w,h} of [crt,plate,transmission,layout.trace,gauge,routes]) {
      assert.ok(x>=0 && y>=0 && w>0 && h>0 && x+w<=rendered.viewport.width && y+h<=rendered.viewport.height);
    }
    const areas = [crt,plate,transmission,layout.trace,gauge,routes];
    for (const [i,a] of areas.entries()) {
      for (const b of areas.slice(i+1)) assert.ok(a.x+a.w<=b.x || b.x+b.w<=a.x || a.y+a.h<=b.y || b.y+b.h<=a.y);
    }
    assert.ok(stage.texts().some(c => c.text === '暂无测量'));
    assert.ok(stage.texts().some(c => c.text === '估算拍位'));
  }
  view.setOptions({...options, presentationLayout: false, albumLayout: true});
  const ordinary = frame(25);
  assert.equal(ordinary.motion.layout.plate, null);
  assert.equal(ordinary.motion.layout.transmission, null);
  assert.equal(ordinary.presentation.lyric, '');
});

test('the trace samples only measured dB values and the meter counts canonical non-vocal attacks in four beats', () => {
  const model = {...song, energy: {hop: .5, db: Float32Array.from([-21, -20, -17, -15, -14, -16])},
    bars: {bpm: 120},
    lanes: [
      {id: 'p', kind: 'pitched', group: 'keys', notes:[[.3,.1,60,90],[.5,.1,64,90],[2.5,.1,60,90]]},
      {id: 'v', kind: 'melody', group: 'vocals', notes:[[1,.5,60,110]]},
      {id: 'd', kind:'drums', group:'drums', rows:['kick'], hits:[[2.4,0,100]]}
    ]};
  const {frame, view, stage} = listener(model);
  const {trace, density} = frame(2.5).motion;
  assert.equal(trace.source, 'model.energy.db');
  assert.ok(trace.samples > 3);
  assert.equal(trace.floor, -21);
  assert.equal(trace.ceiling, -9);
  assert.equal(trace.current, -16);
  assert.equal(density.count, 3);
  assert.ok(stage.calls.some(c => c.name === 'fill' && c.fillStyle === '#f4c686'));
  view.setModel({...model, energy: {hop: .5, db: [null, null]}});
  assert.equal(frame(2.5).motion.trace.source, 'missing');
  assert.equal(frame(2.5).motion.density.count, 3);
});

test('hiding every track clears the rings and track lamps while the mix measurement remains available', () => {
  const {frame, view, stage} = listener(song);
  assert.ok(frame(.2).motion.visibleRoutes > 0);
  view.setOptions({...options, hidden: song.lanes.map(lane => lane.id)});
  stage.reset();
  const {echoes, previews, lamps, visibleRoutes, trace} = frame(.2).motion;
  assert.equal(echoes, 0);
  assert.equal(previews, 0);
  assert.deepEqual(lamps, []);
  assert.equal(visibleRoutes, 0);
  assert.equal(trace.source, 'model.energy.db');
  assert.ok(stage.texts().some(c => c.text === '无可见轨道'));
});

test('the physical chassis is reused on a new frame and refreshed on resize and track changes', () => {
  const {frame, view, stage, canvas} = listener(song);
  const hasMetalGrain=()=>stage.calls.some(call=>call.name==='fill'&&call.fillStyle==='rgba(4,8,4,.15)');
  frame(10);
  assert.ok(hasMetalGrain());
  stage.reset();
  frame(11);
  assert.ok(!hasMetalGrain());
  assert.ok(stage.calls.some(call=>call.name==='drawImage'));
  canvas.clientWidth=1000;
  stage.reset();
  frame(10);
  assert.ok(hasMetalGrain());
  view.setOptions({...options,hidden:['bass']});
  stage.reset();
  frame(10);
  assert.ok(hasMetalGrain());
});

