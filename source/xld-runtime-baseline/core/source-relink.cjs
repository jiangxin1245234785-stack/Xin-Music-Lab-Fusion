'use strict';
// Songs whose original audio is no longer where their analysis says (audit fix 1, item 3): the whole analysis reads as
// missing (stems-stale) though it is all there. Two ways out: point the analysis at the file's new place, or move the
// song's analysis folder to the Recycle Bin.
//
// Pointing it elsewhere is the "moving an analysis folder" procedure (work/xld-style-20261112, 2026-11-13). A track's id
// is sha1(path, size, modification time) of its file, and that id is in the folder name (`<title>__<id10>`) and in every
// record (`trackId`). So re-linking:
//   - checks the new file has the recorded size (the same recording, moved or copied);
//   - renames the folder to the new id, and rewrites every JSON in it: the old id -> the new one, the old folder's
//     absolute paths -> the new folder's, the old file's {path, size, mtimeMs} -> the new file's;
//   - notes.json carries the id too and MIDI records pin it by SHA-256: those digests are recomputed;
//   - refinement results keyed on the old id and path are re-keyed (the caller's `rekey`, as the FLAC migration does);
//   - checks with the app's own readers that the stems read and no MIDI version became unreadable; otherwise puts
//     every file back and renames the folder back. A journal in the folder makes an interrupted re-link undoable.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {guarded} = require('./storage.cjs');

const JOURNAL = '.relink-journal.json';
const sha256 = text => crypto.createHash('sha256').update(text).digest('hex');

function jsonFiles(dir) {
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, {withFileTypes: true})) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.json') && e.name !== JOURNAL && fs.statSync(full).size < 50e6) out.push(full);
    }
  })(dir);
  return out;
}
function folderBytes(dir) {
  let n = 0;
  (function walk(d) { for (const e of fs.readdirSync(d, {withFileTypes: true})) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (e.isFile()) n += fs.statSync(f).size; } })(dir);
  return n;
}
// Every song folder under `root` whose stems manifest names an original that is not there.
function listMissing(root) {
  root = path.resolve(root);
  const out = [];
  if (!fs.existsSync(root)) return out;
  for (const album of fs.readdirSync(root, {withFileTypes: true})) {
    if (!album.isDirectory()) continue;
    for (const entry of fs.readdirSync(path.join(root, album.name), {withFileTypes: true})) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(root, album.name, entry.name);
      let stems; try { stems = JSON.parse(fs.readFileSync(path.join(dir, 'stems.json'), 'utf8')); } catch (_) { continue; }
      const source = stems?.source;
      if (!source?.path || fs.existsSync(source.path)) continue;
      let meta = {}; try { meta = JSON.parse(fs.readFileSync(path.join(dir, 'track.json'), 'utf8')); } catch (_) {}
      out.push({id: sha256(path.relative(root, dir)), folder: path.relative(root, dir), title: meta.title || entry.name.replace(/__[a-f0-9]{10}$/, ''),
        artist: meta.artist || '', album: meta.album || '', trackId: stems.trackId, source: {path: source.path, size: source.size, mtimeMs: source.mtimeMs}, bytes: folderBytes(dir)});
    }
  }
  return out;
}

function rewrite(value, {oldId, newId, oldDir, newDir, oldSource, newSource}) {
  const lowerOldDir = path.resolve(oldDir).toLowerCase(), lowerOldSource = path.resolve(oldSource.path).toLowerCase();
  let changed = 0;
  const visit = node => {
    if (Array.isArray(node)) { node.forEach((item, i) => { if (typeof item === 'string') { const s = swap(item); if (s !== item) { node[i] = s; changed++; } } else visit(item); }); return; }
    if (!node || typeof node !== 'object') return;
    if (typeof node.path === 'string' && path.isAbsolute(node.path) && path.resolve(node.path).toLowerCase() === lowerOldSource) {
      const fresh = node.size === oldSource.size;
      node.path = newSource.path; if (fresh) { node.size = newSource.size; node.mtimeMs = newSource.mtimeMs; }
      changed++;
    }
    for (const [key, item] of Object.entries(node)) {
      if (typeof item === 'string') { const s = swap(item); if (s !== item) { node[key] = s; changed++; } }
      else if (item && typeof item === 'object') visit(item);
    }
  };
  const swap = text => {
    if (text === oldId) return newId;
    if (path.isAbsolute(text)) {
      const resolved = path.resolve(text), lower = resolved.toLowerCase();
      if (lower === lowerOldSource) return newSource.path;
      if (lower === lowerOldDir || lower.startsWith(lowerOldDir + path.sep)) return path.join(newDir, resolved.slice(lowerOldDir.length));
    }
    return text;
  };
  visit(value);
  return changed;
}

