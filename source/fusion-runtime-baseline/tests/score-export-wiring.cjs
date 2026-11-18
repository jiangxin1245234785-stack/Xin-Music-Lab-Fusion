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
  let saveDialogs = 0;
  const fakeEngine = {...exporter, exportVideo: async request => { asked.push(request); return {ok: true, file: request.outFile, summary: {bytes: 1}}; }};
  const sender = {isDestroyed: () => false, send: () => {}};
  const make = roots => createScoreExport({
    app: {getPath: () => scratch}, dialog: {showSaveDialog: async () => {
      saveDialogs++;
      return {canceled: false, filePath: path.join(scratch, 'out.mp4')};
    }},
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
  const channel = make(roots);
  for (const videoBitrate of [49999, 16000001, 95000.5, NaN, Infinity, -Infinity, '2500000', false, {}, [8000000]]) {
    const rejected = await channel.start({sender}, {tier:'1080p', videoBitrate});
    assert.equal(rejected.error, 'invalid-video-bitrate');
    assert.equal(saveDialogs, 1);
    assert.equal(asked.length, 1);
  }
  for (const tier of ['720p', '1080p']) {
    for (const videoBitrate of [50000, 2738291, 16000000, null, undefined]) {
      const selected = await channel.start({sender}, {trackId:'x', tier, videoBitrate, meteorMotion:true});
      assert.ok(selected.ok);
      assert.equal(asked.at(-1).tier, tier);
      assert.equal(asked.at(-1).videoBitrate, videoBitrate);
      assert.equal(asked.at(-1).look.meteorMotion, true);
    }
  }
  done.push('两档分辨率逐次转发视频码率，无效值不打开保存对话框');
  const flag = await channel.start({sender}, {trackId:'x', presentationLook:{scoreStyle:'flag', lang:'en-US'}});
  assert.ok(flag.ok);
  assert.equal(asked.at(-1).look.scoreStyle, 'flag');
  assert.equal(asked.at(-1).look.lang, 'zh-CN');
  assert.equal(asked.at(-1).look.presentationLayout, true);
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

async function keptScoreStyle() {
  const styles = require('../../scoreview/score-style.cjs');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const exportPage = fs.readFileSync(path.join(root, '..', 'scoreview', 'export', 'export-page.html'), 'utf8');
  const picker = html.match(/<select id="scoreStyle">(.*?)<\/select>/s)[1];
  const options = Array.from(picker.matchAll(/value="([a-z]+)"/g), match => match[1]);
  assert.deepEqual(options, ['starry','overprint','glass','paper','ember','water','mist','terrain','flag']);
  assert.deepEqual(styles.styles, options);
  for (const page of [html, exportPage]) assert.match(page, /score-flag\.js[\s\S]*score-presentation\.js/);
  const storage = new Map([['xin-score-style-v1', 'terrain']]);
  const mount = () => {
    const p = page({lang:'en-US'});
    const select = p.element('select'), stage = p.element(), canvas = p.element('canvas');
    p.byId.set('scoreStyle', select);
    p.win.localStorage = {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value)};
    p.doc.currentScript = {src:'file:///scoreview/score-mood.js'};
    p.win.URL = URL;
    p.run('../scoreview/score-mood.js');
    p.run('score-scene.js');
    assert.deepEqual(Array.from(p.win.XinScoreMood.styles), options);
    let look = {};
    p.win.XinScoreView.create = (canvas, model, clock, opts) => {
      look = opts;
      return {options: () => look, setOptions: patch => { look = {...look, ...patch}; }, setCover() {}};
    };
    const scene = p.win.XinScoreScene.create({bridge:{scoreModel: async () => ({ok:true, model:{}})}, audio:p.element('audio'), stage, canvas});
    return {scene, select, look: () => look};
  };
  const first = mount();
  assert.equal(first.select.value, 'terrain');
  await first.scene.load('track-1');
  first.select.value = 'flag';
  first.select.fire('change');
  assert.equal(first.look().scoreStyle, 'flag');
  assert.equal(storage.get('xin-score-style-v1'), 'flag');
  const resumed = mount();
  assert.equal(resumed.select.value, 'flag');
  await resumed.scene.load('track-1');
  assert.equal(resumed.look().scoreStyle, 'flag');
  assert.equal(resumed.look().lang, 'en-US');
  storage.set('xin-score-style-v1', 'theatre');
  assert.equal(mount().select.value, 'starry');
  assert.equal(storage.get('xin-score-style-v1'), 'theatre');
  done.push('旗帜工坊沿用谱面风格偏好，中英导出接线保留，既有八款与纸偶归档路径兼容');
}

// The panel estimates decimal MB using the encoding tier's nominal video and audio rates.
// The small-tier reference file is MEGURI.
function sizeEstimate() {
  const scene = {status: () => ({active: true, status: 'ready', trackId: 't', fxPreset: 'clear', reading: {}})};
  const p = page({scene});
  for (const id of ['scoreExportOpen', 'scoreExportChoices', 'scoreExportStatus', 'scoreExportProgress', 'scoreExportCancel', 'scoreExportReveal', 'scoreExport1080Size', 'scoreExport720Size'])
    p.byId.set(id, p.element());
  p.byId.set('fusionAudio', Object.assign(p.element('audio'), {duration: 568.77}));
  p.byId.get('scoreExportChoices').querySelectorAll = () => [];
  p.win.XinsMusicLabFusion = {scoreExport: async () => ({ok: false}), onScoreExportProgress: () => () => {}};
  p.run('score-export-controls.js');
  const shown = tier => Number(/(\d+(?:\.\d+)?)/.exec(p.byId.get(tier === '1080p' ? 'scoreExport1080Size' : 'scoreExport720Size').textContent)[1]);
  assert.ok(Math.abs(shown('720p') - 22954650 / 1000000) / (22954650 / 1000000) <= 0.1);
  const audio = p.byId.get('fusionAudio');
  audio.duration = 16;
  audio.fire('loadedmetadata');
  const tier = require('../../scoreview/export/export-main.cjs').TIERS['1080p'];
  const targetMB = audio.duration * (tier.videoBitrate + tier.audioBitrate) / 8000000;
  assert.equal(shown('1080p'), Number(targetMB.toFixed(1)));
  done.push('720p 大小预估与实测相符，1080p 大小预估随编码器视频与音频码率计算');
}

function exportPanel(storage) {
  const state = {active: true, status: 'ready', trackId: 't', meteorMotion: false};
  let complete;
  const calls = [];
  const p = page({scene: {status: () => ({...state})}});
  const get = id => p.byId.get(id);
  for (const id of ['scoreExportOpen', 'scoreExportChoices', 'scoreExportStatus', 'scoreExportProgress', 'scoreExportCancel', 'scoreExportReveal',
                    'scoreExportBitrate','scoreExportCustomBitrate','scoreExportCustomRow','scoreExportBitrateError','scoreExport1080Size','scoreExport720Size','fusionAudio'])
    p.byId.set(id, p.element());
  const mode = get('scoreExportBitrate'), custom = get('scoreExportCustomBitrate');
  mode.value = 'auto'; custom.value = '2';
  custom.setAttribute = (key, value) => { custom[key] = value; };
  get('fusionAudio').duration = 60;
  const tiers = ['720p', '1080p'].map(tier => Object.assign(p.element('button'), {dataset: {tier}}));
  get('scoreExportChoices').querySelectorAll = () => tiers;
  p.win.localStorage = {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value)};
  p.win.XinsMusicLabFusion = {scoreExport: payload => {
    calls.push(payload);
    return new Promise(resolve => { complete = () => resolve({ok: false, error: 'not-chosen'}); });
  }};
  p.run('score-export-controls.js');
  return {state, calls, tiers, get, mode, custom, p,
    setMode(value) { mode.value = value; mode.fire('change'); },
    setMbps(value) { custom.value = value; custom.fire('input'); },
    async finish() { complete(); await new Promise(resolve => setImmediate(resolve)); }};
}

