'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const api = require('../generator-source-adapter.js');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'generator-source-adapter.js'),
  'utf8'
);
const stage = { dataset: { effect: 'spectrum' } };
const baseCanvas = { nodeName: 'CANVAS', width: 1280, height: 720 };
const betaCanvas = { nodeName: 'CANVAS', width: 1920, height: 1080 };
const materialCanvas = { nodeName: 'CANVAS', width: 640, height: 360 };
let materialOutput = null;
const adapter = api.create({
  stage,
  baseCanvas,
  betaCanvas,
  materialProvider: () => materialOutput,
  rendererEnabled: true
});

const base = adapter.get();
assert.equal(base.contract, 'xin.xml-visual-source/1');
assert.equal(base.available, true);
assert.equal(base.source, baseCanvas);
assert.equal(base.sourceKind, 'base-canvas');
assert.equal(base.extensionContract, 'xin.xml-material-source/1');
assert.equal(base.materialAvailable, false);

stage.dataset.effect = 'beta-3';
const beta = adapter.get();
assert.equal(beta.source, betaCanvas);
assert.equal(beta.sourceKind, 'butterchurn-canvas');
assert.equal(beta.width, 1920);
assert.equal(beta.height, 1080);
assert.equal(adapter.status().formalPipeline, 'legacy');
assert.equal(adapter.status().rendererEnabled, true);

materialOutput = Object.freeze({
  contract: 'xin.material-output/1',
  materialId: 'spectral-fabric',
  frameIndex: 42,
  color: Object.freeze({
    contract: 'xin.material-surface/1',
    kind: 'canvas',
    sourceKind: 'material-canvas',
    source: materialCanvas,
    width: 640,
    height: 360,
    format: 'rgba8',
    colorSpace: 'srgb'
  }),
  fields: Object.freeze({
    density: Object.freeze({ kind: 'external', source: {} })
  })
});
const material = adapter.get();
assert.equal(material.contract, 'xin.xml-visual-source/1');
assert.equal(material.extensionContract, 'xin.xml-material-source/1');
assert.equal(material.source, materialCanvas);
assert.equal(material.sourceKind, 'material-canvas');
assert.equal(material.materialId, 'spectral-fabric');
assert.equal(material.materialFrameIndex, 42);
assert.equal(material.materialAvailable, true);
assert.deepEqual(adapter.status().fieldIds, ['density']);

for (const forbidden of [
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getContext(',
  'Math.random',
  'performance.now',
  'Date.now'
]) {
  assert.equal(source.includes(forbidden), false, `forbidden: ${forbidden}`);
}

console.log(JSON.stringify({
  contract: base.contract,
  base: base.sourceKind,
  beta: beta.sourceKind,
  material: material.materialId,
  materialFrameIndex: material.materialFrameIndex,
  rendererEnabled: true
}, null, 2));
