'use strict';
// Section names, made in one place. A structure engine's raw segments (start, end, label) go in;
// the sections a person sees come out. XLD's comparison bar and timeline, the bridge manifest it
// writes for XML, the score view's adapter and XML's section signals all read this module, so one
// song shows the same names everywhere. Nothing here reads files or needs Electron.
//
// For engines whose labels mean something (SongFormer), the rules, in order:
//   1. holes between two segments are closed by letting the earlier one run on; silence stays a gap.
//   2. position: an intro after the first core section is an interlude (after the last one, an outro);
//      an outro before the last core section is an interlude; an interlude before the first core
//      section belongs to the intro. A core section is any section that is not intro / interlude /
//      outro / silence. A song with no core section at all (all intro / inst / outro) uses its
//      interludes as the core, so only a leading intro and a trailing outro keep those names.
//   3. a non-silent section shorter than `shortSeconds` joins a touching neighbour (one with the
//      same name first, else the longer one) instead of standing alone or vanishing.
//   4. touching neighbours with the same name become one.
//   5. a name that occurs more than once is numbered from 1 in time order; once, it has no number.
// Labels the table does not know keep their own text and count as core sections.
//
// A row is `[start, end, name, engine, first raw label, raw labels]`: the first five as the score
// view's `sections` have always been; the sixth lists every raw label merged into the row, in time
// order. Colours follow the first raw label.
const TABLE = require('./section-names.cjs');

const EPSILON = 0.001;
const EDGE = new Set(['intro', 'interlude', 'outro']);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const round = value => Math.round(value * 1000) / 1000;
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function language(lang) {
  return String(lang || 'zh').toLowerCase().startsWith('en') ? 'en' : 'zh';
}

// Clip to the song, sort, close overlaps. Each row remembers which input segments it came from.
function cleaned(segments, duration) {
  const limit = finite(duration) && duration > 0 ? duration : Infinity;
  const sorted = (Array.isArray(segments) ? segments : [])
    .map((segment, index) => ({segment, index}))
    .filter(({segment}) => segment && finite(Number(segment.start)) && finite(Number(segment.end)))
    .sort((a, b) => Number(a.segment.start) - Number(b.segment.start) || a.index - b.index);
  const rows = [];
  for (const {segment, index} of sorted) {
    const start = Math.max(0, Number(segment.start)), end = Math.min(limit, Number(segment.end));
    if (rows.length && start < rows[rows.length - 1].end) rows[rows.length - 1].end = start;
    const raw = String(segment.label == null ? '' : segment.label).trim();
    rows.push({start, end, raw, parts: [{start, raw}], from: [index]});
  }
  return rows.filter(row => row.end > row.start);
}

function kindOf(raw) {
  const key = raw.toLowerCase();
  return hasOwn(TABLE.labels, key) ? TABLE.labels[key] : undefined;
}

