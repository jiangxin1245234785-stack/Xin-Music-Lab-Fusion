'use strict';
// core/sections.cjs: section names made in one place. Each rule has its own case, six real songs
// are pinned before -> after (their raw segments are a fixed copy in fixtures/sections-songs.json),
// and the call sites are checked to read the module rather than a table of their own.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sections = require('../core/sections.cjs');
const {tidySections, nameSegments, withSections, bridgeSegments, kindOfName} = sections;

const root = path.join(__dirname, '..');
const seg = (start, end, label) => ({start, end, label});
const names = (segments, extra = {}) => tidySections(segments, {engine: 'songformer', duration: 1000, ...extra}).map(row => row[2]);
const spans = (segments, extra = {}) => tidySections(segments, {engine: 'songformer', duration: 1000, ...extra}).map(row => row.slice(0, 3));

// --- the table --------------------------------------------------------------------------------
assert.deepEqual(Object.values(sections.TABLE.kinds).map(name => name.zh), ['引子', '主歌', '导歌', '副歌', '间奏', '桥段', '尾奏']);
assert.deepEqual(Object.values(sections.TABLE.kinds).map(name => name.en), ['Intro', 'Verse', 'Pre-chorus', 'Chorus', 'Interlude', 'Bridge', 'Outro']);
for (const label of ['inst', 'instrumental', 'interlude', 'solo', 'break']) assert.equal(sections.TABLE.labels[label], 'interlude', label);

// --- rule: holes are closed by the earlier section; silence stays a gap --------------------------
assert.deepEqual(spans([seg(0, 10, 'verse'), seg(12, 20, 'chorus')]), [[0, 12, '主歌'], [12, 20, '副歌']]);
assert.deepEqual(spans([seg(0, 10, 'verse'), seg(10, 12, 'silence'), seg(12, 20, 'chorus')]), [[0, 10, '主歌'], [12, 20, '副歌']]);
assert.deepEqual(spans([seg(0, 10, 'silence'), seg(14, 20, 'verse')]), [[14, 20, '主歌']], 'a hole after silence is not filled');

// --- rule: position ---------------------------------------------------------------------------
assert.deepEqual(names([seg(0, 10, 'intro'), seg(10, 30, 'verse'), seg(30, 40, 'intro'), seg(40, 60, 'chorus')]), ['引子', '主歌', '间奏', '副歌'], 'an intro after a verse is an interlude');
assert.deepEqual(names([seg(0, 20, 'verse'), seg(20, 30, 'intro')]), ['主歌', '尾奏'], 'an intro after the last verse is an outro');
assert.deepEqual(names([seg(0, 20, 'verse'), seg(20, 30, 'outro'), seg(30, 50, 'chorus')]), ['主歌', '间奏', '副歌'], 'an outro before the last chorus is an interlude');
assert.deepEqual(names([seg(0, 10, 'outro'), seg(10, 30, 'verse')]), ['引子', '主歌'], 'an outro before the first verse is an intro');
assert.deepEqual(names([seg(0, 10, 'intro'), seg(10, 20, 'inst'), seg(20, 40, 'verse')]), ['引子', '主歌'], 'inst before the first verse belongs to the intro');
assert.deepEqual(names([seg(0, 20, 'verse'), seg(20, 40, 'inst'), seg(40, 50, 'outro')]), ['主歌', '间奏', '尾奏'], 'inst at the end stays an interlude');
assert.deepEqual(names([seg(0, 20, 'verse'), seg(20, 40, 'inst'), seg(40, 60, 'chorus')]), ['主歌', '间奏', '副歌']);
// Instrumental: no verse, chorus or other core section. The interludes are the core.
assert.deepEqual(names([seg(0, 10, 'intro'), seg(10, 40, 'inst'), seg(40, 60, 'intro'), seg(60, 90, 'inst'), seg(90, 100, 'outro')]), ['引子', '间奏', '尾奏']);
assert.deepEqual(names([seg(0, 10, 'intro'), seg(10, 30, 'intro')]), ['引子'], 'nothing but intro: one intro');
assert.deepEqual(names([seg(0, 10, 'intro'), seg(10, 30, 'outro')]), ['引子', '尾奏']);
// A label the table does not know keeps its text and counts as a core section.
assert.deepEqual(names([seg(0, 10, 'intro'), seg(10, 30, 'drop'), seg(30, 40, 'intro'), seg(40, 60, 'drop')]), ['引子', 'drop 1', '间奏', 'drop 2']);

