import assert from 'node:assert/strict';
import test from 'node:test';

import {
  VISUAL_TARGETS,
  createGeneratorRuntime,
  describeGeneratorTargetIntent
} from '../dist/index.js';

test('III-4 describes final Generator targets as semantic intent without audio inputs', () => {
  const intent = describeGeneratorTargetIntent({
    id: 'intent-fixture',
    enabled: true,
    values: {
      [VISUAL_TARGETS.colorBrightness]: 0.98,
      [VISUAL_TARGETS.feedbackZoom]: 1.65,
      [VISUAL_TARGETS.blockDisplacementX]: 0.85,
      [VISUAL_TARGETS.grainDensity]: 0.78,
      [VISUAL_TARGETS.colorSaturation]: 1.75
    }
  });

  assert.equal(intent.contract, 'xin.generator-target-intent/1');
  assert.equal(intent.dimensions.luminance.level, 'PRESENT');
  assert.equal(intent.dimensions.motion.level, 'PRESENT');
  assert.equal(intent.dimensions.rupture.level, 'PRESENT');
  assert.equal(intent.dimensions.texture.level, 'INTENSE');
  assert.equal(intent.dimensions.color.level, 'PRESENT');
  assert.equal('audio' in intent, false);
});

test('III-4 fixed frame sequence keeps final target intents byte-stable', () => {
  const preset = {
    seed: 4004,
    mappings: [{
      id: 'bass-to-rupture',
      sourceId: 'audio.bass',
      targetId: VISUAL_TARGETS.blockDisplacementX,
      range: [0, 0.85],
      attackMs: 0,
      fallMs: 0
    }],
    targetDefaults: {
      values: { [VISUAL_TARGETS.blockDisplacementX]: 0 }
    }
  };
  const input = {
    clock: { frameIndex: 4, nowMs: 64, deltaMs: 16 },
    transport: { epoch: 0 },
    continuous: { bass: 0.8 },
    meta: {
      bass: {
        sourceProvider: 'realtime.core',
        providerDetail: { engineId: 'fixture', providerVersion: '1' },
        confidence: 1,
        available: true,
        ageMs: 0,
        fallbackReason: null
      }
    }
  };
  const clock = input.clock;
  const firstRuntime = createGeneratorRuntime({ preset, sessionSeed: 71 });
  const secondRuntime = createGeneratorRuntime({ preset, sessionSeed: 71 });
  const first = firstRuntime.evaluate(input, clock);
  const second = secondRuntime.evaluate(input, clock);

  assert.deepEqual(second.targets, first.targets);
  assert.deepEqual(second.visualIntent, first.visualIntent);
});
