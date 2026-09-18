'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const html = read('index.html');
const fusion = read('fusion.js');
const main = read('desktop/main.cjs');
const preload = read('desktop/preload.cjs');
const desktopBridge = read('i18n/desktop-locale-bridge.js');
const generatorBridge = read('desktop/generator-locale.cjs');
const localeModule = require('../desktop/locale.cjs');
const generatorLocale = require('../desktop/generator-locale.cjs');
const pkg = JSON.parse(read('package.json'));

assert.deepEqual(localeModule.SUPPORTED_LOCALES, ['zh-CN', 'en-US']);
assert.deepEqual(
  Object.keys(localeModule.NATIVE_MESSAGES['zh-CN']).sort(),
  Object.keys(localeModule.NATIVE_MESSAGES['en-US']).sort(),
  'native message catalogs must have identical keys'
);
const locale = localeModule.createMainLocaleController();
assert.equal(locale.getState().locale, 'zh-CN');
assert.equal(locale.message('dialog.snapshot.filter'), 'PNG 图像');
locale.setRendererLocale('en-US');
assert.equal(locale.message('dialog.snapshot.filter'), 'PNG image');
assert.equal(locale.message('window.generator.title', { version: '6.6.1' }), 'Glitch Mapping Generator · 6.6.1');
assert.throws(() => locale.setRendererLocale('fr-FR'), /unsupported-locale/);

for (const key of [
  'dialog.bridge.openTitle', 'dialog.bridge.filter', 'dialog.preset.exportTitle',
  'dialog.preset.importTitle', 'dialog.preset.filter', 'dialog.snapshot.saveTitle',
  'dialog.snapshot.filter', 'window.generator.title'
]) {
  assert.ok(main.includes(`mainLocale.message('${key}'`), `native message is not wired: ${key}`);
}
assert.match(main, /ipcMain\.handle\('app:locale-get'/);
assert.match(main, /ipcMain\.handle\('app:locale-set'/);
assert.match(main, /normalizeLocale\(payload\?\.locale\) \|\| mainLocale\.getState\(\)\.locale/);
assert.match(main, /applyGeneratorHostLocale\(editor\.webContents, locale\)/);
assert.match(main, /syncGeneratorLocale\(state\.locale\)/);
assert.match(preload, /getLocale: \(\) => ipcRenderer\.invoke\('app:locale-get'\)/);
assert.match(preload, /setLocale: locale => ipcRenderer\.invoke\('app:locale-set', \{ locale \}\)/);
assert.match(preload, /openGeneratorEditor: \(locale = null\)/);
assert.match(fusion, /openGeneratorEditor\?\.\(document\.documentElement\.lang\)/);
assert.match(fusion, /analyzeInXld\?\.\(state\.selectedTrackId \|\| '', document\.documentElement\.lang\)/);

assert.ok(html.indexOf('./i18n/dynamic-ui.js') < html.indexOf('./i18n/desktop-locale-bridge.js'));
assert.ok(html.indexOf('./i18n/desktop-locale-bridge.js') < html.indexOf('./app.js'));
assert.match(desktopBridge, /locale\.subscribe\(sync\)/);
assert.match(desktopBridge, /desktop\.setLocale\(state\.locale\)/);
assert.match(generatorBridge, /globalThis\.xinGlitchGeneratorLocale/);
assert.match(generatorLocale.hostLocaleScript('en-US'), /setLocale\("en-US"\)/);

for (const forbidden of [
  'MutationObserver', 'requestAnimationFrame', 'AudioContext', 'WebGLRenderingContext',
  'WebGL2RenderingContext', 'Math.random', 'preset.mappings', 'UnifiedMusicFrame'
]) {
  assert.equal(desktopBridge.includes(forbidden), false, `desktop locale bridge must not use ${forbidden}`);
  assert.equal(generatorBridge.includes(forbidden), false, `generator locale bridge must not use ${forbidden}`);
}

assert.match(pkg.scripts.pretest, /i18n-step5\.cjs/);
assert.match(pkg.scripts.pretest, /node --check desktop\/locale\.cjs/);
assert.match(pkg.scripts.pretest, /node --check desktop\/generator-locale\.cjs/);

console.log('XML i18n Step 5: PASS (native dialogs + XLD/Generator locale hand-off)');
