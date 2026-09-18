function cloneSources(sources) {
    return Object.fromEntries(Object.entries(sources).filter(([, value]) => Number.isFinite(value)));
}
function cloneSample(sample) {
    return {
        engineTimeMs: sample.engineTimeMs,
        sources: cloneSources(sample.sources)
    };
}
export class FeatureHistoryBuffer {
    maxDurationMs;
    samples = [];
    constructor(maxDurationMs = 30_000) {
        this.maxDurationMs = maxDurationMs;
        if (!Number.isFinite(maxDurationMs) || maxDurationMs <= 0) {
            throw new Error('FeatureHistoryBuffer maxDurationMs must be positive.');
        }
    }
    record(engineTimeMs, sources) {
        if (!Number.isFinite(engineTimeMs) || engineTimeMs < 0) {
            throw new Error('FeatureHistoryBuffer requires a valid engine clock time.');
        }
        const previous = this.samples.at(-1);
        if (previous && engineTimeMs < previous.engineTimeMs) {
            this.samples.length = 0;
        }
        this.samples.push({
            engineTimeMs,
            sources: cloneSources(sources)
        });
        this.trim(engineTimeMs);
    }
    list() {
        return this.samples.map(cloneSample);
    }
    recent(endEngineTimeMs, durationMs) {
        if (!Number.isFinite(endEngineTimeMs) || !Number.isFinite(durationMs)) {
            return [];
        }
        const startEngineTimeMs = endEngineTimeMs - Math.max(0, durationMs);
        return this.samples
            .filter(sample => sample.engineTimeMs >= startEngineTimeMs &&
            sample.engineTimeMs <= endEngineTimeMs)
            .map(cloneSample);
    }
    clear() {
        this.samples.length = 0;
    }
    trim(nowEngineTimeMs) {
        const cutoff = nowEngineTimeMs - this.maxDurationMs;
        let removeCount = 0;
        while (removeCount < this.samples.length &&
            this.samples[removeCount].engineTimeMs < cutoff) {
            removeCount += 1;
        }
        if (removeCount > 0)
            this.samples.splice(0, removeCount);
    }
}
//# sourceMappingURL=feature-history.js.map