import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  CURRENT_SCHEMA_VERSION,
  PRESET_DEFAULTS,
  VISUAL_TARGETS,
  buildUnifiedMusicFrame,
  createDefaultVisualValues,
  createGeneratorRuntime,
  getProductBuiltInPreset
} from '../dist/index.js';

const runtimeSource = await readFile(
  new URL('../src/runtime/runtime-facade.ts', import.meta.url),
  'utf8'
);

function frameAt(
  frameIndex,
  nowMs,
  options = {}
) {
  return buildUnifiedMusicFrame({
    clock: {
      frameIndex,
      nowMs,
      deltaMs: options.deltaMs ?? 16
    },
    transport: {
      mode: 'offline-test',
      state: 'playing',
      trackId: 'iii-1-fixture',
      mediaTimeMs: nowMs,
      durationMs: 120000,
      epoch: options.epoch ?? 0
    },
    ...(options.continuous ? { continuous: options.continuous } : {}),
    ...(options.meta ? { meta: options.meta } : {})
  });
}

const availableMeta = () => ({
  sourceProvider: 'realtime.core',
  providerDetail: {
    engineId: 'phase2-material-fixture',
    providerVersion: '1'
  },
  confidence: 1,
  available: true,
  ageMs: 0,
  fallbackReason: null
});

function materialMappingExtension() {
  const targets = [
    ['material.coverage', 1, 'coverage'],
    ['material.continuity', 0.72, 'motion'],
    ['material.refreshRate', 1, 'refresh'],
    ['material.density', 0.5, 'coverage']
  ].map(([id, defaultValue, actionClass]) => ({
    id,
    module: 'Material',
    label: id,
    defaultValue,
    min: 0,
    max: 1,
    actionClass,
    ownerLayer: 'material',
    semanticIntent: id
  }));
  return {
    targetDefinitions: targets,
    mappings: [
      {
        id: 'material-coverage-fixture',
        sourceId: 'audio.loudness',
        targetId: 'material.coverage',
        range: [0.3, 0.95],
        attackMs: 0,
        fallMs: 0,
        probability: 1
      },
      {
        id: 'material-density-fixture',
        sourceId: 'audio.spectralDensity',
        targetId: 'material.density',
        range: [0.1, 0.9],
        attackMs: 0,
        fallMs: 0,
        probability: 1
      }
    ]
  };
}

function fixturePreset() {
  return {
    ...PRESET_DEFAULTS,
    seed: 3101,
    mappings: [
      {
        id: 'deferred-source-proof',
        sourceId: 'audio.bass',
        targetId: VISUAL_TARGETS.feedbackZoom,
        range: [0.9, 1.2],
        attackMs: 80,
        fallMs: 240
      }
    ],
    targetDefaults: {
      id: 'iii-1-targets',
      values: createDefaultVisualValues()
    }
  };
}

test('III-1 evaluate returns a RuntimeFrameReport without rendering', () => {
  const runtime = createGeneratorRuntime({
    preset: fixturePreset(),
    sessionSeed: 17
  });
  const frame = frameAt(1, 16);
  const before = JSON.stringify(frame);
  const report = runtime.evaluate(frame, frame.clock);

  assert.equal(JSON.stringify(frame), before);
  assert.equal(report.contract, 'xin.glitch-runtime-frame/1');
  assert.equal(report.runtimeVersion, '3.5.0-visual-clock');
  assert.equal(report.clock.nowMs, 16);
  assert.equal(report.sources.contract, 'xin.glitch-source-frame/1');
  assert.equal(report.sources.registryVersion, '3.3.0-shadow');
  assert.equal(report.sources.sourceCount, 27);
  assert.equal(report.visualClock.enabled, false);
  assert.equal(report.visualIntent.contract, 'xin.generator-target-intent/1');
  assert.equal(report.sources.availableSourceCount, 0);
  assert.equal(report.mixer.pipeline.length, 7);
  assert.equal(report.safety.physicalCapActive, true);
  assert.equal(report.profile.evaluateCalls, 1);
  assert.equal(report.profile.renderAttempts, 0);
  assert.equal(report.profile.renderCalls, 0);
  assert.equal(report.profile.gpuContextsCreated, 0);
  assert.equal(report.profile.canvasTouches, 0);
  assert.equal(report.profile.rafRequests, 0);
  assert.equal(report.profile.zeroGpu, true);
});

test('III-1 reset reproduces fixed-frame targets with the same seed', () => {
  const runtime = createGeneratorRuntime({
    preset: fixturePreset(),
    sessionSeed: 29
  });
  const frame = frameAt(1, 16);
  const first = runtime.evaluate(frame, frame.clock);
  runtime.reset('determinism-check');
  const repeated = runtime.evaluate(frame, frame.clock);

  assert.deepEqual(repeated.targets, first.targets);
  assert.deepEqual(repeated.mixer, first.mixer);
  assert.equal(repeated.resetReason, 'determinism-check');
});

