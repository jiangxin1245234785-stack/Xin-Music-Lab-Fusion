import type {
  ContinuousMusicFeatureId,
  EventMusicFeatureId,
  LabelMusicFeatureId,
  MusicFeatureFallbackReason,
  MusicFeatureProvider,
  StateMusicFeatureId,
  UnifiedMusicFeatureId
} from './types.js';

export const UNIFIED_MUSIC_FRAME_CONTRACT =
  'xin.music-frame/1' as const;

export const UNIFIED_MUSIC_FRAME_CONTRACT_VERSION = 1 as const;

export const MUSIC_FEATURE_PROVIDERS = Object.freeze([
  'xld.manual',
  'xld.songformer',
  'xld.msaf',
  'xld.harmony',
  'realtime.core',
  'realtime.heuristic',
  'held-last',
  'neutral'
] satisfies readonly MusicFeatureProvider[]);

export const MUSIC_FEATURE_FALLBACK_REASONS = Object.freeze([
  'NO_SOURCE',
  'NO_XLD',
  'XLD_CONTRACT_UNSUPPORTED',
  'TRACK_ID_MISMATCH',
  'DURATION_MISMATCH',
  'REALTIME_STALE',
  'PROVIDER_UNAVAILABLE',
  'HELD_LAST'
] satisfies readonly MusicFeatureFallbackReason[]);

export const CONTINUOUS_MUSIC_FEATURE_IDS = Object.freeze([
  'loudness',
  'bass',
  'mid',
  'treble',
  'dynamicRange',
  'spectralDensity',
  'flux',
  'flatness',
  'sharpness',
  'buildEnergy',
  'sectionDrive',
  'rhythmPhase',
  'chordConfidence'
] satisfies readonly ContinuousMusicFeatureId[]);

export const STATE_MUSIC_FEATURE_IDS = Object.freeze([
  'silence',
  'inBuild',
  'inDrop',
  'inClimax'
] satisfies readonly StateMusicFeatureId[]);

export const EVENT_MUSIC_FEATURE_IDS = Object.freeze([
  'onset',
  'bassPeak',
  'sectionBoundary',
  'dropEnter',
  'climaxEnter',
  'chordChange'
] satisfies readonly EventMusicFeatureId[]);

export const LABEL_MUSIC_FEATURE_IDS = Object.freeze([
  'sectionId',
  'sectionLabel',
  'chord'
] satisfies readonly LabelMusicFeatureId[]);

export const UNIFIED_MUSIC_FEATURE_IDS: readonly UnifiedMusicFeatureId[] =
  Object.freeze([
    ...CONTINUOUS_MUSIC_FEATURE_IDS,
    ...STATE_MUSIC_FEATURE_IDS,
    ...EVENT_MUSIC_FEATURE_IDS,
    ...LABEL_MUSIC_FEATURE_IDS
  ]);
