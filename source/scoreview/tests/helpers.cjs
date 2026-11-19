'use strict';
// A canvas that records what was drawn on it, and a small complete model to draw.
const path = require('node:path');

// SCOREVIEW_CORE points the suite at another copy of the core: that is how the tests
// themselves are checked (break one rule in a copy, see the matching test fail).
const ScoreView = require(process.env.SCOREVIEW_CORE || path.join(__dirname, '..', 'score-view.js'));

function mockCanvas(width = 800, height = 400) {
  const calls = [], stack = [];
  // Every drawing property the core sets, the shadow and the text alignment included (2026-11-14 acceptance of
  // work/score-roles-20261114: a frame compared by its calls alone missed a changed shadow). Each call carries the
  // whole drawing state it was made with (`state`), so comparing `calls` compares every write that reaches the canvas.
  const state = {fillStyle: '', strokeStyle: '', font: '', globalAlpha: 1, globalCompositeOperation: 'source-over', lineWidth: 1, lineCap: 'butt',
                 shadowColor: 'rgba(0,0,0,0)', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, textAlign: 'start', textBaseline: 'alphabetic',
                 lineJoin: 'miter', miterLimit: 10, lineDashOffset: 0, filter: 'none', imageSmoothingEnabled: true, imageSmoothingQuality: 'low', direction: 'inherit'};
  const record = name => (...args) => { calls.push({name, args, fillStyle: state.fillStyle, strokeStyle: state.strokeStyle, font: state.font, alpha: state.globalAlpha, composite: state.globalCompositeOperation, lineWidth: state.lineWidth, lineCap: state.lineCap, state: {...state}}); };
  const context = {
    // save / restore keep and give back the drawing state, as a real canvas does.
    save: (...args) => { stack.push({...state}); record('save')(...args); },
    restore: (...args) => { if (stack.length) Object.assign(state, stack.pop()); record('restore')(...args); }, beginPath: record('beginPath'), fill: record('fill'),
    stroke: record('stroke'), clip: record('clip'), rect: record('rect'), roundRect: record('roundRect'), fillRect: record('fillRect'), strokeRect: record('strokeRect'),
    fillText: record('fillText'), strokeText: record('strokeText'), moveTo: record('moveTo'), lineTo: record('lineTo'), arc: record('arc'), ellipse: record('ellipse'),
    quadraticCurveTo: record('quadraticCurveTo'), bezierCurveTo: record('bezierCurveTo'), closePath: record('closePath'),
    setTransform: record('setTransform'), drawImage: record('drawImage'), setLineDash: record('setLineDash'),
    translate: record('translate'), rotate: record('rotate'), scale: record('scale'),
    measureText: text => ({width: String(text).length * 6}),
    createLinearGradient: (...line) => { const stops = []; return {line, stops, addColorStop(at, colour) { stops.push([at, colour]); }}; },
    createRadialGradient: (...circles) => { const stops = []; return {circles, stops, addColorStop(at, colour) { stops.push([at, colour]); }}; }
  };
  for (const key of Object.keys(state)) {
    Object.defineProperty(context, key, {get: () => state[key], set: value => { state[key] = value; }});
  }
  const canvas = {width, height, clientWidth: width, clientHeight: height, getContext: () => context};
  return {
    canvas, calls,
    reset: () => { calls.length = 0; },
    // The note bars of the last frame: every rect / roundRect added to a path.
    bars: () => calls.filter(call => call.name === 'rect' || call.name === 'roundRect')
      .map(call => ({x: call.args[0], y: call.args[1], width: call.args[2], height: call.args[3], style: call.fillStyle})),
    texts: () => calls.filter(call => call.name === 'fillText')
      .map(call => ({text: call.args[0], x: call.args[1], y: call.args[2], style: call.fillStyle, font: call.font})),
    // Stroked paths: each is the list of its points, `{x, y, pen}` with pen false at a moveTo.
    strokes: () => {
      const paths = [];
      let points = [];
      for (const call of calls) {
        if (call.name === 'beginPath') points = [];
        else if (call.name === 'moveTo' || call.name === 'lineTo') points.push({x: call.args[0], y: call.args[1], pen: call.name === 'lineTo'});
        else if (call.name === 'stroke') paths.push({style: call.strokeStyle, points});
      }
      return paths;
    },
    // Plain filled rectangles (the background, fades, the progress line and marker).
    fills: () => calls.filter(call => call.name === 'fillRect')
      .map(call => ({x: call.args[0], y: call.args[1], width: call.args[2], height: call.args[3], style: call.fillStyle}))
  };
}

