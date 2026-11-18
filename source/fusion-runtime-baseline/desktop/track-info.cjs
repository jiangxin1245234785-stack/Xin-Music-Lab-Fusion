'use strict';
// Track facts for the score (2026-11-18): what a song is in the outside world - title, artist, album, release date,
// track / disc, label, country, genre, composer, lyricist, arranger, producer, performers, length - asked for by the
// page one song at a time, the way the lyrics are (desktop/lyrics.cjs). The radar's ticker tape prints them for a song
// without lyrics; drawing them is the score's work, this file only gets them.
//
// Where they come from, in this order:
//   1. a hand-written file next to the song: same name + ".info.txt", one "name: value" per line (English or Chinese
//      names, see NAMES). With it, nothing else is used (the user's own file wins, read every time, never cached);
//   2. the user's choice for the song (the menu: 换一份 / 用本地文件… / 这首不显示);
//   3. the song's own tags, read each time;
//   4. MusicBrainz (https://musicbrainz.org/ws/2/), cached: what the tags lack is filled in, the tags always win.
//      A song whose lyrics were bound to a NetEase song link gets its album and release date from the same NetEase
//      song record when MusicBrainz has none.
// Only title, artist, album and length are sent out. MusicBrainz asks every client to name itself with a way to reach
// its maker ("name/version ( contact )"): the app's name and version and the project's public GitHub page, the user's
// choice on 2026-11-18; nothing else of the user or the machine. NetEase gets a neutral name (NEUTRAL_AGENT). Not sure it is the same song (title,
// an artist in common, length within MATCH.durationSeconds): nothing found. Nothing found, a timeout, no network: the
// tags alone, quietly; "nothing found" is remembered for MISS_DAYS, a failure leaves the song alone for RETRY_MINUTES,
// a 503 stops every request for a while. MusicBrainz allows one request a second from an address: requests are queued
// and spaced (SPACING_MS).
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const core = require('../lyrics-core.js');

const MB = 'https://musicbrainz.org/ws/2';
const NETEASE_DETAIL = 'https://music.163.com/api/song/detail/';
const CONTACT = 'https://github.com/jiangxin1245234785-stack/Xin-Music-Lab-Fusion';
const NEUTRAL_AGENT = 'ScoreTrackInfo/0.1';
const agentFor = version => `XinsMusicLabFusion/${String(version || '0').replace(/[^\w.+-]/g, '') || '0'} ( ${CONTACT} )`;
const DEFAULTS = Object.freeze({timeoutMs: 8000, missDays: 30, retryMinutes: 15, spacingMs: 1100, blockSeconds: 60,
  userAgent: agentFor('0.5.0')});
// The order the items are handed over in, and the names a hand-written file may use for each.
const ORDER = ['title', 'artist', 'album', 'albumArtist', 'date', 'track', 'disc', 'label', 'country', 'genre',
  'composer', 'lyricist', 'arranger', 'producer', 'performer', 'length'];
const NAMES = {title: ['title', '歌名', '标题', '曲名'], artist: ['artist', '歌手', '艺人', '演唱', '艺术家'], album: ['album', '专辑'],
  albumArtist: ['album artist', 'albumartist', '专辑艺人', '专辑歌手'], date: ['date', 'year', 'released', 'release date', '发行', '发行日期', '发行时间', '年份'],
  track: ['track', 'track number', 'tracknumber', '曲目', '曲目号', '音轨'], disc: ['disc', 'disc number', 'discnumber', '碟', '碟号', '光盘'],
  label: ['label', '厂牌', '唱片公司', '发行公司'], country: ['country', 'region', '地区', '发行地区'], genre: ['genre', '流派', '风格'],
  composer: ['composer', 'music', '作曲', '曲'], lyricist: ['lyricist', 'lyrics', 'words', '作词', '词'], arranger: ['arranger', 'arrangement', '编曲'],
  producer: ['producer', '制作人', '制作', '监制'], performer: ['performer', 'performers', 'musicians', '演奏', '乐手', '演奏者'], length: ['length', 'duration', '时长']};
