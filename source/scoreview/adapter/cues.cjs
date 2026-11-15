'use strict';
// Listening cues: "object · event" marks, chosen by how strongly each change pulls the ear.
//
// work/score-cues-20261113/SPEC.md. Only JavaScript; tools/make_captions.py stays the twin of
// the old sentence rules alone.
//
// What pulls attention is change, not state; louder pulls more than softer, new more than
// repeated; the voice and the top melodic line are the foreground; drums and bass carry the
// groove; reading costs attention, so the number of marks is capped.
//
// score = change x foreground x novelty x weight   (x SECTION_BONUS on a section boundary)
//   change      how big the change is, in its own unit (dB for loudness, the jump in the mix
//               for a part coming or going, semitones above the voice's usual height for its top)
//   foreground  the part's share of the whole mix's power around the moment (levels), 1 for 全体
//   novelty     NOVELTY ^ (how many times the same part already did the same thing)
//   weight      voice / drums / bass weigh more than the other parts
// Below FLOOR nothing is said. At most PER_MINUTE marks a minute, none in the first QUIET
// seconds, one on screen at a time: where two would meet, the higher score stays.

const WORDS = Object.freeze({
  zh: {leave: '退出', first: '首现', back: '重进', rest: '休止', swell: '渐强', surge: '骤强', drop: '骤弱', peak: '最高点',
       only: '仅', lead: '主旋律', all: '全体', dot: ' · ', arrow: ' → '},
  en: {leave: 'Out', first: 'First', back: 'Back', rest: 'Rest', swell: 'Swell', surge: 'Surge', drop: 'Drop', peak: 'Peak',
       only: 'Only', lead: 'Lead', all: 'All', dot: ' · ', arrow: ' → '}
});
// Group names for the English screen; a group not listed keeps its own label.
const EN_NAMES = Object.freeze({vocals: 'Voice', guitar: 'Guitar', piano: 'Piano', strings: 'Strings', violin: 'Violin', bass: 'Bass', drums: 'Drums', other: 'Other'});
// Building up shows ~PREVIEW seconds ahead, dim; a surprise lights at its moment.
const FORESHADOWED = Object.freeze(['first', 'back', 'swell', 'lead', 'peak']);

const QUIET = 4;            // nothing in the song's first seconds
const PREVIEW = 2.0;        // a foreshadowed mark shows this long before its moment
const HOLD = 2.5;           // and every mark stays this long after it
const GAP = 1.0;            // two marks on screen are at least this far apart
const PER_MINUTE = 2.5;     // the cap on how many a song gets
const FLOOR = 0.5;          // below this a moment is left blank
const NOVELTY = 0.6;        // each repeat of the same thing by the same part is worth this much of the last
const WEIGHT = Object.freeze({vocals: 1.5, drums: 1.3, bass: 1.2, all: 1.0, other: 1.0});
const SECTION_BONUS = 1.15; // a real change that lands on a named section boundary
const BRIDGE = 4;           // seconds of silence inside a part that are not leaving
const ABSENT = 8;           // seconds a part must have been away for its start to be an entrance
const MIN_ONSETS = 3;       // a stretch with fewer note starts is not a part playing
const LEVEL_FLOOR = 30;     // dB under the loudest part at that moment: too quiet to count as playing
const PART_FLOOR = -70;     // dB (the levels layer's scale): under this a part is noise, however the others are
                            // doing — where every stem sits in the noise (七里香 0–16 s at −95…−100), none is "first"
const SURGE_DB = 5;         // the mix jumps up by this much within a second ...
const DROP_DB = 7;          // ... or down by this much (but not to silence)
const SWELL_DB = 6;         // a rise of this much over SWELL_SPAN seconds, steadily
const SWELL_SPAN = [3, 10];
const SWELL_STEP = 0.6;     // a swell climbs: no single second may carry more than this share of the whole rise
                            // (measured: MEGURI 7:30, a real swell, 0.51; 七里香 2:26 and MEGURI 2:38, one step each, 0.64 and 0.76)
                            // (a rise made in one step is a surge, said as one)
