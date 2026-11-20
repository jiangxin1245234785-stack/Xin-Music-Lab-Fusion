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

test('the fifths buttons keep their painted note names as the faces and rims light and fade', () => {
  const model = steady([{id: 'g', kind: 'pitched', group: 'guitar', notes: [[1, 4, 60, 100]]}], 64,
    {chords: [[2, 5, 'Am'], [5, 10, 'Bb']]});
  const {frame, stage} = post(model);
  const names = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'];
  const drawButtons = at => {
    stage.reset();
    const {fifths} = frame(at).motion.chord;
    const buttons = stage.calls.flatMap((call, i) => {
      if (call.name !== 'arc') return [];
      const [x, y, r] = call.args;
      if (r !== 14 || Math.abs(Math.hypot(x - 1130, y - 285) - 81) > 1e-6) return [];
      const [face, rim, label] = stage.calls.slice(i + 1, i + 4);
      assert.deepEqual([face.name, rim.name, label.name], ['fill', 'stroke', 'fillText']);
      assert.deepEqual(label.args.slice(1), [x, y + 15 * .72 / 2]);
      assert.equal(label.alpha, 1);
      return [{name: label.args[0], paint: label.fillStyle, face: face.fillStyle, rim: rim.strokeStyle}];
    });
    assert.deepEqual(buttons.map(b => b.name), names);
    return {buttons, fifths};
  };
  const off = drawButtons(1), lit = drawButtons(4), turning = drawButtons(5.1), faded = drawButtons(5.9);
  const a = names.indexOf('A'), bb = names.indexOf('Bb');
  assert.equal(off.fifths[a], 0);
  assert.equal(lit.fifths[a], 1);
  assert.ok(turning.fifths[a] > .45 && turning.fifths[a] < 1);
  assert.ok(faded.fifths[a] > 0 && faded.fifths[a] < .45);
  assert.equal(turning.fifths[bb], 1);
  const paint = off.buttons[a].paint;
  for (const {buttons} of [off, lit, turning, faded]) {
    assert.ok(buttons.every(button => button.paint === paint), 'every name is painted in the same color');
  }
  for (const part of ['face', 'rim']) {
    assert.equal(new Set([off, lit, turning, faded].map(state => state.buttons[a][part])).size, 4);
    assert.equal(turning.buttons[bb][part], lit.buttons[a][part]);
  }
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

test('the teleprinter strikes a code and its character together, one cell (SPEC-TELEPRINTER 8); the codes are Unihan\'s', () => {
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
  // .4 s early and by 70 % of it (9.6 .. 11.05): 七 at 9.6, 里 at 10.08, 香 at 10.57, code and character in one strike.
  const half = frame(10.6).motion.teleprinter;
  assert.deepEqual(half.newest.map(g => [g.ch, g.code, g.clear]), [['香', '7449', true], ['里', '6849', true], ['七', '0003', true]]);
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

function tapeFrames(lines) {
  const model = steady([{id: 'g', kind: 'pitched', group: 'guitar', notes: [[1, 4, 60, 100]]}]);
  const lyrics = {trackId: song.track.id, enabled: true, offset: 0, lines};
  const {cells} = Radar.create().tape({lyrics, options});
  const {frame, stage, view} = post(model, 1600, 900, {...options, radarInk: false});
  view.setLyrics(lyrics);
  const drawTape = at => {
    stage.reset(); frame(at);
    // The rows ride the tape's rise and fall (under a unit) and the newest few are in fresh ink: any ink colour, y within 1.
    const ink = s => s.style === '#38362e' || /^rgb\(/.test(s.style);
    const text = new Map(stage.texts().filter(s => ink(s) && s.y >= 812 && s.y <= 846).map(s => [s.text, s]));
    const dot = stage.calls.find(c => c.name === 'arc' && c.args[0] > 970 && Math.abs(c.args[1] - 841) <= 1 && c.args[2] === 2.5);
    return {text, dot: dot?.args[0]};
  };
  return {cells, drawTape};
}

const nearTape = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} vs ${expected}`);

test('the teleprinter draws words at Courier Prime pitch and feeds mixed-width cells without moving old ink at a strike', () => {
  const {cells, drawTape} = tapeFrames([{time: 10, text: 'WE G2!七里\u3000、あ'}, {time: 20, text: 'A'}]);
  const {text, dot} = drawTape(21), x = ch => text.get(ch).x;
  const pitch = 14.390625;
  for (const [left, right, distance] of [['W', 'E', pitch], ['E', 'G', 2 * pitch], ['G', '2', pitch], ['2', '!', pitch],
    ['!', '七', 20 + pitch / 2], ['七', '里', 40], ['里', '、', 80], ['、', 'あ', 40]]) nearTape(x(right) - x(left), distance);
  nearTape(x('0003'), x('七'));
  nearTape(x('6849'), x('里'));
  nearTape(dot - x('あ'), 29);
  nearTape(x('A') - dot, 9 + pitch / 2);
  assert.match(text.get('W').font, /^24px "Courier Prime"/);
  assert.match(text.get('あ').font, /FangSong/);
  assert.equal(text.has(' '), false);
  assert.equal(text.has('\u3000'), false);

  for (const [strike, old] of [[cells.find(c => c.ch === '七'), '!'], [cells.find(c => c.dot), 'あ'], [cells.at(-1), 'あ']]) {
    const before = drawTape(strike.time - 1e-9);
    const after = drawTape(strike.time);
    nearTape(before.text.get(old).x, after.text.get(old).x);
  }
  const repeated = drawTape(21);
  assert.deepEqual(repeated, {text, dot}, 'seeking back and forth yields the same coordinates');
});

test('spaces between wide characters and separators between wide lines keep the original paper feed', () => {
  const {cells, drawTape} = tapeFrames([{time: 10, text: '麻雀 在電線'}, {time: 20, text: '桿上'}]);
  const blank = cells.find(c => c.blank), sparrow = cells.find(c => c.ch === '雀');
  const code = Telegraph.code('雀');
  const atStrike = drawTape(sparrow.time).text.get(code).x;
  const beforeBlank = drawTape(blank.time - 1e-9).text.get(code).x;
  const afterBlank = drawTape(blank.time).text.get(code).x;
  nearTape(atStrike - beforeBlank, 40);
  nearTape(beforeBlank, afterBlank);
  const {text} = drawTape(cells.find(c => c.ch === '在').time + .11);
  nearTape(text.get('在').x - text.get('雀').x, 80);

  const separator = cells.find(c => c.dot);
  const next = cells.find(c => c.ch === '桿');
  const beforeLine = drawTape(next.time - 1e-9), afterLine = drawTape(next.time);
  nearTape(beforeLine.text.get('線').x, afterLine.text.get('線').x);
  nearTape(beforeLine.dot, afterLine.dot);
  nearTape(afterLine.dot - afterLine.text.get('線').x, 40);
  nearTape(afterLine.text.get(Telegraph.code('桿')).x - afterLine.dot, 40);
  nearTape(drawTape(separator.time).dot - beforeLine.dot, 40);

  const mixed = tapeFrames([{time: 10, text: '甲 A文 あ'}, {time: 20, text: '字'}]).cells;
  assert.deepEqual(mixed.filter(c => c.blank || c.dot).map(c => c.width), [14.390625, 40, 18]);
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

test('any window shape: the panel scales whole and sits centred; wider than 16:10 it widens up to 16:9 (SPEC-WEATHER B)', () => {
  const model = steady([{id: 'g', kind: 'pitched', group: 'guitar', notes: [[1, 4, 60, 100]]}]);
  // 16:10 and narrower: 1440 wide; 16:9: 1600, no bars; between: in between, smoothly; 21:9: 1600 and bars beside.
  for (const [w, h, design] of [[1440, 900, 1440], [1920, 1080, 1600], [1530, 900, 1530], [2520, 1080, 1600], [1080, 1080, 1440], [800, 1200, 1440]]) {
    const {frame} = post(model, w, h);
    const m = frame(2).motion, W = Math.round(w / h * 1080);
    assert.equal(m.design[0], design, `${w} x ${h}`);
    assert.ok(Math.abs(m.scale - Math.min(W / design, 1080 / 900)) < 1e-6);
    assert.ok(Math.abs(m.origin[0] * 2 + design * m.scale - W) < 1e-6 && Math.abs(m.origin[1] * 2 + 900 * m.scale - 1080) < 1e-6);
  }
  assert.equal(post(model, 1920, 1080).frame(2).motion.origin[0], 0, '1920 x 1080: no bars at the sides');
});

test('the drum grid stands on the song\'s own bar lines: three beats = twelve steps; beats without bar lines = the 16-beat grid', () => {
  const drums = {id: 'd', kind: 'drums', group: 'drums', rows: ['kick', 'snare'], hits: [[6, 0, 100], [6.5, 1, 100]]};
  // 3/4 at 120 bpm: bars of 1.5 s from 0.
  const beats = Array.from({length: 121}, (_, i) => i / 2), downbeats = beats.filter((_, i) => i % 3 === 0);
  const waltz = post({...song, track: {...song.track, duration: 60}, bars: {bpm: 120, beatsPerBar: 3, beats, downbeats, steady: true}, lanes: [drums]}).frame(7.2).motion;
  assert.equal(waltz.drums.steps, 12);
  assert.equal(waltz.drums.hits[4][0], '2', 'the kick on the bar line');
  assert.equal(waltz.drums.hits[3][4], '2', 'the snare on beat two (step 4 of 12)');
  // Beats but no bar lines (an unsteady grid): the 16-beat grid at two steps a beat (radar.9 feedback), no claim of bars.
  const loose = post({...song, track: {...song.track, duration: 60}, bars: {bpm: 120, beats, downbeats: [], steady: false}, lanes: [drums]}).frame(7.2).motion;
  assert.equal(loose.drums.mode, 'beats');
  assert.equal(loose.drums.steps, 32);
  assert.equal(loose.drums.hits[4][24], '2', 'the kick at beat 12 (6.0 s): step 24 of 32');
  assert.equal(loose.drums.hits[3][26], '2', 'the snare at beat 13 (6.5 s): step 26');
  assert.equal(loose.barBeat, '---·-');
});

test('radar.9 feedback: without bar lines the drum lamps sweep 16 beats at two steps a beat; without beats 8 seconds at four steps a second; nothing rolls', () => {
  const drums = {id: 'd', kind: 'drums', group: 'drums', rows: ['kick', 'snare'], hits: [[6, 0, 100], [6.5, 1, 100], [1, 0, 100]]};
  const beats = Array.from({length: 121}, (_, i) => i / 2);
  const loose = post({...song, track: {...song.track, duration: 60}, bars: {bpm: 120, beats, downbeats: [], steady: false}, lanes: [drums]}).frame(7.2).motion;
  assert.equal(loose.drums.mode, 'beats');
  assert.equal(loose.drums.step, 28, 'beat 14.4 of 16: step 28 of 32');
  assert.ok(loose.drums.heat[4][4] > 0 && loose.drums.heat[4][4] < loose.drums.heat[4][24], 'the kick at beat 2 (step 4) dimmer than the one at beat 12 (step 24)');
  assert.ok(loose.drums.heat[3][26] > .7, 'the snare at beat 13 (6.5 s), lit');
  // The lamps stay where they lit: a second later the same lamps, dimmer, nothing moved.
  const later = post({...song, track: {...song.track, duration: 60}, bars: {bpm: 120, beats, downbeats: [], steady: false}, lanes: [drums]}).frame(7.7).motion.drums;
  for (const [r, st] of [[4, 4], [4, 24], [3, 26]]) assert.ok(later.heat[r][st] > 0 && later.heat[r][st] < loose.drums.heat[r][st], `row ${r} step ${st} dims in place`);
  const bare = post({...song, track: {...song.track, duration: 60}, bars: {bpm: 120}, lanes: [drums]}).frame(7.2).motion;
  assert.equal(bare.drums.mode, 'time');
  assert.equal(bare.drums.steps, 32);
  assert.equal(bare.drums.step, 28, '7.2 s of 8: step 28');
  assert.ok(bare.drums.heat[4][24] > 0, 'the kick at 6.0 s: step 24');
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
  const cx = 661, cy = 425, inner = 42, outer = 256;
  const engraved = c => c.name === 'fillText' && c.fillStyle === '#9bceb0';
  const labels = base.calls.filter(engraved);
  assert.deepEqual(labels.map(c => c.args[0]), ['VOX', 'GTR', 'PNO', 'STR', 'WND', 'BAS'], 'the graticule includes even silent channels');
  const grid = base.calls.filter(c => c.name === 'arc' && c.args[0] === cx && c.args[1] === cy && c.args[2] >= inner && c.args[2] <= outer);
  assert.equal(grid.length, 7);
  assert.deepEqual(grid[0].args, [cx, cy, inner, 0, 2 * Math.PI], 'the innermost grid line is a full circle');
  const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `expected ${expected}, received ${actual}`);
  const ticks = base.strokes().filter(s => s.style === '#78a28c');
  assert.equal(ticks.length, 6);
  labels.forEach((label, k) => {
    const [, x, baseline] = label.args, [, , r, start, end] = grid[k + 1].args;
    assert.equal(x, cx - 25);
    assert.match(label.font, /^15px "Barlow Condensed"/);
    assert.equal(label.state.textAlign, 'center');
    assert.equal(label.state.textBaseline, 'alphabetic');
    near(r, outer - k * (outer - inner) / 6);
    near(baseline - 15 * .72 / 2, cy - Math.sqrt(r * r - 25 * 25));
    near(cx + r * Math.cos(start), x + 11);  // the mock measures each abbreviation at 18 units wide
    near(cx + r * Math.cos(end), x - 11);
    const [tip, tail] = ticks[k].points;
    near(tip.x, x - 17);
    near(Math.hypot(tip.x - cx, tip.y - cy), r);
    near(Math.hypot(tail.x - cx, tail.y - cy), r - 7.5);
  });
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
  assert.ok(!stage.calls.some(engraved), 'the moving part never redraws the engraving');
  const beforeEcho = stage.calls.findIndex(c => c.name === 'drawImage' && c.args[0] === base.canvas);
  const echo = stage.calls.findIndex(c => c.name === 'stroke' && /^rgba\(130,242,166,/.test(String(c.strokeStyle)));
  assert.ok(beforeEcho >= 0 && echo > beforeEcho, 'echoes are drawn over the graticule');
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
  assert.equal(Object.keys(Radar.MATERIAL_FILES).length, 43, 'twelve from batch 1, five from batch 4, 26 parts from batch 5 (SPEC-PARTS)');
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
  // At the layout's own size and at 16:9 (SPEC-WEATHER B: the widened layout passes the same check).
  for (const [width, height] of [[1440, 900], [1600, 900]]) for (const {model, at, lyrics} of cases) {
    const {view, stage} = post(model, width, height);
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
    assert.deepEqual(Layout.check(records), [], model.track.title + ' at ' + at + ', ' + width + ' x ' + height);
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
  // Labels beside a column of lamps share the edge facing the lamps (radar.5 feedback: the drum row names).
  const lampAt = cy => ({type: 'lamp', cx: 80, cy, r: 6});
  const label = (s, right, cy, align) => ({type: 'text', text: s, x: right - 6 * s.length, y: cy - 5, w: 6 * s.length, h: 10, align, ax: align === 'right' ? right : right - 6 * s.length, ay: cy});
  assert.deepEqual(Layout.check([panel, lampAt(20), lampAt(40), label('CYM', 66, 20, 'left'), label('KICK', 70, 40, 'left')]).map(q => q.kind), ['column'], 'ragged before the lamps');
  assert.deepEqual(Layout.check([panel, lampAt(20), lampAt(40), label('CYM', 68, 20, 'right'), label('KICK', 68, 40, 'right')]), [], 'one right edge before the lamps');
});

test('Codex QA (qa-gpt/REPORT.md): the chord card prints whole names, bar readings stay in the measured bars, a space takes a tape cell, other metres say they have bar lines, drum cells fill the row', () => {
  const lanes = [{id: 'g', kind: 'pitched', group: 'guitar', notes: [[1, 4, 60, 100]]}];
  // R01 (on the chord wheels, SPEC-WEATHER A): Fsus4 and F#m7b5 read whole on the three wheels, the longest quality at
  // 14 px or more; a slash chord shows its chord on the wheels and its bass as the INV lamp.
  for (const [label, wheels] of [['Fsus4', 'F|sus4'], ['F#m7b5', 'F|#|m7b5'], ['Dbmaj7/F', 'D|b|maj7']]) {
    const chord = post(steady(lanes, 64, {chords: [[0, 10, label]]})).frame(5).motion.chord;
    assert.equal(chord.wheels.map(w => w.glyph).filter(Boolean).join('|'), wheels, label + ' at ' + chord.size + ' px');
    assert.ok(chord.size >= 14, label + ': the quality at ' + chord.size + ' px');
    if (label.includes('/')) assert.ok(chord.quality.includes('INV'));
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
  // R05: bar lines of five beats get the bar grid (20 steps) and say so (not "no bar lines").
  const five = Array.from({length: 161}, (_, i) => i / 2), fiveDown = five.filter((_, i) => i % 5 === 0);
  const fiveFrame = post({...song, track: {...song.track, duration: 80}, bars: {bpm: 120, beatsPerBar: 5, beats: five, downbeats: fiveDown, steady: true}, lanes});
  Radar.audit(true);
  try { fiveFrame.view.draw(20); } finally { var five5 = Radar.audited(); Radar.audit(false); }
  assert.ok(five5.some(r => r.type === 'text' && r.text === '5 BEATS / BAR · 20 STEPS'));
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
  // R22: a long title of characters outside the BMP is shortened by whole characters (SPEC-TELEPRINTER 7: smaller first,
  // then the title alone, then cut by characters, never an ellipsis).
  const title = post(steady(lanes, 64, {track: {...song.track, title: 'iiiii秋' + '\u{20BB7}'.repeat(48), artist: '', duration: 64}})).frame(5).motion.teleTitle;
  assert.ok(!title.includes('…') && title.length > 6 && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(title), 'whole characters, no ellipsis: ' + title);
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
  // Each channel sits at one level (-25 dB), which is then its own red line: on its calibrated dial that is the start
  // of the red arc (METER_RED .8), and the mark goes there.
  assert.ok(marks.every(m => Math.abs(m.at - .8) < .03), 'each at its mean level while heard: ' + JSON.stringify(marks));
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
      // At zero for longer than the bulb's afterglow (.25 s): dark.
      if (m.meters[ch] === 0 && frame(t - .3).motion.meters[ch] === 0) { zeroSeconds++; assert.ok(m.lamps[ch].green < .5, `${ch} at ${t}: needle at zero, green ${m.lamps[ch].green}`); }
    }
  }
  assert.ok(zeroSeconds > 100, 'the residue seconds were looked at');
  // The residue does not pull the grades down: guitar's amber and red only on its loud part, drums never lit.
  const at = t => frame(t).motion.lamps.guitar;
  assert.ok(at(20).green < .5 && at(33).green > .5 && at(33).red < .5 && at(58).red > .5, 'green from the meter zero, red on the loudest part only');
  assert.ok([10, 35, 55].every(t => frame(t).motion.lamps.drums.green < .5), 'residue alone never lights a lamp');
  // One number: the meters' zero is the lamps' gate (the source says so, so a change of zero moves both).
  const src = readFileSync(join(__dirname, '../score-radar.js'), 'utf8');
  assert.match(src, /if \(db <= METER_ZERO_DB\) return 0;/);
  assert.match(src, /Lm\.thresholds\(levels, \{gateDb: METER_ZERO_DB\}\)/);
});

test('radar.5 feedback: each meter is calibrated for its channel, and the lamps show the zone the needle is in, at every moment', () => {
  // Three channels with their own ranges, each level moving up and down over the song (a second a value).
  const wave = (base, swing, period) => Array.from({length: 90}, (_, i) => +(base + swing * Math.sin(i / period)).toFixed(1));
  const levels = {hop: 1, groups: {vocals: wave(-20, 12, 3.1), guitar: wave(-28, 8, 2.3), bass: wave(-14, 5, 4.7)}};
  const lanes = ['vocals', 'guitar', 'bass'].map(group => ({id: group, kind: 'pitched', group, notes: [[0, 90, 60, 100]]}));
  const {frame, stage} = post(steady(lanes, 90, {levels}));
  const zone = v => v >= .8 ? 3 : v >= .6 ? 2 : v > .005 ? 1 : 0;
  const lit = l => l.red > .5 ? 3 : l.yellow > .5 ? 2 : l.green > .5 ? 1 : 0;
  const history = {};
  let checked = 0, inRed = 0;
  for (let t = .1; t < 89; t += .1) {
    stage.reset();   // the recording canvas keeps every call: one frame at a time
    const m = frame(+t.toFixed(2)).motion;
    for (const ch of ['vocals', 'guitar', 'bass']) {
      const z = zone(m.meters[ch]), l = lit(m.lamps[ch]);
      (history[ch] ||= []).push(z);
      // The reported needle is rounded to 3 places: a reading within .002 of a zone edge is not judged.
      if ([.005, .6, .8].some(edge => Math.abs(m.meters[ch] - edge) < .002)) continue;
      // Never a lamp below the needle's zone; above it only as afterglow (the needle was in that zone within .25 s).
      assert.ok(l >= z, `${ch} at ${t.toFixed(2)}: needle zone ${z}, lamps ${l}`);
      if (l > z) assert.ok(history[ch].slice(-4).some(h => h >= l), `${ch} at ${t.toFixed(2)}: a lamp lit before the needle got there`);
      checked++; if (z === 3) inRed++;
    }
  }
  assert.ok(checked > 2500 && inRed > 25, 'every channel swept, the red arc reached');
});

test('radar.8 feedback: the VOX scope sweeps left to right with the disc, the new trace over the old; even in brightness, no dark half', () => {
  // One sung phrase from 2 to 6 s; 120 bpm 4/4, so one turn of the disc (four bars) is 8 s and so is one sweep.
  const lanes = [{id: 'v', kind: 'pitched', group: 'vocals', notes: [[2, 4, 64, 100]]}, {id: 'g', kind: 'pitched', group: 'guitar', notes: [[0, 20, 60, 100]]}];
  const {frame, stage} = post(steady(lanes, 20));
  // The spot is where the disc's sweep is: the turn's fraction.
  for (const t of [9, 10, 12, 14, 15.9]) assert.ok(Math.abs(frame(t).motion.voxSweep.phase - ((t / 8) % 1)) < 1e-3);
  // Nothing jumps from one frame to the next, across the fly-back at 8 s and 16 s too.
  let last = null;
  for (let t = 5.5; t < 16.5; t += .05) {
    const share = frame(+t.toFixed(2)).motion.voxShare;
    if (last !== null) assert.ok(Math.abs(share - last) < .03, `at ${t.toFixed(2)} the sung part jumped from ${last} to ${share}`);
    last = share;
  }
  // The phrase stays on the screen as the previous sweep until the spot writes over it in the next one.
  assert.ok(frame(8.1).motion.voxShare > .4, 'just after the fly-back the phrase is still there, from the last sweep');
  assert.ok(frame(10.2).motion.voxShare > .3, 'ahead of the spot, the old sweep keeps it');
  assert.equal(frame(14.6).motion.voxShare, 0, 'overwritten once the spot has passed where it was');
  // Brightness: this sweep's trace never below SCAN_NEW (.62) however far left; the old sweep at .3, only ahead of the spot.
  for (const t of [8.2, 10, 12, 14, 15.8]) {
    stage.reset(); const m = frame(t).motion;
    const scope = stage.calls.filter(c => c.name === 'stroke' && /^rgba\(130,242,166,/.test(String(c.strokeStyle)) && c.lineWidth === 2);
    const alphas = scope.map(c => +/,([\d.]+)\)$/.exec(c.strokeStyle)[1]);
    assert.ok(alphas.length > 5);
    assert.ok(alphas.every(v => Math.abs(v - .3) < 1e-6 || v >= .62 - 1e-6), `at ${t}: ${alphas.join(' ')}`);
    assert.ok(m.voxSweep.fresh > 0 && m.voxSweep.old > 0 || m.voxSweep.phase > .95);
  }
  assert.equal(frame(8).motion.vox, true);
});

test('radar.5 feedback: no white outline boxes; the drum step shows as neon bulbs, a brass cursor or a backlit column', () => {
  const lanes = [{id: 'g', kind: 'pitched', group: 'guitar', notes: [[1, 4, 60, 100]]}, {id: 'd', kind: 'drums', group: 'drums', hits: [[8, 'kick', 100], [8.5, 'snare', 90]]}];
  const pale = /^#(f0ead2|ffe0a0)$/i;
  for (const look of [undefined, 'neon', 'cursor', 'backlight']) {
    const {frame, stage} = post(steady(lanes, 64, {chords: [[0, 20, 'C']]}), 1440, 900, {...options, ...(look ? {radarStep: look} : {})});
    stage.reset();
    const m = frame(8.6).motion;
    assert.equal(m.stepLook, look || 'neon', 'neon unless chosen');
    // The bezel's 12 o'clock tick (pale paint on the bezel, 4 px wide) is a mark, not a box: the one pale stroke allowed.
    const strokes = stage.calls.filter(c => (c.name === 'stroke' || c.name === 'strokeRect') && pale.test(String(c.strokeStyle)) && c.lineWidth !== 4);
    assert.deepEqual(strokes, [], `${look}: no white / pale gold outline anywhere`);
  }
  // Without bar lines (the 16-beat lamp grid) no white line either.
  const roll = post({...song, track: {...song.track, duration: 30}, bars: {bpm: 120, beats: Array.from({length: 61}, (_, i) => i / 2)}, lanes});
  roll.stage.reset();
  assert.equal(roll.frame(9).motion.drums.mode, 'beats');
  assert.ok(!roll.stage.calls.some(c => c.name === 'stroke' && pale.test(String(c.strokeStyle)) && c.lineWidth !== 4));
});

test('radar.5 feedback: engraved, printed and stuck-on text keeps one colour whatever the data does; only lamp legends change', () => {
  // Four frames: every channel sounding, all dark at 0 s, one channel soloed (the rest off), and a song with no
  // channels at all. Text drawn at the same place with the same words must keep its colour and font in every frame,
  // except the legends lit from behind by their lamps.
  const full = {...fullModel(), bars: steady([]).bars};
  const frames = [post(full), post(full), post(full, 1440, 900, {...options, focusGroup: 'vocals'}), post({...full, lanes: []})];
  const at = [9, 0, 9, 9];
  const seen = new Map(), changed = new Set();
  frames.forEach((v, k) => {
    v.frame(at[k]); v.stage.reset(); v.frame(at[k] + .01);
    for (const t of v.stage.texts()) {
      if (/^rgba\(/.test(t.style)) continue;   // the relief's shadow and highlight passes
      const key = `${t.text}@${Math.round(t.x)},${Math.round(t.y)}`, look = t.style + '|' + t.font;
      if (!seen.has(key)) seen.set(key, look); else if (seen.get(key) !== look) changed.add(t.text);
    }
  });
  const LIT = new Set([...Radar.SECTION_LAMPS, ...Radar.CAUTION]);
  const unexpected = [...changed].filter(text => !LIT.has(text) && !/^[A-G][#b♯♭]?$/.test(text));
  assert.deepEqual(unexpected, [], 'engraved text changed colour with the data: ' + unexpected.join(', '));
  assert.ok([...seen.keys()].some(k => k.startsWith('IN@300,')) && [...seen.keys()].some(k => k.startsWith('OUT@300,')), 'IN / OUT are drawn by every lever');
});

test('radar.8 feedback: a drum lamp lights only when its step is hit, dims by itself to dark in about a bar, and nothing is cleared at a bar line', () => {
  // 120 bpm, a bar 2 s, four steps a beat: one row hit at 8, 8.5, 9, 9.5 (bar 5, steps 0 / 4 / 8 / 12) and at 10.5
  // (bar 6, step 4). The curve: (1 - age / 2 s)^2.
  const lanes = [{id: 'd', kind: 'drums', group: 'drums', hits: [[8, 'kick', 100], [8.5, 'kick', 100], [9, 'snare', 90], [9.5, 'kick', 100], [10.5, 'kick', 100]]}];
  const model = steady(lanes);
  for (const look of ['square', 'round']) {
    const {frame} = post(model, 1440, 900, {...options, radarCell: look});
    const at = t => frame(t).motion.drums.heat[3];
    assert.equal(frame(9.05).motion.cellLook, look);
    const r = at(9.05);
    assert.ok(r[8] > .9, `${look}: the newest hit is bright`);
    assert.ok(r[0] > 0 && r[0] < r[4] && r[4] < r[8], `${look}: older hits are dimmer (${r[0]}, ${r[4]}, ${r[8]})`);
    assert.equal(r[12], 0, 'a hit still to come in the bar is not shown');
    assert.equal(frame(9.05).motion.drums.hits[3][12], '0');
    assert.ok(Math.abs(r[0] - (1 - 1.05 / 2) ** 2) < 2e-3, 'one curve: (1 - age / bar)^2');
    // Across the bar line (10 s): nothing cleared; the last bar's lamps keep dimming, each by its own age.
    const before = at(9.98), after = at(10.02);
    for (const st of [4, 8, 12]) assert.ok(after[st] > 0 && after[st] < before[st] && before[st] - after[st] < .05, `step ${st} dims on smoothly across the bar line`);
    // Dark to the end: a bar after its hit a lamp is out, until its step is hit again.
    assert.equal(at(10.01)[0], 0, 'the hit at 8 s is dark two seconds later');
    assert.ok(at(10.55)[4] > .9, 'step 4 lit again by the hit at 10.5');
    assert.equal(at(11.6)[8], 0, 'the hit at 9 s is out by 11 s');
    // A function of song time: a seek shows the afterglow of the hits before it.
    assert.deepEqual(post(model, 1440, 900, {...options, radarCell: look}).frame(10.3).motion.drums.heat, frame(10.3).motion.drums.heat);
  }
  assert.equal(post(model).frame(9).motion.cellLook, 'round', 'round lamps unless chosen (the user\'s pick)');
  // Without bar lines (the 16-beat grid) the same curve, to dark over one sweep (16 beats = 8 s here).
  const roll = post({...song, track: {...song.track, duration: 30}, bars: {bpm: 120, beats: Array.from({length: 61}, (_, i) => i / 2)}, lanes});
  assert.equal(roll.frame(9).motion.drums.mode, 'beats');
  assert.ok(roll.frame(9.6).motion.drums.heat[3].some(h => h > 0));
  assert.ok(roll.frame(19).motion.drums.heat.every(row => row.every(h => h === 0)), 'eight seconds (16 beats) after the last hit every lamp is dark');
  const lamps = post(model).frame(10.79);
  assert.ok(lamps.motion.drums.heat[3][4] > .5);
});

test('radar.5 feedback: the VOX beam eases between a pitch and the baseline, never a step; a faint noise that repeats for the same moment', () => {
  // One sung phrase from 2 to 6 s (64, then 70 from 4 s: about 20 px below and above the baseline); the beam's points read from its strokes (the phosphor green).
  const lanes = [{id: 'v', kind: 'pitched', group: 'vocals', notes: [[2, 2, 64, 100], [4, 2, 70, 100]]}, {id: 'g', kind: 'pitched', group: 'guitar', notes: [[0, 20, 60, 100]]}];
  const beam = (v, t) => {
    v.stage.reset(); v.frame(t);
    return v.stage.strokes().filter(s => /^rgba\(130,242,166/.test(String(s.style))).flatMap(s => s.points).filter(q => q.x > 300 && q.x < 500)
      .sort((a, b) => a.x - b.x).filter((q, i, all) => !i || q.x - all[i - 1].x > .01);
  };
  // The steepest step between neighbouring points in the window's part [from, to] (fractions of its 4 s, left to right).
  const steepest = (points, from = 0, to = 1) => { const part = points.slice(Math.floor(from * (points.length - 1)), Math.ceil(to * (points.length - 1)) + 1);
    return Math.max(...part.slice(1).map((q, i) => Math.abs(q.y - part[i].y))); };
  const quiet = post(steady(lanes, 20), 1440, 900, {...options, radarNoise: false});
  // At 6.8 s the window is 2.8 .. 6.8 s: the phrase end (6 s) at .8 of it. At 3 s the window is -1 .. 3 s: the onset at .75.
  assert.ok(steepest(beam(quiet, 6.8), .7) < 8, 'the phrase end falls to the baseline over several points');
  assert.ok(steepest(beam(quiet, 3), .6) < 20, 'the onset rises over more than one point');
  const noisy = post(steady(lanes, 20));
  const a = beam(noisy, 15).map(q => q.y), b = beam(noisy, 15).map(q => q.y);
  assert.deepEqual(a, b, 'the same moment, the same noise');
  const flat = beam(quiet, 15).map(q => q.y);
  assert.ok(a.some((y, i) => Math.abs(y - flat[i]) > .05) && a.every((y, i) => Math.abs(y - flat[i]) <= 1.2), 'the baseline jitters by under a pixel and a bit');
});

test('SPEC-WEATHER A + SPEC-WHEELS: the chord wheels show root, accidental and quality; a change turns the drums the short way; no chord leaves them blank', () => {
  const lanes = [{id: 'g', kind: 'pitched', group: 'guitar', notes: [[1, 20, 60, 100]]}];
  // C (0 .. 4), F#m7b5 (4 .. 8), nothing (8 .. 10), Bbsus4 (10 .. 14).
  const model = steady(lanes, 20, {chords: [[0, 4, 'C'], [4, 8, 'F#m7b5'], [10, 14, 'Bbsus4']]});
  for (const scheme of ['dark', 'light']) {
    const {frame} = post(model, 1440, 900, {...options, radarWheel: scheme});
    const at = t => frame(t).motion.chord;
    assert.equal(at(2).scheme, scheme);
    assert.deepEqual(at(2).wheels.map(w => w.glyph), ['C', '', '']);
    assert.deepEqual(at(6).wheels.map(w => w.glyph), ['F', '#', 'm7b5']);
    assert.deepEqual(at(9).wheels.map(w => w.glyph), ['', '', ''], 'no chord: every wheel on its blank cell');
    assert.deepEqual(at(12).wheels.map(w => w.glyph), ['B', 'b', 'sus4']);
    // Root cells in fifths ('', F, C, G, D, A, E, B): C (cell 2) to F (cell 1) is one cell down. The quality, blank
    // (cell 0) to m7b5 (cell 8 of 13), goes five cells down through the wrap. Mid-turn between cells; settled and
    // on the cells once the slowest drum lands; a paused frame repeats.
    const half = at(4.03), root = half.wheels[0].pos, quality = half.wheels[2].pos;
    assert.equal(half.rolling, true);
    assert.ok(root > 1 && root < 2, 'C (cell 2) turning toward F (cell 1): ' + root);
    assert.ok(quality < 0 && quality > -5, 'blank turning toward m7b5 (cell -5) the short way: ' + quality);
    assert.equal(at(4.5).rolling, false);
    assert.deepEqual(at(4.5).wheels.map(w => w.pos), [1, 1, -5]);
    assert.deepEqual(at(4.03), half);
    // The lamps do not wait for the drums: lit at the chord's first moment, while the drums are still at the old cells.
    const onset = at(4);
    assert.equal(onset.rolling, true);
    assert.deepEqual(onset.wheels.map(w => w.pos), [2, 0, 0]);
    assert.deepEqual(onset.quality.sort(), ['7', 'DIM', 'MIN']);
    assert.equal(onset.fifths[6], 1, 'F# lit at once');
    // The short way: blank (cell 0) to B (cell 7) turns backwards through the wrap, not forward through F .. E.
    const back = at(10.03).wheels[0].pos;
    assert.ok(back < 0 && back > -1, 'blank -> B the short way: ' + back);
  }
  assert.equal(post(model).frame(2).motion.chord.scheme, 'light', 'light wheels unless chosen (the user\'s pick)');
});

test('radar.8 feedback: 88 lamps over a printed keyboard; a lamp lights at its onset, holds while the note sounds, dims to dark; brighter for harder notes', () => {
  // C4 (60) loud 2 .. 3 s, E4 (64) soft 2 .. 3 s, C#4 (61, a black key) 5 .. 6 s; velocities 30 .. 120 across the song.
  const notes = [[2, 1, 60, 120], [2, 1, 64, 30], [5, 1, 61, 90], [8, 1, 72, 60]];
  const model = steady([{id: 'p', kind: 'pitched', group: 'piano', notes}], 20);
  const {frame, stage} = post(model);
  const lamps = t => Object.fromEntries(frame(t).motion.keyLamps.lit);
  assert.equal(frame(2.5).motion.keyLamps.velocity, 'velocity');
  assert.deepEqual(lamps(1.9), {}, 'nothing lights before its onset');
  const on = lamps(2.5);
  assert.ok(on[60] > .95 && on[64] > .2 && on[64] < .45, `loud bright, soft dim (${on[60]}, ${on[64]})`);
  assert.ok(lamps(3.2)[60] < on[60] && lamps(3.2)[60] > 0, 'after the note ends it dims');
  assert.equal(lamps(3.45)[60], undefined, 'dark .4 s after the end');
  assert.ok(lamps(5.5)[61] > 0, 'a black key has its lamp');
  // The printed keyboard and the 88 holes are hardware (drawn with the base); only lit lenses are drawn live.
  stage.reset(); frame(0.5);
  const holes = stage.calls.filter(c => c.name === 'arc' && c.fillStyle === '#141510');
  assert.ok(holes.length >= 88, 'the 88 holes (and the drum lamps\' own)');
  // A black key's lamp sits half a row higher than the white keys' row.
  const at = m => { stage.reset(); frame(m === 61 ? 5.5 : 2.5); return stage.calls.filter(c => c.name === 'arc' && /^rgb\(/.test(String(c.fillStyle))).map(c => c.args.slice(0, 2)); };
  const ys = new Set([...at(60), ...at(61)].map(([, y]) => Math.round(y)));
  assert.ok(ys.size >= 2, 'two rows: white keys and, half a row up, black keys');
  // All velocities alike: every lamp the same.
  const flat = post(steady([{id: 'p', kind: 'pitched', group: 'piano', notes: notes.map(n => [n[0], n[1], n[2], 80])}], 20)).frame(2.5).motion.keyLamps;
  assert.equal(flat.velocity, 'flat');
  assert.deepEqual(flat.lit.map(([, v]) => v), [1, 1]);
});

test('radar.9 feedback: an echo stays where it was drawn: the same note has the same angles a beat later, with bar lines, beats only or no beats', () => {
  // A held guitar note 2.07 .. 6.27 s and a short bass note at 3.03 s; frames at 5.03 and 5.53 s (one beat at 120 bpm),
  // none of them on the disc's 1/64-turn grid.
  const lanes = [{id: 'g', kind: 'pitched', group: 'guitar', notes: [[2.07, 4.2, 60, 100]]}, {id: 'b', kind: 'pitched', group: 'bass', notes: [[3.03, .2, 40, 100]]}];
  const beats = Array.from({length: 61}, (_, i) => i / 2);
  const grids = {bars: steady(lanes, 30), beats: {...song, track: {...song.track, duration: 30}, bars: {bpm: 120, beats}, lanes},
    none: {...song, track: {...song.track, duration: 30}, bars: {bpm: 120}, lanes}};
  for (const [name, model] of Object.entries(grids)) {
    const {frame, stage} = post(model);
    const pieces = t => { frame(t); stage.reset(); frame(t);
      return stage.calls.filter(c => c.name === 'arc' && /^rgba\(130,242,166/.test(String(c.strokeStyle || c.fillStyle)) && c.args[2] > 30 && c.args[2] < 260)
        .map(c => [+c.args[2].toFixed(3), +c.args[3].toFixed(5)]); };
    const a = pieces(5.03), b = pieces(5.53);
    assert.ok(a.length > 3, name + ': echoes drawn');
    // Every piece of the first frame starts at the same angle on the same ring in the second (the held note's pieces
    // are cut on the disc's own grid, so a growing note adds pieces, it does not move them).
    const missing = a.filter(([r, s0]) => !b.some(([r2, s2]) => r2 === r && Math.abs(s2 - s0) < 1e-4));
    assert.deepEqual(missing, [], name + ': a piece moved between 5.03 and 5.53 s');
  }
});
