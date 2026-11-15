'use strict';
// Lead or accompaniment, note by note, inside one instrument lane (work/score-roles-20261114/SPEC.md).
//
// A role is a mark laid over the notes, never a new lane: nothing here moves, drops or changes a
// note. Two roles only, `lead` and `comp`; whatever is not clearly a line is `comp`.
//   vocals (kind 'melody')        always lead
//   bass, drums                   no role (null)
//   every other pitched lane      judged here
//
// How a pitched lane is judged:
//  1. Struck together. Notes whose onsets fall within CLUSTER of the first note of a group are one
//     group (a chord or a strum). At most one note of a group can be the lead. A group struck while
//     a higher note of the lane, struck less than HOLD seconds before, still rings offers nothing:
//     the top of the texture there is the held note (the skyline).
//  2. One candidate per group. A cheapest path through the groups: each step down from the top
//     note of a group costs BELOW, a jump of more than STEP_FREE semitones from the last candidate
//     costs LEAP per extra semitone (at most LEAP_CAP of them), standing on the same pitch costs
//     REPEAT. So the top note wins unless it only repeats in place while a lower voice moves; then
//     the line is low. Groups more than CONTINUE_GAP apart are not connected (no jump or repeat cost).
//  3. Does it read as a line here? For each candidate, over the candidates within WINDOW seconds,
//     with repeats of one pitch read as one note (a chopped-up held note, a tremolo):
//       step     share of pitch changes of 1-2 semitones                    >= STEP_MIN
//       leap     share of pitch changes wider than LEAP_WIDE                <= LEAP_MAX
//       rate     pitch changes per second (a pad, a drone, a top note ringing in place fail)  >= RATE_MIN
//       block    share taken from struck chords (3+ pitch classes within VOICING below the group's top)  <= BLOCK_MAX
//       ostinato the same pitches coming back every k changes (k 2..OSTINATO_K, a figure of 3+ pitches:
//                a trill is not a riff), over OSTINATO_SPAN each side       <= OSTINATO_MAX
//       level    (only when the model has stem levels) the lane's stem within QUIET_DB of the
//                loudest judged stem at that second
//     While the voice sings the bar is higher (the instrument is mostly backing the voice):
//     STEP_MIN_UNDER, BLOCK_MAX_UNDER, and (with levels) the lane's stem within UNDER_DB of the voice.
//     When the model cannot say whether the voice sings, the higher bar is used (unsure -> comp).
//  4. Lines. Candidates that pass, with no more than JOIN seconds between one's end and the next's
//     start, make one line; candidates that failed inside a line are taken in with it. A line of
//     fewer than MIN_NOTES candidates or shorter than MIN_SECONDS (MIN_NOTES_UNDER /
//     MIN_SECONDS_UNDER when the voice sings over most of it) is comp as a whole.
//
// The beat grid is not used: nothing above needs it, and the downbeats question stays closed.

