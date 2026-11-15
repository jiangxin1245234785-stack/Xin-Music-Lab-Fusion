'use strict';
// The "object · event" marks (adapter/cues.cjs, work/score-cues-20261113/SPEC.md).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {cues, candidates, choose, explain, WORDS, EN_NAMES, FORESHADOWED, constants: C} = require('../adapter/cues.cjs');
const {captions} = require('../adapter/captions.cjs');
const {modelFrom} = require('../adapter/track-model.cjs');

const LABELS = {vocals: '人声', guitar: '吉他', piano: '钢琴', strings: '弦乐', bass: '贝斯', drums: '鼓', violin: '小提琴'};

// A song from parts: {group: [[from, to, pitch, dB], ...]}. Notes every half second while a
// stretch plays; `levels` per second from the stretch's dB; `energy` the power sum of the parts,
// unless `options.energy(t)` says otherwise. `options.levels(group, t, db)` may reshape a level.
function song(duration, parts, options = {}) {
  const lanes = [];
  const levelAt = (group, t) => {
    const stretch = parts[group].find(([from, to]) => t >= from && t < to);
    const db = stretch ? (stretch[3] ?? -20) : -100;
    return options.levels ? options.levels(group, t, db) : db;
  };
  for (const [group, stretches] of Object.entries(parts)) {
    const lane = {id: group, label: LABELS[group] || group, group, groupLabel: LABELS[group] || group, kind: group === 'drums' ? 'drums' : group === 'vocals' ? 'melody' : 'pitched'};
    const notes = [];
    for (const [from, to, pitch = 60] of stretches) for (let t = from; t < to - 0.01; t += 0.5) notes.push([+t.toFixed(2), 0.45, pitch, 90]);
    if (lane.kind === 'drums') { lane.rows = ['kick']; lane.hits = notes.map(n => [n[0], 0, 100]); }
    else lane.notes = notes;
    lanes.push(lane);
  }
  const groups = {};
  for (const group of Object.keys(parts)) groups[group] = Array.from({length: Math.ceil(duration)}, (_, s) => levelAt(group, s + 0.5));
  const db = Array.from({length: Math.round(duration * 10)}, (_, k) => {
    const t = k / 10 + 0.05;
    if (options.energy) return options.energy(t);
    let sum = 0;
    for (const group of Object.keys(parts)) { const v = levelAt(group, t); if (v > -99) sum += Math.pow(10, v / 10); }
    return sum > 0 ? 10 * Math.log10(sum) : -100;
  });
  const model = {contract: 'xin.score-view/1', track: {id: 'x', title: 't', duration}, audio: {src: '', offset: 0}, lanes,
    energy: {hop: 0.1, db}, levels: {hop: 1, groups}};
  if (options.sections) model.sections = options.sections;
  if (options.contour) {
    const vocal = lanes.find(l => l.group === 'vocals');
    vocal.contour = options.contour;
  }
  return model;
}
const find = (list, kind, object) => list.filter(e => e.kind === kind && (object === undefined || e.object === object));
const near = (a, b, tolerance = 0.6) => Math.abs(a - b) <= tolerance;

// --- each event ----------------------------------------------------------------------------

test('a part first heard, leaving, and coming back: 首现, 退出, 重进', () => {
  const model = song(100, {guitar: [[0, 100, 60, -20]], drums: [[20, 40, 36, -18], [55, 85, 36, -18]]});
  const all = candidates(model);
  assert.ok(find(all, 'first', 'drums').some(e => near(e.at, 20)), JSON.stringify(all.map(e => [e.kind, e.object, e.at])));
  assert.ok(find(all, 'leave', 'drums').some(e => near(e.at, 40)));
  assert.ok(find(all, 'back', 'drums').some(e => near(e.at, 55)));
  assert.equal(find(all, 'first', 'guitar').length, 0, '开头 4 秒内不说');
});

