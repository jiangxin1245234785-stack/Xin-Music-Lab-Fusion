'use strict';
// Lead / comp marks inside one instrument lane (adapter/roles.cjs, work/score-roles-20261114/SPEC.md).
// Each factor of the rule has a fixed case here whose result changes when that factor is taken out;
// tests/roles-mutations.cjs takes them out one by one.
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../adapter/roles.cjs');
const C = R.constants;

// A deterministic stepwise tune: moves of 1 or 2 semitones, now and then a third, never periodic.
function tune(count, start = 67, seed = 7) {
  const out = [start];
  let s = seed;
  for (let i = 1; i < count; i++) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const r = s / 2147483648;
    const size = r < 0.45 ? 1 : r < 0.85 ? 2 : 3;
    let dir = (s >> 7) % 2 ? 1 : -1;
    const last = out[out.length - 1];
    if (last + dir * size > start + 7 || last + dir * size < start - 7) dir = -dir;
    out.push(last + dir * size);
  }
  return out;
}
// Notes [start, length, pitch, velocity] from pitches, one every `dt` seconds from t0.
const line = (t0, pitches, dt = 0.4, length = 0.35) => pitches.map((p, i) => [+(t0 + i * dt).toFixed(3), length, p, 90]);
const leadOf = (notes, r) => notes.filter((_, i) => r.roles[i] === 'lead');
const open = {singing: () => false};

test('a plain stepwise tune is one lead line; nothing in it is moved or changed', () => {
  const notes = line(0, tune(20));
  const before = JSON.stringify(notes);
  const r = R.laneRoles(notes, open);
  assert.equal(JSON.stringify(notes), before, 'notes untouched');
  assert.equal(r.roles.length, notes.length);
  assert.ok(r.roles.every(x => x === 'lead'), JSON.stringify(r));
  assert.equal(r.lines.length, 1);
  assert.deepEqual(r.lines[0], [0, +(19 * 0.4 + 0.35).toFixed(3)]);
});

test('struck chords: at most one note of a group leads, and it is the top (skyline)', () => {
  const melody = tune(20, 76);
  const notes = [];
  melody.forEach((p, i) => { notes.push([i * 0.4, 0.35, p, 90]); notes.push([i * 0.4 + 0.01, 0.35, 48 + (i % 3), 90]); notes.push([i * 0.4 + 0.02, 0.35, 52 + (i % 3), 90]); });
  const r = R.laneRoles(notes, open);
  const lead = leadOf(notes, r);
  assert.equal(lead.length, melody.length, JSON.stringify(r.lines));
  assert.deepEqual(lead.map(n => n[2]), melody, 'the lead is the top voice');
  // One lead per onset group.
  const groups = R.groupsOf(notes);
  for (const g of groups) assert.ok(g.notes.filter(i => r.roles[i] === 'lead').length <= 1);
});

test('a group is one chord only within CLUSTER of its first note', () => {
  const groups = R.groupsOf([[0, 0.3, 60, 90], [0.05, 0.3, 64, 90], [0.1, 0.3, 67, 90]]);
  assert.deepEqual(groups.map(g => g.notes.length), [2, 1]);
});

test('continuity: a top note ringing in place loses to a lower voice that moves (REPEAT)', () => {
  const low = tune(24, 64);
  const notes = [];
  low.forEach((p, i) => { notes.push([i * 0.4, 0.35, 79, 90]); notes.push([i * 0.4, 0.35, p, 90]); });
  const r = R.laneRoles(notes, open);
  const lead = leadOf(notes, r);
  assert.ok(lead.length >= 20, `the moving voice leads: ${lead.length}`);
  assert.ok(lead.every(n => n[2] !== 79), 'the repeated top is comp');
});

test('a melody that leaps often stays on top (LEAP_CAP): leaps must not pin the path to an inner voice', () => {
  // The melody jumps an octave every two notes; an inner voice moves by step under it.
  const top = [], inner = [];
  for (let i = 0; i < 24; i++) { top.push((Math.floor(i / 2) % 2 ? 79 : 67) + (i % 2) * 2); inner.push(60 + (i % 3)); }
  const notes = [];
  top.forEach((p, i) => { notes.push([i * 0.4, 0.35, p, 90]); notes.push([i * 0.4, 0.35, inner[i], 90]); });
  const groups = R.groupsOf(notes);
  const chosen = R.pathOf(notes, groups).map(i => notes[i][2]);
  assert.deepEqual(chosen, top, 'the path stays on the melody: ' + chosen.join(' '));
});

