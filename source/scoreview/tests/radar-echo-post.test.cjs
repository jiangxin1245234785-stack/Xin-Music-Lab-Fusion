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
  // The first two canvases are the base and over layers; the others are the tape's fade and the lit tube digits.
  assert.ok(made.length >= 3, 'a base layer, an over layer, the tape fade and the lit digits');
  assert.deepEqual(a.layers, {cached: true, draws: 1, materials: 0});
  const [base, over] = made, baseCalls = base.calls.length, overCalls = over.calls.length;
  assert.ok(base.calls.some(c => c.name === 'fillText' && c.args[0] === 'CHANNEL STRIPS'), 'stamped names are in the base layer');
  assert.ok(over.calls.some(c => c.name === 'fillText' && c.args[0] === 'GUITAR'), 'the tape labels are in the over layer');
  stage.reset();
  const b = frame(10).motion;
  assert.equal(base.calls.length, baseCalls, 'not drawn again');
  assert.equal(over.calls.length, overCalls);
  assert.equal(b.layers.draws, 1);
  const copies = stage.calls.filter(c => c.name === 'drawImage').map(c => c.args[0]);
  assert.equal(copies.filter(c => c === base.canvas).length, 1, 'the base layer laid once a frame');
  assert.equal(copies.filter(c => c === over.canvas).length, 1, 'the over layer laid once a frame');
  assert.ok(copies.every(c => made.some(m => m.canvas === c)), 'every other copy is a made sprite (fade, lit digits)');
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
  assert.equal(Object.keys(Radar.MATERIAL_FILES).length, 17, 'twelve from batch 1, five from batch 4');
  for (const file of Object.values(Radar.MATERIAL_FILES)) {
    assert.ok(existsSync(join(__dirname, '../assets/radar', file)), file);
    assert.ok(build.includes("'" + file.replace(/\.png$/, '') + "'") && build.includes("'assets/radar/'"), file + ' is shipped');
  }
  assert.deepEqual(Radar.materials(), [], 'none load without a document (the flat drawing stands in)');
});

