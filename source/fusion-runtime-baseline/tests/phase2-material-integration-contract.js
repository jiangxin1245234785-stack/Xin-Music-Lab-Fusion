'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const materialTargets = require('../material-target-registry.js');

const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const app = read('app.js');
const html = read('index.html');
const sourceAdapter = read('generator-source-adapter.js');
const packageJson = JSON.parse(read('package.json'));

const runtimeIndex = html.indexOf(
  '<script src="./visual-material-runtime.js"></script>'
);
const experimentalIndex = html.indexOf(
  '<script src="./experimental-materials.js"></script>'
);
const mappingProfileIndex = html.indexOf(
  '<script src="./material-mapping-profile.js"></script>'
);
const adapterIndex = html.indexOf(
  '<script src="./generator-source-adapter.js"></script>'
);
const appIndex = html.indexOf('<script src="./app.js"></script>');
assert.ok(runtimeIndex >= 0);
assert.ok(runtimeIndex < experimentalIndex);
assert.ok(experimentalIndex < mappingProfileIndex);
assert.ok(mappingProfileIndex < adapterIndex);
assert.ok(adapterIndex < appIndex);

for (const id of ['spectral-fabric', 'temporal-strata']) {
  assert.match(html, new RegExp(`data-effect="${id}"`));
  assert.match(app, new RegExp(`'${id}'`));
}
assert.match(app, /experimentalMaterialApi\?\.describe\(id\)/);
assert.match(app, /experimentalMaterialApi\.create\(id,/);
assert.match(app, /currentMaterialTargetValues\(\)/);
assert.match(app, /spectrum: materialSpectrum/);
assert.match(app, /contract: 'xin\.material-music-frame\/1'/);
assert.match(app, /setTargets: values => setMaterialTargetOverrides\(values\)/);
assert.match(app, /acceptGeneratorMapping/);
assert.match(app, /engineFrameSubscribers\.preMaterial/);
assert.match(app, /engineFrameSubscribers\.postMaterial/);
assert.match(sourceAdapter, /materialFields/);

const animate = app.slice(
  app.indexOf('function animate()'),
  app.indexOf(
    "enterButton.addEventListener('click'",
    app.indexOf('function animate()')
  )
);
for (const id of ['spectral-fabric', 'temporal-strata']) {
  assert.equal(
    animate.includes(`activeEffect === '${id}'`),
    false,
    `animate owns an experimental material branch: ${id}`
  );
}

const targetRegistry = materialTargets.create();
assert.deepEqual(
  Object.keys(targetRegistry.defaults()).sort(),
  [
    'material.continuity',
    'material.coverage',
    'material.density',
    'material.refreshRate'
  ]
);
const ownership = materialTargets.analyzeOwnership({
  targetDefinitions: targetRegistry.list(),
  mappings: []
});
assert.equal(ownership.warningCount, 0);

for (const script of [
  'node --check experimental-materials.js',
  'node --check material-mapping-profile.js',
  'node tests/experimental-materials-contract.js',
  'node tests/material-mapping-profile-contract.js',
  'node tests/material-frame-phase-contract.js',
  'node tests/phase2-material-integration-contract.js'
]) {
  assert.ok(
    `${packageJson.scripts.pretest} ${packageJson.scripts.test}`.includes(script),
    script
  );
}

console.log(JSON.stringify({
  contract: 'xin.phase2-material-integration/1',
  experimentalScriptsBeforeApp: true,
  materialIds: ['spectral-fabric', 'temporal-strata'],
  sharedFrameInput: true,
  materialTargetCount: targetRegistry.list().length,
  ownershipWarnings: ownership.warningCount,
  generatorMaterialFieldsTransported: true,
  noAnimateSelectionBranch: true
}, null, 2));