// Every layer the contract knows, small enough to reason about by hand.
function fullModel() {
  return {
    contract: 'xin.score-view/1',
    track: {id: 't', title: '测试曲', artist: '某人', album: '某专辑', duration: 60},
    audio: {src: 'audio/test.mp3', offset: 0},
    lanes: [
      {id: 'vocals', label: '人声', kind: 'melody', group: 'vocals',
       notes: [[10, 0.5, 59, 96], [10.6, 0.4, 61, 90], [30, 1, 64, 100]],
       contour: {hop: 0.01, start: 0, midi: [59.1, null]}},
      {id: 'guitar/clean electric guitar', label: '电吉他', kind: 'pitched', group: 'guitar', groupLabel: '吉他',
       notes: [[9, 0.2, 60, 100], [9.2, 0.2, 60, 75], [9.4, 0.2, 60, 55], [10, 0.02, 72, 100], [11, 0.1, 67, 20], [40, 1, 55, 90]]},
      {id: 'guitar/acoustic guitar', label: '木吉他', kind: 'pitched', group: 'guitar', groupLabel: '吉他',
       notes: [[9, 0.2, 60, 70], [12, 0.5, 64, 80]]},
      {id: 'bass', label: '贝斯', kind: 'pitched', group: 'bass', notes: [[8, 2, 36, 100], [10, 2, 38, 100]]},
      {id: 'drums', label: '鼓', kind: 'drums', group: 'drums',
       rows: ['kick', 'snare', 'hihat', 'openhat', 'tom', 'crash', 'ride'],
       hits: [[9, 0, 110], [9.5, 1, 100], [10, 0, 70], [10, 2, 80], [10.5, 1, 60], [50, 5, 90]]}
    ],
    chords: [[0, 4.2, 'D#m', 0.78], [4.2, 20, 'F#', 0.6], [30, 40, 'Cm', 0.5]],
    chordTones: {'D#m': [3, 6, 10], 'F#': [6, 10, 1], Cm: [0, 3, 7]},
    sections: [[0, 21, '引子', 'songformer', 'intro'], [21, 45, '主歌 1', 'songformer', 'verse'], [50, 60, '主歌 2', 'songformer', 'verse']],
    bars: {beatsPerBar: 4, bpm: 120, beats: [0, 0.5, 1, 1.5, 2], downbeats: [0, 2], steady: true},
    captions: [[9, 15, '先听人声和吉他。', 'manual']],
    energy: {hop: 0.1, db: [-20, -18, -15]},
    levels: {hop: 1, groups: {vocals: Array(60).fill(-20), guitar: Array(60).fill(-20), bass: Array(60).fill(-20), drums: Array(60).fill(-20)}},
    cover: {src: 'data:image/jpeg;base64,AAAA', width: 4, height: 4}
  };
}

const OPTIONAL_LAYERS = ['chords', 'chordTones', 'sections', 'bars', 'captions', 'energy', 'levels', 'cover'];

// The lanes alone: what the tests about notes and lanes draw, so that the bands the
// other layers add (chord panel, section bar) are not in the picture.
function lanesOnly() {
  const model = fullModel();
  for (const key of OPTIONAL_LAYERS) delete model[key];
  return model;
}

// The settings the lane tests were written against. The core's own defaults are whatever
// the last gate decided and are checked by a test of their own. The effects are off here:
// these tests were written against the frame before the effects existed, and
// `effects.test.cjs` holds that 'off' still draws exactly that frame. Likewise the lane names are
// text and the section bar is blocks (looks.test.cjs holds the icons and the lines).
const BENCH = Object.freeze({windowSeconds: 10, playhead: 0.62, simplify: false, mergeTimbres: false, laneHeights: 'fixed', backdrop: 'section', effects: 'off',
  laneLabels: 'text', sectionStyle: 'block'});

// 0.11.0 moved the kick's breath from the whole canvas to the lanes' area (work/score-export-20261114/
// SPEC.md B7), so the captions at the top and the section bar no longer lift with it. The one fillRect
// that draws it may differ from 0.8.0's, and only in this way: 0.8.0 [0, 0, W, H], now [0, top, W, h]
// below the top 12% and inside the canvas, in the same white at the same strength (the fillStyle set
// just before it is compared as usual). Such an entry is put back to 0.8.0's; everything else must match.
function breathOnLanes(before, after, width, height) {
  if (before.length !== after.length) return after;
  return after.map((entry, i) => {
    const old = before[i];
    const fill = e => e && e[0] === 'call' && e[1] === 'fillRect';
    if (!fill(entry) || !fill(old) || JSON.stringify(entry) === JSON.stringify(old)) return entry;
    const style = after[i - 1];
    if (!(style && style[0] === 'set' && style[1] === 'fillStyle' && /^rgba\(255,255,255,[\d.]+\)$/.test(style[2]))) return entry;
    if (!(old[2] === 0 && old[3] === 0 && old[4] === width && old[5] === height)) return entry;
    if (!(entry[2] === 0 && entry[4] === width && entry[3] > height * 0.12 && entry[3] + entry[5] < height)) return entry;
    return old;
  });
}

