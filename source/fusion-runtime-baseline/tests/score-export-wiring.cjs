'use strict';
// The score scene's two pieces of wiring that only XML owns (acceptance 2026-11-14, item 1):
//
// 1. The video export never writes into an analysis root. The engine refuses folders it is told
//    about; this checks that XML tells it about every analysis root it reads from. desktop/main.cjs
//    is loaded for real, under a stand-in Electron (no window, no GPU), with settings in a scratch
//    folder; the export module's factory is caught to see what main.cjs hands it.
// 2. The effects setting kept by older versions (off / light / strong) is read as the preset it
//    stands for, both by the rule itself and by a scene created on a page that kept it.
//
// Plus the export channel itself, with a stand-in engine: the roots reach the engine unchanged,
// and with no roots there is no export.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');

const root = path.join(__dirname, '..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'xml-export-wiring-'));
const done = [];

// --- 1. main.cjs hands every analysis root to the export ------------------------------------------
async function mainWiring() {
  const dirs = {appData: path.join(scratch, 'appData'), userData: path.join(scratch, 'userData'), documents: path.join(scratch, 'Documents'),
    home: scratch, videos: path.join(scratch, 'Videos'), downloads: path.join(scratch, 'Downloads'), music: scratch, temp: os.tmpdir(), exe: process.execPath};
  for (const dir of Object.values(dirs)) if (dir !== process.execPath) fs.mkdirSync(dir, {recursive: true});
  const ownRoot = path.join(scratch, 'my analysis');
  fs.mkdirSync(path.join(dirs.appData, "Xin's Local Deck Beta"), {recursive: true});
  fs.writeFileSync(path.join(dirs.appData, "Xin's Local Deck Beta", 'settings.json'), JSON.stringify({libraryRoot: path.join(scratch, 'library'), analysisRoot: ownRoot}));
  const handlers = new Map();
  const nothing = () => {};
  const stub = new Proxy(function () {}, {get: (_t, key) => key === 'then' ? undefined : stub, apply: () => stub, construct: () => stub});
  class Window { constructor() { return stub; } static getAllWindows() { return []; } static fromWebContents() { return null; } }
  const electron = {
    app: {
      requestSingleInstanceLock: () => true, setName: nothing, getName: () => 'test', quit: nothing, exit: nothing, on: nothing, once: nothing,
      whenReady: () => Promise.resolve(), isReady: () => true, getPath: name => dirs[name] || scratch, getVersion: () => '0.0.0', isPackaged: false,
      getLocale: () => 'zh-CN', getPreferredSystemLanguages: () => ['zh-CN'], getSystemLocale: () => 'zh-CN', commandLine: {appendSwitch: nothing},
      setAppUserModelId: nothing, focus: nothing
    },
    BrowserWindow: Window, Menu: {setApplicationMenu: nothing, buildFromTemplate: () => stub}, nativeTheme: stub, screen: stub, protocol: stub, net: stub,
    dialog: {showSaveDialog: async () => ({canceled: true}), showOpenDialog: async () => ({canceled: true}), showMessageBox: async () => ({response: 0})},
    ipcMain: {handle: (channel, fn) => handlers.set(channel, fn), on: nothing, removeHandler: nothing, once: nothing},
    session: {defaultSession: stub}, shell: {openPath: async () => '', showItemInFolder: nothing, openExternal: async () => {}}
  };
  let given = null;
  const exportModule = path.join(root, 'desktop', 'score-export-ipc.cjs');
  const realLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') return electron;
    const resolved = (() => { try { return Module._resolveFilename(request, parent, isMain); } catch (_) { return null; } })();
    if (resolved === exportModule) {
      const real = realLoad.apply(this, arguments);
      return {...real, createScoreExport: deps => { given = deps; return real.createScoreExport(deps); }};
    }
    return realLoad.apply(this, arguments);
  };
  try {
    require(path.join(root, 'desktop', 'main.cjs'));
    for (let i = 0; i < 200 && !handlers.has('fusion:score-export'); i++) await new Promise(resolve => setTimeout(resolve, 10));
  } finally {
    Module._load = realLoad;
  }
  assert.ok(given, 'main.cjs 没有用 score-export-ipc.cjs 建导出');
  for (const channel of ['fusion:score-export', 'fusion:score-export-cancel', 'fusion:score-export-reveal']) assert.ok(handlers.has(channel), `没有注册 ${channel}`);
  const expected = [ownRoot, path.join(dirs.documents, "Xin's Local Deck Beta", 'Analysis'), path.join(dirs.documents, "Xin's Local Deck", 'Analysis')].map(dir => path.resolve(dir));
  const roots = given.analysisRoots().map(dir => path.resolve(dir));
  assert.deepEqual(roots, expected, '导出时交给引擎的禁写目录应当是 XML 读分析结果的全部目录（设置里的和两个缺省的，存不存在都算）');
  done.push('main.cjs → 导出：禁写目录 = 设置里的分析根 + 两个缺省分析根');
}

