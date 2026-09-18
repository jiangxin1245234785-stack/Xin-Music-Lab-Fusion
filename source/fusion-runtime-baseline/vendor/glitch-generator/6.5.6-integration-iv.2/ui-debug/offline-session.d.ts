import { type EngineClockFrame } from '../clock/index.js';
import { type PcmAudioBuffer } from '../audio/index.js';
import type { Preset, ResolvedAudioFeatureFrame, ResolvedVisualTargetState } from '../schema/types.js';
export interface OfflineSessionFrame {
    readonly clock: EngineClockFrame;
    readonly features: ResolvedAudioFeatureFrame;
    readonly targets: ResolvedVisualTargetState;
    readonly randomSample: number;
}
export interface OfflineSessionOptions {
    readonly buffer: PcmAudioBuffer;
    readonly preset: Preset;
    readonly sessionSeed?: number;
    readonly frameSize?: number;
}
export declare function runOfflineDeterministicSession(options: OfflineSessionOptions): readonly OfflineSessionFrame[];
//# sourceMappingURL=offline-session.d.ts.map