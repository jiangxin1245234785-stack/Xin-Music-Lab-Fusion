'use strict';
// R3: a hand-edited MIDI revision is a first-class version.
//
// The decision behind it is that EVERY revision gets its own identity. The consequence is accepted and permanent:
// no model version will ever "match" a revision, so it reports matches:false and status 'superseded' forever. That
// makes this round dangerous in a very specific way — every place in the app that reads 'superseded' as "an
// obsolete draft" will grey out, mislabel, refuse, or DELETE the user's own work. So most of what follows is not
// "does a revision load" but "does the rest of the system stop treating it as rubbish".
//
// The sharpest of those is retention. Its candidate rule matches on status, and a revision satisfies it forever.
// Today the only production sweep is scoped to the model engine that just ran, so a revision is out of range by
// accident of scoping rather than by decision — and an accident is not a guarantee.
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const crypto = require('node:crypto'), assert = require('node:assert/strict');
const core = require('../core/derived-assets.cjs');
const {createDerivedAssets, trackDirectory, profileFor, identityOf, MANUAL, MANUAL_ENGINE, PROFILES, ENGINE_IDS} = core;
const {createMidiRetention} = require('../core/midi-retention.cjs');
const read = name => require('node:fs').readFileSync(path.join(__dirname, '..', name), 'utf8');
const HEADER = Buffer.from('4d546864000000060000000103c04d54726b0000000400ff2f00', 'hex');