// --- the export channel, with a stand-in engine -------------------------------------------------------
async function channel() {
  const {createScoreExport} = require(path.join(root, 'desktop', 'score-export-ipc.cjs'));
  const exporter = require(path.join(root, '..', 'scoreview', 'export', 'export-main.cjs'));
  const asked = [];
  const fakeEngine = {...exporter, exportVideo: async request => { asked.push(request); return {ok: true, file: request.outFile, summary: {bytes: 1}}; }};
  const sender = {isDestroyed: () => false, send: () => {}};
  const make = roots => createScoreExport({
    app: {getPath: () => scratch}, dialog: {showSaveDialog: async () => ({canceled: false, filePath: path.join(scratch, 'out.mp4')})},
    shell: {showItemInFolder: () => {}}, BrowserWindow: {fromWebContents: () => null}, exporter: fakeEngine,
    scoreModelFor: async () => ({ok: true, model: {track: {title: 't', artist: 'a', duration: 10}, lanes: [{}]}}), analysisRoots: () => roots, locale: () => 'zh-CN'
  });
  const roots = [path.join(scratch, 'A'), path.join(scratch, 'B')];
  const result = await make(roots).start({sender}, {trackId: 'x', tier: '720p', fxPreset: 'ink'});
  assert.equal(result.ok, true);
  assert.equal(asked.length, 1);
  assert.deepEqual(asked[0].forbidden, roots, '分析根要原样交给引擎');
  assert.equal(asked[0].tier, '720p');
  assert.equal(asked[0].look.fxPreset, 'ink');
  const none = await make([]).start({sender}, {trackId: 'x', tier: '720p'});
  assert.equal(none.ok, false, '没有分析根清单时不该导出');
  assert.equal(asked.length, 1, '没有分析根清单时引擎不该被叫到');
  done.push('导出通道：禁写目录原样交给引擎；没有清单就不导出');
}

