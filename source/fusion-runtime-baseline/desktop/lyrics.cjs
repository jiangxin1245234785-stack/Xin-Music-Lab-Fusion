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

  async function find(track) {
    const side = await readSideFile(track?.filePath);
    if (side) return {ok: true, source: 'file', lrc: side};
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
  function get(track) {
    const id = String(track?.id || '');
    if (inFlight.has(id)) return inFlight.get(id);
    const job = find(track).finally(() => inFlight.delete(id));
    inFlight.set(id, job);
    return job;
  }

  return {get, counts: () => ({...counts, blockedUntil})};
}

module.exports = {createLyrics, rootFor, DEFAULTS, LRCLIB};
