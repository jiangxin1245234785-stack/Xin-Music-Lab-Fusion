'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const catalogs = require('../i18n/catalogs.js');
const runtime = require('../i18n/runtime-messages.js');
const translator = require('../i18n/translator.js');
const controllerModule = require('../i18n/locale-controller.js');
const nativeLocale = require('../desktop/locale.cjs');

const root = path.join(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const sortedKeys = value => Object.keys(value).sort();

assert.deepEqual(sortedKeys(catalogs.ZH_CN_MESSAGES), sortedKeys(catalogs.EN_US_MESSAGES), 'static catalog parity');
assert.deepEqual(sortedKeys(runtime.ZH_CN_RUNTIME_MESSAGES), sortedKeys(runtime.EN_US_RUNTIME_MESSAGES), 'runtime catalog parity');
assert.deepEqual(sortedKeys(nativeLocale.NATIVE_MESSAGES['zh-CN']), sortedKeys(nativeLocale.NATIVE_MESSAGES['en-US']), 'native catalog parity');

const html = read('index.html');
const boundKeys = [...html.matchAll(/data-i18n(?:-title|-placeholder|-aria-label|-alt)?="([^"]+)"/g)].map(match => match[1]);
// The former two-tab navigation now uses runtime workspace labels.
const workspaceKeys = [...html.matchAll(/data-workspace-copy="([^"]+)"/g)].map(match => 'runtime.workspace.' + match[1]);
assert.ok(boundKeys.length + workspaceKeys.length >= 70, 'static and workspace bindings are present');
for (const key of workspaceKeys) {
  assert.ok(Object.hasOwn(runtime.EN_US_RUNTIME_MESSAGES, key), `missing English workspace key: ${key}`);
  assert.ok(Object.hasOwn(runtime.ZH_CN_RUNTIME_MESSAGES, key), `missing Chinese workspace key: ${key}`);
}
for (const key of boundKeys) {
  assert.ok(Object.hasOwn(catalogs.EN_US_MESSAGES, key), `missing English static key: ${key}`);
  assert.ok(Object.hasOwn(catalogs.ZH_CN_MESSAGES, key), `missing Chinese static key: ${key}`);
  assert.doesNotMatch(translator.translateMessage('en-US', key), /^\[/, `English fallback marker: ${key}`);
  assert.doesNotMatch(translator.translateMessage('zh-CN', key), /^\[/, `Chinese fallback marker: ${key}`);
}

const appSource = read('app.js');
const runtimeKeys = new Set([...appSource.matchAll(/['"](runtime\.[\w.]+)['"]/g)].map(match => match[1]));
assert.ok(runtimeKeys.size >= 130, `expected broad runtime key coverage, got ${runtimeKeys.size}`);
for (const key of runtimeKeys) {
  assert.ok(Object.hasOwn(runtime.EN_US_RUNTIME_MESSAGES, key), `missing English runtime key: ${key}`);
  assert.ok(Object.hasOwn(runtime.ZH_CN_RUNTIME_MESSAGES, key), `missing Chinese runtime key: ${key}`);
}

const locale = controllerModule.createLocaleController({ initialLocalLocale: 'en-US' });
assert.deepEqual(locale.getState(), { locale: 'en-US', source: 'local' });
locale.setHostLocale('zh-CN');
assert.deepEqual(locale.getState(), { locale: 'zh-CN', source: 'host' });
locale.clearHostLocale();
assert.deepEqual(locale.getState(), { locale: 'en-US', source: 'local' });

const packageJson = JSON.parse(read('package.json'));
// Locale behavior is independent of the development version label.
assert.match(packageJson.scripts.test, /i18n-step6\.cjs/);
assert.match(read('i18n/README.md'), /Step 6/);

console.log(`XLD i18n Step 6: PASS (${boundKeys.length} bindings, ${runtimeKeys.size} runtime references)`);