const REST_DB = 25;         // the mix falls this far under its usual level ...
const REST_SPAN = [0.25, 4];// ... for this long, with sound on both sides
const PEAK_HOLD = 0.25;     // the voice's top must be held this long to be its top, not a glitch
const LEAD_HOLD = 8;        // a lead line must have held this long before, and hold this long after
const LEAD_RANGE = 6;       // dB: parts this close to the loudest compete for the lead by height
const LEAD_ENTRY = 3;       // a lead that changes hands to a part entering this close by is that entrance, not a hand-off
const ONLY_BEFORE = 3;      // "only" counts the parts that were playing this long before the last one left
const SHARE_MIN = 0.03;   // a part under this share of the mix is not heard well enough to be named
const TAIL = 10;            // nothing in the last seconds before the song's sound ends

const round2 = value => Math.round(value * 100) / 100;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const power = db => Math.pow(10, db / 10);

function lang(value) { return String(value || 'zh').toLowerCase().startsWith('en') ? 'en' : 'zh'; }

// Each group's note starts and stretches of playing (short holes bridged), from the notes and hits.
function parts(model, hidden) {
  const byGroup = new Map();
  for (const lane of model.lanes) {
    if (!lane || typeof lane !== 'object' || lane.kind === 'texture') continue;
    const group = lane.group || String(lane.id || '').split('/')[0];
    if (!group || hidden.includes(group) || hidden.includes(lane.id)) continue;
    if (!byGroup.has(group)) byGroup.set(group, {group, label: lane.groupLabel || lane.label || group, spans: [], onsets: [], pitches: [], kind: lane.kind});
    const part = byGroup.get(group);
    if (lane.kind === 'melody') part.kind = 'melody';
    for (const item of lane.notes || []) {
      if (!Array.isArray(item) || !finite(item[0])) continue;
      part.spans.push([item[0], item[0] + Math.max(0.05, finite(item[1]) ? item[1] : 0.1)]);
      part.onsets.push(item[0]);
      if (finite(item[2])) part.pitches.push([item[0], item[0] + (finite(item[1]) ? item[1] : 0.1), item[2]]);
    }
    for (const hit of lane.hits || []) {
      if (!Array.isArray(hit) || !finite(hit[0])) continue;
      part.spans.push([hit[0], hit[0] + 0.15]);
      part.onsets.push(hit[0]);
    }
  }
  for (const part of byGroup.values()) {
    part.spans.sort((a, b) => a[0] - b[0]);
    part.onsets.sort((a, b) => a - b);
    const stretches = [];
    for (const [start, end] of part.spans) {
      const last = stretches[stretches.length - 1];
      if (last && start - last.end <= BRIDGE) { last.end = Math.max(last.end, end); last.onsets++; }
      else stretches.push({start, end, onsets: 1});
    }
    part.stretches = stretches;
  }
  return byGroup;
}

// The whole mix in dB on a 0.1 s grid (the `energy` layer), or null.
function mixOf(model) {
  const energy = model.energy;
  if (!energy || !(energy.hop > 0) || !Array.isArray(energy.db) || !energy.db.length) return null;
  const db = energy.db.map(value => finite(value) ? Math.max(-120, value) : -120);
  const sorted = db.filter(value => value > -119).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return {hop: energy.hop, db, usual: sorted[Math.floor(0.5 * (sorted.length - 1))]};
}
function mean(mix, from, to) {
  const a = Math.max(0, Math.floor(from / mix.hop)), b = Math.min(mix.db.length, Math.ceil(to / mix.hop));
  if (b <= a) return null;
  let total = 0;
  for (let i = a; i < b; i++) total += mix.db[i];
  return total / (b - a);
}

function silentIn(mix, from, to) {
  const a = Math.max(0, Math.floor(from / mix.hop)), b = Math.min(mix.db.length, Math.ceil(to / mix.hop));
  for (let i = a; i < b; i++) if (mix.db[i] < mix.usual - REST_DB) return true;
  return false;
}

