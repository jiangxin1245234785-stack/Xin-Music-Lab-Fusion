'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const html = read('index.html');
const app = read('app.js');
const fusion = read('fusion.js');
const dynamicSource = read('i18n/dynamic-ui.js');
const dynamicUi = require('../i18n/dynamic-ui.js');
const catalogs = require('../i18n/catalogs.js');
const pkg = JSON.parse(read('package.json'));

assert.deepEqual(
  Object.keys(catalogs.ZH_CN_MESSAGES).sort(),
  Object.keys(catalogs.EN_US_MESSAGES).sort(),
  'Step 4 catalogs must remain structurally identical'
);

const manifestKeys = [
  ...dynamicUi.TEXT_BINDINGS.map(binding => binding[1]),
  ...dynamicUi.ATTRIBUTE_BINDINGS.map(binding => binding[2]),
  ...dynamicUi.CONTROL_LABEL_BINDINGS.map(binding => binding[1])
];
// 115 before 2026-11-13; the spectrum calibration panel's 27 bindings went with the panel.
// 2026-11-14: 88 → 73 with the cat panel's 15 bindings (removed).
// 2026-11-15: 74 → 72 with the analysis options group (its summary and the engine select's label; audit fix 1).
assert.ok(manifestKeys.length >= 72, `expected at least 72 panel bindings, received ${manifestKeys.length}`);

const referencedKeys = new Set(manifestKeys);
for (const source of [app, fusion]) {
  for (const pattern of [
    /uiText\(\s*['"]([^'"]+)['"]/g,
    /bindUiText\([^,]+,\s*['"]([^'"]+)['"]/g,
    /bindUiAttribute\([^,]+,\s*[^,]+,\s*['"]([^'"]+)['"]/g
  ]) {
    for (const match of source.matchAll(pattern)) referencedKeys.add(match[1]);
  }
}
for (const key of referencedKeys) {
  assert.ok(Object.hasOwn(catalogs.ZH_CN_MESSAGES, key), `missing zh-CN dynamic message: ${key}`);
  assert.ok(Object.hasOwn(catalogs.EN_US_MESSAGES, key), `missing en-US dynamic message: ${key}`);
}

assert.ok(html.indexOf('./i18n/static-ui.js') < html.indexOf('./i18n/dynamic-ui.js'));
assert.ok(html.indexOf('./i18n/dynamic-ui.js') < html.indexOf('./app.js'));
assert.match(dynamicSource, /const runtimeBindings = new Map\(\)/);
assert.match(dynamicSource, /runtimeBindings\.set\(element, binding\)/);
assert.match(dynamicSource, /bridge\(host\)\.subscribe\(render\)/);
assert.match(dynamicSource, /function unbind\(element\)/);
assert.match(fusion, /clearUiBinding\(dom\.analysisTitle\)/);
assert.match(fusion, /clearUiBinding\(dom\.analysisStatus\)/);
assert.doesNotMatch(fusion, /dom\.trackTitle|dom\.trackMeta/);
assert.match(fusion, /dynamicI18n\?\.subscribe/);

for (const forbidden of [
  'MutationObserver', 'requestAnimationFrame', 'performance.now', 'Date.now',
  'AudioContext', 'WebGLRenderingContext', 'WebGL2RenderingContext', 'Math.random'
]) {
  assert.equal(dynamicSource.includes(forbidden), false, `dynamic UI adapter must not use ${forbidden}`);
}

// Locale behavior is checked above; the product version may advance independently.
assert.match(pkg.scripts.pretest, /node --check i18n\/dynamic-ui\.js/);
assert.match(pkg.scripts.pretest, /i18n-step4\.cjs/);

console.log(`XML i18n Step 4: PASS (${manifestKeys.length} panel bindings / ${referencedKeys.size} referenced keys)`);
