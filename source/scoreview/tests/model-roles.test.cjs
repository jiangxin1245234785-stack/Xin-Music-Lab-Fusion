'use strict';
// Stage two of the lead / accompaniment layer in the model (work/score-roles-20261114/SPEC-2.md §1), and
// the vocal line judged current by XLD's own rule before it is drawn (§6, work/xld-vocals-20261114/INTERFACE.md).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const adapter = require(process.env.SCOREVIEW_ADAPTER || path.join(__dirname, '..', 'adapter', 'track-model.cjs'));

const FIXTURE_STEMS = path.join(__dirname, '..', '..', '..', 'work', 'scoreview-20261110', 'xml-fixture', 'analysis',
  'Unknown Artist - single', '01 周杰伦 - 七里香__0774d037b1', 'stems.json');

// A stepwise tune in seconds: {start, end, pitch, velocity}, one note every 0.4 s.
const tune = (from, count, base = 67) => Array.from({length: count}, (_, i) => {
  const steps = [0, 2, 4, 5, 4, 2, 0, -1, 0, 2, 4, 2, 5, 7, 5, 4, 2, 4, 5, 7];
  return {start: from + i * 0.4, end: from + i * 0.4 + 0.35, pitch: base + steps[i % steps.length], velocity: 90};
});
const strum = (from, count) => Array.from({length: count}, (_, i) => [60, 64, 67].map(p => ({start: from + i * 0.5, end: from + i * 0.5 + 0.4, pitch: p, velocity: 80}))).flat();

function input(extra = {}) {
  return {
    track: {id: 't', title: '测试', artist: '某人', album: '某专辑'}, duration: 40,
    stems: {
      guitar: {notes: [...tune(2, 20), ...strum(20, 20)], engine: 'muscriptor-medium', runId: 'g'},
      piano: {notes: strum(2, 30), engine: 'piano-transkun', runId: 'p'},
      bass: {notes: tune(2, 30, 40), engine: 'b', runId: 'b'},
      drums: {notes: [{start: 1, end: 1.1, pitch: 36, velocity: 100}], engine: 'd', runId: 'd'}
    },
    ...extra
  };
}

test('every judged lane carries roles (1 lead, 0 accompaniment, one per note) and its lead lines; the notes are untouched', () => {
  const plain = adapter.modelFrom(input());
  assert.ok(plain.ok);
  const {model, health} = plain;
  const guitar = model.lanes.find(l => l.id === 'guitar'), piano = model.lanes.find(l => l.id === 'piano');
  for (const lane of [guitar, piano]) {
    assert.ok(Array.isArray(lane.roles) && lane.roles.length === lane.notes.length, lane.id);
    assert.ok(lane.roles.every(r => r === 0 || r === 1));
    assert.ok(Array.isArray(lane.leadLines));
  }
  assert.ok(guitar.roles.some(r => r === 1), 'the guitar tune leads');
  assert.ok(guitar.leadLines.length >= 1 && guitar.leadLines.every(([a, b]) => b > a));
  assert.ok(piano.roles.every(r => r === 0), 'the piano only strums');
  assert.deepEqual(health.roles, {ok: true, lanes: 2, notes: guitar.notes.length + piano.notes.length, lead: guitar.roles.filter(Boolean).length});
  // The notes are exactly those made without the role layer.
  const {rolesOf} = require('../adapter/roles.cjs');
  const out = rolesOf(model);
  assert.deepEqual(guitar.roles, out.lanes.guitar.roles.map(r => (r === 'lead' ? 1 : 0)));
  assert.deepEqual(guitar.notes.slice(0, 3), [[2, 0.35, 67, 90], [2.4, 0.35, 69, 90], [2.8, 0.35, 71, 90]]);
});

test('vocals, bass, drums and the texture band carry no roles', () => {
  const levels = {hop: 1, groups: {other: Array(40).fill(-20), guitar: Array(40).fill(-20), piano: Array(40).fill(-20), vocals: Array(40).fill(-90)}};
  const line = {kind: 'score-vocals', lane: {notes: [[1, 0.5, 60, 90], [2, 0.5, 62, 90]]}};
  const {model} = adapter.modelFrom(input({layers: {kind: 'score-layers', levels}, vocalLine: line}));
  for (const id of ['vocals', 'bass', 'drums', 'texture']) {
    const lane = model.lanes.find(l => l.id === id);
    assert.ok(lane, id);
    assert.equal(lane.roles, undefined, id);
    assert.equal(lane.leadLines, undefined, id);
  }
});

