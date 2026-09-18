'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const api = require('../shadow-stability-monitor.js');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'shadow-stability-monitor.js'),
  'utf8'
);

const report = ({ activeVoices = 2, voiceLimit = 4, finite = true } = {}) => ({
  contract: 'xin.glitch-runtime-frame/1',
  input: { transport: { epoch: 0 } },
  targets: { values: { 'feedback.zoom': finite ? 1.1 : Number.NaN } },
  profile: {
    zeroGpu: true,
    renderCalls: 0,
    gpuContextsCreated: 0,
    canvasTouches: 0,
    rafRequests: 0
  },
  mixer: {
    eventBudget: {
      enabled: true,
      activeVoices,
      voiceLimit,
      droppedTriggers: 0,
      evictedVoices: 0
    },
    energyBudget: { attenuation: 1, activeTargets: 1 }
  }
});

const monitor = api.create({
  minimumObservationMs: 1000,
  intervalMs: 125,
  telemetryIntervalMs: 250,
  maxSamples: 16
});

for (let index = 0; index <= 8; index++) {
  const nowMs = index * 125;
  monitor.observe(
    { nowMs },
    report(),
    index < 4 ? 'internal' : 'external'
  );
  if (index % 2 === 0) {
    monitor.observeTelemetry(nowMs, {
      available: true,
      cpuPercent: 18 + index,
      memoryKb: 100_000 + index * 256,
      processCount: 3
    });
  }
}

const stable = monitor.get();
assert.equal(stable.formalPipeline, 'legacy');
assert.equal(stable.rendererEnabled, false);
assert.equal(stable.gate.status, 'PASS');
assert.deepEqual(stable.observation.sourceModes, ['internal', 'external']);
assert.equal(stable.targets.finite, true);
assert.equal(stable.eventVoices.bounded, true);
assert.equal(stable.telemetry.samples, 5);
assert.ok(stable.telemetry.memoryGrowthKb > 0);

const blocked = api.create({ minimumObservationMs: 1 });
blocked.observe({ nowMs: 1 }, report({ activeVoices: 5, voiceLimit: 4 }), 'internal');
assert.equal(blocked.get().gate.status, 'BLOCKED');
assert.ok(blocked.get().gate.reasons.includes('EVENT_VOICE_LIMIT'));

const validationReport = () => ({
  ...report(),
  profile: {
    zeroGpu: false,
    renderCalls: 8,
    gpuContextsCreated: 1,
    canvasTouches: 8,
    rafRequests: 0
  }
});
const validationStatus = ({ state = 'ready', restores = 0, mode = 'auto' } = {}) => ({
  qualityMode: mode,
  renderReport: {
    output: {
      context: {
        state,
        contextLosses: restores,
        contextRestores: restores,
        gpuContextsCreated: 1 + restores,
        lastError: null
      },
      quality: {
        mode,
        id: mode === 'auto' ? 'auto-balanced' : mode,
        renderScale: mode === 'eco' ? 0.5 : 1,
        maxDpr: mode === 'high' ? 2 : 1.35,
        renderedFrames: 8,
        skippedFrames: 0
      }
    }
  }
});
const validation = api.create({
  minimumObservationMs: 1000,
  intervalMs: 125,
  rendererExpected: true,
  formalPipeline: 'generator'
});
for (let index = 0; index <= 8; index++) {
  validation.observe(
    { nowMs: index * 125 },
    validationReport(),
    'internal',
    validationStatus()
  );
}
const validationStable = validation.get();
assert.equal(validationStable.rendererEnabled, true);
assert.equal(validationStable.formalPipeline, 'generator');
assert.equal(validationStable.gate.status, 'PASS');
assert.equal(validationStable.renderer.gpuContextsCreated, 1);
assert.equal(validationStable.renderer.rafRequests, 0);
assert.equal(validationStable.gate.reasons.includes('SECOND_RAF_DETECTED'), false);
assert.equal(validationStable.renderer.quality.mode, 'auto');

const contextMonitor = api.create({
  minimumObservationMs: 1000,
  intervalMs: 125,
  rendererExpected: true
});
contextMonitor.observe(
  { nowMs: 0 },
  validationReport(),
  'internal',
  validationStatus({ state: 'lost' })
);
assert.ok(contextMonitor.get().gate.reasons.includes('RENDER_CONTEXT_LOST'));
for (let index = 1; index <= 8; index++) {
  const restoredReport = validationReport();
  restoredReport.profile.gpuContextsCreated = 2;
  contextMonitor.observe(
    { nowMs: index * 125 },
    restoredReport,
    'internal',
    validationStatus({ restores: 1, mode: 'eco' })
  );
}
const restored = contextMonitor.get();
assert.equal(restored.gate.status, 'PASS');
assert.equal(restored.renderer.context.contextRestores, 1);
assert.equal(restored.renderer.quality.mode, 'eco');

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
    `Shadow monitor contains forbidden operation: ${forbidden}`
  );
}

console.log(JSON.stringify({
  contract: 'shadow-stability-monitor',
  status: stable.gate.status,
  sourceModes: stable.observation.sourceModes,
  telemetrySamples: stable.telemetry.samples
}, null, 2));
