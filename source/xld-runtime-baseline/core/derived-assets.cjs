'use strict';
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
function safeName(value, fallback = 'Unknown') {
  const cleaned = String(value || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/[. ]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return (cleaned || fallback).slice(0, 96);
}

function trackDirectory(track, root, displayNames = false) {
 const field = name => !displayNames && track['path' + name[0].toUpperCase() + name.slice(1)] != null
   ? track['path' + name[0].toUpperCase() + name.slice(1)] : track[name];
 const album = safeName(field('artist') + ' - ' + field('album'), 'Unknown album');
 const song = safeName(String(field('number') || 0).padStart(2, '0') + ' ' + field('title'), 'Unknown track');
 return path.join(root, album, song + '__' + String(track.id).slice(0, 10));
}
function derivedDirectory(track, root) {
 const candidates = [trackDirectory(track, root), trackDirectory(track, root, true), track.bridgePath && path.dirname(track.bridgePath)].filter(Boolean);
 return candidates.find(directory => fsSync.existsSync(path.join(directory, 'stems.json'))) || candidates[0];
}
const PROFILES = Object.freeze(require('../analysis-midi/models.json'));
const ENGINE_IDS = Object.freeze(PROFILES.map(profile => profile.id));
const defaultEngine = stem => PROFILES.find(profile => profile.defaultFor === stem)?.id || 'basic-pitch';
const ENGINE = 'basic-pitch';
const MODEL = 'basic-pitch-0.4.0-onnx';
const STEMS = Object.freeze([...new Set(PROFILES.flatMap(profile => profile.stems))]);

// A hand-edited revision is a version like any other — read, listed, switchable, merged, drawn on the timeline —
// except that no model made it. It still needs a profile, because verify() refuses any record whose engine it
// cannot resolve and that refusal reads as 'midi-invalid': the interface would present the user's own edit as a
// damaged file.
//
// It deliberately does NOT go into analysis-midi/models.json. That array is the MODEL REGISTRY: it feeds the engine
// menu, ENGINE_IDS (which is what makes an engine startable at all), the per-stem variants grid, and the Python
// runner's own --engine choices. An entry there would be offered to the user as something to run, and there is
// nothing to run.
//
// `options` must stay empty. profileMismatch() compares the profile's declared options against the record's before
// anything else and returns 'midi-invalid' on any difference — a harsher verdict than the 'midi-model-invalid'
// that merely makes a record superseded. Declaring options here would turn every revision into a damaged record.
//
// The id is 'manual-revision' rather than 'manual' because 'manual' is already the engine id of the hand-made
// SECTION and CHORD annotations. Two different things under one id in one app is how a later round confuses them.
const MANUAL_ENGINE = 'manual-revision';
const MANUAL = Object.freeze({id: MANUAL_ENGINE, name: 'Manual revision', stems: STEMS, model: 'manual-revision-v1', options: {}});
const PROFILE_LOOKUP = Object.freeze([...PROFILES, MANUAL]);
const profileFor = engine => PROFILE_LOOKUP.find(profile => profile.id === engine);
// A stored result belongs to its engine even after that engine's model version changed.
// Only records written before per-engine manifests lack `engine`; they resolve by model string, and no record that
// old can be a revision, so that branch stays on the model registry.
const profileForResult = result => result?.engine ? PROFILE_LOOKUP.find(profile => profile.id === result.engine) : PROFILES.find(profile => profile.model === result?.model);
const OPTIONS = Object.freeze({ onsetThreshold: 0.5, frameThreshold: 0.3, minimumNoteMs: 127.7, midiTempo: 120 });
const validId = value => /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value || '');
const sha256 = data => require('node:crypto').createHash('sha256').update(data).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const engineOf = result => result?.engine || profileForResult(result)?.id || null;
// Model-version identity derived from what is already recorded: engine, model string, checkpoint digest and
// the verbatim inference options. Equal identity means "same version" for cache reuse and cleanup.
const identityKey = ({engine, model, checkpointSha256, options}) =>
  sha256(JSON.stringify(canonical({version: 1, engine: engine || null, model: model || null, checkpointSha256: checkpointSha256 || null, options: options || {}})));
