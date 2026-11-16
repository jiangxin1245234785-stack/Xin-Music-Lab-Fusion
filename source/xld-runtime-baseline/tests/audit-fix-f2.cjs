'use strict';
// Audit fix 1, second batch (2026-11-15), on a made-up song in a temp analysis root:
//   item 7  - no built-in runtime paths: an engine whose interpreter is not configured is runtime-missing;
//   item 8  - score layers / vocal line identity: a result without one stays valid, other weights make it stale;
//   item 10 - a new track folder is kept to 160 characters, an existing longer one is used as it is; merged MIDI
//             goes to a 16-character folder, an existing 64-character one is read where it is;
//   items 4/5 - an earlier stem batch is retired with the MIDI versions that only it fed; a hand-edited or pinned
//             version holds it; the storage page follows the same rule; versions whose batch is gone are flagged;
//   item 3  - a song whose original moved is re-linked to the file's new place (folder renamed to the new id,
//             records rewritten, notes digests recomputed); a different file is refused and nothing changes;
//             a song whose original is gone can have its analysis moved to the bin.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const derived = require('../core/derived-assets.cjs');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const HEADER = Buffer.from('4d546864000000060000000103c04d54726b0000000400ff2f00', 'hex');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const trackIdFor = (file, stat) => crypto.createHash('sha1').update(`${file}\0${stat.size}\0${stat.mtimeMs}`).digest('hex');
function tree(dir) {
  const out = {};
  (function walk(d) { for (const e of fs.readdirSync(d, {withFileTypes: true})) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else out[path.relative(dir, f)] = sha(fs.readFileSync(f)); } })(dir);
  return out;
}

// A song with one stem batch, a bass MIDI version made from it (with digests), optionally a second batch.
async function makeSong(root, {name = 'Song'} = {}) {
  const audio = path.join(root, '..', name + '-' + crypto.randomUUID() + '.wav');
  fs.writeFileSync(audio, 'source audio ' + name);
  const stat = fs.statSync(audio);
  const track = {id: trackIdFor(audio, stat), title: name, artist: 'Artist', album: 'Album', number: 1, filePath: audio};
  const dir = derived.trackDirectory(track, root);
  const assets = derived.createDerivedAssets({analysisRoot: root});
  const batch = async () => {
    const runId = crypto.randomUUID();
    const stems = {schemaVersion: 1, kind: 'stems', trackId: track.id, runId, model: 'htdemucs_6s', options: {shifts: 1, overlap: 0.25},
      source: {path: audio, size: stat.size, mtimeMs: stat.mtimeMs}, stems: []};
    for (const s of ['bass', 'piano', 'guitar', 'drums', 'vocals', 'other']) {
      const file = `stems/${runId}/${s}.wav`;
      fs.mkdirSync(path.dirname(path.join(dir, file)), {recursive: true});
      fs.writeFileSync(path.join(dir, file), Buffer.alloc(44100 * 8));
      stems.stems.push({name: s, file, sampleRate: 44100, channels: 2, frames: 44100});
    }
    fs.writeFileSync(path.join(dir, 'stems.json'), JSON.stringify(stems, null, 2));
    fs.writeFileSync(path.join(dir, 'track.json'), JSON.stringify({schemaVersion: 1, trackId: track.id, number: 1, title: name, artist: 'Artist', album: 'Album', source: audio}, null, 2));
    return runId;
  };
  let clock = 0;
  const midi = async (stemRunId, engine = 'bass-highres', extra = {}) => {
    const profile = derived.profileFor(engine), id = crypto.randomUUID(), prefix = `midi/bass/${id}/`;
    fs.mkdirSync(path.join(dir, prefix), {recursive: true});
    fs.writeFileSync(path.join(dir, prefix + 'bass.mid'), HEADER);
    const notes = JSON.stringify({schemaVersion: 1, kind: 'notes', trackId: track.id, stem: 'bass', sourceRunId: stemRunId, runId: id, engine, model: profile.model, timeOrigin: 0, duration: 1, notes: [{start: 0, end: 0.5, pitch: 40, velocity: 90}]});
    fs.writeFileSync(path.join(dir, prefix + 'notes.json'), notes);
    const wav = fs.statSync(path.join(dir, `stems/${stemRunId}/bass.wav`));
    const record = {schemaVersion: 1, kind: 'midi', trackId: track.id, stem: 'bass', runId: id, sourceRunId: stemRunId,
      source: {path: path.join(dir, `stems/${stemRunId}/bass.wav`), size: wav.size, mtimeMs: wav.mtimeMs},
      engine, model: profile.model, options: profile.options, backend: {checkpointSha256: profile.checkpoint?.sha256},
      timeOrigin: 0, duration: 1, noteCount: 1, tempoMode: 'fixed-timebase', quantized: false, digests: {midi: sha(HEADER), notes: sha(notes)},
      file: prefix + 'bass.mid', notesFile: prefix + 'notes.json', createdAt: new Date(Date.UTC(2026, 8, 20, 0, 0, clock++)).toISOString(), ...extra};
    fs.mkdirSync(path.join(dir, 'midi', 'bass', 'runs'), {recursive: true});
    fs.writeFileSync(path.join(dir, 'midi', 'bass', 'runs', id + '.json'), JSON.stringify(record));
    return record;
  };
  return {track, dir, assets, batch, midi, audio};
}

