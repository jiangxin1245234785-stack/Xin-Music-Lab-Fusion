import {
  CONTINUOUS_MUSIC_FEATURE_IDS,
  EVENT_MUSIC_FEATURE_IDS,
  LABEL_MUSIC_FEATURE_IDS,
  STATE_MUSIC_FEATURE_IDS,
  type ContinuousMusicFeatureId,
  type EventMusicFeatureId,
  type ResolvedFeatureMeta,
  type ResolvedUnifiedMusicFrame,
  type StateMusicFeatureId
} from '../contracts/index.js';
import type { MappingSourceValues } from '../mapping/index.js';
import {
  adaptChordLabelToHue,
  HARMONY_ADAPTER_VERSION
} from './harmony-adapter.js';

export const RUNTIME_SOURCE_CONTRACT =
  'xin.glitch-source-frame/1' as const;
export const SOURCE_REGISTRY_VERSION =
  '3.3.0-shadow' as const;

export type RuntimeSourceGroup =
  | 'continuous'
  | 'state'
  | 'event'
  | 'confidence'
  | 'harmony';
export type RuntimeSourceAdapter =
  | 'identity'
  | 'meta-confidence'
  | 'harmony-chord-hue';
export type RuntimeSourceId =
  | `audio.${ContinuousMusicFeatureId}`
  | `state.${StateMusicFeatureId}`
  | `event.${EventMusicFeatureId}`
  | 'confidence.sectionBoundary'
  | 'confidence.chord'
  | 'confidence.climax'
  | 'harmony.chordHue';

export interface RuntimeSourceDefinition {
  readonly sourceId: RuntimeSourceId;
  readonly featureId:
    | ContinuousMusicFeatureId
    | StateMusicFeatureId
    | EventMusicFeatureId
    | 'chord';
  readonly group: RuntimeSourceGroup;
  readonly adapter: RuntimeSourceAdapter;
}

export interface RuntimeSourceMeta {
  readonly sourceId: RuntimeSourceId;
  readonly featureId: RuntimeSourceDefinition['featureId'];
  readonly group: RuntimeSourceGroup;
  readonly adapter: RuntimeSourceAdapter;
  readonly available: boolean;
  readonly active: boolean;
  readonly sourceProvider: ResolvedFeatureMeta['sourceProvider'];
  readonly providerDetail: ResolvedFeatureMeta['providerDetail'];
  readonly confidence: number | null;
  readonly ageMs: number;
  readonly fallbackReason: ResolvedFeatureMeta['fallbackReason'];
}

export interface RuntimeSourceFrame {
  readonly contract: typeof RUNTIME_SOURCE_CONTRACT;
  readonly registryVersion: typeof SOURCE_REGISTRY_VERSION;
  readonly values: MappingSourceValues;
  readonly meta: Readonly<Record<RuntimeSourceId, RuntimeSourceMeta>>;
  readonly sourceCount: number;
  readonly availableSourceCount: number;
  readonly activeEventCount: number;
  readonly excludedLabels: typeof LABEL_MUSIC_FEATURE_IDS;
}

const definitions = Object.freeze([
  ...CONTINUOUS_MUSIC_FEATURE_IDS.map(featureId => Object.freeze({
    sourceId: `audio.${featureId}` as RuntimeSourceId,
    featureId,
    group: 'continuous' as const,
    adapter: 'identity' as const
  })),
  ...STATE_MUSIC_FEATURE_IDS.map(featureId => Object.freeze({
    sourceId: `state.${featureId}` as RuntimeSourceId,
    featureId,
    group: 'state' as const,
    adapter: 'identity' as const
  })),
  ...EVENT_MUSIC_FEATURE_IDS.map(featureId => Object.freeze({
    sourceId: `event.${featureId}` as RuntimeSourceId,
    featureId,
    group: 'event' as const,
    adapter: 'identity' as const
  })),
  Object.freeze({
    sourceId: 'confidence.sectionBoundary' as const,
    featureId: 'sectionBoundary' as const,
    group: 'confidence' as const,
    adapter: 'meta-confidence' as const
  }),
  Object.freeze({
    sourceId: 'confidence.chord' as const,
    featureId: 'chord' as const,
    group: 'confidence' as const,
    adapter: 'meta-confidence' as const
  }),
  Object.freeze({
    sourceId: 'confidence.climax' as const,
    featureId: 'inClimax' as const,
    group: 'confidence' as const,
    adapter: 'meta-confidence' as const
  }),
  Object.freeze({
    sourceId: 'harmony.chordHue' as const,
    featureId: 'chord' as const,
    group: 'harmony' as const,
    adapter: 'harmony-chord-hue' as const
  })
]);