const identityOf = value => value?.kind === 'midi'
  ? identityKey({engine: engineOf(value), model: value.model, checkpointSha256: value.backend?.checkpointSha256, options: value.options})
  : identityKey({engine: value?.id, model: value?.model, checkpointSha256: value?.checkpoint?.sha256, options: value?.options});

const SEPARATION_PROFILES = Object.freeze(require('../analysis-separation/models.json'));
const SEPARATION_ENGINE_IDS = Object.freeze(SEPARATION_PROFILES.map(profile => profile.id));
const separationProfile = engine => SEPARATION_PROFILES.find(profile => profile.id === engine);
const separationForResult = result => SEPARATION_PROFILES.find(profile => profile.model === result?.model && (!result.engine || result.engine === profile.id));
const defaultSeparation = SEPARATION_PROFILES.find(profile => profile.default).id;
async function writeAtomic(file, value) {
  const token = require('node:crypto').randomUUID(), temporary = file + '.' + token + '.tmp', backup = file + '.' + token + '.previous';
  await fs.mkdir(path.dirname(file), {recursive:true});
  await fs.writeFile(temporary, JSON.stringify(value, null, 2));
  let previous = false;
  try {
    try {await fs.rename(file, backup); previous = true;} catch(error) {if(error.code !== 'ENOENT') throw error;}
    await fs.rename(temporary, file);
  } catch(error) {
    if(previous) await fs.rename(backup, file);
    throw error;
  } finally {await fs.rm(temporary, {force:true}).catch(()=>{});}
  if(previous) await fs.rm(backup, {force:true}).catch(()=>{});
}
const cleanMidi = ({ok,directory,identity,matches,...value}) => value;
const cleanStems = ({ok,directory,...value}) => ({...value,stems:value.stems.map(({audioUrl,...stem})=>stem)});