// The rules for an engine whose labels mean something. Returns rows with `key` (kind, or the raw
// label when the table does not know it), silence already removed.
function tidyRows(segments, duration) {
  const rows = cleaned(segments, duration).map(row => {
    const kind = kindOf(row.raw);
    return {...row, silent: kind === null || row.raw === '', key: kind === undefined ? row.raw : kind};
  });
  // 1. holes
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].start - rows[i - 1].end > EPSILON && !rows[i - 1].silent) rows[i - 1].end = rows[i].start;
  }
  // 2. position
  const sounding = rows.filter(row => !row.silent);
  let core = sounding.filter(row => !EDGE.has(row.key));
  if (!core.length) core = sounding.filter(row => row.key === 'interlude');
  if (core.length) {
    const first = rows.indexOf(core[0]), last = rows.indexOf(core[core.length - 1]);
    rows.forEach((row, i) => {
      if (row.silent) return;
      if (row.key === 'intro' && i > first) row.key = i > last ? 'outro' : 'interlude';
      else if (row.key === 'outro' && i < last) row.key = i < first ? 'intro' : 'interlude';
      else if (row.key === 'interlude' && i < first) row.key = 'intro';
    });
  }
  const touching = (a, b) => a && b && !a.silent && !b.silent && Math.abs(a.end - b.start) <= EPSILON;
  const absorb = (into, row) => {
    into.start = Math.min(into.start, row.start);
    into.end = Math.max(into.end, row.end);
    into.parts = into.parts.concat(row.parts).sort((a, b) => a.start - b.start);
    into.from = into.from.concat(row.from);
  };
  // 3. short pieces
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row.silent || row.end - row.start >= TABLE.shortSeconds) continue;
      const prev = touching(rows[i - 1], row) ? rows[i - 1] : null;
      const next = touching(row, rows[i + 1]) ? rows[i + 1] : null;
      let into = null;
      if (prev && prev.key === row.key) into = prev;
      else if (next && next.key === row.key) into = next;
      else if (prev && next) into = prev.end - prev.start >= next.end - next.start ? prev : next;
      else into = prev || next;
      if (!into) continue;
      absorb(into, row);
      rows.splice(i, 1);
      changed = true;
      break;
    }
  }
  // 4. same neighbours
  const merged = [];
  for (const row of rows) {
    const last = merged[merged.length - 1];
    if (touching(last, row) && last.key === row.key) absorb(last, row);
    else merged.push(row);
  }
  return merged.filter(row => !row.silent);
}

function displayName(key, lang) {
  return hasOwn(TABLE.kinds, key) ? TABLE.kinds[key][lang] : key;
}

// 5. numbering, then the row shape.
function numbered(rows, engine, lang) {
  const names = rows.map(row => displayName(row.key, lang));
  const total = new Map(), seen = new Map();
  for (const name of names) total.set(name, (total.get(name) || 0) + 1);
  return rows.map((row, i) => {
    let name = names[i];
    if (total.get(name) > 1) {
      seen.set(name, (seen.get(name) || 0) + 1);
      name = `${name} ${seen.get(name)}`;
    }
    const raws = row.parts.map(part => part.raw);
    return Object.assign([round(row.start), round(row.end), name, engine, raws[0], raws], {from: row.from});
  });
}

/**
 * An engine's segments as section rows `[start, end, name, engine, first raw label, raw labels]`.
 * options: {engine, duration, lang: 'zh' | 'en'}. An engine that only clusters keeps its
 * letters, unnumbered, as `[start, end, letter, engine, letter]`.
 */
function tidySections(segments, options = {}) {
  const engine = String(options.engine || '');
  const lang = language(options.lang);
  if (!TABLE.semantic.includes(engine)) {
    return cleaned(segments, Number(options.duration))
      .filter(row => row.raw)
      .map(row => [round(row.start), round(row.end), row.raw, engine, row.raw]);
  }
  return numbered(tidyRows(segments, Number(options.duration)), engine, lang).map(row => row.slice());
}

/** The name each input segment ends up under (in input order); `null` for silence and for
 *  segments that are not sections. For engines that only cluster, the label itself. */
function nameSegments(segments, options = {}) {
  const engine = String(options.engine || '');
  const list = Array.isArray(segments) ? segments : [];
  const names = list.map(() => null);
  if (!TABLE.semantic.includes(engine)) {
    for (const row of cleaned(list, Number(options.duration))) if (row.raw) names[row.from[0]] = row.raw;
    return names;
  }
  for (const row of numbered(tidyRows(list, Number(options.duration)), engine, language(options.lang))) {
    for (const index of row.from) names[index] = row[2];
  }
  return names;
}

