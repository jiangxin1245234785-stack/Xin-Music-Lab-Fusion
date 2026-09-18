import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONTINUOUS_MUSIC_FEATURE_DEFAULTS,
  CONTINUOUS_MUSIC_FEATURE_IDS,
  CURRENT_SCHEMA_VERSION,
  EVENT_MUSIC_FEATURE_DEFAULTS,
  EVENT_MUSIC_FEATURE_IDS,
  FEATURE_META_DEFAULTS,
  LABEL_MUSIC_FEATURE_DEFAULTS,
  LABEL_MUSIC_FEATURE_IDS,
  MUSIC_FEATURE_FALLBACK_REASONS,
  MUSIC_FEATURE_PROVIDERS,
  STATE_MUSIC_FEATURE_DEFAULTS,
  STATE_MUSIC_FEATURE_IDS,
  UNIFIED_MUSIC_FEATURE_IDS,
  UNIFIED_MUSIC_FEATURE_META_DEFAULTS,
  UNIFIED_MUSIC_FRAME_CONTRACT,
  UNIFIED_MUSIC_FRAME_CONTRACT_VERSION,
  UNIFIED_MUSIC_FRAME_DEFAULTS,
  FixedStepEngineClock
} from '../dist/index.js';

test('I-2 exposes one stable v1 music-frame contract registry', () => {
  assert.equal(UNIFIED_MUSIC_FRAME_CONTRACT, 'xin.music-frame/1');
  assert.equal(UNIFIED_MUSIC_FRAME_CONTRACT_VERSION, 1);
  assert.deepEqual(MUSIC_FEATURE_PROVIDERS, [
    'xld.manual',
    'xld.songformer',
    'xld.msaf',
    'xld.harmony',
    'realtime.core',
    'realtime.heuristic',
    'held-last',
    'neutral'
  ]);
  assert.deepEqual(MUSIC_FEATURE_FALLBACK_REASONS, [
    'NO_SOURCE',
    'NO_XLD',
    'XLD_CONTRACT_UNSUPPORTED',
    'TRACK_ID_MISMATCH',
    'DURATION_MISMATCH',
    'REALTIME_STALE',
    'PROVIDER_UNAVAILABLE',
    'HELD_LAST'
  ]);
  assert.equal(
    new Set(UNIFIED_MUSIC_FEATURE_IDS).size,
    UNIFIED_MUSIC_FEATURE_IDS.length
  );
});

test('I-2 defaults cover every registered feature with neutral provenance', () => {
  assert.deepEqual(
    Object.keys(CONTINUOUS_MUSIC_FEATURE_DEFAULTS),
    CONTINUOUS_MUSIC_FEATURE_IDS
  );
  assert.deepEqual(
    Object.keys(STATE_MUSIC_FEATURE_DEFAULTS),
    STATE_MUSIC_FEATURE_IDS
  );
  assert.deepEqual(
    Object.keys(EVENT_MUSIC_FEATURE_DEFAULTS),
    EVENT_MUSIC_FEATURE_IDS
  );
  assert.deepEqual(
    Object.keys(LABEL_MUSIC_FEATURE_DEFAULTS),
    LABEL_MUSIC_FEATURE_IDS
  );
  assert.deepEqual(
    Object.keys(UNIFIED_MUSIC_FEATURE_META_DEFAULTS),
    UNIFIED_MUSIC_FEATURE_IDS
  );

  for (const featureId of UNIFIED_MUSIC_FEATURE_IDS) {
    assert.deepEqual(
      UNIFIED_MUSIC_FEATURE_META_DEFAULTS[featureId],
      FEATURE_META_DEFAULTS
    );
  }
  for (const eventId of EVENT_MUSIC_FEATURE_IDS) {
    assert.equal(EVENT_MUSIC_FEATURE_DEFAULTS[eventId], null);
  }
  for (const labelId of LABEL_MUSIC_FEATURE_IDS) {
    assert.equal(LABEL_MUSIC_FEATURE_DEFAULTS[labelId], null);
  }
});

test('I-2 reuses EngineClockFrame while preset schema remains independently versioned', () => {
  const clock = new FixedStepEngineClock(25);
  assert.deepEqual(UNIFIED_MUSIC_FRAME_DEFAULTS.clock, clock.tick());
  assert.deepEqual(UNIFIED_MUSIC_FRAME_DEFAULTS.transport, {
    mode: 'offline-test',
    state: 'stopped',
    trackId: null,
    mediaTimeMs: null,
    durationMs: null,
    epoch: 0
  });
  assert.equal(UNIFIED_MUSIC_FRAME_DEFAULTS.contractVersion, 1);
  assert.equal(CURRENT_SCHEMA_VERSION, 16);
});
