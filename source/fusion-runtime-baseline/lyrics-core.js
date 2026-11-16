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

  // --- one whole-song offset (B7, 2026-11-15) ------------------------------------------------------------------
  // Lyrics found online can be timed against another release of the song (a longer or shorter intro): every line is
  // then early or late by the same amount (measured on 七里香: 2.1 s early from start to end; two English songs within
  // 0.15 s). The vocal line's notes say when singing starts; the offset is the one shift that puts the most lyric lines
  // on a phrase start. Only one number per song, never a per-line warp, and only when the answer is clear.
  // Phrase starts: a sung note with at least `gap` seconds of no singing before it. Notes as the vocal line stores them
  // ([start, duration, pitch, velocity], score-vocals.json lane.notes) or as {start, end | duration}.
  function phraseStarts(notes, gap = 0.25) {
    const span = n => Array.isArray(n) ? {start: Number(n[0]), end: Number(n[0]) + (Number(n[1]) || 0)}
      : {start: Number(n?.start), end: Number.isFinite(Number(n?.end)) ? Number(n.end) : Number(n?.start) + (Number(n?.duration) || 0)};
    const sorted = (Array.isArray(notes) ? notes : []).map(span).filter(n => Number.isFinite(n.start)).sort((a, b) => a.start - b.start);
    const out = [];
    let lastEnd = -Infinity;
    for (const n of sorted) { if (n.start - lastEnd >= gap) out.push(n.start); lastEnd = Math.max(lastEnd, n.end); }
    return out;
  }
  // Shift s (seconds; positive = the singing comes after the line's time, i.e. the lyrics are early and must be shown
  // later) scored by how many timed lines have a phrase start in [t + s - early, t + s + late]. Scanned over +-range.
  const ALIGN = Object.freeze({range: 6, step: 0.02, early: 0.15, late: 0.3, minLines: 6, minShare: 0.3, clearOf: 0.6, margin: 1.4, still: 0.3, peakShare: 0.7, introSung: 0.5});
  function estimateOffset(lines, starts, options = {}) {
    const o = {...ALIGN, ...options};
    const times = (Array.isArray(lines) ? lines : []).filter(line => line && line.text).map(line => Number(line.time)).filter(Number.isFinite);
    const s = (Array.isArray(starts) ? starts : []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    const answer = {shift: 0, sure: false, hits: 0, atZero: 0, of: times.length, runnerUp: 0, why: null};
    if (times.length < o.minLines) return {...answer, why: 'too-few-lines'};
    if (s.length < o.minLines) return {...answer, why: 'too-few-phrases'};
    const hitsAt = shift => {
      let hits = 0;
      for (const t of times) {
        const lo = t + shift - o.early, hi = t + shift + o.late;
        let a = 0, b = s.length;                      // first start >= lo
        while (a < b) { const m = (a + b) >> 1; if (s[m] < lo) a = m + 1; else b = m; }
        if (a < s.length && s[a] <= hi) hits++;
      }
      return hits;
    };
    const steps = Math.round(o.range / o.step);
    const scored = [];
    for (let i = -steps; i <= steps; i++) { const shift = Math.round(i * o.step * 1000) / 1000; scored.push([shift, hitsAt(shift)]); }
    const top = Math.max(...scored.map(([, h]) => h));
    // The strong peaks (at least `peakShare` of the best, each more than clearOf from the others). A line often holds
    // two sung phrases (七里香: about 2.4 s apart), so its second phrase makes a second peak. The intro tells them
    // apart: no lyric line comes after singing has started, so a shift that would leave more than `introSung` seconds
    // of singing before the first line is not the one (options.notes: the vocal line's notes).
    const peaks = [];
    for (const [shift, h] of scored.slice().sort((a, b) => b[1] - a[1] || Math.abs(a[0]) - Math.abs(b[0]))) {
      if (h < o.peakShare * top) break;
      if (!peaks.some(p => Math.abs(p[0] - shift) <= o.clearOf)) peaks.push([shift, h]);
    }
    const spans = (Array.isArray(o.notes) ? o.notes : []).map(n => Array.isArray(n) ? [Number(n[0]), Number(n[0]) + (Number(n[1]) || 0)]
      : [Number(n?.start), Number.isFinite(Number(n?.end)) ? Number(n.end) : Number(n?.start) + (Number(n?.duration) || 0)]).filter(([a]) => Number.isFinite(a));
    const sungBefore = time => spans.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(b, time) - a), 0);
    const sungAfter = time => spans.reduce((sum, [a, b]) => sum + Math.max(0, b - Math.max(a, time)), 0);
    const firstLine = Math.min(...times), lastLine = Math.max(...times);
    // The same at the end: the last line lasts about as long as a typical line (the median gap between lines); singing
    // that goes on well past that means the lines were put too early.
    const gaps = times.slice().sort((a, b) => a - b).map((t, i, all) => (i ? t - all[i - 1] : null)).filter(g => g > 0).sort((a, b) => a - b);
    const lineLength = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
    // Singing outside the lyrics for a shift: before the first line, and after the last line has had its usual length.
    // It only chooses between peaks: a song can have singing the lyrics do not cover (an outro, ad libs), so when every
    // peak leaves some outside, the one that leaves the least is kept and judged like any other.
    const outsideSung = shift => sungBefore(firstLine + shift - o.early - o.late) + (lineLength > 0 ? sungAfter(lastLine + shift + lineLength + o.late) : 0);
    let ruledOut = spans.length ? peaks.filter(([shift]) => outsideSung(shift) > o.introSung) : [];
    if (ruledOut.length === peaks.length) {
      const least = peaks.slice().sort((a, b) => outsideSung(a[0]) - outsideSung(b[0]))[0];
      ruledOut = peaks.filter(p => p !== least && outsideSung(p[0]) > outsideSung(least[0]) + o.introSung);
    }
    const kept = peaks.filter(p => !ruledOut.includes(p));
    // The best of what is left; among equal counts, the middle of its plateau.
    const [near, hits] = kept[0];
    const run = scored.filter(([shift, h]) => h === hits && Math.abs(shift - near) <= o.clearOf).map(([shift]) => shift);
    const best = Math.round(((run[0] + run[run.length - 1]) / 2) * 100) / 100;
    const outside = shift => Math.abs(shift - best) > o.clearOf && !ruledOut.some(([r]) => Math.abs(shift - r) <= o.clearOf);
    const runnerUp = Math.max(0, ...scored.filter(([shift]) => outside(shift)).map(([, h]) => h));
    Object.assign(answer, {hits, atZero: hitsAt(0), runnerUp, ruledOut: ruledOut.map(([shift]) => shift)});
    if (hits < Math.max(o.minLines * 0.67, o.minShare * times.length)) return {...answer, why: 'weak'};
    if (hits < o.margin * runnerUp) return {...answer, why: 'unclear'};
    if (Math.abs(best) < o.still) return {...answer, sure: true, shift: 0, why: 'aligned'};
    if (hits < o.margin * Math.max(1, answer.atZero)) return {...answer, why: 'not-better-than-none'};
    return {...answer, sure: true, shift: best};
  }

  const api = {parseLrc, lineAt, normalize, artistsMatch, sameSong, query, MATCH, phraseStarts, estimateOffset, ALIGN};
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.XinLyricsCore = Object.freeze(api);
})(typeof self !== 'undefined' ? self : this);
