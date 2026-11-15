#!/usr/bin/env node
'use strict';
// Stem WAVs -> 24-bit FLAC, song by song, for an analysis root (2026-11-15, audit fix 2).
//
//   node scripts/migrate-stems.cjs --root <analysis root> --runtime <runtime.json> --dry-run
//   node scripts/migrate-stems.cjs --root <analysis root> --runtime <runtime.json> --all [--delete-wav]
//   node scripts/migrate-stems.cjs --root <analysis root> --runtime <runtime.json> --song "<album>/<track>" [--delete-wav]
//   node scripts/migrate-stems.cjs --root <analysis root> --runtime <runtime.json> --rollback --song "<album>/<track>"
//
// What is converted: every WAV a stems manifest names (stems.json, stems/<engine>.json: current and earlier
// separations), and the target / residual of the refinement results XLD reads today (Mega 53 full results and the
// vocal line's lead / backing). Earlier refinement formats (preview copies, retired engines) stay WAV.
//
// One song at a time:
//   1. the song's state as the app itself reads it is taken (stems, every MIDI version, refinement results, the
//      vocal line, the strings source);
//   2. every WAV is written as a marked FLAC at half level (analysis-midi/stem_audio.py) and read back twice - by
//      Python (soundfile) and by the app's own decoder (core/stem-audio.cjs) - each sample within 2^-23 of the WAV;
//   3. every record that binds to one of those files is rewritten (path, size, modification time; the old values
//      kept in `migratedFrom`; refinement results named by a key built from their source are re-keyed, and the key
//      replaced wherever the song's records name it); the original text of every JSON file is in the song's log
//      `<track>/.flac-migration.json` first;
//   4. the app's reading of the song is taken again and must be the same as in step 1;
//   5. only with --delete-wav: the WAVs are deleted (permanently: the point is the disk space) and the reading is
//      checked once more.
// Anything that does not pass leaves the song as it was (records restored from the log, FLACs removed) and the run
// goes on with the next song. A run can be stopped and started again: a song whose log says it was halfway is put
// back first and then done again; a converted song is skipped (or only has its WAVs deleted).
//
// --rollback puts a song back: FLAC decoded to WAV again if the WAVs were deleted (float WAV, the old modification
// time; the samples are the FLAC's, within 2^-23 of the original), every record restored from the log.
//
// Refuses to run while XLD or XML is open or an analysis runner is running (no cross-program lock exists yet);
// --ignore-running-apps is for scratch copies only and is refused for the analysis root XLD is set to.
//
// Mega 53 keys (2026-11-15, after the first real run). A refinement result is stored under a key built from its
// source stem's absolute path. The 2026-11-13 merge of the old dev root into D:\Caches rewrote paths but not keys, so
// those results read as "not made yet" since then, and the strings MIDI made from them as missing. That is repaired
// in a step of its own, before any conversion, and only on request:
//   node scripts/migrate-stems.cjs --root <analysis root> --runtime <runtime.json> --repair-keys --song "<album>/<track>" [--old-root <path>]
//   node scripts/migrate-stems.cjs --root <analysis root> --runtime <runtime.json> --undo-key-repair --song "<album>/<track>"
// A result is re-keyed only when its stored key is exactly the key XLD would have built with the old root's path
// (KNOWN_OLD_ROOTS, or --old-root), and the new key is free. A key already taken by another result (a later run with the
// same settings) is reported and left. The song's reading must change only by "the repaired results, and the strings
// part made from them, now read" - listed as expected; any other change puts the song back. The repair keeps its own
// log (.mega-key-repair.json) for --undo-key-repair. --dry-run lists, per song, which results would be repaired.
// Conversion skips a song with results still to repair, and re-keys only results that were current before it.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {spawnSync, execFileSync} = require('node:child_process');

const CORE = path.join(__dirname, '..', 'core');
const LOG = '.flac-migration.json';
const KEYLOG = '.mega-key-repair.json';
// The dev analysis root merged into D:\Caches on 2026-11-13 (and deleted the same day): the Mega 53 keys of the songs
// that came from it were built from these paths.
const KNOWN_OLD_ROOTS = ['D:\\Projects\\Xin-Music-Lab-Fusion\\artifacts\\refinement-three-20260915\\analysis'];
const LIMIT = 2 ** -23;
const RATIO = 0.264;   // measured: 24-bit FLAC at half level / float WAV (work/audit-20261115/STORAGE-PLAN.md, 3 songs)

// --- arguments ----------------------------------------------------------------------------------------------------
function parseArgs(argv) {
  const out = {songs: [], dryRun: false, all: false, deleteWav: false, rollback: false, ignoreRunning: false, repairKeys: false, undoKeyRepair: false, oldRoots: []};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') out.root = path.resolve(argv[++i]);
    else if (a === '--runtime') out.runtime = path.resolve(argv[++i]);
    else if (a === '--song') out.songs.push(argv[++i]);
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--all') out.all = true;
    else if (a === '--delete-wav') out.deleteWav = true;
    else if (a === '--rollback') out.rollback = true;
    else if (a === '--ignore-running-apps') out.ignoreRunning = true;
    else if (a === '--report') out.report = path.resolve(argv[++i]);
    else if (a === '--repair-keys') out.repairKeys = true;
    else if (a === '--undo-key-repair') out.undoKeyRepair = true;
    else if (a === '--old-root') out.oldRoots.push(path.resolve(argv[++i]));
    else throw new Error('unknown argument ' + a);
  }
  if (!out.oldRoots.length) out.oldRoots = KNOWN_OLD_ROOTS.slice();
  if ([out.dryRun, out.rollback, out.repairKeys, out.undoKeyRepair].filter(Boolean).length > 1) throw new Error('say one of --dry-run, --rollback, --repair-keys, --undo-key-repair');
  if ((out.repairKeys || out.undoKeyRepair) && !out.songs.length && !(out.repairKeys && out.all)) throw new Error('--repair-keys needs --song or --all; --undo-key-repair needs --song');
  if (out.repairKeys || out.undoKeyRepair) out.deleteWav = false;
  if (!out.root) throw new Error('--root is required');
  if (!out.runtime && !process.env.XLD_MIDI_PYTHON) throw new Error('--runtime <runtime.json> is required (or the XLD_* variables set)');
  if (!out.dryRun && !out.all && !out.songs.length) throw new Error('say --dry-run, --all or --song');
  if (out.rollback && !out.songs.length) throw new Error('--rollback needs --song');
  return out;
}
function loadRuntime(file) {
  if (!file) return;
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const [key, value] of Object.entries(config.paths || {})) process.env[key] = path.resolve(path.dirname(file), value);
  for (const [key, value] of Object.entries(config.flags || {})) process.env[key] = String(value);
}

