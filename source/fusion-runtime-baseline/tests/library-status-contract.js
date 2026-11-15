'use strict';
// SPEC-B3, items 1 and 2: the library row's one word, and the start page's 最近播放 record.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../library-status.js');

// --- status words -------------------------------------------------------------------------
const cases = [
  [{hasNotes: true, hasStems: true, hasStructure: true, hasHarmony: true}, 'score', '可看谱面', true],
  [{hasNotes: true, hasStems: true}, 'score', '可看谱面', true],
  [{hasStems: true, hasStructure: true}, 'stems', '只有分轨', false],
  [{hasStems: true}, 'stems', '只有分轨', false],
  [{hasStructure: true, hasHarmony: true}, 'sections', '只有段落', false],
  [{hasStructure: true}, 'sections', '只有段落', false],
  [{hasHarmony: true}, 'sections', '只有和弦', false],
  [{}, 'none', '还没分析', false],
  [null, 'none', '还没分析', false]
];
for (const [track, kind, word, ready] of cases) {
  assert.equal(S.statusOf(track), kind, JSON.stringify(track));
  assert.equal(S.wordOf(track)[1], word, JSON.stringify(track));
  assert.equal(S.isReady(track), ready, JSON.stringify(track));
  assert.ok(S.hintOf(track)[0].startsWith('library.statusHint.'));
}
// Short words: at most four characters in Chinese, and every word / hint is in both languages.
for (const [key, zh] of Object.values(S.WORDS)) assert.ok([...zh].length <= 4, `${key} ${zh}`);
const catalogs = fs.readFileSync(path.join(__dirname, '..', 'i18n', 'catalogs.js'), 'utf8');
for (const [key, zh] of [...Object.values(S.WORDS), ...Object.values(S.HINTS)]) {
  const hits = catalogs.split(`'${key}':`).length - 1;
  assert.equal(hits, 2, `${key} in both languages`);
  assert.ok(catalogs.includes(`'${key}':'${zh}'`), `${key} Chinese copy matches the fallback`);
}
// No letters for states (the old S / H) and no amber for them.
const css = fs.readFileSync(path.join(__dirname, '..', 'shell.css'), 'utf8') + fs.readFileSync(path.join(__dirname, '..', 'xml-studio.css'), 'utf8');
const stateRules = css.split(/\r?\n/).filter(line => line.includes('fusion-library-track__state'));
assert.ok(stateRules.length >= 2);
for (const rule of stateRules) assert.doesNotMatch(rule, /accent/, rule);
assert.ok(stateRules.some(rule => rule.includes('[data-analysis-state="score"]')), 'green only for score');
const fusion = fs.readFileSync(path.join(__dirname, '..', 'fusion.js'), 'utf8');
assert.match(fusion, /analysis\.dataset\.analysisState = kind;/);
assert.match(fusion, /status\.wordOf\(track\)/);
// The scan adds the two facts by looking for files only.
const main = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'main.cjs'), 'utf8');
assert.match(main, /const stemFacts = async manifestPath =>/);
assert.match(main, /const stemFields = linked => stemFacts\(linked\?\.filePath\);/);
assert.equal((main.match(/\.\.\.\(await stemFields\(linked\)\)/g) || []).length, 2, 'album tracks and loose tracks');
assert.doesNotMatch(main.slice(main.indexOf('const stemFacts'), main.indexOf('const scanFusionLibrary')), /writeFile|mkdir|rename|unlink|rm\(/);

// --- 最近播放 -------------------------------------------------------------------------------
assert.deepEqual(S.readRecent(''), []);
assert.deepEqual(S.readRecent('not json'), []);
assert.deepEqual(S.readRecent('{"id":"a"}'), []);
assert.deepEqual(S.readRecent('[{"id":"a","at":1},{"id":"","at":2},{"id":"b"},{"id":"a","at":0},{"id":"c","at":3}]'),
  [{id: 'a', at: 1}, {id: 'c', at: 3}], 'drops bad rows and repeats');
let list = [];
list = S.addRecent(list, 'a', 1);
list = S.addRecent(list, 'b', 2);
list = S.addRecent(list, 'a', 3);
assert.deepEqual(list, [{id: 'a', at: 3}, {id: 'b', at: 2}], 'played again moves to the front, once');
assert.deepEqual(S.addRecent(list, '', 4), list, 'no id, no change');
// Only id and time are kept, even if more is passed in.
assert.deepEqual(Object.keys(S.addRecent([{id: 'x', at: 1, title: 'secret', path: 'D:/x'}], 'y', 2)[1]), ['id', 'at']);
// The limit.
for (let i = 0; i < 40; i++) list = S.addRecent(list, `t${i}`, 10 + i);
assert.equal(list.length, S.RECENT_LIMIT);
assert.equal(list[0].id, 't39');
assert.equal(list[S.RECENT_LIMIT - 1].id, `t${40 - S.RECENT_LIMIT}`);
assert.ok(S.RECENT_LIMIT >= 6 && S.RECENT_LIMIT <= 50);
// As library tracks: ones no longer in the library are skipped; the page shows at most `count`.
const library = [{id: 't39', title: 'A'}, {id: 't37', title: 'B'}, {id: 't30', title: 'C'}];
assert.deepEqual(S.recentTracks(list, library, 6).map(t => t.title), ['A', 'B', 'C']);
assert.deepEqual(S.recentTracks(list, library, 2).map(t => t.title), ['A', 'B']);
assert.deepEqual(S.recentTracks(null, library, 6), []);

// --- the start page uses them -----------------------------------------------------------------
assert.match(fusion, /dom\.audio\.addEventListener\('play', \(\) => rememberPlayed\(state\.selectedTrackId\)\);/);
assert.match(fusion, /localStorage\.setItem\(lists\.RECENT_KEY/);
assert.match(fusion, /HOME_ROWS=6/);
assert.match(fusion, /state\.library\.filter\(lists\.isReady\)\.slice\(0,HOME_ROWS\)/);
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.ok(html.indexOf('library-status.js') > 0 && html.indexOf('library-status.js') < html.indexOf('src="./fusion.js"'));
assert.match(html, /id="homeRecentSection"/);
assert.match(html, /id="homeAnalyzedSection"/);

// --- the drawer says it the same way (B3 follow-up, 2) -----------------------------------------
// Header count, album count and the 只看可看谱面 filter all mean 可看谱面, nothing about sections / chords.
assert.equal((fusion.match(/state\.analyzedOnly \|\| scoreReady\(track\)/g) || []).length, 2, 'both filter paths');
assert.match(fusion, /const scoreReady = track => Boolean\(window\.XinLibraryStatus\?\.isReady\(track\)\);/);
assert.match(fusion, /album\.analyzedCount=album\.tracks\.filter\(scoreReady\)\.length;/);
assert.match(fusion, /info\.analyzedCount=state\.library\.filter\(scoreReady\)\.length;/);
assert.doesNotMatch(fusion, /analyzedOnly \|\| track\.hasStructure/);
assert.equal((main.match(/analyzedCount: \w+\.filter\(track => track\.hasNotes\)\.length/g) || []).length, 3, 'scan counts notes');
assert.doesNotMatch(main, /analyzedCount: \w+\.filter\(track => track\.hasStructure/);
for (const [key, zh] of [['fusion.runtime.libraryMeta', '{albums} 张专辑 · {tracks} 首 · {analyzed} 首可看谱面'], ['fusion.runtime.analyzedSuffix', ' · {count} 首可看谱面'], ['fusion.analyzedOnly', '只看可看谱面']]) {
  assert.ok(catalogs.includes(`'${key}': '${zh}'`), `${key} says 可看谱面`);
}
assert.match(html, /<input id="fusionLibraryAnalyzed" type="checkbox" \/><span>只看可看谱面<\/span>/);
assert.doesNotMatch(catalogs + html + fusion, /首已有分析|仅已分析|'有段落或和弦'/);
// The filter behaves: only score-ready rows stay.
const rows = [{id: 1, hasNotes: true, hasStems: true}, {id: 2, hasStems: true}, {id: 3, hasStructure: true}, {id: 4}];
assert.deepEqual(rows.filter(S.isReady).map(r => r.id), [1]);

// --- B3 acceptance --------------------------------------------------------------------------------
// M1: the one-track refresh (also run when the window gets focus back from XLD) looks at stems / notes again,
// whether or not music-lab.json changed, and the rows, counts, filter and start page follow.
assert.match(main, /if \(loaded && loaded\.ok\) loaded\.trackFacts = await stemFacts\(loaded\.filePath\);/);
const refresh = fusion.slice(fusion.indexOf('async function refreshCurrentResults'), fusion.indexOf('finally{refreshingResults=false'));
assert.match(refresh, /if\(payload\.trackFacts\)Object\.assign\(track,\{hasStems:Boolean\(payload\.trackFacts\.hasStems\),hasNotes:Boolean\(payload\.trackFacts\.hasNotes\)\}\);/);
assert.ok(refresh.indexOf('payload.trackFacts') > refresh.indexOf('if(changed){') && refresh.indexOf('if(changed||statusChanged)applyTrackFacts(track);') > refresh.indexOf('payload.trackFacts'), 'facts outside the manifest-changed branch');
assert.match(fusion, /window\.addEventListener\('focus',\(\)=>refreshCurrentResults\(\)\);/);
const apply = fusion.slice(fusion.indexOf('function applyTrackFacts'), fusion.indexOf('function sayTrackState'));
for (const piece of ['album.analyzedCount=album.tracks.filter(scoreReady).length', 'info.analyzedCount=state.library.filter(scoreReady).length', 'renderLibrary();renderHome();', 'sayTrackState(track)']) assert.ok(apply.includes(piece), piece);
// The same rule on a stand-in: a track that comes back with notes turns 可看谱面 and is counted.
{
  const track = {id: 'm', hasStructure: true, hasStems: true, hasNotes: false};
  const before = S.statusOf(track);
  Object.assign(track, {hasStems: true, hasNotes: true});
  assert.equal(before, 'stems'); assert.equal(S.statusOf(track), 'score');
  assert.deepEqual([track, {id: 'x'}].filter(S.isReady).map(t => t.id), ['m']);
}
// L1: the drawer's status line uses the row's words, not sections / chords.
assert.match(fusion, /sayTrackState\(libraryTrack\);/);
assert.match(fusion, /bindUiText\(dom\.status,'fusion\.runtime\.trackState'/);
assert.doesNotMatch(fusion + catalogs, /trackReadyAnalyzed|自动接入|暂无离线分析/);
assert.ok(catalogs.includes("'fusion.runtime.trackState': '这首歌：{state}'") && catalogs.includes("'fusion.runtime.trackState': 'This song: {state}'"));
// L2: one wording for opening XLD on a song.
assert.ok(catalogs.includes("'library.analyze':'在 XLD 里分析 ↗'") && catalogs.includes("'fusion.advancedLab': '在 XLD 里分析 ↗'"));
assert.match(html, /<button id="fusionOpenXldLab" type="button" title="在 XLD 里分析这首歌">在 XLD 里分析 ↗<\/button>/);
assert.doesNotMatch(catalogs + html + fusion, /在 XLD 分析 ↗|在 XLD 中分析当前曲目|>在 XLD 中分析</);
// L4: songs no longer in the library keep their own places; they never push out songs that are.
{
  const here = new Set(['h0', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8', 'h9', 'h10', 'h11', 'h12', 'h13']);
  const known = id => here.has(id);
  let mixed = [];
  for (let i = 0; i < 20; i++) mixed = S.addRecent(mixed, `away${i}`, i);
  for (let i = 0; i < 14; i++) mixed = S.addRecent(mixed, `h${i}`, 100 + i, known);
  const live = mixed.filter(item => known(item.id)), away = mixed.filter(item => !known(item.id));
  assert.equal(live.length, S.RECENT_LIMIT, 'this library keeps all its places');
  assert.equal(live[0].id, 'h13');
  assert.equal(away.length, S.RECENT_LIMIT, 'the other folder keeps its own, not more');
  assert.ok(away.every(item => /^away/.test(item.id)));
  const lib = [...here].map(id => ({id}));
  assert.deepEqual(S.recentTracks(mixed, lib, 6).map(t => t.id), ['h13', 'h12', 'h11', 'h10', 'h9', 'h8']);
  assert.deepEqual(S.recentTracks(mixed, [{id: 'away19'}, {id: 'away18'}], 6).map(t => t.id), ['away19', 'away18']);
  assert.ok(S.readRecent(JSON.stringify(mixed)).length <= S.RECENT_LIMIT * 2);
}
assert.match(fusion, /lists\.addRecent\(recentRecord\(\),id,Date\.now\(\),known=>Boolean\(trackById\(known\)\)\)/);

console.log('library status contract ok');
