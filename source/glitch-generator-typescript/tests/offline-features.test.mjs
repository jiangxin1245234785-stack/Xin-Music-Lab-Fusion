import assert from 'node:assert/strict';
import test from 'node:test';

import {
  OfflineDeterministicPlayback,
  analyzeOfflineBuffer,
  createSineBuffer,
  createValidationBuffer
} from '../dist/index.js';

const dominantFrame = frequencyHz => {
  const frames = analyzeOfflineBuffer(createSineBuffer({
    frequencyHz,
    amplitude: 0.75,
    durationSeconds: 0.25
  }));
  return frames[Math.floor(frames.length / 2)];
};

test('known sine signals dominate their expected frequency bands', () => {
  const bass = dominantFrame(80);
  const mid = dominantFrame(1000);
  const treble = dominantFrame(8000);

  assert.ok(bass.bass > bass.mid * 4);
  assert.ok(bass.bass > bass.treble * 4);
  assert.ok(mid.mid > mid.bass * 4);
  assert.ok(mid.mid > mid.treble * 4);
  assert.ok(treble.treble > treble.bass * 4);
  assert.ok(treble.treble > treble.mid * 4);
});

test('loudness follows source amplitude', () => {
  const quiet = analyzeOfflineBuffer(createSineBuffer({
    frequencyHz: 1000,
    amplitude: 0.2,
    durationSeconds: 0.25
  }))[2];
  const loud = analyzeOfflineBuffer(createSineBuffer({
    frequencyHz: 1000,
    amplitude: 0.8,
    durationSeconds: 0.25
  }))[2];

  assert.ok(loud.loudness > quiet.loudness * 3.5);
});

test('offline fixed-buffer playback is deterministic after reset', () => {
  const playback = new OfflineDeterministicPlayback(createValidationBuffer(), 2048);
  const first = [playback.nextFrame(), playback.nextFrame()].map(frame => [...frame.samples]);
  playback.reset();
  const second = [playback.nextFrame(), playback.nextFrame()].map(frame => [...frame.samples]);

  assert.deepEqual(second, first);
});

test('two offline analyses produce identical feature frames', () => {
  const buffer = createValidationBuffer();
  const first = analyzeOfflineBuffer(buffer);
  const second = analyzeOfflineBuffer(buffer);
  assert.deepEqual(second, first);
});

