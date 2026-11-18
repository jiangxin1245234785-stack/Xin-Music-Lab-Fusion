'use strict';
// Stage two, B1: the adapter that turns a track as XML holds it into the score-view model.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {ScoreView, mockCanvas} = require('./helpers.cjs');
const {modelFrom, readStems, nameSections, STEMS, DRUM_ROWS} = require('../adapter/track-model.cjs');

const REPO = path.join(__dirname, '..', '..', '..');
const note = (start, end, pitch, velocity = 100) => ({start, end, pitch, velocity});
const manifest = () => ({
  schemaVersion: 2, contract: 'xld.music-lab/2', timing: {unit: 'seconds', origin: 0, duration: 60},
  track: {id: 'abc', number: 1, title: '歌', artist: '人', album: '专辑', source: 'C:\\somewhere\\song.flac'},
  analyses: [
    {engine: {id: 'msaf'}, segments: [{start: 0, end: 30, label: 'A'}, {start: 30, end: 60, label: 'B'}]},
    {engine: {id: 'songformer'}, segments: [
      {start: 0, end: 10, label: 'intro'}, {start: 10, end: 30, label: 'verse'}, {start: 30, end: 30.4, label: 'chorus'},
      {start: 30.4, end: 50, label: 'verse'}, {start: 50, end: 55, label: 'silence'}, {start: 55, end: 60, label: 'outro'}]}
  ],
  harmony: [{engine: {id: 'chord-btc'}, segments: [
    {start: 0, end: 20, label: 'C', confidence: 0.9}, {start: 20, end: 40, label: 'N', confidence: 0.9}, {start: 40, end: 60, label: 'Am', confidence: 0.8}]}],
  manualTags: []
});
const stems = () => ({
  vocals: {notes: [note(1, 2, 60), note(2, 3, 62)], engine: 'vocals-pyin', runId: 'v'},
  guitar: {notes: [note(5, 6, 52), note(0.5, 1, 55)], engine: 'muscriptor-medium', runId: 'g'},
  drums: {notes: [note(1, 1.1, 36), note(1.5, 1.6, 38), note(2, 2.1, 99)], engine: 'drums-adtof', runId: 'd'},
  bass: {error: 'midi-missing'}
});
const input = extra => ({track: {id: 'abc'}, duration: 60, audioUrl: 'file:///song.flac', coverUrl: 'file:///cover.jpg', manifest: manifest(), stems: stems(), ...extra});
const draws = model => {
  const surface = mockCanvas();
  const view = ScoreView.create(surface.canvas, model, () => 0, {});
  assert.doesNotThrow(() => { for (const time of [0, 1.5, 30, 59]) view.draw(time); });
  return view;
};

test('a track becomes a model the core accepts, with the layers the track has', () => {
  // The rule sentences: this small track has no moment the marks would pick (cues.test.cjs holds those).
  const built = modelFrom(input({captionStyle: 'sentence'}));
  assert.equal(built.ok, true);
  const layers = draws(built.model).layers();
  assert.deepEqual(built.model.lanes.map(lane => lane.id), ['vocals', 'guitar', 'drums'], '轨的上下顺序是闸门一定的；没有转写的分轨不出现');
  assert.equal(layers.skippedLanes.length, 0);
  assert.ok(layers.chords && layers.chordTones && layers.sections && layers.cover);
  assert.ok(!layers.bars && layers.captions && !layers.energy && !layers.levels && !layers.contour);
  assert.deepEqual(built.model.track, {id: 'abc', title: '歌', artist: '人', album: '专辑', duration: 60, number: 1});
  assert.equal(built.health.lanes.bass.ok, false);
  assert.equal(built.health.bars.ok, false);
});

test('notes come out as [start, length, pitch, velocity], in time order; drums as hits on the seven rows', () => {
  const {model, health} = modelFrom(input());
  const guitar = model.lanes.find(lane => lane.id === 'guitar'), drums = model.lanes.find(lane => lane.id === 'drums');
  assert.deepEqual(guitar.notes, [[0.5, 0.5, 55, 100], [5, 1, 52, 100]]);
  assert.equal(model.lanes.find(lane => lane.id === 'vocals').kind, 'melody');
  assert.deepEqual(drums.rows, DRUM_ROWS);
  assert.deepEqual(drums.hits, [[1, 0, 100], [1.5, 1, 100]]);
  assert.equal(health.lanes.drums.unknownPitches, 1, '不认识的鼓音高要数出来，不能悄悄丢掉');
});