// 0.12.0 stops every area an effect lights at the section bar's top edge (work/score-dynamics-20261114/
// SPEC.md, second round): a halo or snare flash on the lowest lane, or a spark flying down, used to light
// the top few pixels of the bar. Against an older core, a frame may differ only in this way:
//   - a fillRect with the same x, y and width whose bottom now sits exactly on the bar's top edge
//     (it reached below it before), the same fill and state otherwise;
//   - a fillRect that lay wholly inside the bar (its top at or below the edge) is gone.
// Such entries are put back to the old core's, and only when they are an effect's (a spark, a radial
// halo or flash, the column); everything else must match as it is. `barTop` is the
// bar's top edge in CSS px (barTopOf below). Works on both recordings the suites use: mockCanvas calls
// ({name, args, ...}) and the recorder's ['call', name, ...args] entries.
function cutAtBar(before, after, barTop) {
  const rect = entry => (entry && entry.name === 'fillRect' ? entry.args
    : Array.isArray(entry) && entry[0] === 'call' && entry[1] === 'fillRect' ? entry.slice(2, 6) : null);
  const rest = entry => (entry && entry.name ? JSON.stringify({...entry, args: null}) : null);
  const near = (a, b) => Math.abs(a - b) < 0.02;
  // Only an effect's fill is let through (SPEC-FIX.md §5): a spark (a 1.6 px square), a halo or a flash
  // (a radial gradient), or the play line's column (a narrow linear gradient). The fill style is on the
  // call itself (mockCanvas) or set just before it (the recorder).
  const styleOf = (list, i) => {
    if (list[i] && list[i].name) return list[i].fillStyle;
    for (let k = i - 1; k >= 0; k--) if (Array.isArray(list[k]) && list[k][0] === 'set' && list[k][1] === 'fillStyle') return list[k][2];
    return null;
  };
  const effect = (list, i, box) => {
    if (box[2] === 1.6) return true;
    const style = styleOf(list, i);
    if (style && typeof style === 'object') return Boolean(style.circles) || (Boolean(style.line) && box[2] < 120);
    return typeof style === 'string' && (style.startsWith('radial-') || (style.startsWith('linear-') && box[2] < 120));
  };
  const out = [];
  let j = 0;
  for (let i = 0; i < before.length; i++) {
    const old = before[i], now = after[j];
    if (JSON.stringify(old) === JSON.stringify(now)) { out.push(now); j++; continue; }
    const a = rect(old), b = rect(now);
    if (a && b && effect(before, i, a) && a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && near(b[1] + b[3], barTop) && a[1] + a[3] > b[1] + b[3] &&
        (rest(old) === null || rest(old) === rest(now))) { out.push(old); j++; continue; }
    if (a && a[2] === 1.6 && a[1] >= barTop - 0.02) { out.push(old); continue; }   // a spark wholly in the bar: no longer drawn
    out.push(now); j++;                                                            // a real difference: left for the caller to see
  }
  return j === after.length ? out : out.concat(after.slice(j));
}

// The section bar's top edge, from what hit() calls the bar (it answers from 6 px above it).
function barTopOf(view, x, height) {
  for (let y = height * 0.5; y < height; y += 0.005) {
    const under = view.hit(x, y);
    if (under && (under.kind === 'section' || under.kind === 'bar')) return y + 6;
  }
  return height;
}