test('a failing judgement does not fail the model: no lane gets roles, health says why', () => {
  const model = {lanes: [{id: 'guitar', kind: 'pitched', group: 'guitar', notes: [[0, 1, 60, 90], null, [2, 1, 62, 90]]},
                         {id: 'piano', kind: 'pitched', group: 'piano', notes: [[0, 1, 60, 90]], roles: [1], leadLines: [[0, 1]]}]};
  // The piano comes in with roles already (a model made before): a failed judgement must not leave them.
  const health = {};
  adapter.rolesInto(model, health);
  assert.equal(health.roles.ok, false);
  assert.ok(health.roles.why.length > 0);
  assert.ok(model.lanes.every(lane => lane.roles === undefined && lane.leadLines === undefined));
  // And through modelFrom: a model still comes out.
  const made = adapter.modelFrom(input());
  assert.ok(made.ok && made.health.roles.ok);
});

// --- the vocal line: current or not ---------------------------------------------------------

function wavFloat(file, frames, channels = 2, rate = 44100) {
  const bytes = frames * channels * 4, b = Buffer.alloc(44 + bytes);
  b.write('RIFF', 0); b.writeUInt32LE(36 + bytes, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(3, 20); b.writeUInt16LE(channels, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * channels * 4, 28);
  b.writeUInt16LE(channels * 4, 32); b.writeUInt16LE(32, 34); b.write('data', 36); b.writeUInt32LE(bytes, 40);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, b);
}
// A track folder as XLD leaves it after separation and the vocal line, small: stems.json (checked against an
// original file), six stems, score-vocals.json made from the vocal stem, and the lead / backing split.
function analysedTrack(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'score-vocals-current-'));
  const dir = path.join(root, 'Someone - Album', '01 Song__abcdef0123');
  fs.mkdirSync(dir, {recursive: true});
  const original = path.join(root, 'song.mp3');
  fs.writeFileSync(original, 'not really audio');
  const base = JSON.parse(fs.readFileSync(FIXTURE_STEMS, 'utf8'));
  const runId = base.runId, frames = 16;
  const stat = fs.statSync(original);
  const stems = {...base, trackId: 'abcdef0123456789', source: {path: original, size: stat.size, mtimeMs: stat.mtimeMs},
    stems: ['bass', 'piano', 'guitar', 'drums', 'vocals', 'other'].map(name => ({name, file: `stems/${runId}/${name}.wav`, sampleRate: 44100, channels: 2, frames}))};
  fs.writeFileSync(path.join(dir, 'stems.json'), JSON.stringify(stems));
  for (const stem of stems.stems) wavFloat(path.join(dir, stem.file), frames);
  const vocals = path.join(dir, 'stems', runId, 'vocals.wav'), vs = fs.statSync(vocals);
  const split = 'c2b05bac-0000-4000-8000-000000000001', key = 'a'.repeat(64);
  wavFloat(path.join(dir, 'refinement', split, 'target.wav'), frames);
  wavFloat(path.join(dir, 'refinement', split, 'residual.wav'), frames);
  fs.writeFileSync(path.join(dir, 'refinement', key + '.json'), JSON.stringify({kind: 'refinement', engine: 'karaoke-lead', runId: split,
    originalSource: {runId, size: vs.size, mtimeMs: vs.mtimeMs}}));
  const source = options.oldFormat ? {stemRunId: runId} : {stemRunId: runId, stem: 'vocals', path: vocals, size: vs.size, mtimeMs: vs.mtimeMs};
  fs.writeFileSync(path.join(dir, 'score-vocals.json'), JSON.stringify({schemaVersion: 1, kind: 'score-vocals', engine: {id: 'score-vocals'}, duration: 30,
    segments: [], source, lane: {id: 'vocals', kind: 'melody', notes: [[1, 0.5, 60, 90], [2, 0.5, 62, 90]], contour: {hop: 0.01, start: 0, midi: [60, 60.2]}},
    why: null, provenance: {split: {engine: 'karaoke-lead', runId: split, manifest: `refinement/${key}.json`, lead: `refinement/${split}/target.wav`, backing: `refinement/${split}/residual.wav`}}}));
  return {root, dir, vocals, original, split, cleanup: () => fs.rmSync(root, {recursive: true, force: true})};
}
const modelWith = line => adapter.modelFrom(input({vocalLine: line}));

