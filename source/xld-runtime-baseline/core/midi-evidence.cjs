'use strict';
// Checking a transcribed MIDI run against the stem it came from, and applying what the check found.
//
// Two operations, deliberately apart:
//
//   check   reads a run and its stem, writes ONE sidecar: midi/<stem>/evidence/<runId>.json. The run itself is
//           not touched, so a check can never damage a result. The sidecar says, per note, whether the stem is
//           silent there, whether the pitch is in the stem, and how far past the written end the pitch keeps
//           sounding (analysis-midi/evidence.py has the method and where its thresholds came from).
//   apply   makes a new version without the notes that sit in silence, and optionally with the short notes
//           lengthened. It goes through core/midi-revision.cjs — the same commit path a hand edit takes — so
//           the original run survives, the version list can switch back to it, and nothing here needs its own
//           rules for staging, verification or rollback.
//
// WHY THE SIDECAR LIVES NEXT TO drafts/ AND NOT IN THE RUN DIRECTORY. midi-delete only removes a run directory
// holding exactly its two files; a third file there makes the run undeletable through the interface and
// invisible to retention. midi/<stem>/evidence/ follows midi/<stem>/drafts/: keyed by runId, outside every run.
//
// WHAT "CERTAIN" MEANS HERE. Only the silence verdict removes notes. A note written where the stem is silent
// cannot be heard in the stem, so dropping it loses nothing. The other verdicts (no energy at the pitch, weak
// energy) rest on agreement between engines, which is a stand-in for truth; they are shown, never applied.
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {writeAtomic, STEMS} = require('./derived-assets.cjs');

const SILENT = 3;
// The rule analysis-midi/evidence.py applies. A sidecar written under another rule is stale, not wrong data to
// act on: audio-evidence-1 proposed lengthening bass notes into the note that followed them.
const METHOD = 'audio-evidence-2';
const validRun = value => /^[a-zA-Z0-9-]{1,80}$/.test(String(value || ''));
// Two notes of one pitch cannot start within a tick of each other in one instrument (the writer refuses the
// overlap), so pitch plus start to the centisecond names a note across a rewrite.
const noteKey = note => Math.round(Number(note.pitch)) + ':' + Math.round(Number(note.start) * 100);

