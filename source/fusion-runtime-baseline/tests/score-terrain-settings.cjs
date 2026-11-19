'use strict';
// 车窗地貌 in XML (batch 4, 2026-11-19): the 「路边的东西」 setting shows only with this look, starts off, is kept per
// viewer (xin-score-terrain-v1) and reaches the core on opening a song and on change; the stage carries
// score-led-words while this look is shown (the compact lyric line then keeps its words off the scenery); the help
// line about lanes is not drawn on it.
//   node tests/score-terrain-settings.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'score-scene.js'), 'utf8');
const anyContext = new Proxy({}, {get: (t, k) => k in t ? t[k] : (k === 'measureText' ? () => ({width: 10}) : () => ({addColorStop() {}})), set: (t, k, v) => { t[k] = v; return true; }});

function page(style, kept) {
  const elements = new Map(), storage = new Map([['xin-score-style-v1', style]]);
  if (kept !== undefined) storage.set('xin-score-terrain-v1', kept);
  const options = {}, texts = [];
  function element(id) {
    const events = new Map(), classes = new Set();
    return {id, style: {}, dataset: {effect: 'score'}, hidden: false, value: '', classes,
      classList: {add: c => classes.add(c), remove: c => classes.delete(c), toggle: (c, on) => { (on ?? !classes.has(c)) ? classes.add(c) : classes.delete(c); }, contains: c => classes.has(c)},
      addEventListener: (t, f) => events.set(t, f), removeEventListener() {}, change(value) { this.value = value; events.get('change')(); },
      append() {}, appendChild() {}, remove() {}, querySelectorAll: () => [], querySelector: () => null, setAttribute() {}, getAttribute: () => null,
      getContext: () => new Proxy(anyContext, {get: (t, k) => k === 'fillText' ? text => texts.push(text) : t[k]}), options: [], clientWidth: 800, clientHeight: 400, width: 800, height: 400, paused: true, seeking: false, currentTime: 0,
      getBoundingClientRect: () => ({top: 0, bottom: 400, left: 0, right: 800, height: 400, width: 800})};
  }
  const get = id => { if (!elements.has(id)) elements.set(id, element(id)); return elements.get(id); };
  let clock = 0, frameFn = null;
  const host = {localStorage: {getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v)},
    document: {documentElement: {lang: 'zh-CN'}, getElementById: get, querySelector: () => null, createElement: () => element('x'), body: element('body')},
    Image: class {}, CustomEvent: class {}, dispatchEvent() {}, addEventListener() {}, removeEventListener() {},
    MutationObserver: class { constructor() {} observe() {} disconnect() {} }, setTimeout() {}, clearTimeout() {},
    requestAnimationFrame: fn => { frameFn = fn; return 1; }, cancelAnimationFrame() {},
    performance: {now: () => clock}, XinMediaClock: {create: () => ({now: () => 0, destroy() {}})},
    XinScoreMood: {normalize: v => v || 'starry'},
    XinScoreView: {create(canvas, model, clockFn, given) {
      Object.assign(options, given);
      return {setOptions: o => Object.assign(options, o), setModel() {}, setCover() {}, options: () => ({...options}), lanes: () => [], layers: () => ({}), lastFrame: () => ({}),
        resize() {}, setLyrics() {}, draw: () => ({time: 0}), ready: () => Promise.resolve()};
    }}};
  vm.runInNewContext(source, host);
  const stage = get('stage');
  const scene = host.XinScoreScene.create({stage, canvas: get('canvas'), audio: get('audio'), bridge: {scoreModel: async () => ({ok: true, model: {track: {duration: 50}, lanes: [], audio: {}}})}});
  const tick = (ms = 16) => { clock += ms; const f = frameFn; frameFn = null; if (f) f(clock); };
  return {scene, options, storage, stage, texts, tick, box: get('scoreTerrainOptions'), input: get('scoreTerrainRoadside'), style: v => get('scoreStyle').change(v)};
}

(async () => {
  const p = page('terrain');
  assert.equal(p.box.hidden, false, 'shown with 车窗地貌');
  assert.equal(p.input.value, 'off', 'off by default');
  assert.ok(p.stage.classes.has('score-led-words'));
  await p.scene.load('a');
  assert.equal(p.options.terrainRoadside, 'off', 'the core gets it on opening a song');
  p.tick(); p.tick();
  assert.equal(p.texts.some(t => /点一条轨/.test(t)), false, 'no help line about lanes on the scenery');
  p.input.change('kick-snare');
  assert.equal(p.options.terrainRoadside, 'kick-snare');
  assert.deepEqual(JSON.parse(p.storage.get('xin-score-terrain-v1')), {terrainRoadside: 'kick-snare'}, 'kept per viewer');
  p.style('glass');
  assert.equal(p.box.hidden, true, 'hidden with another look');
  assert.equal(p.stage.classes.has('score-led-words'), false);
  // Another viewer's kept choice comes back; a bad value falls back to off.
  const q = page('terrain', JSON.stringify({terrainRoadside: 'all'}));
  assert.equal(q.input.value, 'all');
  await q.scene.load('a');
  assert.equal(q.options.terrainRoadside, 'all');
  const r = page('starry', '{"terrainRoadside":"poles"}');
  assert.equal(r.input.value, 'off');
  assert.equal(r.box.hidden, true);
  await r.scene.load('a');
  r.tick(); r.tick();
  assert.equal(r.texts.some(t => /点一条轨/.test(t)), true, 'other looks keep the help line');
  console.log('score terrain settings: PASS (shown only with 车窗地貌, off by default, kept per viewer, reaches the core; words off the scenery)');
})().catch(error => { console.error(error); process.exit(1); });