// --- rule: short pieces join a neighbour --------------------------------------------------------
assert.deepEqual(spans([seg(0, 22.7, 'verse'), seg(22.7, 23.9, 'chorus'), seg(23.9, 65.1, 'inst')]), [[0, 22.7, '主歌'], [22.7, 65.1, '间奏']], 'no same neighbour: the longer one');
assert.deepEqual(spans([seg(0, 30, 'verse'), seg(30, 33, 'chorus'), seg(33, 40, 'chorus'), seg(40, 60, 'verse')]), [[0, 30, '主歌 1'], [30, 40, '副歌'], [40, 60, '主歌 2']], 'a neighbour with the same name first');
assert.deepEqual(spans([seg(0, 10, 'silence'), seg(10, 12, 'chorus'), seg(12, 20, 'silence')]), [[10, 12, '副歌']], 'alone between silences: kept, never dropped');
assert.deepEqual(spans([seg(0, 0.5, 'verse'), seg(0.5, 20, 'chorus')]), [[0, 20, '副歌']], 'nothing is dropped for being short');

// --- rule: touching neighbours with the same name become one -------------------------------------
const merged = tidySections([seg(0, 10, 'intro'), seg(10, 28, 'intro'), seg(28, 48, 'verse'), seg(48, 68, 'verse')], {engine: 'songformer', duration: 100});
assert.deepEqual(merged, [[0, 28, '引子', 'songformer', 'intro', ['intro', 'intro']], [28, 68, '主歌', 'songformer', 'verse', ['verse', 'verse']]]);
const mixed = tidySections([seg(0, 20, 'verse'), seg(20, 40, 'inst'), seg(40, 60, 'intro'), seg(60, 80, 'verse')], {engine: 'songformer', duration: 100});
assert.deepEqual(mixed[1], [20, 60, '间奏', 'songformer', 'inst', ['inst', 'intro']], 'inst + a mid-song intro: one interlude, coloured by the first raw label');

// --- rule: numbering ----------------------------------------------------------------------------
assert.deepEqual(names([seg(0, 20, 'verse'), seg(20, 40, 'chorus'), seg(40, 60, 'verse')]), ['主歌 1', '副歌', '主歌 2']);
assert.deepEqual(names([seg(0, 20, 'verse'), seg(20, 40, 'chorus'), seg(40, 60, 'verse')], {lang: 'en'}), ['Verse 1', 'Chorus', 'Verse 2']);
assert.deepEqual(names([seg(0, 20, 'verse')], {lang: 'en-US'}), ['Verse']);

// --- clipping and engines that only cluster ------------------------------------------------------
assert.deepEqual(spans([seg(-1, 20, 'verse'), seg(19, 70, 'chorus')], {duration: 60}), [[0, 19, '主歌'], [19, 60, '副歌']]);
assert.deepEqual(tidySections([seg(0, 30, 'A'), seg(30, 30.5, 'B'), seg(30.5, 60, 'A')], {engine: 'clusterer', duration: 60}),
  [[0, 30, 'A', 'clusterer', 'A'], [30, 30.5, 'B', 'clusterer', 'B'], [30.5, 60, 'A', 'clusterer', 'A']], 'letters pass through, unnumbered, nothing dropped');

// --- per-segment names, the bridge manifest and XLD's own result ---------------------------------
const raw = [seg(0, 10, 'intro'), seg(10, 30, 'verse'), seg(30, 31, 'chorus'), seg(31, 50, 'verse'), seg(50, 55, 'silence'), seg(55, 60, 'outro')];
assert.deepEqual(nameSegments(raw, {engine: 'songformer', duration: 60}), ['引子', '主歌', '主歌', '主歌', null, '尾奏']);
const bridged = bridgeSegments({engine: {id: 'songformer'}, segments: raw.map(s => ({...s, confidence: 0.5}))}, 60);
assert.deepEqual(bridged[1], {start: 10, end: 30, label: 'verse', confidence: 0.5, name: '主歌'}, 'the original fields stay, `name` is added');
assert.equal('name' in bridged[4], false, 'silence has no name');
assert.deepEqual(bridgeSegments({engine: {id: 'clusterer'}, segments: [seg(0, 5, 'A')]}, 5), [{start: 0, end: 5, label: 'A', confidence: null}], 'clustering engines get no name');
const shown = withSections({engine: {id: 'songformer'}, duration: 60, segments: raw});
assert.equal(shown.segments, raw, 'raw segments untouched');
assert.deepEqual(shown.sections.map(row => [row.name.zh, row.name.en, row.label]), [['引子', 'Intro', 'intro'], ['主歌', 'Verse', 'verse'], ['尾奏', 'Outro', 'outro']]);
assert.deepEqual(shown.sections[1].labels, ['verse', 'chorus', 'verse']);
const clusterResult = {engine: {id: 'clusterer'}, segments: [seg(0, 5, 'A')]};
assert.equal(withSections(clusterResult), clusterResult);
assert.equal(kindOfName('主歌 12'), 'verse');
assert.equal(kindOfName('Interlude 3'), 'interlude');
assert.equal(kindOfName('inst'), 'interlude');
assert.equal(kindOfName('drop'), null);

