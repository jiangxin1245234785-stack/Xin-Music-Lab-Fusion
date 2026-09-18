import assert from 'node:assert/strict';
import test from 'node:test';

import {
  VisualClockRuntime,
  buildUnifiedMusicFrame,
  createGeneratorRuntime,
  getProductBuiltInPreset
} from '../dist/index.js';

function frameAt({
  frameIndex,
  nowMs,
  epoch = 0,
  state = 'playing',
  eventId = null,
  phase = 0,
  onsetAvailable = true,
  phaseAvailable = false,
  bass = 0,
  adaptiveAvailable = false
}) {
  return buildUnifiedMusicFrame({
    clock: { frameIndex, nowMs, deltaMs: frameIndex === 0 ? 0 : 16 },
    transport: {
      mode: 'offline-test',
      state,
      trackId: 'visual-clock-fixture',
      mediaTimeMs: nowMs,
      durationMs: 120000,
      epoch
    },
    continuous: { rhythmPhase: phase, bass, mid: 0, treble: 0 },
    events: {
      onset: eventId === null ? null : {
        eventId,
        strength: 0.9,
        engineTimeMs: nowMs,
        mediaTimeMs: nowMs,
        epoch
      }
    },
    meta: {
      onset: {
        available: onsetAvailable,
        confidence: onsetAvailable ? 0.92 : 0,
        sourceProvider: onsetAvailable ? 'realtime.core' : 'neutral'
      },
      rhythmPhase: {
        available: phaseAvailable,
        confidence: phaseAvailable ? 0.8 : 0,
        sourceProvider: phaseAvailable ? 'realtime.heuristic' : 'neutral'
      },
      bass: {
        available: adaptiveAvailable,
        confidence: adaptiveAvailable ? 0.7 : 0,
        sourceProvider: adaptiveAvailable ? 'realtime.core' : 'neutral'
      }
    }
  });
}

const enabled = {
  enabled: true,
  mode: 'auto',
  minimumConfidence: 0.5,
  refractoryMs: 100,
  divisions: [2, 4, 8, 16]
};

test('visual clock deduplicates onset IDs and emits exact 2/4/8/16 boundaries', () => {
  const runtime = new VisualClockRuntime();
  let report;
  for (let index = 1; index <= 16; index++) {
    report = runtime.evaluate(frameAt({
      frameIndex: index * 2 - 1,
      nowMs: index * 200,
      eventId: `onset-${index}`
    }), enabled);
    assert.equal(report.pulseIndex, index);
    assert.equal(report.values['control.pulse2'], index % 2 === 0 ? 1 : 0);
    assert.equal(report.values['control.pulse4'], index % 4 === 0 ? 1 : 0);
    assert.equal(report.values['control.pulse8'], index % 8 === 0 ? 1 : 0);
    assert.equal(report.values['control.pulse16'], index % 16 === 0 ? 1 : 0);

    const duplicate = runtime.evaluate(frameAt({
      frameIndex: index * 2,
      nowMs: index * 200 + 16,
      eventId: `onset-${index}`
    }), enabled);
    assert.equal(duplicate.pulseIndex, index);
    assert.equal(duplicate.values['control.visualPulse'], 0);
  }
  assert.equal(report.values['control.pulse16'], 1);
});

test('visual clock emits a super cycle exactly at pulse 128', () => {
  const runtime = new VisualClockRuntime();
  let report;
  for (let index = 1; index <= 128; index++) {
    report = runtime.evaluate(frameAt({
      frameIndex: index,
      nowMs: index * 120,
      eventId: `onset-${index}`
    }), enabled);
  }
  assert.equal(report.pulseIndex, 128);
  assert.equal(report.values['control.superCycle'], 1);
});

test('pause holds the count and transport epoch resets it', () => {
  const runtime = new VisualClockRuntime();
  runtime.evaluate(frameAt({ frameIndex: 1, nowMs: 100, eventId: 'one' }), enabled);
  const paused = runtime.evaluate(frameAt({
    frameIndex: 2,
    nowMs: 116,
    state: 'paused',
    eventId: 'two'
  }), enabled);
  assert.equal(paused.pulseIndex, 1);
  assert.equal(paused.basis, 'none');

  const nextEpoch = runtime.evaluate(frameAt({
    frameIndex: 0,
    nowMs: 0,
    epoch: 1,
    eventId: 'epoch-one'
  }), enabled);
  assert.equal(nextEpoch.pulseIndex, 1);
  assert.equal(nextEpoch.resetReason, 'transport-epoch');
});

test('auto mode falls back to rhythm phase wrap when onset is unavailable', () => {
  const runtime = new VisualClockRuntime();
  const before = runtime.evaluate(frameAt({
    frameIndex: 1,
    nowMs: 100,
    onsetAvailable: false,
    phaseAvailable: true,
    phase: 0.86
  }), enabled);
  const wrapped = runtime.evaluate(frameAt({
    frameIndex: 2,
    nowMs: 116,
    onsetAvailable: false,
    phaseAvailable: true,
    phase: 0.08
  }), enabled);
  assert.equal(before.pulseIndex, 0);
  assert.equal(wrapped.basis, 'rhythm-phase-wrap');
  assert.equal(wrapped.pulseIndex, 1);
});

test('adaptive fallback reports low confidence and observes refractory time', () => {
  const runtime = new VisualClockRuntime();
  const adaptive = { ...enabled, mode: 'adaptive' };
  runtime.evaluate(frameAt({
    frameIndex: 0,
    nowMs: 0,
    onsetAvailable: false,
    bass: 0.1,
    adaptiveAvailable: true
  }), adaptive);
  const first = runtime.evaluate(frameAt({
    frameIndex: 1,
    nowMs: 200,
    onsetAvailable: false,
    bass: 0.9,
    adaptiveAvailable: true
  }), adaptive);
  const tooSoon = runtime.evaluate(frameAt({
    frameIndex: 2,
    nowMs: 240,
    onsetAvailable: false,
    bass: 1,
    adaptiveAvailable: true
  }), adaptive);
  assert.equal(first.basis, 'adaptive-fallback');
  assert.equal(first.confidence, 0.35);
  assert.equal(first.pulseIndex, 1);
  assert.equal(tooSoon.pulseIndex, 1);
});

test('Quantized Memory exposes visual clock state and remains deterministic', () => {
  const preset = getProductBuiltInPreset('quantized-memory');
  const first = createGeneratorRuntime({ preset, sessionSeed: 77 });
  const second = createGeneratorRuntime({ preset, sessionSeed: 77 });

  let firstReport;
  let secondReport;
  for (let index = 1; index <= 8; index++) {
    const frame = frameAt({
      frameIndex: index,
      nowMs: index * 180,
      eventId: `runtime-${index}`
    });
    firstReport = first.evaluate(frame, frame.clock);
    secondReport = second.evaluate(frame, frame.clock);
  }

  assert.equal(firstReport.visualClock.contract, 'xin.visual-clock-frame/1');
  assert.equal(firstReport.visualClock.pulseIndex, 8);
  assert.equal(firstReport.visualClock.values['control.pulse8'], 1);
  assert.deepEqual(secondReport.targets, firstReport.targets);
  assert.deepEqual(secondReport.visualClock, firstReport.visualClock);
});

