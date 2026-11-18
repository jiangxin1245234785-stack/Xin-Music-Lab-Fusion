'use strict';
// The radar look as the echo post (0.32.0, work/score-depth-20261118/SPEC-RADAR.md): every reading is a function of
// song time on the song's data; levers report where they are and are the channels' solo; the telegraph codes are
// Unihan's.
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

function post(model, width = 1440, height = 900, initial = options) {
  const output = mockCanvas(width, height), stage = mockCanvas();
  output.canvas.getContext().clearRect = () => {};
  let stages = 0;
  output.canvas.ownerDocument = {createElement: () => ++stages === 1 ? stage.canvas : mockCanvas().canvas};
  const globals = {URL, document: {currentScript: {src: 'https://test.invalid/score-mood.js'}},
    Image: class {decode() {return Promise.resolve();}}, XinScoreView: ScoreView, XinScorePresentation: Presentation,
    XinScoreRadar: Radar, XinScoreTelegraph: Telegraph};
  runInNewContext(mood, globals);
  const view = globals.XinScoreMood.create(output.canvas, model, () => 0, initial);
  const frame = at => JSON.parse(JSON.stringify(view.draw(at)));
  return {view, frame, stage, canvas: output.canvas};
}
// A steady 4/4 song at 120 bpm: a bar is 2 s, a turn of the disc (four bars) 8 s.
function steady(lanes, duration = 64, extra = {}) {
  const beats = Array.from({length: duration * 2 + 1}, (_, i) => i / 2), downbeats = beats.filter((_, i) => i % 4 === 0);
  return {...song, track: {...song.track, duration}, bars: {bpm: 120, beatsPerBar: 4, beats, downbeats, steady: true}, lanes, ...extra};
}

test('one turn is four bars, 12 o\'clock on every fourth bar line; an echo fades within a turn; a paused frame repeats', () => {
  const model = steady([{id: 'g', kind: 'pitched', group: 'guitar', notes: [[8.5, .1, 60, 100]]}]);
  const {frame, stage} = post(model);
  assert.equal(frame(8).motion.angle, 0);
  assert.equal(frame(10).motion.angle, 90);
  assert.equal(frame(8.6).motion.echoes, 1);
  assert.equal(frame(16.4).motion.echoes, 1, 'still glowing just under a turn later');
  assert.equal(frame(16.6).motion.echoes, 0, 'gone after one turn');
  assert.equal(frame(9.1).motion.barBeat, '005·3');
  assert.equal(frame(9.1).motion.tempo, '120');
  const a = frame(12.34);
  frame(40); stage.reset(); frame(12.34);
  const first = JSON.stringify(stage.calls);
  stage.reset(); frame(12.34);
  assert.equal(JSON.stringify(stage.calls), first, 'the same moment draws the same frame however it was reached');
  assert.deepEqual(frame(12.34).motion, a.motion);
});

test('without downbeats BAR · BEAT reads ---·-; without beats TEMPO reads --- and a turn takes eight seconds', () => {
  const lanes = [{id: 'g', kind: 'pitched', group: 'guitar', notes: [[1, .1, 60, 100]]}];
  const loose = post({...song, track: {...song.track, duration: 30}, bars: {bpm: 100}, lanes}).frame(4).motion;
  assert.equal(loose.barBeat, '---·-');
  assert.equal(loose.tempo, '---');
  assert.equal(loose.angle, 180);
});

test('levers: each channel reports its place; a click is that channel\'s solo; a channel the song lacks is down and not clickable', () => {
  const model = steady([{id: 'g', kind: 'pitched', group: 'guitar', notes: [[1, 4, 60, 100]]},
    {id: 'b', kind: 'pitched', group: 'bass', notes: [[1, 4, 40, 100]]}]);
  const {frame, view, canvas} = post(model);
  const shown = frame(2).motion;
  assert.equal(shown.levers.length, 7);
  const lever = id => shown.levers.find(l => l.channel === id);
  assert.equal(lever('guitar').up, true);
  assert.equal(lever('vocals').up, false);
  assert.equal(lever('vocals').clickable, false);
  const unit = canvas.clientHeight / 1080, at = l => [(shown.origin[0] + (l.x + l.width / 2) * shown.scale) * unit, (shown.origin[1] + (l.y + l.height / 2) * shown.scale) * unit];
  assert.deepEqual(view.hit(...at(lever('guitar'))), {kind: 'lane', group: 'guitar', label: 'GUITAR'});
  assert.equal(view.hit(...at(lever('vocals'))), null);
  // Soloed: the others go down, their lamps out, their needles to rest.
  view.setOptions({...options, focusGroup: 'guitar'});
  const solo = frame(2).motion;
  assert.equal(solo.solo, 'guitar');
  assert.equal(solo.levers.find(l => l.channel === 'bass').up, false);
  assert.equal(solo.levers.find(l => l.channel === 'guitar').up, true);
  assert.equal(solo.meters.bass, 0);
});

