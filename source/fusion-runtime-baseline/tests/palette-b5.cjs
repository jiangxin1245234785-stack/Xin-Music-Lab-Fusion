'use strict';
// B5 (work/xml-round-20261115/SPEC-B5.md): the 「特效」 names, the new 配色 sets, 跟封面, the greyed row and the
// strobe kept off the score.
//   node tests/palette-b5.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const html = read('index.html'), app = read('app.js'), fusion = read('fusion.js'), catalogs = read('i18n/catalogs.js'), css = read('style.css');
const done = [];
// The two catalogs as the app sees them.
const {MESSAGE_CATALOGS} = require(path.join(root, 'i18n', 'catalogs.js'));
const zh = MESSAGE_CATALOGS['zh-CN'], en = MESSAGE_CATALOGS['en-US'];
assert.ok(catalogs.includes("'palette.dusk'"));
assert.ok(zh && en, 'catalogs load');

// --- A: two different things, two different names --------------------------------------------------------
(() => {
  assert.equal(zh['score.effects'], '音符光效');
  assert.equal(en['score.effects'], 'Note light');
  assert.equal(zh['score.fxFollow'], '光效跟随起伏');
  assert.equal(en['score.fxFollow'], 'Note light follows the music');
  assert.equal(zh['switch.effects'], '画面特效');
  assert.equal(zh['shell.fx'], '画面特效');
  assert.match(html, /data-i18n="score\.effects">音符光效</);
  assert.match(html, /data-i18n="score\.fxFollow">光效跟随起伏</);
  assert.match(html, /<kbd>G<\/kbd> 画面特效 ·/, 'G 开关的是画面特效');
  // Nothing in the score group says 特效 any more; the 画面特效 switch is not in the score group.
  const start = html.indexOf('id="xlScoreSettings"');
  const scoreGroup = html.slice(start, html.indexOf('</aside>', start));
  assert.ok(scoreGroup.includes('id="scoreEffects"'));
  assert.doesNotMatch(scoreGroup.replace(/<details[\s\S]*?<\/details>/, ''), /特效/, '谱面阅读组里不再出现「特效」');
  assert.ok(!scoreGroup.includes('glitchPowerButton'));
  // 谱面对齐 is docked into the 谱面阅读 group (above 导出视频), not into the second group (画面效果).
  const scene = read('score-scene.js');
  assert.match(scene, /const group = root\.document\.getElementById\('scoreTimingGroup'\);/);
  assert.match(scene, /group\.appendChild\(row\);/);
  assert.ok(!scene.includes('.xl-group + .xl-group'), '谱面对齐不再落到第二组');
  assert.ok(html.indexOf('data-i18n="score.options"') < html.indexOf('class="score-export"'));
  // Keys, defaults and behaviour unchanged.
  assert.match(html, /<select id="scoreEffects"><option value="clear" data-i18n="score\.fxClear" selected>/);
  done.push('「特效」不再重名：谱面的叫「音符光效 / 光效跟随起伏」，FX 那层仍叫「画面特效」，键名和缺省没动');
})();

