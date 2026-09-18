import type { EngineClockFrame } from '../clock/engine-clock.js';
import type { ResolvedSafetyConfig, ResolvedVisualTargetState, SafetyConfig, VisualTargetState } from '../schema/types.js';
import { type VisualTargetDefinition } from './visual-targets.js';
export declare const ABSOLUTE_BRIGHTNESS_MAX = 1;
export declare const MAX_BRIGHTNESS_DELTA_PER_SECOND = 2.4;
export declare const MIN_FLASH_INTERVAL_MS: number;
export declare const FLASH_RISE_THRESHOLD = 0.18;
export declare const ABSOLUTE_FLASH_STRENGTH_MAX = 0.35;
export declare const SOFT_WHITEOUT_BRIGHTNESS_MAX = 0.92;
export declare const SOFT_WHITE_TEAR_BRIGHTNESS_MAX = 0.65;
export declare const SOFT_FLASH_STRENGTH_MAX = 0.25;
export declare const SOFT_BLACKOUT_BRIGHTNESS_MIN = 0.06;
export declare const SOFT_BLACKOUT_ALPHA_MIN = 0.08;
export declare const SOFT_FEEDBACK_RETENTION_MAX = 0.985;
export declare const SOFT_FEEDBACK_DECAY_MAX = 0.99;
export declare const SOFT_FEEDBACK_ZOOM_MIN = 0.7;
export declare const SOFT_FEEDBACK_ZOOM_MAX = 1.35;
export interface SafetyInterventions {
    readonly whiteout: boolean;
    readonly blackout: boolean;
    readonly feedbackRunaway: boolean;
    readonly brightnessCapped: boolean;
    readonly flashStrengthCapped: boolean;
    readonly flashFrequencySuppressed: boolean;
    readonly brightnessSlewLimited: boolean;
}
export interface SafetyStatus {
    readonly mode: 'SAFE' | 'UNSAFE';
    readonly physicalCapActive: true;
    readonly config: ResolvedSafetyConfig;
    readonly interventions: SafetyInterventions;
}
export declare function applyAbsolutePhysicalCaps(input: VisualTargetState, targetDefinitions?: readonly VisualTargetDefinition[]): ResolvedVisualTargetState;
export declare class PhysicalSafetyLimiter {
    private previousBrightness;
    private previousRequestedFlashStrength;
    private lastFlashAt;
    private flashBlockedUntilRelease;
    private initialized;
    private config;
    private report;
    constructor(config?: SafetyConfig);
    configure(config?: SafetyConfig): ResolvedSafetyConfig;
    getLastReport(): SafetyStatus;
    reset(initialBrightness?: number): void;
    apply(input: VisualTargetState, clock: EngineClockFrame, targetDefinitions?: readonly VisualTargetDefinition[]): ResolvedVisualTargetState;
    private isUnsafe;
}
//# sourceMappingURL=physical-safety.d.ts.map