'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const profile = require('../material-mapping-profile.js');
const materialTargets = require('../material-target-registry.js');

const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const html = read('index.html');
const app = read('app.js');
const fusion = read('fusion.js');
const shadow = read('generator-runtime-shadow.js');

const extension = profile.runtimeExtension();
const registry = materialTargets.create();
assert.equal(
  profile.constants.CONTRACT,
  'xin.material-generator-mapping-extension/1'
);
assert.deepEqual(
  extension.targetDefinitions.map(definition => definition.id),
  registry.list().map(definition => definition.id)
);
assert.equal(extension.targetDefinitions.length, 4);
assert.equal(extension.mappings.length, 4);
assert.deepEqual(
  extension.mappings.map(mapping => mapping.sourceId),
  [
    'audio.loudness',
    'audio.flatness',
    'audio.flux',
    'audio.spectralDensity'
  ]
);
assert.deepEqual(
  extension.mappings.map(mapping => mapping.targetId),
  [
    'material.coverage',
    'material.continuity',
    'material.refreshRate',
    'material.density'
  ]
);
assert.ok(extension.targetDefinitions.every(
  definition =>
    definition.module === 'Material' &&
    definition.ownerLayer === 'material'
));

extension.mappings[0].range[0] = 99;
assert.notEqual(
  profile.runtimeExtension().mappings[0].range[0],
  99,
  'runtime extension must be cloned per host runtime'
);

const profileIndex = html.indexOf(
  '<script src="./material-mapping-profile.js"></script>'
);
const shadowIndex = html.indexOf(
  '<script src="./generator-runtime-shadow.js"></script>'
);
const appIndex = html.indexOf('<script src="./app.js"></script>');
assert.ok(profileIndex >= 0 && profileIndex < shadowIndex);
assert.ok(shadowIndex < appIndex);
assert.match(fusion, /mappingExtension:[\s\S]*runtimeExtension\(\)/);
assert.match(shadow, /mappingExtension: this\.mappingExtension/);
assert.match(app, /acceptGeneratorMapping/);

console.log(JSON.stringify({
  contract: profile.constants.CONTRACT,
  targetCount: extension.targetDefinitions.length,
  mappingCount: extension.mappings.length,
  sharedGeneratorEvaluator: true
}, null, 2));
