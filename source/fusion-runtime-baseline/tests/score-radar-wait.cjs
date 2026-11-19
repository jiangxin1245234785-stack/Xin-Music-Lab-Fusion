'use strict';
// The radar look waits for its materials (work/score-depth-20261118, radar.5's check): switching to it, or opening
// a song with it, draws nothing new until the core's ready() resolves, at most 2 s, keeping what the canvas shows;
// the sound is never held. Other looks draw at once.
//   node tests/score-radar-wait.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'score-scene.js'), 'utf8');

// A 2D context that takes any call (the scene writes its help line and status on the canvas).
const anyContext = new Proxy({}, {get: (t, k) => k in t ? t[k] : (k === 'measureText' ? () => ({width: 10}) : () => ({addColorStop() {}})), set: (t, k, v) => { t[k] = v; return true; }});

function page(style) {
  const elements = new Map(), storage = new Map([['xin-score-style-v1', style]]);
  let clock = 0, frameFn = null, release = null, draws = 0;
  function element(id) {
    const events = new Map();
    return {id, style: {}, dataset: {effect: 'score'}, hidden: false, value: '', classList: {add() {}, remove() {}, toggle() {}, contains: () => false},
      addEventListener: (t, f) => events.set(t, f), removeEventListener() {}, change(value) { this.value = value; events.get('change')(); },
      append() {}, appendChild() {}, remove() {}, querySelectorAll: () => [], querySelector: () => null, setAttribute() {}, getAttribute: () => null,
      getContext: () => anyContext, options: [], clientWidth: 800, clientHeight: 400, width: 800, height: 400, paused: true, seeking: false, currentTime: 0,
      getBoundingClientRect: () => ({top: 0, bottom: 400, left: 0, right: 800, height: 400, width: 800})};
  }
  const get = id => { if (!elements.has(id)) elements.set(id, element(id)); return elements.get(id); };
  const stage = get('stage');
  const host = {localStorage: {getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v)},
    document: {documentElement: {lang: 'zh-CN'}, getElementById: get, querySelector: () => null, createElement: () => element('x'), body: element('body')},
    Image: class {}, CustomEvent: class {}, dispatchEvent() {}, addEventListener() {}, removeEventListener() {},
    MutationObserver: class { constructor() {} observe() {} disconnect() {} }, setTimeout() {}, clearTimeout() {},
    requestAnimationFrame: fn => { frameFn = fn; return 1; }, cancelAnimationFrame() {},
    performance: {now: () => clock}, XinMediaClock: {create: () => ({now: () => 0, destroy() {}})},
    XinScoreMood: {normalize: v => v || 'starry'},
    XinScoreView: {create() {
      const options = {};
      return {setOptions: o => Object.assign(options, o), setModel() {}, setCover() {}, options: () => ({...options}), lanes: () => [], layers: () => ({}), lastFrame: () => ({}),
        resize() {}, setLyrics() {}, draw: () => { draws++; return {time: 0}; },
        ready: () => options.scoreStyle === 'glass' ? new Promise(r => { release = r; }) : Promise.resolve()};
    }}};
  vm.runInNewContext(source, host);
  const scene = host.XinScoreScene.create({stage, canvas: get('canvas'), audio: get('audio'), bridge: {scoreModel: async () => ({ok: true, model: {track: {duration: 50}, lanes: [], audio: {}}})}});
  const tick = (ms = 16) => { clock += ms; const f = frameFn; frameFn = null; if (f) f(clock); };
  return {scene, tick, draws: () => draws, release: () => release && release(), select: v => get('scoreStyle').change(v), at: () => clock};
}

(async () => {
  // Opening a song with the radar as the look: nothing drawn until ready, then drawing.
  const p = page('glass');
  await p.scene.load('a');
  for (let k = 0; k < 10; k++) p.tick();
  assert.equal(p.draws(), 0, 'no frame while the radar is not ready');
  p.release(); await new Promise(r => setImmediate(r));
  p.tick();
  assert.ok(p.draws() > 0, 'drawn once ready');
  // A look that never becomes ready is drawn anyway after two seconds.
  const q = page('glass');
  await q.scene.load('a');
  q.tick(500); q.tick(500); q.tick(500);
  assert.equal(q.draws(), 0);
  q.tick(600);
  assert.ok(q.draws() > 0, 'past two seconds: drawn with the fallbacks');
  // Another look draws at once; switching to the radar waits again.
  const s = page('starry');
  await s.scene.load('a');
  s.tick(); s.tick();
  const before = s.draws();
  assert.ok(before > 0, 'the starry look draws at once');
  s.select('glass');
  await new Promise(r => setImmediate(r));   // the scene asks the core for ready() on the next turn
  s.tick(); s.tick();
  assert.equal(s.draws(), before, 'switching to the radar holds the last frame');
  s.release(); await new Promise(r => setImmediate(r));
  s.tick();
  assert.ok(s.draws() > before, 'and draws once the radar is ready');
  console.log('score radar wait: PASS (holds the last frame until the radar is ready, two seconds at most; other looks at once)');
})().catch(error => { console.error(error); process.exit(1); });
