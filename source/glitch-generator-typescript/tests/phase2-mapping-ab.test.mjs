import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PRESET_DEFAULTS,
  UndoHistory,
  VISUAL_TARGETS,
  applyMappingMacros,
  createMappingCard,
  createValidationBuffer,
  runOfflineDeterministicSession,
  setMappingABVariant,
  setMappingABVariantById,
  updateMappingABParameters
} from '../dist/index.js';

const mapping = createMappingCard({
  id: 'ab-card',
  sourceId: 'audio.loudness',
  targetId: VISUAL_TARGETS.feedbackZoom,
  amount: 0.25,
  range: [0.9, 1.04],
  curve: 1,
  attackMs: 0,
  fallMs: 0
});

const timeline = runOfflineDeterministicSession({
  buffer: createValidationBuffer(),
  preset: PRESET_DEFAULTS,
  sessionSeed: 223
});

test('one MappingCard holds two independent parameter sets and switches instantly', () => {
  const withB = updateMappingABParameters(mapping, {
    amount: 1.4,
    range: [0.72, 1.32],
    curve: 2.4,
    attackMs: 180,
    fallMs: 540,
    threshold: 0.35,
    priority: 7
  }, 'B');

  assert.equal(withB.ab.active, 'A');
  assert.equal(withB.amount, 0.25);
  assert.equal(withB.ab.a.amount, 0.25);
  assert.equal(withB.ab.b.amount, 1.4);

  const activeB = setMappingABVariant(withB, 'B');
  assert.equal(activeB.ab.active, 'B');
  assert.equal(activeB.amount, 1.4);
  assert.deepEqual(activeB.range, [0.72, 1.32]);
  assert.equal(activeB.curve, 2.4);
  assert.equal(activeB.threshold, 0.35);
  assert.equal(activeB.priority, 7);

  const activeAAgain = setMappingABVariant(activeB, 'A');
  assert.equal(activeAAgain.amount, 0.25);
  assert.deepEqual(activeAAgain.range, [0.9, 1.04]);
  assert.deepEqual(activeAAgain.ab.b, activeB.ab.b);
});

test('switching one MappingCard leaves every other card unchanged', () => {
  const second = createMappingCard({
    id: 'other-card',
    sourceId: 'audio.mid',
    targetId: VISUAL_TARGETS.rgbDistance,
    amount: 0.75
  });
  const configured = updateMappingABParameters(mapping, {
    amount: 1.6
  }, 'B');
  const switched = setMappingABVariantById(
    [configured, second],
    'ab-card',
    'B'
  );

  assert.equal(switched[0].ab.active, 'B');
  assert.equal(switched[0].amount, 1.6);
  assert.deepEqual(switched[1], second);
});

test('mapping macros transform only the active A/B parameter set at runtime', () => {
  const configured = updateMappingABParameters(mapping, {
    amount: 1.2,
    attackMs: 200,
    fallMs: 600
  }, 'B');
  const activeB = setMappingABVariant(configured, 'B');
  const runtime = applyMappingMacros([activeB], {
    intensity: 1.5,
    response: 2
  })[0];

  assert.ok(Math.abs(runtime.amount - 1.8) < 1e-12);
  assert.equal(runtime.attackMs, 100);
  assert.equal(runtime.fallMs, 300);
  assert.equal(runtime.ab.a.amount, 0.25);
  assert.equal(activeB.ab.b.amount, 1.2);
});

test('A and B produce deterministic but observably different offline output', () => {
  const configured = updateMappingABParameters(mapping, {
    amount: 1.8,
    range: [0.6, 1.45],
    curve: 0.65,
    attackMs: 0,
    fallMs: 0
  }, 'B');
  const presetA = {
    ...PRESET_DEFAULTS,
    mappings: [setMappingABVariant(configured, 'A')],
    targetDefaults: {
      values: {
        [VISUAL_TARGETS.feedbackZoom]: 1
      }
    }
  };
  const presetB = {
    ...presetA,
    mappings: [setMappingABVariant(configured, 'B')]
  };
  const buffer = createValidationBuffer();
  const a = runOfflineDeterministicSession({
    buffer,
    preset: presetA,
    sessionSeed: 223
  });
  const bFirst = runOfflineDeterministicSession({
    buffer,
    preset: presetB,
    sessionSeed: 223
  });
  const bSecond = runOfflineDeterministicSession({
    buffer,
    preset: presetB,
    sessionSeed: 223
  });
  const average = frames => frames.reduce(
    (sum, frame) =>
      sum + frame.targets.values[VISUAL_TARGETS.feedbackZoom],
    0
  ) / frames.length;

  assert.notEqual(average(a), average(bFirst));
  assert.deepEqual(
    bSecond.map(frame => frame.targets.values[VISUAL_TARGETS.feedbackZoom]),
    bFirst.map(frame => frame.targets.values[VISUAL_TARGETS.feedbackZoom])
  );
});

test('an A/B toggle is one discrete undoable transaction on the engine clock', () => {
  const configured = updateMappingABParameters(mapping, {
    amount: 1.3
  }, 'B');
  const before = [setMappingABVariant(configured, 'A')];
  const after = setMappingABVariantById(before, 'ab-card', 'B');
  const history = new UndoHistory({
    clone: state => structuredClone(state)
  });
  const transaction = history.recordDiscrete(
    'Switch mapping to B',
    before,
    after,
    timeline[4].clock.nowMs
  );

  assert.equal(transaction.kind, 'discrete');
  assert.equal(transaction.engineTimeMs, timeline[4].clock.nowMs);
  assert.equal(history.undo().state[0].ab.active, 'A');
  assert.equal(history.redo().state[0].ab.active, 'B');
});
