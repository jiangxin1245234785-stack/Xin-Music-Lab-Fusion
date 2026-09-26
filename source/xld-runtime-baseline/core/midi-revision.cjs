'use strict';
// Saving a hand-edited MIDI revision: the commit path.
//
// The order below is the whole point of this module, and it is fixed:
//
//   read the parent record -> verify it against the CURRENT source -> refuse, having written nothing
//     -> write into staging OUTSIDE the destination -> let Python verify the file it produced
//     -> move exactly two files into midi/<stem>/<runId>/ -> activate -> on failure, put the parent back
//
// Two of those steps exist because of specific failures this project has already had.
//
// VERIFY BEFORE WRITING A BYTE. activate() verifies against the current source itself, and it does so AFTER the
// files are on disk. Saving a revision whose parent source had changed would therefore leave an orphan directory
// with no record, no pointer, invisible to listRuns and permanently skipped by retention. The owner's decision
// (2026-09-21) is to refuse in that case rather than store a revision bound to a source that no longer exists.
//
// STAGING LIVES OUTSIDE THE RUN DIRECTORY. midi-delete only removes a run directory holding exactly two files;
// a leftover job JSON or a control file inside it makes the run undeletable through the interface and invisible
// to retention. Staging is a sibling directory that is removed on every path, success or failure.
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {writeAtomic, MANUAL, MANUAL_ENGINE} = require('./derived-assets.cjs');

const sha256 = data => require('node:crypto').createHash('sha256').update(data).digest('hex');
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