test('chord quality lamps cover every suffix the library holds; sections light their kind', () => {
  const lamps = label => [...(Radar.chordParts(label)?.lamps || [])].sort().join(' ');
  assert.equal(lamps('C'), 'MAJ');
  assert.equal(lamps('Am'), 'MIN');
  assert.equal(lamps('Dm7'), '7 MIN');
  assert.equal(lamps('Fmaj7'), 'M7 MAJ');
  assert.equal(lamps('G7'), '7 MAJ');
  assert.equal(lamps('Gsus4'), 'SUS4');
  assert.equal(lamps('Gsus2'), 'SUS2');
  assert.equal(lamps('A6'), '6 MAJ');
  assert.equal(lamps('Am6'), '6 MIN');
  assert.equal(lamps('Caug'), 'AUG');
  assert.equal(lamps('Bdim'), 'DIM');
  assert.equal(lamps('Bm7b5'), '7 DIM MIN');
  assert.equal(lamps('Bdim7'), '7 DIM');
  assert.equal(lamps('C/E'), 'INV MAJ');
  assert.equal(Radar.chordParts('N'), null);
  assert.equal(Radar.chordParts('Eb').pc, 3);
  assert.equal(Radar.sectionKind([0, 1, '副歌 1', 'songformer', 'chorus']), 'CHORUS');
  assert.equal(Radar.sectionKind([0, 1, '导歌', 'songformer', 'pre-chorus']), 'PRE');
  assert.equal(Radar.sectionKind([0, 1, '间奏', 'songformer', 'inst']), 'INST');
  assert.equal(Radar.sectionKind([0, 1, 'silence', 'songformer', 'silence']), null);
  const model = steady([{id: 'g', kind: 'pitched', group: 'guitar', notes: [[1, 4, 60, 100]]}], 64,
    {sections: [[0, 10, '主歌 1', 'songformer', 'verse'], [10, 20, '副歌 1', 'songformer', 'chorus']], chords: [[0, 5, 'Am7'], [5, 10, 'N']]});
  const {frame} = post(model);
  const verse = frame(4).motion;
  assert.equal(verse.section.lamps.VERSE, 1);
  assert.equal(verse.section.lamps.CHORUS, 0);
  assert.deepEqual(verse.chord.quality.sort(), ['7', 'MIN']);
  assert.equal(verse.chord.name, 'Am7');
  assert.equal(frame(7).motion.chord.name, null, 'N: the flip reads --');
  assert.ok(frame(7).motion.chord.fifths[3] > 0, 'the A just left still glows');
  const turning = frame(10.1).motion.section.lamps;
  assert.ok(turning.CHORUS > 0 && turning.CHORUS < 1 && turning.VERSE > 0 && turning.VERSE < 1, 'old lamp dims while the new one rises');
});

test('caution lamps: HOLD on a long note, SILENCE in a gap, TUTTI when every channel sounds; all dark at 0 s', () => {
  const model = steady([
    {id: 'g', kind: 'pitched', group: 'guitar', notes: [[2, 6, 60, 100], [14, 4, 60, 100]]},
    {id: 'b', kind: 'pitched', group: 'bass', notes: [[2, 2, 40, 100], [14, 4, 40, 100]]},
    {id: 'p', kind: 'pitched', group: 'piano', notes: [[2, 2, 64, 100], [14, 4, 64, 100]]}]);
  const {frame} = post(model);
  assert.ok(Object.values(frame(0).motion.caution).every(v => v === 0));
  assert.equal(frame(7).motion.caution.HOLD, 1);
  assert.equal(frame(3).motion.caution.TUTTI, 1);
  assert.equal(frame(6).motion.caution.SOLO, 1);
  assert.equal(frame(11).motion.caution.SILENCE, 1);
  assert.equal(frame(11).motion.caution.SPARE, 0);
});

test('PAN reads the whole song\'s left minus right; without it the horizon stays level', () => {
  const lanes = [{id: 'g', kind: 'pitched', group: 'guitar', notes: [[1, 4, 60, 100]]}];
  assert.equal(post(steady(lanes)).frame(3).motion.pan, null);
  const levels = {hop: 1, groups: {guitar: Array(64).fill(-20)}, pan: {hop: 1, groups: {}, mix: Array(64).fill(6)}};
  assert.equal(post(steady(lanes, 64, {levels})).frame(3).motion.pan, 6);
});