(async () => {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), 'xld-f2-'));
  const root = path.join(base, 'analysis');
  fs.mkdirSync(root);
  const saved = {...process.env};
  try {
    // --- item 7 -----------------------------------------------------------------------------------------------------
    for (const key of ['XLD_RUNTIME_ROOT', 'XLD_STABLE_RUNTIME_ROOT', 'XLD_PYTHON', 'XLD_AI_PYTHON', 'XLD_HARMONY_PYTHON', 'XLD_MIDI_PYTHON', 'XLD_HIGHRES_PYTHON', 'XLD_ROFORMER_PYTHON']) delete process.env[key];
    const {createService} = require('../core/analysis-service.cjs');
    const audio = path.join(base, 'a.wav'); fs.writeFileSync(audio, 'x');
    const service = createService({analysisRoot: root});
    for (const engine of ['songformer', 'chord-btc'])
      assert.equal((await service.run({id: 'runtime-check-1', filePath: audio, title: 'A'}, engine)).error, 'runtime-missing', engine + ' without a configured interpreter');
    for (const file of ['core/analysis-service.cjs', 'core/midi-merge.cjs', 'desktop/main.cjs', 'analysis-separation/runner.py', '../fusion-runtime-baseline/desktop/main.cjs'])
      assert(!/Program Files\\\\xin-local-deck|Caches[\\/]+codex|Caches\\\\\\\codex/.test(read(file)), 'no September runtime path left in ' + file);
    Object.assign(process.env, saved);

    // --- item 8 -----------------------------------------------------------------------------------------------------
    const identity = require('../core/score-identity.cjs');
    const want = identity.expected('score-vocals');
    assert.equal(identity.identityState({kind: 'score-vocals'}, 'score-vocals'), 'unknown', 'a result from before has no identity');
    assert.equal(identity.isCurrent({kind: 'score-vocals'}, 'score-vocals'), true, 'and stays valid (19 score layers, 5 vocal lines in the library)');
    assert.equal(identity.identityState({identity: {version: want.version, weights: {...want.weights}}}, 'score-vocals'), 'current');
    assert.equal(identity.identityState({identity: {version: want.version, weights: {lead: null, pitch: want.weights.pitch}}}, 'score-vocals'), 'current', 'an unknown weight is not a different one');
    assert.equal(identity.identityState({identity: {version: want.version, weights: {pitch: 'f'.repeat(64)}}}, 'score-vocals'), 'stale', 'other weights: stale');
    assert.equal(identity.identityState({identity: {version: want.version + 1, weights: {}}}, 'score-vocals'), 'stale', 'another version: stale');
    const beat = identity.expected('score-layers').weights.beat;
    assert.equal(beat, derived.PROFILES.find(p => p.id === 'strings-muscriptor-large-v04').options.tempoAnalysis.sha256, 'the beat weights are the ones the tempo profile pins');
    const layersState = require('../../fusion-runtime-baseline/desktop/score-layers-state.cjs');
    const stems = {ok: true, runId: 'r1'};
    assert.equal(layersState.layersState({kind: 'score-layers', source: {stemRunId: 'r1'}}, stems), 'current', 'XML: an earlier result stays current');
    assert.equal(layersState.layersState({kind: 'score-layers', source: {stemRunId: 'r1'}, identity: {version: 1, weights: {beat: '0'.repeat(64)}}}, stems), 'stale', 'XML: other beat weights are stale');

    // --- item 10 ----------------------------------------------------------------------------------------------------
    const long = {id: 'abcdef1234567890', title: 'T'.repeat(90), artist: 'A'.repeat(60), album: 'B'.repeat(60), number: 3};
    const capped = derived.trackDirectory(long, root);
    assert(capped.length <= 160 && capped.endsWith('__abcdef1234'), 'a new folder is kept to 160 characters: ' + capped.length);
    const full = path.join(root, derived.safeName('A'.repeat(60) + ' - ' + 'B'.repeat(60)), derived.safeName('03 ' + 'T'.repeat(90)) + '__abcdef1234');
    fs.mkdirSync(full, {recursive: true});
    assert.equal(derived.trackDirectory(long, root), full, 'an existing folder under the full name is used as it is');
    fs.rmSync(path.dirname(full), {recursive: true});
    const merge = read('core/midi-merge.cjs');
    assert(/fingerprint\.slice\(0,16\)/.test(merge) && /existsSync\(legacy\)\?legacy/.test(merge), 'merged MIDI: 16-character folders, an existing 64-character one read where it is');

    // --- items 4 and 5 ---------------------------------------------------------------------------------------------
    const song = await makeSong(root, {name: 'Batches'});
    const first = await song.batch();
    const follower = await song.midi(first);                                   // a model's output
    const revision = await song.midi(first, 'manual-revision', {options: {revision: 'd1', parentRunId: follower.runId}, model: derived.MANUAL.model});
    const second = await song.batch();                                         // the current batch now
    const current = await song.midi(second);
    await song.assets.midi.activate(song.track, current);
    const batches = require('../core/stem-batches.cjs').createStemBatches({assets: song.assets});
    const deps = await batches.dependents(song.track, first);
    assert.deepEqual(deps.follow.map(f => f.runId), [follower.runId], 'the model output follows the batch');
    assert.deepEqual(deps.hold.map(h => [h.runId, h.reason]), [[revision.runId, 'manual']], 'the hand-edited version holds it');
    const disposed = [];
    const kept = await batches.retire(song.track, first, {current: second, dispose: async f => disposed.push(f)});
    assert.equal(kept.ok, false); assert(kept.kept && disposed.length === 0, 'a batch a revision uses is never removed automatically');
    assert(/人工修订/.test(require('../core/stem-batches.cjs').keptReason(kept)));
    // The storage page agrees: blocked while the revision uses it.
    const storage = require('../core/storage.cjs').createStorage({getRoot: () => root});
    let row = (await storage.scan()).rows.find(r => r.runId === first);
    assert(row.blocked, 'storage: blocked by the revision');
    // Without the revision: the batch can go, and takes the follower with it.
    fs.rmSync(path.join(song.dir, 'midi', 'bass', revision.runId), {recursive: true});
    fs.rmSync(path.join(song.dir, 'midi', 'bass', 'runs', revision.runId + '.json'));
    row = (await storage.scan()).rows.find(r => r.runId === first);
    assert.equal(row.blocked, '', 'storage: an old batch whose MIDI only follows it is not blocked');
    assert.deepEqual(row.followers.map(f => path.basename(f)), [follower.runId], 'and lists the version that goes with it');
    const currentRow = (await storage.scan()).rows.find(r => r.runId === second);
    assert(currentRow.active && currentRow.blocked, 'the batch in use stays protected by its MIDI');
    const trashed = [];
    const cleared = await require('../core/storage.cjs').createStorage({getRoot: () => root, trash: async f => { trashed.push(f); await fsp.rm(f, {recursive: true}); }})
      .clear([{id: row.id, revision: row.revision}], 'trash', async () => true);
    assert(cleared.ok, JSON.stringify(cleared));
    assert.deepEqual(trashed.map(f => path.basename(f)).sort(), [first, follower.runId].sort(), 'batch and follower to the bin');
    const runs = await song.assets.midi.listRuns(song.track, 'bass');
    const gone = runs.find(r => r.runId === follower.runId);
    assert(gone && gone.status !== "current" && gone.stemsDeleted && !fs.existsSync(path.join(song.dir, "midi", "bass", follower.runId)), "its record stays (restorable), flagged as made from a removed batch: " + JSON.stringify(gone));
    assert.equal(gone.recycled, true, 'and marked as in the Recycle Bin (recoverable), not as gone for good');
    assert.equal(runs.find(r => r.runId === current.runId).stemsDeleted, false);
    assert.equal(runs.find(r => r.runId === current.runId).recycled, false);
    // Re-separation, through the service: the replaced batch and its follower go, the answer says so.
    assert(/stemsGone/.test(read('derived-controls.js')) && /runStemsDeletedFooter/.test(read('i18n/runtime-messages.js')), 'the version list hides them behind one footer line');
    assert(/previousStems/.test(read('core/analysis-service.cjs')) && /createStemBatches/.test(read('core/analysis-service.cjs')), 're-separation retires the replaced batch by the same rule');

    // --- item 3 -----------------------------------------------------------------------------------------------------
    const moved = await makeSong(root, {name: 'Moved'});
    const runId = await moved.batch();
    const record = await moved.midi(runId);
    await moved.assets.midi.activate(moved.track, record);
    const relinkModule = require('../core/source-relink.cjs');
    const relink = relinkModule.createSourceRelink({assets: moved.assets, trackIdFor, rekey: async () => []});
    // The original moves away.
    const newPlace = path.join(base, 'moved-' + path.basename(moved.audio));
    fs.renameSync(moved.audio, newPlace);
    const missing = relinkModule.listMissing(root);
    const item = missing.find(m => m.title === 'Moved');
    assert(item, 'listed as missing'); assert.equal(item.source.path, moved.audio);
    // A different file is refused, nothing changes.
    const other = path.join(base, 'other.wav'); fs.writeFileSync(other, 'not the same recording at all');
    const before = tree(path.join(root, item.folder));
    const refused = await relink.relink(root, item.folder, other);
    assert.equal(refused.error, 'relink-size-differs');
    assert.deepEqual(tree(path.join(root, item.folder)), before, 'a refused re-link changes nothing');
    // The same file: re-linked.
    const done = await relink.relink(root, item.folder, newPlace);
    assert(done.ok, JSON.stringify(done));
    const newStat = fs.statSync(newPlace), newId = trackIdFor(path.resolve(newPlace), newStat);
    assert.equal(done.trackId, newId);
    assert(!fs.existsSync(path.join(root, item.folder)) && fs.existsSync(path.join(root, done.folder)), 'the folder carries the new id');
    const relinked = {...moved.track, id: newId, filePath: path.resolve(newPlace), bridgePath: path.join(root, done.folder, 'music-lab.json')};
    const assets = derived.createDerivedAssets({analysisRoot: root});
    assert((await assets.readStems(relinked)).ok, 'stems read again');
    const midi = await assets.readMidi(relinked, 'bass');
    assert(midi.ok, 'and the MIDI (notes digest recomputed): ' + midi.error);
    assert(!relinkModule.listMissing(root).some(m => m.title === 'Moved'), 'no longer listed');
    assert(!fs.existsSync(path.join(root, done.folder, relinkModule.JOURNAL)), 'journal removed after success');
    // Moved into another library folder (models.2 check 3): the app names the analysis folder from the file's library
    // folder, so the analysis must move to the folder the app will look in, read WITHOUT a bridgePath shortcut.
    {
      const far = await makeSong(root, {name: 'Far'});
      const farRun = await far.batch();
      await far.assets.midi.activate(far.track, await far.midi(farRun));
      const farPlace = path.join(base, 'far-' + path.basename(far.audio));
      fs.renameSync(far.audio, farPlace);
      const farItem = relinkModule.listMissing(root).find(m => m.title === 'Far');
      const beforeFar = tree(path.join(root, farItem.folder));
      const outside = await relink.relink(root, farItem.folder, farPlace, {targetDirFor: async () => null});
      assert.equal(outside.error, 'relink-outside-library', 'a file the app cannot list is refused');
      assert.deepEqual(tree(path.join(root, farItem.folder)), beforeFar, 'and nothing changes');
      const farStat = fs.statSync(farPlace), farId = trackIdFor(path.resolve(farPlace), farStat);
      const asListed = {...far.track, id: farId, filePath: path.resolve(farPlace), artist: 'Other Artist', album: 'Other Place', pathArtist: 'Other Artist', pathAlbum: 'Other Place'};
      delete asListed.bridgePath;
      const farDone = await relink.relink(root, farItem.folder, farPlace, {targetDirFor: async (file, stat, id) => { assert.equal(id, farId); return derived.trackDirectory(asListed, root); }});
      assert(farDone.ok, JSON.stringify(farDone));
      assert.equal(path.join(root, farDone.folder), derived.trackDirectory(asListed, root), 'the analysis is where the app looks for that file');
      const farAssets = derived.createDerivedAssets({analysisRoot: root});
      assert((await farAssets.readStems(asListed)).ok, 'stems read for the track as the library lists it');
      assert((await farAssets.readMidi(asListed, 'bass')).ok, 'and its MIDI');
      assert(!fs.existsSync(path.join(root, path.dirname(farItem.folder))) || fs.readdirSync(path.join(root, path.dirname(farItem.folder))).length > 0, 'an emptied old album folder goes');
    }
    // Gone for good: the analysis goes to the bin.
    const lost = await makeSong(root, {name: 'Lost'});
    await lost.batch();
    fs.rmSync(lost.audio);
    const lostItem = relinkModule.listMissing(root).find(m => m.title === 'Lost');
    const binned = [];
    const discarded = await relink.discard(root, lostItem.folder, async dir => binned.push(dir));
    assert(discarded.ok && binned.length === 1 && path.basename(binned[0]) === path.basename(lostItem.folder));
    console.log('audit fix F2: ok (runtime-missing without built-in paths; identity: earlier results valid, other weights stale; 160-character new folders, existing ones kept; batch retirement with followers, holds by revisions, storage rule, flagged versions; re-link with new id and rewritten records, refusal changes nothing, discard to bin)');
  } finally {
    Object.assign(process.env, saved);
    await fsp.rm(base, {recursive: true, force: true});
  }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => setTimeout(() => process.exit(process.exitCode || 0), 100));