// 0.22.0 changed two defaults on purpose (work/score-shapes-20261114/SPEC-7.md): simplifying no longer joins a
// struck lane's strikes or grows a note past SIMPLIFY.longest, and a kick lifts / a snare flashes only on an accent
// (DRUM_ACCENT, accentGap). The suites that hold "this draws exactly what an older core drew" give both cores the
// model through `alike`, an input on which the old and the new rules agree, so everything else is still compared
// frame for frame (the new rules have tests of their own):
//   - on every lane with notes, each chain the old rule would join (same pitch, next starting within
//     joinGap of the chain's end, timbre tracks of a group together) is written as the note the old rule made, in
//     pieces of at most SIMPLIFY.longest that leave more than joinGap between them, in the lane of its first piece;
//   - of the kicks and snares, only those that fire under the new rule with the longest gap of any preset are kept
//     (repeated until it holds): the old core fired every one, the new one then fires every one too.
function alike(source) {
  const model = JSON.parse(JSON.stringify(source));
  const {joinGap, longest} = ScoreView.SIMPLIFY;
  // Every lane with notes, grouped as merging folds them (a melody lane on its own), so no two notes that either rule
  // could join are left, merged or not: the held lanes too, as a chain longer than SIMPLIFY.longest is now cut.
  const groups = new Map();
  for (const lane of model.lanes) {
    if (lane.kind === 'drums' || !Array.isArray(lane.notes)) continue;
    const key = lane.kind === 'pitched' ? `g:${lane.group}` : `l:${lane.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(lane);
  }
  for (const lanes of groups.values()) {
    const all = [];
    lanes.forEach(lane => lane.notes.forEach(note => all.push({note, lane})));
    all.sort((a, b) => a.note[2] - b.note[2] || a.note[0] - b.note[0]);
    const out = new Map(lanes.map(lane => [lane, []]));
    let chain = null;
    const close = () => {
      if (!chain) return;
      const [start, dur, pitch, vel, role] = chain.note;
      for (let at = start; at < start + dur - 1e-9; at += longest + joinGap * 2) {
        const piece = [at, Math.min(longest, start + dur - at), pitch, vel];
        if (role !== undefined) piece.push(role);
        out.get(chain.lane).push(piece);
      }
    };
    for (const {note, lane} of all) {
      if (chain && note[2] === chain.note[2] && note[0] <= chain.note[0] + chain.note[1] + joinGap) {
        chain.note[1] = Math.max(chain.note[0] + chain.note[1], note[0] + note[1]) - chain.note[0];
        chain.note[3] = Math.max(chain.note[3], note[3]);
        if (chain.note.length > 4 || note.length > 4) chain.note[4] = Math.max(chain.note.length > 4 ? chain.note[4] : -1, note.length > 4 ? note[4] : -1);
      } else { close(); chain = {note: note.slice(), lane}; }
    }
    close();
    for (const lane of lanes) lane.notes = out.get(lane).sort((a, b) => a[0] - b[0] || a[2] - b[2]);
  }
  // The notes either rule drops after joining are left out: the old one dropped under 0.06 s or under velocity 40, the
  // new one under minDuration, or softer than `faint` of the lane's median and shorter than `faintDur`. The median is
  // the merged group's or the lane's own, so this is repeated over both until nothing more goes.
  const {minDuration, faint, faintDur} = ScoreView.SIMPLIFY;
  const median = notes => { const v = notes.map(n => n[3]).sort((a, b) => a - b); return v.length ? v[v.length >> 1] : 0; };
  const drops = (note, typical) => note[1] < 0.06 || note[3] < 40 || note[1] < minDuration || (note[3] < faint * typical && note[1] < faintDur);
  for (let round = 0; round < 50; round++) {
    let gone = 0;
    for (const lanes of [...groups.values(), ...[...groups.values()].flat().map(lane => [lane])]) {
      const typical = median(lanes.flatMap(lane => lane.notes));
      for (const lane of lanes) {
        const kept = lane.notes.filter(note => !drops(note, typical));
        gone += lane.notes.length - kept.length;
        lane.notes = kept;
      }
    }
    if (!gone) break;
  }
  const gap = Math.max(...Object.values(ScoreView.FX_PRESETS).filter(Boolean).map(preset => preset.accentGap));
  for (const lane of model.lanes) {
    if (lane.kind !== 'drums' || !Array.isArray(lane.hits)) continue;
    const named = name => ScoreView.DRUM_ACCENT.drums.includes(lane.rows[name]);
    for (let round = 0; round < 50; round++) {
      const hits = lane.hits.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const count = hits.length, set = {count, time: new Float32Array(count), row: new Uint8Array(count), vel: new Uint8Array(count)};
      hits.forEach((hit, i) => { set.time[i] = hit[0]; set.row[i] = hit[1]; set.vel[i] = hit[2]; });
      const accent = ScoreView.drumAccents(set, lane.rows), last = new Map(), keep = [];
      hits.forEach((hit, i) => {
        if (!named(hit[1])) { keep.push(hit); return; }
        const before = last.has(hit[1]) ? last.get(hit[1]) : -Infinity;
        if (accent[i] && set.time[i] - before >= gap) { keep.push(hit); last.set(hit[1], set.time[i]); }
      });
      const done = keep.length === lane.hits.length;
      lane.hits = keep;
      if (done) break;
    }
  }
  return model;
}

module.exports = {ScoreView, mockCanvas, fullModel, lanesOnly, OPTIONAL_LAYERS, BENCH, breathOnLanes, cutAtBar, barTopOf, alike};
