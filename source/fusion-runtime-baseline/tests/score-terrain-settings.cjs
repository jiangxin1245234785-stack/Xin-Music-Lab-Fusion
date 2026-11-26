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

function page(style, kept, scoreModel) {
  const elements = new Map(), storage = new Map([['xin-score-style-v1', style]]);
  if (kept !== undefined) storage.set('xin-score-terrain-v1', kept);
  const options = {}, texts = [];
  function element(id) {
    const events = new Map(), classes = new Set();
    return {id, style: {}, dataset: {effect: 'score'}, hidden: false, value: '', classes,
      classList: {add: c => classes.add(c), remove: c => classes.delete(c), toggle: (c, on) => { (on ?? !classes.has(c)) ? classes.add(c) : classes.delete(c); }, contains: c => classes.has(c)},
      addEventListener: (t, f) => events.set(t, f), removeEventListener() {}, change(value) { this.value = value; events.get('change')(); },
      check(checked) { this.checked = checked; events.get('change')(); },
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
  const scene = host.XinScoreScene.create({stage, canvas: get('canvas'), audio: get('audio'), hasSections: () => false,
    bridge: {scoreModel: scoreModel || (async () => ({ok: true, model: {track: {duration: 50}, lanes: [], audio: {}}}))}});
  const tick = (ms = 16) => { clock += ms; const f = frameFn; frameFn = null; if (f) f(clock); };
  return {scene, options, storage, stage, texts, tick, box: get('scoreTerrainOptions'), input: get('scoreTerrainRoadside'),
    weather: get('scoreTerrainWeather'), driver: get('scoreTerrainWeatherDriver'), drops: get('scoreTerrainGlassDrops'), lightning: get('scoreTerrainLightning'), dropsBox: get('scoreTerrainGlassOptions'),
    style: v => get('scoreStyle').change(v)};
}

(async () => {
  const p = page('terrain');
  assert.equal(p.box.hidden, false, 'shown with 车窗地貌');
  assert.equal(p.input.value, 'all', 'all by default (batch 5)');
  assert.equal(p.weather.value, 'clear', 'new installs start clear');
  assert.equal(p.driver.value, 'mood', 'mood curves drive the weather by default');
  assert.equal(p.dropsBox.hidden, true);
  assert.equal(p.drops.checked, true);
  assert.equal(p.lightning.checked, true);
  assert.ok(p.stage.classes.has('score-led-words'));
  await p.scene.load('a');
  assert.equal(p.options.terrainRoadside, 'all', 'the core gets it on opening a song');
  assert.equal(p.options.terrainWeather, 'clear');
  p.tick(); p.tick();
  assert.equal(p.scene.status().prep.line, '请在 XLD 分析段落和情绪曲线。', 'both missing analyses share one status line');
  assert.equal(p.texts.some(t => /点一条轨/.test(t)), false, 'no help line about lanes on the scenery');
  p.input.change('kick-snare');
  assert.equal(p.options.terrainRoadside, 'kick-snare');
  assert.deepEqual(JSON.parse(p.storage.get('xin-score-terrain-v1')), {terrainRoadside: 'kick-snare', terrainWeather: 'clear', terrainWeatherDriver: 'mood', terrainGlassDrops: true, terrainLightning: true}, 'kept per viewer');
  p.weather.change('rain');
  assert.equal(p.dropsBox.hidden, false);
  p.drops.check(false);
  p.lightning.check(false);
  p.driver.change('original');
  assert.equal(p.scene.status().prep.line, '这首歌还没有段落，请去 XLD 分析段落。');
  p.driver.change('unknown');
  assert.equal(p.options.terrainWeatherDriver, 'original');
  assert.equal(p.scene.status().presentationLook.terrainWeather, 'rain', 'the export snapshot gets the live selection');
  assert.equal(p.scene.status().presentationLook.terrainWeatherDriver, 'original');
  assert.equal(p.scene.status().presentationLook.terrainGlassDrops, false);
  assert.equal(p.scene.status().presentationLook.terrainLightning, false);
  await p.scene.load('b');
  p.tick();
  assert.equal(p.scene.status().prep.line, '这首歌还没有段落，请去 XLD 分析段落。');
  assert.equal(p.options.terrainWeather, 'rain', 'kept on track change');
  assert.equal(p.options.terrainGlassDrops, false);
  assert.equal(p.options.terrainLightning, false);
  p.style('glass');
  assert.equal(p.box.hidden, true, 'hidden with another look');
  assert.equal(p.dropsBox.hidden, true);
  assert.equal(p.stage.classes.has('score-led-words'), false);
  // A kept choice comes back (off included: someone who chose it keeps it); a bad value falls back to the default.
  const q = page('terrain', JSON.stringify({terrainRoadside: 'off'}));
  assert.equal(q.input.value, 'off');
  await q.scene.load('a');
  assert.equal(q.options.terrainRoadside, 'off');
  assert.equal(q.options.terrainWeather, 'clear', 'a pre-weather setting safely defaults to clear');
  assert.equal(q.options.terrainWeatherDriver, 'mood', 'previous versions migrate to mood');
  assert.equal(q.options.terrainGlassDrops, true);
  const restored = page('terrain', p.storage.get('xin-score-terrain-v1'));
  await restored.scene.load('a');
  assert.equal(restored.weather.value, 'rain');
  assert.equal(restored.options.terrainWeather, 'rain');
  assert.equal(restored.options.terrainWeatherDriver, 'original');
  assert.equal(restored.drops.checked, false);
  restored.weather.change('clear');
  assert.equal(restored.options.terrainWeather, 'clear');
  assert.equal(restored.dropsBox.hidden, true);
  const r = page('starry', '{"terrainRoadside":"poles"}');
  assert.equal(r.input.value, 'all');
  assert.equal(r.box.hidden, true);
  await r.scene.load('a');
  r.tick(); r.tick();
  assert.equal(r.texts.some(t => /点一条轨/.test(t)), true, 'other looks keep the help line');
  const notice = page('terrain', undefined, async id => ({ok: true, model: {track: {duration: 50}, lanes: [], audio: {},
    ...(id === 'no-sections' ? {moodCurve: {}} : {sections: [[0, 8]]})}}));
  await notice.scene.load('no-sections');
  notice.tick();
  assert.equal(notice.scene.status().prep.line, '这首歌还没有段落，请去 XLD 分析段落。');
  await notice.scene.load('no-mood');
  notice.scene.hold(true);
  notice.tick();
  assert.ok(!notice.texts.includes('请在 XLD 计算情绪曲线。'), 'export hold does not paint or consume the notice');
  notice.scene.hold(false);
  notice.tick();
  assert.equal(notice.scene.status().prep.line, '请在 XLD 计算情绪曲线。');
  notice.tick(7999);
  assert.equal(notice.scene.status().prep.line, '请在 XLD 计算情绪曲线。');
  notice.tick(1);
  assert.equal(notice.scene.status().prep.line, null);
  notice.driver.change('original');
  notice.driver.change('mood');
  await notice.scene.load('no-mood');
  notice.tick();
  assert.equal(notice.scene.status().prep.line, null, 'toggling or refreshing does not show the notice again');
  await notice.scene.load('no-sections');
  notice.tick();
  assert.equal(notice.scene.status().prep.line, null, 'switching back to the same song does not show it again');
  const empty = page('terrain', undefined, async () => ({ok: false, error: 'score-no-notes', health: {moodCurveAvailable: false}}));
  await empty.scene.load('no-notes');
  empty.tick();
  assert.ok(empty.texts.includes('请在 XLD 分析段落和情绪曲线。'));
  console.log('score terrain settings: PASS (defaults and migration, live switch, export snapshot, combined and once-per-song notices)');
})().catch(error => { console.error(error); process.exit(1); });
