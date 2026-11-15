'use strict';
// FX at start-up (2026-11-15): a saved strength of 0 stays 0, the on / off switch comes back as it
// was left, and a profile that never set it starts with FX off. Moving the slider still switches FX
// on above 0 and off at 0.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const fusion = fs.readFileSync(path.join(root, 'fusion.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

function cutFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `fusion.js has ${name}`);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unterminated ${name}`);
}

const writes = [];
const sets = [];
const sandbox = {
  Math, Number, String,
  state: { master: 1 },
  localStorage: { setItem: (key, value) => writes.push([key, value]) },
  visualGlitch: { set: values => sets.push({ ...values }) }
};
vm.createContext(sandbox);
vm.runInContext(`${cutFunction(fusion, 'savedMasterPercent')}\n${cutFunction(fusion, 'applyMaster')}\n
  globalThis.api = { savedMasterPercent, applyMaster };`, sandbox);
const { savedMasterPercent, applyMaster } = sandbox.api;

// 1. A saved 0 is 0; only "never saved" (or unreadable) falls back to 125.
assert.equal(savedMasterPercent('0'), 0);
assert.equal(savedMasterPercent('80'), 80);
assert.equal(savedMasterPercent('200'), 200);
assert.equal(savedMasterPercent('350'), 200);
assert.equal(savedMasterPercent('-5'), 0);
assert.equal(savedMasterPercent(null), 125);
assert.equal(savedMasterPercent(''), 125);
assert.equal(savedMasterPercent('not a number'), 125);

// 2. Restoring at start-up sets only the strength: on / off is left as app.js restored it,
//    and nothing is written back.
applyMaster(0, true);
assert.deepEqual(sets.pop(), { fxStrength: 0 });
applyMaster(140, true);
assert.deepEqual(sets.pop(), { fxStrength: 1.4 });
assert.equal(writes.length, 0);

// 3. The slider behaves as before: above 0 switches FX on, 0 switches it off, the value is saved.
applyMaster(140);
assert.deepEqual(sets.pop(), { enabled: true, fxStrength: 1.4 });
assert.deepEqual(writes.pop(), ['xins-fusion-master', '140']);
applyMaster(0);
assert.deepEqual(sets.pop(), { enabled: false, fxStrength: 0 });
assert.deepEqual(writes.pop(), ['xins-fusion-master', '0']);

// Start-up wiring: fusion.js restores with restoring = true; app.js puts on / off back from the
// saved FX settings, and its default for a new profile is off.
assert.match(fusion, /savedMaster = savedMasterPercent\(localStorage\.getItem\('xins-fusion-master'\)\)/);
assert.match(fusion, /applyMaster\(savedMaster, true\);/);
assert.equal(/Number\(localStorage\.getItem\('xins-fusion-master'\)\) \|\| 125/.test(fusion), false, 'the "|| 125" read is gone');
assert.match(app, /const glitchDefaults = \{\s*enabled: false,/);
assert.match(app, /const savedGlitchSettings = JSON\.parse\(localStorage\.getItem\('xins-fusion-glitch-settings'\)\);\s*if \(savedGlitchSettings && typeof savedGlitchSettings === 'object'\) applyGlitchConfig\(savedGlitchSettings, false\);/);
const applyConfig = cutFunction(app, 'applyGlitchConfig');
assert.match(applyConfig, /if \(next\.enabled !== undefined\) glitchConfig\.enabled = Boolean\(next\.enabled\);/);

console.log('fx restore contract ok');
