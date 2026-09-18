import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  DebugEventLog,
  StructuralSignalDetector,
  TargetMixer,
  VISUAL_TARGETS,
  analyzeOfflineBuffer,
  coreFeatureSourceValues,
  createAudioFeatureFrame,
  createStructuralSignalValidationBuffer,
  explainMappingContribution
} from '../dist/index.js';

const buffer = createStructuralSignalValidationBuffer();
const frames = analyzeOfflineBuffer(buffer);

test('dropEnter fires once while In Drop persists across the held section', () => {
  const enters = frames.filter(frame => frame.dropEnter > 0);
  const dropFrames = frames.filter(frame => frame.inDrop > 0.5);

  assert.equal(enters.length, 1);
  assert.ok(dropFrames.length > 20);
  assert.equal(enters[0].inDrop, 1);
  assert.ok(dropFrames.some(frame =>
    frame.engineTimeMs > enters[0].engineTimeMs + 1_000 &&
    frame.dropEnter === 0
  ));
});

test('climax enter is instantaneous and persistent climax state is separate', () => {
  const enters = frames.filter(frame => frame.climaxEnter > 0);
  const climaxFrames = frames.filter(frame => frame.inClimax > 0.5);

  assert.equal(enters.length, 1);
  assert.ok(climaxFrames.length > 20);
  assert.ok(climaxFrames.some(frame =>
    frame.engineTimeMs > enters[0].engineTimeMs + 500 &&
    frame.climaxEnter === 0
  ));
});

test('structure outputs expose confidence and progressive availability', () => {
  assert.equal(frames[0].sectionBoundaryAvailable, false);
  assert.equal(frames[0].dropAvailable, false);
  assert.ok(frames.at(-1).sectionBoundaryAvailable);
  assert.ok(frames.at(-1).buildAvailable);
  assert.ok(frames.at(-1).dropAvailable);
  assert.ok(frames.at(-1).climaxAvailable);
  assert.ok(frames.some(frame => frame.sectionBoundary > 0));

  for (const frame of frames) {
    for (const key of [
      'sectionBoundaryConfidence',
      'buildConfidence',
      'dropConfidence',
      'climaxConfidence'
    ]) {
      assert.ok(frame[key] >= 0 && frame[key] <= 1);
    }
  }
});

test('sensitivity materially changes heuristic detection', () => {
  const conservative = analyzeOfflineBuffer(buffer, 2048, {
    sensitivity: 0.5,
    holdDurationMs: 1_000
  });
  const sensitive = analyzeOfflineBuffer(buffer, 2048, {
    sensitivity: 2,
    holdDurationMs: 1_000
  });
  const eventCount = timeline => timeline.filter(frame =>
    frame.sectionBoundary > 0 ||
    frame.dropEnter > 0 ||
    frame.climaxEnter > 0
  ).length;

  assert.ok(eventCount(sensitive) > eventCount(conservative));
});

test('hold duration changes persistent state length without repeating enter', () => {
  const short = analyzeOfflineBuffer(buffer, 2048, {
    holdDurationMs: 1_000
  });
  const long = analyzeOfflineBuffer(buffer, 2048, {
    holdDurationMs: 3_000
  });
  const activeFrames = timeline =>
    timeline.filter(frame => frame.inDrop > 0.5).length;

  assert.ok(activeFrames(long) > activeFrames(short));
  assert.equal(short.filter(frame => frame.dropEnter > 0).length, 1);
  assert.equal(long.filter(frame => frame.dropEnter > 0).length, 1);
});

test('manual override and unavailable fallback are explicit', () => {
  const forced = new StructuralSignalDetector({
    manualOverride: 'drop'
  });
  const first = forced.apply(createAudioFeatureFrame({
    available: false
  }), { frameIndex: 0, nowMs: 0, deltaMs: 0 });
  const second = forced.apply(createAudioFeatureFrame({
    available: false
  }), { frameIndex: 1, nowMs: 50, deltaMs: 50 });
  const automatic = new StructuralSignalDetector({
    fallbackMode: 'zero'
  }).apply(createAudioFeatureFrame({
    available: false
  }), { frameIndex: 0, nowMs: 0, deltaMs: 0 });

  assert.equal(first.inDrop, 1);
  assert.equal(first.dropEnter, 1);
  assert.equal(second.inDrop, 1);
  assert.equal(second.dropEnter, 0);
  assert.equal(first.structureManualOverrideActive, true);
  assert.equal(automatic.inDrop, 0);
  assert.equal(automatic.structureFallbackActive, true);
});

