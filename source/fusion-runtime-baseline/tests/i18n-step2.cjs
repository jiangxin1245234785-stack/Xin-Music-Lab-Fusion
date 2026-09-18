'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const html = read('index.html');
const css = read('style.css');
const localeUi = read('i18n/locale-ui.js');
const pkg = JSON.parse(read('package.json'));

assert.match(html, /id="localeControl"/);
assert.match(html, /data-locale="zh-CN"/);
assert.match(html, /data-locale="en-US"/);
assert.ok(html.indexOf('./i18n/bootstrap.js') < html.indexOf('./i18n/locale-ui.js'));
assert.ok(html.indexOf('./i18n/locale-ui.js') < html.indexOf('./app.js'));
assert.match(css, /\.locale-control button\.is-active/);
assert.match(css, /data-locale-source="host"/);
assert.match(localeUi, /bridge\.setLocale\(button\.dataset\.locale\)/);
assert.match(localeUi, /aria-pressed/);
assert.match(localeUi, /locale\.control\.label/);
// Locale behavior is checked above; the product version may advance independently.
assert.match(pkg.scripts.pretest, /i18n-step2\.cjs/);

console.log('XML i18n Step 2: PASS');