// Phase two of the section names (work/xld-sections-20261113): the 0.4 s chorus is no longer dropped; it joins
// its longer neighbour, and the two verses either side then touch and become one, so there is nothing to number.
test('sections: the engine whose labels mean something wins, slivers join a neighbour, same neighbours merge, silence leaves a gap', () => {
  const {model, health} = modelFrom(input());
  assert.equal(health.sections.engine, 'songformer');
  assert.deepEqual(model.sections.map(row => row[2]), ['引子', '主歌', '尾奏']);
  assert.deepEqual(model.sections.map(row => row[4]), ['intro', 'verse', 'outro']);
  assert.deepEqual(model.sections[1], [10, 50, '主歌', 'songformer', 'verse', ['verse', 'chorus', 'verse']]);
  assert.deepEqual(model.sections[2].slice(0, 2), [55, 60], 'silence (50-55) stays a gap');
  assert.deepEqual(modelFrom(input({lang: 'en'})).model.sections.map(row => row[2]), ['Intro', 'Verse', 'Outro']);
  // A bridge manifest written before segments carried `name` gets the same names as a new one.
  const named = manifest();
  named.analyses[1].segments = named.analyses[1].segments.map(segment => ({...segment, name: 'whatever was written'}));
  assert.deepEqual(modelFrom(input({manifest: named})).model.sections, model.sections, 'names are made from the raw segments, old or new manifest alike');
  const letters = manifest();
  letters.analyses = letters.analyses.slice(0, 1);
  assert.deepEqual(modelFrom(input({manifest: letters})).model.sections, [[0, 30, 'A', 'msaf', 'A'], [30, 60, 'B', 'msaf', 'B']]);
});

test('chords: a stretch nobody names stays out, and each label carries its tones', () => {
  const {model} = modelFrom(input());
  assert.deepEqual(model.chords.map(row => row.slice(0, 3)), [[0, 20, 'C'], [40, 60, 'Am']]);
  assert.deepEqual(model.chordTones, {C: [0, 4, 7], Am: [9, 0, 4]});
});

test('a track with only notes still makes a model; a track with no notes makes none', () => {
  const bare = modelFrom({track: {id: 'x', title: 't'}, audioUrl: 'file:///a.mp3', stems: {piano: {notes: [note(0, 12.5, 60)]}}});
  assert.equal(bare.ok, true);
  assert.equal(bare.model.track.duration, 12.5, '没有别的时长来源时用最后一个音符的结尾');
  const layers = draws(bare.model).layers();
  assert.ok(!layers.chords && !layers.sections && !layers.cover);
  for (const nothing of [{}, {stems: {}}, {stems: {piano: {notes: []}}}, {stems: {drums: {notes: [note(0, 1, 99)]}}}, {stems: {piano: {error: 'midi-stale'}}}]) {
    const none = modelFrom(nothing);
    assert.equal(none.ok, false);
    assert.equal(none.error, 'score-no-notes');
  }
});

test('broken input is skipped, not thrown on', () => {
  const messy = input();
  messy.stems.guitar.notes = [note(1, 0.5, 60), note(-1, 2, 60), note(1, 2, 300), {start: 'x'}, null, note(3, 4, 64, 'loud'), note(5, 6, 65, 900)];
  messy.manifest.analyses = [{engine: {id: 'songformer'}, segments: 'x'}, null, {segments: []}];
  messy.manifest.harmony = [{engine: {id: 'chord-btc'}, segments: [{start: 5, end: 1, label: 'C'}]}];
  const built = modelFrom(messy);
  assert.equal(built.ok, true);
  assert.deepEqual(built.model.lanes.find(lane => lane.id === 'guitar').notes, [[3, 1, 64, 100], [5, 1, 65, 127]]);
  assert.ok(!('sections' in built.model) && !('chords' in built.model));
  draws(built.model);
});

test('the model carries no local path beyond the two addresses the host gave it', () => {
  const text = JSON.stringify(modelFrom(input()).model);
  assert.ok(!text.includes('somewhere'), '清单里的原文件路径不应当进模型');
});

test('original audio keeps its time origin and section ranges stay inside the track', () => {
  const built=modelFrom({audioUrl:'file:///original.flac',duration:12,stems:{piano:{notes:[note(0,1,60)]}},manifest:{analyses:[{engine:{id:'msaf'},segments:[{start:3,end:30,label:'A'}]}]}});
  assert.deepEqual(built.model.audio,{src:'file:///original.flac',offset:0});
  assert.deepEqual(built.model.sections,[[3,12,'A','msaf','A']]);
});

