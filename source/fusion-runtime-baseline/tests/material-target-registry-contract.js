'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const api = require('../material-target-registry.js');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'material-target-registry.js'),
  'utf8'
);
const registry = api.create();
const definitions = registry.list();

assert.equal(registry.status().contract, 'xin.material-target-registry/1');
assert.equal(definitions.length, 4);
assert.ok(definitions.every(definition =>
  definition.id.startsWith('material.')
));
assert.ok(definitions.every(definition =>
  definition.ownerLayer === 'material' &&
  definition.actionClass &&
  definition.semanticIntent
));
assert.equal(
  Object.keys(registry.defaults()).length,
  definitions.length
);
assert.throws(
  () => registry.register({
    id: 'feedback.decay',
    defaultValue: 0,
    min: 0,
    max: 1,
    actionClass: 'feedback'
  }),
  /MATERIAL_TARGET_NAMESPACE_INVALID/
);

const split = registry.split({
  'material.coverage': 0.6,
  'feedback.decay': 0.92,
  'glsl:uCustom': 0.3
});
assert.deepEqual(split.material, { 'material.coverage': 0.6 });
assert.deepEqual(split.glitch, {
  'feedback.decay': 0.92,
  'glsl:uCustom': 0.3
});

const targetDefinitions = [
  ...definitions,
  {
    id: 'feedback.zoom',
    actionClass: 'motion',
    ownerLayer: 'glitch',
    semanticIntent: 'feedback-spatial-zoom'
  }
];
const duplicateMappings = [
  {
    id: 'material-bass-motion',
    sourceId: 'audio.bass',
    targetId: 'material.continuity'
  },
  {
    id: 'glitch-bass-motion',
    sourceId: 'audio.bass',
    targetId: 'feedback.zoom'
  }
];
const diagnostic = api.analyzeOwnership({
  mappings: duplicateMappings,
  targetDefinitions
});
assert.equal(diagnostic.contract, 'xin.mapping-ownership-diagnostics/1');
assert.equal(diagnostic.warningCount, 1);
assert.equal(diagnostic.warnings[0].severity, 'warning');
assert.deepEqual(diagnostic.warnings[0].ownerLayers, ['glitch', 'material']);
assert.equal(diagnostic.hardFailure, false);

const exempted = api.analyzeOwnership({
  mappings: [
    duplicateMappings[0],
    { ...duplicateMappings[1], allowDuplicate: true }
  ],
  targetDefinitions
});
assert.equal(exempted.warningCount, 0);
assert.equal(exempted.exemptedMappings, 1);

for (const forbidden of [
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'performance.now',
  'Date.now',
  'Math.random',
  'setInterval',
  'setTimeout'
]) {
  assert.equal(source.includes(forbidden), false, `forbidden: ${forbidden}`);
}

console.log(JSON.stringify({
  contract: registry.status().contract,
  targetCount: definitions.length,
  warningCount: diagnostic.warningCount,
  exemptedMappings: exempted.exemptedMappings
}, null, 2));
