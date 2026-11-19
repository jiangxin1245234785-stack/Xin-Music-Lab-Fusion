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

test('the teleprinter prints codes first and characters a short beat later; the codes are Unihan\'s', () => {
  assert.equal(Telegraph.code('七'), '0003');
  assert.equal(Telegraph.code('里'), '6849');
  assert.equal(Telegraph.code('香'), '7449');
  assert.equal(Telegraph.code('A'), null);
  assert.ok(Telegraph.size > 10000 && /^\d+\.\d+\.\d+$/.test(Telegraph.unicode));
  const model = steady([{id: 'g', kind: 'pitched', group: 'guitar', notes: [[1, 4, 60, 100]]}]);
  const {frame, view} = post(model);
  view.setLyrics({trackId: song.track.id, enabled: true, offset: 0, lines: [{time: 10, text: '七里香'}, {time: 20, text: 'la'}]});
  assert.equal(frame(9).motion.teleprinter.newest.length, 0, 'nothing before the line');
  // The line is sung 10 .. 11.5 (three characters, at least 1.2 s): 七 at 10, 里 at 10.5, 香 at 11. The tape prints it
  // .4 s early and by 70 % of it (9.6 .. 11.05): 七 at 9.6, 里 at 10.08, 香 at 10.57, each clear .1 s after its code.
  const half = frame(10.6).motion.teleprinter;
  assert.deepEqual(half.newest.map(g => [g.ch, g.code, g.clear]), [['香', '7449', false], ['里', '6849', true], ['七', '0003', true]]);
  assert.equal(half.lead, .4);
  assert.equal(half.printing, true);
  const done = frame(15).motion.teleprinter;
  assert.equal(done.printing, false);
  assert.deepEqual(done.newest.map(g => g.ch), ['香', '里', '七']);
  const latin = frame(21).motion.teleprinter.newest[0];
  assert.deepEqual([latin.ch, latin.code, latin.clear], ['a', null, true]);
});

