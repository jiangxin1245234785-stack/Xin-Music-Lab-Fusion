import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  CURRENT_ENGINE_VERSION,
  CURRENT_SCHEMA_VERSION,
  FixedStepEngineClock,
  GLSLUniformTargetRegistry,
  NodeGraphRuntime,
  PhysicalSafetyLimiter,
  TargetMixer,
  VALID_SHADER_PASS_SAMPLE,
  analyzeOfflineBuffer,
  applyMappingMacros,
  coerceGlslUniformValue,
  coreFeatureSourceValues,
  createContinuousFeatureValidationBuffer,
  createSeededPrng,
  mergeNodeOutputSources
} from '../dist/index.js';

const customRegistry = new GLSLUniformTargetRegistry();
const corruption = customRegistry.register({
  name: 'u_corruptionAmount',
  type: 'float',
  range: [0, 1],
  default: 0,
  label: 'Corruption Amount',
  impactCategory: 'high',
  impactWeight: 0.9
});

const fluxGraph = {
  nodes: [{
    id: 'flux-bus',
    kind: 'bus',
    label: 'Flux Bus',
    busMode: 'average'
  }],
  edges: [{
    id: 'flux-input',
    sourceId: 'audio.flux',
    targetNodeId: 'flux-bus',
    targetPort: 'input'
  }]
};

const fluxMapping = {
  id: 'flux-to-corruption',
  sourceId: 'node:flux-bus',
  targetId: corruption.target.id,
  range: [0, 1],
  amount: 1,
  attackMs: 0,
  fallMs: 0,
  safetyClamp: true
};

function runOfflineChain({
  intensity = 1,
  budget = 100,
  enabled = false
} = {}) {
  const buffer = createContinuousFeatureValidationBuffer();
  const featureFrames = analyzeOfflineBuffer(buffer);
  const clock = new FixedStepEngineClock(
    2048 / buffer.sampleRate * 1000
  );
  const mappingRandom = createSeededPrng(5301, 12);
  const nodeRandom = createSeededPrng(5302, 12);
  const nodeRuntime = new NodeGraphRuntime();
  const mixer = new TargetMixer();
  const safety = new PhysicalSafetyLimiter();
  const mappings = applyMappingMacros([fluxMapping], {
    intensity,
    response: 1.5
  });

  return featureFrames.map(features => {
    const clockFrame = clock.tick();
    const primary = coreFeatureSourceValues(features);
    const nodeFrame = nodeRuntime.evaluate(
      fluxGraph,
      primary,
      clockFrame,
      () => nodeRandom.nextFloat()
    );
    const mixed = mixer.mixFrame({
      mappings,
      sourceValues: mergeNodeOutputSources(primary, nodeFrame),
      baseState: { values: {} },
      clock: clockFrame,
      randomFloat: () => mappingRandom.nextFloat(),
      targetDefinitions: customRegistry.targetDefinitions(),
      energyBudget: {
        enabled,
        budget,
        weights: { [corruption.target.id]: 1 }
      }
    });
    return {
      flux: primary['audio.flux'],
      nodeFlux: nodeFrame.outputs['node:flux-bus'],
      replace: mixed.trace.replace.values[corruption.target.id],
      budgeted: mixed.trace.energyBudget.values[corruption.target.id],
      final: safety.apply(
        mixed.targets,
        clockFrame,
        customRegistry.targetDefinitions()
      ).values[corruption.target.id],
      decision: mixed.energyBudgetDecision
    };
  });
}

test('offline Flux -> node -> GLSL target follows mapping and macro data', () => {
  const normal = runOfflineChain({ intensity: 1 });
  const reduced = runOfflineChain({ intensity: 0.5 });

  assert.deepEqual(
    normal.map(frame => frame.flux),
    reduced.map(frame => frame.flux)
  );
  assert.deepEqual(
    normal.map(frame => frame.nodeFlux),
    normal.map(frame => frame.flux)
  );
  assert.ok(Math.max(...normal.map(frame => frame.final)) > 0.08);
  assert.ok(
    Math.max(...reduced.map(frame => frame.final)) <
    Math.max(...normal.map(frame => frame.final))
  );
  assert.equal(fluxMapping.sourceId, 'node:flux-bus');
  assert.equal(fluxMapping.targetId, 'glsl:u_corruptionAmount');
});

