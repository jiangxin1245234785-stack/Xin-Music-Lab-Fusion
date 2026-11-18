'use strict';
// The lane page (2026-11-14), the arithmetic in lane-page.js: the 2–98 % pitch window, default and zoomed row
// heights, the drawn range, the problem-note list and its walk, lane stepping, note names and the pointer readout.
// Plus the wiring the page depends on: script order, the root class and its CSS, both locales of every new string.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const LP = require('../lane-page.js');

// --- the pitch window ------------------------------------------------------------------------------------------------
{
  // A bass living in E1–E2 with three stray notes two octaves up: the window ignores the strays.
  const pitches = [...Array.from({length: 300}, (_, i) => 28 + (i % 13)), 64, 65, 67];
  const window = LP.pitchWindow(pitches);
  assert.equal(window.low, 26, 'low: the 2nd percentile less two semitones');
  assert.equal(window.high, 42, 'high: the 98th percentile plus two, strays left out: ' + window.high);
  assert.deepEqual(LP.pitchWindow([60]), {low: 58, high: 62}, 'a single pitch still gets its two semitones each side');
  assert.deepEqual(LP.pitchWindow([]), {low: 48, high: 72}, 'no notes: a neutral two octaves');
  assert.deepEqual(LP.pitchWindow([0, 1, 126, 127]), {low: 0, high: 127}, 'clamped to MIDI');
  assert.equal(LP.quantile([1, 2, 3, 4], 0.5), 2.5, 'interpolated between order statistics');
}

// --- row heights -------------------------------------------------------------------------------------------------------
{
  assert.equal(LP.defaultRow(17, 600), 28, 'a narrow window is capped at 28 px a row');
  assert.equal(LP.defaultRow(40, 600), 15, 'otherwise rows share the room');
  assert.equal(LP.defaultRow(127, 600), 8, 'and never go below 8 px');
  assert.equal(LP.defaultRow(4, 600), 28, 'drums: four kit pieces, 28 px each');
  assert.equal(LP.zoomStep(18, 1), 23, '+ is a quarter taller');
  assert.equal(LP.zoomStep(18, -1), 14, '− is a quarter shorter');
  assert.equal(LP.zoomStep(6, 1), 8, 'and at least one pixel from small rows');
  assert.equal(LP.zoomStep(40, 1), 40, 'zoom tops out at 40');
  assert.equal(LP.zoomStep(6, -1), 6, 'and bottoms out at 6');
  assert.equal(LP.clampRow(99), 40); assert.equal(LP.clampRow(1), 6);
  // drum rows: a handful of kit pieces fill the page, so they may be taller, by default and by hand
  assert.equal(LP.defaultRow(6, 500, LP.KEYS_ROW), 72, 'six kit pieces: 72 px each, not 28');
  assert.equal(LP.defaultRow(12, 500, LP.KEYS_ROW), 41, 'more of them share the room');
  assert.equal(LP.zoomStep(40, 1, LP.KEYS_ROW.max), 50, 'a drum row zooms past 40');
  assert.equal(LP.zoomStep(72, 1, LP.KEYS_ROW.max), 72, 'and tops out at 72');
  assert.equal(LP.clampRow(99, LP.KEYS_ROW.max), 72);
}

// --- the loudness strip's scale ---------------------------------------------------------------------------------------
{
  // stored values are dB (255 = full scale, 60 dB over 255 steps); the strip is linear amplitude against the loudest
  const table = LP.waveScale(Uint8Array.from([0, 100, 200, 174]));
  assert.equal(table[0], 0, 'silence draws nothing');
  assert.equal(table[200], 1, 'the loudest 10 ms is the full height');
  assert.ok(Math.abs(table[174] - 0.5) < 0.01, '6 dB quieter (about 26 steps) is half as tall');
  assert.ok(table[100] > 0 && table[100] < 0.08, 'far quieter is a sliver, not a solid band');
  assert.equal(table[255], 1, 'never taller than the strip');
  assert.equal(LP.waveScale([]).every(value => value === 0), true, 'no envelope: an empty table');
}