test('the teleprinter prints codes first and characters half a step later; the codes are Unihan\'s', () => {
  assert.equal(Telegraph.code('七'), '0003');
  assert.equal(Telegraph.code('里'), '6849');
  assert.equal(Telegraph.code('香'), '7449');
  assert.equal(Telegraph.code('A'), null);
  assert.ok(Telegraph.size > 10000 && /^\d+\.\d+\.\d+$/.test(Telegraph.unicode));
  const model = steady([{id: 'g', kind: 'pitched', group: 'guitar', notes: [[1, 4, 60, 100]]}]);
  const {frame, view} = post(model);
  view.setLyrics({trackId: song.track.id, enabled: true, offset: 0, lines: [{time: 10, text: '七里香'}, {time: 20, text: 'la'}]});
  assert.equal(frame(9).motion.teleprinter.newest.length, 0, 'nothing before the line');
  // The line runs 10 .. 11.5 (three characters, at least 1.2 s): 七 at 10, 里 at 10.5, 香 at 11.
  const half = frame(10.6).motion.teleprinter;
  assert.deepEqual(half.newest.map(g => [g.ch, g.code, g.clear]), [['里', '6849', false], ['七', '0003', true]]);
  assert.equal(half.printing, true);
  const done = frame(15).motion.teleprinter;
  assert.equal(done.printing, false);
  assert.deepEqual(done.newest.map(g => g.ch), ['香', '里', '七']);
  const latin = frame(21).motion.teleprinter.newest[0];
  assert.deepEqual([latin.ch, latin.code, latin.clear], ['a', null, true]);
});

test('a song without vocals or lyrics: the scope is a flat line, the tape empty, every other instrument reads', () => {
  const model = steady([{id: 'g', kind: 'pitched', group: 'guitar', notes: [[1, 4, 60, 100]]},
    {id: 'd', kind: 'drums', group: 'drums', rows: ['kick', 'snare'], hits: [[2, 0, 100], [2.5, 1, 100]]}], 64,
    {energy: {hop: .1, db: Array(640).fill(-20)}, levels: {hop: 1, groups: {guitar: Array(64).fill(-15), drums: Array(64).fill(-18)}}});
  const shown = post(model).frame(2.55).motion;
  assert.equal(shown.vox, false);
  assert.equal(shown.teleprinter.lines, 0);
  assert.ok(shown.meters.guitar > .5 && shown.meters.drums > .4);
  assert.equal(shown.meters.vocals, 0);
  assert.ok(shown.recorder.trace);
  assert.deepEqual(shown.keys, [60]);
  assert.equal(shown.drums.hits[4][0], '2', 'the kick on the bar line, played');
  assert.equal(shown.drums.hits[3][4], '2', 'the snare on beat two');
  assert.ok(shown.register > 59 && shown.register < 61);
});

test('any window shape: the panel scales whole and sits centred', () => {
  const model = steady([{id: 'g', kind: 'pitched', group: 'guitar', notes: [[1, 4, 60, 100]]}]);
  for (const [w, h] of [[1920, 1080], [1080, 1080], [800, 1200]]) {
    const {frame} = post(model, w, h);
    const m = frame(2).motion, W = Math.round(w / h * 1080);
    assert.ok(Math.abs(m.scale - Math.min(W / 1440, 1080 / 900)) < 1e-6);
    assert.ok(Math.abs(m.origin[0] * 2 + 1440 * m.scale - W) < 1e-6 && Math.abs(m.origin[1] * 2 + 900 * m.scale - 1080) < 1e-6);
  }
});

test('the drum grid stands on the song\'s own bar lines: three beats = twelve steps; beats without bar lines = lamps only', () => {
  const drums = {id: 'd', kind: 'drums', group: 'drums', rows: ['kick', 'snare'], hits: [[6, 0, 100], [6.5, 1, 100]]};
  // 3/4 at 120 bpm: bars of 1.5 s from 0.
  const beats = Array.from({length: 121}, (_, i) => i / 2), downbeats = beats.filter((_, i) => i % 3 === 0);
  const waltz = post({...song, track: {...song.track, duration: 60}, bars: {bpm: 120, beatsPerBar: 3, beats, downbeats, steady: true}, lanes: [drums]}).frame(7.2).motion;
  assert.equal(waltz.drums.steps, 12);
  assert.equal(waltz.drums.hits[4][0], '2', 'the kick on the bar line');
  assert.equal(waltz.drums.hits[3][4], '2', 'the snare on beat two (step 4 of 12)');
  // Beats but no bar lines (an unsteady grid): no steps, no claim of bars on the disc either.
  const loose = post({...song, track: {...song.track, duration: 60}, bars: {bpm: 120, beats, downbeats: [], steady: false}, lanes: [drums]}).frame(7.2).motion;
  assert.equal(loose.drums.steps, 0);
  assert.deepEqual(loose.drums.hits, ['', '', '', '', '']);
  assert.equal(loose.barBeat, '---·-');
});