test('a group struck under a higher note that still rings offers no candidate (HOLD)', () => {
  // Melody notes 0.8 s long every 0.8 s; accompaniment struck between them, under the held note.
  const melody = tune(16, 76);
  const notes = [];
  melody.forEach((p, i) => { notes.push([i * 0.8, 0.78, p, 90]); notes.push([i * 0.8 + 0.4, 0.3, 50 + (i % 4) * 3, 90]); });
  const all = R.groupsOf(notes);
  const hidden = R.heldUnder(notes, all);
  assert.equal(hidden.size, melody.length, 'every accompaniment group is under a held melody note');
  const r = R.laneRoles(notes, open);
  assert.ok(leadOf(notes, r).every(n => n[2] >= 66), 'only melody notes lead');
  assert.ok(leadOf(notes, r).length >= 12, JSON.stringify(r.lines));
});

test('a note struck long ago (more than HOLD) no longer hides what is struck under it', () => {
  const notes = [[0, 5, 90, 90], ...line(1, tune(12, 67))];
  const hidden = R.heldUnder(notes, R.groupsOf(notes));
  assert.equal(hidden.size, 0);
});

test('an arpeggio moves by leaps of a third or more: comp (step)', () => {
  const figure = [60, 64, 67, 72, 67, 64, 59, 62, 67, 71, 67, 62, 57, 60, 64, 69, 64, 60, 53, 57, 60, 65, 60, 57];
  const r = R.laneRoles(line(0, figure, 0.25), open);
  assert.ok(r.roles.every(x => x === 'comp'), JSON.stringify(r.lines));
});

test('a line that jumps around by wide leaps is comp (leap)', () => {
  // Steps alternate with leaps of a ninth: enough steps to pass, but more than LEAP_MAX leaps.
  const p = [];
  let x = 60;
  for (let i = 0; i < 24; i++) { x += i % 2 ? (i % 4 === 1 ? 14 : -14) : (i % 3 ? 1 : -2); p.push(x); }
  const f = R.featuresAt(line(0, p).map((n, i) => ({start: n[0], end: n[0] + n[1], pitch: n[2], chord: false})), {start: 4});
  assert.ok(f.step >= C.STEP_MIN && f.leap > C.LEAP_MAX, JSON.stringify(f));
  assert.ok(R.laneRoles(line(0, p), open).roles.every(x => x === 'comp'));
});

test('a pad that changes pitch rarely is comp (rate)', () => {
  const notes = line(0, [67, 69, 67, 65, 67, 69, 71, 69], 2.0, 1.9);
  const r = R.laneRoles(notes, open);
  assert.ok(r.roles.every(x => x === 'comp'));
  // The same pad chopped by the transcriber into quick repeats is still a pad.
  const chopped = [67, 69, 67, 65, 67, 69, 71, 69].flatMap((p, k) => Array.from({length: 8}, (_, j) => [k * 2 + j * 0.25, 0.24, p, 90]));
  assert.ok(R.laneRoles(chopped, open).roles.every(x => x === 'comp'));
  // The same pitches, faster, are a line.
  assert.ok(R.laneRoles(line(0, tune(16)), open).roles.every(x => x === 'lead'));
});

test('repeats of one pitch read as one note: a melody played in tremolo is still a line', () => {
  const notes = line(0, tune(12).flatMap(p => [p, p, p, p]), 0.12, 0.11);
  const r = R.laneRoles(notes, open);
  assert.ok(r.roles.filter(x => x === 'lead').length >= notes.length * 0.9, JSON.stringify(r.lines));
  assert.deepEqual(R.changesOf([{pitch: 60}, {pitch: 60}, {pitch: 62}, {pitch: 62}, {pitch: 60}]), [60, 62, 60]);
});

