'use strict';
// core/midi-evidence.cjs: the check writes one sidecar and nothing else; applying removes only the notes that sit
// in silence, goes through the revision path once per edited instrument, and leaves the original in place.
// Pure Node: the Python judge and the revision writer are injected, as tests/midi-revision-write.cjs does.
const assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const {createMidiEvidence, SILENT} = require('../core/midi-evidence.cjs');

const note = (start, end, pitch) => ({start, end, pitch, velocity: 80});
// Two instruments. Verdicts: 0 ok, 1 weak, 2 no pitch, 3 silent.
const PARENT = [
  {index: 0, name: 'piano', program: 0, isDrum: false, notes: [note(0, 1, 60), note(1, 1.05, 72), note(2, 3, 64), note(3, 3.05, 80)]},
  {index: 1, name: 'pad', program: 48, isDrum: false, notes: [note(0, 2, 48), note(5, 5.05, 50)]},
];
const VERDICTS = [[0, SILENT, 2, SILENT], [1, SILENT]];
const EXTEND = [{'0': 1.8}, {}];

async function world({failOn = null, verdicts = VERDICTS, extend = EXTEND, digest = 'parent-digest'} = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'xld-evidence-test-'));
  const track = {id: 't'};
  const record = id => ({runId: id, stem: 'piano', engine: id === 'parent' ? 'piano-transkun' : 'manual-revision', file: `midi/piano/${id}/piano.mid`,
    source: {path: path.join(root, 'piano.wav')}, sourceRunId: 'src', digests: {midi: id + '-digest'}});
  const state = {runs: new Map([['parent', {record: record('parent'), instruments: PARENT}]]), active: 'parent', calls: [], stale: false, saves: 0};
  const assets = {
    directory: () => root,
    midi: {
      readRun: async (_t, _stem, id) => state.runs.has(id) ? {ok: true, run: state.runs.get(id).record} : {ok: false, error: 'midi-missing', record: null},
      verify: async () => { if (state.stale) throw new Error('midi-stale'); },
      source: async () => ({}),
      read: async () => ({ok: true, runId: state.active}),
      activateRun: async (_t, _stem, id) => { state.active = id; state.calls.push('activate:' + id); return {ok: true}; },
      removeRun: async (_dir, _stem, id) => { state.runs.delete(id); state.calls.push('remove:' + id); },
    },
  };
  const revision = {
    inspect: async (_t, _stem, id) => state.runs.has(id) ? {ok: true, instruments: state.runs.get(id).instruments} : {ok: false, error: 'midi-missing'},
    save: async (_t, {parentRunId, instrument, notes}) => {
      state.calls.push(`save:${parentRunId}:${instrument}:${notes.length}`);
      if (failOn === instrument) return {ok: false, error: 'revision-overlapping-notes'};
      const id = 'rev' + (++state.saves);
      const instruments = state.runs.get(parentRunId).instruments.map(item => item.index === instrument ? {...item, notes} : item);
      state.runs.set(id, {record: record(id), instruments});
      state.active = id;
      return {ok: true, runId: id};
    },
  };
  const runner = async args => {
    const output = args[args.indexOf('--output') + 1];
    await fs.writeFile(output, JSON.stringify({schemaVersion: 1, kind: 'midi-evidence', method: 'audio-evidence-2', params: {}, midiSha256: digest,
      audio: {loudDbfs: -20}, totals: {notes: 6, silent: 3, noPitch: 1, weak: 1, short: 1},
      instruments: PARENT.map((item, at) => ({index: item.index, name: item.name, program: item.program, isDrum: false, noteCount: item.notes.length,
        verdicts: verdicts[at], extend: extend[at]}))}));
    return {ok: true, value: {ok: true}};
  };
  return {root, track, state, evidence: createMidiEvidence({assets, revision, runner})};
}
const listing = async root => (await fs.readdir(root, {recursive: true})).map(name => name.replace(/\\/g, '/')).sort();

