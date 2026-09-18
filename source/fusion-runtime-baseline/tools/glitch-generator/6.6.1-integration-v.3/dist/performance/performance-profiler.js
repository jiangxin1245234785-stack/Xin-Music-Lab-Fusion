export const PERFORMANCE_STAGE_IDS = Object.freeze([
    'feature-extraction',
    'conditioning',
    'nodes',
    'mixer',
    'render-setup',
    'render:builtin-feedback',
    'render:custom-glsl',
    'render:display'
]);
function finiteDuration(value) {
    return Math.max(0, Number.isFinite(value) ? value : 0);
}
function validateThreshold(value) {
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`Invalid profiler threshold: ${String(value)}`);
    }
    return value;
}
function validateWindowSize(value) {
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`Invalid profiler window size: ${String(value)}`);
    }
    return value;
}
function defaultNow() {
    return globalThis.performance.now();
}
export class PerformanceProfiler {
    frames = [];
    currentDurations = new Map();
    currentClock = null;
    frameStartedAt = 0;
    enabledValue;
    thresholdValue;
    windowSize;
    now;
    constructor(options = {}) {
        this.enabledValue = options.enabled ?? true;
        this.thresholdValue = validateThreshold(options.thresholdMs ?? 1000 / 60);
        this.windowSize = validateWindowSize(options.windowSize ?? 120);
        this.now = options.now ?? defaultNow;
    }
    get enabled() {
        return this.enabledValue;
    }
    get thresholdMs() {
        return this.thresholdValue;
    }
    setEnabled(enabled) {
        this.enabledValue = enabled;
        if (!enabled)
            this.currentClock = null;
    }
    setThresholdMs(thresholdMs) {
        this.thresholdValue = validateThreshold(thresholdMs);
    }
    beginFrame(clock) {
        if (!this.enabledValue)
            return;
        this.currentClock = Object.freeze({ ...clock });
        this.currentDurations.clear();
        this.frameStartedAt = this.readNow();
    }
    measure(stageId, operation) {
        if (!this.enabledValue || this.currentClock === null)
            return operation();
        const startedAt = this.readNow();
        try {
            return operation();
        }
        finally {
            const durationMs = finiteDuration(this.readNow() - startedAt);
            this.currentDurations.set(stageId, (this.currentDurations.get(stageId) ?? 0) + durationMs);
        }
    }
    endFrame() {
        if (!this.enabledValue || this.currentClock === null)
            return null;
        const frameTimeMs = finiteDuration(this.readNow() - this.frameStartedAt);
        const stages = PERFORMANCE_STAGE_IDS
            .map(stageId => Object.freeze({
            stageId,
            durationMs: finiteDuration(this.currentDurations.get(stageId) ?? 0)
        }));
        const dominant = stages.reduce((winner, sample) => winner === null || sample.durationMs > winner.durationMs
            ? sample
            : winner, null);
        const profile = Object.freeze({
            frameIndex: this.currentClock.frameIndex,
            engineTimeMs: this.currentClock.nowMs,
            frameTimeMs,
            thresholdMs: this.thresholdValue,
            overBudget: frameTimeMs > this.thresholdValue,
            dominantStage: dominant && dominant.durationMs > 0 ? dominant.stageId : null,
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
    snapshot() {
        const frameCount = this.frames.length;
        const averageFrameMs = frameCount === 0
            ? 0
            : this.frames.reduce((sum, frame) => sum + frame.frameTimeMs, 0) /
                frameCount;
        const peakFrameMs = this.frames.reduce((peak, frame) => Math.max(peak, frame.frameTimeMs), 0);
        const overBudgetFrames = this.frames.filter(frame => frame.overBudget).length;
        const stages = PERFORMANCE_STAGE_IDS.map(stageId => {
            const samples = this.frames.map(frame => frame.stages.find(sample => sample.stageId === stageId)
                ?.durationMs ?? 0);
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
                : overBudgetProfiles.reduce((sum, frame) => sum + (frame.stages.find(sample => sample.stageId === stageId)
                    ?.durationMs ?? 0), 0) / overBudgetProfiles.length
        }));
        const dominant = bottleneckAverages.reduce((winner, stage) => winner === null || stage.averageMs > winner.averageMs
            ? stage
            : winner, null);
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
            bottleneckStage: overBudgetFrames > 0 &&
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
    reset() {
        this.frames.length = 0;
        this.currentDurations.clear();
        this.currentClock = null;
    }
    readNow() {
        const value = this.now();
        if (!Number.isFinite(value)) {
            throw new Error('Profiler clock returned a non-finite value.');
        }
        return value;
    }
}
export function measurePerformanceStage(sink, stageId, operation) {
    return sink ? sink.measure(stageId, operation) : operation();
}
//# sourceMappingURL=performance-profiler.js.map