test('the top of struck chords moving by step is comp (block)', () => {
  const top = tune(20, 72);
  const notes = [];
  top.forEach((p, i) => { notes.push([i * 0.4, 0.35, p, 90]); notes.push([i * 0.4, 0.35, p - 4, 90]); notes.push([i * 0.4, 0.35, p - 7, 90]); });
  const r = R.laneRoles(notes, open);
  assert.ok(r.roles.every(x => x === 'comp'), JSON.stringify(r.lines));
});

test('a melody note struck with a chord more than an octave below is not a chord top (VOICING)', () => {
  const top = tune(20, 79);
  const notes = [];
  top.forEach((p, i) => { notes.push([i * 0.4, 0.35, p, 90]); notes.push([i * 0.4, 0.35, 52, 90]); notes.push([i * 0.4, 0.35, 55, 90]); notes.push([i * 0.4, 0.35, 60, 90]); });
  const groups = R.groupsOf(notes);
  assert.ok(groups.every(g => !g.chord));
  assert.equal(leadOf(notes, R.laneRoles(notes, open)).length, top.length);
});

test('a riff that comes back figure for figure is comp (ostinato); a trill inside a tune is not a riff', () => {
  const riff = [];
  for (let i = 0; i < 8; i++) riff.push(60, 62, 64, 62, 60, 59);
  const r = R.laneRoles(line(0, riff, 0.25), open);
  assert.ok(r.roles.every(x => x === 'comp'), JSON.stringify(r.lines));
  assert.ok(R.ostinatoOf(riff) > C.OSTINATO_MAX);
  assert.equal(R.ostinatoOf([77, 79, 77, 79, 77, 79, 77, 79]), 0, 'two notes alternating');
});

test('an instrument buried under a louder one is comp (QUIET_DB, only with levels)', () => {
  const notes = line(0, tune(20));
  const loud = R.laneRoles(notes, {...open, level: () => ({lane: -20, top: -20, voice: null})});
  const buried = R.laneRoles(notes, {...open, level: () => ({lane: -20 - C.QUIET_DB - 3, top: -20, voice: null})});
  assert.ok(loud.roles.every(x => x === 'lead'));
  assert.ok(buried.roles.every(x => x === 'comp'));
});

test('while the voice sings the bar is higher: a looser line is lead in an interlude, comp under the voice', () => {
  // Steps on about 40% of the changes: between STEP_MIN and STEP_MIN_UNDER.
  const p = [];
  let x = 64;
  const moves = [2, -3, 1, 4, -3, -3, 2, 3, -1, -4];
  for (let i = 0; i < 30; i++) { x += moves[i % moves.length] * (i % 20 < 10 ? 1 : -1); p.push(x); }
  const notes = line(0, p, 0.35);
  const f = R.featuresAt(notes.map(n => ({start: n[0], end: n[0] + n[1], pitch: n[2], chord: false})), {start: 5});
  assert.ok(f.step >= C.STEP_MIN && f.step < C.STEP_MIN_UNDER, JSON.stringify(f));
  assert.ok(R.laneRoles(notes, open).roles.filter(x => x === 'lead').length >= 20, 'interlude: lead');
  assert.ok(R.laneRoles(notes, {singing: () => true}).roles.every(x => x === 'comp'), 'under the voice: comp');
  assert.ok(R.laneRoles(notes, {}).roles.every(x => x === 'comp'), 'nobody knows whether the voice sings: the higher bar');
});

test('under the voice, struck chords count against a line sooner (BLOCK_MAX_UNDER)', () => {
  // A tune where every third onset is a struck chord: a third of the candidates are chord tops.
  const top = tune(30, 74);
  const notes = [];
  top.forEach((p, i) => { notes.push([i * 0.4, 0.35, p, 90]); if (i % 3 === 0) { notes.push([i * 0.4, 0.35, p - 3, 90]); notes.push([i * 0.4, 0.35, p - 8, 90]); } });
  assert.ok(R.laneRoles(notes, open).roles.some(x => x === 'lead'));
  assert.ok(R.laneRoles(notes, {singing: () => true}).roles.every(x => x === 'comp'));
});

