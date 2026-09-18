import type { LearnFeatureSample } from './feature-history.js';
export interface LearnTargetBounds {
    readonly min: number;
    readonly max: number;
    readonly defaultValue: number;
}
export interface LearnV0Options {
    readonly sourceId: string;
    readonly samples: readonly LearnFeatureSample[];
    readonly target?: LearnTargetBounds;
    readonly rangeAnchor?: number;
    readonly rangeDirection?: -1 | 1;
    readonly minDurationMs?: number;
    readonly minSamples?: number;
    readonly silenceFloor?: number;
    readonly minimumDynamics?: number;
}
export type LearnV0FailureCode = 'SOURCE_UNAVAILABLE' | 'TOO_SHORT' | 'SILENT' | 'LOW_DYNAMICS';
export interface LearnV0Metrics {
    readonly low: number;
    readonly median: number;
    readonly high: number;
    readonly peak: number;
    readonly dynamics: number;
    readonly meanAbsoluteDelta: number;
    readonly sourceCoverage: number;
}
export interface LearnV0Suggestion {
    readonly threshold: number;
    readonly range: readonly [number, number];
    readonly attackMs: number;
    readonly fallMs: number;
}
export interface LearnV0Success {
    readonly ok: true;
    readonly sourceId: string;
    readonly confidence: number;
    readonly sampleCount: number;
    readonly durationMs: number;
    readonly metrics: LearnV0Metrics;
    readonly suggestion: LearnV0Suggestion;
}
export interface LearnV0Failure {
    readonly ok: false;
    readonly sourceId: string;
    readonly code: LearnV0FailureCode;
    readonly message: string;
    readonly confidence: 0;
    readonly sampleCount: number;
    readonly durationMs: number;
}
export type LearnV0Result = LearnV0Success | LearnV0Failure;
export declare function learnV0(options: LearnV0Options): LearnV0Result;
//# sourceMappingURL=learn-v0.d.ts.map