test('state sources are exposed independently from enter events', () => {
  const dropFrame = frames.find(frame => frame.dropEnter > 0);
  const laterDropFrame = frames.find(frame =>
    frame.inDrop > 0.5 &&
    frame.dropEnter === 0 &&
    frame.engineTimeMs > dropFrame.engineTimeMs
  );
  const enterSources = coreFeatureSourceValues(dropFrame);
  const heldSources = coreFeatureSourceValues(laterDropFrame);

  assert.ok(enterSources['event.dropEnter'] > 0);
  assert.equal(enterSources['state.inDrop'], 1);
  assert.equal(heldSources['event.dropEnter'], 0);
  assert.equal(heldSources['state.inDrop'], 1);
});

test('Gate layer suppresses and restores a mapping from persistent state data', () => {
  const mapping = {
    id: 'gated-zoom',
    sourceId: 'audio.loudness',
    targetId: VISUAL_TARGETS.feedbackZoom,
    range: [1, 1.5],
    attackMs: 0,
    fallMs: 0,
    gateSourceId: 'state.inDrop',
    gateThreshold: 0.5
  };
  const mixer = new TargetMixer();
  const closed = mixer.mixFrame({
    mappings: [mapping],
    sourceValues: {
      'audio.loudness': 1,
      'state.inDrop': 0
    },
    baseState: {
      values: { [VISUAL_TARGETS.feedbackZoom]: 1 }
    },
    clock: { frameIndex: 0, nowMs: 0, deltaMs: 0 }
  });
  const open = mixer.mixFrame({
    mappings: [mapping],
    sourceValues: {
      'audio.loudness': 1,
      'state.inDrop': 1
    },
    baseState: {
      values: { [VISUAL_TARGETS.feedbackZoom]: 1 }
    },
    clock: { frameIndex: 1, nowMs: 16, deltaMs: 16 }
  });

  assert.equal(closed.trace.replace.values[VISUAL_TARGETS.feedbackZoom], 1.5);
  assert.equal(closed.trace.gate.values[VISUAL_TARGETS.feedbackZoom], 1);
  assert.equal(closed.gateDecisions[0].open, false);
  assert.equal(open.trace.gate.values[VISUAL_TARGETS.feedbackZoom], 1.5);
  assert.equal(open.gateDecisions[0].open, true);

  const explanation = explainMappingContribution({
    mapping,
    contribution: closed.contributions[0],
    gateDecision: closed.gateDecisions[0],
    sourceValue: 1,
    baseTargetValue: 1,
    finalTargetValue: 1
  });
  assert.equal(explanation.mappingReason, 'GATE_CLOSED');
});

test('Debug event log records structural events on engine timestamps', () => {
  const log = new DebugEventLog(128);
  for (const frame of frames) log.recordFrame(frame);
  const types = new Set(log.list().map(entry => entry.type));

  assert.ok(types.has('sectionBoundary'));
  assert.ok(types.has('dropEnter'));
  assert.ok(types.has('climaxEnter'));
});

test('Phase 3.2 UI exposes controls, state debug and Gate routing', () => {
  const html = fs.readFileSync(
    new URL('../demo/index.html', import.meta.url),
    'utf8'
  );
  const source = fs.readFileSync(
    new URL('../src/ui-debug/phase1-demo.ts', import.meta.url),
    'utf8'
  );

  for (const id of [
    'structureSensitivity',
    'structureHoldDuration',
    'structureFallback',
    'structureManualOverride',
    'structureDropState',
    'structureDropEnter',
    'structureClimaxState',
    'structureClimaxEnter',
    'mappingGateSource',
    'mappingGateThreshold'
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /value="event\.dropEnter"/);
  assert.match(html, /value="state\.inDrop"/);
  assert.match(html, /6 · GATE <i>STATE SOURCE<\/i>/);
  assert.match(source, /new StructuralSignalDetector\(\)/);
  assert.match(source, /gateSourceId: 'state\.inClimax'/);
});
