'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const api = require('../experimental-materials.js');

function fixtureSpectrum(shift = 0) {
  return Float32Array.from({ length: 96 }, (_, index) => {
    const low = Math.exp(-Math.pow((index - 18 - shift) / 10, 2)) * 0.72;
    const mid = Math.exp(-Math.pow((index - 51 + shift) / 15, 2)) * 0.54;
    const air = 0.08 + 0.05 * Math.sin(index * 0.39 + shift);
    return Math.max(0, Math.min(1, low + mid + air));
  });
}

function fakeCanvas(width, height) {
  const canvas = {
    width,
    height,
    frames: [],
    getContext() {
      return {
        createImageData(w, h) {
          return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
        },
        putImageData(image) {
          canvas.frames.push(new Uint8ClampedArray(image.data));
        }
      };
    }
  };
  return canvas;
}

function createSurface(input) {
  return Object.freeze({
    contract: 'xin.material-surface/1',
    kind: input.kind,
    source: input.source,
    sourceKind: input.sourceKind,
    width: input.width,
    height: input.height,
    format: input.format,
    colorSpace: input.colorSpace
  });
}

const fabricOptions = {
  width: 80,
  height: 45,
  spectrum: fixtureSpectrum(),
  palette: {
    main: [141, 124, 255],
    hot: [114, 232, 206],
    dark: [26, 21, 58]
  },
  energy: 0.57,
  phase: 3.25,
  coverage: 0.84,
  continuity: 0.73,
  density: 0.61
};
const firstFabric = api.pure.buildSpectralFabric(fabricOptions);
const repeatedFabric = api.pure.buildSpectralFabric(fabricOptions);
const shiftedFabric = api.pure.buildSpectralFabric({
  ...fabricOptions,
  spectrum: fixtureSpectrum(9)
});

assert.deepEqual(firstFabric.color, repeatedFabric.color);
assert.deepEqual(firstFabric.density, repeatedFabric.density);
assert.notDeepEqual(firstFabric.density, shiftedFabric.density);
assert.ok(firstFabric.coverage > 0.05 && firstFabric.coverage < 0.95);
assert.equal(firstFabric.color.length, 80 * 45 * 4);
assert.equal(firstFabric.density.length, 80 * 45);
assert.ok(api.pure.spectrumMetrics(fixtureSpectrum()).spread > 0.1);
const articulatedFixture = api.pure.articulateSpectrum(
  api.pure.smoothSpectrum(fixtureSpectrum(), 0.73)
);
assert.ok(
  api.pure.spectrumMetrics(articulatedFixture).spread >
    api.pure.spectrumMetrics(
      api.pure.smoothSpectrum(fixtureSpectrum(), 0.73)
    ).spread,
  'temporal rows must preserve relative spectral articulation'
);

const firstRow = api.pure.buildTemporalRow({
  width: 80,
  spectrum: fixtureSpectrum(),
  energy: 0.57,
  phase: 3.25,
  coverage: 0.84,
  continuity: 0.73,
  density: 0.61
});
const repeatedRow = api.pure.buildTemporalRow({
  width: 80,
  spectrum: fixtureSpectrum(),
  energy: 0.57,
  phase: 3.25,
  coverage: 0.84,
  continuity: 0.73,
  density: 0.61
});
assert.deepEqual(firstRow, repeatedRow);

let presented = 0;
const temporal = api.create('temporal-strata', {
  createCanvas: fakeCanvas,
  createSurface,
  presentSurface: () => presented++,
  maxWidth: 80,
  maxHeight: 45
});
temporal.reset('contract');
const musicFrame = {
  contract: 'xin.material-music-frame/1',
  spectrum: fixtureSpectrum(),
  energy: { overall: 0.57 },
  palette: fabricOptions.palette,
  playing: true
};
const slowParameters = {
  'material.coverage': 0.84,
  'material.continuity': 0.73,
  'material.refreshRate': 0,
  'material.density': 0.61
};