const NAME_OF = new Map(Object.entries(NAMES).flatMap(([key, names]) => names.map(name => [name.toLowerCase(), key])));
const rootFor = (appData, userData) => path.join(path.dirname(require('./score-notes.cjs').notesRoot(appData, userData)), 'Track Info Cache');
const clock = seconds => { const s = Math.round(Number(seconds) || 0); return s > 0 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : ''; };
const albumKey = name => String(name || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const credit = list => (Array.isArray(list) ? list : []).map(c => (c?.name || c?.artist?.name || '') + (c?.joinphrase || '')).join('').trim();
const unique = list => [...new Set(list.map(v => String(v || '').trim()).filter(Boolean))];

// "name: value" lines; '#' starts a comment; unknown names are kept under their own name at the end.
function parseInfoText(text) {
  const items = [], seen = new Set();
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const at = line.search(/[:：]/);
    if (at <= 0) continue;
    const name = line.slice(0, at).trim(), value = line.slice(at + 1).trim();
    if (!value) continue;
    const key = NAME_OF.get(name.toLowerCase()) || name;
    if (seen.has(key)) continue;
    seen.add(key); items.push({key, value, from: 'local'});
  }
  return items.sort((a, b) => (ORDER.indexOf(a.key) + 1 || 99) - (ORDER.indexOf(b.key) + 1 || 99));
}

// The song's own tags (Vorbis comment names; the ID3 frames audio-tags.cjs maps to them).
function fromTags(tags) {
  if (!tags) return {};
  const t = name => String(tags[name] || '').trim();
  const out = {};
  const put = (key, value) => { if (value) out[key] = value; };
  put('title', t('TITLE')); put('artist', t('ARTIST')); put('album', t('ALBUM')); put('albumArtist', t('ALBUMARTIST'));
  put('date', t('DATE') || t('YEAR') || t('ORIGINALDATE'));
  const number = t('TRACKNUMBER'), total = t('TRACKTOTAL') || t('TOTALTRACKS');
  put('track', number && total && !number.includes('/') ? `${number}/${total}` : number);
  const disc = t('DISCNUMBER'), discs = t('DISCTOTAL') || t('TOTALDISCS');
  put('disc', disc && discs && !disc.includes('/') ? `${disc}/${discs}` : disc);
  put('label', t('LABEL') || t('ORGANIZATION') || t('PUBLISHER')); put('country', t('RELEASECOUNTRY'));
  put('genre', t('GENRE')); put('composer', t('COMPOSER')); put('lyricist', t('LYRICIST') || t('WRITER'));
  put('arranger', t('ARRANGER')); put('producer', t('PRODUCER')); put('performer', t('PERFORMER'));
  return out;
}

// One MusicBrainz recording on one of its releases, as items (not yet merged with the tags).
function fromMusicBrainz(recording, release) {
  const out = {};
  const put = (key, value) => { if (value) out[key] = value; };
  put('title', recording?.title); put('artist', credit(recording?.['artist-credit']));
  if (release) {
    put('album', release.title);
    const albumArtist = credit(release['artist-credit']);
    if (albumArtist && albumArtist !== out.artist) put('albumArtist', albumArtist);
    put('date', release.date); put('country', release.country);
    put('label', unique((release['label-info'] || []).map(l => l?.label?.name)).join(' / '));
    const media = Array.isArray(release.media) ? release.media : [];
    for (const medium of media) {
      const track = (medium.tracks || medium.track || []).find(row => row?.recording?.id === recording?.id || row?.id === recording?.trackId);
      if (!track) continue;
      put('track', `${track.number || track.position}/${medium['track-count'] || (medium.tracks || []).length}`);
      if (media.length > 1) put('disc', `${medium.position}/${media.length}`);
      break;
    }
  }
  const genres = [...(recording?.genres || []), ...(release?.genres || [])].sort((a, b) => (b.count || 0) - (a.count || 0));
  put('genre', unique(genres.map(g => g.name)).slice(0, 3).join(' / '));
  const rels = Array.isArray(recording?.relations) ? recording.relations : [];
  const people = type => unique(rels.filter(r => r.type === type && r.artist).map(r => r.artist.name));
  const works = rels.filter(r => r.type === 'performance' && r.work).flatMap(r => r.work.relations || []);
  const writers = type => unique(works.filter(r => r.type === type && r.artist).map(r => r.artist.name));
  put('composer', unique([...writers('composer'), ...writers('writer')]).join(' / '));
  put('lyricist', unique([...writers('lyricist'), ...writers('writer')]).join(' / '));
  put('arranger', unique([...people('arranger'), ...writers('arranger')]).join(' / '));
  put('producer', people('producer').join(' / '));
  const players = rels.filter(r => ['instrument', 'vocal', 'performer'].includes(r.type) && r.artist)
    .map(r => r.artist.name + (Array.isArray(r.attributes) && r.attributes.length ? ` (${r.attributes.slice(0, 2).join(', ')})` : ''));
  put('performer', unique(players).slice(0, 8).join(' / '));
  if (Number(recording?.length) > 0) put('length', clock(recording.length / 1000));
  return out;
}