(async () => {
  const roots = [];
  try {
    // check: one file, in evidence/, and the run directory is never written to
    let w = await world(); roots.push(w.root);
    assert.deepEqual(await w.evidence.read(w.track, {stem: 'piano', runId: 'parent'}), {ok: true, evidence: null});
    const checked = await w.evidence.check(w.track, {stem: 'piano', runId: 'parent'});
    assert.equal(checked.ok, true); assert.equal(checked.totals.silent, 3);
    assert.deepEqual(await listing(w.root), ['midi', 'midi/piano', 'midi/piano/evidence', 'midi/piano/evidence/parent.json']);
    const read = await w.evidence.read(w.track, {stem: 'piano', runId: 'parent'});
    // flat order is notes.json order: instrument 0's notes, then instrument 1's
    assert.deepEqual(read.flat.verdicts, [0, SILENT, 2, SILENT, 1, SILENT]);
    assert.deepEqual(read.flat.extend, {0: 1.8});
    assert.deepEqual(read.instruments.map(item => [item.silent, item.short]), [[2, 1], [1, 0]]);

    // refusals: a path that escapes, an unknown stem, a parent whose stem changed, a judge that read another file
    assert.equal((await w.evidence.check(w.track, {stem: 'piano', runId: '../../escape'})).error, 'evidence-invalid');
    assert.equal((await w.evidence.check(w.track, {stem: 'kazoo', runId: 'parent'})).error, 'evidence-invalid');
    w.state.stale = true;
    assert.equal((await w.evidence.check(w.track, {stem: 'piano', runId: 'parent'})).error, 'midi-stale');
    assert.equal((await w.evidence.apply(w.track, {stem: 'piano', runId: 'parent'})).error, 'midi-stale');
    w.state.stale = false;
    let other = await world({digest: 'some-other-file'}); roots.push(other.root);
    assert.equal((await other.evidence.check(other.track, {stem: 'piano', runId: 'parent'})).error, 'evidence-run-changed');
    assert.deepEqual(await listing(other.root), [], 'a refused check leaves nothing behind');
    assert.equal((await other.evidence.apply(other.track, {stem: 'piano', runId: 'parent'})).error, 'evidence-missing');

    // a sidecar made for a different file is not this run's evidence
    const sidecar = path.join(w.root, 'midi', 'piano', 'evidence', 'parent.json');
    const stored = JSON.parse(await fs.readFile(sidecar, 'utf8'));
    await fs.writeFile(sidecar, JSON.stringify({...stored, midiSha256: 'older'}));
    assert.deepEqual(await w.evidence.read(w.track, {stem: 'piano', runId: 'parent'}), {ok: true, evidence: null, stale: true});
    assert.equal((await w.evidence.plan(w.track, {stem: 'piano', runId: 'parent'})).error, 'evidence-stale');
    // nor is one made under an older rule: audio-evidence-1 proposed lengthening notes into the note that followed
    await fs.writeFile(sidecar, JSON.stringify({...stored, method: 'audio-evidence-1'}));
    assert.deepEqual(await w.evidence.read(w.track, {stem: 'piano', runId: 'parent'}), {ok: true, evidence: null, stale: true});
    assert.equal((await w.evidence.apply(w.track, {stem: 'piano', runId: 'parent', extend: true})).error, 'evidence-stale');
    await fs.writeFile(sidecar, JSON.stringify(stored));

    // plan: only the silent notes go; the no-pitch and weak ones stay
    const plan = await w.evidence.plan(w.track, {stem: 'piano', runId: 'parent'});
    assert.equal(plan.removed, 3); assert.equal(plan.lengthened, 0);
    assert.deepEqual(plan.edits.map(edit => [edit.instrument, edit.notes.map(n => n.pitch)]), [[0, [60, 64]], [1, [48]]]);
    const longer = await w.evidence.plan(w.track, {stem: 'piano', runId: 'parent', extend: true});
    assert.equal(longer.lengthened, 1); assert.equal(longer.edits[0].notes[0].end, 1.8);
    const keep = await w.evidence.plan(w.track, {stem: 'piano', runId: 'parent', removeSilent: false, extend: true});
    assert.deepEqual([keep.removed, keep.lengthened, keep.edits.length, keep.edits[0].notes.length], [0, 1, 1, 4]);
    assert.equal(w.state.calls.length, 0, 'planning saves nothing');

    // apply: one revision per edited instrument, chained; the one in between is removed; the original survives
    const applied = await w.evidence.apply(w.track, {stem: 'piano', runId: 'parent'});
    assert.deepEqual([applied.ok, applied.runId, applied.parentRunId, applied.removed, applied.active], [true, 'rev2', 'parent', 3, true]);
    assert.deepEqual(w.state.calls, ['save:parent:0:2', 'save:rev1:1:1', 'remove:rev1']);
    assert.deepEqual([...w.state.runs.keys()].sort(), ['parent', 'rev2']);
    // what is still true carries over: the kept no-pitch and weak marks, and the lengthening that was not taken
    const carried = await w.evidence.read(w.track, {stem: 'piano', runId: 'rev2'});
    assert.deepEqual(carried.flat.verdicts, [0, 2, 1]);
    assert.deepEqual(carried.flat.extend, {0: 1.8});
    assert.deepEqual(carried.appliedFrom, {runId: 'parent', removed: 3, lengthened: 0});
    assert.equal((await w.evidence.read(w.track, {stem: 'piano', runId: 'parent'})).totals.silent, 3, 'the original keeps its own evidence');
    assert.equal((await w.evidence.apply(w.track, {stem: 'piano', runId: 'rev2'})).error, 'evidence-no-change');

    // a failure part-way puts the original back in use and clears what the call made
    w = await world({failOn: 1}); roots.push(w.root);
    await w.evidence.check(w.track, {stem: 'piano', runId: 'parent'});
    const failed = await w.evidence.apply(w.track, {stem: 'piano', runId: 'parent'});
    assert.deepEqual([failed.ok, failed.error, failed.restored], [false, 'revision-overlapping-notes', 'parent']);
    assert.deepEqual(w.state.calls, ['save:parent:0:2', 'save:rev1:1:1', 'activate:parent', 'remove:rev1']);
    assert.deepEqual([[...w.state.runs.keys()], w.state.active], [['parent'], 'parent']);

    // a part with every note in silence is a result to delete, not one to revise
    w = await world({verdicts: [[0, 0, 0, 0], [SILENT, SILENT]], extend: [{}, {}]}); roots.push(w.root);
    await w.evidence.check(w.track, {stem: 'piano', runId: 'parent'});
    const empty = await w.evidence.apply(w.track, {stem: 'piano', runId: 'parent'});
    assert.deepEqual([empty.error, empty.instrument], ['evidence-empties-instrument', 1]);
    assert.equal(w.state.calls.length, 0);

    // verdicts for a different note count are not paired by position
    w = await world({verdicts: [[0, SILENT, 0], [0, 0]]}); roots.push(w.root);
    assert.equal((await w.evidence.check(w.track, {stem: 'piano', runId: 'parent'})).error, 'evidence-output-invalid');

    const source = await fs.readFile(path.join(__dirname, '..', 'core', 'midi-evidence.cjs'), 'utf8');
    assert(!/verdicts\[index\] === (1|2)\b/.test(source) && !/NO_PITCH|WEAK/.test(source), 'only the silence verdict removes notes');
    console.log('midi evidence: ok (one sidecar, contained paths, stale and foreign evidence refused, silent-only removal, chained revisions, rollback, carry-over)');
  } finally {
    for (const root of roots) await fs.rm(root, {recursive: true, force: true});
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