// --- colour follows the tidied name (2026-11-14): same name, same colour -------------------------
// A renamed intro is an interlude like any other; a short chorus piece merged into an interlude no
// longer lends it the chorus colour (《Ego》10:28, 《Flowers of Romance》7:30 in the acceptance).
const coloured = withSections({engine: {id: 'songformer'}, duration: 200, segments: [
  seg(0, 10, 'intro'), seg(10, 40, 'verse'), seg(40, 41.2, 'chorus'), seg(41.2, 80, 'inst'), seg(80, 110, 'verse'),
  seg(110, 130, 'intro'), seg(130, 160, 'chorus'), seg(160, 162, 'intro'), seg(162, 180, 'drop'), seg(180, 200, 'drop')]});
assert.deepEqual(coloured.sections.map(row => [row.name.zh, row.label, row.colour]), [
  ['引子', 'intro', 'intro'], ['主歌 1', 'verse', 'verse'], ['间奏 1', 'chorus', 'inst'], ['主歌 2', 'verse', 'verse'],
  ['间奏 2', 'intro', 'inst'], ['副歌', 'chorus', 'chorus'], ['drop', 'drop', 'drop']],
  'colour by the name (the first raw label stays in `label` for the tooltip and the score)');
const colourOf = name => sections.colourLabel(name);
assert.deepEqual(['间奏 3', 'Interlude', '导歌 2', 'Pre-chorus', '桥段', '尾奏', 'drop 2', 'Outro 1'].map(colourOf), ['inst', 'inst', 'pre-chorus', 'pre-chorus', 'bridge', 'outro', 'drop', 'outro']);
{
  // The comparison bar (app.js): its own sectionRows, sectionColour and colour tables, taken out of the file and run
  // on the rows the main process hands over. (The timeline's blocks are checked as rendered in tests/timeline-view.cjs.)
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const take = name => {
    const at = app.search(new RegExp(`^(function ${name}\\(|const ${name} = )`, 'm'));
    assert.ok(at >= 0, `app.js has no ${name}`);
    let depth = 0, i = app.indexOf(app.startsWith('function', at) ? '{' : (app[app.indexOf('=', at) + 2] === '[' ? '[' : '{'), at);
    const open = app[i], close = open === '{' ? '}' : ']';
    for (; i < app.length; i++) { if (app[i] === open) depth++; else if (app[i] === close && --depth === 0) break; }
    return app.slice(at, i + 1) + (app.startsWith('const', at) ? ';' : '');
  };
  const vm = require('node:vm');
  const sandbox = {runtimeLocale: {locale: () => 'zh-CN'}, isHarmonyEngineId: () => false, chordColor: () => '#000'};
  vm.runInNewContext(['segmentColors', 'functionLabelColors', 'sectionRows', 'hashColor', 'sectionColour'].map(take).join('\n')
    + '\nthis.rows = sectionRows; this.colour = sectionColour;', sandbox);
  const shown = sandbox.rows(coloured);
  const byName = {};
  for (const row of shown) (byName[row.label.replace(/\s+\d+$/, '')] ||= new Set()).add(sandbox.colour('songformer', row));
  for (const [name, set] of Object.entries(byName)) assert.equal(set.size, 1, `对比条上所有「${name}」应当一个颜色`);
  assert.deepEqual([...byName['间奏']], ['#605d34'], '间奏用 inst 的颜色（改名来的、碎段并进来的也一样）');
  assert.deepEqual([...byName['引子']], ['#30684c']);
  assert.deepEqual([...byName['副歌']], ['#904c6e']);
  // The bar itself needs a whole page to draw; what can be read is that its blocks are coloured only through sectionColour.
  const render = take('renderComparison');
  assert.ok(render.includes('block.style.background = sectionColour(engineId, segment);') && !render.includes('style.background = hashColor('), 'the comparison bar colours its blocks through sectionColour');
}