const CLUSTER = 0.06;          // s: a strum this wide is still one chord (the timeline.6 role layer's width)
const BELOW = 1.0;             // cost per voice below the top of a group
const STEP_FREE = 2;           // semitones a candidate may move for free
const LEAP = 0.3;              // cost per semitone beyond STEP_FREE ...
const LEAP_CAP = 5;            // ... counted up to this many: a melody may leap, and one leap must not pin the path to an inner voice
const REPEAT = 1.2;            // cost of staying on the same pitch (a top note ringing in place)
const CONTINUE_GAP = 0.8;      // s: groups further apart than this are not one gesture
const HOLD = 0.5;              // s: a higher note struck up to this long ago and still ringing hides a group struck under it (longer trusts pedalled durations too much)
const WINDOW = 2.0;            // s each side: where the line features are read
const STEP_MIN = 0.3;          // a line moves by step at least this often ...
const STEP_MIN_UNDER = 0.5;    // ... and more often under the voice
const LEAP_WIDE = 7;           // semitones: wider than a fifth is a leap
const LEAP_MAX = 0.3;          // a line does not leap more than this often
const VOICING = 12;            // semitones below a group's top that make one chord voicing
const BLOCK_MAX = 0.5;         // a line is not mostly the top of struck chords ...
const BLOCK_MAX_UNDER = 0.25;  // ... and hardly ever under the voice
const RATE_MIN = 0.6;          // pitch changes per second: slower is a pad, a drone or a top note ringing in place
const OSTINATO_SPAN = 4.0;     // s each side: where a figure repeating is looked for
const OSTINATO_K = 8;          // the longest repeating figure looked for, in notes
const OSTINATO_MAX = 0.8;      // a figure that comes back this exactly is a riff, not a line
const QUIET_DB = 12;           // dB under the loudest melodic stem: buried, not a lead
const UNDER_DB = 6;            // dB: under the voice, a lead must be about as loud as the voice
const JOIN = 0.75;             // s: gaps up to this between line notes are bridged
const MIN_NOTES = 6;           // a line has at least this many notes ...
const MIN_SECONDS = 2.5;       // ... and lasts at least this long
const MIN_NOTES_UNDER = 8;     // under the voice: longer still
const MIN_SECONDS_UNDER = 4.0;
const VOCAL_BRIDGE = 1.5;      // s: the voice still "sings" across breaths this short
const VOCAL_NEAR = 12;         // dB: from levels alone, the voice sings when its stem is this close to the loudest other

const UNJUDGED = new Set(['bass', 'drums']);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const pitchClass = pitch => ((pitch % 12) + 12) % 12;

// Onset groups over notes sorted by start: [{start, notes: [index...]}] (indices into `notes`).
function groupsOf(notes) {
  const order = notes.map((_, i) => i).sort((a, b) => notes[a][0] - notes[b][0] || notes[b][2] - notes[a][2]);
  const groups = [];
  for (const i of order) {
    const last = groups[groups.length - 1];
    if (last && notes[i][0] - last.start <= CLUSTER) last.notes.push(i);
    else groups.push({start: notes[i][0], notes: [i]});
  }
  for (const g of groups) {
    // A chord under the top note: a melody note struck with a left-hand chord far below is not one.
    const top = Math.max(...g.notes.map(i => notes[i][2]));
    g.chord = new Set(g.notes.filter(i => top - notes[i][2] <= VOICING).map(i => pitchClass(notes[i][2]))).size >= 3;
    // One state per distinct pitch, high to low; the longest note of that pitch stands for it.
    const byPitch = new Map();
    for (const i of g.notes) { const p = notes[i][2]; if (!byPitch.has(p) || notes[i][1] > notes[byPitch.get(p)][1]) byPitch.set(p, i); }
    g.states = [...byPitch.entries()].sort((a, b) => b[0] - a[0]).map(([, i]) => i);
  }
  return groups;
}

// The groups struck while a higher note of the lane still rings (struck less than HOLD seconds
// before): the top of the texture there is the held note, so they offer no candidate.
function heldUnder(notes, groups) {
  const order = notes.map((_, i) => i).sort((a, b) => notes[a][0] - notes[b][0]);
  const hidden = new Set();
  let active = [], next = 0;
  for (const g of groups) {
    while (next < order.length && notes[order[next]][0] < g.start - CLUSTER) active.push(order[next++]);
    active = active.filter(i => notes[i][0] + notes[i][1] > g.start + 0.05 && g.start - notes[i][0] <= HOLD);
    const top = Math.max(...g.notes.map(i => notes[i][2]));
    if (active.some(i => notes[i][2] > top)) hidden.add(g);
  }
  return hidden;
}

function moveCost(from, to) {
  const jump = Math.abs(to - from);
  return (jump === 0 ? REPEAT : 0) + LEAP * Math.min(LEAP_CAP, Math.max(0, jump - STEP_FREE));
}

