'use strict';
// SPEC-B3, item 3: every on/off setting in the settings drawer is the same switch.
// A switch is either a checkbox (input.xl-switch-input, role="switch") inside a label row, or a button
// (button.xl-switch, role="switch") whose aria-checked follows the aria-pressed that app.js already keeps.
// Both draw the same pill; no setting is a boxed button any more, and none is a bare checkbox.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const shellJs = fs.readFileSync(path.join(root, 'shell.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'shell.css'), 'utf8');
const studio = fs.readFileSync(path.join(root, 'xml-studio.css'), 'utf8');

const start = html.indexOf('id="xlSettings"');
const end = html.indexOf('</aside>', start);
assert.ok(start > 0 && end > start, 'settings drawer found');
const drawer = html.slice(start, end);

// 1. Every checkbox in the drawer is a switch, and every switch is one of the two kinds.
const checkboxes = drawer.match(/<input[^>]*type="checkbox"[^>]*>/g) || [];
assert.ok(checkboxes.length >= 6, `checkboxes in the drawer: ${checkboxes.length}`);
for (const tag of checkboxes) {
  assert.match(tag, /class="xl-switch-input"/, `checkbox drawn as the switch: ${tag}`);
  assert.match(tag, /role="switch"/, `checkbox says it is a switch: ${tag}`);
}
const switchTags = drawer.match(/<(?:input|button)[^>]*role="switch"[^>]*>/g) || [];
const buttons = switchTags.filter(tag => tag.startsWith('<button'));
assert.deepEqual(buttons.map(tag => /id="([^"]+)"/.exec(tag)[1]).sort(), ['directorToggle', 'glitchPowerButton', 'pinButton']);
for (const tag of buttons) {
  assert.match(tag, /class="[^"]*\bxl-switch\b/, `button drawn as the switch: ${tag}`);
  assert.match(tag, /aria-checked="false"/, `button starts with a state: ${tag}`);
  assert.match(tag, /aria-pressed="false"/, `app.js keeps aria-pressed: ${tag}`);
  assert.match(tag, /data-i18n-aria-label="switch\./, `button has a spoken name in both languages: ${tag}`);
}
// The checkbox rows are labels, so clicking the words flips the switch too.
const rows = drawer.match(/<label class="xl-toggle-field">[\s\S]*?<\/label>/g) || [];
assert.equal(rows.length, checkboxes.length, 'every checkbox sits in a label row');

// 2. 置顶 is no longer a button in the button grid; it is a switch row like the others.
const grid = /<h3 data-i18n="shell.more">[\s\S]*?<div class="xl-grid">([\s\S]*?)<\/div>/.exec(drawer);
assert.ok(grid, 'the 更多 grid is still there');
assert.doesNotMatch(grid[1], /pinButton/);
assert.doesNotMatch(grid[1], /role="switch"/);