// A group's share of the whole mix's power around a moment, from the `levels` layer.
function shareOf(model, group, from, to) {
  const levels = model.levels;
  if (!levels || !(levels.hop > 0) || !levels.groups || !Array.isArray(levels.groups[group])) return null;
  const a = Math.max(0, Math.floor(from / levels.hop)), b = Math.max(a + 1, Math.ceil(to / levels.hop));
  let mine = 0, all = 0;
  for (const [name, row] of Object.entries(levels.groups)) {
    if (!Array.isArray(row)) continue;
    for (let i = a; i < Math.min(b, row.length); i++) {
      if (!finite(row[i])) continue;
      all += power(row[i]);
      if (name === group) mine += power(row[i]);
    }
  }
  return all > 0 ? mine / all : null;
}
function loudest(model, from, to) {
  const levels = model.levels;
  if (!levels || !(levels.hop > 0) || !levels.groups) return null;
  const a = Math.max(0, Math.floor(from / levels.hop)), b = Math.max(a + 1, Math.ceil(to / levels.hop));
  const out = {};
  for (const [name, row] of Object.entries(levels.groups)) {
    if (!Array.isArray(row)) continue;
    let sum = 0, n = 0;
    for (let i = a; i < Math.min(b, row.length); i++) if (finite(row[i])) { sum += power(row[i]); n++; }
    if (n) out[name] = 10 * Math.log10(sum / n + 1e-12);
  }
  return out;
}
// Without the levels layer every part is taken as halfway to the front; without the energy layer every
// entrance or exit as an ordinary change (1), so a song with notes alone still gets its marks.
const UNKNOWN_FOREGROUND = 0.6, UNKNOWN_CHANGE = 1;
const foregroundOf = share => share === null ? UNKNOWN_FOREGROUND : 0.35 + 0.65 * Math.sqrt(share);

// --- the events ------------------------------------------------------------------------

// Parts coming in, going out, first heard, and one part left alone.
function partEvents(model, byGroup, duration, mix) {
  const found = [];
  const stretchesOk = [];
  for (const part of byGroup.values()) {
    for (const stretch of part.stretches) {
      if (stretch.onsets < MIN_ONSETS) continue;
      const level = loudest(model, stretch.start, Math.min(stretch.end, stretch.start + 8));
      if (level && finite(level[part.group])) {
        const top = Math.max(...Object.values(level));
        if (level[part.group] < top - LEVEL_FLOOR || level[part.group] < PART_FLOOR) continue;
      }
      stretchesOk.push({part, ...stretch});
    }
  }
  const byPart = new Map();
  for (const s of stretchesOk) { if (!byPart.has(s.part.group)) byPart.set(s.part.group, []); byPart.get(s.part.group).push(s); }
  for (const [group, list] of byPart) {
    list.sort((a, b) => a.start - b.start);
    list.forEach((stretch, i) => {
      const before = i ? list[i - 1].end : -Infinity;
      if (stretch.start - before >= ABSENT || i === 0) {
        const word = i === 0 ? 'first' : 'back';
        found.push({kind: word, object: group, at: stretch.start, partOf: stretch, label: stretch.part.label, away: i ? round2(stretch.start - before) : null});
      }
      const after = i + 1 < list.length ? list[i + 1].start : Infinity;
      if (after - stretch.end >= ABSENT && duration - stretch.end >= ABSENT) {
        found.push({kind: 'leave', object: group, at: stretch.end, partOf: stretch, label: stretch.part.label, silentFor: after === Infinity ? null : round2(after - stretch.end)});
      }
    });
  }
  // One part left alone: right after a part leaves, only one part plays on for a while, where three or more had.
  const playing = time => [...byPart].filter(([, list]) => list.some(s => s.start <= time && time < s.end)).map(([group]) => group);
  for (const event of found.filter(e => e.kind === 'leave')) {
    const now = playing(event.at + 0.5), before = playing(event.at - ONLY_BEFORE);
    const still = now.length === 1 && playing(event.at + 4).length === 1 && playing(event.at + 4)[0] === now[0];
    if (still && before.length >= 3) {
      const part = byGroup.get(now[0]);
      // Parts leaving together make one clearing: it is said once, when the last of them has gone.
      const same = found.find(e => e.kind === 'only' && e.object === now[0] && Math.abs(e.at - event.at) <= ONLY_BEFORE);
      if (same) { if (event.at > same.at) Object.assign(same, {at: event.at, gone: Math.max(same.gone, before.length - 1)}); }
      else found.push({kind: 'only', object: now[0], at: event.at, label: part.label, gone: before.length - 1});
    }
  }
  for (const event of found) {
    const sign = event.kind === 'leave' || event.kind === 'only' ? -1 : 1;
    // "Only" is the end of a clearing: its change is the whole fall, from before the first part left.
    const lead = event.kind === 'only' ? ONLY_BEFORE : 0;
    const jump = mix ? sign * ((mean(mix, event.at, event.at + 1.5) ?? 0) - (mean(mix, event.at - lead - 1.5, event.at - lead) ?? 0)) : 0;
    event.change = mix ? 0.6 + Math.min(1.4, Math.max(0, jump) / 6) : UNKNOWN_CHANGE;
    event.jump = mix ? round2(jump) : null;
    if (event.kind === 'only') event.change += 0.15 * Math.min(4, event.gone);
    // A part coming in is heard in what follows; a part leaving, in what it was; the one left alone, in what is left.
    const window = sign > 0 || event.kind === 'only' ? [event.at, event.at + 4] : [event.at - 4, event.at];
    event.share = shareOf(model, event.object, ...window);
  }
  // A jump in the mix that a part this quiet cannot have made is not its doing.
  return found.filter(event => event.share === null || event.share >= SHARE_MIN);
}

