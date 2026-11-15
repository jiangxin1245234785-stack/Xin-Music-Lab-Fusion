// The lane page (2026-11-14), the part that needs no window: the default pitch window of a part, the row-height
// limits and steps of vertical zoom, the pitch range a page draws, the list of problem notes a check left and the
// walk through them, note names, and the text of the pointer readout. timeline-controls.js owns the canvas and
// state; tests/lane-page.cjs runs this file in node.
(function(root){
  'use strict';
  // A default row is never thinner than 8 px or thicker than 28 px; zooming by hand goes from 6 to 40.
  const DEFAULT_ROW = Object.freeze({min: 8, max: 28});
  const ZOOM_ROW = Object.freeze({min: 6, max: 40});
  // Drum rows (one per kit piece played, a handful of them) may grow taller, so a kit fills the page too.
  const KEYS_ROW = Object.freeze({min: 8, max: 72});
  const WINDOW = Object.freeze({low: 0.02, high: 0.98, pad: 2});
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const BLACK = new Set([1, 3, 6, 8, 10]);
  const SILENT = 3;

  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const pitchName = pitch => NAMES[((Math.round(pitch) % 12) + 12) % 12] + (Math.floor(Math.round(pitch) / 12) - 1);
  const isBlack = pitch => BLACK.has(((Math.round(pitch) % 12) + 12) % 12);

  // Linear interpolation between order statistics (the usual "type 7" quantile).
  function quantile(sorted, q) {
    if (!sorted.length) return NaN;
    const at = clamp(q, 0, 1) * (sorted.length - 1), low = Math.floor(at), high = Math.ceil(at);
    return sorted[low] + (sorted[high] - sorted[low]) * (at - low);
  }

  // The pitches most of the part lives in: the 2nd to the 98th percentile, two semitones of air on each side.
  // A few stray notes far away no longer squeeze the whole part into a strip at the bottom of the screen.
  function pitchWindow(pitches, {low = WINDOW.low, high = WINDOW.high, pad = WINDOW.pad} = {}) {
    const sorted = (pitches || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return {low: 48, high: 72};
    const from = Math.floor(quantile(sorted, low)) - pad, to = Math.ceil(quantile(sorted, high)) + pad;
    return {low: clamp(from, 0, 127), high: clamp(Math.max(to, from), 0, 127)};
  }

  // The row height that fits `rows` rows into `avail` pixels, held to the default limits.
  function defaultRow(rows, avail, limits = DEFAULT_ROW) {
    if (!(rows > 0) || !(avail > 0)) return limits.max;
    return clamp(Math.floor(avail / rows), limits.min, limits.max);
  }
  const clampRow = (value, max = ZOOM_ROW.max) => clamp(Math.round(Number(value) || ZOOM_ROW.min), ZOOM_ROW.min, max);
  // One press of − / + : a quarter bigger or smaller, at least one pixel, inside the zoom limits (`max`: 40 for
  // semitone rows, KEYS_ROW.max for drum rows).
  function zoomStep(row, direction, max = ZOOM_ROW.max) {
    const value = Number(row) || DEFAULT_ROW.max;
    const next = direction > 0 ? Math.max(value + 1, Math.round(value * 1.25)) : Math.min(value - 1, Math.round(value / 1.25));
    return clampRow(next, max);
  }

  // The loudness strip. The envelope arrives on a dB scale (0 = `range` dB below full scale or quieter, 255 = full
  // scale); drawn that way a sustained part is one solid band. The strip is drawn in linear amplitude against the
  // loudest 10 ms of the stem instead, so a note dying away and the gap before the next one can be seen: the table
  // gives, for each stored value, the share of the strip's height (half as tall = 6 dB quieter).
  function waveScale(values, range = 60) {
    const table = new Float32Array(256);
    let top = 0;
    for (let i = 0; i < (values?.length || 0); i += 1) if (values[i] > top) top = values[i];
    if (!top) return table;
    for (let value = 1; value < 256; value += 1) table[value] = Math.min(1, 10 ** ((value - top) / 255 * range / 20));
    return table;
  }

  // The pitch range the page draws: every note of the part (outliers stay reachable by scrolling) plus the window,
  // padded out on both sides so the rows fill the screen when the part is narrow.
  function drawnRange({notesLow, notesHigh, window, row, avail}) {
    let low = Math.min(Number.isFinite(notesLow) ? notesLow - 2 : window.low, window.low);
    let high = Math.max(Number.isFinite(notesHigh) ? notesHigh + 2 : window.high, window.high);
    low = clamp(Math.floor(low), 0, 127); high = clamp(Math.ceil(high), 0, 127);
    const need = row > 0 && avail > 0 ? Math.ceil(avail / row) : 0;
    let missing = need - (high - low + 1);
    while (missing > 0 && (low > 0 || high < 127)) {
      if (high < 127) { high += 1; missing -= 1; }
      if (missing > 0 && low > 0) { low -= 1; missing -= 1; }
    }
    return {low, high, span: high - low + 1};
  }

  // Where to scroll so the window's top row is at the top of the screen (pitch rows run high to low).
  const windowTop = (range, window, row) => Math.max(0, (range.high - window.high) * row);

  // --- what a check said about a note --------------------------------------------------------------------------------
  // `evidence` is {verdicts, extend} indexed by note[5], as the timeline keeps it. Verdict 3 is silence, 1 and 2 are
  // weak evidence at the pitch (shown, never acted on), an `extend` entry means the pitch sounds past the written end.
  function verdictOf(note, evidence) {
    if (!evidence || !note) return null;
    const index = note[5], verdict = Array.isArray(evidence.verdicts) ? evidence.verdicts[index] : 0;
    const short = evidence.extend ? evidence.extend[index] !== undefined && evidence.extend[index] !== null : false;
    const out = [];
    if (verdict === SILENT) out.push('silent');
    else if (verdict === 1 || verdict === 2) out.push('weak');
    if (short) out.push('short');
    return out.length ? out : null;
  }

  // The notes worth jumping to: written in silence, or written short. Weak evidence is not a problem to fix.
  function issues(notes, evidence) {
    if (!evidence || !Array.isArray(notes)) return [];
    const out = [];
    for (const note of notes) {
      const found = verdictOf(note, evidence);
      if (!found) continue;
      const kinds = found.filter(kind => kind !== 'weak');
      if (kinds.length) out.push({start: note[0], end: note[1], pitch: note[2], index: note[5], instrument: note[4], kinds, note});
    }
    return out.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  }

  // The next / previous problem from `at` (-1 before the first jump), wrapping at both ends.
  function issueStep(count, at, direction) {
    if (!(count > 0)) return -1;
    if (!(at >= 0 && at < count)) return direction < 0 ? count - 1 : 0;
    return ((at + (direction < 0 ? -1 : 1)) % count + count) % count;
  }

  // The lane after / before `current` in the order shown, wrapping; null when there is nowhere else to go.
  function laneStep(ids, current, direction) {
    if (!Array.isArray(ids) || ids.length < 2) return null;
    const at = ids.indexOf(current);
    if (at < 0) return ids[0];
    return ids[((at + (direction < 0 ? -1 : 1)) % ids.length + ids.length) % ids.length];
  }

  const seconds = value => {
    const total = Math.max(0, Math.round((Number(value) || 0) * 1000));
    return Math.floor(total / 60000) + ':' + String(Math.floor(total % 60000 / 1000)).padStart(2, '0') + '.' + String(total % 1000).padStart(3, '0');
  };

  // The pointer readout: name, start, length, velocity and, after a check, what it found. `rt` names the parts.
  function readout(note, {rt, drumName = null, evidence = null} = {}) {
    if (!note) return '';
    const say = (key, params) => rt ? rt(key, params) : key;
    const name = drumName ? drumName + ' (' + note[2] + ')' : pitchName(note[2]);
    const parts = [name, say('runtime.lanePage.start', {value: seconds(note[0])}),
      say('runtime.lanePage.length', {value: (Math.max(0, note[1] - note[0])).toFixed(3)}),
      say('runtime.lanePage.velocity', {value: Math.round(note[3])})];
    for (const kind of verdictOf(note, evidence) || []) parts.push(say('runtime.lanePage.verdict.' + kind));
    return parts.join(' · ');
  }

  const api = {DEFAULT_ROW, ZOOM_ROW, KEYS_ROW, WINDOW, pitchName, isBlack, quantile, pitchWindow, defaultRow, clampRow, zoomStep, waveScale,
    drawnRange, windowTop, verdictOf, issues, issueStep, laneStep, seconds, readout};
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.XldLanePage = api;
})(globalThis);