test('unsteady downbeats, nonnumeric levels and broken contour samples cannot become usable layers', () => {
  const built=modelFrom({duration:12,stems:{piano:{notes:[note(0,1,60)]}},layers:{bars:{steady:false,beats:[0,1,2],downbeats:[0,2]},levels:{hop:1,groups:{piano:[-20,'bad',-10]}}},vocalLine:{lane:{notes:[[0,1,60,90]],contour:{hop:.1,midi:[60,null,'bad',NaN,Infinity,62]}}}});
  assert.equal(built.model.bars.steady,false);assert.deepEqual(built.model.bars.downbeats,[]);assert.equal(built.health.bars.ok,false);
  assert.equal(built.health.levels.ok,false);assert.equal(built.model.levels,undefined);
  assert.deepEqual(built.model.lanes.find(l=>l.id==='vocals').contour.midi,[60,null,null,null,null,62]);
  const zero=modelFrom({stems:{},vocalLine:{lane:{notes:[[0,1,60,90]],contour:{hop:0,midi:[60,62]}}}});
  assert(zero.ok);assert.equal(zero.model.lanes[0].contour,undefined);assert.equal(zero.health.contour.ok,false);
});

test('stem notes are read through the host\'s own lookup, one stem at a time, and a failure stays with its stem', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'scoreview-adapter-'));
  fs.writeFileSync(path.join(folder, 'notes.json'), JSON.stringify({notes: [note(0, 1, 40)]}));
  const asked = [];
  const read = await readStems(async stem => {
    asked.push(stem);
    if (stem === 'bass') return {ok: true, directory: folder, notesFile: 'midi/bass/run/notes.json', engine: 'bass-highres', runId: 'run'};
    if (stem === 'piano') return {ok: true, directory: path.join(folder, 'gone'), notesFile: 'notes.json'};
    if (stem === 'guitar') throw new Error('boom');
    return {ok: false, error: 'midi-missing'};
  });
  fs.rmSync(folder, {recursive: true, force: true});
  assert.deepEqual(asked, STEMS);
  assert.deepEqual(read.bass, {notes: [note(0, 1, 40)], engine: 'bass-highres', runId: 'run'});
  assert.equal(read.piano.error, 'ENOENT');
  assert.equal(read.guitar.error, 'boom');
  assert.equal(read.drums.error, 'midi-missing');
});

// Against the library itself: whatever is there today must go through. Counts are not asserted.
test('every bridge file in the analysis root goes through; MEGURI\'s sections cover what stage one\'s builder saw', {skip: !fs.existsSync(path.join(REPO, 'artifacts', 'refinement-three-20260915', 'analysis'))}, () => {
  const root = path.join(REPO, 'artifacts', 'refinement-three-20260915', 'analysis');
  const found = [];
  const walk = folder => {
    for (const entry of fs.readdirSync(folder, {withFileTypes: true})) {
      if (entry.isDirectory()) walk(path.join(folder, entry.name));
      else if (entry.name === 'music-lab.json') found.push(path.join(folder, entry.name));
    }
  };
  walk(root);
  for (const file of found) {
    const bridge = JSON.parse(fs.readFileSync(file, 'utf8'));
    const built = modelFrom({manifest: bridge, stems: {piano: {notes: [note(0, 1, 60)]}}, audioUrl: 'file:///x'});
    assert.equal(built.ok, true, file);
    draws(built.model);
    for (const row of built.model.sections || []) assert.ok(row[1] > row[0] && row[1] <= built.model.track.duration + 0.001, file);
    for (const row of built.model.chords || []) assert.ok(row[1] > row[0] && typeof row[2] === 'string' && row[2] !== 'N', file);
  }
  const pilot = path.join(REPO, 'work', 'scoreview-20261110', 'data', 'meguri', 'bundle.json');
  const meguri = found.find(file => file.includes('MEGURI'));
  if (meguri && fs.existsSync(pilot)) {
    const before = JSON.parse(fs.readFileSync(pilot, 'utf8'));
    const bridge = JSON.parse(fs.readFileSync(meguri, 'utf8'));
    const now = nameSections(bridge.analyses.find(result => result.engine.id === 'songformer').segments, 'songformer', before.track.duration);
    // Since the section names moved to XLD's core/sections.cjs the adapter tidies (merges, renames) while stage one's
    // builder keeps its old table, so the names differ on purpose. What must still agree: the same stretch of the song
    // is covered, and every raw label stage one saw is still there inside some section.
    // Python rounds halves to even and JavaScript away from zero: a millisecond apart at most.
    assert.ok(Math.abs(now[0][0] - before.sections[0][0]) < 0.002);
    assert.ok(Math.abs(now[now.length - 1][1] - before.sections[before.sections.length - 1][1]) < 0.002);
    const kept = new Set(now.flatMap(row => row[5]));
    for (const row of before.sections) assert.ok(kept.has(row[4]), row[4]);
  }
});