temporal.update(musicFrame, { frameIndex: 1, nowMs: 0, deltaMs: 0 }, slowParameters);
const temporalFirst = temporal.render({ width: 160, height: 90 });
assert.equal(temporalFirst.contract, 'xin.material-output/1');
assert.equal(temporalFirst.color.contract, 'xin.material-surface/1');
assert.deepEqual(Object.keys(temporalFirst.fields).sort(), ['age', 'density']);
assert.equal(temporalFirst.fields.age.contract, 'xin.material-field/1');
assert.equal(temporal.status().refreshCount, 1);
assert.ok(temporal.status().refreshIntervalMs >= 1450);
assert.ok(
  temporal.status().metrics.coverage > 0.12,
  'temporal material must be visibly primed before authentic history accumulates'
);
const primedFirstFrame = temporalFirst.color.source.frames.at(-1);
const primedDensity = temporalFirst.fields.density.source.frames.at(-1);
assert.ok(
  new Set(
    Array.from({ length: primedDensity.length / 4 }, (_, index) =>
      primedDensity[index * 4]
    )
  ).size > 24,
  'latent history must contain layered tonal structure'
);

temporal.update(musicFrame, { frameIndex: 2, nowMs: 500, deltaMs: 500 }, slowParameters);
const temporalHeld = temporal.render({ width: 160, height: 90 });
assert.equal(temporalHeld.frameIndex, 2);
assert.equal(temporal.status().refreshCount, 1);

temporal.update(musicFrame, { frameIndex: 3, nowMs: 1600, deltaMs: 1100 }, slowParameters);
temporal.render({ width: 160, height: 90 });
assert.equal(temporal.status().refreshCount, 2);
assert.ok(temporal.status().metrics.coverage >= 0);
assert.ok(temporal.status().metrics.meanFrameDifference >= 0);

temporal.reset('deterministic-prime');
temporal.update(musicFrame, { frameIndex: 4, nowMs: 0, deltaMs: 0 }, slowParameters);
const deterministicPrime = temporal.render({ width: 160, height: 90 });
assert.deepEqual(
  deterministicPrime.color.source.frames.at(-1),
  primedFirstFrame,
  'latent history must be deterministic for the same frame'
);

temporal.reset('idle-prime');
temporal.update(
  { ...musicFrame, energy: { overall: 0.025 } },
  { frameIndex: 5, nowMs: 0, deltaMs: 0 },
  { ...slowParameters, 'material.refreshRate': 1 }
);
temporal.render({ width: 160, height: 90 });
temporal.update(
  musicFrame,
  { frameIndex: 6, nowMs: 40, deltaMs: 40 },
  { ...slowParameters, 'material.refreshRate': 1 }
);
temporal.render({ width: 160, height: 90 });
assert.ok(
  temporal.status().metrics.coverage > 0.12,
  'a paused cold start must be re-primed when real audio arrives'
);

const fabric = api.create('spectral-fabric', {
  createCanvas: fakeCanvas,
  createSurface,
  presentSurface: () => presented++,
  maxWidth: 80,
  maxHeight: 45
});
fabric.reset('contract');
fabric.update(
  musicFrame,
  { frameIndex: 4, nowMs: 1700, deltaMs: 16 },
  { ...slowParameters, 'material.refreshRate': 1 }
);
const fabricOutput = fabric.render({ width: 160, height: 90 });
assert.deepEqual(Object.keys(fabricOutput.fields), ['density']);
assert.equal(fabric.status().adapter, 'native-material');
assert.ok(fabric.status().input.spectrum.max > fabric.status().input.spectrum.min);
assert.equal(
  fabric.status().input.parameters['material.coverage'],
  slowParameters['material.coverage']
);
assert.ok(presented >= 4);

const source = fs.readFileSync(
  path.join(__dirname, '..', 'experimental-materials.js'),
  'utf8'
);
for (const forbidden of [
  'Math.random',
  'requestAnimationFrame',
  'getFloatFrequencyData',
  'getByteFrequencyData',
  'document.',
  'window.'
]) {
  assert.equal(source.includes(forbidden), false, forbidden);
}

console.log(JSON.stringify({
  contract: 'xin.experimental-materials-contract/1',
  version: api.constants.VERSION,
  ids: api.list().map(definition => definition.id),
  deterministic: true,
  temporalLowRefreshHeld: true,
  fields: {
    'spectral-fabric': Object.keys(fabricOutput.fields),
    'temporal-strata': Object.keys(temporalFirst.fields)
  }
}, null, 2));
