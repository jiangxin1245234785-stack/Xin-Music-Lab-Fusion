import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TargetMixer,
  VISUAL_TARGET_REGISTRY,
  createDefaultVisualValues
} from '../dist/index.js';

const sources = [
  'audio.loudness',
  'audio.bass',
  'audio.mid',
  'audio.treble'
];

test('target registry contains the documented six visual modules', () => {
  const modules = new Map();
  for (const target of VISUAL_TARGET_REGISTRY) {
    modules.set(target.module, (modules.get(target.module) ?? 0) + 1);
  }
  assert.deepEqual(Object.fromEntries(modules), {
    Feedback: 4,
    'Block Damage': 4,
    'RGB Split': 3,
    'Scanline/Grain': 3,
    'Signal Loss': 3,
    Color: 4
  });
});

test('each core continuous source can drive every registered visual target', () => {
  const baseState = { values: createDefaultVisualValues() };

  for (const sourceId of sources) {
    for (const target of VISUAL_TARGET_REGISTRY) {
      const expected = target.min + (target.max - target.min) * 0.73;
      const mixed = new TargetMixer().mixFrame({
        mappings: [{
          id: `${sourceId}-to-${target.id}`,
          sourceId,
          targetId: target.id,
          range: [target.defaultValue, expected],
          curve: 1,
          attackMs: 0,
          fallMs: 0,
          threshold: 0,
          enabled: true
        }],
        sourceValues: { [sourceId]: 1 },
        baseState,
        clock: { frameIndex: 0, nowMs: 0, deltaMs: 0 }
      });
      assert.ok(
        Math.abs(mixed.targets.values[target.id] - expected) < 1e-12,
        `${sourceId} failed to drive ${target.id}`
      );
    }
  }
});
