'use strict';
// Lyrics for the score (B6, 2026-11-15), asked for by the page one song at a time, only while the score shows it.
// Where they come from, in this order:
//   1. a .lrc file next to the song with the same name (read every time; never cached, the user's own file wins);
//   2. this machine's lyrics cache (a folder beside XML's settings, never the analysis root);
//   3. LRCLIB (https://lrclib.net/api/get): title, artist, album and duration are sent, with a generic client name.
// Only timed lyrics count. A record is used only when sameSong() says it is the song (lyrics-core.js). What was found,
// and what was not, is cached; "not found" is asked again after MISS_DAYS. A song is asked about once at a time; a
// failed request (timeout, network, 5xx) is not cached but the song is left alone for RETRY_MINUTES; a 429 stops every
// request for the Retry-After it gives (plus a little). NetEase was checked and left out: its search answers in an
// encrypted form without a login (work/xml-round-20261115/REPORT-B6.md).
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const core = require('../lyrics-core.js');

const LRCLIB = 'https://lrclib.net/api/get';
const LRCLIB_SEARCH = 'https://lrclib.net/api/search';
// The offset estimator's rules (lyrics-core.js estimateOffset): 2 = phrase starts + the intro rules out a second phrase.
const METHOD = 2;
const DEFAULTS = Object.freeze({timeoutMs: 5000, missDays: 7, retryMinutes: 10, userAgent: 'XML-score-lyrics/0.5'});
const rootFor = (appData, userData) => path.join(path.dirname(require('./score-notes.cjs').notesRoot(appData, userData)), 'Lyrics Cache');

