import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ABSOLUTE_BRIGHTNESS_MAX,
  FixedStepEngineClock,
  TARGET_MIXER_STEPS,
  TargetMixer,
  VISUAL_TARGETS,
  createValidationBuffer,
  runOfflineDeterministicSession
} from '../dist/index.js';

const frame = (frameIndex = 0, nowMs = 0, deltaMs = 0) => ({
  frameIndex,
  nowMs,
  deltaMs
});

const mapping = overrides => ({
  id: 'bass-to-feedback-zoom',
  sourceId: 'audio.bass',
  targetId: VISUAL_TARGETS.feedbackZoom,
  enabled: true,
  amount: 1,
  range: [0.88, 1.22],
  curve: 1,
  attackMs: 0,
  fallMs: 0,
  threshold: 0,
  priority: 0,
  ...overrides
});

const baseState = {
  values: {
    [VISUAL_TARGETS.brightness]: 0.7,
    [VISUAL_TARGETS.feedbackZoom]: 1
  }
};

test('TargetMixer exposes the fixed seven-step pipeline with explicit no-op layers', () => {
  assert.deepEqual(TARGET_MIXER_STEPS, [
    'base',
    'multiply',
    'add',
    'max-min',
    'replace',
    'gate',
    'energy-budget-clamp'
  ]);

  const mixed = new TargetMixer().mixFrame({
    mappings: [mapping({ range: [1.25, 1.25] })],
    sourceValues: { 'audio.bass': 1 },
    baseState,
    clock: frame()
  });

  assert.deepEqual(mixed.trace.multiply, mixed.trace.base);
  assert.deepEqual(mixed.trace.add, mixed.trace.multiply);
  assert.deepEqual(mixed.trace.maxMin, mixed.trace.add);
  assert.equal(mixed.trace.replace.values[VISUAL_TARGETS.feedbackZoom], 1.25);
  assert.deepEqual(mixed.trace.gate, mixed.trace.replace);
  assert.deepEqual(mixed.trace.energyBudget, mixed.trace.gate);
  assert.deepEqual(mixed.targets, mixed.trace.clamp);
});

test('Replace resolution is deterministic: priority, magnitude, then stable id', () => {
  const priority = new TargetMixer().mixFrame({
    mappings: [
      mapping({ id: 'low', range: [1.8, 1.8], priority: 1 }),
      mapping({ id: 'high', range: [1.1, 1.1], priority: 2 })
    ],
    sourceValues: { 'audio.bass': 1 },
    baseState,
    clock: frame()
  });
  assert.equal(priority.targets.values[VISUAL_TARGETS.feedbackZoom], 1.1);

  const magnitude = new TargetMixer().mixFrame({
    mappings: [
      mapping({ id: 'near', range: [1.1, 1.1], priority: 2 }),
      mapping({ id: 'far', range: [1.7, 1.7], priority: 2 })
    ],
    sourceValues: { 'audio.bass': 1 },
    baseState,
    clock: frame()
  });
  assert.equal(magnitude.targets.values[VISUAL_TARGETS.feedbackZoom], 1.7);

  const stableId = new TargetMixer().mixFrame({
    mappings: [
      mapping({ id: 'zeta', range: [0, 0], priority: 2 }),
      mapping({ id: 'alpha', range: [2, 2], priority: 2 })
    ],
    sourceValues: { 'audio.bass': 1 },
    baseState,
    clock: frame()
  });
  assert.equal(stableId.targets.values[VISUAL_TARGETS.feedbackZoom], 2);
});

test('range, curve, threshold, attack and fall condition bass deterministically', () => {
  const slow = new TargetMixer();
  slow.mixFrame({
    mappings: [mapping({ attackMs: 100, fallMs: 1000 })],
    sourceValues: { 'audio.bass': 0 },
    baseState,
    clock: frame()
  });
  const rising = slow.mixFrame({
    mappings: [mapping({ attackMs: 100, fallMs: 1000 })],
    sourceValues: { 'audio.bass': 1 },
    baseState,
    clock: frame(1, 100, 100)
  });
  assert.ok(rising.targets.values[VISUAL_TARGETS.feedbackZoom] > 0.88);
  assert.ok(rising.targets.values[VISUAL_TARGETS.feedbackZoom] < 1.22);

  const falling = slow.mixFrame({
    mappings: [mapping({ attackMs: 100, fallMs: 1000 })],
    sourceValues: { 'audio.bass': 0 },
    baseState,
    clock: frame(2, 200, 100)
  });
  assert.ok(
    falling.targets.values[VISUAL_TARGETS.feedbackZoom] >
    0.88
  );

  const shaped = new TargetMixer().mixFrame({
    mappings: [mapping({
      range: [1, 2],
      curve: 2,
      threshold: 0.2
    })],
    sourceValues: { 'audio.bass': 0.6 },
    baseState,
    clock: frame()
  });
  assert.equal(shaped.targets.values[VISUAL_TARGETS.feedbackZoom], 1.25);
});

test('manual FX Rack switch bypasses the mapping through MappingCard.enabled', () => {
  const mixed = new TargetMixer().mixFrame({
    mappings: [mapping({ enabled: false, range: [1.8, 1.8] })],
    sourceValues: { 'audio.bass': 1 },
    baseState,
    clock: frame()
  });

  assert.equal(mixed.contributions.length, 0);
  assert.equal(mixed.targets.values[VISUAL_TARGETS.feedbackZoom], 1);
});

test('absolute brightness cap remains active in the final clamp stage', () => {
  const mixed = new TargetMixer().mixFrame({
    mappings: [],
    sourceValues: {},
    baseState: {
      values: {
        [VISUAL_TARGETS.brightness]: 99
      }
    },
    clock: frame()
  });

  assert.equal(
    mixed.targets.values[VISUAL_TARGETS.brightness],
    ABSOLUTE_BRIGHTNESS_MAX
  );
});

test('same offline audio, preset and seed yield identical Feedback.Zoom frames', () => {
  const preset = {
    seed: 1101,
    mappings: [mapping({
      attackMs: 100,
      fallMs: 420,
      curve: 1.4,
      threshold: 0.04,
      priority: 50
    })],
    targetDefaults: baseState
  };
  const buffer = createValidationBuffer();
  const first = runOfflineDeterministicSession({
    buffer,
    preset,
    sessionSeed: 88
  });
  const second = runOfflineDeterministicSession({
    buffer,
    preset,
    sessionSeed: 88
  });

  assert.equal(second.length, first.length);
  for (let index = 0; index < first.length; index++) {
    assert.ok(Math.abs(
      first[index].targets.values[VISUAL_TARGETS.feedbackZoom] -
      second[index].targets.values[VISUAL_TARGETS.feedbackZoom]
    ) < 1e-12);
  }
  assert.ok(new Set(
    first.map(item =>
      item.targets.values[VISUAL_TARGETS.feedbackZoom].toFixed(6)
    )
  ).size > 2);
});
