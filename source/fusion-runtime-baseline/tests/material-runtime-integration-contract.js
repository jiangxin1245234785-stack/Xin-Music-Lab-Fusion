'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const app = read('app.js');
const fusion = read('fusion.js');
const html = read('index.html');
const sourceAdapter = read('generator-source-adapter.js');
const packageJson = JSON.parse(read('package.json'));
const visualTargets = read(
  'tools/glitch-generator/6.6.1-integration-v.3/dist/render/visual-targets.js'
);

const targetScriptIndex = html.indexOf(
  '<script src="./material-target-registry.js"></script>'
);
const runtimeScriptIndex = html.indexOf(
  '<script src="./visual-material-runtime.js"></script>'
);
const adapterScriptIndex = html.indexOf(
  '<script src="./generator-source-adapter.js"></script>'
);
const appScriptIndex = html.indexOf('<script src="./app.js"></script>');
assert.ok(targetScriptIndex >= 0);
assert.ok(targetScriptIndex < runtimeScriptIndex);
assert.ok(runtimeScriptIndex < adapterScriptIndex);
assert.ok(adapterScriptIndex < appScriptIndex);

assert.match(app, /materialRegistry\.register\(\{/);
assert.match(app, /materialApi\.createRuntime\(\{/);
assert.match(app, /materialApi\.createFrameOrchestrator\(\{/);
assert.match(app, /materialFrameOrchestrator\.run\(materialFrame\)/);
assert.match(app, /SmokeResonanceMaterialView = Object\.freeze/);
assert.match(app, /materialRuntime\?\.reset\('resize'\)/);

const animate = app.slice(
  app.indexOf('function animate()'),
  app.indexOf("enterButton.addEventListener('click'", app.indexOf('function animate()'))
);
for (const oldBranch of [
  "activeEffect === 'spectrum'",
  "activeEffect === 'mirror'",
  "activeEffect === 'waveform'",
  "activeEffect === 'radial'",
  "activeEffect === 'waterfall'",
  "activeEffect === 'pulsar'",
  "activeEffect === 'tunnel'",
  "activeEffect === 'pulse-grid'",
  "activeEffect === 'bloom'"
]) {
  assert.equal(
    animate.includes(oldBranch),
    false,
    `animate still owns legacy selection branch: ${oldBranch}`
  );
}

assert.match(fusion, /materialProvider: \(\) =>/);
assert.match(fusion, /SmokeResonanceMaterialView\?\.observeGlitch/);
assert.match(fusion, /SmokeResonanceMaterialView\?\.reset\(resetReason\)/);
assert.match(sourceAdapter, /xin\.xml-material-source\/1/);
assert.match(sourceAdapter, /materialFrameIndex/);
assert.match(sourceAdapter, /materialFields/);

for (const script of [
  'node --check material-target-registry.js',
  'node --check visual-material-runtime.js',
  'node tests/material-target-registry-contract.js',
  'node tests/visual-material-runtime-contract.js',
  'node tests/material-runtime-integration-contract.js'
]) {
  assert.ok(
    `${packageJson.scripts.pretest} ${packageJson.scripts.test}`.includes(script),
    script
  );
}

for (const field of ['actionClass', 'ownerLayer', 'semanticIntent']) {
  assert.ok(visualTargets.includes(field), `missing built Generator metadata: ${field}`);
}

console.log(JSON.stringify({
  contract: 'xin.phase1-material-integration/1',
  materialScriptsBeforeApp: true,
  registryOwnsSelection: true,
  sourceContractExtended: true,
  sameFrameObserverConnected: true,
  formalTargetOwnershipMetadata: true
}, null, 2));
