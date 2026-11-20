'use strict';
// SPEC-TELEPRINTER (work/score-depth-20261118/SPEC-TELEPRINTER.md): the tape steps past a fixed print point. A cell is
// struck at the print point at its time, then the tape steps left by that cell's width in 40 ms (or 80 % of a shorter
// gap) and stands still until the next strike. Lyrics and the track sheet follow the same rules.
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
const lanes = [{id: 'g', kind: 'pitched', group: 'guitar', notes: [[1, 4, 60, 100]]}];
function post(model, initial = options) {
  const output = mockCanvas(1440, 900), stage = mockCanvas();
  output.canvas.getContext().clearRect = () => {};
  let n = 0;
  output.canvas.ownerDocument = {createElement: () => ++n === 1 ? stage.canvas : mockCanvas().canvas};
  const globals = {URL, document: {currentScript: {src: 'https://test.invalid/score-mood.js'}},
    Image: class {decode() {return Promise.resolve();}}, XinScoreView: ScoreView, XinScorePresentation: Presentation,
    XinScoreRadar: Radar, XinScoreTelegraph: Telegraph};
  runInNewContext(mood, globals);
  const view = globals.XinScoreMood.create(output.canvas, model, () => 0, initial);
  const frame = at => JSON.parse(JSON.stringify(view.draw(at)));
  return {frame, stage, view};
}
const steady = (duration, extra = {}) => ({...song, track: {...song.track, duration}, lanes, ...extra});
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-3, `${what}: ${a} vs ${b}`);   // out rounds to .001

// A long line with the next one a second later is printed fast: 100 characters in about 1.07 s, 11 ms a strike (under
// the 40 ms step).
const LINES = [{time: 10, text: 'Ground Control to Major Tom'}, {time: 14, text: '七里香 窗外'}, {time: 15, text: 'x'.repeat(100)}, {time: 16, text: 'end'}];

test('lyrics: the tape stands between steps, each strike feeds exactly that cell, steps never overlap', () => {
  const {frame, view} = post(steady(30));
  view.setLyrics({trackId: song.track.id, enabled: true, offset: 0, lines: LINES});
  const {cells} = Radar.create().tape({lyrics: {enabled: true, offset: 0, lines: LINES}, options: {}});
  assert.ok(cells.some((c, i) => cells[i + 1] && cells[i + 1].time - c.time < .04), 'the test has gaps under 40 ms');
  let fedBefore = 0;
  cells.forEach((c, i) => {
    const next = cells[i + 1];
    // At the strike: the tape has not moved since the last step ended; the new cell is at the print point.
    const at = frame(c.time).motion.teleprinter;
    near(at.fed, c.u, `fed at the strike of ${i}`);
    near(at.fed, fedBefore, `no move between steps before ${i}`);
    assert.equal(at.printed, i + 1);
    // The step: 40 ms, or 80 % of a shorter gap; done before the next strike; then exactly one cell further.
    near(c.stepDur, Math.min(.04, next ? .8 * (next.time - c.time) : Infinity), 'step time');
    const done = frame(c.time + c.stepDur).motion.teleprinter;
    near(done.fed, c.u + c.width, `one cell after strike ${i}`);
    assert.equal(done.stepping, false);
    if (next) {
      assert.ok(c.time + c.stepDur < next.time, 'steps never overlap');
      const still = frame((c.time + c.stepDur + next.time) / 2).motion.teleprinter;
      near(still.fed, done.fed, 'standing still until the next strike');
    }
    fedBefore = c.u + c.width;
  });
});

