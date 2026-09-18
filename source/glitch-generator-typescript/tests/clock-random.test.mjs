import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FixedStepEngineClock,
  RealtimeEngineClock,
  combineSeeds,
  createSeededPrng
} from '../dist/index.js';

test('fixed engine clock advances with one deterministic time base', () => {
  const clock = new FixedStepEngineClock(20);
  assert.deepEqual(clock.tick(), { frameIndex: 0, nowMs: 0, deltaMs: 0 });
  assert.deepEqual(clock.tick(), { frameIndex: 1, nowMs: 20, deltaMs: 20 });
  assert.deepEqual(clock.tick(), { frameIndex: 2, nowMs: 40, deltaMs: 20 });
  clock.reset();
  assert.deepEqual(clock.tick(), { frameIndex: 0, nowMs: 0, deltaMs: 0 });
});

test('realtime engine clock consumes only its injected provider', () => {
  const values = [100, 100, 116, 149];
  const clock = new RealtimeEngineClock(() => values.shift());
  assert.deepEqual(clock.tick(), { frameIndex: 0, nowMs: 0, deltaMs: 0 });
  assert.deepEqual(clock.tick(), { frameIndex: 1, nowMs: 16, deltaMs: 16 });
  assert.deepEqual(clock.tick(), { frameIndex: 2, nowMs: 49, deltaMs: 33 });
});

test('seeded PRNG is repeatable and session seed changes the stream', () => {
  const first = createSeededPrng(42, 7);
  const second = createSeededPrng(42, 7);
  const different = createSeededPrng(42, 8);
  const firstSequence = Array.from({ length: 8 }, () => first.nextFloat());
  const secondSequence = Array.from({ length: 8 }, () => second.nextFloat());
  const differentSequence = Array.from({ length: 8 }, () => different.nextFloat());

  assert.deepEqual(secondSequence, firstSequence);
  assert.notDeepEqual(differentSequence, firstSequence);
  assert.equal(combineSeeds(42, 7), combineSeeds(42, 7));
});

