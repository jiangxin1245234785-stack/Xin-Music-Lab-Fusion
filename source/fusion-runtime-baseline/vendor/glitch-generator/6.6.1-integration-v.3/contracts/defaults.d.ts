import type { EngineClockFrame } from '../clock/engine-clock.js';
import type { ContinuousMusicFeatureId, EventMusicFeatureId, LabelMusicFeatureId, ResolvedEvent, ResolvedFeatureMeta, ResolvedFeatureProviderDetail, ResolvedMusicTransportFrame, ResolvedUnifiedMusicFrame, StateMusicFeatureId, UnifiedMusicFeatureId } from './types.js';
export declare const UNIFIED_ENGINE_CLOCK_DEFAULTS: Readonly<EngineClockFrame>;
export declare const MUSIC_TRANSPORT_DEFAULTS: Readonly<ResolvedMusicTransportFrame>;
export declare const FEATURE_PROVIDER_DETAIL_DEFAULTS: Readonly<ResolvedFeatureProviderDetail>;
export declare const FEATURE_META_DEFAULTS: Readonly<ResolvedFeatureMeta>;
export declare const MUSIC_EVENT_DEFAULTS: Readonly<ResolvedEvent>;
export declare const CONTINUOUS_MUSIC_FEATURE_DEFAULTS: Readonly<Record<ContinuousMusicFeatureId, number>>;
export declare const STATE_MUSIC_FEATURE_DEFAULTS: Readonly<Record<StateMusicFeatureId, number>>;
export declare const EVENT_MUSIC_FEATURE_DEFAULTS: Readonly<Record<EventMusicFeatureId, ResolvedEvent | null>>;
export declare const LABEL_MUSIC_FEATURE_DEFAULTS: Readonly<Record<LabelMusicFeatureId, string | null>>;
export declare const UNIFIED_MUSIC_FEATURE_META_DEFAULTS: Readonly<Record<UnifiedMusicFeatureId, ResolvedFeatureMeta>>;
export declare const UNIFIED_MUSIC_FRAME_DEFAULTS: Readonly<ResolvedUnifiedMusicFrame>;
//# sourceMappingURL=defaults.d.ts.map