// The cheapest path, one note per group: returns the chosen note index per group.
function pathOf(notes, groups) {
  if (!groups.length) return [];
  let cost = groups[0].states.map((_, rank) => BELOW * rank);
  const back = [groups[0].states.map(() => -1)];
  for (let k = 1; k < groups.length; k++) {
    const prev = groups[k - 1], here = groups[k];
    const connected = here.start - prev.start <= CONTINUE_GAP;
    const next = [], from = [];
    here.states.forEach((i, rank) => {
      let best = Infinity, arg = 0;
      prev.states.forEach((j, r) => {
        const c = cost[r] + (connected ? moveCost(notes[j][2], notes[i][2]) : 0);
        if (c < best) { best = c; arg = r; }
      });
      next.push(best + BELOW * rank); from.push(arg);
    });
    cost = next; back.push(from);
  }
  let at = cost.indexOf(Math.min(...cost));
  const chosen = new Array(groups.length);
  for (let k = groups.length - 1; k >= 0; k--) { chosen[k] = groups[k].states[at]; at = back[k][at]; }
  return chosen;
}

// How often the same pitches come back every k changes (best k), or 0 when too few.
function ostinatoOf(pitches) {
  if (new Set(pitches).size < 3) return 0;   // two notes alternating (a trill, a tremolo) is not a riff
  let best = 0;
  for (let k = 2; k <= OSTINATO_K && 2 * k <= pitches.length; k++) {
    let same = 0;
    for (let i = 0; i + k < pitches.length; i++) if (pitches[i] === pitches[i + k]) same++;
    best = Math.max(best, same / (pitches.length - k));
  }
  return best;
}

function rangeOf(cand, from, to) {
  let a = 0; while (a < cand.length && cand[a].start < from) a++;
  let b = a; while (b < cand.length && cand[b].start <= to) b++;
  return cand.slice(a, b);
}

// Repeats of one pitch read as one note (a bowed or held note the transcriber chopped up, a
// tremolo): melodic motion is read between pitch changes only.
const changesOf = list => list.filter((x, i) => i === 0 || x.pitch !== list[i - 1].pitch).map(x => x.pitch);

// The line features around candidate `c` (see the header).
function featuresAt(cand, c) {
  const near = rangeOf(cand, c.start - WINDOW, c.start + WINDOW);
  const seq = changesOf(near);
  const moves = seq.slice(1).map((p, i) => Math.abs(p - seq[i]));
  const share = test => (moves.length ? moves.filter(test).length / moves.length : 0);
  const wide = changesOf(rangeOf(cand, c.start - OSTINATO_SPAN, c.start + OSTINATO_SPAN));
  return {
    step: share(m => m <= 2), leap: share(m => m > LEAP_WIDE),
    block: near.filter(x => x.chord).length / near.length, rate: moves.length / (2 * WINDOW),
    ostinato: ostinatoOf(wide)
  };
}

// The gates of step 3. `under` is true while the voice sings (or when nobody knows).
// `level` is {lane, top, voice} in dB at that second, or null when the model has no levels.
function failsOf(f, under, level) {
  const fails = [];
  if (f.step < (under ? STEP_MIN_UNDER : STEP_MIN)) fails.push('step');
  if (f.leap > LEAP_MAX) fails.push('leap');
  if (f.block > (under ? BLOCK_MAX_UNDER : BLOCK_MAX)) fails.push('block');
  if (f.rate < RATE_MIN) fails.push('rate');
  if (f.ostinato > OSTINATO_MAX) fails.push('ostinato');
  if (level && finite(level.lane)) {
    if (finite(level.top) && level.lane < level.top - QUIET_DB) fails.push('quiet');
    if (under && finite(level.voice) && level.lane < level.voice - UNDER_DB) fails.push('under');
  }
  return fails;
}