function createTrackInfo({root, fetch: fetchImpl = globalThis.fetch, now = () => Date.now(), readTags = async () => null,
  neteaseIdFor = async () => null, timeoutMs = DEFAULTS.timeoutMs, missDays = DEFAULTS.missDays, retryMinutes = DEFAULTS.retryMinutes,
  spacingMs = DEFAULTS.spacingMs, userAgent = DEFAULTS.userAgent, wait = ms => new Promise(r => setTimeout(r, ms))} = {}) {
  if (!root || !path.isAbsolute(root)) throw Error('track-info-root-invalid');
  const inFlight = new Map(), failedAt = new Map(), searched = new Map();
  let blockedUntil = 0, queue = Promise.resolve(), lastAt = 0;
  const counts = {network: 0};

  const keyOf = q => crypto.createHash('sha1').update(['v1', core.normalize(q.title), core.normalize(q.artist), albumKey(q.album), q.duration].join('|')).digest('hex');
  const fileOf = key => path.join(root, key + '.json');
  async function readJson(file) { try { const v = JSON.parse(await fs.readFile(file, 'utf8')); return v && typeof v === 'object' ? v : null; } catch (_) { return null; } }
  async function writeJson(file, value) {
    await fs.mkdir(path.dirname(file), {recursive: true});
    const temp = file + '.' + crypto.randomUUID() + '.tmp';
    await fs.writeFile(temp, JSON.stringify(value));
    await fs.rename(temp, file);
  }
  const choiceFile = trackId => path.join(root, 'choices', crypto.createHash('sha1').update(String(trackId)).digest('hex') + '.json');
  const readChoice = trackId => readJson(choiceFile(trackId));
  async function writeChoice(trackId, value) {
    inFlight.delete(String(trackId));
    if (!value) { await fs.rm(choiceFile(trackId), {force: true}); return; }
    await writeJson(choiceFile(trackId), {schemaVersion: 1, trackId: String(trackId), ...value});
  }
  async function readInfoFile(file) {
    try { const items = parseInfoText(await fs.readFile(file, 'utf8')); return items.length ? items : null; } catch (_) { return null; }
  }
  async function sideFile(filePath) {
    if (!filePath) return null;
    const parsed = path.parse(filePath);
    let names; try { names = await fs.readdir(parsed.dir); } catch (_) { return null; }
    const want = (parsed.name + '.info.txt').toLowerCase();
    const name = names.find(item => item.toLowerCase() === want);
    return name ? path.join(parsed.dir, name) : null;
  }

  // One request at a time, SPACING_MS apart (MusicBrainz: one a second per address); a 503 / 429 stops all for a while.
  function request(url, agent = userAgent) {
    const job = queue.then(async () => {
      if (now() < blockedUntil) return {error: 'rate-limited'};
      const gap = lastAt + spacingMs - now();
      if (gap > 0) await wait(gap);
      lastAt = now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      counts.network++;
      try {
        const response = await fetchImpl(url, {headers: {'User-Agent': agent, Accept: 'application/json'}, signal: controller.signal});
        if (response.status === 404) return {miss: true};
        // MusicBrainz sheds its search under load with a 503 and a Retry-After (often 1 s): wait that long (1 s to
        // 10 min), BLOCK_SECONDS when it gives none.
        if (response.status === 503 || response.status === 429) {
          const after = Number(response.headers?.get?.('retry-after'));
          blockedUntil = now() + Math.min(600, Math.max(1, Number.isFinite(after) && after > 0 ? after : DEFAULTS.blockSeconds)) * 1000;
          return {error: 'rate-limited'};
        }
        if (!response.ok) return {error: `http-${response.status}`};
        return {body: await response.json()};
      } catch (error) {
        return {error: error?.name === 'AbortError' ? 'timeout' : 'network'};
      } finally { clearTimeout(timer); }
    });
    queue = job.catch(() => {});
    return job;
  }
  const lucene = value => '"' + String(value).replace(/[\\"]/g, ' ').trim() + '"';
  // Every (recording, release) pair MusicBrainz offers that is this song: same title, an artist in common, the length
  // within tolerance when both are known. Releases whose title is the album asked about come first, then the earliest
  // official one.
  async function pairs(q) {
    const params = new URLSearchParams({query: `recording:${lucene(q.title)} AND artist:${lucene(q.artist)}`, fmt: 'json', limit: '25'});
    const result = await request(`${MB}/recording?${params}`);
    if (!result.body) return result.miss ? {rows: []} : result;
    const rows = [];
    for (const recording of result.body.recordings || []) {
      const seconds = Number(recording.length) > 0 ? recording.length / 1000 : 0;
      const got = {title: recording.title, artist: credit(recording['artist-credit']), duration: seconds};
      if (!core.sameTitle(q.title, got.title) || !core.artistsMatch(q.artist, got.artist)) continue;
      if (q.duration > 0 && seconds > 0 && Math.abs(q.duration - seconds) > core.MATCH.durationSeconds) continue;
      // Bootlegs, promotions and the like are left out (a release without a status is kept).
      for (const release of recording.releases?.length ? recording.releases : [{}]) {
        if (release.status && release.status !== 'Official') continue;
        rows.push({recording, release: release.id ? release : null, seconds});
      }
    }
    const official = row => (row.release?.status || 'Official') === 'Official' ? 0 : 1;
    const albumMatch = row => q.album && row.release && albumKey(row.release.title) === albumKey(q.album) ? 0 : 1;
    const date = row => row.release?.date || '9999';
    rows.sort((a, b) => albumMatch(a) - albumMatch(b) || official(a) - official(b) || date(a).localeCompare(date(b)));
    return {rows};
  }
  // The details of one pair: the recording with its people and works, the release with its label and track list.
  async function details(recordingId, releaseId) {
    const rec = await request(`${MB}/recording/${encodeURIComponent(recordingId)}?${new URLSearchParams({inc: 'artist-credits+genres+artist-rels+work-rels+work-level-rels', fmt: 'json'})}`);
    if (!rec.body) return rec.error ? rec : {miss: true};
    let release = null;
    if (releaseId) {
      const rel = await request(`${MB}/release/${encodeURIComponent(releaseId)}?${new URLSearchParams({inc: 'labels+artist-credits+recordings+genres', fmt: 'json'})}`);
      if (rel.error) return rel;
      release = rel.body || null;
    }
    return {found: {ids: {recording: recordingId, release: releaseId || null}, fields: fromMusicBrainz(rec.body, release)}};
  }
  // NetEase: the song record of a lyrics choice bound to a NetEase song link (album and release date only).
  async function netease(trackId) {
    const id = await Promise.resolve().then(() => neteaseIdFor(trackId)).catch(() => null);
    if (!id || !/^[1-9]\d{0,15}$/.test(String(id))) return null;
    const result = await request(`${NETEASE_DETAIL}?${new URLSearchParams({id: String(id), ids: `[${id}]`})}`, NEUTRAL_AGENT);
    const song = result.body?.songs?.find(row => String(row.id) === String(id));
    if (!song) return null;
    const out = {};
    if (song.album?.name) out.album = song.album.name;
    const ms = Number(song.album?.publishTime);
    if (ms > 0) out.date = new Date(ms).toISOString().slice(0, 10);
    return Object.keys(out).length ? {id: String(id), fields: out} : null;
  }

  // Tags (and the library's names when a tag is missing) first; online values only where they have nothing.
  function merge(tags, library, online, from) {
    const items = [];
    for (const key of ORDER) {
      if (tags[key]) items.push({key, value: tags[key], from: 'tags'});
      else if (library[key]) items.push({key, value: library[key], from: 'library'});
      else if (online?.[key]) items.push({key, value: online[key], from: from[key] || 'musicbrainz'});
    }
    return items;
  }

  async function find(track, {force = false} = {}) {
    const choice = await readChoice(track?.id);
    if (choice?.hidden) return {ok: false, reason: 'hidden', hidden: true};
    if (choice?.file?.path) {
      const items = await readInfoFile(choice.file.path);
      return items ? {ok: true, source: {kind: 'chosen-file', file: path.basename(choice.file.path)}, items}
        : {ok: false, reason: 'chosen-file-missing', file: path.basename(choice.file.path)};
    }
    const side = await sideFile(track?.filePath);
    if (side) { const items = await readInfoFile(side); if (items) return {ok: true, source: {kind: 'local', file: path.basename(side)}, items}; }
    const tags = fromTags(await Promise.resolve().then(() => readTags(track?.filePath)).catch(() => null));
    const q = core.query(track);
    const library = {};
    if (q) { library.title = q.title; library.artist = q.artist; if (q.album) library.album = q.album; }
    if (Number(track?.duration) > 0) library.length = clock(track.duration);
    if (track?.number) library.track = String(track.number);
    const offline = reason => {
      const items = merge(tags, library, null, {});
      return items.length ? {ok: true, source: {kind: 'tags', online: reason}, items} : {ok: false, reason};
    };
    // A pair the user chose (换一份) is fetched once and kept in the choice.
    if (choice?.musicbrainz?.fields) {
      return {ok: true, source: {kind: 'musicbrainz', chosen: true, ids: choice.musicbrainz.ids}, items: merge(tags, library, choice.musicbrainz.fields, {})};
    }
    if (!q) return offline('no-names');
    const key = keyOf(q);
    const cached = force ? null : await readJson(fileOf(key));
    let entry = cached;
    if (!(cached?.found || (cached?.miss && now() - cached.at < missDays * 86400000))) {
      if (now() < blockedUntil) return offline('rate-limited');
      if (!force && failedAt.has(key) && now() - failedAt.get(key) < retryMinutes * 60000) return offline('waiting');
      const found = await pairs(q);
      if (found.error) { if (found.error !== 'rate-limited') failedAt.set(key, now()); return offline(found.error); }
      const best = found.rows[0];
      const answer = best ? await details(best.recording.id, best.release?.id) : {miss: true};
      if (answer.error) { if (answer.error !== 'rate-limited') failedAt.set(key, now()); return offline(answer.error); }
      failedAt.delete(key);
      entry = answer.found ? {schemaVersion: 1, at: now(), asked: q, found: answer.found} : {schemaVersion: 1, at: now(), asked: q, miss: true};
      await writeJson(fileOf(key), entry);
    }
    let online = entry.found ? {...entry.found.fields} : null;
    const ids = entry.found ? {...entry.found.ids} : {}, from = {};
    // NetEase fills album / date only when MusicBrainz has none and the song's lyrics are bound to a NetEase song; asked
    // once per NetEase song and kept in the same cache entry (a miss too).
    if (!online?.album || !online?.date) {
      const neteaseId = await Promise.resolve().then(() => neteaseIdFor(track.id)).catch(() => null);
      if (neteaseId) {
        let kept = entry.netease?.id === String(neteaseId) ? entry.netease : null;
        if (!kept) { const got = await netease(track.id); kept = {id: String(neteaseId), fields: got?.fields || null}; entry = {...entry, netease: kept}; await writeJson(fileOf(key), entry); }
        if (kept.fields) { online = {...(online || {})}; ids.netease = kept.id; for (const [k, v] of Object.entries(kept.fields)) if (!online[k]) { online[k] = v; from[k] = 'netease'; } }
      }
    }
    if (!online) return offline('none');
    return {ok: true, source: {kind: ids.recording ? 'musicbrainz' : 'netease', ids, cached: Boolean(cached?.found)}, items: merge(tags, library, online, from)};
  }

  function get(track, options) {
    const id = String(track?.id || '');
    if (inFlight.has(id)) return inFlight.get(id);
    const job = find(track, options).finally(() => { if (inFlight.get(id) === job) inFlight.delete(id); });
    inFlight.set(id, job);
    return job;
  }
  // 重新查找: the user's chosen pair or file is dropped (a hidden song stays hidden), the cache ignored.
  async function refresh(track) {
    const choice = await readChoice(track?.id);
    if (choice && !choice.hidden) await writeChoice(track.id, null);
    inFlight.delete(String(track?.id));
    return get(track, {force: true});
  }
  // 换一份: every (recording, release) pair that is this song, the release named; one is chosen and fetched in full.
  async function candidates(track) {
    const q = core.query(track);
    if (!q) return {ok: false, reason: 'no-names'};
    const found = await pairs(q);
    if (found.error) return {ok: false, reason: found.error};
    const list = found.rows.slice(0, 8);
    searched.set(String(track.id), new Map(list.map(row => [`${row.recording.id}:${row.release?.id || ''}`, row])));
    return {ok: true, candidates: list.map(row => ({id: `${row.recording.id}:${row.release?.id || ''}`, title: row.recording.title,
      artist: credit(row.recording['artist-credit']), album: row.release?.title || '', date: row.release?.date || '',
      country: row.release?.country || '', duration: Math.round(row.seconds)}))};
  }
  async function choose(track, id) {
    const row = searched.get(String(track?.id))?.get(String(id));
    if (!row) return {ok: false, reason: 'not-offered'};
    const answer = await details(row.recording.id, row.release?.id);
    if (!answer.found) return {ok: false, reason: answer.error || 'none'};
    await writeChoice(track.id, {musicbrainz: answer.found});
    return {ok: true};
  }
  async function chooseFile(track, file) {
    if (!file || !path.isAbsolute(file) || !/\.txt$/i.test(file)) return {ok: false, reason: 'not-txt'};
    if (!(await readInfoFile(file))) return {ok: false, reason: 'no-items'};
    await writeChoice(track.id, {file: {path: file}});
    return {ok: true};
  }
  async function hide(track, hidden) {
    const choice = await readChoice(track?.id);
    if (hidden) await writeChoice(track.id, {...(choice || {}), hidden: true});
    else if (choice) { const {hidden: _, schemaVersion: __, trackId: ___, ...rest} = choice; await writeChoice(track.id, Object.keys(rest).length ? rest : null); }
    return {ok: true, hidden: Boolean(hidden)};
  }
  return {get, refresh, candidates, choose, chooseFile, hide, counts: () => ({...counts, blockedUntil})};
}

// The score's track sheet (model.track.facts, the radar's teleprinter: name on the upper row, value below, in order):
// a short English name per item; items a hand-written file names itself keep that name.
const FACT_NAMES = {title: 'Title', artist: 'Artist', album: 'Album', albumArtist: 'Album artist', date: 'Released', track: 'Track',
  disc: 'Disc', label: 'Label', country: 'Country', genre: 'Genre', composer: 'Composer', lyricist: 'Lyrics', arranger: 'Arranger',
  producer: 'Producer', performer: 'Performers', length: 'Length'};
const factsOf = items => (Array.isArray(items) ? items : []).filter(i => i && String(i.value || '').trim())
  .map(i => ({name: FACT_NAMES[i.key] || String(i.key), value: String(i.value).trim()})).slice(0, 40);

module.exports = {factsOf, FACT_NAMES, createTrackInfo, rootFor, parseInfoText, fromTags, fromMusicBrainz, agentFor, DEFAULTS, ORDER, NAMES, MB, CONTACT, NEUTRAL_AGENT};