test('a few stray notes are not a part playing, and a far-too-quiet part is not either', () => {
  const stray = song(60, {guitar: [[0, 60, 60, -20]], piano: [[30, 30.9, 72, -20]]});
  assert.equal(find(candidates(stray), 'first', 'piano').length, 0);
  const buried = song(60, {guitar: [[0, 60, 60, -10]], piano: [[30, 50, 72, -50]]});
  assert.equal(find(candidates(buried), 'first', 'piano').length, 0);
  // Within the level floor but a sliver of the mix: the jump around it is not its doing.
  const sliver = song(60, {guitar: [[0, 60, 60, -10]], drums: [[0, 60, 36, -10]], bass: [[0, 60, 36, -10]], piano: [[30, 50, 72, -28]]}, {energy: t => t < 30 ? -10 : -4});
  assert.equal(find(candidates(sliver), 'first', 'piano').length, 0);
  // A buried stretch is not the part playing at all: its first audible stretch is its 首现, not a 重进.
  const later = song(100, {guitar: [[0, 100, 60, -10]], piano: [[20, 40, 72, -50], [60, 85, 72, -12]]});
  const all = candidates(later);
  assert.ok(find(all, 'first', 'piano').some(e => near(e.at, 60)), JSON.stringify(all.map(e => [e.kind, e.object, e.at])));
  assert.equal(find(all, 'back', 'piano').length, 0);
});

test('only one part left after three or more: 仅 · 吉他; one of two leaving is not', () => {
  const model = song(80, {guitar: [[0, 70, 60, -20]], bass: [[0, 30, 36, -20]], drums: [[0, 30, 36, -20]], piano: [[0, 30, 72, -20]]});
  const all = candidates(model);
  assert.equal(find(all, 'only').length, 1, '几条轨一起退出，只说一次');
  assert.ok(find(all, 'only', 'guitar').some(e => near(e.at, 30)), JSON.stringify(all.map(e => [e.kind, e.object, e.at])));
  const two = song(80, {guitar: [[0, 70, 60, -20]], bass: [[0, 30, 36, -20]]});
  assert.equal(find(candidates(two), 'only').length, 0);
});

test('the whole band stopping briefly: 休止 then 重进; a long stop and the song edges are not', () => {
  const band = {guitar: [[0, 40, 60, -20], [41.5, 100, 60, -20]], drums: [[0, 40, 36, -18], [41.5, 100, 36, -18]]};
  const all = candidates(song(100, band));
  assert.ok(find(all, 'rest', 'all').some(e => near(e.at, 40, 0.2)), JSON.stringify(all.map(e => [e.kind, e.object, e.at])));
  assert.ok(find(all, 'back', 'all').some(e => near(e.at, 41.5, 0.2)));
  const long = song(100, {guitar: [[0, 40, 60, -20], [46, 100, 60, -20]], drums: [[0, 40, 36, -18], [46, 100, 36, -18]]});
  assert.equal(find(candidates(long), 'rest').length, 0);
  const edges = song(100, {guitar: [[6, 90, 60, -20]]});
  assert.equal(find(candidates(edges), 'rest').length, 0);
});

test('loudness: a jump up is 骤强, a fall (not to silence) is 骤弱, a steady climb is 渐强', () => {
  const energy = t => t < 30 ? -20 : t < 50 ? -12 : t < 60 ? -24 : t < 66 ? -24 + (t - 60) * 1.4 : -15;
  const model = song(100, {guitar: [[0, 100, 60, -20]]}, {energy});
  const all = candidates(model);
  assert.ok(find(all, 'surge').some(e => near(e.at, 30, 0.3)), JSON.stringify(all.map(e => [e.kind, e.at])));
  assert.ok(find(all, 'drop').some(e => near(e.at, 50, 0.3)));
  assert.ok(find(all, 'swell').some(e => e.at >= 59 && e.at <= 61));
  const flat = candidates(song(100, {guitar: [[0, 100, 60, -20]]}, {energy: () => -20}));
  assert.equal(flat.filter(e => ['surge', 'drop', 'swell'].includes(e.kind)).length, 0);
});

test('the voice at its highest held pitch is 最高点, and a one-frame spike is not', () => {
  const midi = Array.from({length: 6000}, (_, k) => k % 300 < 250 ? 60 + (k % 7) * 0.1 : null);
  midi[2000] = 80;                                 // a glitch at 20 s
  for (let k = 4000; k < 4060; k++) midi[k] = 67;  // held at 40 s
  const model = song(60, {vocals: [[0, 60, 60, -15]], guitar: [[0, 60, 55, -22]]}, {contour: {hop: 0.01, start: 0, midi}});
  const peak = find(candidates(model), 'peak', 'vocals');
  assert.equal(peak.length, 1);
  assert.ok(near(peak[0].at, 40, 0.3), String(peak[0].at));
});

