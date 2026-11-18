'use strict';

const core = require('../lyrics-core.js');
const SONG_HOSTS = new Set(['music.163.com', 'y.music.163.com']);
const SHORT_HOSTS = new Set(['163cn.tv', 'www.163cn.tv']);
const credit = /^(?:作[詞词曲]|填[詞词]|作詞者|作曲者|编曲|編曲|制作人|製作人|演唱|歌手|词曲|詞曲|词|曲|lyrics(?:\s+by)?|music\s+by|written\s+by|composed\s+by|arranged\s+by)\s*[:：]/i;
const timedWords = /^\s*(?:\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\])+\s*/;

function parseShare(input) {
  if (typeof input !== 'string' || input.length > 4096) return null;
  const text = input.trim().match(/https?:\/\/[^\s<>"'「」【】（）]+/iu)?.[0];
  if (!text) return null;
  try {
    const url = new URL(text.replace(/[。，、；,;)]+$/u, ''));
    if (url.username || url.password || url.port) return null;
    if (SHORT_HOSTS.has(url.hostname) && /^\/[a-z\d_-]{2,48}\/?$/i.test(url.pathname)) {
      return {short: 'https://' + url.hostname + url.pathname};
    }
    if (!SONG_HOSTS.has(url.hostname)) return null;
    const page = /^#\/?(?:m\/)?song(?:[/?]|$)/i.test(url.hash) ? new URL(url.hash.slice(1), url.origin) : url;
    const match = page.pathname.match(/^\/(?:m\/)?song(?:\/(\d+))?\/?$/i);
    const id = match && (match[1] || page.searchParams.get('id'));
    return id && /^[1-9]\d{0,15}$/.test(id) ? {id} : null;
  } catch (_) { return null; }
}

async function preview(track, input, fetch, {timeoutMs, userAgent}) {
  let link = parseShare(input);
  if (!link) return {ok:false, reason:'invalid-link'};
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  const options = {signal:abort.signal, redirect:'manual', headers:{'User-Agent':userAgent, Accept:'application/json'}};
  const status = response => response.status === 429 ? 'rate-limited' : response.status === 404 ? 'not-found' : 'network';
  try {
    for (let hops = 0; link.short && hops < 3; hops++) {
      const response = await fetch(link.short, options);
      const location = response.headers?.get('location');
      if (response.status === 429) return {ok:false, reason:'rate-limited'};
      if (response.status < 300 || response.status >= 400 || !location) return {ok:false, reason:'need-song-link'};
      // Only an official short URL is fetched. A regular song URL is reduced to its numeric ID.
      link = parseShare(new URL(location, link.short).href);
      if (!link) return {ok:false, reason:'need-song-link'};
    }
    if (!link.id) return {ok:false, reason:'need-song-link'};
    const detail = new URL('https://music.163.com/api/song/detail/');
    detail.search = new URLSearchParams({id:link.id, ids:'[' + link.id + ']'});
    const response = await fetch(detail.href, options);
    if (!response.ok) return {ok:false, reason:status(response)};
    const song = (await response.json()).songs?.find(row => String(row.id) === link.id);
    if (!song) return {ok:false, reason:'not-found'};
    const url = new URL('https://music.163.com/api/song/lyric');
    url.search = new URLSearchParams({id:link.id, lv:'1', tv:'1'});
    const lyricResponse = await fetch(url.href, options);
    if (!lyricResponse.ok) return {ok:false, reason:status(lyricResponse)};
    const body = await lyricResponse.json();
    if (body?.code && body.code !== 200) return {ok:false, reason:body.code===429 ? 'rate-limited' : 'network'};
    const raw = typeof body.lrc?.lyric === 'string' ? body.lrc.lyric : '';
    const lrc = raw.split(/\r?\n/).filter(row => {
      const words = row.replace(timedWords, '').trim();
      return !credit.test(words) && !/^(?:纯音乐[，,\s]*(?:请欣赏)?|純音樂[，,\s]*(?:請欣賞)?|instrumental)[。.!！]?$/iu.test(words);
    }).join('\n');
    const parsed = core.parseLrc(lrc);
    if (!parsed.timed || body.nolyric || body.uncollected) return {ok:false, reason:'no-timed-lyrics'};
    const artists = (song.artists || song.ar || []).map(a => a.name).filter(Boolean);
    const duration = (Number(song.duration || song.dt) || 0) / 1000;
    const title = String(song.name || ''), artist = artists.join(' · '), album = (song.album || song.al)?.name || '';
    const songSeconds = Number(track.duration) || 0;
    const difference = duration && songSeconds ? Math.abs(duration - songSeconds) : null;
    const local = core.query(track);
    const recordingMismatch = (difference !== null && difference > core.MATCH.durationSeconds) ||
      Boolean(local && (!core.sameTitle(local.title, title) || !artists.some(a => core.artistsMatch(local.artist, a)) ||
        !core.sameRelease(local, {title, album, artist:artists.join(' & ')})));
    const words = parsed.lines.filter(row => row.text);
    return {ok:true, lrc, originalLrc:lrc !== raw ? raw : undefined, songSeconds,
      candidate:{id:link.id, source:'netease', title, artist, album, duration, lines:words.length,
        firstLyricTime:words[0].time, durationDifference:difference, recordingMismatch}};
  } catch (error) { return {ok:false, reason:error?.name === 'AbortError' ? 'timeout' : 'network'}; }
  finally { clearTimeout(timer); }
}

module.exports = {parseShare, preview};