test('layout: no text leaves its panel, overlaps another, sits on a screw or straddles a frame; no tape covers a scale; the corner dials clear the bezel (SPEC-WEATHER 基础校对)', () => {
  const Layout = require('../tools/radar-layout.cjs');
  // Node has no fonts: a text's width is estimated from its size and face (a CJK character a full em; the others at
  // each bundled face's average measured with the real fonts: Barlow Condensed .43 em, National Park .56, Courier
  // Prime .60, Permanent Marker .64). The real-font audit is work/score-depth-20261118/weather/audit.cjs.
  const measure = ctx => text => {
    const size = Number((/(\d+(?:\.\d+)?)px/.exec(ctx.font) || [])[1]) || 12;
    const em = /Barlow/.test(ctx.font) ? .43 : /Marker/.test(ctx.font) ? .64 : /Courier/.test(ctx.font) ? .6 : .56;
    // Narrow marks (I, 1, l, full stops, spaces, the middle dot, slashes) take about half a letter in every face.
    return {width: Array.from(String(text)).reduce((w, ch) => w + (/\p{Script=Han}/u.test(ch) ? size : /[I1l.,:;' ·/|]/.test(ch) ? size * em * .5 : size * em), 0)};
  };
  const lanes = ['vocals', 'guitar', 'piano', 'strings', 'winds', 'bass'].map((group, i) => ({id: group, kind: 'pitched', group, notes: [[1 + i, 6, 48 + 4 * i, 100]]}))
    .concat([{id: 'd', kind: 'drums', group: 'drums', hits: [[1, 'kick', 100], [1.5, 'snare', 90]]}]);
  const long = {title: 'Ballade for the Long Night Shift at the Listening Post (Extended Version)', artist: 'The Very Long Name Orchestra & Friends', album: 'An Album With A Long Name', genre: 'Post-rock / Ambient'};
  const cases = [
    {model: steady(lanes, 64), at: 9, lyrics: [{time: 2, text: '院子落葉跟我的思念厚厚一疊'}, {time: 8, text: '幾句是非也無法將我的熱情冷卻'}]},
    {model: steady(lanes, 64, {track: {...song.track, ...long, duration: 64}}), at: 40},
    {model: {...song, track: {...song.track, duration: 30}, bars: {bpm: 100}, lanes}, at: 0}];
  for (const {model, at, lyrics} of cases) {
    const {view, stage} = post(model);
    const ctx = stage.canvas.getContext();
    ctx.measureText = measure(ctx);
    // A transform stack, so translated / rotated texts are recorded where they land.
    let m = {a: 1, b: 0, c: 0, d: 1, e: 0, f: 0};
    const stack = [], mul = (n) => { m = {a: m.a * n.a + m.c * n.b, b: m.b * n.a + m.d * n.b, c: m.a * n.c + m.c * n.d, d: m.b * n.c + m.d * n.d, e: m.a * n.e + m.c * n.f + m.e, f: m.b * n.e + m.d * n.f + m.f}; };
    const {save, restore} = ctx;
    Object.assign(ctx, {
      getTransform: () => ({...m}), setTransform: (a, b, c, d, e, f) => { m = {a, b, c, d, e, f}; },
      translate: (x, y) => mul({a: 1, b: 0, c: 0, d: 1, e: x, f: y}), rotate: r => mul({a: Math.cos(r), b: Math.sin(r), c: -Math.sin(r), d: Math.cos(r), e: 0, f: 0}),
      save: (...a) => { stack.push(m); save(...a); }, restore: (...a) => { m = stack.pop() || m; restore(...a); }});
    if (lyrics) view.setLyrics({trackId: song.track.id, enabled: true, offset: 0, lines: lyrics});
    Radar.audit(true);
    try { view.draw(at); } finally { var records = Radar.audited(); Radar.audit(false); }
    assert.ok(records.filter(r => r.type === 'text').length > 100, 'every text is recorded');
    assert.deepEqual(Layout.check(records), [], model.track.title + ' at ' + at);
    const disc = records.find(r => r.type === 'ring' && r.r === 300);
    for (const dial of records.filter(r => r.type === 'ring' && r.r < 60 && r.r > 40 && Math.hypot(r.cx - disc.cx, r.cy - disc.cy) > 300)) {
      assert.ok(Math.hypot(dial.cx - disc.cx, dial.cy - disc.cy) - disc.r - dial.r >= 6, 'a corner dial clears the bezel by 6 px');
    }
  }
  // The check bites: an overlap, a text off its panel, a tape on a scale.
  const panel = {type: 'panel', x: 0, y: 0, w: 100, h: 100};
  const text = (t, x, y) => ({type: 'text', text: t, x, y, w: 20, h: 10});
  assert.deepEqual(Layout.check([panel, text('A', 10, 10), text('B', 20, 12)]).map(q => q.kind), ['overlap']);
  assert.deepEqual(Layout.check([panel, text('A', 85, 10)]).map(q => q.kind), ['edge']);
  assert.deepEqual(Layout.check([panel, {type: 'tape', x: 0, y: 0, w: 30, h: 10}, {type: 'keep', x: 20, y: 5, w: 30, h: 10, what: 'X scale'}]).map(q => q.kind), ['cover']);
  assert.deepEqual(Layout.check([panel, text('A', 10, 10), {type: 'mark', x: 15, y: 0, w: 2, h: 90, what: 'pen'}]).map(q => q.kind), ['mark']);
  assert.deepEqual(Layout.check([panel, {type: 'frame', x: 10, y: 10, w: 40, h: 40}, {type: 'screw', cx: 12, cy: 30, r: 5}]).map(q => q.kind), ['screw']);
});

test('Codex QA (qa-gpt/REPORT.md): the chord card prints whole names, bar readings stay in the measured bars, a space takes a tape cell, other metres say they have bar lines, drum cells fill the row', () => {
  const lanes = [{id: 'g', kind: 'pitched', group: 'guitar', notes: [[1, 4, 60, 100]]}];
  // R01: Fsus4, F#m7b5 and a slash chord are printed whole (by size first, shortened only after).
  for (const label of ['Fsus4', 'F#m7b5', 'Dbmaj7/F']) {
    const chord = post(steady(lanes, 64, {chords: [[0, 10, label]]})).frame(5).motion.chord;
    assert.equal(chord.shown, label, label + ' at ' + chord.size + ' px');
    assert.ok(chord.size >= 14);
  }
  // R02: a song whose bars run 4 .. 60 s (120 bpm, 4/4): no bar reading before the first bar line or after the last
  // bar; the disc numbers only bars the song has.
  const beats = Array.from({length: 129}, (_, i) => i / 2), downbeats = beats.filter(t => t >= 4 && t <= 58 && (t - 4) % 2 === 0);
  const late = {...song, track: {...song.track, duration: 64}, bars: {bpm: 120, beatsPerBar: 4, beats, downbeats, steady: true}, lanes};
  const {frame} = post(late);
  assert.equal(frame(1).motion.barBeat, '---·-', 'before the first bar line');
  assert.equal(frame(4.1).motion.barBeat, '001·1');
  assert.equal(frame(59).motion.barBeat, '028·3', 'the last bar (58 .. 60), its third beat');
  assert.equal(frame(61).motion.barBeat, '---·-', 'after the last bar');
  for (const t of [0, 1, 3, 59, 61, 63]) assert.ok(frame(t).motion.barNumbers.every(n => n >= 1 && n <= downbeats.length), 'disc numbers at ' + t);
  assert.deepEqual(frame(1).motion.barNumbers, [], 'the turn before the first bar shows none');
  // R03: WE GO ON is three words: the spaces take a cell each, blank.
  const tape = Radar.create().tape({lyrics: {enabled: true, offset: 0, lines: [{time: 10, text: 'WE GO ON'}]}, options: {}});
  assert.deepEqual(tape.cells.map(c => c.blank ? '_' : c.ch).join(''), 'WE_GO_ON');
  // R05: bar lines of five beats keep the rolling strip and say so (not "no bar lines").
  const five = Array.from({length: 161}, (_, i) => i / 2), fiveDown = five.filter((_, i) => i % 5 === 0);
  const fiveFrame = post({...song, track: {...song.track, duration: 80}, bars: {bpm: 120, beatsPerBar: 5, beats: five, downbeats: fiveDown, steady: true}, lanes});
  Radar.audit(true);
  try { fiveFrame.view.draw(20); } finally { var five5 = Radar.audited(); Radar.audit(false); }
  assert.ok(five5.some(r => r.type === 'text' && r.text === '5 BEATS / BAR'));
  assert.ok(!five5.some(r => r.type === 'text' && /NO BAR LINES/.test(r.text)));
  // R10: 2, 3 and 4 beats a bar all end their cells 8-12 px inside the bed's right edge (1404).
  for (const per of [2, 3, 4]) {
    const b = Array.from({length: 129}, (_, i) => i / 2), d = b.filter((_, i) => i % per === 0);
    const drums = post({...song, track: {...song.track, duration: 64}, bars: {bpm: 120, beatsPerBar: per, beats: b, downbeats: d, steady: true}, lanes}).frame(10).motion.drums;
    assert.ok(1404 - drums.right >= 8 && 1404 - drums.right <= 12, per + ' beats: ' + drums.right);
  }
  // R16: the recorder's section marks are never the levers' IN / OUT.
  const marks = Object.values(require('node:vm').runInNewContext('(' + readFileSync(join(__dirname, '../score-radar.js'), 'utf8').match(/SECTION_MARK = Object\.freeze\((\{[^}]*\})\)/)[1] + ')'));
  assert.ok(marks.every(m => m !== 'IN' && m !== 'OUT' && m.length >= 3), marks.join(' '));
  // R21: the tag fallback prints RELEASED and 1/12, as XML's facts do.
  const sheet = post(steady(lanes, 64, {track: {...song.track, title: 'X', date: '2004', number: 1, trackTotal: 12, lyricist: 'Lin', duration: 64}})).frame(63).motion.teleprinter.fields;
  assert.deepEqual(sheet.filter(f => ['RELEASED', 'TRACK', 'LYRICS BY'].includes(f[0])), [['RELEASED', '2004'], ['TRACK', '1/12'], ['LYRICS BY', 'Lin']]);
  const xml = require('../../fusion-runtime-baseline/desktop/track-info.cjs');
  assert.equal(xml.FACT_NAMES.date.toUpperCase(), 'RELEASED');
  assert.equal(xml.FACT_NAMES.lyricist.toUpperCase(), 'LYRICS BY');
  // R22: a long title of characters outside the BMP is shortened by whole characters.
  const title = post(steady(lanes, 64, {track: {...song.track, title: 'iiiii秋' + '\u{20BB7}'.repeat(48), artist: '', duration: 64}})).frame(5).motion.teleTitle;
  assert.ok(title.endsWith('…') && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(title), 'no half character before the ellipsis');
});

test('channel lamps (score-radar-lamps.js, rule A at P65 / P80): a channel climbs green, amber, red with its own level; muted or absent stays dark', () => {
  const lanes = [{id: 'g', kind: 'pitched', group: 'guitar', notes: [[1, 58, 60, 100]]}, {id: 'b', kind: 'pitched', group: 'bass', notes: [[1, 58, 40, 100]]}];
  // A second a value: guitar -40 dB for 20 s, -25 for 20, -10 for 20; bass steady at -30.
  const guitar = [...Array(20).fill(-40), ...Array(20).fill(-25), ...Array(20).fill(-10)];
  const levels = {hop: 1, weighting: 'K', groups: {guitar, bass: Array(60).fill(-30)}};
  const model = steady(lanes, 64, {levels});
  const {frame} = post(model);
  const quiet = frame(10).motion.lamps, loud = frame(50).motion.lamps;
  assert.ok(quiet.guitar.green > .9 && quiet.guitar.yellow < .05 && quiet.guitar.red < .05, 'quiet: green only');
  assert.ok(loud.guitar.green > .9 && loud.guitar.yellow > .9 && loud.guitar.red > .4, 'loud: all three');
  assert.ok(loud.vocals.green === 0 && loud.vocals.red === 0, 'a channel the song lacks is dark');
  assert.deepEqual(frame(0).motion.lamps.guitar, {green: 0, yellow: 0, red: 0}, 'all dark at 0 s');
  const solo = post(model, 1440, 900, {...options, focusGroup: 'bass'}).frame(50).motion.lamps;
  assert.deepEqual(solo.guitar, {green: 0, yellow: 0, red: 0}, 'another channel solo: dark');
  assert.ok(solo.bass.green > .9);
  assert.deepEqual(frame(37.3).motion.lamps, frame(37.3).motion.lamps, 'a function of song time');
});

test('batch 4: crayon marks on the three busiest meters at their mean level; the needle overshoots after a rise and settles; the switches', () => {
  const lanes = ['vocals', 'guitar', 'piano', 'bass'].map(group => ({id: group, kind: 'pitched', group, notes: [[1, 50, 60, 100]]}));
  // A second a value: guitar loud for 40 s, bass for 30, vocals for 20, piano for 10 (all at -25 dB = .5 of the scale).
  const run = n => [...Array(n).fill(-25), ...Array(60 - n).fill(-90)];
  const levels = {hop: 1, groups: {vocals: run(20), guitar: run(40), piano: run(10), bass: run(30)}};
  const model = steady(lanes, 64, {levels});
  const {frame} = post(model);
  const marks = frame(5).motion.crayon;
  assert.deepEqual(marks.map(m => m.channel).sort(), ['bass', 'guitar', 'vocals'], 'the three heard longest (piano, ten seconds, has none)');
  assert.ok(marks.every(m => Math.abs(m.at - .5) < .03), 'each at its mean level while heard');
  // A step from silence to -25 dB at 40 s on the guitar's own row (a fresh song): the needle passes .5 and comes back.
  const step = {hop: 1, groups: {guitar: [...Array(40).fill(-90), ...Array(24).fill(-25)]}};
  const stepModel = steady([{id: 'g', kind: 'pitched', group: 'guitar', notes: [[1, 62, 60, 100]]}], 64, {levels: step});
  const swing = post(stepModel), plain = post(stepModel, 1440, 900, {...options, radarOvershoot: false});
  const peak = Math.max(...[40.05, 40.1, 40.15, 40.2].map(t => swing.frame(t).motion.meters.guitar));
  const flat = plain.frame(40.1).motion.meters.guitar;
  assert.ok(peak > flat + .02, `overshoot: ${peak} over ${flat}`);
  assert.ok(Math.abs(swing.frame(41).motion.meters.guitar - plain.frame(41).motion.meters.guitar) < .01, 'settled a second later');
  assert.equal(swing.frame(40.1).motion.meters.guitar, swing.frame(40.1).motion.meters.guitar, 'a function of song time');
  // Switches: through the core's option list (score-view.js), jumpers off by default.
  const view = readFileSync(join(__dirname, '../score-view.js'), 'utf8');
  assert.match(view, /radarJumpers: false, radarOvershoot: true, radarBloom: true, radarInk: true/);
});

test('a lamp counts a channel as sounding exactly where its needle leaves zero: separation residue lights nothing', () => {
  // Guitar: 30 s of separation residue at -80 dB, then a rise from -35 to -6 dB over 30 s; drums the residue only.
  const guitar = [...Array(30).fill(-80), ...Array.from({length: 30}, (_, i) => -35 + i)];
  const levels = {hop: 1, groups: {guitar, drums: Array(60).fill(-80)}};
  const lanes = [{id: 'g', kind: 'pitched', group: 'guitar', notes: [[1, 58, 60, 100]]}, {id: 'd', kind: 'drums', group: 'drums', hits: [[1, 'kick', 100], [40, 'kick', 100]]}];
  const {frame} = post(steady(lanes, 64, {levels}));
  let zeroSeconds = 0;
  for (let t = .5; t < 60; t += .25) {
    const m = frame(t).motion;
    for (const ch of ['guitar', 'drums']) {
      if (m.meters[ch] === 0) { zeroSeconds++; assert.ok(m.lamps[ch].green < .5, `${ch} at ${t}: needle at zero, green ${m.lamps[ch].green}`); }
    }
  }
  assert.ok(zeroSeconds > 100, 'the residue seconds were looked at');
  // The residue does not pull the grades down: guitar's amber and red only on its loud part, drums never lit.
  const at = t => frame(t).motion.lamps.guitar;
  assert.ok(at(20).green < .5 && at(33).green > .5 && at(33).red < .5 && at(58).red > .5, 'green from the meter zero, red on the loudest part only');
  assert.ok([10, 35, 55].every(t => frame(t).motion.lamps.drums.green < .5), 'residue alone never lights a lamp');
  // One number: the meters' zero is the lamps' gate (the source says so, so a change of zero moves both).
  const src = readFileSync(join(__dirname, '../score-radar.js'), 'utf8');
  assert.match(src, /clamp\(\(best - METER_ZERO_DB\) \/ METER_SPAN_DB, 0, 1\)/);
  assert.match(src, /L\.thresholds\(env\.model\.levels, \{gateDb: METER_ZERO_DB\}\)/);
});