// 3. The two kinds draw the same pill, the button kind has no box of its own, and amber is only
//    the "on" state and the keyboard focus ring (not hover).
assert.match(css, /\.xl-switch::before, \.xl-switch-input \{ width: calc\(35px/);
assert.match(css, /\.xl-switch\[aria-checked="true"\]::before, \.xl-switch-input:checked \{ background: var\(--xl-accent\)/);
assert.match(css, /\.xl-switch:focus-visible, \.xl-switch-input:focus-visible \{ outline: 2px solid var\(--xl-accent\)/);
const buttonRule = /\.xl-settings \.xl-switch \{([^}]*)\}/.exec(css)[1];
assert.match(buttonRule, /border: 0;/);
assert.match(buttonRule, /background: transparent;/);
const hoverRules = [css, studio].map(text => (/\.xl-settings \.xl-switch:hover \{([^}]*)\}/.exec(text) || [])[1] || '');
for (const rule of hoverRules) assert.doesNotMatch(rule, /accent/, 'no amber on hover');
assert.match(studio, /\.xl-settings \.xl-switch \{ border: 0; background: transparent; box-shadow: none; \}/);

// 4. State sync, run for real: shell.js mirrors aria-pressed into aria-checked at start and on change.
function element(attrs = {}) {
  const map = new Map(Object.entries(attrs));
  return {
    classList: {contains: () => false, toggle() {}, add() {}, remove() {}},
    getAttribute: name => (map.has(name) ? map.get(name) : null),
    setAttribute(name, value) { map.set(name, String(value)); observers.forEach(o => o.notify(this, name)); },
    addEventListener() {}, click() {}, textContent: ''
  };
}
const observers = [];
class FakeObserver {
  constructor(callback) { this.callback = callback; this.targets = []; observers.push(this); }
  observe(target, options) { this.targets.push({target, filter: options.attributeFilter}); }
  notify(target, name) { if (this.targets.some(t => t.target === target && t.filter.includes(name))) this.callback([{target}]); }
  disconnect() { this.targets = []; }
}
const fx = element({'aria-pressed': 'true', 'aria-checked': 'false'});
const director = element({'aria-pressed': 'false', 'aria-checked': 'false'});
const pin = element({'aria-pressed': 'false', 'aria-checked': 'false'});
const plain = {settings: element(), settingsButton: element(), library: element(), libraryButton: element()};
const documentStub = {
  querySelector: selector => ({'#xlSettings': plain.settings, '#xlSettingsButton': plain.settingsButton, '#fusionPanel': plain.library, '#fusionButton': plain.libraryButton}[selector] || null),
  querySelectorAll: selector => (selector === 'button.xl-switch' ? [fx, director, pin] : []),
  addEventListener() {}
};
// shell.js runs on globalThis, so the context itself is the window.
vm.runInNewContext(shellJs, {document: documentStub, addEventListener() {}, MutationObserver: FakeObserver, setTimeout, console}, {filename: 'shell.js'});
assert.equal(fx.getAttribute('aria-checked'), 'true', 'synced at start');
assert.equal(director.getAttribute('aria-checked'), 'false');
director.setAttribute('aria-pressed', 'true');
assert.equal(director.getAttribute('aria-checked'), 'true', 'follows a change');
director.setAttribute('aria-pressed', 'false');
assert.equal(director.getAttribute('aria-checked'), 'false', 'follows it back');
pin.setAttribute('aria-pressed', 'true');
assert.equal(pin.getAttribute('aria-checked'), 'true');

// 5. The words on a switch name the setting only; on / off is the pill's (B3 follow-up, 1).
const appJs = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
assert.match(appJs, /bindUiText\(glitchPowerButton, 'shell\.fx', '画面特效'\);/);
// Not the same name as the 谱面阅读 select 「特效」 (B3 acceptance M2).
assert.match(html, /data-i18n="score\.effects">特效</);
assert.match(appJs, /bindUiText\(directorToggle, 'runtime\.director\.off', '自动换画面'\);/);
assert.match(appJs, /bindUiText\(pinButton, 'runtime\.pin\.off', '窗口置顶'\);/);
assert.doesNotMatch(appJs, /shell\.fxOn|shell\.fxOff|runtime\.director\.on|runtime\.pin\.on/);
const catalogText = fs.readFileSync(path.join(root, 'i18n', 'catalogs.js'), 'utf8');
assert.doesNotMatch(catalogText, /'shell\.fxO(n|ff)'|'runtime\.director\.on'|'runtime\.pin\.on'/);

// 6. 补上人声曲线 in the library drawer is an ordinary button, not amber (B3 follow-up, 3).
for (const text of [css, studio]) {
  const rule = (/\.score-layers-run\.is-docked \{([^}]*)\}/.exec(text) || [])[1] || '';
  assert.ok(rule, 'docked rule found');
  assert.doesNotMatch(rule, /accent/, rule);
}

// 7. 窗口置顶 says the window's real state (B3 acceptance L3).
const mainCjs = fs.readFileSync(path.join(root, 'desktop', 'main.cjs'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'desktop', 'preload.cjs'), 'utf8');
const toggle = mainCjs.slice(mainCjs.indexOf("ipcMain.handle('app:toggle-always-on-top'"), mainCjs.indexOf("ipcMain.handle('app:is-always-on-top'"));
assert.match(toggle, /return win\.isAlwaysOnTop\(\);/);
assert.doesNotMatch(toggle, /return next;/);
assert.match(preload, /isAlwaysOnTop: \(\) => ipcRenderer\.invoke\('app:is-always-on-top'\),/);
assert.match(appJs, /window\.SmokeResonanceDesktop\?\.isAlwaysOnTop\?\.\(\)\)/);
assert.match(appJs, /if \(typeof pinned === 'boolean'\) pinButton\.setAttribute\('aria-pressed', String\(pinned\)\);/);
// Run the two main-process handlers on stand-in windows: one the system refuses to raise, one it accepts.
{
  const handlers = {};
  const refuses = {top: false, isAlwaysOnTop() { return this.top; }, setAlwaysOnTop() {}};
  const accepts = {top: false, isAlwaysOnTop() { return this.top; }, setAlwaysOnTop(value) { this.top = value; }};
  const start = mainCjs.indexOf("  ipcMain.handle('app:toggle-always-on-top'");
  const end = mainCjs.indexOf('});', mainCjs.indexOf("ipcMain.handle('app:is-always-on-top'")) + 3;
  let current = refuses;
  new Function('ipcMain', 'BrowserWindow', mainCjs.slice(start, end))({handle: (name, fn) => { handlers[name] = fn; }}, {fromWebContents: () => current});
  assert.equal(handlers['app:toggle-always-on-top']({sender: {}}), false, 'refused: the switch says off');
  current = accepts;
  assert.equal(handlers['app:toggle-always-on-top']({sender: {}}), true);
  assert.equal(handlers['app:is-always-on-top']({sender: {}}), true, 'a reload reads it back');
  assert.equal(handlers['app:toggle-always-on-top']({sender: {}}), false, 'second press turns it off');
}
// 8. 画质 in Chinese words (B3 acceptance L5).
assert.ok(catalogText.includes("'runtime.quality.auto': '画质 自动'") && catalogText.includes("'runtime.quality.high': '画质 高'") && catalogText.includes("'runtime.quality.eco': '画质 省电'"));
assert.match(appJs, /return mode === 'high' \? '画质 高' : mode === 'eco' \? '画质 省电' : '画质 自动';/);
assert.doesNotMatch(html, />画质 Auto</);

console.log('settings switch contract ok');