// --- the drawn range ----------------------------------------------------------------------------------------------------
{
  const window = {low: 26, high: 42};
  const tight = LP.drawnRange({notesLow: 28, notesHigh: 67, window, row: 20, avail: 0});
  assert.deepEqual(tight, {low: 26, high: 69, span: 44}, 'every note, plus two semitones, stays in range');
  const filled = LP.drawnRange({notesLow: 40, notesHigh: 44, window: {low: 38, high: 46}, row: 28, avail: 700});
  assert(filled.span * 28 >= 700, 'a narrow part is padded out until the rows fill the page: ' + JSON.stringify(filled));
  assert(filled.low <= 38 && filled.high >= 46);
  const edge = LP.drawnRange({notesLow: 0, notesHigh: 3, window: {low: 0, high: 5}, row: 8, avail: 2000});
  assert.equal(edge.low, 0, 'padding stops at MIDI 0');
  assert.equal(LP.windowTop({high: 69}, window, 20), 540, 'the window top row sits at (high − window.high) rows');
}

// --- problem notes --------------------------------------------------------------------------------------------------------
{
  // [start, end, pitch, velocity, instrument, index]
  const notes = [[5, 6, 40, 80, 0, 0], [1, 2, 41, 80, 0, 1], [3, 4, 42, 80, 0, 2], [7, 8, 43, 80, 0, 3], [9, 10, 44, 80, 0, 4]];
  const evidence = {verdicts: [3, 0, 1, 2, 0], extend: {1: 2.4, 4: 10.5}};
  const list = LP.issues(notes, evidence);
  assert.deepEqual(list.map(item => [item.start, item.kinds.join('+')]), [[1, 'short'], [5, 'silent'], [9, 'short']],
    'silent and short, in time order; weak (1, 2) is not a problem to fix');
  assert.deepEqual(LP.issues(notes, null), [], 'no check, no list');
  assert.deepEqual(LP.verdictOf(notes[2], evidence), ['weak'], 'weak is still said in the readout');
  assert.deepEqual(LP.verdictOf([0, 1, 40, 80, 0, 9], {verdicts: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3], extend: {9: 2}}), ['silent', 'short']);
  assert.equal(LP.verdictOf(notes[4], {verdicts: [0, 0, 0, 0, 0], extend: {}}), null);
  assert.equal(LP.issueStep(3, -1, 1), 0, '] before any jump: the first');
  assert.equal(LP.issueStep(3, -1, -1), 2, '[ before any jump: the last');
  assert.equal(LP.issueStep(3, 2, 1), 0, 'wraps forward');
  assert.equal(LP.issueStep(3, 0, -1), 2, 'and back');
  assert.equal(LP.issueStep(0, 0, 1), -1, 'nothing to walk');
}

// --- lanes, names, readout -------------------------------------------------------------------------------------------------
{
  assert.equal(LP.laneStep(['bass', 'piano', 'drums'], 'piano', 1), 'drums');
  assert.equal(LP.laneStep(['bass', 'piano', 'drums'], 'drums', 1), 'bass', 'wraps at the end');
  assert.equal(LP.laneStep(['bass', 'piano', 'drums'], 'bass', -1), 'drums', 'and at the start');
  assert.equal(LP.laneStep(['bass'], 'bass', 1), null, 'one lane: nowhere to go');
  assert.equal(LP.pitchName(42), 'F#2'); assert.equal(LP.pitchName(60), 'C4'); assert.equal(LP.pitchName(0), 'C-1');
  assert.equal(LP.isBlack(61), true); assert.equal(LP.isBlack(64), false);
  assert.equal(LP.seconds(83.4567), '1:23.457');
  const rt = (key, params) => ({'runtime.lanePage.start': '起点 {value}', 'runtime.lanePage.length': '时长 {value} 秒', 'runtime.lanePage.velocity': '力度 {value}',
    'runtime.lanePage.verdict.silent': '静音里', 'runtime.lanePage.verdict.weak': '证据弱', 'runtime.lanePage.verdict.short': '写短了'}[key] || key)
    .replace(/\{(\w+)\}/g, (_, name) => params?.[name]);
  assert.equal(LP.readout([83.25, 83.5, 42, 96, 0, 1], {rt, evidence: {verdicts: [0, 3], extend: {1: 84}}}), 'F#2 · 起点 1:23.250 · 时长 0.250 秒 · 力度 96 · 静音里 · 写短了');
  assert.equal(LP.readout([1, 1.1, 38, 90, 0, 0], {rt, drumName: 'snare'}), 'snare (38) · 起点 0:01.000 · 时长 0.100 秒 · 力度 90', 'drums are named by kit piece; no check, no verdict');
}