function createMidiAssets({ analysisDirectory, readStems, readStringSource }) {
  async function source(track, stem) {
    if (!STEMS.includes(stem)) throw new Error('midi-stem-unsupported');
    if(stem==='strings'){const selected=await readStringSource?.(track);if(!selected)throw Error('midi-missing');return selected;}
    const result = await readStems(track);
    if (!result.ok) throw new Error('midi-needs-stems');
    const item = result.stems.find(item => item.name === stem);
    if (!item || !validId(result.runId)) throw new Error('midi-needs-stems');
    return { path: path.join(analysisDirectory(track), item.file), runId: result.runId, duration: item.frames / item.sampleRate };
  }
  const manifestPath = (track, stem, engine = null) => {
    if (!STEMS.includes(stem)) throw new Error('midi-stem-unsupported');
    if (engine && !profileFor(engine)?.stems.includes(stem)) throw new Error('midi-engine-unsupported');
    return engine ? path.join(analysisDirectory(track), 'midi', stem, engine + '.json') : path.join(analysisDirectory(track), 'midi', stem + '.json');
  };
  // Structural checks that need neither the model registry nor the current WAV.
  function checkRecord(result, track, stem) {
    if (result?.schemaVersion !== 1 || result.kind !== 'midi' || result.trackId !== track.id || result.stem !== stem ||
        !validId(result.runId) || !Number.isSafeInteger(result.noteCount) || result.noteCount < 0 ||
        result.timeOrigin !== 0 || result.quantized !== false || result.tempoMode !== 'fixed-timebase' || !Number.isFinite(result.duration)) throw new Error('midi-invalid');
    const prefix = `midi/${stem}/${result.runId}/`;
    if (result.file !== prefix + stem + '.mid' || result.notesFile !== prefix + 'notes.json') throw new Error('midi-invalid-path');
  }
  // Was the record made by the engine's current model version? Returns the legacy error code when not.
  function profileMismatch(result, profile) {
    if (Object.entries(profile.options || {}).some(([key, value]) => !require('node:util').isDeepStrictEqual(result.options?.[key], value))) return 'midi-invalid';
    if (profile.checkpoint && result.backend?.checkpointSha256 !== profile.checkpoint.sha256) return 'midi-model-invalid';
    return identityOf(result) === identityOf(profile) ? null : 'midi-model-invalid';
  }
  // Is the record bound to the WAV / string source that is current right now?
  async function sourceMismatch(result, stem, current) {
    if(stem==='strings' && (result.sourceTarget!==current.target || result.program!==current.program))return 'midi-string-source-stale';
    const stat = await fs.stat(current.path);
    if (result.sourceRunId !== current.runId || path.resolve(result.source?.path || '') !== path.resolve(current.path) ||
        stat.size !== result.source?.size || Math.abs(stat.mtimeMs - result.source?.mtimeMs) > 1 ||
        Math.abs(result.duration - current.duration) > 0.001) return 'midi-stale';
    return null;
  }
  async function checkFiles(result, track, stem) {
    const directory = analysisDirectory(track);
    const midi = await fs.readFile(path.join(directory, result.file));
    if (midi.length < 14 || midi.toString('ascii', 0, 4) !== 'MThd' || midi.readUInt32BE(4) !== 6 ||
        (result.digests?.midi && result.digests.midi !== sha256(midi))) throw new Error('midi-incomplete');
    const raw = await fs.readFile(path.join(directory, result.notesFile));
    const notes = JSON.parse(raw.toString('utf8'));
    if ((result.digests?.notes && result.digests.notes !== sha256(raw)) ||
        notes.schemaVersion !== 1 || notes.kind !== 'notes' || notes.trackId !== track.id || notes.stem !== stem ||
        notes.sourceRunId !== result.sourceRunId || (notes.runId && notes.runId !== result.runId) || notes.timeOrigin !== 0 || notes.duration !== result.duration ||
        !Array.isArray(notes.notes) || notes.notes.length !== result.noteCount || notes.notes.some(note =>
          !Number.isFinite(note.start) || !Number.isFinite(note.end) || note.start < 0 || note.end <= note.start || note.end > result.duration ||
          !Number.isInteger(note.pitch) || note.pitch < 0 || note.pitch > 127 ||
          !Number.isInteger(note.velocity) || note.velocity < 1 || note.velocity > 127)) throw new Error('midi-notes-invalid');
  }
  // Lenient check: a complete record of a known engine; with `source` it must also be bound to that source.
  // `matches` says whether the engine's current model version made it; `strict` turns a mismatch into the legacy error.
  async function verify(result, track, stem, {source: current = null, engine = null, strict = false} = {}) {
    checkRecord(result, track, stem);
    const profile = profileForResult(result);
    if (!profile?.stems.includes(stem) || (engine && profile.id !== engine)) throw new Error('midi-invalid');
    const drift = profileMismatch(result, profile);
    if (strict && drift) throw new Error(drift);
    if (current) {const stale = await sourceMismatch(result, stem, current); if (stale) throw new Error(stale);}
    await checkFiles(result, track, stem);
    return {...result, identity: identityOf(result), matches: !drift};
  }
  // Strict check for fresh runner output and cache reuse: current version, current source, complete files.
  const validate = async (result, track, stem, engine = null) => verify(result, track, stem, {source: await source(track, stem), engine, strict: true});
  function sourceManifest(track, stem, sourceRunId, engine = null) {
    manifestPath(track, stem, engine);
    if (!validId(sourceRunId)) throw new Error('midi-invalid');
    return path.join(analysisDirectory(track), 'midi', stem, 'by-source', sourceRunId, (engine || 'active') + '.json');
  }
  async function read(track, stem, engine = null) {
    try {
      const current = await source(track, stem);
      const candidates = [sourceManifest(track, stem, current.runId, engine), manifestPath(track, stem, engine)];
      if(engine) candidates.push(manifestPath(track, stem));
      let lastError = 'midi-missing', superseded = null;
      for(const file of candidates) {
        try {
          const verified = await verify(JSON.parse(await fs.readFile(file, 'utf8')), track, stem, {source: current, engine});
          const value = {...cleanMidi(verified), ok:true, identity:verified.identity, matches:verified.matches, directory:path.dirname(path.join(analysisDirectory(track), verified.file))};
          // The current model version wins; an earlier version stays readable but is not a cache hit.
          if(value.matches) return value;
          superseded ??= value;
        } catch(error) {if(error.code !== 'ENOENT') lastError = error.message;}
      }
      return superseded || {ok:false,error:lastError};
    } catch(error) {return {ok:false,error:error.code === 'ENOENT' ? 'midi-missing' : error.message};}
  }
  async function archive(track, value, active = false) {
    const result = cleanMidi(value), engine = profileForResult(result)?.id;
    await verify(result, track, result.stem, {source: await source(track, result.stem), engine});
    await writeAtomic(sourceManifest(track, result.stem, result.sourceRunId, engine), result);
    if(active) await writeAtomic(sourceManifest(track, result.stem, result.sourceRunId), result);
  }
  async function archiveCurrent(track) {
    for(const stem of STEMS) {
      for(const profile of PROFILES.filter(profile=>profile.stems.includes(stem))) {
        const result = await read(track, stem, profile.id);
        if(result.ok) await archive(track, result);
      }
      const active = await read(track, stem);
      if(active.ok) await archive(track, active, true);
    }
  }
  // Every run keeps its own record here; engine / active pointers are derived from it and may be rewritten.
  const runRecordPath = (track, stem, runId) => {
    if (!STEMS.includes(stem)) throw new Error('midi-stem-unsupported');
    if (!validId(runId)) throw new Error('midi-invalid');
    return path.join(analysisDirectory(track), 'midi', stem, 'runs', runId + '.json');
  };
  async function removeRun(directory, stem, runId) {
    if (!STEMS.includes(stem) || !validId(runId)) return;
    const parent = path.resolve(directory, 'midi', stem);
    const target = path.resolve(parent, runId);
    if (path.dirname(target) !== parent) throw new Error('invalid-midi-directory');
    await fs.rm(target, { recursive: true, force: true }).catch(() => {});
    await fs.rm(path.join(parent, 'runs', runId + '.json'), { force: true }).catch(() => {});
  }
  const readJson = async file => {try {return JSON.parse(await fs.readFile(file, 'utf8'));} catch(error) {if(error.code === 'ENOENT' || error instanceof SyntaxError) return null; throw error;}};
  // Pointers about to be rewritten may be the only record of an earlier run. Keep that run discoverable.
  async function preserveDisplaced(track, stem, engine, runId, sourceRunId) {
    const files = [manifestPath(track, stem, engine), manifestPath(track, stem)];
    if(validId(sourceRunId)) files.push(sourceManifest(track, stem, sourceRunId, engine), sourceManifest(track, stem, sourceRunId));
    for(const file of files) {
      const old = await readJson(file);
      if(!validId(old?.runId) || old.runId === runId) continue;
      try {checkRecord(old, track, stem);} catch(_) {continue;}
      const record = runRecordPath(track, stem, old.runId);
      if(fsSync.existsSync(record) || !fsSync.existsSync(path.join(analysisDirectory(track), 'midi', stem, old.runId))) continue;
      await writeAtomic(record, cleanMidi(old));
    }
  }
  async function activate(track, value) {
    const result = cleanMidi(value), profile = profileForResult(result);
    await verify(result, track, result.stem, {source: await source(track, result.stem), engine: profile?.id});
    const record = runRecordPath(track, result.stem, result.runId);
    if(!fsSync.existsSync(record)) await writeAtomic(record, result);
    await preserveDisplaced(track, result.stem, profile.id, result.runId, result.sourceRunId);
    const old = await read(track, result.stem);
    if(old.ok && old.runId !== result.runId) await archive(track, old, true);
    await archive(track, result, true);
    await writeAtomic(manifestPath(track, result.stem, profile.id), result);
    await writeAtomic(manifestPath(track, result.stem), result);
  }
  // Every record and pointer this stem still has, keyed by runId. listRuns projects it; readRun, the keep marker
  // and retention all read the same inventory, so "which runs exist" has exactly one definition.
  async function collectRuns(track, stem, engine = null) {
    if (!STEMS.includes(stem)) throw new Error('midi-stem-unsupported');
    if (engine && !profileFor(engine)?.stems.includes(stem)) throw new Error('midi-engine-unsupported');
    const base = path.join(analysisDirectory(track), 'midi', stem);
    const jsonFiles = async directory => {try {return (await fs.readdir(directory)).filter(name => name.endsWith('.json')).map(name => path.join(directory, name));} catch(error) {if(error.code === 'ENOENT') return []; throw error;}};
    const candidates = (await jsonFiles(path.join(base, 'runs'))).map(file => ({file, pointer: null}));
    for(const file of await jsonFiles(base)) candidates.push({file, pointer: path.basename(file, '.json')});
    candidates.push({file: base + '.json', pointer: 'active'});
    let sources = []; try {sources = (await fs.readdir(path.join(base, 'by-source'))).filter(validId);} catch(error) {if(error.code !== 'ENOENT') throw error;}
    for(const sourceRunId of sources) for(const file of await jsonFiles(path.join(base, 'by-source', sourceRunId))) candidates.push({file, pointer: `by-source/${sourceRunId}/${path.basename(file, '.json')}`});
    const runs = new Map();
    for(const {file, pointer} of candidates) {
      const raw = await readJson(file);
      if(raw?.kind !== 'midi' || !validId(raw.runId) || (engine && engineOf(raw) !== engine)) continue;
      const entry = runs.get(raw.runId) || {raw, pointed: []};
      if(pointer) entry.pointed.push(pointer);
      runs.set(raw.runId, entry);
    }
    return {base, runs};
  }
  // A run the user pinned. Deliberately a directory, so listRuns' `.json` filter never sees it, and a distinct
  // `kind`, so storage.cjs does not count the marker as a dependency of the stems WAV.
  const keptPath = (track, stem, runId) => {
    if (!STEMS.includes(stem)) throw new Error('midi-stem-unsupported');
    if (!validId(runId)) throw new Error('midi-invalid');
    return path.join(analysisDirectory(track), 'midi', stem, 'kept', runId + '.json');
  };
  async function listKept(track, stem) {
    if (!STEMS.includes(stem)) throw new Error('midi-stem-unsupported');
    try {
      const names = await fs.readdir(path.join(analysisDirectory(track), 'midi', stem, 'kept'));
      return new Set(names.filter(name => name.endsWith('.json')).map(name => path.basename(name, '.json')).filter(validId));
    } catch(error) {if(error.code === 'ENOENT') return new Set(); throw error;}
  }
  // Pinning requires the runId to be one this stem actually has, so a typo cannot leave a marker pinning nothing.
  // Unpinning never checks: a marker whose run is gone is exactly the state that has to stay clearable.
  async function keepRun(track, stem, runId, value) {
    const file = keptPath(track, stem, runId);
    if (!value) {await fs.rm(file, {force: true}); return {ok: true, runId, kept: false};}
    const {runs} = await collectRuns(track, stem);
    const entry = runs.get(runId);
    if (!entry) throw new Error('midi-missing');
    await writeAtomic(file, {schemaVersion: 1, kind: 'midi-keep', stem, engine: engineOf(entry.raw), runId, keptAt: new Date().toISOString()});
    return {ok: true, runId, kept: true};
  }
  // Address a run by its id instead of by whichever pointer happens to name it. The return is deliberately nested:
  // `run` is the on-disk record and nothing else, so no derived field can ride into activate() through cleanMidi.
  async function readRun(track, stem, runId, {engine = null, backfill = false} = {}) {
    const recordFile = runRecordPath(track, stem, runId); // validId rejects '../outside' before any path is joined
    const kept = (await listKept(track, stem)).has(runId);
    const {runs} = await collectRuns(track, stem);
    const pointed = (runs.get(runId)?.pointed || []).slice().sort();
    const record = await readJson(recordFile) ?? runs.get(runId)?.raw ?? null;
    if (!record) return {ok: false, error: 'midi-missing', record: null, status: 'files-missing', pointed, kept};
    const fail = (error, status) => ({ok: false, error, record, status, pointed, kept});
    // checkRecord only pins `file` against whatever runId the body claims, so a record named A whose body says B
    // would otherwise let a caller act on B while the dialog says A.
    if (record.runId !== runId) return fail('midi-invalid', 'invalid');
    try {checkRecord(record, track, stem);} catch(error) {return {ok: false, error: error.message, record: null, status: 'invalid', pointed, kept};}
    if (engine && engineOf(record) !== engine) return fail('midi-invalid', 'invalid');
    let current = null, sourceError = null;
    try {current = await source(track, stem);} catch(error) {sourceError = error.message;}
    try {
      // Non-strict on purpose: a superseded run stays readable, which is exactly what activate() accepts.
      const verified = await verify(record, track, stem, {source: current});
      // After verify, so a run whose payload is gone is never materialised as a record storage would then count.
      if (backfill && !fsSync.existsSync(recordFile)) await writeAtomic(recordFile, record);
      return {ok: true, run: record, identity: verified.identity, matches: verified.matches,
        status: sourceError ? 'source-changed' : verified.matches ? 'current' : 'superseded', reason: sourceError,
        directory: path.dirname(path.join(analysisDirectory(track), verified.file)), pointed, kept};
    } catch(error) {
      const reason = error.code === 'ENOENT' ? 'midi-missing' : error.message;
      return fail(reason, error.code === 'ENOENT' ? 'files-missing' : ['midi-stale', 'midi-string-source-stale'].includes(reason) ? 'source-changed' : 'invalid');
    }
  }
  // Roll back to, or pin, an earlier version. No process and no task lock: activate() is the same primitive a fresh
  // run uses, and it verifies against the current source rather than the current model version.
  async function activateRun(track, stem, runId, {engine = null} = {}) {
    const view = await readRun(track, stem, runId, {engine, backfill: true});
    if (!view.ok) return {ok: false, error: view.error, status: view.status};
    if (view.status !== 'current' && view.status !== 'superseded') return {ok: false, error: view.reason || 'midi-stale', status: view.status};
    await activate(track, view.run);
    return read(track, stem, engineOf(view.run));
  }
  // Read-only inventory of every run this stem still has a record or pointer for, including superseded versions.
  async function listRuns(track, stem, engine = null) {
    const {runs} = await collectRuns(track, stem, engine);
    const kept = await listKept(track, stem);
    // Computed like read(), not from the flat pointer label: read() prefers by-source/<src>/active.json and returns
    // the first *matching* candidate, so the two disagree after a torn write and after a delete leaves one dangling.
    const activeRead = await read(track, stem);
    let current = null, sourceError = null;
    try {current = await source(track, stem);} catch(error) {sourceError = error.message;}
    const entries = [];
    for(const [runId, {raw, pointed}] of runs) {
      const entry = {runId, engine: engineOf(raw), model: raw.model ?? null, sourceRunId: raw.sourceRunId ?? null, sourceTarget: raw.sourceTarget ?? null,
        noteCount: raw.noteCount ?? null, createdAt: raw.createdAt ?? null, file: raw.file ?? null, pointed: pointed.sort(),
        active: activeRead.ok && activeRead.runId === runId, kept: kept.has(runId)};
      try {
        const verified = await verify(raw, track, stem, {source: current});
        Object.assign(entry, {identity: verified.identity, matches: verified.matches, directory: path.dirname(path.join(analysisDirectory(track), verified.file)),
          status: sourceError ? 'source-changed' : verified.matches ? 'current' : 'superseded', reason: sourceError});
      } catch(error) {
        const reason = error.code === 'ENOENT' ? 'midi-missing' : error.message;
        Object.assign(entry, {status: error.code === 'ENOENT' ? 'files-missing' : ['midi-stale', 'midi-string-source-stale'].includes(reason) ? 'source-changed' : 'invalid', reason});
      }
      entries.push(entry);
    }
    return entries.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')) || a.runId.localeCompare(b.runId));
  }
  return {source, manifestPath, sourceManifest, runRecordPath, keptPath, validate, verify, read, readRun, collectRuns, listRuns, listKept, keepRun, removeRun, activate, activateRun, archiveCurrent};
}