test('the lead line changing hands: 主旋律 → 吉他; a lead that is just a part entering is said as the entrance', () => {
  // The guitar plays high all along but quietly; at 40 it gets loud and the piano drops back.
  const levels = (group, t, db) => group === 'guitar' ? (t < 40 ? -34 : -12) : group === 'piano' ? (t < 40 ? -12 : -34) : db;
  const model = song(90, {strings: [[0, 90, 55, -22]], piano: [[0, 90, 72, -12]], guitar: [[0, 90, 79, -12]]}, {levels});
  const lead = find(candidates(model), 'lead');
  assert.equal(lead.length, 1, JSON.stringify(lead));
  assert.equal(lead[0].object, 'guitar');
  assert.ok(near(lead[0].at, 40, 2.5));
  const entering = song(90, {strings: [[0, 90, 55, -22]], piano: [[0, 40, 72, -12]], guitar: [[40, 90, 79, -12]]});
  const all = candidates(entering);
  assert.equal(find(all, 'lead').length, 0, JSON.stringify(find(all, 'lead')));
  assert.equal(find(all, 'first', 'guitar').length, 1);
});

test('hidden parts take no part', () => {
  const model = song(80, {guitar: [[0, 70, 60, -20]], bass: [[0, 30, 36, -20]], drums: [[20, 50, 36, -20]], piano: [[0, 30, 72, -20]]});
  assert.ok(find(candidates(model), 'first', 'drums').length);
  const hidden = candidates(model, {hidden: ['drums']});
  assert.equal(hidden.filter(e => e.object === 'drums').length, 0);
  assert.ok(cues(model, {hidden: ['drums']}).every(row => row[4].object !== 'drums'));
  // Hidden by group: a part split into timbre lanes leaves with all of them.
  model.lanes.find(l => l.group === 'drums').id = 'drums/kit';
  assert.equal(candidates(model, {hidden: ['drums']}).filter(e => e.object === 'drums').length, 0);
});

test('nothing in the first seconds, nor in the last seconds before the sound ends', () => {
  const model = song(60, {guitar: [[0, 58, 60, -20]], piano: [[2, 30, 72, -20]], drums: [[10, 52, 36, -18]], bass: [[50, 58, 36, -18]]});
  const all = candidates(model);
  assert.equal(find(all, 'first', 'piano').length, 0, '2 秒处的首现不说');
  assert.ok(find(all, 'first', 'drums').length);
  assert.equal(find(all, 'first', 'bass').length, 0, '结尾前 10 秒的首现不说');
});

// --- each factor of the score ----------------------------------------------------------------

test('change: the same entrance with a bigger jump in the mix scores higher', () => {
  const parts = {guitar: [[0, 100, 60, -20]], piano: [[30, 100, 72, -20]], strings: [[60, 100, 70, -20]]};
  const energy = t => t < 30 ? -20 : t < 60 ? -8 : -8;     // the piano's entrance jumps 12 dB, the strings' nothing
  const all = candidates(song(100, parts, {energy}));
  const piano = find(all, 'first', 'piano')[0], strings = find(all, 'first', 'strings')[0];
  assert.ok(piano.change > strings.change + 0.5, `${piano.change} ${strings.change}`);
  assert.ok(piano.score > strings.score * 1.3, `${piano.score} ${strings.score}`);
});

test('foreground: of two entrances alike but for their share of the mix, the louder part scores higher', () => {
  const parts = {guitar: [[0, 100, 60, -20]], piano: [[30, 100, 72, -14]], strings: [[60, 100, 70, -26]]};
  const all = candidates(song(100, parts, {energy: () => -18}));
  const piano = find(all, 'first', 'piano')[0], strings = find(all, 'first', 'strings')[0];
  assert.equal(piano.change, strings.change);
  assert.ok(piano.foreground > strings.foreground);
  assert.ok(piano.score > strings.score * 1.3, `${piano.score} ${strings.score}`);
});