// --- the profile is a lookup entry, not a model ------------------------------------------------------------------
assert.equal(MANUAL_ENGINE, 'manual-revision');
// Not 'manual': that id already belongs to the hand-made SECTION and CHORD annotations, and one id for two
// different things is how a later round confuses them.
assert(/engine: \{ id: 'manual',/.test(read('app.js')), 'the annotation engine really does own the id "manual"');
assert.equal(profileFor(MANUAL_ENGINE)?.id, MANUAL_ENGINE, 'verify() resolves a revision, so a stored one is not a damaged record');
// The model registry is what makes an engine offerable and startable. A revision is neither.
assert(!ENGINE_IDS.includes(MANUAL_ENGINE), 'a revision is not startable');
assert(!PROFILES.some(profile => profile.id === MANUAL_ENGINE), 'and is not in the model registry');
assert(!/manual-revision/.test(read('analysis-midi/models.json')), 'nor in models.json, which the Python runner reads as its --engine choices');
// profileMismatch() compares the profile's declared options against the record's FIRST, and any difference there
// returns 'midi-invalid' — status 'invalid', rendered as 「记录损坏」 and excluded from switching. Declaring options
// on this profile would present every revision as a corrupt file.
assert.deepEqual(MANUAL.options, {}, 'the profile declares no options');
assert(!MANUAL.checkpoint, 'and no checkpoint');
assert(!MANUAL.defaultFor, 'and is never a default, or new runs would be handed to it');

// --- identity: every revision is its own version ------------------------------------------------------------------
const profileIdentities = new Set(PROFILES.map(identityOf));
assert.equal(profileIdentities.size, PROFILES.length, 'model identities are distinct to begin with');
assert(!profileIdentities.has(identityOf(MANUAL)), 'and none of them is the manual profile');
const revisionIdentity = (revision, parentRunId) => identityOf({kind: 'midi', engine: MANUAL_ENGINE, model: MANUAL.model, options: {revision, parentRunId}});
const a = revisionIdentity('digest-a', 'parent-1'), b = revisionIdentity('digest-b', 'parent-1');
assert.notEqual(a, b, 'two revisions of the same parent are two versions');
assert.notEqual(a, revisionIdentity('digest-a', 'parent-2'), 'and so are the same edit applied to two parents');
for (const identity of [a, b]) assert(!profileIdentities.has(identity) && identity !== identityOf(MANUAL), 'a revision can never collide with a model version');

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'xld-midi-revision-'));
  try {
    const audio = path.join(root, 'song.wav');
    await fs.writeFile(audio, 'source');
    const stat = await fs.stat(audio);
    const track = {id: 'revision-track-1234567890', title: 'Song', artist: 'Artist', album: 'Album', number: 1, filePath: audio};
    const dir = trackDirectory(track, root), stemRunId = crypto.randomUUID();
    const stems = {schemaVersion: 1, kind: 'stems', trackId: track.id, runId: stemRunId, model: 'htdemucs_6s',
      options: {shifts: 1, overlap: 0.25}, source: {path: audio, size: stat.size, mtimeMs: stat.mtimeMs}, stems: []};
    for (const name of ['bass', 'piano', 'guitar', 'drums', 'vocals', 'other']) {
      const file = `stems/${stemRunId}/${name}.wav`;
      await fs.mkdir(path.dirname(path.join(dir, file)), {recursive: true});
      await fs.writeFile(path.join(dir, file), Buffer.alloc(44100 * 8));
      stems.stems.push({name, file, sampleRate: 44100, channels: 2, frames: 44100});
    }
    await fs.writeFile(path.join(dir, 'stems.json'), JSON.stringify(stems));
    const assets = createDerivedAssets({analysisRoot: root}), midi = assets.midi;
    const write = async (relative, value) => {
      await fs.mkdir(path.dirname(path.join(dir, relative)), {recursive: true});
      await fs.writeFile(path.join(dir, relative), typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value));
    };
    let clock = 0;
    // Exactly the shape a run writes, so nothing here is a special case the real writer would not produce. A
    // revision differs from a model run in three fields: engine, model, and the options that carry its digest.
    async function make(stem, engine, {notes = 1, ...tweak} = {}) {
      const profile = profileFor(engine), runId = crypto.randomUUID(), prefix = `midi/${stem}/${runId}/`;
      const wav = await fs.stat(path.join(dir, `stems/${stemRunId}/${stem}.wav`));
      const noteList = Array.from({length: notes}, (_, i) => ({start: i * 0.1, end: i * 0.1 + 0.05, pitch: 60 + i, velocity: 100}));
      await write(prefix + stem + '.mid', HEADER);
      await write(prefix + 'notes.json', JSON.stringify({schemaVersion: 1, kind: 'notes', trackId: track.id, stem,
        sourceRunId: stemRunId, runId, engine, model: profile.model, timeOrigin: 0, duration: 1, notes: noteList}));
      return {schemaVersion: 1, kind: 'midi', trackId: track.id, stem, runId, sourceRunId: stemRunId,
        source: {path: path.join(dir, `stems/${stemRunId}/${stem}.wav`), size: wav.size, mtimeMs: wav.mtimeMs},
        engine, model: profile.model, options: profile.options, backend: {checkpointSha256: profile.checkpoint?.sha256},
        timeOrigin: 0, duration: 1, noteCount: noteList.length, tempoMode: 'fixed-timebase', quantized: false,
        file: prefix + stem + '.mid', notesFile: prefix + 'notes.json',
        createdAt: new Date(Date.UTC(2026, 8, 20, 0, 0, clock++)).toISOString(), ...tweak};
    }
    const revision = (stem, digest, parentRunId, tweak = {}) =>
      make(stem, MANUAL_ENGINE, {options: {revision: digest, parentRunId}, ...tweak});
    const recordPath = r => path.join('midi', r.stem, 'runs', r.runId + '.json');

    // --- a revision is readable, switchable, and permanently superseded ---------------------------------------
    const model = await make('bass', 'bass-highres');
    await write(recordPath(model), model);
    await midi.activate(track, model);
    const edit = await revision('bass', 'digest-1', model.runId, {notes: 3});
    await write(recordPath(edit), edit);

    let view = await midi.readRun(track, 'bass', edit.runId);
    assert(view.ok, 'a revision reads: ' + view.error);
    assert.equal(view.matches, false, 'and never matches a model version');
    // THE distinction this whole round turns on. 'superseded' is a version state; 'invalid' is a damaged file.
    assert.equal(view.status, 'superseded', 'it is an earlier version, not a damaged record');
    assert.equal(view.run.engine, MANUAL_ENGINE);

    await midi.activate(track, edit);
    const active = await midi.read(track, 'bass');
    assert(active.ok && active.runId === edit.runId, 'activate() accepts a revision: ' + active.error);
    assert.equal(active.engine, MANUAL_ENGINE);
    assert.equal(active.matches, false, 'still not a cache hit, even while in use');
    // Listing it by its own engine is how the version panel finds it at all, whatever model is selected.
    const listed = await midi.listRuns(track, 'bass', MANUAL_ENGINE);
    assert.deepEqual(listed.map(run => run.runId), [edit.runId], 'listable by engine');
    assert.equal(listed[0].status, 'superseded');
    assert.equal(listed[0].active, true);
    // And switching back to the model is an ordinary pointer rewrite in both directions.
    await midi.activate(track, model);
    assert.equal((await midi.read(track, 'bass')).runId, model.runId, 'a model can take the pointer back');
    await midi.activate(track, edit);

    // --- deletion never crosses between a model and a revision ---------------------------------------------------
    // midi-delete picks the run that inherits the active pointer from listRuns(track, stem, engine), which is
    // engine-scoped. So deleting a model run can never silently activate a hand edit, and deleting a revision can
    // never fall back onto model output. Asserted at the mechanism rather than trusted: this is the query the
    // successor search actually makes.
    assert.deepEqual((await midi.listRuns(track, 'bass', 'bass-highres')).map(run => run.runId), [model.runId],
      'a model-scoped listing holds no revisions');
    assert.deepEqual((await midi.listRuns(track, 'bass', MANUAL_ENGINE)).map(run => run.runId), [edit.runId],
      'and a revision-scoped listing holds no model runs');
    assert.equal((await midi.listRuns(track, 'bass', null)).length, 2, 'while the unscoped listing holds both');

    // --- retention: the sweep must not reclaim the user's own work -----------------------------------------------
    // Both of these are unpointed, unpinned and superseded — the exact candidate shape. The model run SHOULD be
    // reclaimed; the revision must not be. Driving the sweep with a null engine scope is the point: scoped to an
    // engine, the revision is out of range for a reason that has nothing to do with protecting it.
    // Built oldest-first, because listRuns is newest-first and the sweep keeps only slot 0 as the comparison
    // slot. The revision is deliberately created BETWEEN the two model runs, so it lands in the middle of the
    // reclaim range: without the engine guard the sweep would keep the newest model run and trash both the older
    // model run AND the revision. That ordering is what makes this a proof rather than a coincidence.
    const oldestModel = await make('piano', 'piano-transkun', {backend: {checkpointSha256: 'a'.repeat(64)}});
    await write(recordPath(oldestModel), oldestModel);
    const olderEdit = await revision('piano', 'digest-old', oldestModel.runId);
    await write(recordPath(olderEdit), olderEdit);
    const newerModel = await make('piano', 'piano-transkun', {backend: {checkpointSha256: 'f'.repeat(64)}});
    await write(recordPath(newerModel), newerModel);
    const currentEdit = await revision('piano', 'digest-new', newerModel.runId);
    await write(recordPath(currentEdit), currentEdit);
    await midi.activate(track, currentEdit);

    const unscoped = await midi.listRuns(track, 'piano', null);
    const shape = run => ({status: run.status, pointed: run.pointed.length, kept: run.kept});
    const find = runId => unscoped.find(run => run.runId === runId);
    // Indistinguishable on every clause of the candidate rule except the engine. If this ever stops holding, the
    // guard has become decorative and the protection has to be re-derived rather than trusted.
    assert.deepEqual(shape(find(olderEdit.runId)), {status: 'superseded', pointed: 0, kept: false});
    assert.deepEqual(shape(find(oldestModel.runId)), {status: 'superseded', pointed: 0, kept: false});
    const order = unscoped.map(run => run.runId);
    assert.equal(order.indexOf(olderEdit.runId), order.indexOf(newerModel.runId) + 1, 'the revision sorts inside the reclaim range');
    assert.equal(order.indexOf(oldestModel.runId), order.indexOf(olderEdit.runId) + 1, '...with a model run behind it');

    const trashed = [];
    const sweeper = createMidiRetention({assets, getRoot: () => root,
      trash: async directory => {trashed.push(path.basename(directory)); await fs.rm(directory, {recursive: true, force: true});}});
    const report = await sweeper.sweep(track, 'piano', null, {activeIdentity: identityOf(currentEdit)});
    assert.deepEqual(report.removed, [], 'nothing is hard-deleted here');
    // The newest model run is the comparison slot and stays; the one behind it is surplus and goes. The revision
    // sits between them and is reclaimed by neither.
    assert.deepEqual(trashed, [oldestModel.runId], 'only the surplus model run is reclaimed: ' + JSON.stringify({trashed, report}));
    assert.deepEqual(report.trashed, [oldestModel.runId]);
    const survivor = await midi.readRun(track, 'piano', olderEdit.runId);
    assert(survivor.ok, 'the older revision survives a stem-wide sweep: ' + survivor.error);
    assert((await midi.readRun(track, 'piano', newerModel.runId)).ok, 'the comparison slot survives too');
    assert.equal((await midi.readRun(track, 'piano', oldestModel.runId)).status, 'files-missing', 'while the surplus model run went to the bin');
    // An identity-duplicate pass must not reach it either.
    const duplicates = await sweeper.sweep(track, 'piano', null, {activeIdentity: identityOf(olderEdit)});
    assert.deepEqual([duplicates.removed, duplicates.trashed], [[], []], 'nor does the duplicate pass');
    assert((await midi.readRun(track, 'piano', olderEdit.runId)).ok, 'and it is still there afterwards');

    // --- the guarantees that live in other files ---------------------------------------------------------------------
    {
      const retention = read('core/midi-retention.cjs'), service = read('core/analysis-service.cjs');
      const main = read('desktop/main.cjs'), panel = read('derived-controls.js');
      assert(/run\.engine!==MANUAL_ENGINE/.test(retention), 'the sweep excludes revisions by engine, in the candidate rule itself');
      // The guard must not be able to quietly stop mattering: if a second, stem-wide sweep call ever appears, the
      // engine scoping that currently hides revisions from retention is gone and only that guard is left.
      const sweeps = service.split(/\r?\n/).filter(line => /midiRetention\.sweep\(/.test(line));
      assert.equal(sweeps.length, 1, 'one production sweep: ' + sweeps.join(' // '));
      assert(/midiRetention\.sweep\(track, midiStem, engine,/.test(sweeps[0]), 'still scoped to the engine that just ran: ' + sweeps[0]);

      // Nothing may start a revision as if it were a model.
      assert(/if \(engine === midiModule\.MANUAL_ENGINE\) return \{ ok: false, error: 'midi-manual-not-runnable' \};/.test(service), 'the service refuses to run one');
      const runGate = main.indexOf("engine===midiCore.MANUAL_ENGINE");
      const stemGate = main.indexOf("!midiCore.profileFor(engine)?.stems.includes(payload.stem)");
      assert(runGate > 0 && runGate < stemGate, 'and the IPC refuses it BEFORE the stem gate, which profileFor now passes');

      // The cache branch: a hit produces nothing new, so activating it would silently replace the user's edit.
      assert(/const keepsRevision = Boolean\(active\?\.ok && active\.engine === midiModule\.MANUAL_ENGINE/.test(service), 'a cache hit leaves a revision in place');
      assert(/keptActive: keepsRevision \? active\.runId : null/.test(service), 'and says so rather than reporting a switch it did not make');

      // The version panel has to fetch revisions unconditionally, or the user cannot see, switch to, or PIN their own
      // work — and pinning is the only manual protection against retention.
      assert(/ask\(MANUAL_ENGINE\)/.test(panel), 'the panel always asks for revisions, whatever model is selected');
      assert(/run\.engine!==MANUAL_ENGINE\)\{choices\[stem\]=run\.engine/.test(panel), 'switching to one is not recorded as a model preference');
      assert.equal(panel.split(/\r?\n/).filter(line => /choices\[stem\]=/.test(line) && !/MANUAL_ENGINE/.test(line)).length, 0,
        'every writer of the model preference excludes revisions');
      assert(/runtime\.assets\.runStatus\.'\+\(manual\?'manual'/.test(panel), 'a revision row is not labelled 旧版本');
      const manualBranch = panel.indexOf("manualActive()) status.textContent=rt('runtime.assets.manualActiveResult'");
      const modelLookup = panel.indexOf("status.textContent=model ? rt(midi?.ok?");
      assert(manualBranch > 0 && manualBranch < modelLookup, 'and the status line answers for revisions before it looks up a model');

      // Both renderers carry the id as a literal because a renderer cannot require core. Pin them together.
      for (const [file, text] of [['derived-controls.js', panel],
        ['../fusion-runtime-baseline/stem-controls.js', read('../fusion-runtime-baseline/stem-controls.js')]])
        assert(new RegExp("MANUAL_ENGINE\\s*=\\s*'" + MANUAL_ENGINE + "'").test(text), file + ' must carry the same engine id');

      // The visualizer picks its own engine and always passes force, so the cache branch never protects anything
      // there. It was the one outright data-loss path: its 转 MIDI button ran a model straight over a revision.
      const fusion = read('../fusion-runtime-baseline/desktop/main.cjs');
      const refuse = fusion.indexOf("active.engine === core.MANUAL_ENGINE) return {ok: false, error: 'midi-manual-active'}");
      const pick = fusion.indexOf('const activeProfile = active.ok ? core.profileForResult(active) : null;');
      assert(refuse > 0 && refuse < pick, 'the visualizer refuses before it picks an engine to run');
    }

    console.log('midi revision record: ok (a revision reads as an earlier version rather than a damaged one, is listable and switchable in both directions, and survives a stem-wide sweep that reclaims an identically-shaped model run)');
  } finally {
    await fs.rm(root, {recursive: true, force: true});
  }
})().catch(error => {console.error(error); process.exitCode = 1;});

