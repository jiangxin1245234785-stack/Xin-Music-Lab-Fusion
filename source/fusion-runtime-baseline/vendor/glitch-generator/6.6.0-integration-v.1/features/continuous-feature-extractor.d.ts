import type { PcmFrame } from '../audio/types.js';
import type { EngineClockFrame } from '../clock/engine-clock.js';
import type { ResolvedAudioFeatureFrame } from '../schema/types.js';
export interface ContinuousFeatureExtractorOptions {
    readonly dynamicRangeWindowMs?: number;
    readonly buildSensitivity?: number;
    readonly buildWindowMs?: number;
    readonly rhythmSensitivity?: number;
}
export declare class ContinuousFeatureExtractor {
    private readonly dynamicRangeWindowMs;
    private readonly buildSensitivity;
    private readonly buildWindowMs;
    private readonly rhythmSensitivity;
    private readonly loudnessHistory;
    private previousSpectrum;
    private previousEngineTimeMs;
    private previousSectionDrive;
    private fastDrive;
    private slowDrive;
    private sectionDrive;
    private buildEnergy;
    private fluxBaseline;
    private lastBeatAtMs;
    private beatPeriodMs;
    constructor(options?: ContinuousFeatureExtractorOptions);
    reset(): void;
    extract(pcm: PcmFrame, clock: EngineClockFrame): ResolvedAudioFeatureFrame;
}
//# sourceMappingURL=continuous-feature-extractor.d.ts.map