test('V-1 setPreset validates before atomic runtime replacement', () => {
  let renderResets = 0;
  const runtime = createGeneratorRuntime({
    preset: getProductBuiltInPreset('balanced'),
    sessionSeed: 51,
    renderPort: {
      render() { return null; },
      reset(reason) {
        if (reason === 'product-preset-change') renderResets++;
      }
    }
  });
  assert.equal(runtime.status().preset.id, 'balanced');
  assert.equal(runtime.status().preset.revision, 0);

  const applied = runtime.setPreset(
    getProductBuiltInPreset('temporal-excavation'),
    'product-preset-change'
  );
  assert.equal(applied.id, 'temporal-excavation');
  assert.equal(runtime.status().preset.id, 'temporal-excavation');
  assert.equal(runtime.status().preset.revision, 1);
  assert.equal(runtime.status().resetReason, 'product-preset-change');
  assert.equal(runtime.status().resetCount, 1);
  assert.equal(renderResets, 1);

  assert.throws(
    () => runtime.setPreset({
      id: 'broken',
      mappings: [{
        id: 'broken-source',
        sourceId: 'unknown.product.source',
        targetId: VISUAL_TARGETS.feedbackZoom
      }]
    }),
    /Preset validation failed/
  );
  assert.equal(runtime.status().preset.id, 'temporal-excavation');
  assert.equal(runtime.status().preset.revision, 1);
  assert.equal(runtime.status().resetCount, 1);
  assert.equal(renderResets, 1);
});

test('V-1 identical preset swaps remain deterministic offline', () => {
  const first = createGeneratorRuntime({
    preset: getProductBuiltInPreset('balanced'),
    sessionSeed: 18
  });
  const second = createGeneratorRuntime({
    preset: getProductBuiltInPreset('balanced'),
    sessionSeed: 18
  });
  first.setPreset(getProductBuiltInPreset('raster-deflection'));
  second.setPreset(getProductBuiltInPreset('raster-deflection'));
  const frame = frameAt(1, 16);
  assert.deepEqual(
    second.evaluate(frame, frame.clock),
    first.evaluate(frame, frame.clock)
  );
});

test('III-1 transport epoch resets state before a clock rewind', () => {
  const runtime = createGeneratorRuntime({
    preset: fixturePreset()
  });
  const first = frameAt(20, 320);
  runtime.evaluate(first, first.clock);
  const nextEpoch = frameAt(0, 0, { epoch: 1, deltaMs: 0 });
  const report = runtime.evaluate(nextEpoch, nextEpoch.clock);

  assert.equal(report.input.transport.epoch, 1);
  assert.equal(report.evaluationSerial, 1);
  assert.equal(report.resetReason, 'transport-epoch');
  assert.equal(runtime.status().resetCount, 1);
});

test('III-1 rejects mixed clocks and requires explicit reset on rewind', () => {
  const runtime = createGeneratorRuntime();
  const first = frameAt(2, 32);
  assert.throws(
    () => runtime.evaluate(first, { ...first.clock, nowMs: 31 }),
    /RUNTIME_CLOCK_MISMATCH/
  );
  runtime.evaluate(first, first.clock);
  const rewind = frameAt(1, 16);
  assert.throws(
    () => runtime.evaluate(rewind, rewind.clock),
    /RUNTIME_CLOCK_REWIND_REQUIRES_RESET/
  );
});

test('III-1 exposes render as a separate unavailable stage by default', () => {
  const runtime = createGeneratorRuntime();
  const frame = frameAt(1, 16);
  const evaluation = runtime.evaluate(frame, frame.clock);
  const rendered = runtime.render(null, evaluation);

  assert.equal(rendered.status, 'unavailable');
  assert.equal(rendered.output, null);
  assert.equal(rendered.profile.renderAttempts, 1);
  assert.equal(rendered.profile.renderCalls, 0);
  assert.equal(rendered.profile.zeroGpu, true);
});

test('III-1 render delegates only through an injected render port', () => {
  let renderCalls = 0;
  const runtime = createGeneratorRuntime({
    renderPort: {
      render(source, evaluation) {
        renderCalls++;
        return {
          source,
          evaluationSerial: evaluation.evaluationSerial
        };
      },
      profile() {
        return {
          renderCalls,
          gpuContextsCreated: 0,
          canvasTouches: 0,
          rafRequests: 0
        };
      }
    }
  });
  const frame = frameAt(1, 16);
  const evaluation = runtime.evaluate(frame, frame.clock);
  const rendered = runtime.render('fixture-source', evaluation);

  assert.equal(rendered.status, 'rendered');
  assert.equal(rendered.output.source, 'fixture-source');
  assert.equal(rendered.output.evaluationSerial, 1);
  assert.equal(rendered.profile.renderCalls, 1);
  assert.equal(rendered.profile.gpuContextsCreated, 0);
});

