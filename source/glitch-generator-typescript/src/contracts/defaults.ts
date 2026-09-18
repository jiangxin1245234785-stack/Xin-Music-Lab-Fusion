import type { EngineClockFrame } from '../clock/engine-clock.js';
import {
  CONTINUOUS_MUSIC_FEATURE_IDS,
  EVENT_MUSIC_FEATURE_IDS,
  LABEL_MUSIC_FEATURE_IDS,
  STATE_MUSIC_FEATURE_IDS,
  UNIFIED_MUSIC_FEATURE_IDS,
  UNIFIED_MUSIC_FRAME_CONTRACT,
  UNIFIED_MUSIC_FRAME_CONTRACT_VERSION
} from './registry.js';
import type {
  ContinuousMusicFeatureId,
  EventMusicFeatureId,
  LabelMusicFeatureId,
  ResolvedEvent,
  ResolvedFeatureMeta,
  ResolvedFeatureProviderDetail,
  ResolvedMusicTransportFrame,
  ResolvedUnifiedMusicFrame,
  StateMusicFeatureId,
  UnifiedMusicFeatureId
} from './types.js';

function createFrozenRecord<Key extends string, Value>(
  keys: readonly Key[],
  createValue: (key: Key) => Value
): Readonly<Record<Key, Value>> {
  return Object.freeze(
    Object.fromEntries(keys.map(key => [key, createValue(key)]))
  ) as Readonly<Record<Key, Value>>;
}

export const UNIFIED_ENGINE_CLOCK_DEFAULTS: Readonly<EngineClockFrame> =
  Object.freeze({
    frameIndex: 0,
    nowMs: 0,
    deltaMs: 0
  });

export const MUSIC_TRANSPORT_DEFAULTS:
Readonly<ResolvedMusicTransportFrame> = Object.freeze({
  mode: 'offline-test',
  state: 'stopped',
  trackId: null,
  mediaTimeMs: null,
  durationMs: null,
  epoch: 0
});

export const FEATURE_PROVIDER_DETAIL_DEFAULTS:
Readonly<ResolvedFeatureProviderDetail> = Object.freeze({
  engineId: '',
  providerVersion: ''
});

export const FEATURE_META_DEFAULTS: Readonly<ResolvedFeatureMeta> =
  Object.freeze({
    sourceProvider: 'neutral',
    providerDetail: FEATURE_PROVIDER_DETAIL_DEFAULTS,
    confidence: null,
    available: false,
    ageMs: 0,
    fallbackReason: 'NO_SOURCE'
  });

export const MUSIC_EVENT_DEFAULTS: Readonly<ResolvedEvent> =
  Object.freeze({
    eventId: '',
    strength: 0,
    engineTimeMs: 0,
    mediaTimeMs: null,
    epoch: 0
  });

export const CONTINUOUS_MUSIC_FEATURE_DEFAULTS: Readonly<
  Record<ContinuousMusicFeatureId, number>
> = createFrozenRecord(
  CONTINUOUS_MUSIC_FEATURE_IDS,
  () => 0
);

export const STATE_MUSIC_FEATURE_DEFAULTS: Readonly<
  Record<StateMusicFeatureId, number>
> = createFrozenRecord(
  STATE_MUSIC_FEATURE_IDS,
  () => 0
);

export const EVENT_MUSIC_FEATURE_DEFAULTS: Readonly<
  Record<EventMusicFeatureId, ResolvedEvent | null>
> = createFrozenRecord(
  EVENT_MUSIC_FEATURE_IDS,
  () => null
);

export const LABEL_MUSIC_FEATURE_DEFAULTS: Readonly<
  Record<LabelMusicFeatureId, string | null>
> = createFrozenRecord(
  LABEL_MUSIC_FEATURE_IDS,
  () => null
);

export const UNIFIED_MUSIC_FEATURE_META_DEFAULTS: Readonly<
  Record<UnifiedMusicFeatureId, ResolvedFeatureMeta>
> = createFrozenRecord(
  UNIFIED_MUSIC_FEATURE_IDS,
  () => Object.freeze({
    ...FEATURE_META_DEFAULTS,
    providerDetail: Object.freeze({
      ...FEATURE_PROVIDER_DETAIL_DEFAULTS
    })
  })
);

export const UNIFIED_MUSIC_FRAME_DEFAULTS:
Readonly<ResolvedUnifiedMusicFrame> = Object.freeze({
  contract: UNIFIED_MUSIC_FRAME_CONTRACT,
  contractVersion: UNIFIED_MUSIC_FRAME_CONTRACT_VERSION,
  clock: UNIFIED_ENGINE_CLOCK_DEFAULTS,
  transport: MUSIC_TRANSPORT_DEFAULTS,
  continuous: CONTINUOUS_MUSIC_FEATURE_DEFAULTS,
  states: STATE_MUSIC_FEATURE_DEFAULTS,
  events: EVENT_MUSIC_FEATURE_DEFAULTS,
  labels: LABEL_MUSIC_FEATURE_DEFAULTS,
  meta: UNIFIED_MUSIC_FEATURE_META_DEFAULTS
});