// `runner` is the seam the tests use. The npm test chain is pure Node on purpose — adding a Python dependency
// would turn it red on any machine without the MIDI runtime — so the commit ORDER and the rollback are tested
// with an injected writer here, and the writer's own fidelity is tested against real Python as a separate log.
function createMidiRevision({analysisRoot, assets, python = null, script = null, runner = null}) {
  const directoryFor = track => assets.directory(track);
  // pythonFor() cannot serve this. Every MIDI branch in it keys off ENGINE_IDS, and 'manual-revision' is
  // deliberately not in ENGINE_IDS — that is what keeps it out of the model menu and unstartable — so asking
  // pythonFor for it falls all the way through to the MSAF interpreter, which has no pretty_midi. The writer
  // names its interpreter explicitly.
  const interpreter = () => python || process.env.XLD_MIDI_PYTHON || null;
  const writer = () => script || path.join(__dirname, '..', 'analysis-midi', 'revise.py');

  const run = args => runner ? runner(args) : spawnWriter(args);

  function spawnWriter(args) {
    return new Promise(resolve => {
      const executable = interpreter();
      if (!executable || !fsSync.existsSync(executable)) return resolve({ok: false, error: 'revision-runtime-missing'});
      const child = spawn(executable, ['-X', 'utf8', writer(), ...args], {windowsHide: true});
      let out = '', err = '';
      child.stdout.on('data', data => {out += data;});
      child.stderr.on('data', data => {err += data;});
      child.on('error', error => resolve({ok: false, error: 'revision-runtime-missing', detail: error.message}));
      child.on('close', code => {
        if (code === 0) {
          try { return resolve({ok: true, value: JSON.parse(out)}); }
          catch (_) { return resolve({ok: false, error: 'revision-writer-output-invalid'}); }
        }
        // A traceback must never reach the interface. The script raises ValueError with a stable code as its
        // message, so the last line is 'ValueError: revision-...'; anything else is a real crash and is reported
        // as one rather than dressed up as a refusal.
        const last = err.trim().split(/\r?\n/).filter(Boolean).pop() || '';
        const code_ = /ValueError:\s*(revision-[a-z-]+)/.exec(last);
        resolve({ok: false, error: code_ ? code_[1] : 'revision-writer-failed', detail: last.slice(0, 300)});
      });
    });
  }

  async function inspect(track, stem, runId) {
    const parent = await assets.midi.readRun(track, stem, runId);
    if (!parent.ok) return {ok: false, error: parent.error || 'midi-missing'};
    const file = path.join(directoryFor(track), parent.run.file);
    const result = await run(['--inspect', file]);
    return result.ok ? {ok: true, runId, stem, ...result.value} : result;
  }

  // `notes` is what the caller wants the instrument to contain afterwards — the whole list, not a diff.
  async function save(track, {stem, parentRunId, instrument, notes}) {
    if (!Array.isArray(notes)) return {ok: false, error: 'revision-notes-invalid'};
    const parent = parentRunId ? await assets.midi.readRun(track, stem, parentRunId) : null;
    const record = parent ? (parent.ok ? {...parent.run} : null) : null;
    if (!record) return {ok: false, error: parent?.error || 'midi-missing'};

    // Against the CURRENT source, before anything is written. A revision is bound to the same WAV its parent was
    // bound to; if that has moved on, there is nothing coherent to save.
    const directory = directoryFor(track);
    try {
      await assets.midi.verify(record, track, stem, {source: await assets.midi.source(track, stem), engine: record.engine});
    } catch (error) {
      return {ok: false, error: error.message || 'midi-stale', parentRunId: record.runId};
    }

    const duration = Number(record.duration);
    if (!Number.isFinite(duration) || duration <= 0) return {ok: false, error: 'revision-duration-invalid'};
    // Clamped here rather than refused, because an editor that drags a note past the end of the part means "to
    // the end". What clamping cannot rescue — a note that collapses to nothing, or lands on top of another of
    // the same pitch — the writer refuses by name.
    const clamped = notes.map(note => ({
      start: clamp(Number(note.start) || 0, 0, duration),
      end: clamp(Number(note.end) || 0, 0, duration),
      pitch: Math.round(clamp(Number(note.pitch) || 0, 0, 127)),
      velocity: Math.round(clamp(Number(note.velocity) || 0, 1, 127))
    }));

    const runId = require('node:crypto').randomUUID();
    const staging = path.join(directory, 'midi', stem, '.revision-' + runId);
    const target = path.join(directory, 'midi', stem, runId);
    const prefix = `midi/${stem}/${runId}/`;
    try {
      await fs.mkdir(staging, {recursive: true});
      const job = path.join(staging, 'job.json');
      const output = path.join(staging, stem + '.mid');
      await fs.writeFile(job, JSON.stringify({source: path.join(directory, record.file), instrument: Number(instrument), notes: clamped}));
      const written = await run(['--job', job, '--output', output]);
      if (!written.ok) return {...written, parentRunId: record.runId};

      const midiBytes = await fs.readFile(output);
      const completeNotes = JSON.parse(await fs.readFile(output.replace(/\.mid$/, '.notes.json'), 'utf8'));
      if (!Array.isArray(completeNotes) || !completeNotes.length) return {ok:false,error:'revision-writer-output-invalid'};

      const notesText = JSON.stringify({schemaVersion: 1, kind: 'notes', trackId: track.id, stem,
        sourceRunId: record.sourceRunId, runId, engine: MANUAL_ENGINE, model: MANUAL.model,
        timeOrigin: 0, duration, notes: completeNotes});
      await fs.writeFile(path.join(staging, 'notes.json'), notesText);

      // Everything about the source is copied from the parent, never recomputed: a revision is the same audio,
      // the same span and the same strings target as the run it came from, and re-deriving any of it would be a
      // second opinion the record has no way to reconcile.
      const child = {
        schemaVersion: 1, kind: 'midi', trackId: track.id, stem, runId,
        sourceRunId: record.sourceRunId, source: record.source,
        engine: MANUAL_ENGINE, model: MANUAL.model,
        // Never empty. An identity is hashed from engine, model, checkpoint and options; a revision whose options
        // were missing would hash to the MANUAL profile's own identity and report matches:true / status
        // 'current' — healthier-looking than a correct revision, and cache-equivalent to every other revision
        // that made the same mistake.
        options: {revision: sha256(midiBytes).slice(0, 16), parentRunId: record.runId, instrument: Number(instrument)},
        backend: {checkpointSha256: null},
        timeOrigin: 0, duration, noteCount: completeNotes.length,
        tempoMode: 'fixed-timebase', quantized: false,
        file: prefix + stem + '.mid', notesFile: prefix + 'notes.json',
        digests: {midi: sha256(midiBytes), notes: sha256(Buffer.from(notesText))},
        createdAt: new Date().toISOString(),
        ...(record.sourceTarget ? {sourceTarget: record.sourceTarget} : {}),
        ...(record.program !== undefined ? {program: record.program} : {})
      };

      await fs.mkdir(target, {recursive: true});
      await fs.rename(output, path.join(target, stem + '.mid'));
      await fs.rename(path.join(staging, 'notes.json'), path.join(target, 'notes.json'));
      await writeAtomic(assets.midi.runRecordPath(track, stem, runId), child);

      try {
        await assets.midi.activate(track, child);
      } catch (error) {
        // Not just "delete the directory": activate() may already have rewritten some of the four pointer paths,
        // and removing the run underneath them would leave the stem with no readable MIDI at all while the parent
        // sat intact one call away. Put the parent back first, then clear the failed run.
        let restored = null;
        try { await assets.midi.activate(track, record); restored = record.runId; } catch (_) { restored = null; }
        await fs.rm(target, {recursive: true, force: true}).catch(() => {});
        await fs.rm(assets.midi.runRecordPath(track, stem, runId), {force: true}).catch(() => {});
        // The receipt names the run that was rolled back as well as the one that came back, so a caller can
        // say what happened instead of only that something did.
        return {ok: false, error: error.message || 'revision-activate-failed', runId, parentRunId: record.runId, restored};
      }

      const saved = await assets.midi.read(track, stem);
      return {ok: true, runId, stem, parentRunId: record.runId, instrument: Number(instrument),
        noteCount: clamped.length, writer: written.value, active: saved.ok && saved.runId === runId};
    } finally {
      await fs.rm(staging, {recursive: true, force: true}).catch(() => {});
    }
  }

  return {save, inspect};
}

module.exports = {createMidiRevision};
