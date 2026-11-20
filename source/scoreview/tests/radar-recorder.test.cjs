'use strict';
// SPEC-RECORDER (work/score-depth-20261118/SPEC-RECORDER.md): the radar's loudness recorder as a flat-bed X-Y recorder.
// The last pass in pencil (whole trace, section marks, a corner note) is still and lives in the base layer; this pass's
// ink runs only to now; a metal bridge stands where the pen line was, its carriage's nib on the trace's end.
const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const {runInNewContext} = require('node:vm');
const {mockCanvas, ScoreView, fullModel} = require('./helpers.cjs');
const Presentation = require('../score-presentation.js');
const Radar = require('../score-radar.js');
const Telegraph = require('../score-telegraph.js');

const mood = readFileSync(join(__dirname, '../score-mood.js'), 'utf8');
const song = fullModel();
const options = {scoreStyle: 'glass', presentationLayout: true, mergeTimbres: true, offsetSeconds: 0};

function post(model) {
  const output = mockCanvas(1440, 900), stage = mockCanvas(), made = [];
  output.canvas.getContext().clearRect = () => {};
  let n = 0;
  output.canvas.ownerDocument = {createElement: () => ++n === 1 ? stage.canvas : mockCanvas().canvas};
  stage.canvas.getContext().canvas = stage.canvas;
  stage.canvas.ownerDocument = {createElement: () => { const layer = mockCanvas(); made.push(layer); return layer.canvas; }};
  const globals = {URL, document: {currentScript: {src: 'https://test.invalid/score-mood.js'}},
    Image: class {decode() {return Promise.resolve();}}, XinScoreView: ScoreView, XinScorePresentation: Presentation,
    XinScoreRadar: Radar, XinScoreTelegraph: Telegraph};
  runInNewContext(mood, globals);
  const view = globals.XinScoreMood.create(output.canvas, model, () => 0, options);
  const frame = at => JSON.parse(JSON.stringify(view.draw(at)));
  return {frame, stage, made};
}
// 64 s at 120 bpm; loudness -18 dB for the first 32 s, -30 dB after; sections at 0 and 32 s.
function model() {
  const lanes = [{id: 'g', kind: 'pitched', group: 'guitar', notes: [[1, 60, 60, 100]]}];
  const beats = Array.from({length: 129}, (_, i) => i / 2), downbeats = beats.filter((_, i) => i % 4 === 0);
  return {...song, track: {...song.track, duration: 64}, bars: {bpm: 120, beatsPerBar: 4, beats, downbeats, steady: true}, lanes,
    energy: {hop: .1, db: Array.from({length: 640}, (_, i) => i < 320 ? -18 : -30)},
    sections: [[0, 32, '主歌 1', 'songformer', 'verse'], [32, 64, '副歌 1', 'songformer', 'chorus']]};
}
const yOf = (box, db) => box.y + 6 + (0 - Math.max(-42, Math.min(0, db))) / 42 * (box.height - 12);

test('the bridge stands at now on the sheet; the nib at now\'s loudness; the ink runs only to now', () => {
  const {frame, stage} = post(model());
  for (const t of [8, 20, 40, 50]) {
    stage.reset();
    const m = frame(t).motion, box = m.recorderBox, r = m.recorder;
    const x = box.x + 4 + t / 64 * (box.width - 8);
    assert.ok(Math.abs(r.bridgeX - x) < .01, `bridge at ${t}: ${r.bridgeX} vs ${x}`);
    assert.ok(Math.abs(r.nibY - yOf(box, t < 32 ? -18 : -30)) < .01, `nib at ${t}: ${r.nibY}`);
    assert.equal(r.inkTo, r.bridgeX);
    // The ink's clip: from the sheet's left edge to the bridge, never past it.
    const clips = stage.calls.filter(c => c.name === 'rect' && c.args[1] === box.y && c.args[3] === box.height);
    assert.ok(clips.length >= 1);
    for (const c of clips) assert.ok(c.args[0] + c.args[2] <= r.bridgeX + .01, 'ink past now');
    assert.ok(clips.some(c => c.args[0] === box.x && Math.abs(c.args[0] + c.args[2] - r.bridgeX) < .01), 'dry ink from the left edge to now (bridgeX is rounded to .01)');
    // Not red, not a glow: no stroke or fill in the old pen red this frame.
    assert.ok(!stage.calls.some(c => c.strokeStyle === '#b3362b' || c.fillStyle === '#b3362b'));
  }
});