// --- short pieces: the threshold has an upper bound too ---------------------------------------
// 4 s is short; 5 s and 7.9 s are sections of their own (a threshold moved to 8 s fails here).
assert.deepEqual(spans([seg(0, 30, 'verse'), seg(30, 35, 'chorus'), seg(35, 60, 'verse')]), [[0, 30, '主歌 1'], [30, 35, '副歌'], [35, 60, '主歌 2']], 'a 5 s chorus stays');
assert.deepEqual(spans([seg(0, 30, 'verse'), seg(30, 34.5, 'chorus'), seg(34.5, 60, 'verse')]), [[0, 30, '主歌 1'], [30, 34.5, '副歌'], [34.5, 60, '主歌 2']], 'a 4.5 s chorus stays (a threshold of 5 s fails here)');
assert.deepEqual(spans([seg(0, 30, 'verse'), seg(30, 37.9, 'inst'), seg(37.9, 60, 'chorus')]), [[0, 30, '主歌'], [30, 37.9, '间奏'], [37.9, 60, '副歌']], 'a 7.9 s interlude stays');
assert.deepEqual(spans([seg(0, 30, 'verse'), seg(30, 33.9, 'inst'), seg(33.9, 60, 'chorus')]), [[0, 33.9, '主歌'], [33.9, 60, '副歌']], 'a 3.9 s piece joins (the longer neighbour)');

// --- silence: the hole after it stays a hole, in every shape ------------------------------------
// The next section is never stretched back over it, whether the next one is long, short or merged.
// (The guard `!rows[i - 1].silent` in rule 1 cannot be seen from outside: a silent row is dropped
// whatever its end, so taking the guard away changes no output. These cases pin the behaviour.)
assert.deepEqual(spans([seg(0, 20, 'verse'), seg(20, 22, 'silence'), seg(25, 50, 'chorus')]), [[0, 20, '主歌'], [25, 50, '副歌']]);
assert.deepEqual(spans([seg(0, 20, 'verse'), seg(20, 22, 'silence'), seg(25, 27, 'verse'), seg(27, 50, 'chorus')]), [[0, 20, '主歌'], [25, 50, '副歌']], 'a short piece after silence joins forward, the hole stays');
assert.deepEqual(spans([seg(0, 2, 'silence'), seg(5, 30, 'verse')]), [[5, 30, '主歌']], 'silence at the start: the song starts where the music does');
assert.deepEqual(withSections({engine: {id: 'songformer'}, duration: 50, segments: [seg(0, 20, 'verse'), seg(20, 22, ''), seg(26, 50, 'chorus')]}).sections.map(row => [row.start, row.end]), [[0, 20], [26, 50]], 'an empty label is silence too');

// --- an old bridge manifest gets its names in memory -----------------------------------------------
const oldManifest = {timing: {duration: 60}, analyses: [{engine: {id: 'songformer'}, segments: raw.map(s => ({...s}))}, {engine: {id: 'clusterer'}, segments: [seg(0, 60, 'A')]}]};
const frozen = JSON.stringify(oldManifest);
const filled = sections.namedManifest(oldManifest);
assert.equal(JSON.stringify(oldManifest), frozen, 'the manifest passed in is not changed');
assert.deepEqual(filled.analyses[0].segments.map(s => s.name ?? null), ['引子', '主歌', '主歌', '主歌', null, '尾奏']);
assert.equal(filled.analyses[1], oldManifest.analyses[1], 'clustering engines untouched');
const fresh = {timing: {duration: 60}, analyses: [{engine: {id: 'songformer'}, segments: bridgeSegments({engine: {id: 'songformer'}, segments: raw}, 60)}]};
assert.equal(sections.namedManifest(fresh), fresh, 'a manifest that has its names comes back as it is');
assert.equal(sections.namedManifest(null), null);

