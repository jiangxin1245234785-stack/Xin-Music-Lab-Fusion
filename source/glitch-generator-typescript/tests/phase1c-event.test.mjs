import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EventFeatureDetector,
  TargetMixer,
  VISUAL_TARGETS
} from '../dist/index.js';

const eventMapping = overrides => ({
  id: 'bass-peak-event',
  kind: 'event',
  sourceId: 'event.bassPeak',
  targetId: VISUAL_TARGETS.blockDisplacementX,
  envelopeId: 'impact',
  range: [0, 1],
  threshold: 0.1,
  priority: 80,
  enabled: true,
  ...overrides
});

const baseState = {
  values: {
    [VISUAL_TARGETS.blockDisplacementX]: 0
  }
};

const mix = (mixer, mapping, envelope, value, nowMs, frameIndex) =>
  mixer.mixFrame({
    mappings: [mapping],
    envelopes: [envelope],
    sourceValues: { 'event.bassPeak': value },
    baseState,
    clock: {
      frameIndex,
      nowMs,
      deltaMs: frameIndex === 0 ? 0 : 10
    }
  });

test('event detector emits onset and bassPeak only on meaningful rises', () => {
  const detector = new EventFeatureDetector();
  const quiet = detector.apply({ loudness: 0.02, bass: 0.01 });
  const impact = detector.apply({ loudness: 0.62, bass: 0.8 });
  const sustained = detector.apply({ loudness: 0.62, bass: 0.8 });

  assert.equal(quiet.bassPeak, 0);
  assert.ok(impact.onset > 0.9);
  assert.ok(impact.bassPeak > 0.9);
  assert.equal(sustained.onset, 0);
  assert.ok(sustained.bassPeak < 0.2);
});

test('bassPeak drives BlockDamage.DisplacementX and cooldown blocks early retrigger', () => {
  const mixer = new TargetMixer();
  const mapping = eventMapping({});
  const envelope = {
    id: 'impact',
    attackMs: 0,
    holdMs: 50,
    decayMs: 0,
    sustain: 1,
    releaseMs: 50,
    cooldownMs: 300,
    retriggerMode: 'restart'
  };

  const first = mix(mixer, mapping, envelope, 1, 0, 0);
  mix(mixer, mapping, envelope, 0, 120, 1);
  const blocked = mix(mixer, mapping, envelope, 1, 150, 2);
  mix(mixer, mapping, envelope, 0, 340, 3);
  const allowed = mix(mixer, mapping, envelope, 1, 350, 4);

  assert.equal(first.targets.values[VISUAL_TARGETS.blockDisplacementX], 1);
  assert.equal(blocked.targets.values[VISUAL_TARGETS.blockDisplacementX], 0);
  assert.equal(allowed.targets.values[VISUAL_TARGETS.blockDisplacementX], 1);
});

test('restart and ignore-until-release have distinct deterministic behavior', () => {
  const envelope = {
    id: 'impact',
    attackMs: 100,
    holdMs: 0,
    decayMs: 0,
    sustain: 1,
    releaseMs: 100,
    cooldownMs: 0
  };
  const restartMixer = new TargetMixer();
  const ignoreMixer = new TargetMixer();
  const restartMapping = eventMapping({});
  const ignoreMapping = eventMapping({});

  mix(restartMixer, restartMapping, { ...envelope, retriggerMode: 'restart' }, 1, 0, 0);
  mix(ignoreMixer, ignoreMapping, { ...envelope, retriggerMode: 'ignore-until-release' }, 1, 0, 0);
  mix(restartMixer, restartMapping, { ...envelope, retriggerMode: 'restart' }, 0, 50, 1);
  mix(ignoreMixer, ignoreMapping, { ...envelope, retriggerMode: 'ignore-until-release' }, 0, 50, 1);
  const restarted = mix(restartMixer, restartMapping, { ...envelope, retriggerMode: 'restart' }, 1, 60, 2);
  const ignored = mix(ignoreMixer, ignoreMapping, { ...envelope, retriggerMode: 'ignore-until-release' }, 1, 60, 2);

  assert.equal(restarted.targets.values[VISUAL_TARGETS.blockDisplacementX], 0);
  assert.ok(ignored.targets.values[VISUAL_TARGETS.blockDisplacementX] > 0.5);
});