function createDerivedAssets({analysisRoot}) {
 const analysisDirectory = track => derivedDirectory(track, typeof analysisRoot === 'function' ? analysisRoot() : analysisRoot);
  async function validateStems(result, track, engine = null) {
    const profile = separationForResult(result);
    if (result?.schemaVersion !== 1 || result.kind !== 'stems' || result.trackId !== track.id ||
        !profile || (engine && engine !== profile.id) ||
        Object.entries(profile?.options || {}).some(([key,value])=>!require('node:util').isDeepStrictEqual(result.options?.[key], value)) ||
        !Array.isArray(result.stems) || result.stems.length !== 6) throw new Error('stems-invalid');
    if(profile.backend === 'roformer' && (result.backend?.checkpointSha256 !== profile.checkpoint.sha256 || result.backend?.configSha256 !== profile.config.sha256)) throw new Error('stems-model-invalid');
    const stat = await fs.stat(track.filePath);
    if (path.resolve(result.source?.path || '') !== path.resolve(track.filePath) ||
        stat.size !== result.source?.size || Math.abs(stat.mtimeMs - result.source?.mtimeMs) > 1) throw new Error('stems-stale');
    const directory = analysisDirectory(track);
    const names = new Set();
    for (const stem of result.stems) {
      if (!['bass', 'piano', 'guitar', 'drums', 'vocals', 'other'].includes(stem.name) || names.has(stem.name) ||
          !/^stems\/[a-f0-9-]{36}\/[a-z]+\.wav$/.test(stem.file) ||
          path.basename(stem.file) !== stem.name + '.wav' ||
          stem.sampleRate !== 44100 || stem.channels !== 2 || !Number.isSafeInteger(stem.frames) || stem.frames <= 0 ||
          stem.frames !== result.stems[0].frames) throw new Error('stems-invalid');
      names.add(stem.name);
      if ((await fs.stat(path.join(directory, stem.file))).size < stem.frames * 8) throw new Error('stems-incomplete');
    }
    return result;
  }


 const stemsManifestPath = (track, engine = null) => {
   if(engine && !separationProfile(engine)) throw new Error('stems-engine-unsupported');
   return path.join(analysisDirectory(track), ...(engine ? ['stems',engine + '.json'] : ['stems.json']));
 };
 async function readStems(track, engine = null) {
   try {
     const directory = analysisDirectory(track), candidates = [stemsManifestPath(track, engine)];
     if(engine) candidates.push(stemsManifestPath(track));
     let lastError = 'stems-missing';
     for(const file of candidates) {
       try {
         const result = await validateStems(JSON.parse(await fs.readFile(file, 'utf8')), track, engine);
         return {ok:true,...result,engine:separationForResult(result).id,directory:path.dirname(path.join(directory,result.stems[0].file)),
           stems:result.stems.map(stem=>({...stem,audioUrl:pathToFileURL(path.join(directory,stem.file)).href}))};
       } catch(error) {if(error.code !== 'ENOENT') lastError = error.message;}
     }
     return {ok:false,error:lastError,stems:[]};
   } catch(error) {return {ok:false,error:error.message,stems:[]};}
 }
 const stringSources=require('./string-source.cjs').createStringSource({assets:{directory:analysisDirectory,readStems}});
 const midi = createMidiAssets({analysisDirectory, readStems,readStringSource:stringSources.current});
 async function activateStems(track, value) {
   const result = cleanStems(value), profile = separationForResult(result);
   await validateStems(result, track, profile?.id);
   const old = await readStems(track);
   if(old.ok && old.runId !== result.runId) {
     await midi.archiveCurrent(track);
     // Preserve legacy single-model cache before replacing the active pointer.
     // A newly generated variant may already have replaced its model manifest.
     const oldFile = stemsManifestPath(track, old.engine);
     try {await fs.access(oldFile);} catch(error) {
       if(error.code !== 'ENOENT') throw error;
       await writeAtomic(oldFile, cleanStems(old));
     }
   }
   await writeAtomic(stemsManifestPath(track, profile.id), result);
   await writeAtomic(stemsManifestPath(track), result);
 }
 async function readMidiDirectory(track) {
   for(const stem of STEMS) {
     for(const engine of [null,...PROFILES.filter(p=>p.stems.includes(stem)).map(p=>p.id)]) {
       if((await midi.read(track,stem,engine)).ok) return {ok:true,directory:path.join(analysisDirectory(track),'midi')};
     }
   }
   return {ok:false,error:'midi-missing'};
 }
 return {stringSources,readMidiDirectory,directory:analysisDirectory,validateStems,readStems,stemsManifestPath,activateStems,readMidi:midi.read,listMidiRuns:midi.listRuns,midi};
}

module.exports = {writeAtomic, createDerivedAssets, createMidiAssets, trackDirectory, derivedDirectory, safeName, ENGINE, MODEL, STEMS, OPTIONS, PROFILES, ENGINE_IDS, MANUAL, MANUAL_ENGINE, profileFor, profileForResult, defaultEngine, identityOf, engineOf, SEPARATION_PROFILES, SEPARATION_ENGINE_IDS, separationProfile, separationForResult, defaultSeparation};