test('Phase 2 material mappings share one mixer without changing 21 formal targets', () => {
  const preset = getProductBuiltInPreset('balanced');
  const baseline = createGeneratorRuntime({ preset, sessionSeed: 61 });
  const extended = createGeneratorRuntime({
    preset,
    sessionSeed: 61,
    mappingExtension: materialMappingExtension()
  });
  const meta = {
    loudness: availableMeta(),
    spectralDensity: availableMeta()
  };
  const frame = frameAt(1, 16, {
    continuous: { loudness: 0.8, spectralDensity: 0.65 },
    meta
  });
  const baselineReport = baseline.evaluate(frame, frame.clock);
  const extendedReport = extended.evaluate(frame, frame.clock);
  const formalIds = Object.values(VISUAL_TARGETS)
    .filter(id => !id.startsWith('visual.'));

  assert.equal(formalIds.length, 21);
  for (const id of formalIds) {
    assert.equal(
      extendedReport.targets.values[id],
      baselineReport.targets.values[id],
      id
    );
  }
  assert.ok(
    extendedReport.targets.values['material.coverage'] >= 0.3 &&
    extendedReport.targets.values['material.coverage'] <= 0.95
  );
  assert.ok(
    extendedReport.targets.values['material.density'] >= 0.1 &&
    extendedReport.targets.values['material.density'] <= 0.9
  );
  assert.deepEqual(
    extendedReport.mixer.pipeline,
    baselineReport.mixer.pipeline
  );
  assert.equal(
    extendedReport.mixer.energyBudget.rawWeightedEnergy,
    baselineReport.mixer.energyBudget.rawWeightedEnergy
  );
});

test('Phase 2 material mapping extension survives preset swaps and epoch resets', () => {
  const runtime = createGeneratorRuntime({
    preset: getProductBuiltInPreset('balanced'),
    sessionSeed: 71,
    mappingExtension: materialMappingExtension()
  });
  const meta = {
    loudness: availableMeta(),
    spectralDensity: availableMeta()
  };
  const first = frameAt(1, 16, {
    continuous: { loudness: 0.9, spectralDensity: 0.8 },
    meta
  });
  runtime.evaluate(first, first.clock);
  runtime.setPreset(getProductBuiltInPreset('quantized-memory'));
  const swapped = frameAt(1, 16, {
    continuous: { loudness: 0.9, spectralDensity: 0.8 },
    meta
  });
  const afterSwap = runtime.evaluate(swapped, swapped.clock);
  assert.ok('material.coverage' in afterSwap.targets.values);

  const seek = frameAt(0, 0, {
    epoch: 1,
    deltaMs: 0,
    continuous: { loudness: 0.2, spectralDensity: 0.3 },
    meta
  });
  const afterSeek = runtime.evaluate(seek, seek.clock);
  assert.equal(afterSeek.resetReason, 'transport-epoch');
  assert.ok('material.density' in afterSeek.targets.values);
});

test('Phase 2 rejects material extensions that collide or escape ownership', () => {
  const extension = materialMappingExtension();
  assert.throws(
    () => createGeneratorRuntime({
      mappingExtension: {
        ...extension,
        targetDefinitions: [{
          ...extension.targetDefinitions[0],
          id: VISUAL_TARGETS.feedbackDecay
        }]
      }
    }),
    /RUNTIME_MAPPING_EXTENSION_TARGET_NAMESPACE_INVALID/
  );
  assert.throws(
    () => createGeneratorRuntime({
      mappingExtension: {
        ...extension,
        targetDefinitions: [{
          ...extension.targetDefinitions[0],
          ownerLayer: 'glitch'
        }]
      }
    }),
    /RUNTIME_MAPPING_EXTENSION_TARGET_OWNERSHIP_INVALID/
  );
});

test('III-1 dispose is idempotent and blocks further evaluation', () => {
  const runtime = createGeneratorRuntime();
  runtime.dispose();
  runtime.dispose();
  assert.equal(runtime.status().lifecycle, 'disposed');
  const frame = frameAt(1, 16);
  assert.throws(
    () => runtime.evaluate(frame, frame.clock),
    /RUNTIME_DISPOSED/
  );
});

test('III-1 runtime source has no DOM, GPU, RAF or wall-clock dependency', () => {
  for (const forbidden of [
    'document.',
    'window.',
    'HTMLCanvas',
    'OffscreenCanvas',
    'WebGL',
    'getContext(',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'performance.now',
    'Date.now',
    'Math.random'
  ]) {
    assert.equal(
      runtimeSource.includes(forbidden),
      false,
      `Runtime source contains forbidden dependency: ${forbidden}`
    );
  }
  assert.equal(CURRENT_SCHEMA_VERSION, 16);
});
