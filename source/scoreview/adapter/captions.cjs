'use strict';
// Rule-made listening captions from a score-view model: what just changed, said in one line.
//
// The JavaScript twin of tools/make_captions.py, rule for rule and constant for constant (gate
// four settled them: the lines help, there are the right number of them, the plain tone is
// right). tests/captions-port.test.cjs holds the two against each other on the pilot songs;
// change one and the other has to follow.
//
//   section   a named section starts
//   enter     a stem that has been silent for a while starts playing
//   leave     a stem that has been playing goes silent for a while
//   return    the voice comes back after a gap
//   denser / thinner   the number of note starts per second jumps or drops
const SPACING = 8.0;   // at most one caption starts in this many seconds
const SHOWN = 6.0;     // how long a caption stays, unless the next one comes sooner
const BRIDGE = 4;      // seconds of silence inside a part that do not count as leaving
const ABSENT = 8;      // seconds a part must have been silent for its start to be an entrance
const MERGE = 2.5;     // an event this soon after the last one belongs to the same moment
const SPAN = 4.0;      // ... as long as the moment does not stretch past this
const CLAUSES = 2;     // a line says at most this many things, the most telling first
const PRIORITY = {section: 0, return: 1, leave: 2, enter: 3, thinner: 4, denser: 5};

const whole = value => Math.trunc(value);
const round2 = value => Math.round(value * 100) / 100;

function activity(model) {
  const seconds = whole(model.track.duration) + 1;
  const playing = new Map(), labels = new Map();
  for (const lane of model.lanes) {
    if (lane.kind === 'texture') continue;
    const group = lane.group || lane.id;
    if (!labels.has(group)) labels.set(group, lane.groupLabel || lane.label);
    if (!playing.has(group)) playing.set(group, new Array(seconds).fill(false));
    const row = playing.get(group);
    for (const item of lane.notes || []) {
      for (let second = whole(item[0]); second < Math.min(seconds, whole(item[0] + item[1]) + 1); second++) row[second] = true;
    }
    for (const hit of lane.hits || []) if (whole(hit[0]) < seconds) row[whole(hit[0])] = true;
  }
  for (const row of playing.values()) {               // bridge short holes
    let last = null;
    for (let second = 0; second < row.length; second++) {
      if (!row[second]) continue;
      if (last !== null && second - last > 1 && second - last <= BRIDGE + 1) for (let hole = last + 1; hole < second; hole++) row[hole] = true;
      last = second;
    }
  }
  return {playing, labels};
}

function onsetRate(model) {
  const seconds = whole(model.track.duration) + 1;
  const rate = new Array(seconds).fill(0);
  for (const lane of model.lanes) {
    if (lane.kind === 'texture') continue;
    for (const item of [...(lane.notes || []), ...(lane.hits || [])]) if (whole(item[0]) < seconds) rate[whole(item[0])]++;
  }
  return rate;
}

function events(model, hidden) {
  const {playing, labels} = activity(model);
  for (const group of hidden) playing.delete(group);
  const found = [];
  for (const [start, , name, source] of model.sections || []) {
    if (source === 'songformer' || source === 'manual') found.push([Number(start), 'section', name]);
  }
  const any = (row, from, to) => { for (let i = Math.max(0, from); i < Math.min(row.length, to); i++) if (row[i]) return true; return false; };
  for (const [group, row] of playing) {
    for (let second = 1; second < row.length; second++) {
      if (row[second] && !any(row, second - ABSENT, second) && second >= Math.floor(ABSENT / 2)) {
        found.push([second, group === 'vocals' ? 'return' : 'enter', group]);
      }
      if (row[second - 1] && !any(row, second, second + ABSENT) && row.length - second >= ABSENT) found.push([second, 'leave', group]);
    }
  }
  const rate = onsetRate(model);
  const sum = (from, to) => { let total = 0; for (let i = from; i < to; i++) total += rate[i]; return total; };
  for (let second = 8; second < rate.length - 4; second++) {
    const now = sum(second, second + 4) / 4, before = sum(second - 8, second) / 8;
    if (before >= 2 && now >= before * 1.8) found.push([second, 'denser', '']);
    else if (before >= 4 && now <= before * 0.4) found.push([second, 'thinner', '']);
  }
  // Python sorts the (time, kind, what) tuples; the same order here.
  found.sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0));
  return {found, playing, labels};
}