// Loudness: the mix jumps up or down, rises steadily, or stops altogether.
function loudnessEvents(mix, duration) {
  const found = [];
  if (!mix) return found;
  const step = mix.hop;
  const valid = time => time > QUIET && time < duration - QUIET;
  // Sudden: the second after against the two before.
  for (let t = 2; t < duration - 2; t += step) {
    const before = mean(mix, t - 2, t - 0.1), after = mean(mix, t + 0.1, t + 1.1), later = mean(mix, t + 1.1, t + 2.1);
    if (before === null || after === null || later === null) continue;
    // Sound out of silence is 重进, sound into silence is 休止: neither is a jump in loudness.
    if (silentIn(mix, t - 2, t + 2.1)) continue;
    if (after - before >= SURGE_DB && later - before >= SURGE_DB * 0.6) found.push({kind: 'surge', object: 'all', at: t, change: Math.min(2, (after - before) / 6), db: round2(after - before)});
    else if (before - after >= DROP_DB && before - later >= DROP_DB * 0.6) found.push({kind: 'drop', object: 'all', at: t, change: Math.min(2, (before - after) / 7), db: round2(before - after)});
  }
  // Keep the strongest of a run of neighbouring frames.
  const peaks = [];
  for (const event of found) {
    const last = peaks[peaks.length - 1];
    if (last && last.kind === event.kind && event.at - last.at < 1.5) { if (event.change > last.change) Object.assign(last, event); }
    else peaks.push({...event});
  }
  // Swell: the smoothed mix (1 s means) climbs by SWELL_DB over 3–10 s with no step down along the way.
  const smooth = [];
  for (let t = 0; t + 1 <= duration; t += 0.5) smooth.push([t, mean(mix, t, t + 1)]);
  let start = 0;
  for (let i = 1; i <= smooth.length; i++) {
    const rising = i < smooth.length && smooth[i][1] !== null && smooth[i - 1][1] !== null && smooth[i][1] >= smooth[i - 1][1] - 0.5;
    if (rising) continue;
    // Flat edges are not part of the climb.
    let a = start, b = i - 1;
    while (a < b && smooth[a + 1][1] !== null && smooth[a][1] !== null && smooth[a + 1][1] - smooth[a][1] < 0.3) a++;
    while (b > a && smooth[b][1] !== null && smooth[b - 1][1] !== null && smooth[b][1] - smooth[b - 1][1] < 0.3) b--;
    const from = smooth[a], to = smooth[b];
    const span = to[0] - from[0];
    // The largest rise over any one second of the climb (smooth points are 0.5 s apart).
    let step = 0;
    for (let k = a; k + 2 <= b; k++) if (smooth[k][1] !== null && smooth[k + 2][1] !== null) step = Math.max(step, smooth[k + 2][1] - smooth[k][1]);
    if (from[1] !== null && to[1] !== null && span >= SWELL_SPAN[0] && span <= SWELL_SPAN[1] + 2 && to[1] - from[1] >= SWELL_DB
        && from[1] > mix.usual - REST_DB && step <= SWELL_STEP * (to[1] - from[1])) {
      peaks.push({kind: 'swell', object: 'all', at: from[0], change: (to[1] - from[1]) / 6, until: to[0], db: round2(to[1] - from[1])});
    }
    start = i;
  }
  // One rise, one mark: a surge inside a steady swell (from its start to a second after its top) is that swell.
  const swells = peaks.filter(event => event.kind === 'swell');
  for (let i = peaks.length - 1; i >= 0; i--) {
    const event = peaks[i];
    if (event.kind === 'surge' && swells.some(swell => event.at >= swell.at - 1 && event.at <= swell.until + 1)) peaks.splice(i, 1);
  }
  // Rest: the mix drops under its usual level by REST_DB for 0.25–4 s, with sound on both sides.
  let quietFrom = null;
  for (let i = 0; i <= mix.db.length; i++) {
    const quiet = i < mix.db.length && mix.db[i] < mix.usual - REST_DB;
    if (quiet && quietFrom === null) quietFrom = i;
    if (!quiet && quietFrom !== null) {
      const from = quietFrom * step, to = i * step;
      const before = mean(mix, from - 1, from), after = mean(mix, to, to + 1);
      if (to - from >= REST_SPAN[0] && to - from <= REST_SPAN[1] && before !== null && after !== null
          && before > mix.usual - 10 && after > mix.usual - 10 && i < mix.db.length) {
        peaks.push({kind: 'rest', object: 'all', at: from, change: 1 + Math.min(1, (to - from) / 2), until: to});
        peaks.push({kind: 'back', object: 'all', at: to, change: Math.min(2, Math.max(0, after - (mean(mix, from, to) ?? -120)) / 20), away: round2(to - from)});
      }
      quietFrom = null;
    }
  }
  return peaks.filter(event => valid(event.at)).map(event => ({...event, share: null}));
}