test('novelty: the second time the same part does the same thing is worth less', () => {
  const all = candidates(song(120, {guitar: [[0, 120, 60, -20]], drums: [[20, 40, 36, -20], [60, 80, 36, -20]]}, {energy: () => -18}));
  const first = find(all, 'first', 'drums')[0], again = find(all, 'back', 'drums')[0];
  assert.equal(first.novelty, 1);
  assert.equal(again.novelty, C.NOVELTY);
  assert.ok(again.score < first.score * 0.8, `${again.score} ${first.score}`);
});

test('weight: the voice, drums and bass weigh more than another part doing the same', () => {
  const make = group => find(candidates(song(80, {guitar: [[0, 80, 60, -20]], [group]: [[30, 80, 64, -20]]}, {energy: () => -18})), 'first', group)[0];
  const piano = make('piano'), vocals = make('vocals'), drums = make('drums'), bass = make('bass');
  assert.ok(Math.abs(vocals.score / piano.score - C.WEIGHT.vocals / C.WEIGHT.other) < 0.01, `${vocals.score} ${piano.score}`);
  assert.ok(drums.score > piano.score && bass.score > piano.score && vocals.score > drums.score);
});

test('a named section boundary adds to a real change at the same moment, and letters do not', () => {
  const parts = {guitar: [[0, 100, 60, -20]], drums: [[30, 100, 36, -20]]};
  const plain = find(candidates(song(100, parts, {energy: () => -18})), 'first', 'drums')[0];
  const named = find(candidates(song(100, parts, {energy: () => -18, sections: [[0, 30, '引子', 'songformer'], [30, 100, '主歌', 'songformer']]})), 'first', 'drums')[0];
  const letters = find(candidates(song(100, parts, {energy: () => -18, sections: [[0, 30, 'A', 'msaf'], [30, 100, 'B', 'msaf']]})), 'first', 'drums')[0];
  assert.ok(Math.abs(named.score / plain.score - C.SECTION_BONUS) < 0.001);
  assert.equal(letters.score, plain.score);
});

// --- how many ---------------------------------------------------------------------------------

test('below the floor nothing is said', () => {
  const model = song(100, {guitar: [[0, 100, 60, -14]], piano: [[30, 100, 72, -27]]}, {energy: () => -14});
  const all = candidates(model);
  const piano = find(all, 'first', 'piano')[0];
  assert.ok(piano && piano.score < C.FLOOR, String(piano && piano.score));
  const {kept, blocked} = choose(all, 100);
  assert.ok(!kept.some(e => e.object === 'piano'));
  assert.ok(blocked.some(e => e.object === 'piano' && e.reason === 'floor'));
});

test('at most PER_MINUTE a minute: a minute of six strong entrances keeps three', () => {
  const parts = {piano: [[6, 60, 72, -40]], strings: [[14, 60, 70, -30]], guitar: [[22, 60, 64, -20]], bass: [[30, 60, 36, -12]], drums: [[38, 60, 36, -6]], vocals: [[46, 60, 67, 0]]};
  const model = song(70, parts);
  const {kept, blocked, cap} = choose(candidates(model), 70);
  assert.equal(cap, Math.round(70 / 60 * C.PER_MINUTE));
  assert.equal(kept.length, cap);
  assert.ok(blocked.some(e => e.reason === 'cap'));
});

test('one on screen at a time: where two meet, the higher score stays', () => {
  const model = song(100, {guitar: [[0, 100, 60, -20]], drums: [[30, 100, 36, -14]], piano: [[31, 100, 72, -26]]});
  const all = candidates(model);
  const {kept, blocked} = choose(all, 100);
  assert.ok(kept.some(e => e.object === 'drums' && e.kind === 'first'));
  assert.ok(!kept.some(e => e.object === 'piano'));
  assert.ok(blocked.some(e => e.object === 'piano' && e.reason === 'collision'));
  for (let i = 1; i < kept.length; i++) assert.ok(kept[i].from >= kept[i - 1].to + C.GAP - 1e-9);
});

// --- what the rows look like -------------------------------------------------------------------

