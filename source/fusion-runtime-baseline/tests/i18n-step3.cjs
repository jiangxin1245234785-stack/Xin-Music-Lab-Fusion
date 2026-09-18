'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const html = read('index.html');
const staticUi = read('i18n/static-ui.js');
const pkg = JSON.parse(read('package.json'));
const catalogs = require('../i18n/catalogs.js');

const zhKeys = Object.keys(catalogs.ZH_CN_MESSAGES).sort();
const enKeys = Object.keys(catalogs.EN_US_MESSAGES).sort();
assert.deepEqual(zhKeys, enKeys, 'zh-CN and en-US catalogs must have identical keys');

const bindingPattern = /data-i18n(?:-title|-aria-label|-placeholder|-alt)?="([^"]+)"/g;
const boundKeys = Array.from(html.matchAll(bindingPattern), match => match[1]);
const uniqueKeys = [...new Set(boundKeys)].sort();
assert.ok(boundKeys.length >= 90, `expected at least 90 explicit bindings, received ${boundKeys.length}`);
assert.ok(uniqueKeys.length >= 70, `expected at least 70 unique keys, received ${uniqueKeys.length}`);
for (const key of uniqueKeys) {
  assert.ok(Object.hasOwn(catalogs.ZH_CN_MESSAGES, key), `missing zh-CN message: ${key}`);
  assert.ok(Object.hasOwn(catalogs.EN_US_MESSAGES, key), `missing en-US message: ${key}`);
}

for (const id of [
  'trackTitle', 'trackMeta', 'sourceLabel', 'energyLabel', 'qualityButton',
  'pulsarLayoutButton', 'pulsarStyleButton', 'glitchPowerButton',
  'directorToggle', 'conductorToggle', 'pinButton'
]) {
  const tag = html.match(new RegExp(`<[^>]+id="${id}"[^>]*>`))?.[0] || '';
  assert.ok(tag, `missing protected dynamic element: ${id}`);
  assert.equal(/\sdata-i18n="/.test(tag), false, `static translation must not overwrite dynamic text: ${id}`);
}

assert.ok(html.indexOf('./i18n/locale-ui.js') < html.indexOf('./i18n/static-ui.js'));
assert.ok(html.indexOf('./i18n/static-ui.js') < html.indexOf('./app.js'));
assert.match(staticUi, /querySelectorAll\(binding\.selector\)/);
assert.match(staticUi, /xinMusicLabLocale\.subscribe/);
for (const forbidden of ['MutationObserver', 'requestAnimationFrame', 'performance.now', 'Date.now', 'AudioContext', 'WebGL']) {
  assert.equal(staticUi.includes(forbidden), false, `static UI adapter must not use ${forbidden}`);
}

// Locale behavior is checked above; the product version may advance independently.
assert.match(pkg.scripts.pretest, /i18n-step3\.cjs/);
assert.match(pkg.scripts.pretest, /node --check i18n\/static-ui\.js/);

console.log(`XML i18n Step 3: PASS (${boundKeys.length} bindings / ${uniqueKeys.length} keys)`);