// --- 2. the kept effects setting ----------------------------------------------------------------------
function keptSetting() {
  const source = fs.readFileSync(path.join(root, 'score-scene.js'), 'utf8');
  const sceneWith = kept => {
    const storage = new Map(kept === undefined ? [] : [['xin-score-effects', kept]]);
    const element = () => ({hidden: false, style: {}, classList: {add() {}, contains: () => false}, dataset: {}, addEventListener() {}, appendChild() {}, append() {},
      getBoundingClientRect: () => ({top: 0, bottom: 0, left: 0, height: 0, width: 0}), getContext: () => new Proxy({}, {get: () => () => ({width: 0})}),
      querySelectorAll: () => [], options: [], clientWidth: 800, clientHeight: 400});
    const select = Object.assign(element(), {value: ''});
    const win = {
      localStorage: {getItem: key => (storage.has(key) ? storage.get(key) : null), setItem: (key, value) => storage.set(key, String(value))},
      document: {getElementById: id => (id === 'scoreEffects' ? select : null), querySelector: () => null, createElement: element, documentElement: {lang: 'zh-CN'}},
      XinScoreView: {create: () => ({setOptions() {}, setModel() {}})}, XinMediaClock: {create: () => ({now: () => 0, destroy() {}})},
      MutationObserver: class { observe() {} disconnect() {} }, addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
      CustomEvent: class { constructor(name, init) { this.type = name; this.detail = init && init.detail; } },
      requestAnimationFrame: () => 0, cancelAnimationFrame() {}, setTimeout: () => 0, clearTimeout() {}, performance: {now: () => 0}, devicePixelRatio: 1
    };
    win.globalThis = win;
    vm.runInNewContext(source, win, {filename: 'score-scene.js'});
    const scene = win.XinScoreScene.create({bridge: {scoreModel: async () => ({ok: false})}, audio: element(), stage: element(), canvas: element()});
    return {rule: win.XinScoreScene.storedPreset, status: scene.status(), select};
  };
  const expected = {light: 'clear', off: 'off', strong: 'strong', clear: 'clear', keys: 'keys', ink: 'ink', stage: 'stage', bright: 'clear', '': 'clear'};
  for (const [kept, preset] of Object.entries(expected)) {
    const {rule, status, select} = sceneWith(kept);
    assert.equal(rule(kept), preset, `存的「${kept}」应当读成 ${preset}`);
    assert.equal(status.fxPreset, preset, `页面上存着「${kept}」时场景用的应当是 ${preset}`);
    assert.equal(select.value, preset, `设置里显示的应当是 ${preset}`);
  }
  assert.equal(sceneWith(undefined).status.fxPreset, 'clear', '没存过就是清亮');
  done.push('旧设置 light / off / strong → 清亮 / 素 / 浓；别的值和没存过 → 清亮');
}

// --- a small page for the scene and the export controls ---------------------------------------------
function page({lang = 'zh-CN', words = {}, scoreModel, scene} = {}) {
  const listeners = new Map(), subscribers = [], appended = [];
  const element = (tag = 'div') => {
    const node = {tag, hidden: false, style: {}, dataset: {}, textContent: '', value: '', disabled: false, title: '', className: '',
      classList: {add() {}, contains: () => false}, options: [], clientWidth: 800, clientHeight: 400, offsetTop: 0, offsetLeft: 0,
      handlers: {}, addEventListener(type, fn) { (this.handlers[type] ||= []).push(fn); },
      fire(type, event) { for (const fn of this.handlers[type] || []) fn(event); },
      appendChild(child) { appended.push(child); }, append() {}, querySelectorAll: () => [], scrollIntoView() {},
      getBoundingClientRect: () => ({top: 0, bottom: 400, left: 0, right: 800, height: 400, width: 800}),
      getContext: () => new Proxy({}, {get: () => () => ({width: 0})})};
    return node;
  };
  const byId = new Map();
  const doc = {getElementById: id => byId.get(id) || null, querySelector: () => null, createElement: element, documentElement: {lang}};
  const win = {
    document: doc, localStorage: {getItem: () => null, setItem() {}},
    XinMusicLabDynamicUi: {t: (key, params, fallback) => {
      let text = (doc.documentElement.lang.startsWith('en') ? words[key] : null) || fallback;
      for (const [name, value] of Object.entries(params || {})) text = text.replace(`{${name}}`, value);
      return text;
    }, subscribe: fn => { subscribers.push(fn); return () => {}; }},
    XinScoreView: {create: () => ({setOptions() {}, setModel() {}, setCover() {}, resize() {}, draw() {}, lanes: () => [], layers: () => ({}), lastFrame: () => null,
      hit: () => ({kind: 'lane', id: 'guitar', group: 'guitar', label: '吉他'})})},
    XinMediaClock: {create: () => ({now: () => 0, destroy() {}})},
    XinScoreSceneView: scene, XinsMusicLabFusion: undefined,
    MutationObserver: class { observe() {} disconnect() {} }, addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener() {}, dispatchEvent() {},
    CustomEvent: class { constructor(name, init) { this.type = name; this.detail = init && init.detail; } }, Event: class {},
    requestAnimationFrame: () => 0, cancelAnimationFrame() {}, setTimeout: fn => { fn(); return 1; }, clearTimeout() {}, performance: {now: () => 0}, devicePixelRatio: 1
  };
  win.globalThis = win;
  return {win, doc, byId, element, appended, subscribers, run: file => vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), win, {filename: file})};
}