// --- wiring --------------------------------------------------------------------------------------------------------------
{
  const html = read('index.html'), css = read('workspace.css'), controls = read('timeline-controls.js'), shell = read('workbench-shell.js');
  assert(/<script src="lane-page\.js"><\/script>\s*<script src="timeline-toolbar\.js"><\/script>\s*<script src="timeline-controls\.js">/.test(html), 'lane-page.js loads before the toolbar and the controller');
  assert(/classList\?\.toggle\('xld-lane-page', open\)/.test(controls), 'the controller puts the class on the root element');
  for (const selector of ['.topbar', '.workspace-library', '.workspace-topline', '#workbenchPanel:not([data-panel="properties"])'])
    assert(css.includes(selector) && css.includes('html.xld-lane-page'), 'the lane page folds away ' + selector);
  assert(/aside\.dataset\.panel=current/.test(shell), 'the tool panel says which page it shows (属性 stays usable on the lane page)');
  assert(/grid-template-columns:56px minmax\(0,1fr\)/.test(css), 'a 56 px keyboard column instead of the lane heads');
  assert(!/altKey/.test(controls), 'no Alt modifier (the Windows menu bar owns it)');
  const messages = read('i18n/runtime-messages.js');
  const keys = [...new Set([...read('lane-page.js').matchAll(/'(runtime\.lanePage\.[a-zA-Z.]+)'/g), ...read('timeline-toolbar.js').matchAll(/'(runtime\.lanePage\.[a-zA-Z.]+)'/g),
    ...controls.matchAll(/'(runtime\.lanePage\.[a-zA-Z.]+)'/g)].map(m => m[1]))].filter(key => !key.endsWith('.'));
  keys.push('runtime.lanePage.verdict.silent', 'runtime.lanePage.verdict.weak', 'runtime.lanePage.verdict.short');
  assert(keys.length >= 20, 'found the strings: ' + keys.length);
  for (const key of keys) assert.equal((messages.match(new RegExp(`"${key.replace(/\./g, '\\.')}"`, 'g')) || []).length, 2, `${key} in both locales`);
  assert(/"runtime\.timeline\.focusExit": "← 返回"/.test(messages), '← 返回');
  // the stem loudness strip: read only, same WAV as 核对原声, computed in the main process
  const main = read('desktop/main.cjs'), preload = read('desktop/preload.cjs'), envelope = read('core/stem-envelope.cjs'), evidence = read('core/midi-evidence.cjs');
  // The handler may be registered directly or through trackMutationIpc (track removal wraps the handlers that read a track).
  assert(/(?:ipcMain\.handle|trackMutationIpc)\('assets:stem-envelope'[\s\S]{0,400}midiEvidence\.sourceWav\([\s\S]{0,200}stemEnvelopes\.envelope\(/.test(main), 'main: the envelope of the file the check reads');
  assert(/readStemEnvelope: payload => ipcRenderer\.invoke\('assets:stem-envelope',payload\)/.test(preload), 'exposed to the page');
  assert(/async function sourceWav[\s\S]{0,200}parentOf\(track, stem, runId\)[\s\S]{0,160}record\.source\?\.path/.test(evidence), 'the same lookup as check(): the run\'s recorded, still-bound source');
  assert(!/writeFile|writeAtomic|mkdir|rename|unlink|appendFile|createWriteStream/.test(envelope), 'the envelope module writes nothing');
  assert(/createReadStream/.test(envelope), 'and streams the WAV');
  const ipcBlock = main.slice(main.indexOf("ipcMain.handle('assets:stem-envelope'"), main.indexOf("ipcMain.handle('assets:keep-midi-run'"));
  assert(!/midiSourceChanging=true|writeAtomic|writeFile/.test(ipcBlock), 'and the handler takes no write lock and writes nothing');
}

console.log('lane-page: ok (pitch window, row heights and zoom steps, drawn range, problem notes and their walk, lane steps, names, readout, wiring, strings)');