export const RUNTIME_SOURCE_REGISTRY:
readonly RuntimeSourceDefinition[] = definitions;
export const RUNTIME_SOURCE_IDS:
readonly RuntimeSourceId[] = Object.freeze(
  definitions.map(definition => definition.sourceId)
);

function identityValueFor(
  frame: ResolvedUnifiedMusicFrame,
  definition: RuntimeSourceDefinition
): { readonly value: number; readonly active: boolean } {
  if (definition.group === 'continuous') {
    return {
      value: frame.continuous[
        definition.featureId as ContinuousMusicFeatureId
      ],
      active: false
    };
  }
  if (definition.group === 'state') {
    return {
      value: frame.states[
        definition.featureId as StateMusicFeatureId
      ],
      active: false
    };
  }
  const event = frame.events[
    definition.featureId as EventMusicFeatureId
  ];
  return {
    value: event?.strength ?? 0,
    active: event !== null
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function outputFor(
  frame: ResolvedUnifiedMusicFrame,
  definition: RuntimeSourceDefinition
): {
  readonly value: number;
  readonly active: boolean;
  readonly available: boolean;
  readonly fallbackReason: RuntimeSourceMeta['fallbackReason'];
  readonly providerDetail: RuntimeSourceMeta['providerDetail'];
} {
  const featureMeta = frame.meta[definition.featureId];
  if (definition.adapter === 'identity') {
    const identity = identityValueFor(frame, definition);
    return {
      value: identity.value,
      active: identity.active && featureMeta.available,
      available: featureMeta.available,
      fallbackReason: featureMeta.fallbackReason,
      providerDetail: featureMeta.providerDetail
    };
  }
  if (definition.adapter === 'meta-confidence') {
    const confidence = featureMeta.confidence;
    const available = featureMeta.available && Number.isFinite(confidence);
    return {
      value: available ? clamp01(confidence ?? 0) : 0,
      active: false,
      available,
      fallbackReason: available ? null : featureMeta.fallbackReason ?? 'NO_SOURCE',
      providerDetail: featureMeta.providerDetail
    };
  }
  const harmony = adaptChordLabelToHue(frame.labels.chord);
  const available = featureMeta.available && harmony.recognized;
  return {
    value: available ? harmony.hue : 0,
    active: false,
    available,
    fallbackReason: available ? null : featureMeta.fallbackReason ?? 'NO_SOURCE',
    providerDetail: Object.freeze({
      engineId: `harmony-adapter:${HARMONY_ADAPTER_VERSION}`,
      providerVersion: featureMeta.providerDetail.providerVersion
    })
  };
}

export function adaptUnifiedMusicFrameToSources(
  frame: ResolvedUnifiedMusicFrame
): RuntimeSourceFrame {
  const values: Record<string, number> = {};
  const meta = {} as Record<RuntimeSourceId, RuntimeSourceMeta>;
  let availableSourceCount = 0;
  let activeEventCount = 0;

  for (const definition of RUNTIME_SOURCE_REGISTRY) {
    const featureMeta = frame.meta[definition.featureId];
    const resolved = outputFor(frame, definition);
    values[definition.sourceId] = resolved.available ? resolved.value : 0;
    if (resolved.available) availableSourceCount++;
    if (resolved.active) activeEventCount++;
    meta[definition.sourceId] = Object.freeze({
      sourceId: definition.sourceId,
      featureId: definition.featureId,
      group: definition.group,
      adapter: definition.adapter,
      available: resolved.available,
      active: resolved.active,
      sourceProvider: featureMeta.sourceProvider,
      providerDetail: Object.freeze({ ...resolved.providerDetail }),
      confidence: featureMeta.confidence,
      ageMs: featureMeta.ageMs,
      fallbackReason: resolved.fallbackReason
    });
  }

  return Object.freeze({
    contract: RUNTIME_SOURCE_CONTRACT,
    registryVersion: SOURCE_REGISTRY_VERSION,
    values: Object.freeze(values),
    meta: Object.freeze(meta),
    sourceCount: RUNTIME_SOURCE_IDS.length,
    availableSourceCount,
    activeEventCount,
    excludedLabels: LABEL_MUSIC_FEATURE_IDS
  });
}