// --- B: the new sets in the page ---------------------------------------------------------------------------
const NEW = ['cover', 'dusk', 'moss', 'wine', 'tide', 'ink', 'custom'];
const OLD = ['aurora', 'ember', 'moon', 'synthwave', 'toxic', 'ultraviolet', 'solar'];
(() => {
  const swatches = [...html.matchAll(/<button class="swatch[^"]*"[^>]*data-palette="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(swatches, NEW, '色块：跟封面在第一个，然后五套手调，最后自定义');
  assert.match(html, /<button class="swatch swatch--cover is-active" type="button" data-palette="cover"/, '跟封面缺省选中');
  assert.equal((html.match(/class="swatch[^"]*is-active/g) || []).length, 1);
  const presets = [...html.matchAll(/data-palette-preset="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(presets, ['dusk', 'moss', 'wine', 'tide', 'ink'], '调色面板的预设换成新的 5 套');
  for (const name of OLD) {
    assert.ok(!html.includes(`data-palette="${name}"`) && !html.includes(`data-palette-preset="${name}"`), `旧的 ${name} 不在页面里`);
    assert.ok(!new RegExp(`\\.(stage|swatch)\\[data-palette="${name}"\\]`).test(css), `旧的 ${name} 样式拿掉了`);
  }
  for (const key of ['dusk', 'moss', 'wine', 'tide', 'ink', 'coverAria', 'coverTitle', 'mutedScore', 'mutedOwn', 'mutedPulsar'])
    assert.ok(zh[`palette.${key}`] && en[`palette.${key}`], `palette.${key} 两种语言都有`);
  assert.deepEqual(['dusk', 'moss', 'wine', 'tide', 'ink'].map(k => zh[`palette.${k}`]), ['暮紫', '苔绿', '酒红', '潮汐', '黑白']);
  assert.ok(zh['switch.chordOff'] && en['switch.chordOff']);
  for (const name of OLD) assert.ok(!(`palette.${name}Aria` in zh) && !(`palette.${name}Aria` in en), `旧词条 palette.${name}Aria 拿掉了`);
  assert.ok(html.indexOf('src="./palette-core.js"') > 0 && html.indexOf('src="./palette-core.js"') < html.indexOf('src="./app.js"'), 'palette-core.js 在 app.js 之前载入');
  // The colours are the ones chosen in work/xml-palette-20261114 (hand-sets.json).
  const want = {dusk: ['#a17dd4', '#e7c2ed', '#1a1622'], moss: ['#689458', '#b9dcb9', '#111810'], wine: ['#b65263', '#efbbbc', '#201112'],
    tide: ['#42949d', '#bce8ea', '#0c181b'], ink: ['#c6c4be', '#f3f2ef', '#151412']};
  const sets = vm.runInNewContext(`(${/const palettes = (\{[\s\S]*?\n  \});/.exec(app)[1]})`);
  const hex = rgb => '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
  for (const [name, [main, hot, dark]] of Object.entries(want)) assert.deepEqual([hex(sets[name].main), hex(sets[name].hot), hex(sets[name].dark)], [main, hot, dark], name);
  assert.deepEqual(Object.keys(sets), ['cover', 'dusk', 'moss', 'wine', 'tide', 'ink']);
  done.push('色块是 跟封面 + 暮紫 / 苔绿 / 酒红 / 潮汐 / 黑白 + 自定义，颜色和候选页一致；旧 7 套从色块、预设、样式、词条里都拿掉了');
})();

// --- B: the pure rules, run from app.js's own lines ------------------------------------------------------------
const line = name => { const m = new RegExp(`  const ${name} = [^\\n]*(\\n    [^\\n]*)*;\\n`).exec(app); assert.ok(m, name); return m[0]; };
const rules = vm.runInNewContext(`${/const palettes = \{[\s\S]*?\n  \};/.exec(app)[0]}\n${line('PALETTE_DEFAULT')}${line('paletteName')}${line('paletteMuted')}({paletteName, paletteMuted, PALETTE_DEFAULT})`);
(() => {
  assert.equal(rules.PALETTE_DEFAULT, 'cover');
  for (const name of OLD) assert.equal(rules.paletteName(name), 'cover', `存着旧名字 ${name} 的落到跟封面`);
  for (const name of [undefined, null, '', 'nonsense', '__proto__', 'toString']) assert.equal(rules.paletteName(name), 'cover', String(name));
  for (const name of NEW) assert.equal(rules.paletteName(name), name);
  // Where the 配色 reaches, and where the row is greyed with a line.
  assert.equal(rules.paletteMuted('score', 'mono'), 'score');
  assert.equal(rules.paletteMuted('score', 'neon'), 'score');
  for (const id of ['beta-1', 'beta-7', 'beta-glitch-2']) assert.equal(rules.paletteMuted(id, 'neon'), 'own', id);
  assert.equal(rules.paletteMuted('pulsar', 'mono'), 'pulsarMono');
  assert.equal(rules.paletteMuted('pulsar', 'neon'), '');
  assert.equal(rules.paletteMuted('spectrum', 'mono'), '');
  assert.equal(rules.paletteMuted('ribbons', 'mono'), '');
  for (const kind of ['score', 'own', 'pulsarMono']) {
    const tag = new RegExp(`<small class="palette-muted" data-palette-muted="${kind}" data-i18n="[^"]+" hidden>[^<]+</small>`).exec(html);
    assert.ok(tag, `置灰时的那句话（${kind}）在页面里，缺省藏着`);
  }
  assert.match(html, /<div class="xl-row" data-palette-row>/);
  // The greying is re-checked whenever the scene or the pulsar's mode changes, and at start.
  assert.match(app, /stage\.dataset\.effect = name;\n    syncPaletteReach\(\);/);
  assert.match(app, /pulsarState\.mode = mode === 'neon' \? 'neon' : 'mono';\n    syncPaletteReach\(\);/);
  assert.match(app, /applyPalette\(PALETTE_DEFAULT, false\);\n  \}\n  syncPaletteReach\(\);/);
  assert.match(app, /row\.querySelectorAll\('\.swatch, #paletteButton'\)\.forEach\(button => \{ button\.disabled = Boolean\(muted\); \}\);/);
  done.push('旧名字、空值、怪名字都落到跟封面；谱面、MilkDrop 和黑白脉冲星下配色一行置灰并给一句话，LED 频谱、丝带、霓虹脉冲星不置灰');
})();

// --- B: 跟封面 follows the song: run app.js's own cover code against a fake page ----------------------------------
async function coverCase() {
  const PaletteCore = require(path.join(root, 'palette-core.js'));
  const start = app.indexOf('  const coverFallback = ');
  const end = app.indexOf('  function setPalettePanel(open) {');
  assert.ok(start > 0 && end > start);
  const pixelsOf = {
    'file:///red.jpg': rgba => { for (let i = 0; i < rgba.length; i += 4) rgba.set([190, 40, 50, 255], i); },
    'file:///blue.jpg': rgba => { for (let i = 0; i < rgba.length; i += 4) rgba.set([40, 80, 200, 255], i); },
    'file:///blue2.jpg': rgba => { for (let i = 0; i < rgba.length; i += 4) rgba.set([30, 70, 210, 255], i); },
    'file:///grey.jpg': rgba => { for (let i = 0; i < rgba.length; i += 4) rgba.set([128, 128, 128, 255], i); }
  };
  const loads = [], waiting = [];
  class Image {
    set src(url) { loads.push(url); this.url = url; waiting.push(this); }
    finish() { if (this.url === 'file:///missing.jpg') this.onerror(); else this.onload(); }
  }
  const document = {createElement: () => ({getContext: () => {
    let url;
    return {drawImage(image) { url = image.url; }, getImageData() {
      if (url === 'file:///tainted.jpg') throw Object.assign(new Error('tainted'), {name: 'SecurityError'});
      const data = new Uint8ClampedArray(48 * 48 * 4); pixelsOf[url](data); return {data};
    }};
  }})};
  const props = {};
  const env = {Image, document, window: {PaletteCore}, stage: {style: {setProperty: (k, v) => { props[k] = v; }}},
    palettes: {cover: {main: [0, 0, 0], hot: [0, 0, 0], dark: [0, 0, 0]}}, activePaletteName: 'cover', targetPalette: null,
    coverState: {url: null, source: 'none', notes: [], cache: new Map()},
    hexToRgb: hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)), Promise};
  vm.createContext(env);
  vm.runInContext(`${app.slice(start, end)}\nthis.setCoverPalette = setCoverPalette;`, env);
  const flush = async () => { while (waiting.length) { waiting.shift().finish(); await new Promise(r => setImmediate(r)); } await new Promise(r => setImmediate(r)); };
  const hex = rgb => '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');

  let p = env.setCoverPalette('file:///red.jpg'); await flush(); assert.equal(await p, 'cover');
  const red = hex(env.palettes.cover.main);
  assert.equal(env.targetPalette, env.palettes.cover, '选着跟封面时，换歌直接换目标色');
  assert.deepEqual(red, PaletteCore.coverPalette((() => { const d = new Uint8ClampedArray(48 * 48 * 4); pixelsOf['file:///red.jpg'](d); return d; })(), {}).main, '用的就是 palette-core 的 coverPalette');
  assert.equal(props['--cover-main'], red, '跟封面的色块画当前封面的颜色');
  p = env.setCoverPalette('file:///blue.jpg'); await flush(); await p;
  assert.notEqual(hex(env.palettes.cover.main), red, '换歌跟着换');
  const loadsBefore = loads.length;
  p = env.setCoverPalette('file:///red.jpg'); await flush(); await p;
  assert.equal(hex(env.palettes.cover.main), red);
  assert.equal(loads.length, loadsBefore, '同一张封面不重读');
  // A song changed again while its cover was being read: the later one wins.
  const slow = env.setCoverPalette('file:///blue2.jpg');   // not read before: it really waits for its pixels
  const fast = env.setCoverPalette('file:///grey.jpg');
  waiting.reverse();                                      // the later song's cover is read first, the earlier one after
  await flush(); await slow; await fast;
  assert.equal(env.coverState.url, 'file:///grey.jpg');
  assert.equal(hex(env.palettes.cover.main), '#c6c4be', '灰封面 → 黑白');
  for (const url of ['', null, 'file:///missing.jpg', 'file:///tainted.jpg']) {
    p = env.setCoverPalette('file:///red.jpg'); await flush(); await p;
    p = env.setCoverPalette(url); await flush(); await p;
    assert.deepEqual([hex(env.palettes.cover.main), hex(env.palettes.cover.hot), hex(env.palettes.cover.dark)], ['#c6c4be', '#f3f2ef', '#151412'], `没封面 / 读不出（${url}）→ 黑白`);
  }
  assert.match(env.coverState.source, /^unreadable:SecurityError$/);
  // Not on 跟封面: the cover is worked out but the shown set does not move.
  env.activePaletteName = 'dusk'; env.targetPalette = 'dusk-set';
  p = env.setCoverPalette('file:///blue.jpg'); await flush(); await p;
  assert.equal(env.targetPalette, 'dusk-set', '选着手调的一套时，换歌不改颜色');
  done.push('跟封面：换歌跟着换、同一张不重读、读到一半又换歌以后来的为准；没封面、读不出、灰封面都是黑白；选着手调时换歌不动');
}