async function exportSettingsAtStart() {
  const storage = new Map();
  const {state, calls, tiers, get, mode, custom, setMode, setMbps, finish, p} = exportPanel(storage);
  const estimates = () => [get('scoreExport720Size'), get('scoreExport1080Size')].map(n => n.textContent);
  assert.equal(mode.value, 'auto');
  assert.deepEqual(estimates(), ['约 2.2 MB', '约 13 MB']);
  assert.equal(get('scoreExportCustomRow').hidden, true);
  for (const preset of ['1','2','4','8']) {
    setMode(preset);
    tiers[1].fire('click');
    assert.equal(calls.at(-1).videoBitrate, Number(preset) * 1000000);
    await finish();
  }
  setMode('custom');
  assert.equal(get('scoreExportCustomRow').hidden, false);
  for (const invalid of ['', '.049', '16.001', '-1', '1e1', '1.2345', 'abc']) {
    setMbps(invalid);
    assert.equal(custom['aria-invalid'], 'true');
    assert.equal(get('scoreExportBitrateError').hidden, false);
    assert.deepEqual(estimates(), ['', '']);
    for (const button of tiers) { assert.equal(button.disabled, true); button.fire('click'); }
    assert.equal(calls.length, 4);
  }
  for (const value of ['.05','1.234','16']) {
    setMbps(value);
    assert.equal(custom['aria-invalid'], 'false');
    assert.equal(get('scoreExportBitrateError').hidden, true);
    assert.ok(tiers.every(button => !button.disabled));
    tiers[0].fire('click');
    assert.equal(calls.at(-1).videoBitrate, Math.round(Number(value) * 1000000));
    await finish();
  }
  setMbps('0.5');
  assert.deepEqual(estimates(), ['约 4.5 MB', '约 4.7 MB']);
  const restored = exportPanel(storage);
  assert.equal(restored.mode.value, 'custom');
  assert.equal(restored.custom.value, '0.5');
  for (const button of tiers) {
    for (const selected of [true, false]) {
      state.meteorMotion = !selected;
      get('scoreExportOpen').fire('click');
      state.meteorMotion = selected;
      setMode(selected ? '4' : 'auto');
      button.fire('click');
      state.meteorMotion = !selected;
      setMode('2');
      const request = calls.at(-1);
      assert.equal(request.tier, button.dataset.tier);
      assert.equal(request.meteorMotion, selected);
      if (selected) assert.equal(request.videoBitrate, 4000000);
      else assert.equal(Object.hasOwn(request, 'videoBitrate'), false);
      assert.equal(p.win.XinScoreExportControls.status().working, true);
      await finish();
      assert.equal(p.win.XinScoreExportControls.status().working, false);
    }
  }
  assert.equal(calls.length, 11);
  assert.equal(exportPanel(storage).mode.value, '2');
  done.push('两种分辨率均在开始导出时取流星和码率；无效值阻止导出，自定义、预估体积与重启记忆均通过');
}