test('a current vocal line is read and drawn', async () => {
  const t = analysedTrack();
  try {
    const line = await adapter.readVocalLine(t.dir);
    assert.equal(line.kind, 'score-vocals');
    const {model, health} = modelWith(line);
    assert.equal(health.vocalsRun, true);
    assert.equal(model.lanes.find(l => l.id === 'vocals').notes.length, 2);
  } finally { t.cleanup(); }
});

test('a vocal line made from another vocal stem is out of date: not drawn, and the host offers to run it again', async () => {
  const t = analysedTrack();
  try {
    fs.appendFileSync(t.vocals, Buffer.alloc(8));   // the stem was made again: another size and time
    const line = await adapter.readVocalLine(t.dir);
    assert.deepEqual([line.kind, line.state], [adapter.STALE_KIND, 'stale']);
    const {model, health} = modelWith(line);
    assert.equal(health.vocalsRun, false, 'XML shows its "add the vocal curve" button when this is false');
    assert.equal(health.contour.stale, 'stale');
    assert.match(health.contour.why, /过期/);
    assert.equal(model.lanes.find(l => l.id === 'vocals'), undefined);
  } finally { t.cleanup(); }
});

test('lead / backing removed (the storage page) is out of date too', async () => {
  const t = analysedTrack();
  try {
    fs.rmSync(path.join(t.dir, 'refinement', t.split, 'target.wav'));
    const line = await adapter.readVocalLine(t.dir);
    assert.deepEqual([line.kind, line.state], [adapter.STALE_KIND, 'split-missing']);
    assert.equal(modelWith(line).health.vocalsRun, false);
  } finally { t.cleanup(); }
});

test('an old result that only recorded the run id is out of date, as XLD judges it', async () => {
  const t = analysedTrack({oldFormat: true});
  try {
    const line = await adapter.readVocalLine(t.dir);
    assert.deepEqual([line.kind, line.state], [adapter.STALE_KIND, 'stale']);
  } finally { t.cleanup(); }
});

test('stems that no longer fit the original file: the old line is not drawn, and nothing is offered', async () => {
  const t = analysedTrack();
  try {
    fs.appendFileSync(t.original, 'changed');
    const line = await adapter.readVocalLine(t.dir);
    assert.deepEqual([line.kind, line.state], [adapter.STALE_KIND, 'no-stem']);
    const {model, health} = modelWith(line);
    assert.equal(health.vocalsRun, true, '没有有效分轨时不该提示补人声曲线');
    assert.equal(model.lanes.find(l => l.id === 'vocals'), undefined);
  } finally { t.cleanup(); }
});

test('no result at all is as before; without XLD\'s modules the result is taken as it is', async () => {
  const t = analysedTrack();
  try {
    assert.equal((await adapter.readVocalLine(t.dir, null)).kind, 'score-vocals');
    fs.appendFileSync(t.vocals, Buffer.alloc(8));
    assert.equal((await adapter.readVocalLine(t.dir, null)).kind, 'score-vocals', 'no judge, no verdict');
    fs.rmSync(path.join(t.dir, 'score-vocals.json'));
    assert.equal(await adapter.readVocalLine(t.dir), null);
    assert.equal(modelWith(null).health.vocalsRun, false);
  } finally { t.cleanup(); }
});

test('XLD\'s judgement throwing is not taken as "current": the old line is not drawn, and a run is offered', async () => {
  const t = analysedTrack();
  try {
    const failing = (where) => ({
      createDerivedAssets: () => { if (where === 'assets') throw new Error('assets broke'); return {readStems: async () => ({ok: false})}; },
      scoreVocals: {read: async () => { throw new Error('read broke'); }}
    });
    for (const where of ['read', 'assets']) {
      const line = await adapter.readVocalLine(t.dir, failing(where));
      assert.equal(line.kind, adapter.STALE_KIND, where);
      assert.equal(line.state, 'unreadable', where);
      assert.match(line.why, /broke/);
      const {model, health} = modelWith(line);
      assert.equal(model.lanes.find(l => l.id === 'vocals'), undefined, '判断出错时不该照画旧的人声线');
      assert.equal(health.vocalsRun, false, '判断出错时应当提示重跑');
      assert.equal(health.contour.stale, 'unreadable');
    }
  } finally { t.cleanup(); }
});