// Refinement results named by a key built from their source (track id, stem path): moved to the key the app computes
// now, and the old key replaced wherever the song's records name it (kept/, midi/strings-source.json).
function refinementRekey(assets) {
  return async (dir, track, onCreate) => {
    const refinement = require('./refinement.cjs').createRefinement({assets});
    const profiles = require('../analysis-refine/profiles.json');
    const folder = path.join(dir, 'refinement');
    if (!fs.existsSync(folder)) return [];
    const moves = [];
    for (const name of fs.readdirSync(folder).filter(n => /^[a-f0-9]{64}\.json$/.test(n))) {
      let value; try { value = JSON.parse(fs.readFileSync(path.join(folder, name), 'utf8')); } catch (_) { continue; }
      if (value?.kind !== 'refinement' || !profiles.some(p => p.id === value.engine) || value.cacheKey !== name.slice(0, -5)) continue;
      let ctx;
      try { ctx = await refinement.context(track, {engine: value.engine, scope: value.scope || 'preview', start: value.timeOrigin, duration: value.requestedDuration || 30, sourceStem: value.sourceStem, target: value.target, device: value.requestedDevice}); }
      catch (_) { continue; }
      if (ctx.cacheKey === value.cacheKey) continue;
      const target = path.join(folder, ctx.cacheKey + '.json');
      if (fs.existsSync(target)) continue;
      onCreate(path.relative(dir, target));
      await fsp.writeFile(target, JSON.stringify({...value, cacheKey: ctx.cacheKey}, null, 2));
      await fsp.rm(path.join(folder, name));
      moves.push([value.cacheKey, ctx.cacheKey]);
    }
    for (const [from, to] of moves) {
      for (const f of jsonFiles(dir)) {
        const text = await fsp.readFile(f, 'utf8');
        if (text.includes(from) && !f.includes(path.sep + 'storage-optimization' + path.sep)) await fsp.writeFile(f, text.split(from).join(to));
      }
      const keptOld = path.join(folder, 'kept', from + '.json');
      if (fs.existsSync(keptOld)) { onCreate(path.relative(dir, path.join(folder, 'kept', to + '.json'))); await fsp.rename(keptOld, path.join(folder, 'kept', to + '.json')); }
    }
    return moves;
  };
}