// The voice's highest held pitch in the song.
function peakEvent(model, hidden) {
  const lane = model.lanes.find(l => l && l.kind === 'melody' && (l.group || l.id) === 'vocals' && !hidden.includes('vocals'));
  if (!lane || !lane.contour || !(lane.contour.hop > 0) || !Array.isArray(lane.contour.midi)) return null;
  const {hop, midi} = lane.contour, origin = finite(lane.contour.start) ? lane.contour.start : 0;
  const hold = Math.max(2, Math.round(PEAK_HOLD / hop));
  let best = null;
  const values = midi.filter(finite).sort((a, b) => a - b);
  if (!values.length) return null;
  const usual = values[Math.floor(values.length / 2)];
  for (let i = 0; i + hold <= midi.length; i++) {
    let low = Infinity, high = -Infinity, ok = true;
    for (let j = i; j < i + hold; j++) { const v = midi[j]; if (!finite(v)) { ok = false; break; } low = Math.min(low, v); high = Math.max(high, v); }
    if (!ok || high - low > 1) continue;    // a held note, within a semitone
    if (!best || low > best.low + 0.25) best = {low, at: origin + i * hop};
  }
  if (!best) return null;
  return {kind: 'peak', object: 'vocals', at: best.at, change: Math.max(0.3, (best.low - usual) / 6), label: lane.groupLabel || lane.label, pitch: round2(best.low)};
}

