'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const api = require('../visual-material-runtime.js');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'visual-material-runtime.js'),
  'utf8'
);
const canvasA = { width: 1280, height: 720 };
const canvasB = { width: 960, height: 540 };
const calls = [];
const registry = api.createRegistry();

function register(id, canvas) {
  registry.register({
    id,
    label: id,
    category: 'legacy',
    sourceKind: 'base-canvas',
    create: () => api.createLegacyAdapter({
      id,
      sourceKind: 'base-canvas',
      reset: reason => calls.push(`${id}:reset:${reason}`),
      update: frame => calls.push(`${id}:update:${frame.clock.frameIndex}`),
      render: frame => {
        calls.push(`${id}:render:${frame.clock.frameIndex}`);
        return {
          kind: 'canvas',
          source: canvas,
          sourceKind: 'base-canvas'
        };
      }
    })
  });
}

register('spectrum', canvasA);
register('waveform', canvasB);
assert.deepEqual(registry.status().ids, ['spectrum', 'waveform']);
assert.throws(
  () => register('spectrum', canvasA),
  /MATERIAL_ID_DUPLICATE/
);

const runtime = api.createRuntime({
  registry,
  initialMaterialId: 'spectrum'
});
let evaluatorCalls = 0;
let glitchCalls = 0;
const orchestrator = api.createFrameOrchestrator({
  materialRuntime: runtime,
  evaluateMapping: (_musicFrame, clock) => {
    evaluatorCalls++;
    return {
      values: {
        'material.coverage': 0.8,
        'feedback.decay': 0.9
      },
      frameIndex: clock.frameIndex
    };
  },
  renderGlitch: frame => {
    glitchCalls++;
    return { frameIndex: frame.clock.frameIndex };
  }
});

const first = orchestrator.run({
  musicFrame: { contract: 'xin.music-frame/1' },
  clock: { frameIndex: 7, nowMs: 100, deltaMs: 16.67 },
  target: { width: 1280, height: 720 }
});
assert.equal(first.frameIndex, 7);
assert.equal(first.materialTargets['material.coverage'], 0.8);
assert.equal(first.glitchTargets['feedback.decay'], 0.9);
assert.equal(first.materialOutput.color.contract, 'xin.material-surface/1');
assert.equal(first.materialOutput.color.source, canvasA);
assert.equal(first.materialOutput.color.kind, 'canvas');
assert.equal(first.materialOutput.frameIndex, 7);
assert.equal(evaluatorCalls, 1);
assert.equal(glitchCalls, 1);
assert.deepEqual(first.order, [
  'mapping',
  'material-update',
  'material-render',
  'glitch-render',
  'compose'
]);
assert.throws(
  () => orchestrator.run({
    musicFrame: {},
    clock: { frameIndex: 7, nowMs: 101 }
  }),
  /MATERIAL_FRAME_DUPLICATE/
);

runtime.activate('waveform', 'material-change');
const second = orchestrator.run({
  musicFrame: { contract: 'xin.music-frame/1' },
  clock: { frameIndex: 8, nowMs: 116.67, deltaMs: 16.67 },
  target: { width: 960, height: 540 }
});
assert.equal(second.materialOutput.color.source, canvasB);
assert.equal(runtime.status().activeMaterialId, 'waveform');
assert.equal(runtime.status().material.lastResetReason, 'material-change');
assert.ok(calls.includes('spectrum:reset:material-deactivate'));
assert.ok(calls.includes('waveform:reset:material-change'));

const observed = orchestrator.observeGlitch(8, { status: 'rendered' });
assert.equal(observed.matches, true);
assert.equal(orchestrator.status().sameFramePass, true);
assert.equal(orchestrator.observeGlitch(9).matches, false);
assert.equal(orchestrator.status().frameMismatchCount, 1);

runtime.reset('resize');
assert.equal(runtime.status().material.lastResetReason, 'resize');

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
  contract: runtime.status().contract,
  registryCount: registry.status().count,
  materialFrameIndex: second.frameIndex,
  sameFramePass: observed.matches,
  lifecycleCalls: calls.length
}, null, 2));