/* --- B0: the layers XLD's `score-layers` analysis writes ----------------------------------- */

const {readLayers} = require('../adapter/track-model.cjs');
const layers = () => ({
  kind: 'score-layers', missing: {},
  bars: {beatsPerBar: 4, bpm: 120, beats: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4], downbeats: [0, 2, 4], steady: true, why: null},
  energy: {hop: 0.1, db: Array(600).fill(-20)},
  levels: {hop: 1, groups: {guitar: Array(60).fill(-20), vocals: Array(60).fill(-30), other: Array(60).fill(-40)}}
});

test('with the layers file a track gets bar lines, loudness and stem levels; without it, it is told why', () => {
  const without = modelFrom(input());
  assert.equal(without.health.layersRun, false);
  for (const name of ['bars', 'energy', 'levels']) assert.equal(without.health[name].ok, false);
  const built = modelFrom(input({layers: layers()}));
  assert.equal(built.health.layersRun, true);
  const shown = draws(built.model).layers();
  assert.ok(shown.bars && shown.beats && shown.energy && shown.levels);
  assert.deepEqual(built.model.bars, {beatsPerBar: 4, bpm: 120, beats: layers().bars.beats, downbeats: [0, 2, 4], steady: true});
  assert.deepEqual(Object.keys(built.model.levels.groups), ['guitar', 'vocals', 'other']);
});

test('an unsteady grid keeps its beats and draws no bar line', () => {
  const shaky = layers();
  Object.assign(shaky.bars, {steady: false, beatsPerBar: null, downbeats: [], why: '只有 74% 的小节是 3 拍'});
  const built = modelFrom(input({layers: shaky}));
  assert.deepEqual(built.model.bars.downbeats, []);
  assert.equal(built.model.bars.steady, false);
  assert.ok(built.health.bars.why.includes('74%'));
  const shown = draws(built.model).layers();
  assert.ok(!shown.bars && shown.beats);
  // A grid that says steady but brings no downbeats is not steady either.
  const hollow = layers();
  hollow.bars.downbeats = [];
  assert.equal(modelFrom(input({layers: hollow})).model.bars.steady, false);
});

test('a layer the analysis could not make is missing with its own reason; a malformed one is left out', () => {
  const partial = layers();
  partial.levels = null;
  partial.missing = {levels: 'FileNotFoundError: stems.json'};
  const built = modelFrom(input({layers: partial}));
  assert.ok(!('levels' in built.model) && built.model.bars && built.model.energy);
  assert.equal(built.health.levels.why, 'FileNotFoundError: stems.json');
  for (const broken of [{bars: 'x', energy: {hop: 0, db: [1]}, levels: {hop: 1, groups: {a: 'x', b: []}}}, {bars: {beats: [1, 'x'], downbeats: []}}, 'x', []]) {
    const model = modelFrom(input({layers: broken})).model;
    assert.ok(!('bars' in model) && !('energy' in model) && !('levels' in model), JSON.stringify(broken));
    draws(model);
  }
});

test('the layers file is read from the track folder, and anything else there is not mistaken for it', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'scoreview-layers-'));
  assert.equal(await readLayers(folder), null);
  assert.equal(await readLayers(null), null);
  fs.writeFileSync(path.join(folder, 'score-layers.json'), '{not json');
  assert.equal(await readLayers(folder), null);
  fs.writeFileSync(path.join(folder, 'score-layers.json'), JSON.stringify({kind: 'something-else'}));
  assert.equal(await readLayers(folder), null);
  fs.writeFileSync(path.join(folder, 'score-layers.json'), JSON.stringify(layers()));
  assert.deepEqual(await readLayers(folder), layers());
  fs.rmSync(folder, {recursive: true, force: true});
});

/* --- the lead-vocal line XLD's `score-vocals` analysis writes ------------------------------- */

const {readVocalLine} = require('../adapter/track-model.cjs');
const vocalLine = () => ({kind: 'score-vocals', why: null, lane: {id: 'vocals', label: '人声', kind: 'melody',
  notes: [[40, 1, 62, 90], [41, 1, 64, 80]], contour: {hop: 0.01, start: 0, midi: Array.from({length: 6000}, (_, i) => (i >= 4000 && i < 4200 ? 62 + (i - 4000) / 100 : null))}}});