// The lead line changing hands: among the parts with notes (not drums, not bass), the parts
// within LEAD_RANGE dB of the loudest compete, and the one playing highest leads.
function leadEvents(model, byGroup, duration) {
  if (!model.levels || !model.levels.groups) return [];
  const leaders = [];
  const melodic = [...byGroup.values()].filter(p => p.group !== 'drums' && p.group !== 'bass' && p.pitches.length);
  for (let t = 0; t < duration; t += 1) {
    const level = loudest(model, t, t + 1) || {};
    const sounding = melodic.map(p => {
      const notes = p.pitches.filter(n => n[0] < t + 1 && n[1] > t);
      if (!notes.length || !finite(level[p.group])) return null;
      const heights = notes.map(n => n[2]).sort((a, b) => a - b);
      return {group: p.group, label: p.label, db: level[p.group], height: heights[Math.floor(heights.length / 2)]};
    }).filter(Boolean);
    if (!sounding.length) { leaders.push(null); continue; }
    const top = Math.max(...sounding.map(s => s.db));
    const near = sounding.filter(s => s.db >= top - LEAD_RANGE).sort((a, b) => b.height - a.height);
    leaders.push(near[0]);
  }
  // Smooth with the most common leader over 5 seconds.
  const smooth = leaders.map((_, i) => {
    const counts = new Map();
    for (let j = Math.max(0, i - 2); j <= Math.min(leaders.length - 1, i + 2); j++) if (leaders[j]) counts.set(leaders[j].group, (counts.get(leaders[j].group) || 0) + 1);
    let best = null, n = 0;
    for (const [g, c] of counts) if (c > n) { best = g; n = c; }
    return n >= 3 ? best : null;
  });
  const found = [];
  let run = {group: null, from: 0};
  const runs = [];
  smooth.forEach((group, t) => { if (group !== run.group) { runs.push(run); run = {group, from: t}; } });
  runs.push(run);
  runs.forEach((r, i) => { r.to = i + 1 < runs.length ? runs[i + 1].from : smooth.length; });
  const held = runs.filter(r => r.group && r.to - r.from >= LEAD_HOLD);
  for (let i = 1; i < held.length; i++) {
    const was = held[i - 1], now = held[i];
    if (was.group === now.group || now.from - was.to > 4) continue;
    const part = byGroup.get(now.group);
    const share = shareOf(model, now.group, now.from, now.from + 4);
    found.push({kind: 'lead', object: now.group, at: now.from, change: 1, share, label: part.label, was: was.group});
  }
  return found;
}

// --- choosing and saying -----------------------------------------------------------------

function weightOf(object) { return WEIGHT[object] ?? WEIGHT.other; }

function score(events, sections) {
  const seen = new Map();
  const bounds = (sections || []).filter(row => Array.isArray(row) && (row[3] === 'songformer' || row[3] === 'manual')).map(row => Number(row[0]));
  for (const event of [...events].sort((a, b) => a.at - b.at)) {
    const key = event.object + '|' + (event.kind === 'first' ? 'back' : event.kind);
    const times = seen.get(key) || 0;
    seen.set(key, times + 1);
    event.times = times;
    event.novelty = Math.pow(NOVELTY, times);
    event.foreground = event.object === 'all' ? 1 : foregroundOf(event.share ?? null);
    event.weight = weightOf(event.object);
    event.onSection = bounds.some(b => Math.abs(b - event.at) <= 1);
    event.score = event.change * event.foreground * event.novelty * event.weight * (event.onSection ? SECTION_BONUS : 1);
  }
  return events;
}

