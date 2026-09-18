import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ENERGY_BUDGET_CONFIG_DEFAULTS,
  EventMappingProcessor,
  TargetMixer,
  VISUAL_TARGETS,
  createSeededPrng
} from '../dist/index.js';

const clock = (frameIndex = 0, nowMs = 0, deltaMs = 0) => ({
  frameIndex,
  nowMs,
  deltaMs
});

const envelope = {
  id: 'hit',
  attackMs: 0,
  holdMs: 1000,
  decayMs: 0,
  sustain: 1,
  releaseMs: 1000,
  cooldownMs: 0,
  retriggerMode: 'accumulate'
};

const targetIds = [
  VISUAL_TARGETS.feedbackZoom,
  VISUAL_TARGETS.blockDisplacementX,
  VISUAL_TARGETS.rgbDistance,
  VISUAL_TARGETS.grainContrast,
  VISUAL_TARGETS.colorSaturation
];

function eventMapping(index, overrides = {}) {
  return {
    id: `event-${String(index).padStart(2, '0')}`,
    kind: 'event',
    sourceId: `event.source.${index}`,
    targetId: targetIds[index],
    envelopeId: envelope.id,
    range: [0, 2],
    amount: 1,
    priority: index,
    replaceMode: 'replace',
    safetyClamp: true,
    probability: 1,
    ...overrides
  };
}

test('Step 3.4 defaults to passive budget and deterministic drop-low-priority', () => {
  assert.equal(ENERGY_BUDGET_CONFIG_DEFAULTS.enabled, false);
  assert.equal(
    ENERGY_BUDGET_CONFIG_DEFAULTS.globalEventPolicy,
    'drop-low-priority'
  );
  assert.equal(
    ENERGY_BUDGET_CONFIG_DEFAULTS.experimentalQueueEnabled,
    false
  );
});

test('five simultaneous events remain under weighted budget unless budget is raised', () => {
  const mappings = targetIds.map((_, index) => eventMapping(index));
  const sourceValues = Object.fromEntries(
    mappings.map(mapping => [mapping.sourceId, 1])
  );
  const random = createSeededPrng(3405, 12);
  const limited = new TargetMixer().mixFrame({
    mappings,
    envelopes: [envelope],
    sourceValues,
    clock: clock(),
    randomFloat: () => random.nextFloat(),
    energyBudget: {
      enabled: true,
      budget: 0.5,
      eventVoiceLimit: 8,
      weights: Object.fromEntries(targetIds.map(id => [id, 1]))
    }
  });

  assert.ok(limited.energyBudgetDecision.rawWeightedEnergy > 0.5);
  assert.ok(limited.energyBudgetDecision.attenuation < 1);
  assert.ok(limited.energyBudgetDecision.finalWeightedEnergy <= 0.5 + 1e-12);
  assert.equal(limited.eventBudgetReport.activeVoices, 5);

  const raised = new TargetMixer().mixFrame({
    mappings,
    envelopes: [envelope],
    sourceValues,
    clock: clock(),
    randomFloat: () => random.nextFloat(),
    energyBudget: {
      enabled: true,
      budget: 100,
      eventVoiceLimit: 8,
      weights: Object.fromEntries(targetIds.map(id => [id, 1]))
    }
  });
  assert.equal(raised.energyBudgetDecision.attenuation, 1);
  assert.ok(raised.energyBudgetDecision.finalWeightedEnergy > 0.5);
});

test('event voice limit retains the deterministic highest-priority voices', () => {
  const mappings = targetIds.map((_, index) => eventMapping(index));
  const processor = new EventMappingProcessor();
  const contributions = processor.evaluate(
    mappings,
    [envelope],
    Object.fromEntries(mappings.map(mapping => [mapping.sourceId, 1])),
    clock(),
    () => 0,
    {
      enabled: true,
      voiceLimit: 2,
      globalEventPolicy: 'drop-low-priority'
    }
  );

  assert.deepEqual(
    contributions.map(contribution => contribution.mappingId),
    ['event-03', 'event-04']
  );
  assert.equal(processor.getLastBudgetReport().activeVoices, 2);
  assert.equal(processor.getLastBudgetReport().evictedVoices, 3);
});

test('queue policy remains experimental and disabled unless explicitly enabled', () => {
  const mappings = [
    eventMapping(0, { priority: 10 }),
    eventMapping(1, { priority: 1 })
  ];
  const sources = Object.fromEntries(
    mappings.map(mapping => [mapping.sourceId, 1])
  );
  const disabled = new EventMappingProcessor();
  disabled.evaluate(
    mappings,
    [envelope],
    sources,
    clock(),
    () => 0,
    {
      enabled: true,
      voiceLimit: 1,
      globalEventPolicy: 'queue',
      experimentalQueueEnabled: false
    }
  );
  assert.equal(disabled.getLastBudgetReport().effectivePolicy, 'drop-low-priority');
  assert.equal(disabled.getLastBudgetReport().queuedVoices, 0);

  const enabled = new EventMappingProcessor();
  enabled.evaluate(
    mappings,
    [envelope],
    sources,
    clock(),
    () => 0,
    {
      enabled: true,
      voiceLimit: 1,
      globalEventPolicy: 'queue',
      experimentalQueueEnabled: true
    }
  );
  assert.equal(enabled.getLastBudgetReport().effectivePolicy, 'queue');
  assert.equal(enabled.getLastBudgetReport().queuedVoices, 1);
});