// --- is anything running ------------------------------------------------------------------------------------------
function runningApps() {
  if (process.platform !== 'win32') return [];
  let rows = '';
  try {
    rows = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      "Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('XLD.exe','XML.exe') -or ($_.Name -like 'python*.exe' -and $_.CommandLine -match 'analysis-(midi|separation|refine|score|harmony)|score-dynamics') } | ForEach-Object { $_.Name + ' ' + $_.ProcessId }"],
      {encoding: 'utf8', windowsHide: true, timeout: 30000});
  } catch (error) { throw new Error('could not list processes: ' + error.message); }
  return rows.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}
function xldConfiguredRoots() {
  const roots = [path.resolve("D:\\Caches\\Xin's Local Deck\\Analysis")];
  for (const name of ["Xin's Local Deck Beta", "Xin's Local Deck"]) {
    try { const s = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA || '', name, 'settings.json'), 'utf8')); if (s.analysisRoot) roots.push(path.resolve(s.analysisRoot)); } catch (_) {}
  }
  return roots.map(r => r.toLowerCase());
}

// --- the song as the app reads it ---------------------------------------------------------------------------------
function modules(root) {
  const derived = require(path.join(CORE, 'derived-assets.cjs'));
  const assets = derived.createDerivedAssets({analysisRoot: root});
  const refinement = require(path.join(CORE, 'refinement.cjs')).createRefinement({assets});
  const scoreVocals = require(path.join(CORE, 'score-vocals.cjs'));
  const refineProfiles = require(path.join(CORE, '..', 'analysis-refine', 'profiles.json'));
  return {derived, assets, refinement, scoreVocals, refineProfiles};
}
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
function trackFor(trackDir) {
  const manifest = readJson(path.join(trackDir, 'stems.json'));
  let meta = {};
  try { meta = readJson(path.join(trackDir, 'track.json')); } catch (_) {}
  return {id: manifest.trackId, filePath: manifest.source?.path, title: meta.title, artist: meta.artist, album: meta.album, number: meta.number,
    bridgePath: path.join(trackDir, 'music-lab.json')};
}
const refineOptions = record => ({engine: record.engine, scope: record.scope || 'preview', start: record.timeOrigin, duration: record.requestedDuration || 30,
  sourceStem: record.sourceStem, target: record.target, device: record.requestedDevice});
function refinementRecords(trackDir) {
  const folder = path.join(trackDir, 'refinement');
  let names = [];
  try { names = fs.readdirSync(folder); } catch (_) { return []; }
  return names.filter(n => /^[a-f0-9]{64}\.json$/.test(n)).map(name => {
    try { return {name, file: path.join(folder, name), value: readJson(path.join(folder, name))}; } catch (_) { return null; }
  }).filter(r => r && r.value?.kind === 'refinement');
}
async function snapshot(m, trackDir, track) {
  const s = {stems: null, midi: {}, refinement: {}, vocals: null, strings: null};
  const stems = await m.assets.readStems(track);
  s.stems = stems.ok ? {ok: true, runId: stems.runId, engine: stems.engine, names: stems.stems.map(x => x.name)} : {ok: false, error: stems.error};
  for (const stem of m.derived.STEMS) {
    const runs = await m.assets.midi.listRuns(track, stem).catch(error => ({error: error.message}));
    const rows = Array.isArray(runs) ? runs : runs?.runs || runs;
    const read = await m.assets.readMidi(track, stem);
    const engines = {};
    for (const p of m.derived.PROFILES.filter(p => p.stems.includes(stem))) { const r = await m.assets.readMidi(track, stem, p.id); engines[p.id] = r.ok ? ['ok', r.runId, r.noteCount] : ['no', r.error]; }
    s.midi[stem] = {read: read.ok ? ['ok', read.runId, read.noteCount, read.engine] : ['no', read.error], engines,
      runs: Array.isArray(rows) ? rows.map(r => [r.runId, r.status, Boolean(r.active), r.noteCount, r.engine]).sort((a, b) => a[0].localeCompare(b[0])) : rows};
  }
  for (const r of refinementRecords(trackDir)) {
    if (!m.refineProfiles.some(p => p.id === r.value.engine)) continue;
    const read = await m.refinement.read(track, refineOptions(r.value));
    s.refinement[r.value.runId] = read.ok ? ['ok', read.engine, read.target, read.scope] : ['no', read.error];
  }
  const vocals = await m.scoreVocals.read(m.assets, track, trackDir).catch(error => ({state: 'error:' + error.message}));
  s.vocals = [vocals.state, vocals.split?.runId || null];
  const strings = await m.assets.stringSources.current(track).catch(() => null);
  s.strings = strings ? [strings.runId, strings.target] : null;
  return s;
}
// Order-free: refinement results are listed by file name, and re-keying renames their files.
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

