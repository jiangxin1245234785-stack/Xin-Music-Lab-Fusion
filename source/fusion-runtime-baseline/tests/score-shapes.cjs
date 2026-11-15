'use strict';
// 按乐器画音符 (work/xml-round-20261115/SPEC-B4.md §A): the switch in Look & settings → Score reading. On unless
// turned off on this device. On, the score scene gives the render core showShapes + shapeSet 'spindle' (the user's
// pick at gate15: struck / plucked notes with a head, strings as a spindle); off, nothing about shapes, so the
// score draws as before. Turning it over on a shown score hands the core the change at once. The video export
// draws what the scene draws. String links, pitch weight and the cover adaptations are never passed.
//   node tests/score-shapes.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const done = [];
const NEVER = ['shapeLinks', 'pitchWeight', 'coverAdapt', 'textureAdapt', 'showRoles'];

// --- the switch is in Score reading, on, with a hint line, in both languages -------------------------
function markup() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const group = html.indexOf('data-i18n="score.options"'), simplify = html.indexOf('id="scoreSimplify"'), mine = html.indexOf('id="scoreShapes"');
  const end = html.indexOf('</section>', group);
  assert.ok(group > 0 && mine > group && mine < end, '「按乐器画音符」应当在「谱面阅读」一组里');
  assert.ok(mine > simplify, '放在「简化重复与细碎音符」下面');
  const tag = /<input id="scoreShapes"[^>]*>/.exec(html)[0];
  assert.match(tag, /type="checkbox"/);
  assert.match(tag, /\schecked\b/, '开关缺省应当是开的');
  assert.match(tag, /role="switch"/);
  assert.match(tag, /class="xl-switch-input"/, '和其它开关同一种样子');
  const label = html.slice(html.lastIndexOf('<label', mine), mine);
  assert.match(label, /class="xl-toggle-field"/);
  assert.doesNotMatch(label + tag, /\shidden\b/, '开关不能藏起来');
  assert.match(label, /data-i18n="score\.shapes">按乐器画音符</);
  assert.match(label, /<small data-i18n="score\.shapesHint">弹拨的音有个头，弦乐是两头尖的梭<\/small>/);
  const catalogs = fs.readFileSync(path.join(root, 'i18n', 'catalogs.js'), 'utf8');
  for (const line of ["'score.shapes': '按乐器画音符'", "'score.shapes': 'Draw notes by instrument'",
    "'score.shapesHint': '弹拨的音有个头，弦乐是两头尖的梭'", "'score.shapesHint': 'Plucked notes get a head; strings are a spindle, pointed at both ends'"]) {
    assert.ok(catalogs.includes(line), `词条：${line}`);
  }
  done.push('设置「谱面阅读」里有「按乐器画音符」和一行说明，统一开关样式，缺省开，中英文都有');
}

// --- the scene: what it keeps, what it gives the core -------------------------------------------------
function sceneWith(kept) {
  const source = fs.readFileSync(path.join(root, 'score-scene.js'), 'utf8');
  const storage = new Map(kept === undefined ? [] : [['xin-score-shapes', kept]]);
  const created = [], patches = [];
  const element = () => ({hidden: false, style: {}, classList: {add() {}, contains: () => false}, dataset: {}, handlers: {},
    addEventListener(type, fn) { (this.handlers[type] ||= []).push(fn); }, fire(type) { for (const fn of this.handlers[type] || []) fn({}); },
    appendChild() {}, append() {}, getBoundingClientRect: () => ({top: 0, bottom: 0, left: 0, height: 0, width: 0}),
    getContext: () => new Proxy({}, {get: () => () => ({width: 0})}), querySelectorAll: () => [], options: [], clientWidth: 800, clientHeight: 400});
  const input = Object.assign(element(), {checked: false});
  const win = {
    localStorage: {getItem: key => (storage.has(key) ? storage.get(key) : null), setItem: (key, value) => storage.set(key, String(value))},
    document: {getElementById: id => (id === 'scoreShapes' ? input : null), querySelector: () => null, createElement: element, documentElement: {lang: 'zh-CN'}},
    XinScoreView: {create: (canvas, model, clock, options) => { created.push(options); return {setOptions: patch => patches.push(patch), setModel() {}, setCover() {}, lanes: () => [], layers: () => ({}), lastFrame: () => ({})}; }},
    XinMediaClock: {create: () => ({now: () => 0, destroy() {}})},
    MutationObserver: class { observe() {} disconnect() {} }, addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    CustomEvent: class { constructor(name, init) { this.type = name; this.detail = init && init.detail; } },
    requestAnimationFrame: () => 0, cancelAnimationFrame() {}, setTimeout: () => 0, clearTimeout() {}, performance: {now: () => 0}, devicePixelRatio: 1
  };
  win.globalThis = win;
  vm.runInNewContext(source, win, {filename: 'score-scene.js'});
  const model = {contract: 'xin.score-view/1', track: {duration: 10}, audio: {}, lanes: []};
  const scene = win.XinScoreScene.create({bridge: {scoreModel: async () => ({ok: true, model})}, audio: element(), stage: element(), canvas: element()});
  return {win, scene, input, storage, created, patches};
}

