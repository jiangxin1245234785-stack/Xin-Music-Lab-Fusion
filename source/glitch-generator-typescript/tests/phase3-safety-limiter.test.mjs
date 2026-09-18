import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ABSOLUTE_BRIGHTNESS_MAX,
  ABSOLUTE_FLASH_STRENGTH_MAX,
  MIN_FLASH_INTERVAL_MS,
  PhysicalSafetyLimiter,
  SAFETY_CONFIG_DEFAULTS,
  SOFT_BLACKOUT_ALPHA_MIN,
  SOFT_FEEDBACK_RETENTION_MAX,
  SOFT_WHITEOUT_BRIGHTNESS_MAX,
  VISUAL_TARGETS
} from '../dist/index.js';

const clock = (frameIndex, nowMs, deltaMs) => ({
  frameIndex,
  nowMs,
  deltaMs
});

test('Step 3.5 soft protections are enabled by default and report interventions', () => {
  assert.deepEqual(SAFETY_CONFIG_DEFAULTS, {
    whiteoutProtection: true,
    blackoutProtection: true,
    feedbackRunawayProtection: true
  });
  const limiter = new PhysicalSafetyLimiter();
  const result = limiter.apply({
    values: {
      [VISUAL_TARGETS.colorBrightness]: 99,
      [VISUAL_TARGETS.alpha]: 0,
      [VISUAL_TARGETS.feedbackRetention]: 1
    }
  }, clock(0, 0, 0));

  assert.equal(
    result.values[VISUAL_TARGETS.colorBrightness],
    SOFT_WHITEOUT_BRIGHTNESS_MAX
  );
  assert.equal(
    result.values[VISUAL_TARGETS.alpha],
    SOFT_BLACKOUT_ALPHA_MIN
  );
  assert.equal(
    result.values[VISUAL_TARGETS.feedbackRetention],
    SOFT_FEEDBACK_RETENTION_MAX
  );
  assert.deepEqual(limiter.getLastReport().interventions, {
    whiteout: true,
    blackout: true,
    feedbackRunaway: true,
    brightnessCapped: false,
    flashStrengthCapped: false,
    flashFrequencySuppressed: false,
    brightnessSlewLimited: false
  });
});

test('Unsafe mode cannot disable absolute brightness and flash-strength caps', () => {
  const limiter = new PhysicalSafetyLimiter({
    whiteoutProtection: false,
    blackoutProtection: false,
    feedbackRunawayProtection: false
  });
  const result = limiter.apply({
    values: {
      [VISUAL_TARGETS.colorBrightness]: 99,
      [VISUAL_TARGETS.colorFlashStrength]: 99
    }
  }, clock(0, 0, 0));

  assert.equal(limiter.getLastReport().mode, 'UNSAFE');
  assert.equal(limiter.getLastReport().physicalCapActive, true);
  assert.ok(
    result.values[VISUAL_TARGETS.colorBrightness] <=
    ABSOLUTE_BRIGHTNESS_MAX
  );
  assert.ok(
    result.values[VISUAL_TARGETS.colorFlashStrength] <=
    ABSOLUTE_FLASH_STRENGTH_MAX
  );
});

test('Unsafe mode still suppresses flash events above the physical 3 Hz limit', () => {
  const limiter = new PhysicalSafetyLimiter({
    whiteoutProtection: false,
    blackoutProtection: false,
    feedbackRunawayProtection: false
  });
  const applyFlash = (frameIndex, nowMs, strength) => limiter.apply({
    values: {
      [VISUAL_TARGETS.colorBrightness]: 0,
      [VISUAL_TARGETS.colorFlashStrength]: strength
    }
  }, clock(frameIndex, nowMs, frameIndex === 0 ? 0 : 50));

  const first = applyFlash(0, 0, ABSOLUTE_FLASH_STRENGTH_MAX);
  applyFlash(1, 50, 0);
  const tooSoon = applyFlash(2, 100, ABSOLUTE_FLASH_STRENGTH_MAX);
  applyFlash(3, 150, 0);
  const afterInterval = applyFlash(
    4,
    Math.ceil(MIN_FLASH_INTERVAL_MS) + 1,
    ABSOLUTE_FLASH_STRENGTH_MAX
  );

  assert.equal(
    first.values[VISUAL_TARGETS.colorFlashStrength],
    ABSOLUTE_FLASH_STRENGTH_MAX
  );
  assert.equal(tooSoon.values[VISUAL_TARGETS.colorFlashStrength], 0);
  assert.equal(
    afterInterval.values[VISUAL_TARGETS.colorFlashStrength],
    ABSOLUTE_FLASH_STRENGTH_MAX
  );
  assert.equal(limiter.getLastReport().physicalCapActive, true);
});