// English interface: the name over a lane icon is English; a language switch asks for the model again at once.
async function laneNamesAndLanguage() {
  const asked = [];
  const p = page({lang: 'en-US', words: {'score.lane.guitar': 'Guitar'}});
  p.run('score-scene.js');
  const canvas = p.element('canvas'), stage = Object.assign(p.element(), {dataset: {effect: 'score'}, classList: {add() {}, contains: () => false}});
  const scene = p.win.XinScoreScene.create({bridge: {scoreModel: async (trackId, dynamics, lang) => { asked.push(lang); return {ok: true, model: {}}; }}, audio: p.element('audio'), stage, canvas});
  await scene.load('track-1');
  assert.deepEqual(asked, ['en-US'], '读谱面时带上界面语言');
  canvas.fire('pointermove', {pointerType: 'mouse', clientX: 40, clientY: 120});
  const tip = p.appended.find(node => node.className === 'score-lane-name');
  assert.ok(tip && !tip.hidden, '悬停图标应当出轨道名');
  assert.equal(tip.textContent, 'Guitar', '英文界面里轨道名是英文');
  // Switch to Chinese: the scene asks for the model again in Chinese, without a reload.
  p.doc.documentElement.lang = 'zh-CN';
  for (const fn of p.subscribers) fn();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(asked, ['en-US', 'zh-CN'], '切换语言后立刻按新语言重读谱面');
  canvas.fire('pointermove', {pointerType: 'mouse', clientX: 40, clientY: 120});
  assert.equal(tip.textContent, '吉他');
  // The same language again: nothing is asked.
  for (const fn of p.subscribers) fn();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(asked.length, 2);
  done.push('英文界面悬停名是英文；切换语言立刻重读谱面');
}

// The size shown on the two buttons, against MEGURI's real files (work/score-export-20261114/out-b and the
// file XML itself exported: 44,246,252 B and 22,954,650 B for 9:28.77).
function sizeEstimate() {
  const scene = {status: () => ({active: true, status: 'ready', trackId: 't', fxPreset: 'clear', reading: {}})};
  const p = page({scene});
  for (const id of ['scoreExportOpen', 'scoreExportChoices', 'scoreExportStatus', 'scoreExportProgress', 'scoreExportCancel', 'scoreExportReveal', 'scoreExport1080Size', 'scoreExport720Size'])
    p.byId.set(id, p.element());
  p.byId.set('fusionAudio', Object.assign(p.element('audio'), {duration: 568.77}));
  p.byId.get('scoreExportChoices').querySelectorAll = () => [];
  p.win.XinsMusicLabFusion = {scoreExport: async () => ({ok: false}), onScoreExportProgress: () => () => {}};
  p.run('score-export-controls.js');
  const shown = tier => Number(/(\d+)/.exec(p.byId.get(tier === '1080p' ? 'scoreExport1080Size' : 'scoreExport720Size').textContent)[1]);
  const real = {'1080p': 44246252 / 1048576, '720p': 22954650 / 1048576};
  for (const tier of ['1080p', '720p']) {
    const off = Math.abs(shown(tier) - real[tier]) / real[tier];
    assert.ok(off <= 0.1, `${tier} 预估 ${shown(tier)} MB，实际 ${real[tier].toFixed(1)} MB，差 ${(off * 100).toFixed(1)}%`);
  }
  done.push(`预估大小 1080p ${shown('1080p')} / 720p ${shown('720p')} MB，与 MEGURI 实际差 10% 以内`);
}

(async () => {
  await channel();
  keptSetting();
  await laneNamesAndLanguage();
  sizeEstimate();
  await mainWiring();
  console.log(`score export wiring: PASS (${done.join('；')})`);
  fs.rmSync(scratch, {recursive: true, force: true});
  process.exit(0);
})().catch(error => { console.error(error); process.exit(1); });