// XLD's colour tables (app.js hashColor, timeline-controls.js segmentColor) are keyed by raw
// labels. A tidied section is coloured by its name instead: every 「间奏」 the same colour, a
// short piece merged in or a renamed intro no longer brings its own. The kind's usual raw label
// is the key; a name the table does not know is its own key, without its number.
const COLOUR_LABEL = Object.freeze({intro: 'intro', verse: 'verse', prechorus: 'pre-chorus', chorus: 'chorus', interlude: 'inst', bridge: 'bridge', outro: 'outro'});
function colourLabel(name) {
  const kind = kindOfName(name);
  return kind ? COLOUR_LABEL[kind] : String(name == null ? '' : name).trim().replace(/\s+\d+$/, '');
}

/** A result as XLD's own screens show it: `sections` holds the tidied rows with both languages'
 *  names, so the renderer can follow the interface language, and `colour`, the label XLD's colour
 *  tables are looked up by (one colour per name). Raw `segments` stay untouched. */
function withSections(result, duration) {
  if (!result || !Array.isArray(result.segments) || !result.engine) return result;
  const engine = String(result.engine.id || result.engine);
  if (!TABLE.semantic.includes(engine)) return result;
  const span = Number(result.duration) || Number(duration) || Math.max(0, ...result.segments.map(s => Number(s.end) || 0));
  const zh = tidySections(result.segments, {engine, duration: span, lang: 'zh'});
  const en = tidySections(result.segments, {engine, duration: span, lang: 'en'});
  return {...result, sections: zh.map((row, i) => ({start: row[0], end: row[1], name: {zh: row[2], en: en[i][2]}, label: row[4], labels: row[5], colour: colourLabel(row[2])}))};
}

/** The bridge manifest's segments for one result: the original fields, plus `name` (Chinese) for
 *  engines whose labels mean something. Silence gets no `name`. */
function bridgeSegments(result, duration) {
  const segments = Array.isArray(result && result.segments) ? result.segments : [];
  const engine = String(result && result.engine && (result.engine.id || result.engine) || '');
  const base = segments.map(segment => ({
    start: Number(segment.start) || 0,
    end: Number(segment.end) || 0,
    label: String(segment.label ?? '?'),
    confidence: Number.isFinite(Number(segment.confidence)) ? Number(segment.confidence) : null
  }));
  if (!TABLE.semantic.includes(engine)) return base;
  const names = nameSegments(segments, {engine, duration});
  return base.map((segment, i) => names[i] ? {...segment, name: names[i]} : segment);
}

/** A bridge manifest whose section segments all carry `name`: segments written before the field existed
 *  get it here, in memory (a copy; the object passed in is not changed and nothing is written). A manifest
 *  that already has every name comes back as it is. */
function namedManifest(manifest) {
  if (!manifest || !Array.isArray(manifest.analyses)) return manifest;
  const duration = Number(manifest.timing && manifest.timing.duration);
  let changed = false;
  const analyses = manifest.analyses.map(result => {
    const engine = String(result && result.engine && (result.engine.id || result.engine) || '');
    if (!TABLE.semantic.includes(engine) || !Array.isArray(result.segments)) return result;
    const silent = segment => kindOf(String(segment.label == null ? '' : segment.label).trim()) === null;
    if (result.segments.every(segment => segment.name || silent(segment))) return result;
    changed = true;
    const names = nameSegments(result.segments, {engine, duration: Number(result.duration) || duration});
    return {...result, segments: result.segments.map((segment, i) => names[i] && !segment.name ? {...segment, name: names[i]} : segment)};
  });
  return changed ? {...manifest, analyses} : manifest;
}

/** The kind behind a shown name (`主歌 2`, `Verse 2`) or a raw label; `null` when unknown. */
function kindOfName(text) {
  const value = String(text == null ? '' : text).trim().replace(/\s+\d+$/, '');
  for (const [kind, names] of Object.entries(TABLE.kinds)) if (names.zh === value || names.en.toLowerCase() === value.toLowerCase()) return kind;
  const kind = kindOf(value);
  return kind === undefined ? null : kind;
}

module.exports = Object.freeze({tidySections, nameSegments, withSections, bridgeSegments, namedManifest, kindOfName, colourLabel, TABLE});