// --- what a song would convert ------------------------------------------------------------------------------------
async function plan(m, root, trackDir) {
  const out = {song: path.relative(root, trackDir).split(path.sep).join('/'), files: [], skip: null, notes: []};
  let track;
  try { track = trackFor(trackDir); } catch (error) { out.skip = 'no stems.json'; return out; }
  out.track = track;
  const stems = await m.assets.readStems(track);
  if (!stems.ok) { out.skip = stems.error === 'stems-stale' ? 'stems-stale (the original audio is not where the analysis says, or it changed)' : stems.error; return out; }
  const audio = require(path.join(CORE, 'stem-audio.cjs'));
  const seen = new Set();
  const add = async (abs, kind, extra) => {
    const key = path.resolve(abs).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    if (!fs.existsSync(abs)) return;
    const info = await audio.probe(abs).catch(() => null);
    if (!audio.isStemFormat(info) || info.format !== 'wav') { out.notes.push('not a float WAV, left: ' + path.relative(trackDir, abs)); return; }
    const stat = fs.statSync(abs, {bigint: true});
    out.files.push({kind, wav: abs, flac: abs.replace(/\.wav$/i, '.flac'), size: Number(stat.size), mtimeMs: Number(stat.mtimeNs) / 1e6, mtimeNs: String(stat.mtimeNs),
      frames: info.frames, ...extra});
  };
  // Stems: every manifest's files (the current separation and kept earlier ones).
  const manifests = [path.join(trackDir, 'stems.json'), ...(() => { try { return fs.readdirSync(path.join(trackDir, 'stems')).filter(n => n.endsWith('.json')).map(n => path.join(trackDir, 'stems', n)); } catch (_) { return []; } })()];
  for (const file of manifests) {
    let value; try { value = readJson(file); } catch (_) { continue; }
    for (const stem of value.stems || []) if (/^stems\/[a-f0-9-]{36}\/[a-z]+\.wav$/.test(stem.file || '')) await add(path.join(trackDir, stem.file), 'stem', {runId: value.runId, stem: stem.name});
  }
  // Refinement results XLD reads today.
  for (const r of refinementRecords(trackDir)) {
    const v = r.value;
    if (v.schemaVersion !== 3 || !v.files || !v.originalSource) { if (v.files) out.notes.push(`refinement ${v.engine} (schema ${v.schemaVersion}) left as it is`); continue; }
    if (m.refineProfiles.some(p => p.id === v.engine)) {
      const read = await m.refinement.read(track, refineOptions(v));
      if (!read.ok || read.cacheKey !== r.name.slice(0, -5)) { out.notes.push(`refinement ${v.engine} ${v.runId} is not current (${read.error || 'key'}), left as it is`); continue; }
    } else if (v.engine !== 'karaoke-lead') { out.notes.push(`refinement ${v.engine} not known, left as it is`); continue; }
    for (const name of ['target', 'residual']) if (/\.wav$/.test(v.files[name] || '')) await add(path.join(trackDir, 'refinement', v.files[name]), 'refinement', {runId: v.runId, part: name, record: r.name});
  }
  out.bytes = out.files.reduce((n, f) => n + f.size, 0);
  out.estimate = Math.round(out.bytes * RATIO);
  return out;
}

// --- rewriting the records ----------------------------------------------------------------------------------------
function jsonFiles(trackDir) {
  const list = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      // storage-optimization/ holds undo journals of an earlier copy clean-up: a past state, void after conversion.
      else if (e.name.endsWith('.json') && e.name !== LOG && e.name !== KEYLOG && !full.includes(path.sep + 'storage-optimization' + path.sep) && fs.statSync(full).size < 50e6) list.push(full);
    }
  })(trackDir);
  return list;
}
// map: [{from: {abs, size, mtimeMs}, to: {abs, size, mtimeMs}, flac: bool (forward)}]. Rewrites every binding in the
// song's JSON; returns the number of values changed. Throws if any record still names a `from` file afterwards.
function rebind(trackDir, map, {forward}) {
  const byAbs = new Map(map.map(e => [path.resolve(e.from.abs).toLowerCase(), e]));
  const rel = (abs, base) => path.relative(base, abs).split(path.sep).join('/');
  let changed = 0;
  const writes = [];
  for (const file of jsonFiles(trackDir)) {
    const text = fs.readFileSync(file, 'utf8');
    let value; try { value = JSON.parse(text); } catch (_) { continue; }
    const bases = [trackDir, path.join(trackDir, 'refinement')];
    let local = 0;
    (function visit(node) {
      if (Array.isArray(node)) return node.forEach(visit);
      if (!node || typeof node !== 'object') return;
      // {path, size, mtimeMs} bindings (MIDI source, vocal line source).
      if (typeof node.path === 'string' && path.isAbsolute(node.path)) {
        const e = byAbs.get(path.resolve(node.path).toLowerCase());
        if (e) {
          const fresh = node.size === e.from.size && Number.isFinite(node.mtimeMs) && Math.abs(node.mtimeMs - e.from.mtimeMs) <= 1;
          if (forward) node.migratedFrom = {path: node.path, size: node.size, mtimeMs: node.mtimeMs};
          else delete node.migratedFrom;
          node.path = e.to.abs;
          if (fresh) { node.size = e.to.size; node.mtimeMs = e.to.mtimeMs; }
          local++;
        }
      }
      // Relative names: stems manifests (from the track folder), refinement files (from refinement/), the vocal
      // line's split (from the track folder).
      for (const [key, item] of Object.entries(node)) {
        if (typeof item === 'string' && /\.(wav|flac)$/i.test(item) && !path.isAbsolute(item)) {
          for (const base of bases) {
            const e = byAbs.get(path.resolve(base, item).toLowerCase());
            if (e) { node[key] = rel(e.to.abs, base); local++; break; }
          }
        }
      }
      // A stems manifest entry says what its file is.
      if (typeof node.file === 'string' && /^stems\/[a-f0-9-]{36}\/[a-z]+\.(wav|flac)$/.test(node.file) && typeof node.name === 'string') {
        if (node.file.endsWith('.flac')) { node.encoding = 'flac-24'; node.gain = 2; } else { delete node.encoding; delete node.gain; }
      }
      for (const [key, item] of Object.entries(node)) if (key !== 'migratedFrom' && item && typeof item === 'object') visit(item);
    })(value);
    // A refinement result's originalSource is its parent stem's size and time.
    if (value?.kind === 'refinement' && value.originalSource?.kind === 'stem') {
      const parent = map.find(e => e.kind === 'stem' && e.runId === value.originalSource.runId && e.stem === value.originalSource.stem);
      if (parent && value.originalSource.size === parent.from.size && Math.abs(value.originalSource.mtimeMs - parent.from.mtimeMs) <= 1) {
        value.originalSource.size = parent.to.size; value.originalSource.mtimeMs = parent.to.mtimeMs; local++;
      }
    }
    if (local) { writes.push([file, value]); changed += local; }
  }
  return {changed, writes};
}
async function writeAll(writes, log = null, trackDir = null) {
  if (log) for (const [file] of writes) if (!Object.hasOwn(log.json, path.relative(trackDir, file))) throw new Error('no original kept for ' + path.relative(trackDir, file));
  const {writeAtomic} = require(path.join(CORE, 'derived-assets.cjs'));
  for (const [file, value] of writes) await writeAtomic(file, value);
}
function leftovers(trackDir, map) {
  const names = [];
  for (const e of map) names.push(path.resolve(e.from.abs).toLowerCase(), JSON.stringify(path.resolve(e.from.abs).toLowerCase()).slice(1, -1));
  const rels = map.map(e => path.basename(path.dirname(e.from.abs)) + '/' + path.basename(e.from.abs));
  const hits = [];
  for (const file of jsonFiles(trackDir)) {
    const text = fs.readFileSync(file, 'utf8'), lower = text.toLowerCase();
    // migratedFrom keeps the old path on purpose; anything else still naming an old file is a binding we missed.
    const scrubbed = lower.replace(/"migratedfrom":\s*\{[^}]*\}/g, '');
    if (names.some(n => scrubbed.includes(n)) || rels.some(r => scrubbed.includes(r.toLowerCase()))) hits.push(path.relative(trackDir, file));
  }
  return hits;
}
// Mega 53 results are stored under a key built from their source file; after the stem moved, re-key them (and
// replace the old key wherever the song's records name it: kept/, midi/strings-source.json).
// `only`: the record file names that may move (those current before the stems moved). A result whose key was already
// wrong before (e.g. one broken by the 11-13 merge) is not this step's business: moving it would change what the song
// reads, which the before / after check then refuses (the first real run, 2026-11-15).
async function rekey(m, trackDir, track, onCreate = async () => {}, only = null) {
  const moves = [];
  for (const r of refinementRecords(trackDir)) {
    if (!m.refineProfiles.some(p => p.id === r.value.engine) || r.value.schemaVersion !== 3) continue;
    if (only && !only.has(r.name)) continue;
    let ctx;
    try { ctx = await m.refinement.context(track, refineOptions(r.value)); } catch (_) { continue; }
    const oldKey = r.name.slice(0, -5);
    if (ctx.cacheKey === oldKey || r.value.cacheKey !== oldKey) continue;
    moves.push([oldKey, ctx.cacheKey, r]);
  }
  const {writeAtomic} = require(path.join(CORE, 'derived-assets.cjs'));
  for (const [oldKey, newKey, r] of moves) {
    const target = path.join(path.dirname(r.file), newKey + '.json');
    if (fs.existsSync(target)) throw new Error('refinement key already taken: ' + newKey);
    await onCreate(path.relative(trackDir, target));
    await writeAtomic(target, {...r.value, cacheKey: newKey});
    await fsp.rm(r.file);
    const keptOld = path.join(trackDir, 'refinement', 'kept', oldKey + '.json');
    if (fs.existsSync(keptOld)) { const kept = readJson(keptOld); const keptNew = path.join(path.dirname(keptOld), newKey + '.json'); await onCreate(path.relative(trackDir, keptNew)); await writeAtomic(keptNew, {...kept, cacheKey: newKey}); await fsp.rm(keptOld); }
    for (const file of jsonFiles(trackDir)) {
      if (file === target) continue;
      const text = fs.readFileSync(file, 'utf8');
      if (text.includes(oldKey) && !/storage-optimization/.test(file)) await writeAtomic(file, JSON.parse(text.split(oldKey).join(newKey)));
    }
  }
  return moves.map(([a, b]) => ({from: a, to: b}));
}
// The record names whose key is the one XLD builds for the song as it is now.
async function currentRecords(m, trackDir, track) {
  const names = new Set();
  for (const r of refinementRecords(trackDir)) {
    if (!m.refineProfiles.some(p => p.id === r.value.engine) || r.value.schemaVersion !== 3) continue;
    try { if ((await m.refinement.context(track, refineOptions(r.value))).cacheKey === r.name.slice(0, -5)) names.add(r.name); } catch (_) {}
  }
  return names;
}