// --- six real songs, before -> after --------------------------------------------------------------
// `before` is what the score view's old nameSections showed (work/xld-sections-20261113/sequences.txt).
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sections-songs.json'), 'utf8')).songs;
const pinned = {
  Besties: {before: '引子 1｜引子 2｜主歌 1｜主歌 2｜副歌 1｜副歌 2｜主歌 3｜副歌 3｜副歌 4｜器乐段｜副歌 5',
    after: '引子｜主歌 1｜副歌 1｜主歌 2｜副歌 2｜间奏｜副歌 3'},
  'Nancy Tries to Take the Night': {before: '引子 1｜器乐段 1｜引子 2｜主歌 1｜副歌 1｜器乐段 2｜副歌 2｜主歌 2｜副歌 3｜主歌 3｜副歌 4｜尾奏',
    after: '引子｜主歌 1｜副歌 1｜间奏｜副歌 2｜主歌 2｜副歌 3｜主歌 3｜副歌 4｜尾奏'},
  Ego: {before: '引子 1｜器乐段 1｜引子 2｜主歌 1｜器乐段 2｜引子 3｜主歌 2｜器乐段 3｜引子 4｜主歌 3｜副歌 1｜器乐段 4｜主歌 4｜副歌 2｜器乐段 5',
    after: '引子｜主歌 1｜间奏 1｜主歌 2｜间奏 2｜主歌 3｜副歌｜间奏 3｜主歌 4｜间奏 4'},
  MEGURI: {before: '引子 1｜主歌 1｜副歌 1｜引子 2｜主歌 2｜副歌 2｜器乐段 1｜尾奏｜引子 3｜主歌 3｜副歌 3｜主歌 4｜器乐段 2｜引子 4｜主歌 5｜副歌 4',
    after: '引子｜主歌 1｜副歌 1｜间奏 1｜主歌 2｜副歌 2｜间奏 2｜主歌 3｜副歌 3｜主歌 4｜间奏 3｜主歌 5｜副歌 4',
    en: 'Intro | Verse 1 | Chorus 1 | Interlude 1 | Verse 2 | Chorus 2 | Interlude 2 | Verse 3 | Chorus 3 | Verse 4 | Interlude 3 | Verse 5 | Chorus 4'},
  nemesis: {before: '引子 1｜副歌 1｜主歌 1｜引子 2｜主歌 2｜副歌 2｜器乐段 1｜尾奏 1｜器乐段 2｜尾奏 2',
    after: '引子｜副歌 1｜主歌 1｜间奏 1｜主歌 2｜副歌 2｜间奏 2｜尾奏'},
  Void: {before: '主歌 1｜主歌 2｜器乐段 1｜器乐段 2｜器乐段 3｜尾奏', after: '主歌｜间奏｜尾奏'}
};
for (const [title, want] of Object.entries(pinned)) {
  const song = fixture[title];
  const rows = tidySections(song.segments, {engine: 'songformer', duration: song.duration});
  assert.equal(rows.map(row => row[2]).join('｜'), want.after, title);
  assert.notEqual(want.after, want.before, title);
  if (want.en) assert.equal(tidySections(song.segments, {engine: 'songformer', duration: song.duration, lang: 'en'}).map(row => row[2]).join(' | '), want.en, title);
  for (let i = 1; i < rows.length; i++) assert.ok(Math.abs(rows[i][0] - rows[i - 1][1]) < 0.002 || rows[i - 1][5].length, `${title}: no gap between sections`);
  // The bridge manifest's per-segment names, run together, give the same string.
  const bridge = bridgeSegments({engine: {id: 'songformer'}, segments: song.segments}, song.duration).map(s => s.name).filter(Boolean).filter((n, i, a) => i === 0 || a[i - 1] !== n);
  assert.equal(bridge.join('｜'), want.after, `${title}: bridge names`);
}
// MEGURI's 4:28 outro (1.2 s, the seam window's end) is gone into its neighbour, not dropped.
const meguri = tidySections(fixture.MEGURI.segments, {engine: 'songformer', duration: fixture.MEGURI.duration});
assert.ok(meguri.some(row => row[0] < 268 && row[1] > 270 && row[5].includes('outro')), 'the short outro was merged, not dropped');

// --- the call sites read the module ---------------------------------------------------------------
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
assert.ok(read('core/analysis-service.cjs').includes("require('./sections.cjs')") && read('core/analysis-service.cjs').includes('bridgeSegments('), 'analysis service: bridge names from the module');
assert.ok(read('desktop/main.cjs').includes("require('../core/sections.cjs')") && read('desktop/main.cjs').includes('bridgeSegments(') && read('desktop/main.cjs').includes('withSections('), 'XLD main: bridge and screens from the module');
assert.ok(read('app.js').includes('sectionRows(') && read('timeline-controls.js').includes('result.sections'), 'XLD screens show the tidied sections');
// XML's main process: every place that reads a bridge manifest fills in missing names (in memory), and the score
// model gets the interface language. Same relative path the score adapter and open-request.cjs already use.
const xmlMain = fs.readFileSync(path.join(root, '..', 'fusion-runtime-baseline', 'desktop', 'main.cjs'), 'utf8');
assert.ok(xmlMain.includes("require('../../xld-runtime-baseline/core/sections.cjs')"), 'XML main reads the module');
assert.equal((xmlMain.match(/namedManifest\(/g) || []).length, 4, 'XML main: library scan, track load, opened bridge file and analysis response');
// The renderer may say which language it shows (since 2026-11-14, so a language switch needs no reload); else the app's.
assert.ok(xmlMain.includes('lang: normalizeLocale(payload?.lang) || mainLocale.getState().locale'), 'XML score model follows the interface language');
console.log('sections: ok');