function createMidiEvidence({assets, revision, python = null, script = null, runner = null}) {
  // The evidence script needs librosa and pretty_midi together; both MIDI runtimes carry them.
  const interpreter = () => python || process.env.XLD_HIGHRES_PYTHON || process.env.XLD_MIDI_PYTHON || null;
  const judge = () => script || path.join(__dirname, '..', 'analysis-midi', 'evidence.py');
  const run = args => runner ? runner(args) : spawnJudge(args);

  function spawnJudge(args) {
    return new Promise(resolve => {
      const executable = interpreter();
      if (!executable || !fsSync.existsSync(executable)) return resolve({ok: false, error: 'evidence-runtime-missing'});
      const child = spawn(executable, ['-X', 'utf8', '-B', judge(), ...args], {windowsHide: true});
      let out = '', err = '';
      child.stdout.on('data', data => {out += data;});
      child.stderr.on('data', data => {err += data;});
      child.on('error', error => resolve({ok: false, error: 'evidence-runtime-missing', detail: error.message}));
      child.on('close', code => {
        if (code === 0) {
          // Libraries print warnings on stdout in some environments; the result is the last line.
          const last = out.trim().split(/\r?\n/).filter(Boolean).pop() || '';
          try { return resolve({ok: true, value: JSON.parse(last)}); }
          catch (_) { return resolve({ok: false, error: 'evidence-output-invalid'}); }
        }
        const last = err.trim().split(/\r?\n/).filter(Boolean).pop() || '';
        const named = /ValueError:\s*(evidence-[a-z-]+)/.exec(last);
        resolve({ok: false, error: named ? named[1] : 'evidence-failed', detail: last.slice(0, 300)});
      });
    });
  }

  function file(track, stem, runId) {
    if (!STEMS.includes(stem) || !validRun(runId)) throw new Error('evidence-invalid');
    return path.join(assets.directory(track), 'midi', stem, 'evidence', runId + '.json');
  }

  // A parent that is readable AND still bound to the source it was transcribed from. Evidence about a run
  // whose stem has since changed would be a comparison against the wrong audio.
  async function parentOf(track, stem, runId) {
    if (!STEMS.includes(stem) || !validRun(runId)) return {ok: false, error: 'evidence-invalid'};
    const view = await assets.midi.readRun(track, stem, runId);
    if (!view.ok) return {ok: false, error: view.error || 'midi-missing'};
    const record = view.run;
    try {
      await assets.midi.verify(record, track, stem, {source: await assets.midi.source(track, stem), engine: record.engine});
    } catch (error) {
      return {ok: false, error: error.message || 'midi-stale'};
    }
    return {ok: true, record};
  }

  function shapeOk(value) {
    return value && value.kind === 'midi-evidence' && value.schemaVersion === 1 && value.method === METHOD && typeof value.midiSha256 === 'string' &&
      Array.isArray(value.instruments) && value.instruments.every(item => Number.isInteger(item.index) &&
        Array.isArray(item.verdicts) && item.verdicts.length === item.noteCount && item.extend && typeof item.extend === 'object');
  }

  function summary(value) {
    return {totals: value.totals, method: value.method, createdAt: value.createdAt || null, appliedFrom: value.appliedFrom || null,
      instruments: value.instruments.map(item => ({index: item.index, name: item.name, program: item.program, isDrum: item.isDrum,
        noteCount: item.noteCount, silent: item.verdicts.filter(v => v === SILENT).length, short: Object.keys(item.extend).length}))};
  }

  // {ok:true, evidence:null} is "never checked" or "checked against a file that is no longer this run's".
  async function read(track, {stem, runId} = {}) {
    let name;
    try { name = file(track, stem, runId); } catch (error) { return {ok: false, error: error.message}; }
    let value;
    try { value = JSON.parse(await fs.readFile(name, 'utf8')); }
    catch (error) { return error.code === 'ENOENT' ? {ok: true, evidence: null} : {ok: false, error: 'evidence-read-failed'}; }
    if (!shapeOk(value) || value.runId !== runId || value.stem !== stem) return {ok: true, evidence: null, stale: true};
    const view = await assets.midi.readRun(track, stem, runId);
    const digest = (view.ok ? view.run : view.record)?.digests?.midi;
    if (digest !== value.midiSha256) return {ok: true, evidence: null, stale: true};
    // `flat` is the same verdicts in notes.json order (instruments concatenated in file order), which is the
    // index every note on the timeline carries.
    const flat = {verdicts: [], extend: {}};
    for (const item of value.instruments.slice().sort((a, b) => a.index - b.index)) {
      const offset = flat.verdicts.length;
      for (const [index, until] of Object.entries(item.extend)) flat.extend[offset + Number(index)] = until;
      flat.verdicts.push(...item.verdicts);
    }
    return {ok: true, evidence: value, flat, ...summary(value)};
  }

  async function check(track, {stem, runId} = {}) {
    const parent = await parentOf(track, stem, runId);
    if (!parent.ok) return parent;
    const directory = assets.directory(track);
    // Staging is in the system temp folder: the analysis root receives exactly one file, and only on success.
    const staging = await fs.mkdtemp(path.join(os.tmpdir(), 'xld-evidence-'));
    try {
      const output = path.join(staging, 'evidence.json');
      const judged = await run(['--midi', path.join(directory, parent.record.file), '--wav', parent.record.source.path, '--output', output]);
      if (!judged.ok) return judged;
      let value;
      try { value = JSON.parse(await fs.readFile(output, 'utf8')); } catch (_) { return {ok: false, error: 'evidence-output-invalid'}; }
      if (!shapeOk(value)) return {ok: false, error: 'evidence-output-invalid'};
      // The script hashed the file it read. If that is not the run's recorded MIDI, the run changed underneath.
      if (value.midiSha256 !== parent.record.digests?.midi) return {ok: false, error: 'evidence-run-changed'};
      const stored = {...value, trackId: track.id, stem, runId, sourceRunId: parent.record.sourceRunId, createdAt: new Date().toISOString()};
      await writeAtomic(file(track, stem, runId), stored);
      return {ok: true, stem, runId, ...summary(stored)};
    } finally {
      await fs.rm(staging, {recursive: true, force: true}).catch(() => {});
    }
  }

  // What apply would do, without doing it. The interface shows these numbers before the user commits.
  async function plan(track, {stem, runId, removeSilent = true, extend = false} = {}) {
    const parent = await parentOf(track, stem, runId);
    if (!parent.ok) return parent;
    const stored = await read(track, {stem, runId});
    if (!stored.ok) return stored;
    if (!stored.evidence) return {ok: false, error: stored.stale ? 'evidence-stale' : 'evidence-missing'};
    const inspected = await revision.inspect(track, stem, runId);
    if (!inspected.ok) return inspected;
    const edits = [], parentNotes = {};
    let removed = 0, lengthened = 0;
    for (const instrument of inspected.instruments || []) {
      const evidence = stored.evidence.instruments.find(item => item.index === instrument.index);
      // The order the verdicts are in is the order pretty_midi read the notes in. A count that differs means
      // the two readings are not of the same file, and pairing them by position would mark the wrong notes.
      if (!evidence || evidence.noteCount !== instrument.notes.length) return {ok: false, error: 'evidence-stale'};
      parentNotes[instrument.index] = instrument.notes;
      const notes = [];
      let dropped = 0, longer = 0;
      instrument.notes.forEach((note, index) => {
        if (removeSilent && evidence.verdicts[index] === SILENT) { dropped += 1; return; }
        const until = extend ? Number(evidence.extend[String(index)]) : NaN;
        if (Number.isFinite(until) && until > note.end) { longer += 1; notes.push({...note, end: until}); }
        else notes.push({...note});
      });
      if (!dropped && !longer) continue;
      // An instrument with nothing left cannot be written (the reader drops it and every later index shifts).
      // That is a whole part transcribed from silence, which is a result to delete, not one to revise.
      if (!notes.length) return {ok: false, error: 'evidence-empties-instrument', instrument: instrument.index, noteCount: instrument.notes.length};
      edits.push({instrument: instrument.index, notes, removed: dropped, lengthened: longer});
      removed += dropped; lengthened += longer;
    }
    if (!edits.length) return {ok: false, error: 'evidence-no-change'};
    return {ok: true, stem, runId, removed, lengthened, edits, parentNotes, evidence: stored.evidence, record: parent.record};
  }

  async function apply(track, options = {}) {
    const planned = await plan(track, options);
    if (!planned.ok) return planned;
    const {stem, runId} = planned;
    // One revision per edited instrument, each the parent of the next: the writer changes exactly one
    // instrument per file and verifies that nothing else moved. The versions in between are removed afterwards
    // so the list shows the original and the result, not the scaffolding.
    const created = [];
    let parentRunId = runId;
    for (const edit of planned.edits) {
      const saved = await revision.save(track, {stem, parentRunId, instrument: edit.instrument, notes: edit.notes});
      if (!saved.ok) {
        // Put the original back in use and clear what this call made; a half-applied result is worse than none.
        if (created.length) {
          await assets.midi.activateRun(track, stem, runId, {engine: planned.record.engine}).catch(() => {});
          for (const id of created) await assets.midi.removeRun(assets.directory(track), stem, id).catch(() => {});
        }
        return {...saved, ok: false, parentRunId: runId, restored: created.length ? runId : null};
      }
      created.push(saved.runId);
      parentRunId = saved.runId;
    }
    const finalRunId = created[created.length - 1];
    for (const id of created.slice(0, -1)) await assets.midi.removeRun(assets.directory(track), stem, id).catch(() => {});

    // Carry what is still true over to the new version, so the marks do not vanish the moment they are acted on.
    // Best effort: the new version is complete without it, and a fresh check rebuilds it.
    let carried = false;
    try {
      const after = await revision.inspect(track, stem, finalRunId);
      const view = await assets.midi.readRun(track, stem, finalRunId);
      if (after.ok && view.ok) {
        const instruments = after.instruments.map(instrument => {
          const before = planned.evidence.instruments.find(item => item.index === instrument.index);
          const original = new Map();
          (planned.parentNotes[instrument.index] || []).forEach((note, index) => original.set(noteKey(note), index));
          const verdicts = [], extend = {};
          instrument.notes.forEach((note, index) => {
            const from = before ? original.get(noteKey(note)) : undefined;
            verdicts.push(from === undefined ? 0 : before.verdicts[from]);
            // A suggestion that was not taken still stands; one that was taken is now the note's own length.
            if (!options.extend && from !== undefined && before.extend[String(from)] !== undefined) extend[String(index)] = before.extend[String(from)];
          });
          return {index: instrument.index, name: instrument.name, program: instrument.program, isDrum: instrument.isDrum,
            noteCount: instrument.notes.length, verdicts, extend};
        });
        const count = code => instruments.reduce((sum, item) => sum + item.verdicts.filter(v => v === code).length, 0);
        await writeAtomic(file(track, stem, finalRunId), {
          schemaVersion: 1, kind: 'midi-evidence', method: planned.evidence.method, params: planned.evidence.params,
          midiSha256: view.run.digests.midi, audio: planned.evidence.audio,
          totals: {notes: instruments.reduce((sum, item) => sum + item.noteCount, 0), silent: count(SILENT), noPitch: count(2), weak: count(1),
            short: instruments.reduce((sum, item) => sum + Object.keys(item.extend).length, 0)},
          instruments, trackId: track.id, stem, runId: finalRunId, sourceRunId: view.run.sourceRunId,
          createdAt: new Date().toISOString(),
          appliedFrom: {runId, removed: planned.removed, lengthened: planned.lengthened}});
        carried = true;
      }
    } catch (_) { carried = false; }

    const active = await assets.midi.read(track, stem);
    return {ok: true, stem, runId: finalRunId, parentRunId: runId, removed: planned.removed, lengthened: planned.lengthened,
      instruments: planned.edits.map(edit => edit.instrument), active: active.ok && active.runId === finalRunId, evidenceCarried: carried};
  }

  // The stem WAV a check of this run reads (the lane page draws its loudness under the notes). Same lookup as
  // check(): the run's recorded source, and only while it is still bound to the current stem.
  async function sourceWav(track, {stem, runId} = {}) {
    const parent = await parentOf(track, stem, runId);
    if (!parent.ok) return parent;
    const wav = parent.record.source?.path;
    return wav ? {ok: true, path: wav} : {ok: false, error: 'evidence-no-source'};
  }

  return {check, read, plan, apply, file, sourceWav};
}

module.exports = {createMidiEvidence, SILENT};
