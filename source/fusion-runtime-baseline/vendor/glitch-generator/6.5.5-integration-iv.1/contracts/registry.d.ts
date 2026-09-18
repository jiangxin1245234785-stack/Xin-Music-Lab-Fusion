import type { UnifiedMusicFeatureId } from './types.js';
export declare const UNIFIED_MUSIC_FRAME_CONTRACT: "xin.music-frame/1";
export declare const UNIFIED_MUSIC_FRAME_CONTRACT_VERSION: 1;
export declare const MUSIC_FEATURE_PROVIDERS: readonly ("xld.manual" | "xld.songformer" | "xld.msaf" | "xld.harmony" | "realtime.core" | "realtime.heuristic" | "held-last" | "neutral")[];
export declare const MUSIC_FEATURE_FALLBACK_REASONS: readonly ("NO_SOURCE" | "NO_XLD" | "XLD_CONTRACT_UNSUPPORTED" | "TRACK_ID_MISMATCH" | "DURATION_MISMATCH" | "REALTIME_STALE" | "PROVIDER_UNAVAILABLE" | "HELD_LAST")[];
export declare const CONTINUOUS_MUSIC_FEATURE_IDS: readonly ("loudness" | "bass" | "mid" | "treble" | "dynamicRange" | "spectralDensity" | "flux" | "flatness" | "sharpness" | "buildEnergy" | "sectionDrive" | "rhythmPhase" | "chordConfidence")[];
export declare const STATE_MUSIC_FEATURE_IDS: readonly ("silence" | "inBuild" | "inDrop" | "inClimax")[];
export declare const EVENT_MUSIC_FEATURE_IDS: readonly ("onset" | "bassPeak" | "sectionBoundary" | "dropEnter" | "climaxEnter" | "chordChange")[];
export declare const LABEL_MUSIC_FEATURE_IDS: readonly ("sectionId" | "sectionLabel" | "chord")[];
export declare const UNIFIED_MUSIC_FEATURE_IDS: readonly UnifiedMusicFeatureId[];
//# sourceMappingURL=registry.d.ts.map