test('foreshadowed marks show PREVIEW seconds early; surprises show at their moment; all leave HOLD after', () => {
  assert.deepEqual([...FORESHADOWED].sort(), ['back', 'first', 'lead', 'peak', 'swell']);
  const model = song(100, {guitar: [[0, 70, 60, -20]], bass: [[0, 30, 36, -20]], drums: [[0, 30, 36, -20]], piano: [[0, 30, 72, -20]], vocals: [[45, 70, 67, -12]]});
  const rows = cues(model);
  const only = rows.find(r => r[4].word === 'only'), first = rows.find(r => r[4].word === 'first');
  assert.ok(only && first, JSON.stringify(rows));
  assert.equal(only[0], only[4].at);
  assert.equal(only[4].preview, false);
  assert.ok(Math.abs(first[0] - (first[4].at - 2)) < 0.011 && first[4].preview === true, '预告提前约 2 秒');
  for (const row of rows) assert.ok(Math.abs(row[1] - (row[4].at + C.HOLD)) < 0.011);
});

const NAMES_ZH = Object.values(LABELS);
const closed = (text, words, names) => {
  const word = Object.entries(words).filter(([k]) => !['only', 'lead', 'all', 'dot', 'arrow'].includes(k)).map(([, v]) => v);
  const [a, b] = text.split(words.dot);
  if (b !== undefined) return (a === words.all || names.includes(a)) && word.includes(b) || (a === words.only && names.includes(b));
  const [c, d] = text.split(words.arrow);
  return c === words.lead && names.includes(d);
};

test('every mark is spelled from the closed word list: object · event, 仅 · X, 主旋律 → X', () => {
  assert.deepEqual(Object.values(WORDS.zh).slice(0, 8), ['退出', '首现', '重进', '休止', '渐强', '骤强', '骤弱', '最高点']);
  assert.ok(!Object.values(WORDS.zh).includes('进入'), '「进入」已从词表去掉');
  assert.deepEqual(Object.keys(WORDS.en), Object.keys(WORDS.zh));
  assert.deepEqual(Object.values(WORDS.en).slice(0, 11), ['Out', 'First', 'Back', 'Rest', 'Swell', 'Surge', 'Drop', 'Peak', 'Only', 'Lead', 'All']);
  const levels = (group, t, db) => group === 'guitar' ? (t < 40 ? -34 : -12) : group === 'piano' ? (t < 40 ? -12 : -34) : db;
  const models = [
    song(100, {guitar: [[0, 70, 60, -20]], bass: [[0, 30, 36, -20]], drums: [[0, 30, 36, -20]], piano: [[0, 30, 72, -20]], vocals: [[45, 70, 67, -12]]}),
    song(90, {strings: [[0, 90, 55, -22]], piano: [[0, 90, 72, -12]], guitar: [[0, 90, 79, -12]]}, {levels}),
    song(100, {guitar: [[0, 40, 60, -20], [41.5, 100, 60, -20]], drums: [[0, 40, 36, -18], [41.5, 100, 36, -18]]})
  ];
  let seen = 0;
  for (const model of models) {
    for (const row of cues(model)) { seen++; assert.ok(closed(row[2], WORDS.zh, NAMES_ZH), row[2]); assert.ok(!/[了，。！？]/.test(row[2])); }
    for (const row of cues(model, {lang: 'en'})) assert.ok(closed(row[2], WORDS.en, Object.values(EN_NAMES)), row[2]);
  }
  assert.ok(seen >= 4);
  const words = new Set(models.flatMap(m => cues(m)).map(r => r[4].word));
  for (const word of ['only', 'first', 'lead', 'back']) assert.ok(words.has(word), [...words].join(','));
});

test('English marks: same structure, English words and names', () => {
  const model = song(100, {guitar: [[0, 100, 60, -20]], drums: [[20, 100, 36, -14]]});
  const zh = cues(model), en = cues(model, {lang: 'en'});
  assert.deepEqual(en.map(r => [r[0], r[1], r[3], r[4]]), zh.map(r => [r[0], r[1], r[3], r[4]]));
  assert.ok(en.some(r => r[2] === 'Drums · First'), JSON.stringify(en));
  assert.ok(zh.some(r => r[2] === '鼓 · 首现'));
});

test('the rows keep the old four items in place and carry the structure in a fifth', () => {
  const rows = cues(song(100, {guitar: [[0, 100, 60, -20]], drums: [[20, 100, 36, -14]]}));
  assert.ok(rows.length);
  for (const row of rows) {
    assert.equal(row.length, 5);
    assert.ok(row[1] > row[0] && typeof row[2] === 'string' && row[3] === 'rule');
    assert.deepEqual(Object.keys(row[4]).filter(k => k !== 'was').sort(), ['at', 'object', 'preview', 'score', 'word']);
  }
});

