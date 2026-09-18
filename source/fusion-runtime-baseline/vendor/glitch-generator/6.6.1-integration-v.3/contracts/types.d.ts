import type { EngineClockFrame } from '../clock/engine-clock.js';
export type MusicFeatureProvider = 'xld.manual' | 'xld.songformer' | 'xld.msaf' | 'xld.harmony' | 'realtime.core' | 'realtime.heuristic' | 'held-last' | 'neutral';
export type MusicFeatureFallbackReason = 'NO_SOURCE' | 'NO_XLD' | 'XLD_CONTRACT_UNSUPPORTED' | 'TRACK_ID_MISMATCH' | 'DURATION_MISMATCH' | 'REALTIME_STALE' | 'PROVIDER_UNAVAILABLE' | 'HELD_LAST';
export type MusicTransportMode = 'internal' | 'external' | 'offline-test';
export type MusicTransportState = 'playing' | 'paused' | 'seeking' | 'stopped';
export type ContinuousMusicFeatureId = 'loudness' | 'bass' | 'mid' | 'treble' | 'dynamicRange' | 'spectralDensity' | 'flux' | 'flatness' | 'sharpness' | 'buildEnergy' | 'sectionDrive' | 'rhythmPhase' | 'chordConfidence';
export type StateMusicFeatureId = 'silence' | 'inBuild' | 'inDrop' | 'inClimax';
export type EventMusicFeatureId = 'onset' | 'bassPeak' | 'sectionBoundary' | 'dropEnter' | 'climaxEnter' | 'chordChange';
export type LabelMusicFeatureId = 'sectionId' | 'sectionLabel' | 'chord';
export type UnifiedMusicFeatureId = ContinuousMusicFeatureId | StateMusicFeatureId | EventMusicFeatureId | LabelMusicFeatureId;
export type OptionalFeatureRecord<Key extends string, Value> = Readonly<Partial<Record<Key, Value>>>;
export interface FeatureProviderDetail {
    engineId?: string;
    providerVersion?: string;
}
export interface FeatureMeta {
    sourceProvider?: MusicFeatureProvider;
    providerDetail?: FeatureProviderDetail;
    confidence?: number | null;
    available?: boolean;
    ageMs?: number;
    fallbackReason?: MusicFeatureFallbackReason | null;
}
export interface MusicEvent {
    eventId?: string;
    strength?: number;
    engineTimeMs?: number;
    mediaTimeMs?: number | null;
    epoch?: number;
}
export interface MusicTransportFrame {
    mode?: MusicTransportMode;
    state?: MusicTransportState;
    trackId?: string | null;
    mediaTimeMs?: number | null;
    durationMs?: number | null;
    epoch?: number;
}
/**
 * Optional input shape for the XML -> Glitch Generator boundary.
 *
 * Step I-2 defines the data contract and defaults only. Runtime validation and
 * partial-input resolution are deliberately deferred to Step I-3.
 */
export interface UnifiedMusicFrame {
    contract?: 'xin.music-frame/1';
    contractVersion?: number;
    clock?: Partial<EngineClockFrame>;
    transport?: MusicTransportFrame;
    continuous?: OptionalFeatureRecord<ContinuousMusicFeatureId, number>;
    states?: OptionalFeatureRecord<StateMusicFeatureId, number>;
    events?: OptionalFeatureRecord<EventMusicFeatureId, MusicEvent | null>;
    labels?: OptionalFeatureRecord<LabelMusicFeatureId, string | null>;
    meta?: OptionalFeatureRecord<UnifiedMusicFeatureId, FeatureMeta>;
}
export type ResolvedFeatureProviderDetail = Required<FeatureProviderDetail>;
export interface ResolvedFeatureMeta extends Omit<Required<FeatureMeta>, 'providerDetail'> {
    providerDetail: ResolvedFeatureProviderDetail;
}
export type ResolvedEvent = Required<MusicEvent>;
export type ResolvedMusicTransportFrame = Required<MusicTransportFrame>;
export interface ResolvedUnifiedMusicFrame {
    readonly contract: 'xin.music-frame/1';
    readonly contractVersion: number;
    readonly clock: EngineClockFrame;
    readonly transport: ResolvedMusicTransportFrame;
    readonly continuous: Readonly<Record<ContinuousMusicFeatureId, number>>;
    readonly states: Readonly<Record<StateMusicFeatureId, number>>;
    readonly events: Readonly<Record<EventMusicFeatureId, ResolvedEvent | null>>;
    readonly labels: Readonly<Record<LabelMusicFeatureId, string | null>>;
    readonly meta: Readonly<Record<UnifiedMusicFeatureId, ResolvedFeatureMeta>>;
}
export type { EngineClockFrame } from '../clock/engine-clock.js';
//# sourceMappingURL=types.d.ts.map