// Notes of one lane -> {roles: ['lead'|'comp', ...] in the lane's note order, lines: [[start, end], ...]}.
// context: {singing(t) -> true | false | null, level(t) -> {lane, top, voice} | null}; both optional.
function laneRoles(notes, context = {}) {
  const roles = notes.map(() => 'comp');
  const all = groupsOf(notes);
  const hidden = heldUnder(notes, all);
  const groups = all.filter(g => !hidden.has(g));
  const chosen = pathOf(notes, groups);
  const cand = groups.map((g, k) => {
    const n = notes[chosen[k]];
    return {index: chosen[k], start: n[0], end: n[0] + n[1], pitch: n[2], chord: g.chord};
  });
  const singing = t => { const s = context.singing ? context.singing(t) : null; return s === null || s === undefined ? true : Boolean(s); };
  for (const c of cand) {
    c.under = singing(c.start);
    c.features = featuresAt(cand, c);
    c.fails = failsOf(c.features, c.under, context.level ? context.level(c.start) : null);
  }
  if (context.trace) context.trace(cand);
  // Step 4: lines from the passing candidates.
  const lines = [];
  let run = null;
  cand.forEach((c, k) => {
    if (!c.fails.length) {
      if (run && c.start - run.end <= JOIN) { run.to = k; run.end = Math.max(run.end, c.end); }
      else { if (run) lines.push(run); run = {from: k, to: k, start: c.start, end: c.end}; }
    }
  });
  if (run) lines.push(run);
  const kept = [];
  for (const line of lines) {
    const members = cand.slice(line.from, line.to + 1);
    const under = members.filter(c => c.under).length * 2 > members.length;
    if (members.length < (under ? MIN_NOTES_UNDER : MIN_NOTES) || line.end - line.start < (under ? MIN_SECONDS_UNDER : MIN_SECONDS)) continue;
    for (const c of members) roles[c.index] = 'lead';
    kept.push([round(line.start), round(line.end)]);
  }
  return {roles, lines: kept, candidates: cand.length};
}

const round = value => Math.round(value * 1000) / 1000;

// Whether the voice sings at t, from the model: the vocal lane's notes (bridged over short
// breaths), else the stem levels (the vocal stem near the loudest other), else null (unknown).
function singingOf(model) {
  const voice = (model.lanes || []).find(lane => lane.kind === 'melody' && Array.isArray(lane.notes) && lane.notes.length);
  if (voice) {
    const spans = [];
    for (const [start, length] of voice.notes.slice().sort((a, b) => a[0] - b[0])) {
      const last = spans[spans.length - 1];
      if (last && start - last[1] <= VOCAL_BRIDGE) last[1] = Math.max(last[1], start + length);
      else spans.push([start, start + length]);
    }
    return t => spans.some(([a, b]) => t >= a && t < b);
  }
  const levels = model.levels;
  const groups = levels && levels.groups;
  if (groups && Array.isArray(groups.vocals) && finite(levels.hop) && levels.hop > 0) {
    const others = Object.keys(groups).filter(key => key !== 'vocals');
    return t => {
      const k = Math.floor(t / levels.hop);
      const v = groups.vocals[k];
      if (!finite(v)) return null;
      const top = Math.max(-Infinity, ...others.map(key => groups[key][k]).filter(finite));
      return v >= top - VOCAL_NEAR;
    };
  }
  return () => null;
}

// The stem levels a lane is weighed against at t, or null without levels.
function levelOf(model, lane, judged) {
  const levels = model.levels;
  const groups = levels && levels.groups;
  if (!groups || !finite(levels.hop) || levels.hop <= 0 || !Array.isArray(groups[lane.group])) return null;
  const melodic = [...new Set(judged.map(l => l.group))].filter(g => Array.isArray(groups[g]));
  return t => {
    const k = Math.floor(t / levels.hop);
    const own = groups[lane.group][k];
    if (!finite(own)) return null;
    const top = Math.max(-Infinity, ...melodic.map(g => groups[g][k]).filter(finite));
    return {lane: own, top: finite(top) ? top : null, voice: Array.isArray(groups.vocals) && finite(groups.vocals[k]) ? groups.vocals[k] : null};
  };
}