async function scoreSnapshot() {
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const source = app.slice(app.indexOf('  async function captureSnapshot()'), app.indexOf('  async function toggleAlwaysOnTop()'));
  assert.ok(app.includes("snapshotButton.addEventListener('click', captureSnapshot)"));
  const score = {width: 1800, getBoundingClientRect: () => ({left: 10, top: 92, width: 1200, height: 590})};
  const draws = [], transforms = [], saves = [];
  const shot = {toDataURL: () => 'data:image/png,test', getContext: () => ({
    setTransform: (...args) => transforms.push(args), createRadialGradient: () => ({addColorStop() {}}),
    fillRect() {}, fillText() {}, drawImage: (...args) => draws.push(args)
  })};
  const win = {
    activeEffect: 'score', $: name => name === '#scoreCanvas' ? score : null,
    w: 1200, h: 740, dpr: 0.85, currentPalette: {dark: [5, 6, 7]},
    stage: {getBoundingClientRect: () => ({left: 10, top: 12}), classList: {contains: () => false}},
    window: {SmokeResonanceDesktop: {saveSnapshot: url => saves.push(url)}},
    document: {createElement: () => shot}, uiText() {}, showToast() {}
  };
  await vm.runInNewContext(source + '\ncaptureSnapshot()', win);
  assert.deepEqual(saves, ['data:image/png,test']);
  assert.deepEqual(draws, [[score, 0, 80, 1200, 590]]);
  assert.deepEqual(transforms, [[1.5, 0, 0, 1.5, 0, 0]]);
  assert.deepEqual([shot.width, shot.height], [1800, 1110]);
  done.push('谱面截屏按谱面分辨率、原位置和高度保存');
}

(async () => {
  await scoreSnapshot();
  await channel();
  keptSetting();
  await laneNamesAndLanguage();
  await keptScoreStyle();
  await exportSettingsAtStart();
  sizeEstimate();
  await mainWiring();
  console.log(`score export wiring: PASS (${done.join('；')})`);
  fs.rmSync(scratch, {recursive: true, force: true});
  process.exit(0);
})().catch(error => { console.error(error); process.exit(1); });
