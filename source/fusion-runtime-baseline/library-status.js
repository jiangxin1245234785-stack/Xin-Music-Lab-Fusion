// SPEC-B3, items 1 and 2: what a library track has, in one plain word, and the start page's
// "recently played" record. Pure functions; the renderer (fusion.js) and the tests both use them.
//
// A track's status, from the fields the library scan gives each track (desktop/main.cjs):
//   'score'    可看谱面  XLD has written notes for it, so the 谱面 scene can show it   (green)
//   'stems'    只有分轨  XLD separated it, but no notes yet                            (grey)
//   'sections' 只有段落  XLD found sections (or only chords: 只有和弦), no stems         (grey)
//   'none'     还没分析  nothing from XLD                                              (grey)
// The score lays bar lines and loudness over the notes itself (第二批「准备谱面」), so notes are what
// decide "可看谱面"; whether those layers are current is the score scene's business, not the row's.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XinLibraryStatus = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const WORDS = Object.freeze({
    score: ['library.status.score', '可看谱面'],
    stems: ['library.status.stems', '只有分轨'],
    sections: ['library.status.sections', '只有段落'],
    chords: ['library.status.chords', '只有和弦'],
    none: ['library.status.none', '还没分析']
  });
  const HINTS = Object.freeze({
    score: ['library.statusHint.score', '在 XLD 里分析过，谱面能看'],
    stems: ['library.statusHint.stems', '在 XLD 里分过轨，还没扒出音符，谱面暂时是空的'],
    sections: ['library.statusHint.sections', '在 XLD 里只分析了段落或和弦，还没分轨'],
    chords: ['library.statusHint.sections', '在 XLD 里只分析了段落或和弦，还没分轨'],
    none: ['library.statusHint.none', '还没在 XLD 里分析过']
  });

  function statusOf(track) {
    const t = track || {};
    if (t.hasNotes) return 'score';
    if (t.hasStems) return 'stems';
    if (t.hasStructure || t.hasHarmony) return 'sections';
    return 'none';
  }
  // The word key + fallback. 'sections' says 只有和弦 when there are chords but no sections.
  function wordOf(track) {
    const kind = statusOf(track);
    if (kind === 'sections' && !(track && track.hasStructure)) return WORDS.chords;
    return WORDS[kind];
  }
  function hintOf(track) { return HINTS[statusOf(track)]; }
  // Ready = the one green state; everything else is grey.
  function isReady(track) { return statusOf(track) === 'score'; }

  // --- the start page's "recently played" record --------------------------------------------
  // Kept in XML's own local storage: only the track id and when it was played, newest first, one entry
  // per track, at most LIMIT entries. Never the analysis root.
  const RECENT_KEY = 'xins-fusion-recent-tracks';
  const RECENT_LIMIT = 12;
  function readRecent(text) {
    let list;
    try { list = JSON.parse(text || '[]'); } catch (_) { return []; }
    if (!Array.isArray(list)) return [];
    const seen = new Set(), out = [];
    for (const item of list) {
      const id = item && typeof item.id === 'string' ? item.id : '';
      const at = item && Number(item.at);
      if (!id || !Number.isFinite(at) || seen.has(id)) continue;
      seen.add(id);
      out.push({id, at});
      if (out.length >= RECENT_LIMIT * 2) break;
    }
    return out;
  }
  // The list after `id` was played at `at`: it moves to the front, the oldest falls off past the limit.
  // B3 acceptance L4: `isKnown(id)` says whether a song is in the library now. Songs that are not (another
  // folder, a file changed or gone) keep their own RECENT_LIMIT places, so they never take the places of
  // songs in this library, and come back if that folder is chosen again. Without `isKnown`, one list.
  function addRecent(list, id, at, isKnown) {
    const key = String(id || '');
    const clean = readStored(list);
    const next = key ? [{id: key, at: Number(at) || 0}, ...clean.filter(item => item.id !== key)] : clean;
    if (typeof isKnown !== 'function') return next.slice(0, RECENT_LIMIT);
    let live = 0, away = 0;
    return next.filter(item => (isKnown(item.id) ? ++live <= RECENT_LIMIT : ++away <= RECENT_LIMIT));
  }
  function readStored(list) {
    const seen = new Set(), out = [];
    for (const item of Array.isArray(list) ? list : []) {
      const id = item && typeof item.id === 'string' ? item.id : '';
      const at = item && Number(item.at);
      if (!id || !Number.isFinite(at) || seen.has(id)) continue;
      seen.add(id); out.push({id, at});
      if (out.length >= RECENT_LIMIT * 2) break;
    }
    return out;
  }
  // Recent ids that are still in the library, as library tracks, newest first, at most `count`.
  function recentTracks(list, library, count) {
    const byId = new Map((Array.isArray(library) ? library : []).map(track => [track.id, track]));
    // Records of songs not in this library are skipped, so they take none of the `count` places shown.
    return readStored(list).map(item => byId.get(item.id)).filter(Boolean).slice(0, count);
  }

  return Object.freeze({statusOf, wordOf, hintOf, isReady, WORDS, HINTS, RECENT_KEY, RECENT_LIMIT, readRecent, addRecent, recentTracks});
});
