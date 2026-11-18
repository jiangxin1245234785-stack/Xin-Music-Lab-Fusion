'use strict';
// "Effects follow the music" (work/score-dynamics-20261114/SPEC.md §3): the switch under the
// effects preset in Look & settings → Score reading. On unless turned off on this device; the
// score scene hands it to the render core as fxDynamics 'song' / 'off'; an export uses the same.
//   node tests/score-fx-follow.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const done = [];

// --- the switch is in the page, on, under the preset, with both languages' words ---------------------
function markup() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const preset = html.indexOf('id="scoreEffects"'), follow = html.indexOf('id="scoreFxFollow"');
  assert.ok(preset > 0 && follow > preset, '「光效跟随起伏」的开关应当在「音符光效」下面');
  const tag = /<input id="scoreFxFollow"[^>]*>/.exec(html)[0];
  assert.match(tag, /type="checkbox"/);
  assert.match(tag, /\schecked\b/, '开关缺省应当是开的');
  assert.match(tag, /role="switch"/);
  assert.ok(html.slice(preset, follow).split('<label').length === 2, '开关应当紧跟在搭配那一行后面');
  global.window = global;
  const catalogs = fs.readFileSync(path.join(root, 'i18n', 'catalogs.js'), 'utf8');
  assert.ok(catalogs.includes("'score.fxFollow': '光效跟随起伏'"), '中文词条');
  assert.ok(catalogs.includes("'score.fxFollow': 'Note light follows the music'"), '英文词条');
  assert.ok(catalogs.includes("'score.lane.other': '其它'") && catalogs.includes("'score.lane.other': 'Other'"), '「其它」带子的悬停名');
  done.push('设置里「音符光效」下面有「光效跟随起伏 / Note light follows the music」，缺省开');
}

// --- the scene: what it keeps, what it gives the core -------------------------------------------------
function sceneWith(kept) {
  const source = fs.readFileSync(path.join(root, 'score-scene.js'), 'utf8');
  const storage = new Map(kept === undefined ? [] : [['xin-score-fx-dynamics', kept]]);
  const created = [], patches = [];
  const element = () => ({hidden: false, style: {}, classList: {add() {}, contains: () => false}, dataset: {}, handlers: {},
    addEventListener(type, fn) { (this.handlers[type] ||= []).push(fn); }, fire(type) { for (const fn of this.handlers[type] || []) fn({}); },
    appendChild() {}, append() {}, getBoundingClientRect: () => ({top: 0, bottom: 0, left: 0, height: 0, width: 0}),
    getContext: () => new Proxy({}, {get: () => () => ({width: 0})}), querySelectorAll: () => [], options: [], clientWidth: 800, clientHeight: 400});
  const follow = Object.assign(element(), {checked: false});
  const win = {
    localStorage: {getItem: key => (storage.has(key) ? storage.get(key) : null), setItem: (key, value) => storage.set(key, String(value))},
    document: {getElementById: id => (id === 'scoreFxFollow' ? follow : null), querySelector: () => null, createElement: element, documentElement: {lang: 'zh-CN'}},
    XinScoreView: {create: (canvas, model, clock, options) => {
      created.push(options);
      const current = {...options};
      return {setOptions(patch) { patches.push(patch); Object.assign(current, patch); }, options: () => ({...current}),
        setModel() {}, setCover() {}, lanes: () => [], layers: () => ({}), lastFrame: () => ({})};
    }},
    XinMediaClock: {create: () => ({now: () => 0, destroy() {}})},
    MutationObserver: class { observe() {} disconnect() {} }, addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    CustomEvent: class { constructor(name, init) { this.type = name; this.detail = init && init.detail; } },
    requestAnimationFrame: () => 0, cancelAnimationFrame() {}, setTimeout: () => 0, clearTimeout() {}, performance: {now: () => 0}, devicePixelRatio: 1
  };
  win.globalThis = win;
  vm.runInNewContext(source, win, {filename: 'score-scene.js'});
  const model = {contract: 'xin.score-view/1', track: {duration: 10}, audio: {}, lanes: []};
  const scene = win.XinScoreScene.create({bridge: {scoreModel: async () => ({ok: true, model})}, audio: element(), stage: element(), canvas: element()});
  return {win, scene, follow, storage, created, patches};
}