// --- B: fusion.js hands the cover over; the chord colour is off; easing, not cutting ------------------------
(() => {
  assert.match(fusion, /if \(coverUrl\) dom\.cover\.src = coverUrl;\n    else dom\.cover\.removeAttribute\('src'\);\n    visualColor\?\.cover\?\.\(coverUrl\);/);
  assert.match(fusion, /const CHORD_COLOR_OFF = true;\n  function applyChordColor\(consensus\) \{\n    if \(CHORD_COLOR_OFF \|\|/);
  assert.match(html, /<input id="fusionAutoColor" class="xl-switch-input" type="checkbox" role="switch" disabled \/>/, '跟和弦变色置灰');
  // B6: the whole row is hidden, and the hidden attribute wins over the field's own display.
  assert.match(html, /<label class="xl-toggle-field" data-chord-color-row hidden><span>跟和弦变色/, '跟和弦变色整行藏起来');
  assert.match(read('shell.css'), /\.xl-toggle-field\[hidden\] \{ display: none; \}/);
  assert.match(html, /data-i18n="switch\.chordOff">/);
  assert.match(app, /cover: url => setCoverPalette\(url\),/);
  assert.match(app, /basePalette\[role\] = basePalette\[role\]\.map\(\(value, index\) => value \+ \(targetPalette\[role\]\[index\] - value\) \* step\);/, '换色是渐变');
  done.push('换歌时 fusion.js 把封面交给配色；跟和弦变色关掉并置灰（它会把手选的配色换成旧套）；换色渐变');
})();

// --- C: the strobe never over the score; its default is off ----------------------------------------------------
(() => {
  assert.match(app, /const colorFxDefaults = \{ cycle: 0, breath: 0, strobe: 0 \};/, '频闪缺省是关');
  assert.match(html, /<input data-color-fx-key="strobe" type="range" min="0" max="1" step="0\.05" value="0" \/>/);
  assert.match(app, /const strobe = stage\.dataset\.effect === 'score' \? 0 : colorFx\.strobe;\n    if \(strobe > \.001 &&/);
  assert.match(app, /const flashOpacity = strobe \* colorFxState\.flash \* \.24;/);
  assert.ok(!/colorFx\.strobe \* colorFxState/.test(app));
  done.push('调色面板的瞬态频闪缺省是关，谱面画面下不起作用');
})();

coverCase().then(() => {
  for (const line of done) console.log('ok  ' + line);
  console.log(`palette-b5: ${done.length} groups passed`);
}).catch(error => { console.error(error); process.exitCode = 1; });