function createLyrics({root, fetch: fetchImpl = globalThis.fetch, now = () => Date.now(), timeoutMs = DEFAULTS.timeoutMs,
  missDays = DEFAULTS.missDays, retryMinutes = DEFAULTS.retryMinutes, userAgent = DEFAULTS.userAgent, random = Math.random} = {}) {
  if (!root || !path.isAbsolute(root)) throw Error('lyrics-root-invalid');
  const inFlight = new Map();
  const failedAt = new Map();
  let blockedUntil = 0;
  const counts = {network: 0};

  const keyOf = q => crypto.createHash('sha1').update([core.normalize(q.title), core.normalize(q.artist), q.duration].join('|')).digest('hex');
  const fileOf = key => path.join(root, key + '.json');

  async function readSideFile(filePath) {
    if (!filePath) return null;
    const parsed = path.parse(filePath);
    let names;
    try { names = await fs.readdir(parsed.dir); } catch (_) { return null; }
    const want = (parsed.name + '.lrc').toLowerCase();
    const name = names.find(item => item.toLowerCase() === want);
    if (!name) return null;
    try {
      const text = await fs.readFile(path.join(parsed.dir, name), 'utf8');
      return core.parseLrc(text).timed ? text : null;
    } catch (_) { return null; }
  }

  async function readCache(key) {
    try { return JSON.parse(await fs.readFile(fileOf(key), 'utf8')); } catch (_) { return null; }
  }
  async function writeCache(key, entry) {
    await fs.mkdir(root, {recursive: true});
    const file = fileOf(key), temp = file + '.' + process.pid + '.tmp';
    await fs.writeFile(temp, JSON.stringify(entry));
    await fs.rename(temp, file);
  }

  async function askLrclib(q) {
    const params = new URLSearchParams({track_name: q.title, artist_name: q.artist});
    if (q.album) params.set('album_name', q.album);
    if (q.duration > 0 && q.duration <= 3600) params.set('duration', String(q.duration));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    counts.network++;
    try {
      const response = await fetchImpl(`${LRCLIB}?${params}`, {headers: {'User-Agent': userAgent, Accept: 'application/json'}, signal: controller.signal});
      if (response.status === 404) return {miss: true};
      if (response.status === 429) {
        const seconds = Math.max(1, Number(response.headers?.get?.('retry-after')) || 60);
        blockedUntil = now() + seconds * 1000 * (1 + 0.3 * random());
        return {error: 'rate-limited'};
      }
      if (!response.ok) return {error: `http-${response.status}`};
      const record = await response.json();
      const got = {title: record?.trackName ?? record?.name, artist: record?.artistName, duration: record?.duration};
      if (!core.sameSong(q, got)) return {miss: true, reason: 'not-the-song'};
      if (record.instrumental || !record.syncedLyrics || !core.parseLrc(record.syncedLyrics).timed) return {miss: true, reason: 'no-timed-lyrics'};
      return {found: {lrc: record.syncedLyrics, id: record.id ?? null, title: got.title, artist: got.artist, album: record.albumName ?? null, duration: got.duration ?? null}};
    } catch (error) {
      return {error: error?.name === 'AbortError' ? 'timeout' : 'network'};
    } finally {
      clearTimeout(timer);
    }
  }

  // --- the user's own choice for a song (2026-11-15, the lyrics menu) ------------------------------------------------
  // choices/<sha1(trackId)>.json: {hidden: true} (这首不显示歌词), {lrclib: {id, lrc, ...}} (换一份), or {file: {path}}
  // (用本地文件…: the path is remembered, the file is read each time and never copied). It wins over everything else.
  const choiceFile = trackId => path.join(root, 'choices', crypto.createHash('sha1').update(String(trackId)).digest('hex') + '.json');
  async function readChoice(trackId) { try { const v = JSON.parse(await fs.readFile(choiceFile(trackId), 'utf8')); return v && typeof v === 'object' ? v : null; } catch (_) { return null; } }
  async function writeChoice(trackId, value) {
    const file = choiceFile(trackId);
    if (!value) { await fs.rm(file, {force: true}); return; }
    await fs.mkdir(path.dirname(file), {recursive: true});
    const temp = file + '.' + process.pid + '.tmp';
    await fs.writeFile(temp, JSON.stringify({schemaVersion: 1, trackId: String(trackId), ...value}));
    await fs.rename(temp, file);
  }
  async function readLrcFile(file) {
    try { const text = await fs.readFile(file, 'utf8'); return core.parseLrc(text).timed ? text : null; } catch (_) { return null; }
  }

  async function find(track, {force = false} = {}) {
    const choice = await readChoice(track?.id);
    if (choice?.hidden) return {ok: false, reason: 'hidden', hidden: true};
    if (choice?.file?.path) {
      const text = await readLrcFile(choice.file.path);
      if (text) return {ok: true, source: 'chosen-file', lrc: text, file: path.basename(choice.file.path)};
      return {ok: false, reason: 'chosen-file-missing', file: path.basename(choice.file.path)};
    }
    if (choice?.lrclib?.lrc) return {ok: true, source: 'lrclib', lrc: choice.lrclib.lrc, chosen: true, id: choice.lrclib.id ?? null};
    const side = await readSideFile(track?.filePath);
    if (side) return {ok: true, source: 'file', lrc: side};
    if (force) {
      // 重新查找: what is cached for this song (found or not) is not used; one fresh request.
      const q = core.query(track);
      if (!q) return {ok: false, reason: 'no-names'};
      const key = keyOf(q);
      if (now() < blockedUntil) return {ok: false, reason: 'rate-limited'};
      const answer = await askLrclib(q);
      if (answer.error) return {ok: false, reason: answer.error};
      failedAt.delete(key);
      if (answer.found) { await writeCache(key, {schemaVersion: 1, at: now(), source: 'lrclib', asked: q, found: answer.found}); return {ok: true, source: 'lrclib', lrc: answer.found.lrc}; }
      await writeCache(key, {schemaVersion: 1, at: now(), source: 'lrclib', asked: q, miss: true, reason: answer.reason || 'not-found'});
      return {ok: false, reason: 'none'};
    }
    const q = core.query(track);
    if (!q) return {ok: false, reason: 'no-names'};
    const key = keyOf(q);
    const cached = await readCache(key);
    if (cached?.found) return {ok: true, source: cached.source, lrc: cached.found.lrc, cached: true};
    if (cached?.miss && now() - cached.at < missDays * 86400000) return {ok: false, reason: 'none', cached: true};
    if (now() < blockedUntil) return {ok: false, reason: 'rate-limited'};
    if (failedAt.has(key) && now() - failedAt.get(key) < retryMinutes * 60000) return {ok: false, reason: 'waiting'};
    const answer = await askLrclib(q);
    // A 429 already stops every request until Retry-After; other failures leave this song alone for a while.
    if (answer.error) { if (answer.error !== 'rate-limited') failedAt.set(key, now()); return {ok: false, reason: answer.error}; }
    failedAt.delete(key);
    if (answer.found) {
      await writeCache(key, {schemaVersion: 1, at: now(), source: 'lrclib', asked: q, found: answer.found});
      return {ok: true, source: 'lrclib', lrc: answer.found.lrc};
    }
    await writeCache(key, {schemaVersion: 1, at: now(), source: 'lrclib', asked: q, miss: true, reason: answer.reason || 'not-found'});
    return {ok: false, reason: 'none'};
  }

  // One request per song at a time: a second ask while the first is out gets the same answer.
  function get(track, options) {
    const id = String(track?.id || '');
    if (inFlight.has(id)) return inFlight.get(id);
    const job = find(track, options).finally(() => inFlight.delete(id));
    inFlight.set(id, job);
    return job;
  }
  // 重新查找: the song's own choice of a record or file is dropped (a hidden song stays hidden), the cache ignored.
  async function refresh(track) {
    const choice = await readChoice(track?.id);
    if (choice && !choice.hidden) await writeChoice(track.id, null);
    return get(track, {force: true});
  }
  // 换一份: LRCLIB's search (GET /api/search, the same names as /api/get: title, artist, album; nothing else) - every
  // record of the song with timed lyrics, nearest in length first. The lyrics of each are kept for choose().
  const searched = new Map();
  async function candidates(track) {
    const q = core.query(track);
    if (!q) return {ok: false, reason: 'no-names'};
    if (now() < blockedUntil) return {ok: false, reason: 'rate-limited'};
    const params = new URLSearchParams({track_name: q.title, artist_name: q.artist});
    if (q.album) params.set('album_name', q.album);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    counts.network++;
    try {
      const response = await fetchImpl(`${LRCLIB_SEARCH}?${params}`, {headers: {'User-Agent': userAgent, Accept: 'application/json'}, signal: controller.signal});
      if (response.status === 429) { blockedUntil = now() + Math.max(1, Number(response.headers?.get?.('retry-after')) || 60) * 1000; return {ok: false, reason: 'rate-limited'}; }
      if (!response.ok) return {ok: false, reason: `http-${response.status}`};
      const list = await response.json();
      const rows = (Array.isArray(list) ? list : []).filter(r => r && r.syncedLyrics && !r.instrumental && core.parseLrc(r.syncedLyrics).timed
        && core.normalize(r.trackName ?? r.name) === core.normalize(q.title) && core.artistsMatch(q.artist, r.artistName));
      rows.sort((a, b) => Math.abs((Number(a.duration) || 0) - q.duration) - Math.abs((Number(b.duration) || 0) - q.duration));
      const out = rows.slice(0, 8).map(r => ({id: r.id ?? null, title: r.trackName ?? r.name ?? '', artist: r.artistName ?? '', album: r.albumName ?? '',
        duration: Number(r.duration) || 0, lines: core.parseLrc(r.syncedLyrics).lines.filter(l => l.text).length}));
      searched.set(String(track.id), new Map(rows.slice(0, 8).map(r => [String(r.id), r])));
      return {ok: true, candidates: out, songSeconds: q.duration};
    } catch (error) {
      return {ok: false, reason: error?.name === 'AbortError' ? 'timeout' : 'network'};
    } finally { clearTimeout(timer); }
  }
  async function choose(track, id) {
    const record = searched.get(String(track?.id))?.get(String(id));
    if (!record) return {ok: false, reason: 'not-offered'};
    await writeChoice(track.id, {lrclib: {id: record.id ?? null, lrc: record.syncedLyrics, title: record.trackName ?? '', album: record.albumName ?? '', duration: Number(record.duration) || 0}});
    return {ok: true};
  }
  async function chooseFile(track, file) {
    if (!file || !path.isAbsolute(file) || !/\.lrc$/i.test(file)) return {ok: false, reason: 'not-lrc'};
    if (!(await readLrcFile(file))) return {ok: false, reason: 'no-timed-lyrics'};
    await writeChoice(track.id, {file: {path: file}});
    return {ok: true};
  }
  async function hide(track, hidden) {
    const choice = await readChoice(track?.id);
    if (hidden) await writeChoice(track.id, {...(choice || {}), hidden: true});
    else if (choice) { const {hidden: _, schemaVersion: __, trackId: ___, ...rest} = choice; await writeChoice(track.id, Object.keys(rest).length ? rest : null); }
    return {ok: true, hidden: Boolean(hidden)};
  }

  // --- per-song offset (B7) ---------------------------------------------------------------------------------------
  // offsets/<sha1(trackId)>.json: {auto: {shift, sure, why, hits, of, lrc, vocal}, manual}. `auto` is estimated once
  // for a given lyrics text and vocal line (lrc / vocal say which) and kept; `manual` is the user's 0.1 s nudges, kept
  // per song whatever the estimate. The shown time is the play time minus (auto shift + manual).
  const offsetFile = trackId => path.join(root, 'offsets', crypto.createHash('sha1').update(String(trackId)).digest('hex') + '.json');
  async function readOffset(trackId) {
    try { const v = JSON.parse(await fs.readFile(offsetFile(trackId), 'utf8')); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; }
  }
  async function writeOffset(trackId, value) {
    const file = offsetFile(trackId), temporary = file + '.' + process.pid + '.tmp';
    await fs.mkdir(path.dirname(file), {recursive: true});
    await fs.writeFile(temporary, JSON.stringify({schemaVersion: 1, trackId: String(trackId), ...value}));
    await fs.rename(temporary, file);
  }
  const lrcHash = text => crypto.createHash('sha1').update(String(text || '')).digest('hex').slice(0, 16);
  const shown = value => ({auto: value.auto && value.auto.sure ? Number(value.auto.shift) || 0 : 0, sure: Boolean(value.auto && value.auto.sure),
    why: value.auto ? value.auto.why || null : null, manual: Number(value.manual) || 0});
  // `vocal`: {id, notes} of the song's vocal line (null without one). Estimated again only when the lyrics text or the
  // vocal line changed since the stored estimate.
  async function offsetFor(trackId, lrc, vocal) {
    const value = await readOffset(trackId);
    const lrcKey = lrcHash(lrc), vocalKey = vocal ? String(vocal.id) : null;
    // METHOD: the estimator's rules; a stored estimate made by other rules is made again.
    if (!value.auto || value.auto.lrc !== lrcKey || value.auto.vocal !== vocalKey || value.auto.method !== METHOD) {
      const estimate = vocal ? core.estimateOffset(core.parseLrc(lrc).lines, core.phraseStarts(vocal.notes), {notes: vocal.notes}) : {shift: 0, sure: false, why: 'no-vocal-line'};
      value.auto = {shift: estimate.shift, sure: estimate.sure, why: estimate.why, hits: estimate.hits ?? 0, of: estimate.of ?? 0, lrc: lrcKey, vocal: vocalKey, method: METHOD, at: now()};
      try { await writeOffset(trackId, value); } catch (_) {}
    }
    return shown(value);
  }
  async function nudge(trackId, delta) {
    const value = await readOffset(trackId);
    const step = Math.round(Number(delta) * 10) / 10;
    if (!Number.isFinite(step) || !step) return shown(value);
    value.manual = Math.max(-10, Math.min(10, Math.round(((Number(value.manual) || 0) + step) * 10) / 10));
    await writeOffset(trackId, value);
    return shown(value);
  }

  return {get, refresh, candidates, choose, chooseFile, hide, offsetFor, nudge, counts: () => ({...counts, blockedUntil})};
}

module.exports = {createLyrics, rootFor, DEFAULTS, LRCLIB, LRCLIB_SEARCH};
