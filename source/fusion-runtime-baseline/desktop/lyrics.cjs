'use strict';
// Lyrics for the score (B6, 2026-11-15), asked for by the page one song at a time, only while the score shows it.
// Where they come from, in this order:
//   1. a .lrc file next to the song with the same name (read every time; never cached, the user's own file wins);
//   2. this machine's lyrics cache (a folder beside XML's settings, never the analysis root);
//   3. LRCLIB (https://lrclib.net/api/get): title, artist, album and duration are sent, with a generic client name.
// Only timed lyrics count. A record is used only when sameSong() says it is the song (lyrics-core.js). What was found,
// and what was not, is cached; "not found" is asked again after MISS_DAYS. A song is asked about once at a time; a
// failed request (timeout, network, 5xx) is not cached but the song is left alone for RETRY_MINUTES; a 429 stops every
// request for the Retry-After it gives (plus a little). An optional NetEase song link is previewed before it is bound.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const core = require('../lyrics-core.js');
const netease = require('./netease-lyrics.cjs');

const LRCLIB = 'https://lrclib.net/api/get';
const LRCLIB_SEARCH = 'https://lrclib.net/api/search';
// The offset estimator's rules (lyrics-core.js estimateOffset): 2 = phrase starts + the intro rules out a second phrase.
const METHOD = 2;
const DEFAULTS = Object.freeze({timeoutMs: 5000, missDays: 7, retryMinutes: 10, userAgent: 'XML-score-lyrics/0.5'});
const rootFor = (appData, userData) => path.join(path.dirname(require('./score-notes.cjs').notesRoot(appData, userData)), 'Lyrics Cache');
function storedRecord(row) {
  return {id:row.id ?? null, lrc:row.syncedLyrics, title:row.trackName ?? row.name ?? '',
    artist:row.artistName ?? '', album:row.albumName ?? null, duration:Number(row.duration) || 0};
}

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
    const file = fileOf(key), temp = file + '.' + crypto.randomUUID() + '.tmp';
    await fs.writeFile(temp, JSON.stringify(entry));
    await fs.rename(temp, file);
  }

  async function lrclibRequest(endpoint, params) {
    if (now() < blockedUntil) return {error:'rate-limited'};
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    counts.network++;
    try {
      const response = await fetchImpl(`${endpoint}?${params}`, {headers: {'User-Agent': userAgent, Accept: 'application/json'}, signal: controller.signal});
      if (response.status === 404) return {miss: true};
      if (response.status === 429) {
        const seconds = Math.max(1, Number(response.headers?.get?.('retry-after')) || 60);
        blockedUntil = now() + seconds * 1000 * (1 + 0.3 * random());
        return {error: 'rate-limited'};
      }
      if (!response.ok) return {error: `http-${response.status}`};
      return {body:await response.json()};
    } catch (error) {
      return {error: error?.name === 'AbortError' ? 'timeout' : 'network'};
    } finally {
      clearTimeout(timer);
    }
  }

  async function askExact(q) {
    const params = new URLSearchParams({track_name:q.title, artist_name:q.artist});
    if (q.album) params.set('album_name', q.album);
    if (q.duration > 0 && q.duration <= 3600) params.set('duration', String(q.duration));
    const result = await lrclibRequest(LRCLIB, params);
    if (!result.body) return result;
    const row = result.body, got = storedRecord(row);
    if (!core.sameSong(q, got) || !core.sameRelease(q, got)) return {miss:true, reason:'not-the-song'};
    if (row.instrumental || !core.parseLrc(got.lrc).timed) return {miss:true, reason:'no-timed-lyrics'};
    return {found:got};
  }

  async function searchRows(q, title) {
    const params = new URLSearchParams({track_name:title});
    if (q.artist) params.set('artist_name', q.artist);
    if (q.album) params.set('album_name', q.album);
    const result = await lrclibRequest(LRCLIB_SEARCH, params);
    if (result.error) return result;
    const rows = (Array.isArray(result.body) ? result.body : []).filter(row =>
      row?.id != null && !row.instrumental && core.sameTitle(title, row.trackName ?? row.name) &&
      (!q.artist || core.artistsMatch(q.artist, row.artistName)) && core.parseLrc(row.syncedLyrics).timed);
    return {rows};
  }

  async function lookup(q, aliases, knownMiss, duration) {
    const exact = knownMiss ? {miss:true} : await askExact(q);
    if (!exact.miss || !q.album || !q.duration) return exact;
    // An alias broadens title search, never the identity of the local recording.
    for (const alias of aliases) {
      const result = await searchRows(q, alias);
      if (result.error) return result;
      const matches = result.rows.filter(row => row.albumName && core.sameRelease(q,storedRecord(row)) &&
        Number(row.duration)>0 && Math.abs(row.duration-duration)<=core.MATCH.durationSeconds);
      matches.sort((a,b) => Math.abs(a.duration-duration)-Math.abs(b.duration-duration));
      if (matches.length) return {found:storedRecord(matches[0])};
    }
    return exact;
  }

  // --- the user's own choice for a song (2026-11-15, the lyrics menu) ------------------------------------------------
  // choices/<sha1(trackId)>.json: {hidden: true} (这首不显示歌词), {lrclib: {id, lrc, ...}} (换一份), or {file: {path}}
  // (用本地文件…: the path is remembered, the file is read each time and never copied). It wins over everything else.
  const choiceFile = trackId => path.join(root, 'choices', crypto.createHash('sha1').update(String(trackId)).digest('hex') + '.json');
  async function readChoice(trackId) { try { const v = JSON.parse(await fs.readFile(choiceFile(trackId), 'utf8')); return v && typeof v === 'object' ? v : null; } catch (_) { return null; } }
  async function writeChoice(trackId, value) {
    const file = choiceFile(trackId);
    if (!value) { await fs.rm(file, {force: true}); inFlight.delete(String(trackId)); return; }
    await fs.mkdir(path.dirname(file), {recursive: true});
    const temp = file + '.' + crypto.randomUUID() + '.tmp';
    await fs.writeFile(temp, JSON.stringify({schemaVersion: 1, trackId: String(trackId), ...value}));
    await fs.rename(temp, file);
    inFlight.delete(String(trackId));
  }
  async function readLrcFile(file) {
    try { const text = await fs.readFile(file, 'utf8'); return core.parseLrc(text).timed ? text : null; } catch (_) { return null; }
  }

  async function find(track, {force = false} = {}) {
    const choice = await readChoice(track?.id);
    if (choice?.instrumental) return {ok:false, reason:'instrumental', instrumental:true};
    if (choice?.hidden) return {ok: false, reason: 'hidden', hidden: true};
    if (choice?.file?.path) {
      const text = await readLrcFile(choice.file.path);
      if (text) return {ok: true, source: 'chosen-file', lrc: text, file: path.basename(choice.file.path)};
      return {ok: false, reason: 'chosen-file-missing', file: path.basename(choice.file.path)};
    }
    if (choice?.lrclib?.lrc) return {ok: true, source: 'lrclib', lrc: choice.lrclib.lrc, chosen: true, id: choice.lrclib.id ?? null};
    if (choice?.netease?.lrc) return {ok:true, source:'netease', lrc:choice.netease.lrc, chosen:true, id:choice.netease.id};
    const side = await readSideFile(track?.filePath);
    if (side) return {ok: true, source: 'file', lrc: side};
    const q = core.query(track);
    if (!q) return {ok: false, reason: 'no-names'};
    const key = keyOf(q);
    const previous = force ? null : await readCache(key);
    const cached = previous?.asked && Boolean(previous.asked.album) === Boolean(q.album) && core.sameRelease(q,previous.asked) ? previous : null;
    const aliases = core.titleAliases(q.title).slice(0, 2);
    if (cached?.found) return {ok: true, source: cached.source, lrc: cached.found.lrc, cached: true};
    const recentMiss = cached?.miss && now() - cached.at < missDays * 86400000;
    if (recentMiss && (cached.lookupVersion === 2 || !aliases.length)) return {ok: false, reason: 'none', cached: true};
    if (now() < blockedUntil) return {ok: false, reason: 'rate-limited'};
    if (!force && failedAt.has(key) && now() - failedAt.get(key) < retryMinutes * 60000) return {ok: false, reason: 'waiting'};
    const answer = await lookup(q, aliases, recentMiss, Number(track.duration) || q.duration);
    // A 429 already stops every request until Retry-After; other failures leave this song alone for a while.
    if (answer.error) { if (answer.error !== 'rate-limited') failedAt.set(key, now()); return {ok: false, reason: answer.error}; }
    failedAt.delete(key);
    if (answer.found) {
      await writeCache(key, {schemaVersion: 1, at: now(), source: 'lrclib', asked: q, found: answer.found});
      return {ok: true, source: 'lrclib', lrc: answer.found.lrc};
    }
    await writeCache(key, {schemaVersion: 1, lookupVersion:2, at: now(), source: 'lrclib', asked: q, miss: true, reason: answer.reason || 'not-found'});
    return {ok: false, reason: 'none'};
  }

  // One request per song at a time: a second ask while the first is out gets the same answer.
  function get(track, options) {
    const id = String(track?.id || '');
    if (inFlight.has(id)) return inFlight.get(id);
    const job = find(track, options).then(result => inFlight.get(id) === job ? result : get(track))
      .finally(() => { if (inFlight.get(id) === job) inFlight.delete(id); });
    inFlight.set(id, job);
    return job;
  }
  // 重新查找: the song's own choice of a record or file is dropped (a hidden song stays hidden), the cache ignored.
  async function refresh(track) {
    const choice = await readChoice(track?.id);
    if (choice && !choice.hidden && !choice.instrumental) await writeChoice(track.id, null);
    return get(track, {force: true});
  }
  // 换一份: LRCLIB's search (GET /api/search, the same names as /api/get: title, artist, album; nothing else) - every
  // record of the song with timed lyrics, nearest in length first. The lyrics of each are kept for choose().
  const searched = new Map();
  async function candidates(track, input = {}) {
    const original = core.query(track);
    const custom = typeof input?.query === 'string' || typeof input?.artist === 'string';
    const q = custom ? {title:String(input.query ?? original?.title ?? '').trim().slice(0,250),
      artist:String(input.artist ?? original?.artist ?? '').trim().slice(0,200), album:'', duration:Number(track?.duration) || 0} : original;
    if (!q) return {ok: false, reason: 'no-names'};
    if (!q.title) return {ok:false, reason:'no-names'};
    const names = core.titleAliases(q.title).slice(0,2);
    const id = String(track.id), records = new Map(), pending = new Map();
    searched.set(id, pending);
    for (const name of names.length ? names : [q.title]) {
      const result = await searchRows(q, name);
      if (searched.get(id) !== pending) return {ok:false, reason:'superseded'};
      if (result.error && !records.size) return {ok:false, reason:result.error};
      if (result.error) break;
      for (const row of result.rows) records.set(String(row.id), row);
    }
    const ranked = [...records.values()].sort((a,b) => Math.abs(a.duration-q.duration)-Math.abs(b.duration-q.duration)).slice(0,8);
    searched.set(id, new Map(ranked.map(row => [String(row.id),row])));
    return {ok:true, songSeconds:q.duration, candidates:ranked.map(row => ({id:row.id, title:row.trackName ?? row.name ?? '',
      artist:row.artistName ?? '', album:row.albumName ?? '', duration:Number(row.duration)||0,
      lines:core.parseLrc(row.syncedLyrics).lines.filter(l => l.text).length}))};
  }
  async function choose(track, id) {
    const record = searched.get(String(track?.id))?.get(String(id));
    if (!record) return {ok: false, reason: 'not-offered'};
    await writeChoice(track.id, {lrclib:storedRecord(record)});
    return {ok: true};
  }
  const shared = new Map();
  async function neteasePreview(track, url) {
    const trackId = String(track.id), ticket = {};
    shared.set(trackId, ticket);
    const result = await netease.preview(track, url, fetchImpl, {timeoutMs, userAgent});
    if (shared.get(trackId) !== ticket) return {ok:false, reason:'superseded'};
    if (!result.ok) { shared.delete(trackId); return result; }
    const {lrc, originalLrc, ...publicData} = result;
    shared.set(trackId, {...result.candidate, lrc, originalLrc});
    return publicData;
  }
  async function neteaseChoose(track, id) {
    const record = shared.get(String(track.id));
    if (!record?.lrc || String(id) !== record.id) return {ok:false, reason:'not-offered'};
    await writeChoice(track.id, {netease:record});
    shared.delete(String(track.id));
    return {ok:true};
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

  async function setInstrumental(track, instrumental) {
    const choice = await readChoice(track.id);
    if (instrumental) await writeChoice(track.id, {...(choice || {}), instrumental:true});
    else if (choice?.instrumental) {
      const {instrumental:_, schemaVersion:__, trackId:___, ...rest} = choice;
      await writeChoice(track.id, Object.keys(rest).length ? rest : null);
    }
    return {ok:true, instrumental:Boolean(instrumental)};
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

  return {get, refresh, candidates, choose, chooseFile, hide, setInstrumental, neteasePreview, neteaseChoose,
    offsetFor, nudge, counts: () => ({...counts, blockedUntil})};
}

module.exports = {createLyrics, rootFor, DEFAULTS, LRCLIB, LRCLIB_SEARCH};