const noneOf = (options, names, what) => { for (const name of names) assert.ok(!(name in options), `${what}里不该有 ${name}`); };

async function scene() {
  for (const [kept, on] of [[undefined, true], ['on', true], ['off', false], ['', true], ['junk', true]]) {
    const s = sceneWith(kept);
    assert.equal(s.scene.status().shapes, on, `存的「${kept}」应当读成 ${on}`);
    assert.equal(s.input.checked, on);
  }
  // On (nothing kept): the core is made with the spindle set, and nothing the user has not seen.
  const fresh = sceneWith(undefined);
  await fresh.scene.load('track-1');
  assert.equal(fresh.created.length, 1, '场景没有建谱面');
  assert.equal(fresh.created[0].showShapes, true, '开着时建谱面要传 showShapes');
  assert.equal(fresh.created[0].shapeSet, 'spindle', '用户选的是拨击 + 梭状');
  noneOf(fresh.created[0], NEVER, '建谱面的选项');
  // Turned off: kept, and handed to the core at once (the core redraws from its options every frame).
  fresh.input.checked = false;
  fresh.input.fire('change');
  assert.equal(fresh.storage.get('xin-score-shapes'), 'off');
  assert.equal(JSON.stringify(fresh.patches.at(-1)), JSON.stringify({showShapes: false}));
  assert.equal(fresh.scene.status().shapes, false);
  // Loading another song while off passes nothing about shapes, so the core keeps them off.
  await fresh.scene.load('track-2');
  const reload = fresh.patches.at(-1);
  noneOf(reload, ['showShapes', 'shapeSet', ...NEVER], '关着时换歌的选项');
  // On again: the same set, at once.
  fresh.input.checked = true;
  fresh.input.fire('change');
  assert.equal(fresh.storage.get('xin-score-shapes'), 'on');
  assert.equal(JSON.stringify(fresh.patches.at(-1)), JSON.stringify({showShapes: true, shapeSet: 'spindle'}));
  // Kept off: the score is made exactly as before, with no shapes options at all.
  const off = sceneWith('off');
  await off.scene.load('track-1');
  noneOf(off.created[0], ['showShapes', 'shapeSet', ...NEVER], '关着时建谱面的选项');
  // The other reading switches never carry it away.
  assert.deepEqual(Object.keys(off.scene.status().reading).sort(), ['mergeTimbres', 'simplify']);
  done.push('场景：缺省开，存在 xin-score-shapes；开时交 showShapes + spindle，关时什么都不交（拨到关时交 showShapes false），拨开关立刻交给核心');
}

// --- the export: what the scene draws, the video draws ------------------------------------------------
async function exported() {
  const {createScoreExport} = require(path.join(root, 'desktop', 'score-export-ipc.cjs'));
  const exporter = require(path.join(root, '..', 'scoreview', 'export', 'export-main.cjs'));
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'xml-shapes-'));
  const asked = [];
  const channel = createScoreExport({
    app: {getPath: () => scratch}, dialog: {showSaveDialog: async () => ({canceled: false, filePath: path.join(scratch, 'out.mp4')})},
    shell: {showItemInFolder: () => {}}, BrowserWindow: {fromWebContents: () => null},
    exporter: {...exporter, exportVideo: async request => { asked.push(request); return {ok: true, file: request.outFile, summary: {bytes: 1}}; }},
    scoreModelFor: async () => ({ok: true, model: {track: {title: 't', artist: 'a', duration: 10}, lanes: [{}]}}), analysisRoots: () => [path.join(scratch, 'A')], locale: () => 'zh-CN'
  });
  const sender = {isDestroyed: () => false, send: () => {}};
  for (const [given, on] of [[true, true], [false, false], [undefined, false], ['true', false], [1, false]]) {
    await channel.start({sender}, {trackId: 'x', tier: '720p', fxPreset: 'clear', shapes: given, showShapes: true, shapeSet: 'two', shapeLinks: true, pitchWeight: true});
    const look = asked.at(-1).look;
    if (on) { assert.equal(look.showShapes, true); assert.equal(look.shapeSet, 'spindle'); }
    else noneOf(look, ['showShapes', 'shapeSet'], `交来 shapes=${String(given)} 时导出的样子`);
    noneOf(look, NEVER, '导出的样子');
  }
  // The look the engine draws with: its own defaults under what XML gives, so the video has the scene's shapes.
  assert.equal({...exporter.LOOK, ...asked[0].look}.shapeSet, 'spindle');
  const controls = fs.readFileSync(path.join(root, 'score-export-controls.js'), 'utf8');
  assert.ok(/shapes: s\.shapes === true/.test(controls), '导出按钮没有把场景的开关交出去');
  fs.rmSync(scratch, {recursive: true, force: true});
  done.push('导出：场景开着时视频也是拨击 + 梭状，关着时不传；只认 shapes === true，别的名字不收');
}

(async () => {
  markup();
  await scene();
  await exported();
  for (const line of done) console.log(`ok - ${line}`);
})().catch(error => { console.error(error); process.exitCode = 1; });