test('under the voice a lead must be about as loud as the voice (UNDER_DB)', () => {
  const notes = line(0, tune(24));
  const near = R.laneRoles(notes, {singing: () => true, level: () => ({lane: -20, top: -20, voice: -20 + C.UNDER_DB - 1})});
  const quiet = R.laneRoles(notes, {singing: () => true, level: () => ({lane: -20, top: -20, voice: -20 + C.UNDER_DB + 3})});
  assert.ok(near.roles.every(x => x === 'lead'), JSON.stringify(near.lines));
  assert.ok(quiet.roles.every(x => x === 'comp'));
});

test('lines: gaps up to JOIN are bridged, longer gaps split', () => {
  const a = tune(10), b = tune(10, 69, 3);
  const joined = [...line(0, a), ...line(3.6 + 0.35 + C.JOIN - 0.1, b)];
  const split = [...line(0, a), ...line(3.6 + 0.35 + C.JOIN + 0.3, b)];
  assert.equal(R.laneRoles(joined, open).lines.length, 1);
  assert.equal(R.laneRoles(split, open).lines.length, 2);
});

test('a line must be long enough (MIN_NOTES and MIN_SECONDS); longer still under the voice', () => {
  const shortCount = R.laneRoles(line(0, tune(C.MIN_NOTES - 1), 0.7), open);
  assert.ok(shortCount.roles.every(x => x === 'comp'), 'too few notes');
  const shortTime = R.laneRoles(line(0, tune(C.MIN_NOTES + 2), 0.25, 0.2), open);
  assert.ok(2.0 * 0 + (C.MIN_NOTES + 1) * 0.25 + 0.2 < C.MIN_SECONDS);
  assert.ok(shortTime.roles.every(x => x === 'comp'), 'too short');
  const enough = R.laneRoles(line(0, tune(C.MIN_NOTES + 1), 0.45), open);
  assert.ok(enough.roles.every(x => x === 'lead'), JSON.stringify(enough.lines));
  // Seven notes over three seconds: a line in an interlude, too little under the voice.
  const loud = () => ({lane: -20, top: -20, voice: -20});
  const seven = line(0, tune(C.MIN_NOTES + 1, 67, 5), 0.5);
  assert.ok(R.laneRoles(seven, {singing: () => false, level: loud}).roles.every(x => x === 'lead'));
  const under = R.laneRoles(seven, {singing: () => true, level: loud});
  assert.ok(under.roles.every(x => x === 'comp'), JSON.stringify(under));
});

test('MIN_SECONDS_UNDER: under the voice a line of enough notes still needs the time', () => {
  // Twelve notes over three seconds: enough notes, too short under the voice, enough in an interlude.
  const notes = line(0, tune(12, 67, 9), 0.27, 0.25);
  const loud = () => ({lane: -20, top: -20, voice: -20});
  assert.ok(R.laneRoles(notes, {singing: () => false, level: loud}).roles.every(x => x === 'lead'));
  assert.ok(R.laneRoles(notes, {singing: () => true, level: loud}).roles.every(x => x === 'comp'));
});

// --- the whole model ---------------------------------------------------------------------------

function model(lanes, extra = {}) {
  return {contract: 'xin.score-view/1', track: {duration: 30}, audio: {src: '', offset: 0}, lanes, ...extra};
}

test('whole model: vocals always lead, bass and drums carry no role, other lanes are judged', () => {
  const m = model([
    {id: 'vocals', kind: 'melody', group: 'vocals', notes: line(0, [60, 62, 64], 1)},
    {id: 'guitar', kind: 'pitched', group: 'guitar', notes: line(10, tune(20))},
    {id: 'bass', kind: 'pitched', group: 'bass', notes: line(0, tune(20, 40))},
    {id: 'drums', kind: 'drums', group: 'drums', rows: ['kick'], hits: [[0, 0, 100]]}
  ]);
  const out = R.rolesOf(m);
  assert.deepEqual(out.lanes.vocals.roles, ['lead', 'lead', 'lead']);
  assert.equal(out.lanes.bass, null);
  assert.equal(out.lanes.drums, null);
  assert.ok(out.lanes.guitar.roles.every(x => x === 'lead'), 'the voice is silent at 10 s: an interlude');
});