test('the tape prints ahead of the singing: every character is on the tape (clear) before it is sung, lines never overlap, at each lead', () => {
  const model = steady([{id: 'g', kind: 'pitched', group: 'guitar', notes: [[1, 4, 60, 100]]}]);
  // Lines of every kind: long, short, and two close together (the second starts .3 s after the first is sung).
  const lines = [{time: 4, text: '院子落葉跟我的思念厚厚一疊'}, {time: 9, text: '幾句是非'}, {time: 10.6, text: '也無法將我的熱情冷卻'},
    {time: 13.5, text: '妳出現在我詩的每一頁'}, {time: 17, text: 'la la'}];
  assert.deepEqual(Radar.LEADS, [.2, .4, .7]);
  for (const lead of [...Radar.LEADS, undefined]) {
    const opts = {...options, ...(lead === undefined ? {} : {radarLead: lead})};
    const tape = Radar.create().tape({lyrics: {enabled: true, offset: 0, lines}, options: lead === undefined ? {} : {radarLead: lead}});
    assert.equal(tape.lead, lead ?? .4, 'the middle one is the default');
    let lastDot = -Infinity, lineFirst = true;
    for (const cell of tape.cells) {
      if (cell.dot) { lastDot = cell.time; lineFirst = true; continue; }
      assert.ok(cell.time + cell.half <= cell.sung + 1e-9, `${cell.ch} clear at ${cell.time + cell.half}, sung at ${cell.sung}`);
      assert.ok(cell.half <= .1 + 1e-9);
      if (lineFirst) assert.ok(cell.time > lastDot, 'a line starts after the one before has finished');
      if (lineFirst && cell.sung - (lead ?? .4) > lastDot + .05) assert.ok(Math.abs(cell.sung - cell.time - (lead ?? .4)) < 1e-9, 'the full lead where there is room');
      lineFirst = false;
    }
    // The third character of 也無法…: on the tape when it is sung.
    const third = tape.cells.filter(c => !c.dot)[13 + 4 + 2];
    assert.equal(third.ch, '法');
    const {frame, view} = post(model, 1440, 900, opts);
    view.setLyrics({trackId: song.track.id, enabled: true, offset: 0, lines});
    assert.ok(frame(third.sung).motion.teleprinter.newest.some(g => g.ch === '法' && g.clear), 'sung now, already printed and clear');
  }
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

test('without bar lines the drum panel rolls the last sixteen beats; without beats it keeps the five lamps', () => {
  const drums = {id: 'd', kind: 'drums', group: 'drums', rows: ['kick', 'snare'], hits: [[6, 0, 100], [6.5, 1, 100], [1, 0, 100]]};
  const beats = Array.from({length: 121}, (_, i) => i / 2);
  const loose = post({...song, track: {...song.track, duration: 60}, bars: {bpm: 120, beats, downbeats: [], steady: false}, lanes: [drums]}).frame(7.2).motion;
  assert.equal(loose.drums.mode, 'roll');
  assert.equal(loose.drums.nowBeat, 14.4);
  assert.deepEqual(loose.drums.rolled[4], [2, 12], 'kicks at beats 2 and 12 (1.0 s and 6.0 s), both within the last 16 beats');
  assert.deepEqual(loose.drums.rolled[3], [13], 'the snare at beat 13 (6.5 s)');
  const bare = post({...song, track: {...song.track, duration: 60}, bars: {bpm: 120}, lanes: [drums]}).frame(7.2).motion;
  assert.equal(bare.drums.mode, 'lamps');
});

test('without lyrics the teleprinter prints the track sheet: title and artist first, then the rest over the song; fields the tags lack are left out', () => {
  const lanes = [{id: 'g', kind: 'pitched', group: 'guitar', notes: [[1, 4, 60, 100]]}];
  const model = steady(lanes, 64, {track: {...song.track, title: 'MEGURI', artist: "world's end girlfriend", album: '', number: 4, genre: 'Post-rock', duration: 64}});
  const {frame} = post(model);
  const start = frame(.1).motion.teleprinter;
  assert.equal(start.mode, 'sheet');
  assert.deepEqual(start.fields.map(f => f[0]), ['TITLE', 'ARTIST', 'TRACK', 'GENRE', 'LENGTH'], 'no ALBUM (empty), no fields the tags lack');
  assert.deepEqual(start.fields.find(f => f[0] === 'LENGTH'), ['LENGTH', '1:04']);
  assert.deepEqual(start.shown, [], 'nothing before half a second');
  const early = frame(3.5).motion.teleprinter.shown;
  assert.deepEqual(early.map(s => [s.field, s.value, s.done]), [['TITLE', 'MEGURI', true], ['ARTIST', "world's end girlfriend", true]]);
  const late = frame(63.9).motion.teleprinter.shown;
  assert.deepEqual(late.map(s => s.field), ['TITLE', 'ARTIST', 'TRACK', 'GENRE', 'LENGTH']);
  assert.ok(late.every(s => s.done));
  assert.deepEqual(frame(20).motion.teleprinter, frame(20).motion.teleprinter, 'a function of song time');
});

test('the rating plate reads 蒋 and 鑫 from the telegraph table; the song sits in the teleprinter\'s title row; a host\'s facts list prints in its order', () => {
  assert.equal(Telegraph.code('蒋'), '5592');
  assert.equal(Telegraph.code('鑫'), '9515');
  const lanes = [{id: 'g', kind: 'pitched', group: 'guitar', notes: [[1, 4, 60, 100]]}];
  const plain = post(steady(lanes, 64, {track: {...song.track, title: '七里香', artist: '周杰伦', album: '', duration: 64}})).frame(5).motion;
  assert.equal(plain.plate.line1, 'RESISTANCE 5592–9515 OHMS');
  assert.equal(plain.plate.line2, 'MFD. BY & THE BLESSING INSTR. CO.');
  assert.ok(plain.plate.size2 >= 12, 'the second line stays readable');
  assert.equal(plain.teleTitle, '七里香 · 周杰伦');
  const facts = [{name: 'Composer', value: '周杰伦'}, {name: 'RELEASED', value: '2004-08-03'}, {name: 'LABEL', value: ''}];
  const listed = post(steady(lanes, 64, {track: {...song.track, title: 'X', duration: 64, facts}})).frame(63).motion.teleprinter;
  assert.deepEqual(listed.fields, [['COMPOSER', '周杰伦'], ['RELEASED', '2004-08-03']], 'the list as given, empty values left out, nothing added');
});

test('the hardware is drawn once into two cached layers; each frame lays them down and draws only what moves (SPEC-WEATHER batch 1)', () => {
  const lanes = [{id: 'g', kind: 'pitched', group: 'guitar', notes: [[1, 4, 60, 100], [9, 2, 64, 90]]}];
  const {frame, stage} = post(steady(lanes, 64));
  const made = [];
  stage.canvas.getContext().canvas = stage.canvas;   // as a real context points back at its canvas
  stage.canvas.ownerDocument ={createElement: () => { const layer = mockCanvas(); made.push(layer); return layer.canvas; }};
  const a = frame(2).motion;
  assert.equal(made.length, 2, 'a base layer and an over layer');
  assert.deepEqual(a.layers, {cached: true, draws: 1, materials: 0});
  const [base, over] = made, baseCalls = base.calls.length, overCalls = over.calls.length;
  assert.ok(base.calls.some(c => c.name === 'fillText' && c.args[0] === 'CHANNEL STRIPS'), 'stamped names are in the base layer');
  assert.ok(over.calls.some(c => c.name === 'fillText' && c.args[0] === 'GUITAR'), 'the tape labels are in the over layer');
  stage.reset();
  const b = frame(10).motion;
  assert.equal(base.calls.length, baseCalls, 'not drawn again');
  assert.equal(over.calls.length, overCalls);
  assert.equal(b.layers.draws, 1);
  assert.equal(stage.calls.filter(c => c.name === 'drawImage').length, 2, 'two copies a frame');
  assert.ok(!stage.calls.some(c => c.name === 'fillText' && c.args[0] === 'CHANNEL STRIPS'), 'no hardware in the moving part');
  assert.equal(b.plate.line1, 'RESISTANCE 5592–9515 OHMS', 'what the hardware reports is kept with the layer');
  assert.ok(b.recorderBox && b.teleTitle !== undefined);
  // The same moment draws the same frame, cached or not.
  const direct = post(steady(lanes, 64)).frame(10).motion;
  for (const key of ['meters', 'caution', 'chord', 'drums', 'recorder', 'teleprinter', 'angle', 'echoes', 'plate', 'teleTitle']) {
    assert.deepEqual(b[key], direct[key], key);
  }
});

test('the materials are the files the build ships: every MATERIAL_FILES entry is in assets/radar and in build-local\'s list', () => {
  const {existsSync} = require('node:fs');
  const build = readFileSync(join(__dirname, '../../release-tools/build-local.cjs'), 'utf8');
  assert.equal(Object.keys(Radar.MATERIAL_FILES).length, 12);
  for (const file of Object.values(Radar.MATERIAL_FILES)) {
    assert.ok(existsSync(join(__dirname, '../assets/radar', file)), file);
    assert.ok(build.includes("'" + file.replace(/\.png$/, '') + "'") && build.includes("'assets/radar/'"), file + ' is shipped');
  }
  assert.deepEqual(Radar.materials(), [], 'none load without a document (the flat drawing stands in)');
});