// --- 2026-11-14 acceptance: a floor for "first", a swell that climbs, the numbers pinned -------------

test('a part only in the noise is not first heard, whatever the others are doing (PART_FLOOR −70 dB)', () => {
  // Every stem in the noise for the first 16 s (七里香's opening: −95…−100), a few piano notes there: no 钢琴 · 首现 then.
  const quiet = song(80, {piano: [[5, 14, 60, -97], [40, 70, 60, -24]], guitar: [[16, 80, 52, -20]]},
    {energy: t => (t < 16 ? -20 : -18), levels: (group, t, db) => (t < 16 ? -98 : db)});
  const firsts = find(candidates(quiet), 'first', 'piano');
  assert.ok(!firsts.some(e => e.at < 16), JSON.stringify(firsts.map(e => e.at)));
  assert.ok(firsts.some(e => near(e.at, 40)), '真的首现（40 秒）要留下');
  // A quiet part above the floor, near the loudest, still counts.
  const soft = song(80, {piano: [[20, 60, 60, -62]], guitar: [[0, 80, 52, -50]]});
  assert.ok(find(candidates(soft), 'first', 'piano').some(e => near(e.at, 20)), '−62 dB 的钢琴（离最响的 12 dB、占约 6%）仍算');
  assert.equal(C.PART_FLOOR, -70);
});

test('a swell climbs: a rise made in one step is a 骤强, said once, not a 渐强 as well', () => {
  // A slow rise of 3.5 dB over 5 s, then one jump of 7 dB (七里香 2:26 / 2:32): the jump is most of the rise.
  const step = song(120, {guitar: [[0, 120, 52, -20]]}, {energy: t => (t < 44 ? -26 : t < 49 ? -26 + (t - 44) * 0.7 : -15.5)});
  const stepped = candidates(step).filter(e => e.at > 40 && e.at < 70);
  assert.equal(find(stepped, 'swell').length, 0, JSON.stringify(stepped.map(e => [e.kind, e.at])));
  assert.equal(find(stepped, 'surge').length, 1);
  // A steady climb of 14 dB over 4 s, fast enough that a second of it also reads as a 骤强: one 渐强, the 骤强 not said again.
  const climb = song(120, {guitar: [[0, 120, 52, -20]]}, {energy: t => (t < 50 ? -34 : t < 54 ? -34 + (t - 50) * 3.5 : -20)});
  const climbed = candidates(climb).filter(e => e.at > 40 && e.at < 70);
  assert.equal(find(climbed, 'swell').length, 1, JSON.stringify(climbed.map(e => [e.kind, e.at])));
  assert.equal(find(climbed, 'surge').length, 0, '同一处只说一次');
  assert.equal(C.SWELL_STEP, 0.6);
});

test('the numbers: 2.5 a minute (rounded), 1 s between marks, a floor of 0.5, gone 2.5 s after the moment', () => {
  const at = (time, score, kind = 'leave') => ({kind, object: 'guitar', at: time, score, change: 1, foreground: 1, novelty: 1, weight: 1});
  // Cap: 10 minutes keep 25; 78 s keep 3 (2.5 × 1.3 = 3.25, rounded down).
  const many = Array.from({length: 120}, (_, i) => at(5 + i * 5, 1));
  assert.equal(choose(many, 600).kept.length, 25);
  assert.equal(choose(many.filter(e => e.at < 78), 78).cap, 3);
  // Gap: two surprises whose spans (moment to moment + 2.5 s) are 0.9 s apart collide; 1.1 s apart both stay.
  assert.equal(choose([at(10, 2), at(13.4, 1)], 600).kept.length, 1);
  assert.equal(choose([at(10, 2), at(13.6, 1)], 600).kept.length, 2);
  // Floor: 0.49 is not said, 0.5 is.
  assert.equal(choose([at(10, 0.49)], 600).kept.length, 0);
  assert.equal(choose([at(10, 0.5)], 600).kept.length, 1);
  // Leaving: 2.5 s after the moment, for a surprise and for a foreshadowed mark (shown 2 s early).
  const [surprise] = choose([at(30, 1)], 600).kept, [ahead] = choose([at(30, 1, 'first')], 600).kept;
  assert.deepEqual([surprise.from, surprise.to], [30, 32.5]);
  assert.deepEqual([ahead.from, ahead.to], [28, 32.5]);
});

