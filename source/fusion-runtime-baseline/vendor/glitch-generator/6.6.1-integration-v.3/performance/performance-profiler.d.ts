import type { EngineClockFrame } from '../clock/index.js';
export declare const PERFORMANCE_STAGE_IDS: readonly ["feature-extraction", "conditioning", "nodes", "mixer", "render-setup", "render:builtin-feedback", "render:custom-glsl", "render:display"];
export type PerformanceStageId = typeof PERFORMANCE_STAGE_IDS[number];
export type PerformanceNowProvider = () => number;
export interface PerformanceMeasureSink {
    measure<T>(stageId: PerformanceStageId, operation: () => T): T;
}
export interface PerformanceStageSample {
    readonly stageId: PerformanceStageId;
    readonly durationMs: number;
}
export interface PerformanceFrameProfile {
    readonly frameIndex: number;
    readonly engineTimeMs: number;
    readonly frameTimeMs: number;
    readonly thresholdMs: number;
    readonly overBudget: boolean;
    readonly dominantStage: PerformanceStageId | null;
    readonly dominantStageMs: number;
    readonly stages: readonly PerformanceStageSample[];
}
export interface PerformanceStageSummary {
    readonly stageId: PerformanceStageId;
    readonly averageMs: number;
    readonly peakMs: number;
    readonly lastMs: number;
    readonly averageShare: number;
    readonly sampleCount: number;
}
export interface PerformanceProfilerSnapshot {
    readonly enabled: boolean;
    readonly thresholdMs: number;
    readonly windowSize: number;
    readonly frameCount: number;
    readonly averageFrameMs: number;
    readonly peakFrameMs: number;
    readonly overBudgetFrames: number;
    readonly overBudgetRatio: number;
    readonly bottleneckStage: PerformanceStageId | null;
    readonly bottleneckAverageMs: number;
    readonly stages: readonly PerformanceStageSummary[];
    readonly latestFrame: PerformanceFrameProfile | null;
}
export interface PerformanceProfilerOptions {
    readonly enabled?: boolean;
    readonly thresholdMs?: number;
    readonly windowSize?: number;
    readonly now?: PerformanceNowProvider;
}
export declare class PerformanceProfiler implements PerformanceMeasureSink {
    private readonly frames;
    private readonly currentDurations;
    private currentClock;
    private frameStartedAt;
    private enabledValue;
    private thresholdValue;
    readonly windowSize: number;
    private readonly now;
    constructor(options?: PerformanceProfilerOptions);
    get enabled(): boolean;
    get thresholdMs(): number;
    setEnabled(enabled: boolean): void;
    setThresholdMs(thresholdMs: number): void;
    beginFrame(clock: EngineClockFrame): void;
    measure<T>(stageId: PerformanceStageId, operation: () => T): T;
    endFrame(): PerformanceFrameProfile | null;
    snapshot(): PerformanceProfilerSnapshot;
    reset(): void;
    private readNow;
}
export declare function measurePerformanceStage<T>(sink: PerformanceMeasureSink | undefined, stageId: PerformanceStageId, operation: () => T): T;
//# sourceMappingURL=performance-profiler.d.ts.map