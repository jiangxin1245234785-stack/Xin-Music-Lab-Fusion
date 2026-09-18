import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ABSOLUTE_BRIGHTNESS_MAX,
  FixedStepEngineClock,
  PhysicalSafetyLimiter,
  VISUAL_TARGETS,
  coreFeatureSourceValues,
  createAudioFeatureFrame,
  createValidationBuffer,
  evaluateMappingCards,
  runOfflineDeterministicSession
} from '../dist/index.js';

const preset = amount => ({
  seed: 904,
  mappings: [{
    id: 'loudness-to-brightness',
    sourceId: 'audio.loudness',
    targetId: VISUAL_TARGETS.brightness,
    amount,
    enabled: true
  }],
  targetDefaults: {
    values: {
      [VISUAL_TARGETS.brightness]: 0,
      [VISUAL_TARGETS.scale]: 1,
      [VISUAL_TARGETS.alpha]: 1
    }
  }
});

test('MappingCard data, not renderer code, selects source, target and amount', () => {
  const features = createAudioFeatureFrame({
    available: true,
    loudness: 0.8,
    bass: 0.25
  });
  const sources = coreFeatureSourceValues(features);
  const brightness = evaluateMappingCards([{
    sourceId: 'audio.loudness',
    targetId: VISUAL_TARGETS.brightness,
    amount: 0.5
  }], sources);
  const scale = evaluateMappingCards([{
    sourceId: 'audio.bass',
    targetId: VISUAL_TARGETS.scale,
    amount: 2
  }], sources);

  assert.equal(brightness.values[VISUAL_TARGETS.brightness], 0.4);
  assert.equal(scale.values[VISUAL_TARGETS.scale], 0.5);
});

test('same offline buffer, preset and seed produce identical per-frame targets', () => {
  const buffer = createValidationBuffer();
  const first = runOfflineDeterministicSession({
    buffer,
    preset: preset(1),
    sessionSeed: 77
  });
  const second = runOfflineDeterministicSession({
    buffer,
    preset: preset(1),
    sessionSeed: 77
  });

  assert.equal(second.length, first.length);
  for (let index = 0; index < first.length; index++) {
    const left = first[index];
    const right = second[index];
    assert.ok(Math.abs(
      left.targets.values[VISUAL_TARGETS.brightness] -
      right.targets.values[VISUAL_TARGETS.brightness]
    ) < 1e-12);
    assert.equal(right.clock.nowMs, left.clock.nowMs);
    assert.equal(right.randomSample, left.randomSample);
  }
});

test('editing mapping amount changes the resulting visual target', () => {
  const buffer = createValidationBuffer();
  const subtle = runOfflineDeterministicSession({
    buffer,
    preset: preset(0.25),
    sessionSeed: 4
  });
  const strong = runOfflineDeterministicSession({
    buffer,
    preset: preset(1),
    sessionSeed: 4
  });
  const average = frames => frames.reduce(
    (sum, frame) => sum + frame.targets.values[VISUAL_TARGETS.brightness],
    0
  ) / frames.length;

  assert.ok(average(strong) > average(subtle) * 1.4);
});

test('physical safety cap and brightness slew limit cannot be bypassed', () => {
  const limiter = new PhysicalSafetyLimiter({
    whiteoutProtection: false,
    blackoutProtection: false,
    feedbackRunawayProtection: false
  });
  const clock = new FixedStepEngineClock(1000 / 60);
  const first = limiter.apply({
    values: { [VISUAL_TARGETS.brightness]: 10 }
  }, clock.tick());
  const second = limiter.apply({
    values: { [VISUAL_TARGETS.brightness]: 0 }
  }, clock.tick());

  assert.equal(first.values[VISUAL_TARGETS.brightness], ABSOLUTE_BRIGHTNESS_MAX);
  assert.ok(first.values[VISUAL_TARGETS.brightness] <= ABSOLUTE_BRIGHTNESS_MAX);
  assert.ok(
    Math.abs(
      second.values[VISUAL_TARGETS.brightness] -
      first.values[VISUAL_TARGETS.brightness]
    ) <= 0.040000000001
  );
});
