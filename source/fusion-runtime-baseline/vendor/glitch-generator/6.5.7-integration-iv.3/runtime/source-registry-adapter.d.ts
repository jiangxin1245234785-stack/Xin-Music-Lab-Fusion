import { LABEL_MUSIC_FEATURE_IDS, type ContinuousMusicFeatureId, type EventMusicFeatureId, type ResolvedFeatureMeta, type ResolvedUnifiedMusicFrame, type StateMusicFeatureId } from '../contracts/index.js';
import type { MappingSourceValues } from '../mapping/index.js';
export declare const RUNTIME_SOURCE_CONTRACT: "xin.glitch-source-frame/1";
export declare const SOURCE_REGISTRY_VERSION: "3.3.0-shadow";
export type RuntimeSourceGroup = 'continuous' | 'state' | 'event' | 'confidence' | 'harmony';
export type RuntimeSourceAdapter = 'identity' | 'meta-confidence' | 'harmony-chord-hue';
export type RuntimeSourceId = `audio.${ContinuousMusicFeatureId}` | `state.${StateMusicFeatureId}` | `event.${EventMusicFeatureId}` | 'confidence.sectionBoundary' | 'confidence.chord' | 'confidence.climax' | 'harmony.chordHue';
export interface RuntimeSourceDefinition {
    readonly sourceId: RuntimeSourceId;
    readonly featureId: ContinuousMusicFeatureId | StateMusicFeatureId | EventMusicFeatureId | 'chord';
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
export declare const RUNTIME_SOURCE_REGISTRY: readonly RuntimeSourceDefinition[];
export declare const RUNTIME_SOURCE_IDS: readonly RuntimeSourceId[];
export declare function adaptUnifiedMusicFrameToSources(frame: ResolvedUnifiedMusicFrame): RuntimeSourceFrame;
//# sourceMappingURL=source-registry-adapter.d.ts.map