import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DebugEventLog,
  PRESET_DEFAULTS,
  TargetMixer,
  VISUAL_TARGETS,
  createValidationBuffer,
  explainMappingContribution,
  measureGlobalEnergyDebug,
  runOfflineDeterministicSession
} from '../dist/index.js';

const buffer = createValidationBuffer();
const timeline = runOfflineDeterministicSession({
  buffer,
  preset: PRESET_DEFAULTS,
  sessionSeed: 224
});

test('Event Log records onset and bassPeak on the unified offline engine clock', () => {
  const first = new DebugEventLog(64);
  const second = new DebugEventLog(64);
  for (const frame of timeline) {
    first.recordFrame(frame.features);
    second.recordFrame(frame.features);
  }

  const left = first.list();
  const right = second.list();
  assert.deepEqual(right, left);
  assert.ok(left.length > 0);
  assert.ok(left.some(entry => entry.type === 'onset'));
  assert.ok(left.some(entry => entry.type === 'bassPeak'));
  for (const entry of left) {
    assert.ok(timeline.some(
      frame => frame.clock.nowMs === entry.engineTimeMs
    ));
    assert.ok(entry.strength > 0);
  }
});

test('Event Log is bounded and clear resets deterministic sequence numbers', () => {
  const log = new DebugEventLog(2);
  log.recordFrame({
    engineTimeMs: timeline[1].clock.nowMs,
    onset: 0.4,
    bassPeak: 0.5
  });
  log.recordFrame({
    engineTimeMs: timeline[2].clock.nowMs,
    onset: 0,
    bassPeak: 0
  });
  log.recordFrame({
    engineTimeMs: timeline[3].clock.nowMs,
    onset: 0.6
  });

  assert.equal(log.list().length, 2);
  assert.deepEqual(log.list().map(entry => entry.sequence), [2, 3]);
  log.clear();
  log.recordFrame({
    engineTimeMs: timeline[4].clock.nowMs,
    bassPeak: 0.7
  });
  assert.equal(log.list()[0].sequence, 1);
});

test('Mapping breakdown explains contributing, threshold and bypass states', () => {
  const mapping = {
    id: 'debug-card',
    sourceId: 'audio.bass',
    targetId: VISUAL_TARGETS.feedbackZoom,
    range: [1, 1.5],
    threshold: 0.5,
    attackMs: 0,
    fallMs: 0
  };
  const active = new TargetMixer().mixFrame({
    mappings: [mapping],
    sourceValues: { 'audio.bass': 1 },
    baseState: {
      values: { [VISUAL_TARGETS.feedbackZoom]: 1 }
    },
    clock: timeline[4].clock
  });
  const activeBreakdown = explainMappingContribution({
    mapping,
    contribution: active.contributions[0],
    sourceValue: 1,
    baseTargetValue: 1,
    finalTargetValue: active.targets.values[VISUAL_TARGETS.feedbackZoom]
  });
  assert.equal(activeBreakdown.mappingReason, 'CONTRIBUTING');
  assert.equal(activeBreakdown.targetReason, 'SELECTED_MAPPING');

  const quiet = new TargetMixer().mixFrame({
    mappings: [mapping],
    sourceValues: { 'audio.bass': 0.2 },
    baseState: {
      values: { [VISUAL_TARGETS.feedbackZoom]: 1 }
    },
    clock: timeline[5].clock
  });
  const quietBreakdown = explainMappingContribution({
    mapping,
    contribution: quiet.contributions[0],
    sourceValue: 0.2,
    baseTargetValue: 1,
    finalTargetValue: quiet.targets.values[VISUAL_TARGETS.feedbackZoom]
  });
  assert.equal(quietBreakdown.mappingReason, 'BELOW_THRESHOLD');
  assert.equal(quietBreakdown.targetReason, 'TARGET_AT_BASE');

  const bypassed = explainMappingContribution({
    mapping: { ...mapping, enabled: false },
    sourceValue: 1,
    baseTargetValue: 1,
    finalTargetValue: 1,
    rackEnabled: true
  });
  assert.equal(bypassed.mappingReason, 'MAPPING_BYPASSED');
});

test('Mapping breakdown distinguishes movement caused outside the selected card', () => {
  const selected = {
    id: 'selected',
    sourceId: 'audio.bass',
    targetId: VISUAL_TARGETS.feedbackZoom,
    enabled: false
  };
  const breakdown = explainMappingContribution({
    mapping: selected,
    sourceValue: 0,
    baseTargetValue: 1,
    finalTargetValue: 1.4,
    rackEnabled: true
  });

  assert.equal(breakdown.mappingReason, 'MAPPING_BYPASSED');
  assert.equal(
    breakdown.targetReason,
    'OTHER_MAPPING_OR_POST_PROCESS'
  );

  const selectedActive = {
    ...selected,
    enabled: true,
    range: [1.2, 1.2],
    priority: 1
  };
  const winner = {
    ...selectedActive,
    id: 'winner',
    range: [1.6, 1.6],
    priority: 2
  };
  const mixed = new TargetMixer().mixFrame({
    mappings: [selectedActive, winner],
    sourceValues: { 'audio.bass': 1 },
    baseState: {
      values: { [VISUAL_TARGETS.feedbackZoom]: 1 }
    },
    clock: timeline[6].clock
  });
  const selectedLost = explainMappingContribution({
    mapping: selectedActive,
    contribution: mixed.contributions.find(
      contribution => contribution.mappingId === 'selected'
    ),
    sourceValue: 1,
    baseTargetValue: 1,
    finalTargetValue: mixed.targets.values[VISUAL_TARGETS.feedbackZoom]
  });
  assert.equal(selectedLost.mappingReason, 'CONTRIBUTING');
  assert.equal(
    selectedLost.targetReason,
    'OTHER_MAPPING_OR_POST_PROCESS'
  );
});

test('Global Energy Budget debug meter aggregates without modifying targets', () => {
  const state = {
    values: {
      [VISUAL_TARGETS.feedbackZoom]: 1.5,
      [VISUAL_TARGETS.blockDisplacementX]: 0.75,
      [VISUAL_TARGETS.colorFlashStrength]: 2
    }
  };
  const before = structuredClone(state);
  const first = measureGlobalEnergyDebug(state);
  const second = measureGlobalEnergyDebug(state);

  assert.deepEqual(second, first);
  assert.deepEqual(state, before);
  assert.ok(first.aggregate > 1);
  assert.equal(first.normalized, 1);
  assert.equal(first.activeTargets, 3);
  assert.equal(first.totalTargets > first.activeTargets, true);
  assert.equal(first.peakTargetId, VISUAL_TARGETS.colorFlashStrength);
  assert.equal(state.values[VISUAL_TARGETS.colorFlashStrength], 2);
});