test('impactWeight participates in GlobalEnergyBudget attenuation', () => {
  const frames = runOfflineChain({
    intensity: 1,
    enabled: true,
    budget: 0.03
  });
  const limited = frames.filter(frame => frame.decision.attenuation < 1);

  assert.ok(limited.length > 0);
  for (const frame of limited) {
    const expectedRaw = Math.abs(frame.replace) * 0.9;
    assert.ok(
      Math.abs(frame.decision.rawWeightedEnergy - expectedRaw) < 1e-9
    );
    assert.ok(frame.decision.finalWeightedEnergy <= 0.03 + 1e-12);
    assert.ok(frame.budgeted <= frame.replace);
    assert.ok(frame.final >= 0 && frame.final <= 1);
  }
});

test('dynamic target range remains constrained with card safety disabled', () => {
  const clock = new FixedStepEngineClock(20);
  const clockFrame = clock.tick();
  const mixed = new TargetMixer().mixFrame({
    mappings: [{
      ...fluxMapping,
      sourceId: 'audio.flux',
      range: [-2, 3],
      safetyClamp: false
    }],
    sourceValues: { 'audio.flux': 1 },
    clock: clockFrame,
    targetDefinitions: customRegistry.targetDefinitions()
  });
  const final = new PhysicalSafetyLimiter().apply(
    mixed.targets,
    clockFrame,
    customRegistry.targetDefinitions()
  );

  assert.equal(mixed.trace.replace.values[corruption.target.id], 3);
  assert.equal(mixed.targets.values[corruption.target.id], 1);
  assert.equal(final.values[corruption.target.id], 1);
});

test('renderer coercion supports float, int and bool custom uniforms', () => {
  const registry = new GLSLUniformTargetRegistry();
  const integer = registry.register({
    name: 'u_damageSteps',
    type: 'int',
    range: [0, 8],
    default: 0
  }).target;
  const boolean = registry.register({
    name: 'u_damageGate',
    type: 'bool',
    range: [0, 1],
    default: 0
  }).target;

  assert.equal(coerceGlslUniformValue(corruption.target, 1.5), 1);
  assert.equal(coerceGlslUniformValue(integer, 3.6), 4);
  assert.equal(coerceGlslUniformValue(boolean, 0.49), 0);
  assert.equal(coerceGlslUniformValue(boolean, 0.5), 1);
});

test('Step 5.3 bindings remain intact after the Phase 5.4 editors', () => {
  const html = readFileSync(
    new URL('../demo/index.html', import.meta.url),
    'utf8'
  );
  const runtime = readFileSync(
    new URL('../src/ui-debug/phase1-demo.ts', import.meta.url),
    'utf8'
  );
  const renderer = readFileSync(
    new URL('../src/render/minimal-webgl-renderer.ts', import.meta.url),
    'utf8'
  );

  assert.match(html, /PHASE 5\.3 · FULL MAPPING CHAIN/);
  assert.match(runtime, /targetDefinitions/);
  assert.match(runtime, /getCustomUniformBindingStatus/);
  assert.match(runtime, /uniformTargetRegistry\.targetDefinitions\(\)/);
  assert.match(renderer, /writeCustomUniformTargets/);
  assert.match(renderer, /gl\.getUniformLocation/);
  assert.match(renderer, /gl\.uniform1f/);
  assert.match(renderer, /gl\.uniform1i/);
  assert.match(VALID_SHADER_PASS_SAMPLE, /uniform float u_corruptionAmount/);
  assert.match(VALID_SHADER_PASS_SAMPLE, /corruption/);
  assert.equal(CURRENT_SCHEMA_VERSION, 16);
  assert.equal(CURRENT_ENGINE_VERSION, '6.6.1-integration-v.3');
});
