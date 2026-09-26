'use strict';
// A read-only inventory of stored section and chord results across the whole library, with enough measured in
// each row to tell a good segmentation from a bad one without opening the track.
//
// The measure that discriminates is FRAGMENTS — segments shorter than a couple of seconds. Measured over the
// owner's 132 stored section results, coverage sits between 93% and 100% for every engine and segment count
// barely separates them (msaf median 18, songformer 16), while fragments do: msaf median 2 and up to 12,
// songformer median 0 and never above 2. The decisive case is a result with only 7 segments — the cleanest in the
// library by count — whose shortest segment is 0.04s and which has 5 under two seconds. Counting boundaries says
// it is tidy; counting fragments says it is noise.
//
// Nothing here deletes. It produces the list a person judges from; core/result-delete.cjs does the deleting.
const fs = require('node:fs/promises');
const path = require('node:path');

// A "fragment" only means a defect for the kind it is measured on. A section boundary 0.04s from the previous
// one is noise; a chord that lasts half a second is a chord. Measured on the real library, chord results run
// 247-255 spans with 86-105 of them under two seconds and shortest spans around 0.5s — all perfectly healthy. One
// threshold for both would put every chord result above every noisy segmentation in a list sorted worst-first,
// which is the opposite of what the list is for.
const FRAGMENT_SECONDS = {section: 2, harmony: 0.25};
const fragmentSecondsFor = kind => FRAGMENT_SECONDS[kind] ?? 2;
const clean = value => (typeof value === 'string' && value ? value : null);

// Both kinds store an array of spans with start/end; chord results additionally carry a label and a confidence.
function measure(value, kind = 'section') {
  const fragmentSeconds = fragmentSecondsFor(kind);
  const spans = Array.isArray(value?.segments) ? value.segments : Array.isArray(value?.chords) ? value.chords : null;
  if (!spans) return null;
  const rows = spans
    .map(span => [Number(span.start), Number(span.end)])
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start);
  const lengths = rows.map(([start, end]) => end - start);
  const covered = lengths.reduce((total, length) => total + length, 0);
  const duration = Number(value?.duration) || (rows.length ? Math.max(...rows.map(([, end]) => end)) : 0);
  const confidences = spans.map(span => Number(span.confidence)).filter(Number.isFinite);
  return {
    segments: spans.length,
    measured: rows.length,
    shortest: lengths.length ? Math.min(...lengths) : null,
    longest: lengths.length ? Math.max(...lengths) : null,
    fragments: lengths.filter(length => length < fragmentSeconds).length,
    fragmentSeconds,
    duration: duration || null,
    coverage: duration > 0 ? Math.min(1, covered / duration) : null,
    meanConfidence: confidences.length ? confidences.reduce((total, value) => total + value, 0) / confidences.length : null,
    labels: spans.map(span => clean(span.label)).filter(Boolean).slice(0, 64),
    // What the row draws. Rounded and capped: this crosses IPC for every result in the library, and a bar is
    // there to be glanced at, not measured off.
    spans: rows.slice(0, 200).map(([start, end]) => [Math.round(start * 1000) / 1000, Math.round(end * 1000) / 1000])
  };
}

function createResultSweep({engineKinds}) {
  const kindOf = engine => engineKinds[engine] || null;
  // `tracks` is whatever the caller already has indexed: {trackId, title, album, directory}.
  async function scan(tracks, {engines = Object.keys(engineKinds)} = {}) {
    const rows = [];
    const warnings = [];
    for (const track of tracks) {
      let names;
      // A directory that cannot be listed is reported, never silently treated as "this track has nothing".
      try { names = new Set(await fs.readdir(track.directory)); }
      catch (error) { if (error.code !== 'ENOENT') warnings.push({trackId: track.trackId, error: error.message}); continue; }
      for (const engine of engines) {
        const kind = kindOf(engine);
        if (!kind) continue;
        const state = names.has(`${engine}.json`) ? 'complete'
          : names.has(`${engine}.error.json`) ? 'failed'
            : names.has(`${engine}.cancelled.json`) ? 'cancelled' : null;
        if (!state) continue;
        const file = path.join(track.directory, `${engine}.json`);
        const row = {trackId: track.trackId, title: track.title || track.trackId, album: track.album || '',
          engine, kind, state, bytes: 0, modifiedMs: null, unreadable: null};
        if (state === 'complete') {
          try {
            const stat = await fs.stat(file);
            row.bytes = stat.size;
            row.modifiedMs = stat.mtimeMs;
            const measured = measure(JSON.parse(await fs.readFile(file, 'utf8')), kind);
            // A result whose body cannot be measured is still listed and still deletable — being unreadable is a
            // reason to want it gone, not a reason to hide it.
            if (measured) Object.assign(row, measured); else row.unreadable = 'no-segments';
          } catch (error) { row.unreadable = error.message; }
        }
        rows.push(row);
      }
    }
    // Worst first: the reason the list exists is to find the bad ones.
    rows.sort((a, b) => (b.fragments || 0) - (a.fragments || 0)
      || (a.shortest ?? Infinity) - (b.shortest ?? Infinity)
      || String(a.title).localeCompare(String(b.title))
      || a.engine.localeCompare(b.engine));
    return {rows, warnings, fragmentSeconds: FRAGMENT_SECONDS};
  }
  return {scan, measure};
}

module.exports = {createResultSweep, measure, FRAGMENT_SECONDS, fragmentSecondsFor};