function sentence(moment, playing, labels) {
  const at = whole(moment[0][0]);
  const kinds = new Map();
  for (const [, kind, what] of moment) kinds.set(kind, [...(kinds.get(kind) || []), what]);
  const names = groups => [...new Set(groups)].map(group => labels.get(group)).join('、');
  const sounding = [...playing].filter(([, row]) => row.slice(at, at + 3).some(Boolean)).map(([group]) => group);
  const parts = [];
  if (kinds.has('section')) parts.push(`进入${kinds.get('section')[0]}`);
  if (kinds.has('return')) parts.push((playing.get('vocals') || []).slice(0, at).some(Boolean) ? '人声回来了' : '人声进来了');
  if (kinds.has('leave')) {
    const gone = kinds.get('leave').filter(group => !(kinds.get('enter') || []).includes(group));
    const left = sounding.filter(group => !gone.includes(group));
    if (gone.length) parts.push(`${names(gone)}退出` + (left.length > 0 && left.length <= 2 ? `，只剩${names(left)}` : ''));
  }
  if (kinds.has('enter')) parts.push(`${names(kinds.get('enter'))}进来了`);
  if (!parts.length && kinds.has('thinner')) parts.push('一下子空了下来' + (sounding.length > 0 && sounding.length <= 2 ? `，只有${names(sounding)}` : ''));
  if (!parts.length && kinds.has('denser')) parts.push('音符密了起来');
  if (parts.length === 1 && kinds.has('section') && sounding.length) {
    parts.push(sounding.length > 2 ? `${names(sounding)}都在` : `只有${names(sounding)}`);
  }
  return parts.slice(0, CLAUSES).join('，') + '。';
}

// `[[start, end, text, 'rule']]` for a model; `hidden` lists lane groups to leave out of the telling.
// `options.captionStyle`: 'sentence' (default, the lines above) or 'mark' (adapter/cues.cjs:
// "object · event" marks, five-item rows), with `options.lang` 'zh' | 'en' for the marks.
function captions(model, hidden = [], options = {}) {
  if (options && options.captionStyle === 'mark') return require('./cues.cjs').cues(model, {hidden, lang: options.lang});
  if (!model || !model.track || !(model.track.duration > 0) || !Array.isArray(model.lanes)) return [];
  const {found, playing, labels} = events(model, hidden);
  const moments = [];
  for (const event of found) {
    const current = moments[moments.length - 1];
    if (current && event[0] - current[current.length - 1][0] <= MERGE && event[0] - current[0][0] <= SPAN) current.push(event);
    else moments.push([event]);
  }
  // A line appears with the most telling thing in it, not with whatever came first.
  // One line per SPACING seconds: when two would start too close, the more telling stays.
  const kept = [];
  for (const moment of moments) {
    let rank = Infinity, start = Infinity;
    for (const [time, kind] of moment) {
      if (PRIORITY[kind] < rank || (PRIORITY[kind] === rank && time < start)) { rank = PRIORITY[kind]; start = time; }
    }
    const last = kept[kept.length - 1];
    if (last && start - last.start < SPACING) {
      if (rank < last.rank) kept[kept.length - 1] = {moment, rank, start};
      continue;
    }
    kept.push({moment, rank, start});
  }
  return kept.map(({moment, start}, index) => {
    const following = index + 1 < kept.length ? kept[index + 1].start : model.track.duration;
    return [round2(start), round2(Math.min(start + SHOWN, following - 0.5)), sentence(moment, playing, labels), 'rule'];
  });
}

function mergeManual(rule,manual){
 const lines=(manual||[]).filter(n=>Number.isFinite(n.start)&&Number.isFinite(n.end)&&n.end>n.start&&typeof n.text==='string'&&n.text.trim()).map(n=>[n.start,n.end,n.text,'manual']);
 return [...(rule||[]).filter(r=>!lines.some(m=>r[0]<m[1]&&m[0]<r[1])),...lines].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
}
module.exports = {captions,mergeManual, SPACING, SHOWN};