test('silence or no loudness: the carriage rests at the bottom', () => {
  const quiet = {...model(), energy: {hop: .1, db: Array(640).fill(-120)}};
  const m = post(quiet).frame(20).motion;
  assert.ok(Math.abs(m.recorder.nibY - yOf(m.recorderBox, -42)) < .01);
  const none = {...model()}; delete none.energy;
  const n = post(none).frame(20).motion;
  assert.equal(n.recorder.trace, false);
  assert.equal(n.recorder.floor, true);
  assert.equal(n.recorder.nibY, n.recorderBox.y + n.recorderBox.height - 6);
});

test('the pencil pass: the whole trace (one point a column, edge to edge), the section marks and the note, there at 0 s, drawn once', () => {
  const {frame, stage, made} = post(model());
  const m = frame(0).motion, box = m.recorderBox;
  assert.deepEqual(m.recorderTrace, {points: box.width - 8 + 1, from: box.x + 4, to: box.x + box.width - 4});
  assert.deepEqual(m.recorderMarks, {lines: 2, names: ['VRS', 'CHO']});
  assert.ok(m.recorderNote && m.recorderNote.corner, 'REF · PREV. PASS placed');
  const base = made[0];
  assert.ok(base.calls.some(c => c.name === 'fillText' && c.args[0] === 'VRS' && /Permanent Marker/.test(c.font)), 'pencil section name, in the base layer');
  assert.ok(base.calls.some(c => c.name === 'fillText' && c.args[0] === 'REF · PREV. PASS'));
  // Graphite, not faded ink: every pencil stroke is the graphite rgb.
  const pencil = base.calls.filter(c => c.name === 'stroke' && /^rgba\(88,87,82,/.test(String(c.strokeStyle)));
  assert.ok(pencil.length > box.width, 'trace and fuzz segments, section lines');
  // Nothing of the pencil pass in the moving part, at any moment.
  for (const t of [0, 30, 63]) {
    stage.reset(); frame(t);
    assert.ok(!stage.calls.some(c => c.name === 'fillText' && (c.args[0] === 'VRS' || c.args[0] === 'REF · PREV. PASS')));
    assert.ok(!stage.calls.some(c => /^rgba\(88,87,82,/.test(String(c.strokeStyle))));
  }
  const baseCalls = base.calls.length;
  frame(40); frame(5);
  assert.equal(base.calls.length, baseCalls, 'the base layer is not drawn again');
});

test('the same moment draws the same frame, however it was reached', () => {
  const {frame, stage} = post(model());
  frame(50); stage.reset(); frame(21.37);
  const first = JSON.stringify(stage.calls);
  frame(3); stage.reset(); frame(21.37);
  assert.equal(JSON.stringify(stage.calls), first);
  assert.deepEqual(frame(21.37).motion.recorder, frame(21.37).motion.recorder);
});

test('fresh ink: the last 12 design units behind the nib, darker and wider toward it (host\'s correction of 1.5 s)', () => {
  const {frame, stage} = post(model());
  stage.reset();
  const m = frame(30).motion, box = m.recorderBox, pen = m.recorder.bridgeX;
  const clips = stage.calls.filter(c => c.name === 'rect' && c.args[1] === box.y && c.args[3] === box.height && c.args[0] > box.x);
  assert.equal(clips.length, 4, 'four bands');
  assert.ok(Math.abs(clips[0].args[0] - (pen - 12)) < .01, 'from 12 units behind the nib');
  assert.ok(Math.abs(clips[3].args[0] + clips[3].args[2] - pen) < .01, 'to the nib');
  // The four band strokes (rgb() from the ink mix): widths 1.8, 2.0, 2.2, 2.4, darker each time.
  const bands = stage.calls.filter(c => c.name === 'stroke' && /^rgb\(/.test(String(c.strokeStyle)) && c.lineWidth > 1.6);
  assert.deepEqual(bands.map(c => +c.lineWidth.toFixed(6)), [1.8, 2, 2.2, 2.4], 'widths step up to the nib');
  const lum = s => s.match(/\d+/g).slice(0, 3).reduce((a, v) => a + +v, 0);
  assert.ok(bands.every((c, i) => !i || lum(c.strokeStyle) < lum(bands[i - 1].strokeStyle)), 'darker toward the nib');
  // Near the sheet's left edge the run is shorter, never left of the trace.
  stage.reset();
  const early = frame(.2).motion;
  const first = stage.calls.filter(c => c.name === 'rect' && c.args[1] === box.y && c.args[3] === box.height && c.args[0] > box.x);
  assert.ok(first.every(c => c.args[0] >= box.x + 4 - 1e-9), 'starts at the trace');
  assert.ok(early.recorder.bridgeX - (box.x + 4) < 12);
});
