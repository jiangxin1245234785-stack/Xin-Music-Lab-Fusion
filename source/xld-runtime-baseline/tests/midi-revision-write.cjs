'use strict';
// R4: saving a hand-edited revision. This file is about the COMMIT ORDER, not about MIDI fidelity — the writer's
// own fidelity is checked against real Python in a separate log, because the npm chain is pure Node on purpose
// and a Python dependency would turn it red on any machine without the MIDI runtime.
//
// The order is the deliverable: verify before a byte is written, stage outside the destination, and put the
// parent back if activation fails. Each of those exists because of a specific way this project has already lost
// or stranded data — an orphan run directory with no record, a run made undeletable by a stray staging file, a
// stem left with no active MIDI at all.
const fs = require('node:fs/promises');
const path = require('node:path'), os = require('node:os');
const crypto = require('node:crypto'), assert = require('node:assert/strict');
const {createDerivedAssets, trackDirectory, profileFor, MANUAL, MANUAL_ENGINE, identityOf} = require('../core/derived-assets.cjs');
const {createMidiRevision} = require('../core/midi-revision.cjs');
const HEADER = Buffer.from('4d546864000000060000000103c04d54726b0000000400ff2f00', 'hex');

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'xld-revision-write-'));
  try {
    const audio = path.join(root, 'song.wav');
    await fs.writeFile(audio, 'source');
    const stat = await fs.stat(audio);
    const track = {id: 'writer-track-1234567890', title: 'Song', artist: 'Artist', album: 'Album', number: 1, filePath: audio};
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
    const stem = 'piano';
    const profile = profileFor('piano-transkun');
    const parentRunId = crypto.randomUUID(), prefix = `midi/${stem}/${parentRunId}/`;
    const wav = await fs.stat(path.join(dir, `stems/${stemRunId}/${stem}.wav`));
    const parentNotes = [{start: 0, end: 0.4, pitch: 60, velocity: 90}, {start: 0.5, end: 0.9, pitch: 64, velocity: 80}];
    await write(prefix + stem + '.mid', HEADER);
    await write(prefix + 'notes.json', JSON.stringify({schemaVersion: 1, kind: 'notes', trackId: track.id, stem,
      sourceRunId: stemRunId, runId: parentRunId, engine: 'piano-transkun', model: profile.model, timeOrigin: 0, duration: 1, notes: parentNotes}));
    const parent = {schemaVersion: 1, kind: 'midi', trackId: track.id, stem, runId: parentRunId, sourceRunId: stemRunId,
      source: {path: path.join(dir, `stems/${stemRunId}/${stem}.wav`), size: wav.size, mtimeMs: wav.mtimeMs},
      engine: 'piano-transkun', model: profile.model, options: profile.options, backend: {checkpointSha256: profile.checkpoint?.sha256},
      timeOrigin: 0, duration: 1, noteCount: parentNotes.length, tempoMode: 'fixed-timebase', quantized: false,
      file: prefix + stem + '.mid', notesFile: prefix + 'notes.json', createdAt: '2026-09-21T00:00:00.000Z'};
    await write(`midi/${stem}/runs/${parentRunId}.json`, parent);
    await midi.activate(track, parent);

    // The stub stands in for revise.py: it produces the file the commit path then handles. Whether that file is a
    // faithful edit is the Python test's question, not this one's.
    let writerCalls = 0, writerResult = null;
    const runner = async args => {
      writerCalls += 1;
      if (writerResult) return writerResult;
      const job = JSON.parse(await fs.readFile(args[args.indexOf('--job') + 1], 'utf8'));
      const output = args[args.indexOf('--output') + 1];
      await fs.writeFile(output, HEADER);
      await fs.writeFile(output.replace(/\.mid$/, '.notes.json'), JSON.stringify(job.notes));
      return {ok: true, value: {ok: true, instrument: job.instrument, noteCount: job.notes.length, changedChunk: 2, parentWasCanonical: true}};
    };
    const revision = createMidiRevision({analysisRoot: root, assets, runner});
    const runDirs = async () => (await fs.readdir(path.join(dir, 'midi', stem), {withFileTypes: true}))
      .filter(entry => entry.isDirectory() && entry.name !== 'runs' && entry.name !== 'by-source' && entry.name !== 'kept')
      .map(entry => entry.name).sort();
    const before = await runDirs();

    // --- the happy path ---------------------------------------------------------------------------------------
    const edited = [{start: 0, end: 0.4, pitch: 60, velocity: 111}, {start: 0.5, end: 0.9, pitch: 64, velocity: 80}];
    const saved = await revision.save(track, {stem, parentRunId, instrument: 0, notes: edited});
    assert(saved.ok, 'a revision saves: ' + saved.error);
    assert.equal(saved.parentRunId, parentRunId);
    assert.equal(saved.active, true, 'and becomes the active version');
    const active = await midi.read(track, stem);
    assert.equal(active.runId, saved.runId);
    assert.equal(active.engine, MANUAL_ENGINE);
    // Permanently superseded is the accepted consequence of one identity per revision — but it must be an
    // earlier VERSION, never a damaged record.
    assert.equal(active.matches, false);
    assert.equal((await midi.readRun(track, stem, saved.runId)).status, 'superseded');
    // An identity that never collides, including with the profile it belongs to.
    const record = (await midi.readRun(track, stem, saved.runId)).run;
    assert.equal(record.options.parentRunId, parentRunId);
    assert(record.options.revision, 'the content digest is part of the identity');
    assert.notEqual(identityOf(record), identityOf(MANUAL), 'a revision is not the profile');
    // Source facts are copied from the parent, never recomputed.
    assert.equal(record.sourceRunId, parent.sourceRunId);
    assert.deepEqual(record.source, parent.source);
    assert.equal(record.duration, parent.duration);
    // Exactly two files, or midi-delete refuses to remove the run and retention skips it forever.
    assert.deepEqual((await fs.readdir(path.join(dir, 'midi', stem, saved.runId))).sort(), ['notes.json', 'piano.mid']);
    assert.deepEqual(await runDirs(), [...before, saved.runId].sort(), 'one new run directory and no staging left behind');

    // --- clamping ----------------------------------------------------------------------------------------------
    const clampCheck = await revision.save(track, {stem, parentRunId, instrument: 0,
      notes: [{start: -5, end: 99, pitch: 200, velocity: 0}, {start: 0.2, end: 0.3, pitch: 62, velocity: 500}]});
    assert(clampCheck.ok, 'out-of-range values are clamped rather than refused: ' + clampCheck.error);
    const clamped = JSON.parse(await fs.readFile(path.join(dir, 'midi', stem, clampCheck.runId, 'notes.json'), 'utf8'));
    assert.deepEqual(clamped.notes[0], {start: 0, end: 1, pitch: 127, velocity: 1}, JSON.stringify(clamped.notes[0]));
    assert.equal(clamped.notes[1].velocity, 127);
    assert.equal(clamped.duration, parent.duration, 'the span comes from the parent, not from the notes');

    // --- the writer refuses: nothing is left on disk ---------------------------------------------------------------
    const settled = await runDirs();
    writerResult = {ok: false, error: 'revision-overlapping-notes'};
    const refused = await revision.save(track, {stem, parentRunId, instrument: 0, notes: edited});
    assert.equal(refused.ok, false);
    assert.equal(refused.error, 'revision-overlapping-notes', 'the writer’s own verdict is relayed by name');
    assert.equal(refused.parentRunId, parentRunId);
    assert.deepEqual(await runDirs(), settled, 'a refused write leaves no directory behind: ' + JSON.stringify(await runDirs()));
    writerResult = null;

    // --- the parent is stale: refuse, having written nothing ---------------------------------------------------------
    // activate() verifies against the current source too, but it does so AFTER the files are on disk — which is
    // how a save against a moved source used to leave an orphan directory with no record and no pointer.
    const stemWav = path.join(dir, `stems/${stemRunId}/${stem}.wav`);
    const intact = await fs.readFile(stemWav);
    const stamp = await fs.stat(stemWav);
    await fs.writeFile(stemWav, Buffer.alloc(44100 * 9));
    const callsBefore = writerCalls;
    const stale = await revision.save(track, {stem, parentRunId, instrument: 0, notes: edited});
    assert.equal(stale.ok, false);
    assert(/stale|invalid|missing/.test(stale.error), 'a moved source is refused: ' + stale.error);
    assert.equal(writerCalls, callsBefore, 'and the writer is never even asked to run');
    assert.deepEqual(await runDirs(), settled, 'nothing is written');
    // The mtime is part of what binds a record to its source, so restoring the bytes is not restoring the file.
    await fs.writeFile(stemWav, intact);
    await fs.utimes(stemWav, stamp.atime, stamp.mtime);

    // --- activation fails: the parent comes back ----------------------------------------------------------------------
    // "Delete the directory" is not a rollback. activate() may already have rewritten some of the four pointer
    // paths, and removing the run underneath them would leave the stem with NO readable MIDI while the parent sat
    // intact one call away.
    await midi.activate(track, parent);
    const hostile = createMidiRevision({analysisRoot: root, assets: {...assets,
      midi: {...midi, activate: async (t, value) => {
        if (value.engine === MANUAL_ENGINE) throw new Error('midi-invalid');
        return midi.activate(t, value);
      }}}, runner});
    const stableDirs = await runDirs();
    const failed = await hostile.save(track, {stem, parentRunId, instrument: 0, notes: edited});
    assert.equal(failed.ok, false);
    assert.equal(failed.error, 'midi-invalid');
    assert.equal(failed.restored, parentRunId, 'the parent is put back: ' + JSON.stringify(failed));
    const afterFailure = await midi.read(track, stem);
    assert(afterFailure.ok, 'the stem still has readable MIDI: ' + afterFailure.error);
    assert.equal(afterFailure.runId, parentRunId, 'and it is the parent');
    assert.deepEqual(await runDirs(), stableDirs, 'the failed run leaves no directory');
    assert(failed.runId, 'the receipt names the run it rolled back');
    assert.equal((await midi.readRun(track, stem, failed.runId)).ok, false, 'nor a record');

    // --- an unreadable parent is refused before anything else -------------------------------------------------------
    const missing = await revision.save(track, {stem, parentRunId: crypto.randomUUID(), instrument: 0, notes: edited});
    assert.equal(missing.ok, false);
    assert.equal(missing.error, 'midi-missing');
    assert.equal((await revision.save(track, {stem, parentRunId, instrument: 0, notes: 'not a list'})).error, 'revision-notes-invalid');

    // --- the guarantees that live in other files ------------------------------------------------------------------------
    {
      const read = name => require('node:fs').readFileSync(path.join(__dirname, '..', name), 'utf8');
      const module_ = read('core/midi-revision.cjs'), service = read('core/analysis-service.cjs');
      // pythonFor() cannot serve this: 'manual-revision' is deliberately absent from ENGINE_IDS, so every MIDI branch
      // in pythonFor misses and it falls through to the MSAF interpreter, which has no pretty_midi.
      assert(/process\.env\.XLD_MIDI_PYTHON/.test(module_), 'the writer names its interpreter explicitly');
      // The name appears in a comment explaining why it cannot be used, so the check has to look at code.
      // Comments are stripped rather than the assertion loosened, which would have quietly stopped checking.
      const code = module_.split(/\r?\n/).filter(line => !/^\s*\/\//.test(line)).join('\n');
      assert(!/pythonFor/.test(code), 'and never asks pythonFor for one');
      assert(!/analysis-service/.test(code), 'nor reaches into the service to get at it');
      assert(!/ENGINE_IDS.*manual/.test(service), 'a revision is still not a startable engine');
      // Staging must not live inside the destination: midi-delete only removes a run directory holding exactly two
      // files, so a stray job JSON would make the run undeletable and invisible to retention.
      assert(/'\.revision-' \+ runId/.test(module_), 'staging is a sibling of the run directory');
      assert(/finally \{\s*await fs\.rm\(staging/.test(module_), 'and is removed on every path');
      // A traceback is never the answer.
      assert(/ValueError:\\s\*\(revision-\[a-z-\]\+\)/.test(module_), 'the writer’s stable codes are parsed out');
      assert(/revision-writer-failed/.test(module_), 'and anything else is reported as a crash, not dressed up as a refusal');
    }

    console.log('midi revision write: ok (verified before a byte is written, staged outside the run directory, exactly two files committed, and the parent restored when activation fails)');
  } finally {
    await fs.rm(root, {recursive: true, force: true});
  }
})().catch(error => {console.error(error); process.exitCode = 1;});