// --- Mega 53 keys from an old root ----------------------------------------------------------------------------------
// The key rule of core/refinement.cjs context(): sha256 of this object, in this order.
const KEY_FIELDS = ['version', 'adapter', 'trackId', 'parentRunId', 'source', 'size', 'mtimeMs', 'engine', 'target', 'device', 'start', 'duration', 'model'];
const sha256 = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function keyIdentity(ctx) {
  const identity = {};
  for (const k of KEY_FIELDS) identity[k] = ctx[k];
  if (ctx.scope === 'full') identity.scope = 'full';
  if (ctx.sourceStem !== 'other') identity.sourceStem = ctx.sourceStem;
  return identity;
}
function refinementLogTimes(trackDir) {
  const times = new Map();
  try {
    for (const line of fs.readFileSync(path.join(trackDir, 'refinement', 'refinement.jsonl'), 'utf8').split(/\r?\n/)) {
      try { const e = JSON.parse(line); if (e.runId && e.committed) times.set(e.runId, e.at); } catch (_) {}
    }
  } catch (_) {}
  return times;
}
// Every refinement result whose stored key is not the key it would have now, and what can be done about it:
//   repair     - the stored key is exactly the old root's key for this result and the new key is free;
//   taken      - as repair, but another result already sits at the new key (heldBy says which, and when it was made);
//   unverified - the stored key matches no known old root: left as it is;
//   unknown    - the key rule could not be reproduced for it: left as it is.
async function keyCheck(m, root, trackDir, track, oldRoots = KNOWN_OLD_ROOTS) {
  const rows = [];
  const times = refinementLogTimes(trackDir);
  for (const r of refinementRecords(trackDir)) {
    const v = r.value;
    if (!m.refineProfiles.some(p => p.id === v.engine) || v.schemaVersion !== 3) continue;
    let ctx;
    try { ctx = await m.refinement.context(track, refineOptions(v)); } catch (_) { continue; }
    const name = r.name.slice(0, -5);
    if (ctx.cacheKey === name) continue;
    const row = {runId: v.runId, engine: v.engine, target: v.target, scope: v.scope || 'preview', madeAt: times.get(v.runId) || null, oldKey: name, newKey: ctx.cacheKey};
    const identity = keyIdentity(ctx);
    const relative = path.relative(root, ctx.source);
    if (v.cacheKey !== name) Object.assign(row, {state: 'unknown', why: 'the record names another key than its file name'});
    else if (sha256(identity) !== ctx.cacheKey) Object.assign(row, {state: 'unknown', why: 'the key rule could not be reproduced'});
    else if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) Object.assign(row, {state: 'unknown', why: 'the source stem is outside the analysis root'});
    else {
      const from = oldRoots.find(o => sha256({...identity, source: path.join(o, relative)}) === name);
      if (!from) Object.assign(row, {state: 'unverified', why: 'the stored key matches no known old root'});
      else {
        row.oldRoot = from;
        const target = path.join(path.dirname(r.file), ctx.cacheKey + '.json');
        if (fs.existsSync(target)) {
          let holder = null; try { holder = readJson(target); } catch (_) {}
          row.state = 'taken';
          row.heldBy = {runId: holder?.runId || null, madeAt: holder?.runId ? times.get(holder.runId) || null : null};
          row.why = 'the new key is already used by another result with the same settings' + (holder?.runId ? ` (${holder.runId}${row.heldBy.madeAt ? ', made ' + row.heldBy.madeAt : ''})` : '') + '; this one is left as it is';
        } else row.state = 'repair';
      }
    }
    rows.push(row);
  }
  return rows;
}
// What a key repair may change in the song's reading: the repaired results now read; the strings source becomes one of
// them where there was none; and the strings part, whose source that is, reads now where it did not (its runs keep
// their ids, notes and engines; only their status and which one is in use follow from the source). Everything else
// must be the same.
function keyRepairChanges(before, after, repaired) {
  const ids = new Set(repaired);
  const expected = [], unexpected = [];
  const eq = (a, b) => same(a, b);
  for (const key of ['stems', 'vocals']) if (!eq(before[key], after[key])) unexpected.push({what: key, before: before[key], after: after[key]});
  for (const stem of new Set([...Object.keys(before.midi || {}), ...Object.keys(after.midi || {})])) {
    if (stem !== 'strings' && !eq(before.midi[stem], after.midi[stem])) unexpected.push({what: 'midi.' + stem, before: before.midi[stem], after: after.midi[stem]});
  }
  for (const runId of new Set([...Object.keys(before.refinement || {}), ...Object.keys(after.refinement || {})])) {
    const a = before.refinement[runId], b = after.refinement[runId];
    if (eq(a, b)) continue;
    if (ids.has(runId) && a?.[0] === 'no' && b?.[0] === 'ok') expected.push({what: 'refinement ' + runId + ' now reads', before: a, after: b});
    else unexpected.push({what: 'refinement ' + runId, before: a, after: b});
  }
  const sourceChanged = !eq(before.strings, after.strings);
  if (sourceChanged) {
    if (before.strings === null && Array.isArray(after.strings) && ids.has(after.strings[0])) expected.push({what: 'strings source is now ' + after.strings.join(' / '), before: null, after: after.strings});
    else unexpected.push({what: 'strings source', before: before.strings, after: after.strings});
  }
  const a = before.midi?.strings, b = after.midi?.strings;
  if (!eq(a, b)) {
    if (!sourceChanged || !a || !b) unexpected.push({what: 'midi.strings (its source did not change)', before: a, after: b});
    else {
      if (!eq(a.read, b.read)) (a.read?.[0] === 'no' ? expected : unexpected).push({what: 'strings part read', before: a.read, after: b.read});
      for (const engine of new Set([...Object.keys(a.engines || {}), ...Object.keys(b.engines || {})])) {
        if (!eq(a.engines[engine], b.engines[engine])) (a.engines[engine]?.[0] === 'no' ? expected : unexpected).push({what: 'strings part read with ' + engine, before: a.engines[engine], after: b.engines[engine]});
      }
      if (!eq(a.runs, b.runs)) {
        const shape = runs => Array.isArray(runs) ? runs.map(r => [r[0], r[3], r[4]]) : runs;
        (eq(shape(a.runs), shape(b.runs)) ? expected : unexpected).push({what: 'strings versions (status / in use)', before: a.runs, after: b.runs});
      }
    }
  }
  return {expected, unexpected};
}
async function repairKeys(m, root, trackDir, options = {}) {
  const song = path.relative(root, trackDir).split(path.sep).join('/');
  let flacLog = null; try { flacLog = readJson(path.join(trackDir, LOG)); } catch (_) {}
  if (flacLog && !['switched', 'done'].includes(flacLog.state)) return {song, result: 'left as it was', why: 'a FLAC conversion of this song is halfway (' + flacLog.state + ')'};
  let track; try { track = trackFor(trackDir); } catch (_) { return {song, result: 'skipped', why: 'no stems.json'}; }
  const rows = await keyCheck(m, root, trackDir, track, options.oldRoots || KNOWN_OLD_ROOTS);
  const todo = rows.filter(r => r.state === 'repair');
  const others = rows.filter(r => r.state !== 'repair');
  if (!todo.length) return {song, result: 'nothing to repair', keys: others};
  const logFile = path.join(trackDir, KEYLOG);
  let previous = null; try { previous = readJson(logFile); } catch (_) {}
  if (previous && previous.state !== 'done') { await restore(trackDir, previous); await fsp.rm(logFile, {force: true}); }   // halfway: put back, then again
  else if (previous) return {song, result: 'left as it was', why: 'repaired before; undo that first (--undo-key-repair) to repair again', keys: rows};
  const before = await snapshot(m, trackDir, track);
  const log = {schemaVersion: 1, kind: 'xld-mega-key-repair', song, state: 'repairing', startedAt: new Date().toISOString(), oldRoots: options.oldRoots || KNOWN_OLD_ROOTS,
    repairs: todo, left: others, before, json: {}, created: [], files: []};
  for (const file of jsonFiles(trackDir)) if (path.basename(file) !== 'notes.json') log.json[path.relative(trackDir, file)] = fs.readFileSync(file, 'utf8');
  await writeLog(trackDir, log, KEYLOG);
  const fail = async (why, extra = {}) => { await restore(trackDir, log); await fsp.rm(logFile, {force: true}); return {song, result: 'left as it was', why, keys: rows, ...extra}; };
  try {
    const {writeAtomic} = require(path.join(CORE, 'derived-assets.cjs'));
    const folder = path.join(trackDir, 'refinement');
    for (const row of todo) {
      const file = path.join(folder, row.oldKey + '.json'), target = path.join(folder, row.newKey + '.json');
      if (fs.existsSync(target)) return fail('the new key was taken meanwhile: ' + row.newKey);
      const value = readJson(file);
      log.created.push(path.relative(trackDir, target)); await writeLog(trackDir, log, KEYLOG);
      await writeAtomic(target, {...value, cacheKey: row.newKey});
      await fsp.rm(file);
      const keptOld = path.join(folder, 'kept', row.oldKey + '.json');
      if (fs.existsSync(keptOld)) {
        const keptNew = path.join(folder, 'kept', row.newKey + '.json');
        if (fs.existsSync(keptNew)) return fail('kept/ already has the new key: ' + row.newKey);
        log.created.push(path.relative(trackDir, keptNew)); await writeLog(trackDir, log, KEYLOG);
        await writeAtomic(keptNew, {...readJson(keptOld), cacheKey: row.newKey});
        await fsp.rm(keptOld);
      }
      // Wherever else the song's records name the old key (midi/strings-source.json).
      for (const other of jsonFiles(trackDir)) {
        if (other === target || /storage-optimization/.test(other)) continue;
        const text = fs.readFileSync(other, 'utf8');
        if (text.includes(row.oldKey)) await writeAtomic(other, JSON.parse(text.split(row.oldKey).join(row.newKey)));
      }
    }
    const after = await snapshot(m, trackDir, track);
    const changes = keyRepairChanges(before, after, todo.map(r => r.runId));
    if (changes.unexpected.length) return fail('the reading changed beyond the repaired results', {changes, before, after});
    Object.assign(log, {state: 'done', after, expected: changes.expected, repairedAt: new Date().toISOString()});
    await writeLog(trackDir, log, KEYLOG);
    return {song, result: 'repaired', repaired: todo.map(r => ({runId: r.runId, target: r.target, from: r.oldKey, to: r.newKey})), expected: changes.expected, keys: others};
  } catch (error) {
    return fail('error: ' + error.message);
  }
}
async function undoKeyRepair(m, root, trackDir) {
  const song = path.relative(root, trackDir).split(path.sep).join('/');
  const logFile = path.join(trackDir, KEYLOG);
  const log = readJson(logFile);
  if (fs.existsSync(path.join(trackDir, LOG))) return {song, result: 'left as it was', why: 'converted to FLAC after the repair: roll the conversion back first (--rollback)'};
  await restore(trackDir, log);
  const after = await snapshot(m, trackDir, trackFor(trackDir));
  await fsp.rm(logFile, {force: true});
  return {song, result: 'key repair undone', sameAsBefore: same(log.before, after), after: same(log.before, after) ? undefined : after};
}

