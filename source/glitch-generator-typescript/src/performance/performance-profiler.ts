import type { EngineClockFrame } from '../clock/index.js';

export const PERFORMANCE_STAGE_IDS = Object.freeze([
  'feature-extraction',
  'conditioning',
  'nodes',
  'mixer',
  'render-setup',
  'render:builtin-feedback',
  'render:custom-glsl',
  'render:display'
] as const);

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

function finiteDuration(value: number): number {
  return Math.max(0, Number.isFinite(value) ? value : 0);
}

function validateThreshold(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid profiler threshold: ${String(value)}`);
  }
  return value;
}

function validateWindowSize(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid profiler window size: ${String(value)}`);
  }
  return value;
}

function defaultNow(): number {
  return globalThis.performance.now();
}

export class PerformanceProfiler implements PerformanceMeasureSink {
  private readonly frames: PerformanceFrameProfile[] = [];
  private readonly currentDurations = new Map<PerformanceStageId, number>();
  private currentClock: EngineClockFrame | null = null;
  private frameStartedAt = 0;
  private enabledValue: boolean;
  private thresholdValue: number;
  readonly windowSize: number;
  private readonly now: PerformanceNowProvider;

  constructor(options: PerformanceProfilerOptions = {}) {
    this.enabledValue = options.enabled ?? true;
    this.thresholdValue = validateThreshold(options.thresholdMs ?? 1000 / 60);
    this.windowSize = validateWindowSize(options.windowSize ?? 120);
    this.now = options.now ?? defaultNow;
  }

  get enabled(): boolean {
    return this.enabledValue;
  }

  get thresholdMs(): number {
    return this.thresholdValue;
  }

  setEnabled(enabled: boolean): void {
    this.enabledValue = enabled;
    if (!enabled) this.currentClock = null;
  }

  setThresholdMs(thresholdMs: number): void {
    this.thresholdValue = validateThreshold(thresholdMs);
  }

  beginFrame(clock: EngineClockFrame): void {
    if (!this.enabledValue) return;
    this.currentClock = Object.freeze({ ...clock });
    this.currentDurations.clear();
    this.frameStartedAt = this.readNow();
  }

  measure<T>(stageId: PerformanceStageId, operation: () => T): T {
    if (!this.enabledValue || this.currentClock === null) return operation();
    const startedAt = this.readNow();
    try {
      return operation();
    } finally {
      const durationMs = finiteDuration(this.readNow() - startedAt);
      this.currentDurations.set(
        stageId,
        (this.currentDurations.get(stageId) ?? 0) + durationMs
      );
    }
  }

  endFrame(): PerformanceFrameProfile | null {
    if (!this.enabledValue || this.currentClock === null) return null;
    const frameTimeMs = finiteDuration(this.readNow() - this.frameStartedAt);
    const stages = PERFORMANCE_STAGE_IDS
      .map(stageId => Object.freeze({
        stageId,
        durationMs: finiteDuration(this.currentDurations.get(stageId) ?? 0)
      }));
    const dominant = stages.reduce<PerformanceStageSample | null>(
      (winner, sample) =>
        winner === null || sample.durationMs > winner.durationMs
          ? sample
          : winner,
      null
    );
    const profile = Object.freeze({
      frameIndex: this.currentClock.frameIndex,
      engineTimeMs: this.currentClock.nowMs,
      frameTimeMs,
      thresholdMs: this.thresholdValue,
      overBudget: frameTimeMs > this.thresholdValue,
      dominantStage:
        dominant && dominant.durationMs > 0 ? dominant.stageId : null,
      dominantStageMs: dominant?.durationMs ?? 0,
      stages: Object.freeze(stages)
    });
    this.frames.push(profile);
    if (this.frames.length > this.windowSize) {
      this.frames.splice(0, this.frames.length - this.windowSize);
    }
    this.currentClock = null;
    return profile;
  }

  snapshot(): PerformanceProfilerSnapshot {
    const frameCount = this.frames.length;
    const averageFrameMs = frameCount === 0
      ? 0
      : this.frames.reduce((sum, frame) => sum + frame.frameTimeMs, 0) /
        frameCount;
    const peakFrameMs = this.frames.reduce(
      (peak, frame) => Math.max(peak, frame.frameTimeMs),
      0
    );
    const overBudgetFrames = this.frames.filter(
      frame => frame.overBudget
    ).length;
    const stages = PERFORMANCE_STAGE_IDS.map(stageId => {
      const samples = this.frames.map(
        frame => frame.stages.find(sample => sample.stageId === stageId)
          ?.durationMs ?? 0
      );
      const averageMs = frameCount === 0
        ? 0
        : samples.reduce((sum, value) => sum + value, 0) / frameCount;
      return Object.freeze({
        stageId,
        averageMs,
        peakMs: samples.reduce((peak, value) => Math.max(peak, value), 0),
        lastMs: samples.at(-1) ?? 0,
        averageShare: averageFrameMs > 0
          ? Math.min(1, averageMs / averageFrameMs)
          : 0,
        sampleCount: frameCount
      });
    });
    const overBudgetProfiles = this.frames.filter(frame => frame.overBudget);
    const bottleneckAverages = PERFORMANCE_STAGE_IDS.map(stageId => ({
      stageId,
      averageMs: overBudgetProfiles.length === 0
        ? 0
        : overBudgetProfiles.reduce(
            (sum, frame) =>
              sum + (
                frame.stages.find(sample => sample.stageId === stageId)
                  ?.durationMs ?? 0
              ),
            0
          ) / overBudgetProfiles.length
    }));
    const dominant = bottleneckAverages.reduce<{
      readonly stageId: PerformanceStageId;
      readonly averageMs: number;
    } | null>(
      (winner, stage) =>
        winner === null || stage.averageMs > winner.averageMs
          ? stage
          : winner,
      null
    );
    const latestFrame = this.frames.at(-1) ?? null;
    return Object.freeze({
      enabled: this.enabledValue,
      thresholdMs: this.thresholdValue,
      windowSize: this.windowSize,
      frameCount,
      averageFrameMs,
      peakFrameMs,
      overBudgetFrames,
      overBudgetRatio: frameCount === 0
        ? 0
        : overBudgetFrames / frameCount,
      bottleneckStage:
        overBudgetFrames > 0 &&
        dominant &&
        dominant.averageMs > 0
          ? dominant.stageId
          : null,
      bottleneckAverageMs: overBudgetFrames > 0
        ? dominant?.averageMs ?? 0
        : 0,
      stages: Object.freeze(stages),
      latestFrame
    });
  }

  reset(): void {
    this.frames.length = 0;
    this.currentDurations.clear();
    this.currentClock = null;
  }

  private readNow(): number {
    const value = this.now();
    if (!Number.isFinite(value)) {
      throw new Error('Profiler clock returned a non-finite value.');
    }
    return value;
  }
}

export function measurePerformanceStage<T>(
  sink: PerformanceMeasureSink | undefined,
  stageId: PerformanceStageId,
  operation: () => T
): T {
  return sink ? sink.measure(stageId, operation) : operation();
}