const judgedLane = lane => lane && lane.kind === 'pitched' && Array.isArray(lane.notes) && !UNJUDGED.has(lane.group || String(lane.id).split('/')[0]);

// A whole model -> {lanes: {<lane id>: {roles, lines} | null}, groups: {<group>: {lines}}}.
// Vocal lanes are all lead, with their phrases as lines; bass, drums and unknown kinds get null.
// The timbre lanes of one stem (one `group`) are judged together, as one lane: that is the lane
// the viewer draws by default (timbres merged), and the transcriber's split of a stem into timbre
// lanes is often arbitrary (five "string ensemble" lanes). `options.by: 'lane'` judges each alone.
// A lane's `lines` are its group's lines that hold at least one of its lead notes.
function rolesOf(model, options = {}) {
  const lanes = model.lanes || [];
  const judged = lanes.filter(judgedLane);
  const singing = singingOf(model);
  const out = {}, groups = {};
  for (const lane of lanes) {
    if (lane.kind === 'melody' && Array.isArray(lane.notes)) {
      const lines = [];
      for (const [start, length] of lane.notes.slice().sort((a, b) => a[0] - b[0])) {
        const last = lines[lines.length - 1];
        if (last && start - last[1] <= JOIN) last[1] = Math.max(last[1], round(start + length));
        else lines.push([start, round(start + length)]);
      }
      out[lane.id] = {roles: lane.notes.map(() => 'lead'), lines, candidates: lane.notes.length};
      groups[lane.group || lane.id] = {lines, voice: true};
    } else if (!judgedLane(lane)) out[lane.id] = null;
  }
  const keyOf = lane => (options.by === 'group' ? lane.group || String(lane.id).split('/')[0] : lane.id);
  for (const key of [...new Set(judged.map(keyOf))]) {
    const members = judged.filter(lane => keyOf(lane) === key);
    const notes = [], owner = [];
    members.forEach((lane, m) => lane.notes.forEach((note, i) => { notes.push(note); owner.push([m, i]); }));
    const made = laneRoles(notes, {singing, level: levelOf(model, members[0], judged), trace: options.trace ? cand => options.trace(key, cand) : null});
    groups[key] = {lines: made.lines, candidates: made.candidates};
    members.forEach((lane, m) => { out[lane.id] = {roles: lane.notes.map(() => 'comp'), lines: []}; });
    made.roles.forEach((role, k) => { const [m, i] = owner[k]; out[members[m].id].roles[i] = role; });
    for (const lane of members) {
      const r = out[lane.id];
      r.lines = made.lines.filter(([a, b]) => lane.notes.some((n, i) => r.roles[i] === 'lead' && n[0] >= a - 0.001 && n[0] <= b));
    }
  }
  return {lanes: out, groups};
}

module.exports = {
  rolesOf, laneRoles, singingOf, groupsOf, heldUnder, pathOf, featuresAt, failsOf, ostinatoOf, changesOf,
  constants: {CLUSTER, BELOW, STEP_FREE, LEAP, LEAP_CAP, REPEAT, CONTINUE_GAP, HOLD, WINDOW, STEP_MIN, STEP_MIN_UNDER, LEAP_WIDE, LEAP_MAX,
    VOICING, BLOCK_MAX, BLOCK_MAX_UNDER, RATE_MIN, OSTINATO_SPAN, OSTINATO_K, OSTINATO_MAX, QUIET_DB, UNDER_DB, JOIN, MIN_NOTES, MIN_SECONDS,
    MIN_NOTES_UNDER, MIN_SECONDS_UNDER, VOCAL_BRIDGE, VOCAL_NEAR}
};