// --- the switch -----------------------------------------------------------------------------------

test("captionStyle: 'sentence' (and no option) gives exactly the old sentences; 'mark' gives the marks", () => {
  const model = song(100, {guitar: [[0, 100, 60, -20]], drums: [[20, 40, 36, -18], [55, 85, 36, -18]], vocals: [[30, 90, 67, -14]]}, {sections: [[0, 30, '引子', 'songformer'], [30, 100, '主歌', 'songformer']]});
  const old = captions(model);
  assert.ok(old.length && old.every(r => r.length === 4 && r[2].endsWith('。')));
  assert.deepEqual(captions(model, [], {captionStyle: 'sentence'}), old);
  assert.deepEqual(captions(model, [], {}), old);
  assert.deepEqual(captions(model, [], {captionStyle: 'mark'}), cues(model));
  assert.deepEqual(captions(model, ['drums'], {captionStyle: 'mark', lang: 'en'}), cues(model, {hidden: ['drums'], lang: 'en'}));
});

test('the adapter passes captionStyle through and defaults to marks (since 2026-11-14)', () => {
  const note = (start, end, pitch) => ({start, end, pitch, velocity: 100});
  const run = (from, to, pitch) => Array.from({length: (to - from) * 2}, (_, i) => note(from + i / 2, from + i / 2 + 0.4, pitch));
  const input = {track: {id: 'x', title: 't'}, audioUrl: 'file:///a', duration: 80, stems: {guitar: {notes: run(0, 80, 52)}, bass: {notes: run(30, 60, 36)}, vocals: {notes: run(40, 80, 60)}}};
  const plain = modelFrom({...input, captionStyle: 'sentence'}).model.captions;
  assert.ok(plain.length && plain.every(r => r.length === 4));
  assert.deepEqual(modelFrom(input).model.captions, modelFrom({...input, captionStyle: 'mark'}).model.captions, '不给就是标注');
  assert.deepEqual(modelFrom({...input, captionStyle: 'nonsense'}).model.captions, modelFrom({...input, captionStyle: 'mark'}).model.captions, '不认识的值也是标注');
  const marked = modelFrom({...input, captionStyle: 'mark'}).model.captions;
  assert.ok(marked.length >= 2 && marked.every(r => r.length === 5 && r[4].word), JSON.stringify(marked));
  assert.ok(marked.some(r => r[2] === '人声 · 首现') && marked.some(r => r[2].startsWith('贝斯')), '只有音符、没有响度层的歌也有标注');
});

// --- the real pilots ---------------------------------------------------------------------------------

const DATA = path.join(__dirname, '..', '..', '..', 'work', 'scoreview-20261110', 'data');
const page = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'audition', 'page.json'), 'utf8'));
for (const pilot of ['qilixiang', 'meguri']) {
  const file = path.join(DATA, pilot, 'bundle.json');
  test(`${pilot}: within the cap, never two on screen, none in the first seconds, every one from the word list`, {skip: !fs.existsSync(file)}, () => {
    const model = JSON.parse(fs.readFileSync(file, 'utf8'));
    const hidden = (page.songs[pilot] || {}).hidden || [];
    const rows = cues(model, {hidden});
    const perMinute = rows.length / model.track.duration * 60;
    assert.ok(perMinute >= 0.5 && rows.length <= Math.round(model.track.duration / 60 * C.PER_MINUTE), `${rows.length} (${perMinute.toFixed(2)}/min)`);
    rows.forEach((row, i) => {
      assert.ok(row[4].at >= C.QUIET && row[4].score >= C.FLOOR);
      assert.ok(closed(row[2], WORDS.zh, NAMES_ZH), row[2]);
      if (i) assert.ok(row[0] >= rows[i - 1][1] + C.GAP - 0.011, `${rows[i - 1]} / ${row}`);
      assert.ok(!hidden.includes(row[4].object));
    });
    const table = explain(model, {hidden});
    assert.equal(table.kept.length, rows.length);
    assert.ok(table.blocked.length <= 5);
  });
}