function createSourceRelink({assets, trackIdFor, rekey = refinementRekey(assets)}) {
  // Re-link the song folder `folder` (relative to root) to the audio file `file`.
  async function relink(root, folder, file) {
    root = path.resolve(root);
    const oldDir = await guarded(root, path.join(root, folder));
    const stems = JSON.parse(await fsp.readFile(path.join(oldDir, 'stems.json'), 'utf8'));
    const oldSource = stems.source, oldId = stems.trackId;
    if (!oldSource?.path || !oldId) return {ok: false, error: 'relink-no-record'};
    if (fs.existsSync(oldSource.path)) return {ok: false, error: 'relink-source-present'};
    const target = path.resolve(file);
    const stat = await fsp.stat(target).catch(() => null);
    if (!stat?.isFile()) return {ok: false, error: 'relink-file-missing'};
    if (stat.size !== oldSource.size) return {ok: false, error: 'relink-size-differs', recorded: oldSource.size, found: stat.size};
    const newId = trackIdFor(target, stat);
    const newDir = path.join(path.dirname(oldDir), path.basename(oldDir).replace(/__[a-f0-9]{10}$/, '') + '__' + newId.slice(0, 10));
    if (newDir.toLowerCase() !== oldDir.toLowerCase() && fs.existsSync(newDir)) return {ok: false, error: 'relink-target-exists'};
    const newSource = {path: target, size: stat.size, mtimeMs: stat.mtimeMs};
    // Journal first (original text of every JSON), then the rename, then the rewrite.
    const originals = {};
    for (const f of jsonFiles(oldDir)) originals[path.relative(oldDir, f)] = await fsp.readFile(f, 'utf8');
    const journal = {schemaVersion: 1, kind: 'xld-source-relink', from: {dir: oldDir, id: oldId, source: oldSource}, to: {dir: newDir, id: newId, source: newSource}, json: originals, at: new Date().toISOString()};
    await fsp.writeFile(path.join(oldDir, JOURNAL), JSON.stringify(journal));
    const undo = async why => {
      const dir = fs.existsSync(newDir) ? newDir : oldDir;
      for (const [relative, text] of Object.entries(originals)) await fsp.writeFile(path.join(dir, relative), text);
      for (const created of journal.created || []) await fsp.rm(path.join(dir, created), {force: true});
      if (dir !== oldDir) await fsp.rename(newDir, oldDir);
      await fsp.rm(path.join(oldDir, JOURNAL), {force: true});
      return {ok: false, error: 'relink-undone', why};
    };
    try {
      if (newDir !== oldDir) await fsp.rename(oldDir, newDir);
      const context = {oldId, newId, oldDir, newDir, oldSource, newSource};
      let changed = 0;
      const texts = {};
      for (const relative of Object.keys(originals)) {
        const value = JSON.parse(originals[relative]);
        const n = rewrite(value, context);
        changed += n;
        texts[relative] = n ? JSON.stringify(value, null, 2) : originals[relative];
      }
      // notes.json files first, then every MIDI record's pin on them.
      for (const [relative, text] of Object.entries(texts)) if (path.basename(relative) === 'notes.json') await fsp.writeFile(path.join(newDir, relative), text);
      for (const [relative, text] of Object.entries(texts)) {
        if (path.basename(relative) === 'notes.json') continue;
        let value = JSON.parse(text), out = text;
        if (value?.kind === 'midi' && typeof value.notesFile === 'string' && value.digests?.notes) {
          const notes = await fsp.readFile(path.join(newDir, value.notesFile)).catch(() => null);
          if (notes) { value.digests.notes = sha256(notes); out = JSON.stringify(value, null, 2); changed++; }
        }
        if (out !== originals[relative]) await fsp.writeFile(path.join(newDir, relative), out);
      }
      const track = await trackFor(newDir, newId, target);
      journal.created = [];
      const rekeyed = await rekey(newDir, track, relative => journal.created.push(relative));
      // The app's own reading: stems readable, no MIDI version unreadable.
      const read = await assets.readStems(track);
      if (!read.ok) return undo('stems: ' + read.error);
      const derived = require('./derived-assets.cjs');
      for (const stem of derived.STEMS) {
        const runs = await assets.midi.listRuns(track, stem);
        const broken = runs.filter(r => r.status === 'invalid');
        if (broken.length) return undo(`MIDI ${stem}: ${broken.map(r => r.reason).join(', ')}`);
      }
      await fsp.rm(path.join(newDir, JOURNAL), {force: true});
      return {ok: true, folder: path.relative(root, newDir), trackId: newId, changed, rekeyed: rekeyed?.length || 0};
    } catch (error) {
      return undo(error.message);
    }
  }
  async function trackFor(dir, id, file) {
    let meta = {}; try { meta = JSON.parse(await fsp.readFile(path.join(dir, 'track.json'), 'utf8')); } catch (_) {}
    return {id, filePath: file, title: meta.title, artist: meta.artist, album: meta.album, number: meta.number, bridgePath: path.join(dir, 'music-lab.json')};
  }
  // Move the song's analysis folder to the bin (`dispose`), when its original is gone for good.
  async function discard(root, folder, dispose) {
    root = path.resolve(root);
    const dir = await guarded(root, path.join(root, folder));
    const item = listMissing(root).find(m => path.join(root, m.folder).toLowerCase() === dir.toLowerCase());
    if (!item) return {ok: false, error: 'relink-not-missing'};
    await dispose(dir);
    return {ok: true, folder, bytes: item.bytes};
  }
  return {relink, discard, listMissing};
}
module.exports = {createSourceRelink, listMissing, JOURNAL};
