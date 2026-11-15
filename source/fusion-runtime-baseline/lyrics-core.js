/* Lyrics for the score (B6, 2026-11-15): reading LRC text, finding the line sung at a time, and deciding whether a
   lyrics record found online is the song we asked about. No I/O here; used by desktop/lyrics.cjs (main process) and
   score-lyrics.js (page). */
(function (root) {
  'use strict';

  // --- LRC ------------------------------------------------------------------------------------------------
  // Time tags: [mm:ss], [mm:ss.x], [mm:ss.xx], [mm:ss.xxx], [mm:ss:xx]; several on one line ([00:12.00][01:30.00]text)
  // give the same words at each time. [offset:±ms] moves every line (positive = earlier, as the format says).
  // Other [key:value] tags (ar, ti, al, by, length…) are ignored. A tag with nothing after it is an empty line: it
  // ends the line before it. Two lines at the same time: the first is the words, the next one their translation.
  const TIME = /^\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/;
  function parseLrc(text) {
    const raw = String(text == null ? '' : text).replace(/^﻿/, '');
    let offset = 0;
    const found = [];
    raw.split(/\r\n|\r|\n/).forEach((row, order) => {
      const meta = /^\s*\[offset:\s*([+-]?\d+)\s*\]\s*$/i.exec(row);
      if (meta) { offset = Number(meta[1]) / 1000; return; }
      const times = [];
      let rest = row.trimStart(), m;
      while ((m = TIME.exec(rest))) {
        const fraction = m[3] ? Number(m[3]) / 10 ** m[3].length : 0;
        if (Number(m[2]) < 60) times.push(Number(m[1]) * 60 + Number(m[2]) + fraction);
        rest = rest.slice(m[0].length);
      }
      if (!times.length) return;
      const words = rest.trim();
      for (const time of times) found.push({time, words, order});
    });
    found.sort((a, b) => a.time - b.time || a.order - b.order);
    const lines = [];
    for (const item of found) {
      const time = Math.max(0, Math.round((item.time - offset) * 1000) / 1000);
      const previous = lines[lines.length - 1];
      if (previous && Math.abs(previous.time - time) < 0.0005 && item.words && previous.text) {
        if (!previous.translation) previous.translation = item.words;
        continue;
      }
      lines.push({time, text: item.words});
    }
    return {lines, timed: lines.some(line => line.text)};
  }

  // The line being sung at `time`: the last one that has started; an empty line means nothing is sung. Also the
  // line before and the line after that have words, for the faint lines around it.
  function lineAt(lines, time) {
    let index = -1;
    let lo = 0, hi = lines.length - 1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (lines[mid].time <= time) { index = mid; lo = mid + 1; } else hi = mid - 1; }
    const now = index >= 0 && lines[index].text ? lines[index] : null;
    let before = null, after = null;
    for (let i = index - 1; i >= 0; i--) if (lines[i].text) { before = lines[i]; break; }
    for (let i = index + 1; i < lines.length; i++) if (lines[i].text) { after = lines[i]; break; }
    return {index, now, before, after};
  }

  // --- matching ---------------------------------------------------------------------------------------------
  // Names are compared after: full-width to half-width and compatibility forms (NFKC), lower case, anything in
  // brackets dropped ((Live), [Remastered 2011], 【…】, （…）), "feat. …" dropped, then only letters and digits kept.
  const MATCH = Object.freeze({durationSeconds: 3});
  function normalize(name) {
    return String(name == null ? '' : name).normalize('NFKC').toLowerCase()
      .replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}|【[^】]*】|〔[^〕]*〕/g, ' ')
      .replace(/\s(?:feat\.?|ft\.?|featuring)\s.*$/, ' ')
      .replace(/[^\p{L}\p{N}]+/gu, '');
  }
  const ARTIST_SPLIT = /\s*(?:,|&|、|\/|;|＆|\sx\s|\sand\s|\sfeat\.?\s|\sft\.?\s|\sfeaturing\s|\swith\s)\s*/i;
  function artistsMatch(a, b) {
    if (normalize(a) && normalize(a) === normalize(b)) return true;
    const left = new Set(String(a || '').normalize('NFKC').split(ARTIST_SPLIT).map(normalize).filter(Boolean));
    return String(b || '').normalize('NFKC').split(ARTIST_SPLIT).map(normalize).some(name => name && left.has(name));
  }
  // Whether a record found is the song asked about: the same title, an artist in common, and (when both are known)
  // durations at most MATCH.durationSeconds apart.
  function sameSong(want, got) {
    if (!want || !got) return false;
    const title = normalize(want.title);
    if (!title || title !== normalize(got.title)) return false;
    if (!artistsMatch(want.artist, got.artist)) return false;
    const a = Number(want.duration), b = Number(got.duration);
    if (a > 0 && b > 0 && Math.abs(a - b) > MATCH.durationSeconds) return false;
    return true;
  }

  // What is asked about a track. The library names songs from folders: a file in a folder without "Artist - Album"
  // gets 'Unknown Artist' and a title like "周杰伦 - 七里香"; then the artist is taken from the title and the album
  // (the folder's name) is not sent.
  const UNKNOWN = /^(unknown artist|未知歌手|未知艺术家)?$/i;
  function query(track) {
    let title = String(track?.title || '').trim(), artist = String(track?.artist || '').trim(), album = String(track?.album || '').trim();
    if (UNKNOWN.test(artist)) {
      const dash = /^(.+?)\s+[-–—]\s+(.+)$/.exec(title);
      if (!dash) return null;
      artist = dash[1].trim(); title = dash[2].trim(); album = '';
    }
    if (!title || !artist) return null;
    const duration = Number(track?.duration) > 0 ? Math.round(Number(track.duration)) : 0;
    return {title, artist, album, duration};
  }

  const api = {parseLrc, lineAt, normalize, artistsMatch, sameSong, query, MATCH};
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.XinLyricsCore = Object.freeze(api);
})(typeof self !== 'undefined' ? self : this);