function textOf(event, words, nameOf) {
  if (event.kind === 'only') return `${words.only}${words.dot}${nameOf(event.object)}`;
  if (event.kind === 'lead') return `${words.lead}${words.arrow}${nameOf(event.object)}`;
  return `${event.object === 'all' ? words.all : nameOf(event.object)}${words.dot}${words[event.kind]}`;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = midi => NOTE_NAMES[((Math.round(midi) % 12) + 12) % 12] + (Math.floor(Math.round(midi) / 12) - 1);
const secs = value => `${Math.round(value)} 秒`;

// Why a moment was chosen, said plainly, for the tables a person reads.
function why(event, name) {
  const who = event.object === 'all' ? '全体' : name(event.object);
  const louder = event.jump >= 1 ? `，整体响了约 ${event.jump.toFixed(0)} dB` : '';
  const softer = event.jump >= 1 ? `，整体轻了约 ${event.jump.toFixed(0)} dB` : '';
  const share = event.share !== null && event.share !== undefined && event.object !== 'all' ? `，占当时总响度的 ${Math.round(event.share * 100)}%` : '';
  const said = {
    first: `${who}在全曲第一次出声${louder}${share}`,
    back: event.object === 'all' ? `全体停了 ${(event.away ?? 0).toFixed(1)} 秒后一起回来` : `${who}离开 ${secs(event.away ?? 0)}后回来${louder}${share}`,
    leave: `${who}停下${event.silentFor === null ? '，直到曲末都不再出声' : `，之后 ${secs(event.silentFor)}不出声`}${softer}${share}`,
    only: `其它 ${event.gone} 件在 3 秒内相继停下，只剩${who}${softer}`,
    rest: `全体一起停下约 ${((event.until ?? event.at) - event.at).toFixed(1)} 秒`,
    surge: `整体响度一秒之内升高约 ${(event.db ?? 0).toFixed(0)} dB`,
    drop: `整体响度一秒之内降低约 ${(event.db ?? 0).toFixed(0)} dB`,
    swell: `整体响度在 ${secs((event.until ?? event.at) - event.at)}里一路升高约 ${(event.db ?? 0).toFixed(0)} dB`,
    peak: `人声全曲最高、而且唱稳了的一个音（${noteName(event.pitch)}）`,
    lead: `最响又最高的那条旋律从${event.was ? name(event.was) : '别的乐器'}换到${who}，并稳住 ${LEAD_HOLD} 秒以上${share}`
  }[event.kind];
  const extra = [];
  if (event.times > 0) extra.push(`同样的事前面已有 ${event.times} 次，分数打了折`);
  if (event.onSection) extra.push('正好落在一个段落的开头');
  return said + (extra.length ? '；' + extra.join('，') : '') + '。';
}
// The factors behind a score, for the report.
function factors(event) {
  return `变化 ${event.change.toFixed(2)} × 前景 ${event.foreground.toFixed(2)} × 新 ${event.novelty.toFixed(2)} × 权 ${event.weight.toFixed(2)}` + (event.onSection ? ` × 段落 ${SECTION_BONUS}` : '');
}

// All scored candidates, before choosing. `options.hidden` lists groups to leave out.
function candidates(model, options = {}) {
  if (!model || !model.track || !(model.track.duration > 0) || !Array.isArray(model.lanes)) return [];
  const hidden = options.hidden || [];
  const duration = model.track.duration;
  const mix = mixOf(model);
  const byGroup = parts(model, hidden);
  const events = [...partEvents(model, byGroup, duration, mix), ...loudnessEvents(mix, duration), ...leadEvents(model, byGroup, duration)];
  const peak = peakEvent(model, hidden);
  if (peak) { peak.share = shareOf(model, 'vocals', peak.at, peak.at + 2); events.push(peak); }
  const entries = events.filter(e => e.kind === 'first' || e.kind === 'back');
  const kept = events.filter(e => e.kind !== 'lead' || !entries.some(n => n.object === e.object && Math.abs(n.at - e.at) <= LEAD_ENTRY));
  const end = soundEnd(mix, duration);
  return score(kept.filter(e => e.at >= QUIET && e.at < end - TAIL), model.sections);
}

// Where the song's sound ends: the last second whose mix is within REST_DB of its usual level.
function soundEnd(mix, duration) {
  if (!mix) return duration;
  for (let t = Math.floor(duration) - 1; t > 0; t--) {
    const level = mean(mix, t, t + 1);
    if (level !== null && level > mix.usual - REST_DB) return t + 1;
  }
  return duration;
}

// Choose: highest scores first, one on screen at a time, at most PER_MINUTE a minute, none under FLOOR.
function choose(scored, duration) {
  const cap = Math.max(1, Math.round(duration / 60 * PER_MINUTE));
  const span = event => [event.at - (FORESHADOWED.includes(event.kind) ? PREVIEW : 0), event.at + HOLD];
  const kept = [], blocked = [];
  for (const event of [...scored].sort((a, b) => b.score - a.score || a.at - b.at)) {
    const [from, to] = span(event);
    if (event.score < FLOOR) { blocked.push({...event, reason: 'floor'}); continue; }
    if (kept.length >= cap) { blocked.push({...event, reason: 'cap'}); continue; }
    const hit = kept.find(k => from < k.to + GAP && k.from < to + GAP);
    if (hit) { blocked.push({...event, reason: 'collision', with: hit}); continue; }
    kept.push({...event, from: Math.max(0, from), to: Math.min(duration, to)});
  }
  kept.sort((a, b) => a.at - b.at);
  return {kept, blocked, cap};
}

function nameFor(model, language) {
  const labels = new Map();
  for (const lane of model.lanes || []) {
    const group = lane.group || String(lane.id || '').split('/')[0];
    if (group && !labels.has(group)) labels.set(group, lane.groupLabel || lane.label || group);
  }
  return group => language === 'en' ? (EN_NAMES[group] || labels.get(group) || group) : (labels.get(group) || group);
}

// `[[from, to, text, 'rule', cue]]`: rows the core reads as captions (from = when it shows,
// to = when it leaves), with the structure in the fifth item.
function cues(model, options = {}) {
  if (!model || !model.track || !(model.track.duration > 0) || !Array.isArray(model.lanes)) return [];
  const language = lang(options.lang);
  const words = WORDS[language];
  const nameOf = nameFor(model, language);
  const {kept} = choose(candidates(model, options), model.track.duration);
  return kept.map(event => [round2(event.from), round2(event.to), textOf(event, words, nameOf), 'rule', {
    object: event.object, word: event.kind, at: round2(event.at), preview: FORESHADOWED.includes(event.kind),
    score: round2(event.score), ...(event.kind === 'lead' ? {was: event.was} : {})
  }]);
}

// The table a person reads: what was chosen and why, and the best of what the gates kept out.
function explain(model, options = {}) {
  const language = lang(options.lang);
  const nameOf = nameFor(model, language);
  const scored = candidates(model, options);
  const {kept, blocked, cap} = choose(scored, model.track.duration);
  const describe = event => ({at: round2(event.at), word: event.kind, object: event.object, preview: FORESHADOWED.includes(event.kind), text: textOf(event, WORDS[language], nameOf),
    score: round2(event.score), why: why(event, nameFor(model, 'zh')), factors: factors(event)});
  return {
    duration: model.track.duration, cap, candidates: scored.length,
    kept: kept.map(describe),
    blocked: blocked.sort((a, b) => b.score - a.score).slice(0, 5).map(event => ({...describe(event), reason: event.reason, with: event.with ? round2(event.with.at) : undefined}))
  };
}

module.exports = {cues, candidates, choose, explain, WORDS, EN_NAMES, FORESHADOWED,
  constants: {QUIET, PREVIEW, HOLD, GAP, PER_MINUTE, FLOOR, NOVELTY, WEIGHT, SECTION_BONUS, BRIDGE, ABSENT, MIN_ONSETS, LEVEL_FLOOR, PART_FLOOR, SURGE_DB, DROP_DB, SWELL_DB, SWELL_SPAN, SWELL_STEP, REST_DB, REST_SPAN, PEAK_HOLD, LEAD_HOLD, LEAD_RANGE, LEAD_ENTRY, ONLY_BEFORE, TAIL, SHARE_MIN}};