async function scene() {
  const expected = {song: 'song', off: 'off', on: 'song', '': 'song', light: 'song'};
  for (const [kept, value] of Object.entries(expected)) {
    const s = sceneWith(kept);
    assert.equal(s.win.XinScoreScene.storedFollow(kept), value, `存的「${kept}」应当读成 ${value}`);
    assert.equal(s.scene.status().fxDynamics, value);
    assert.equal(s.follow.checked, value === 'song');
  }
  const fresh = sceneWith(undefined);
  assert.equal(fresh.scene.status().fxDynamics, 'song', '没存过就是开');
  assert.equal(fresh.follow.checked, true);
  // The core is made with it.
  await fresh.scene.load('track-1');
  assert.equal(fresh.created.length, 1, '场景没有建谱面');
  assert.equal(fresh.created[0].fxDynamics, 'song', '建谱面时没有传 fxDynamics');
  assert.equal(fresh.created[0].showTexture, true, '建谱面时没有打开「其它」带子');
  // Turned off: kept, and handed to the core at once.
  fresh.follow.checked = false;
  fresh.follow.fire('change');
  assert.equal(fresh.storage.get('xin-score-fx-dynamics'), 'off');
  assert.equal(JSON.stringify(fresh.patches.at(-1)), JSON.stringify({fxDynamics: 'off'}));
  assert.equal(fresh.scene.status().fxDynamics, 'off');
  fresh.follow.checked = true;
  fresh.follow.fire('change');
  assert.equal(fresh.storage.get('xin-score-fx-dynamics'), 'song');
  assert.equal(JSON.stringify(fresh.patches.at(-1)), JSON.stringify({fxDynamics: 'song'}));
  done.push('场景：缺省开，存在 xin-score-fx-dynamics；建谱面和拨开关时都交给核心');
}

// --- the export: what the scene has, the video gets -------------------------------------------------
async function exported() {
  const {createScoreExport} = require(path.join(root, 'desktop', 'score-export-ipc.cjs'));
  const exporter = require(path.join(root, '..', 'scoreview', 'export', 'export-main.cjs'));
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'xml-fx-follow-'));
  const asked = [];
  const channel = createScoreExport({
    app: {getPath: () => scratch}, dialog: {showSaveDialog: async () => ({canceled: false, filePath: path.join(scratch, 'out.mp4')})},
    shell: {showItemInFolder: () => {}}, BrowserWindow: {fromWebContents: () => null},
    exporter: {...exporter, exportVideo: async request => { asked.push(request); return {ok: true, file: request.outFile, summary: {bytes: 1}}; }},
    scoreModelFor: async () => ({ok: true, model: {track: {title: 't', artist: 'a', duration: 10}, lanes: [{}]}}), analysisRoots: () => [path.join(scratch, 'A')], locale: () => 'zh-CN'
  });
  const sender = {isDestroyed: () => false, send: () => {}};
  for (const [given, look] of [['song', 'song'], ['off', 'off'], ['loud', undefined], [undefined, undefined]]) {
    await channel.start({sender}, {trackId: 'x', tier: '720p', fxPreset: 'clear', fxDynamics: given});
    assert.equal(asked.at(-1).look.fxDynamics, look, `交来 ${given} 时导出的 look.fxDynamics 应当是 ${look}`);
    assert.equal(asked.at(-1).look.showTexture, true, '导出的视频也要有「其它」带子');
  }
  // The controls send what the scene has.
  const controls = fs.readFileSync(path.join(root, 'score-export-controls.js'), 'utf8');
  assert.ok(/fxDynamics: s\.fxDynamics/.test(controls), '导出按钮没有把场景的 fxDynamics 交出去');
  fs.rmSync(scratch, {recursive: true, force: true});
  done.push('导出：场景的开关值原样进视频的样子；乱写的值不收');
}

(async () => {
  markup();
  await scene();
  await exported();
  for (const line of done) console.log(`ok - ${line}`);
})().catch(error => { console.error(error); process.exitCode = 1; });