test('the voice from the vocal lane, bridged across short breaths (VOCAL_BRIDGE)', () => {
  const m = model([{id: 'vocals', kind: 'melody', group: 'vocals', notes: [[0, 1, 60, 90], [1 + C.VOCAL_BRIDGE - 0.2, 1, 62, 90], [10, 1, 64, 90]]}]);
  const sings = R.singingOf(m);
  assert.equal(sings(0.5), true);
  assert.equal(sings(1.5), true, 'a breath');
  assert.equal(sings(5), false, 'a rest');
});

test('the voice from the stem levels when there is no vocal lane (VOCAL_NEAR); unknown without either', () => {
  const levels = {hop: 1, groups: {vocals: [-20, -20 - C.VOCAL_NEAR - 5, -90], guitar: [-18, -18, -18]}};
  const sings = R.singingOf(model([], {levels}));
  assert.deepEqual([0.5, 1.5, 2.5].map(sings), [true, false, false]);
  assert.equal(R.singingOf(model([]))(1), null);
});

test('stem levels reach the judgement: a buried lane is comp, the loud one leads', () => {
  const levels = {hop: 1, groups: {guitar: new Array(30).fill(-15), piano: new Array(30).fill(-15 - C.QUIET_DB - 4), vocals: new Array(30).fill(-90)}};
  const m = model([
    {id: 'guitar', kind: 'pitched', group: 'guitar', notes: line(0, tune(20))},
    {id: 'piano', kind: 'pitched', group: 'piano', notes: line(0, tune(20, 72, 3))}
  ], {levels});
  const out = R.rolesOf(m);
  assert.ok(out.lanes.guitar.roles.every(x => x === 'lead'));
  assert.ok(out.lanes.piano.roles.every(x => x === 'comp'));
});

test('two lanes may both lead at once (counterpoint, unison)', () => {
  const m = model([
    {id: 'guitar', kind: 'pitched', group: 'guitar', notes: line(0, tune(20))},
    {id: 'piano', kind: 'pitched', group: 'piano', notes: line(0, tune(20, 72, 3))}
  ]);
  const out = R.rolesOf(m);
  assert.ok(out.lanes.guitar.roles.every(x => x === 'lead') && out.lanes.piano.roles.every(x => x === 'lead'));
});

test('timbre lanes are judged one by one by default; by group they are judged as one lane', () => {
  // A strummed lane and a melody lane of the same stem, sounding together.
  const strum = [];
  for (let i = 0; i < 20; i++) for (const p of [60, 64, 67]) strum.push([i * 0.4, 0.35, p + 12, 90]);
  const m = model([
    {id: 'guitar/0', kind: 'pitched', group: 'guitar', notes: line(0, tune(20, 70))},
    {id: 'guitar/1', kind: 'pitched', group: 'guitar', notes: strum}
  ]);
  const byLane = R.rolesOf(m);
  assert.ok(byLane.lanes['guitar/0'].roles.every(x => x === 'lead'));
  assert.ok(byLane.lanes['guitar/1'].roles.every(x => x === 'comp'));
  const byGroup = R.rolesOf(m, {by: 'group'});
  assert.ok(byGroup.lanes['guitar/0'].roles.every(x => x === 'comp'), 'merged, the strum is on top and the melody under it');
  assert.ok(byGroup.groups.guitar);
});

test('the constants are the reported ones', () => {
  assert.deepEqual(C, {CLUSTER: 0.06, BELOW: 1, STEP_FREE: 2, LEAP: 0.3, LEAP_CAP: 5, REPEAT: 1.2, CONTINUE_GAP: 0.8, HOLD: 0.5, WINDOW: 2,
    STEP_MIN: 0.3, STEP_MIN_UNDER: 0.5, LEAP_WIDE: 7, LEAP_MAX: 0.3, VOICING: 12, BLOCK_MAX: 0.5, BLOCK_MAX_UNDER: 0.25, RATE_MIN: 0.6,
    OSTINATO_SPAN: 4, OSTINATO_K: 8, OSTINATO_MAX: 0.8, QUIET_DB: 12, UNDER_DB: 6, JOIN: 0.75, MIN_NOTES: 6, MIN_SECONDS: 2.5,
    MIN_NOTES_UNDER: 8, MIN_SECONDS_UNDER: 4, VOCAL_BRIDGE: 1.5, VOCAL_NEAR: 12});
});
