'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const api = require('../target-inspector.js');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'target-inspector.js'),
  'utf8'
);

const report = ({ epoch = 0, rupture = 'PRESENT' } = {}) => ({
  contract: 'xin.glitch-runtime-frame/1',
  input: { transport: { epoch } },
  visualIntent: {
    contract: 'xin.generator-target-intent/1',
    dimensions: {
      luminance: { level: 'PRESENT' },
      motion: { level: 'PRESENT' },
      texture: { level: 'QUIET' },
      rupture: { level: rupture },
      color: { level: 'PRESENT' }
    }
  },
  safety: {
    mode: 'SAFE',
    physicalCapActive: true,
    interventions: { whiteout: false, brightnessSlewLimited: true }
  },
  mixer: {
    energyBudget: { enabled: true, attenuation: 0.8, activeTargets: 3 }
  }
});

const legacy = {
  continuous: {
    loudness: 0.6,
    climaxState: 0,
    bass: 0.6,
    mid: 0.2,
    sectionDrive: 0.2,
    treble: 0.1,
    trebleSmooth: 0.1,
    acid: 0.4,
    chordHue: 0.2,
    chordConfidence: 0.7
  },
  events: { bassPeak: 0, onset: 0 }
};

const inspector = api.create({
  intervalMs: 125,
  maxSamples: 2,
  formalPipeline: 'generator'
});
const first = inspector.update(125, legacy, report());

assert.equal(first.formalPipeline, 'generator');
assert.equal(first.comparatorMode, 'visual-intent-only');
assert.equal(first.comparison.length, 5);
assert.equal(first.comparison.find(row => row.id === 'rupture').relation, 'ALIGNED');
assert.equal(first.safety.activeInterventions.includes('brightnessSlewLimited'), true);
assert.equal(first.energy.attenuation, 0.8);
assert.equal(first.timeline.length, 1);

const held = inspector.update(200, legacy, report());
assert.deepEqual(held, first);

const second = inspector.update(250, legacy, report({ rupture: 'INTENSE' }));
assert.equal(second.timeline.length, 2);
assert.equal(second.comparison.find(row => row.id === 'rupture').relation, 'NEAR');

const resetEpoch = inspector.update(375, legacy, report({ epoch: 1 }));
assert.equal(resetEpoch.timeline.length, 1);
const copy = inspector.get();
copy.timeline[0].energy.attenuation = 0;
assert.equal(inspector.get().timeline[0].energy.attenuation, 0.8);

for (const forbidden of [
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getContext(',
  'WebGL',
  'performance.now',
  'Date.now',
  'Math.random'
]) {
  assert.equal(
    source.includes(forbidden),
    false,
    `Target Inspector contains forbidden operation: ${forbidden}`
  );
}

console.log(JSON.stringify({
  contract: 'target-inspector',
  dimensions: first.comparison.length,
  timelineBounded: true,
  comparatorMode: first.comparatorMode
}, null, 2));