test('the vocal line takes the place of the vocal lane made from MIDI, and brings the pitch curve', () => {
  const before = modelFrom(input());
  assert.equal(before.health.vocalsRun, false);
  assert.equal(before.health.contour.ok, false);
  const built = modelFrom(input({vocalLine: vocalLine()}));
  assert.deepEqual(built.model.lanes.map(lane => lane.id), ['vocals', 'guitar', 'drums']);
  const lane = built.model.lanes[0];
  assert.deepEqual(lane.notes, [[40, 1, 62, 90], [41, 1, 64, 80]], '音符是主唱那条线的，不是分轨 MIDI 的');
  assert.equal(lane.meta.engine, 'score-vocals');
  assert.equal(built.health.contour.ok, true);
  const shown = draws(built.model);
  assert.equal(shown.layers().contour, true);
  assert.ok(shown.draw(41).contour > 0);
});

test('a song with no vocal MIDI gets its vocal lane from the line, on top', () => {
  const bare = input({vocalLine: vocalLine()});
  delete bare.stems.vocals;
  assert.deepEqual(modelFrom(bare).model.lanes.map(lane => lane.id), ['vocals', 'guitar', 'drums']);
  // The line alone is enough for a score.
  const only = modelFrom({track: {id: 'x'}, audioUrl: 'file:///a', stems: {}, vocalLine: vocalLine()});
  assert.equal(only.ok, true);
  draws(only.model);
});

test('an instrumental, or a broken result, leaves the lanes as they were and says why', () => {
  const none = modelFrom(input({vocalLine: {kind: 'score-vocals', lane: null, why: '人声分轨几乎是空的'}}));
  assert.equal(none.health.vocalsRun, true, '跑过了，只是没有人声：不应当再提示去跑');
  assert.equal(none.health.contour.why, '人声分轨几乎是空的');
  assert.equal(none.model.lanes[0].meta.engine, 'vocals-pyin');
  for (const broken of [{lane: {notes: 'x'}}, {lane: {notes: [[1, 0, 60], ['a', 1, 60], null]}}, {lane: {}}, 'x']) {
    const built = modelFrom(input({vocalLine: broken}));
    assert.equal(built.model.lanes[0].meta.engine, 'vocals-pyin', JSON.stringify(broken));
    draws(built.model);
  }
  const noCurve = vocalLine();
  noCurve.lane.contour = {hop: 0, midi: []};
  const built = modelFrom(input({vocalLine: noCurve}));
  assert.equal(built.model.lanes[0].meta.engine, 'score-vocals');
  assert.ok(!('contour' in built.model.lanes[0]));
  assert.equal(built.health.contour.ok, false);
});

test('the vocal line is read from its own file', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'scoreview-vocals-'));
  assert.equal(await readVocalLine(folder), null);
  fs.writeFileSync(path.join(folder, 'score-vocals.json'), JSON.stringify(layers()));
  assert.equal(await readVocalLine(folder), null, '别的结果放错了名字也不认');
  fs.writeFileSync(path.join(folder, 'score-vocals.json'), JSON.stringify(vocalLine()));
  // The file itself is what is read (XLD not asked) …
  assert.equal((await readVocalLine(folder, null)).lane.notes.length, 2);
  // … and with no stems.json beside it XLD cannot call it current: it is not drawn (SPEC-2 §6; model-roles.test.cjs).
  assert.deepEqual(await readVocalLine(folder), {kind: 'score-vocals-stale', state: 'no-stem'});
  fs.rmSync(folder, {recursive: true, force: true});
});

test('radar PAN: a version 2 layers file brings left minus right per frame; an older one brings none and still loads', () => {
  const v2 = layers();
  v2.levels.pan = {hop: 1, groups: {guitar: Array(60).fill(3), vocals: 'x'}, mix: Array(60).fill(-1.5)};
  const built = modelFrom(input({layers: v2}));
  assert.deepEqual(Object.keys(built.model.levels.pan.groups), ['guitar']);
  assert.equal(built.model.levels.pan.mix.length, 60);
  assert.equal(built.health.levels.pan, true);
  assert.ok(draws(built.model).layers().levels, 'the core takes the model with pan');
  const old = modelFrom(input({layers: layers()}));
  assert.equal(old.model.levels.pan, undefined);
  assert.equal(old.health.levels.pan, false);
  const broken = layers();
  broken.levels.pan = {hop: 0, mix: [1]};
  assert.equal(modelFrom(input({layers: broken})).model.levels.pan, undefined);
});