// --- audio jobs ---------------------------------------------------------------------------------------------------
function python(command, jobs) {
  const exe = process.env.XLD_MIDI_PYTHON;
  if (!exe || !fs.existsSync(exe)) throw new Error('runtime-missing: XLD_MIDI_PYTHON');
  const file = path.join(os.tmpdir(), 'xld-migrate-' + crypto.randomUUID() + '.json');
  fs.writeFileSync(file, JSON.stringify(jobs));
  try {
    const run = spawnSync(exe, ['-I', path.join(CORE, '..', 'analysis-midi', 'stem_audio.py'), command, file],
      {encoding: 'utf8', windowsHide: true, maxBuffer: 64 << 20, env: {...process.env, PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1'}});
    if (run.status !== 0) throw new Error('stem_audio.py ' + command + ' failed: ' + (run.stderr || '').trim().slice(-800));
    return run.stdout.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  } finally { fs.rmSync(file, {force: true}); }
}
// The app's own decoder against the WAV: the second, independent read-back.
function jsCheck(wav, flac) {
  const audio = require(path.join(CORE, 'stem-audio.cjs'));
  const decoded = audio.decodeFlacSync(flac);
  const buffer = fs.readFileSync(wav);
  const handle = fs.openSync(wav, 'r');
  let h;
  try {
    // header() is async over a FileHandle; read the chunk table here instead (float WAV, as checked in plan()).
    let pos = 12, fmt = null, data = null;
    while (pos + 8 <= buffer.length) { const tag = buffer.toString('latin1', pos, pos + 4), n = buffer.readUInt32LE(pos + 4); if (tag === 'fmt ') fmt = {channels: buffer.readUInt16LE(pos + 10)}; if (tag === 'data') { data = {offset: pos + 8, bytes: n}; break; } pos += 8 + n + (n % 2); }
    h = {...fmt, ...data};
  } finally { fs.closeSync(handle); }
  const frames = h.bytes / (h.channels * 4);
  if (frames !== decoded.frames || h.channels !== decoded.channels) return {ok: false, why: 'shape'};
  let max = 0;
  for (let i = 0; i < frames; i++) for (let c = 0; c < h.channels; c++) {
    const e = Math.abs(buffer.readFloatLE(h.offset + (i * h.channels + c) * 4) - decoded.data[c][i]);
    if (e > max) max = e;
  }
  return {ok: max <= LIMIT, maxError: max};
}

// --- one song -----------------------------------------------------------------------------------------------------
async function writeLog(trackDir, log, name = LOG) {
  const file = path.join(trackDir, name), temporary = file + '.' + crypto.randomUUID() + '.tmp';
  const handle = await fsp.open(temporary, 'w');
  try { await handle.writeFile(JSON.stringify(log, null, 1)); await handle.sync(); } finally { await handle.close(); }
  await fsp.rename(temporary, file);
}
async function restore(trackDir, log) {
  // Records first (the original text of every JSON file), then the files this run added.
  for (const [relative, text] of Object.entries(log.json || {})) {
    const file = path.join(trackDir, relative);
    // Only what differs is written back, so untouched records keep their file times too.
    try { if (fs.readFileSync(file, 'utf8') === text) continue; } catch (_) {}
    await fsp.mkdir(path.dirname(file), {recursive: true});
    const temporary = file + '.' + crypto.randomUUID() + '.tmp';
    await fsp.writeFile(temporary, text);
    await fsp.rename(temporary, file);
  }
  for (const relative of log.created || []) if (!Object.hasOwn(log.json || {}, relative)) await fsp.rm(path.join(trackDir, relative), {force: true});
  for (const f of log.files || []) {
    if (fs.existsSync(f.wav)) await fsp.rm(f.flac, {force: true});
    await fsp.rm(f.flac.replace(/\.flac$/i, '.partial.flac'), {force: true});
  }
}
async function migrateSong(m, root, trackDir, options) {
  const logFile = path.join(trackDir, LOG);
  let log = null;
  try { log = readJson(logFile); } catch (_) {}
  if (log?.state === 'done') return {song: log.song, result: 'already converted'};
  if (log?.state === 'switched') {
    if (!options.deleteWav) return {song: log.song, result: 'converted, WAVs kept'};
    return deleteWavs(m, trackDir, log);
  }
  if (log) { await restore(trackDir, log); await fsp.rm(logFile, {force: true}); }   // halfway: put back, then again
  const p = await plan(m, root, trackDir);
  if (p.skip) return {song: p.song, result: 'skipped', why: p.skip};
  if (!p.files.length) return {song: p.song, result: 'nothing to convert', notes: p.notes};
  const track = p.track;
  const pendingKeys = (await keyCheck(m, root, trackDir, track, options.oldRoots || KNOWN_OLD_ROOTS)).filter(row => row.state === 'repair');
  if (pendingKeys.length) return {song: p.song, result: 'skipped', why: 'Mega 53 results with keys to repair first (--repair-keys): ' + pendingKeys.map(row => row.runId).join(', ')};
  const current = await currentRecords(m, trackDir, track);
  const started = Date.now();
  const before = await snapshot(m, trackDir, track);
  log = {schemaVersion: 1, kind: 'xld-flac-migration', song: p.song, state: 'encoding', startedAt: new Date().toISOString(), before,
    files: p.files.map(f => ({...f, partial: f.flac.replace(/\.flac$/i, '.partial.flac')})), json: {}, created: []};
  // The original text of every record that could be rewritten (notes.json holds notes only, never a path or a key).
  for (const file of jsonFiles(trackDir)) if (path.basename(file) !== 'notes.json') log.json[path.relative(trackDir, file)] = fs.readFileSync(file, 'utf8');
  await writeLog(trackDir, log);
  const fail = async (why, extra = {}) => { await restore(trackDir, log); await fsp.rm(logFile, {force: true}); return {song: p.song, result: 'left as it was', why, ...extra}; };
  try {
    for (const f of log.files) if (fs.existsSync(f.flac)) return fail('a FLAC with that name is already there: ' + path.relative(trackDir, f.flac));
    const encoded = python('encode', log.files.map(f => ({wav: f.wav, flac: f.partial})));
    const bad = encoded.filter(r => !r.ok);
    if (bad.length || encoded.length !== log.files.length) return fail('encode / read-back (Python) did not pass', {bad: bad.map(r => [path.relative(trackDir, r.job.wav), r.error || r.maxError])});
    for (const f of log.files) {
      const check = jsCheck(f.wav, f.partial);
      f.maxError = encoded.find(r => r.job.wav === f.wav).maxError;
      f.jsMaxError = check.maxError;
      f.peak = encoded.find(r => r.job.wav === f.wav).peak;
      if (!check.ok) return fail('read-back (app decoder) did not pass: ' + path.relative(trackDir, f.wav), {check});
    }
    for (const f of log.files) {
      await fsp.rename(f.partial, f.flac);
      const stat = fs.statSync(f.flac, {bigint: true});
      f.flacSize = Number(stat.size); f.flacMtimeMs = Number(stat.mtimeNs) / 1e6;
    }
    log.state = 'switching';
    await writeLog(trackDir, log);
    const map = log.files.map(f => ({kind: f.kind, runId: f.runId, stem: f.stem, from: {abs: f.wav, size: f.size, mtimeMs: f.mtimeMs}, to: {abs: f.flac, size: f.flacSize, mtimeMs: f.flacMtimeMs}}));
    const {changed, writes} = rebind(trackDir, map, {forward: true});
    await writeAll(writes, log, trackDir);
    const rekeyed = await rekey(m, trackDir, track, async relative => { log.created.push(relative); await writeLog(trackDir, log); }, current);
    log.rekeyed = rekeyed; log.bindingsChanged = changed;
    await writeLog(trackDir, log);
    const missed = leftovers(trackDir, map);
    if (missed.length) return fail('records still naming a WAV: ' + missed.join(', '));
    const after = await snapshot(m, trackDir, track);
    if (!same(before, after)) return fail('the app reads the song differently afterwards', {before, after});
    log.state = 'switched'; log.after = after; log.switchedAt = new Date().toISOString();
    log.seconds = (Date.now() - started) / 1000;
    await writeLog(trackDir, log);
  } catch (error) {
    return fail('error: ' + error.message);
  }
  const result = {song: p.song, result: 'converted', files: log.files.length, wavBytes: p.bytes, flacBytes: log.files.reduce((n, f) => n + f.flacSize, 0),
    maxError: Math.max(...log.files.map(f => f.maxError)), jsMaxError: Math.max(...log.files.map(f => f.jsMaxError)), peak: Math.max(...log.files.map(f => f.peak)),
    bindings: log.bindingsChanged, rekeyed: log.rekeyed.length, seconds: log.seconds, notes: p.notes};
  if (options.deleteWav) return {...result, ...(await deleteWavs(m, trackDir, log))};
  return result;
}
async function deleteWavs(m, trackDir, log) {
  const track = trackFor(trackDir);
  for (const f of log.files) {
    const stat = fs.existsSync(f.wav) ? fs.statSync(f.wav, {bigint: true}) : null;
    if (stat && (Number(stat.size) !== f.size || String(stat.mtimeNs) !== f.mtimeNs)) return {song: log.song, result: 'WAVs kept', why: 'a WAV changed since conversion: ' + f.wav};
  }
  for (const f of log.files) await fsp.rm(f.wav, {force: true});
  const after = await snapshot(m, trackDir, track);
  log.state = 'done'; log.wavDeletedAt = new Date().toISOString(); log.afterDelete = after;
  await writeLog(trackDir, log);
  if (!same(log.before, after)) return {song: log.song, result: 'WAVs deleted, but the app reads the song differently', after};
  return {song: log.song, wavDeleted: log.files.length};
}
async function rollbackSong(m, trackDir) {
  const logFile = path.join(trackDir, LOG);
  const log = readJson(logFile);
  const missing = log.files.filter(f => !fs.existsSync(f.wav));
  if (missing.length) {
    const results = python('decode', missing.map(f => ({flac: f.flac, wav: f.wav.replace(/\.wav$/i, '.partial.wav'), mtimeNs: f.mtimeNs})));
    if (results.some(r => !r.ok)) throw new Error('decode failed: ' + JSON.stringify(results.filter(r => !r.ok)));
    for (const f of missing) await fsp.rename(f.wav.replace(/\.wav$/i, '.partial.wav'), f.wav);
  }
  await restore(trackDir, log);
  // A WAV made again from its FLAC has the old time; if its size differs from the old one, bind to what is there.
  const map = [];
  for (const f of log.files) { const s = fs.statSync(f.wav, {bigint: true}); const mtimeMs = Number(s.mtimeNs) / 1e6; if (Number(s.size) !== f.size || Math.abs(mtimeMs - f.mtimeMs) > 1) map.push({kind: f.kind, runId: f.runId, stem: f.stem, from: {abs: f.wav, size: f.size, mtimeMs: f.mtimeMs}, to: {abs: f.wav, size: Number(s.size), mtimeMs}}); }
  if (map.length) { const {writes} = rebind(trackDir, map, {forward: false}); await writeAll(writes); await rekey(m, trackDir, trackFor(trackDir), undefined, new Set((log.rekeyed || []).map(x => x.from + '.json'))); }
  const after = await snapshot(m, trackDir, trackFor(trackDir));
  await fsp.rm(logFile, {force: true});
  return {song: log.song, result: 'rolled back', restoredWavs: missing.length, rebound: map.length, sameAsBefore: same(log.before, after), after: same(log.before, after) ? undefined : after};
}

// --- main ---------------------------------------------------------------------------------------------------------
function songsIn(root) {
  const out = [];
  for (const album of fs.readdirSync(root, {withFileTypes: true})) {
    if (!album.isDirectory()) continue;
    for (const track of fs.readdirSync(path.join(root, album.name), {withFileTypes: true})) {
      const dir = path.join(root, album.name, track.name);
      if (track.isDirectory() && (fs.existsSync(path.join(dir, 'stems.json')) || fs.existsSync(path.join(dir, LOG)))) out.push(dir);
    }
  }
  return out.sort();
}
async function main() {
  const options = parseArgs(process.argv.slice(2));
  loadRuntime(options.runtime);
  if (!fs.existsSync(options.root)) throw new Error('no such analysis root: ' + options.root);
  const isConfigured = xldConfiguredRoots().includes(options.root.toLowerCase());
  if (options.ignoreRunning && isConfigured) throw new Error('--ignore-running-apps is only for scratch copies, not for the analysis root XLD uses');
  const running = runningApps();
  const report = {root: options.root, at: new Date().toISOString(), mode: options.dryRun ? 'dry-run' : options.rollback ? 'rollback' : options.repairKeys ? 'repair-keys' : options.undoKeyRepair ? 'undo-key-repair' : 'convert', oldRoots: options.oldRoots, running, songs: []};
  if (running.length && !options.ignoreRunning && !options.dryRun) {
    report.refused = 'XLD / XML or an analysis runner is running: ' + running.join(', ');
    console.log(JSON.stringify(report, null, 1));
    process.exitCode = 3;
    return;
  }
  const m = modules(options.root);
  const dirs = options.songs.length ? options.songs.map(s => path.join(options.root, s)) : songsIn(options.root);
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) { report.songs.push({song: path.relative(options.root, dir), result: 'no such folder'}); continue; }
    let row;
    try {
      if (options.dryRun) {
        const p = await plan(m, options.root, dir);
        let state = null; try { state = readJson(path.join(dir, LOG)).state; } catch (_) {}
        let keys = []; try { if (p.track) keys = await keyCheck(m, options.root, dir, p.track, options.oldRoots); } catch (error) { keys = [{state: 'unknown', why: error.message}]; }
        let keyLog = null; try { keyLog = readJson(path.join(dir, KEYLOG)).state; } catch (_) {}
        row = {song: p.song, keysToRepair: keys.filter(k => k.state === 'repair').length, keys, keyLog, convert: p.files.length, wavBytes: p.bytes || 0, estimatedFlacBytes: p.estimate || 0, skip: p.skip, logState: state, notes: p.notes,
          files: p.files.map(f => path.relative(dir, f.wav).split(path.sep).join('/'))};
      } else if (options.rollback) row = await rollbackSong(m, dir);
      else if (options.repairKeys) row = await repairKeys(m, options.root, dir, options);
      else if (options.undoKeyRepair) row = await undoKeyRepair(m, options.root, dir);
      else row = await migrateSong(m, options.root, dir, options);
    } catch (error) { row = {song: path.relative(options.root, dir), result: 'error', why: error.message}; }
    report.songs.push(row);
    console.error(JSON.stringify({song: row.song, result: row.result || (row.skip ? 'skip' : 'plan'), why: row.why || row.skip}));
  }
  if (options.dryRun) {
    const convert = report.songs.filter(s => s.convert);
    report.summary = {songs: report.songs.length, toConvert: convert.length, files: convert.reduce((n, s) => n + s.convert, 0),
      wavGiB: +(convert.reduce((n, s) => n + s.wavBytes, 0) / 1024 ** 3).toFixed(2), estimatedFlacGiB: +(convert.reduce((n, s) => n + s.estimatedFlacBytes, 0) / 1024 ** 3).toFixed(2),
      skipped: report.songs.filter(s => s.skip).map(s => [s.song, s.skip]),
      // The step before conversion (--repair-keys): which songs, which results; and the keys that are wrong but stay.
      keysToRepair: report.songs.filter(s => s.keysToRepair).map(s => [s.song, s.keys.filter(k => k.state === 'repair').map(k => k.runId + ' ' + k.target)]),
      keysLeft: report.songs.flatMap(s => (s.keys || []).filter(k => k.state !== 'repair').map(k => [s.song, k.runId, k.target, k.state, k.why]))};
  }
  const text = JSON.stringify(report, null, 1);
  if (options.report) fs.writeFileSync(options.report, text);
  console.log(text);
}
if (require.main === module) main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
module.exports = {parseArgs, plan, snapshot, rebind, leftovers, rekey, currentRecords, keyCheck, keyRepairChanges, repairKeys, undoKeyRepair, KNOWN_OLD_ROOTS, KEYLOG, migrateSong, rollbackSong, deleteWavs, modules, trackFor, jsCheck, songsIn};