test('nothing before its time: a character is nowhere on the tape 1 ms before its strike, and at the print point at it', () => {
  const {frame, stage, view} = post(steady(30));
  view.setLyrics({trackId: song.track.id, enabled: true, offset: 0, lines: LINES});
  const {cells} = Radar.create().tape({lyrics: {enabled: true, offset: 0, lines: LINES}, options: {}});
  const target = cells.find(c => c.ch === 'M'), at = cells.indexOf(target);
  // Everything before 'M' is struck already; the M is the only M in the line.
  stage.reset(); const m0 = frame(target.time - .001).motion.teleprinter;
  assert.ok(!stage.texts().some(s => s.text === 'M'), 'not yet on the tape');
  assert.equal(m0.printed, at);
  stage.reset(); const m1 = frame(target.time).motion.teleprinter;
  const struck = stage.texts().find(s => s.text === 'M');
  assert.ok(struck, 'struck at its time');
  near(struck.x, m1.head + target.width / 2, 'at the print point');
  // Right of the print point the tape is blank.
  assert.ok(!stage.texts().some(s => s.x > m1.head + 41 && s.y > 800 && s.y < 870), 'nothing right of the print point');
  // The reel turns only with the paper; the lamp blinks at the strike and is dark 60 ms later.
  near(m1.reel, m1.fed / 22, 'reel angle = paper fed / radius');
  assert.equal(m1.strikeAge, 0);
  const later = frame(target.time + target.stepDur + .001).motion.teleprinter;
  assert.ok(later.strikeAge > .001);
});

test('a code and its character strike as one cell; the same moment draws the same frame however it was reached', () => {
  const {frame, stage, view} = post(steady(30));
  view.setLyrics({trackId: song.track.id, enabled: true, offset: 0, lines: LINES});
  const {cells} = Radar.create().tape({lyrics: {enabled: true, offset: 0, lines: LINES}, options: {}});
  const qi = cells.find(c => c.ch === '七');
  stage.reset(); frame(qi.time);
  const code = stage.texts().find(s => s.text === Telegraph.code('七')), clear = stage.texts().find(s => s.text === '七');
  assert.ok(code && clear, 'both rows at the strike');
  near(code.x, clear.x, 'one cell');
  assert.equal(qi.width, 40, 'the wider row (the character) sets the cell');
  for (const t of [10.37, 14.2, 15.31]) {
    frame(t + 3); stage.reset(); frame(t); const a = JSON.stringify(stage.calls);
    frame(t - 2); stage.reset(); frame(t); assert.equal(JSON.stringify(stage.calls), a, 'same frame at ' + t);
  }
});

test('the track sheet (no lyrics) steps by the same rules', () => {
  const model = steady(64, {track: {...song.track, title: 'Space Oddity', artist: 'David Bowie', album: '七里香', duration: 64}});
  const {frame} = post(model);
  const {cells} = Radar.create().sheet({model});
  assert.ok(cells.length > 20);
  let fed = 0;
  cells.forEach((c, i) => {
    const at = frame(c.time).motion.teleprinter;
    assert.equal(at.mode, 'sheet');
    near(at.fed, fed, `sheet: still before strike ${i}`);
    near(at.fed, c.u, 'sheet: cell at the print point');
    const done = frame(c.time + c.stepDur).motion.teleprinter;
    near(done.fed, c.u + c.width, `sheet: one cell after strike ${i}`);
    fed = c.u + c.width;
  });
  // Name letters ride over the value characters: TITLE over Space Oddity, one strike a cell.
  const title = cells.filter(c => c.field && c.field.name === 'TITLE' && !c.dot);
  assert.equal(title.map(c => c.name).join(''), 'TITLE');
  assert.equal(title.map(c => c.ch).join(''), 'Space Oddity');
});

test('the title row never shows an ellipsis: smaller, then the title alone, then cut', () => {
  const long = post(steady(64, {track: {...song.track, title: 'Ground Control to Major Tom, Take Your Protein Pills', artist: 'David Bowie and the Spiders From Mars', duration: 64}})).frame(5).motion;
  assert.ok(!long.teleTitle.includes('…'));
  assert.ok(long.teleTitleSize >= 11 && long.teleTitleSize <= 15);
  const short = post(steady(64, {track: {...song.track, title: 'Space Oddity', artist: 'David Bowie', duration: 64}})).frame(5).motion;
  assert.equal(short.teleTitle, 'Space Oddity · David Bowie');
  assert.equal(short.teleTitleSize, 15);
});
