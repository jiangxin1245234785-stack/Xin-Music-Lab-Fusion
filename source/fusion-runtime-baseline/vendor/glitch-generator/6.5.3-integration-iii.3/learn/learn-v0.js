const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
const clamp01 = (value) => clamp(value, 0, 1);
const round = (value, digits = 4) => {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
};
function quantile(sorted, fraction) {
    if (sorted.length === 0)
        return 0;
    const index = clamp01(fraction) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const blend = index - lower;
    const lowerValue = sorted[lower] ?? 0;
    const upperValue = sorted[upper] ?? lowerValue;
    return lowerValue + (upperValue - lowerValue) * blend;
}
function failure(sourceId, code, message, sampleCount, durationMs) {
    return {
        ok: false,
        sourceId,
        code,
        message,
        confidence: 0,
        sampleCount,
        durationMs
    };
}
function suggestedRange(target, dynamics, rangeAnchor, rangeDirection) {
    const minimum = Math.min(target?.min ?? 0, target?.max ?? 1);
    const maximum = Math.max(target?.min ?? 0, target?.max ?? 1);
    const base = clamp(rangeAnchor ?? target?.defaultValue ?? minimum, minimum, maximum);
    const upwardHeadroom = maximum - base;
    const downwardHeadroom = base - minimum;
    const direction = rangeDirection ??
        (upwardHeadroom >= downwardHeadroom ? 1 : -1);
    const headroom = direction > 0 ? upwardHeadroom : downwardHeadroom;
    const travel = headroom * clamp(0.2 + dynamics * 0.55, 0.2, 0.65);
    return [
        round(base),
        round(clamp(base + direction * travel, minimum, maximum))
    ];
}
export function learnV0(options) {
    const sourceId = options.sourceId.trim();
    const minDurationMs = Math.max(0, options.minDurationMs ?? 2_500);
    const minSamples = Math.max(2, Math.round(options.minSamples ?? 32));
    const silenceFloor = clamp01(options.silenceFloor ?? 0.015);
    const minimumDynamics = clamp01(options.minimumDynamics ?? 0.04);
    const samples = [...options.samples]
        .filter(sample => Number.isFinite(sample.engineTimeMs))
        .sort((left, right) => left.engineTimeMs - right.engineTimeMs);
    const available = samples.filter(sample => Object.hasOwn(sample.sources, sourceId) &&
        Number.isFinite(sample.sources[sourceId]));
    const durationMs = available.length > 1
        ? Math.max(0, available.at(-1).engineTimeMs - available[0].engineTimeMs)
        : 0;
    if (!sourceId || available.length === 0) {
        return failure(sourceId, 'SOURCE_UNAVAILABLE', `Source "${sourceId || '(empty)'}" is unavailable in this segment.`, 0, 0);
    }
    if (available.length < minSamples || durationMs < minDurationMs) {
        return failure(sourceId, 'TOO_SHORT', `Segment is too short: ${Math.round(durationMs)} ms / ${available.length} samples.`, available.length, durationMs);
    }
    const values = available
        .map(sample => clamp01(Number(sample.sources[sourceId])))
        .sort((left, right) => left - right);
    const low = quantile(values, 0.1);
    const median = quantile(values, 0.5);
    const high = quantile(values, 0.95);
    const peak = values.at(-1) ?? 0;
    if (peak <= silenceFloor) {
        return failure(sourceId, 'SILENT', `Segment is silent for "${sourceId}" (peak ${peak.toFixed(3)}).`, available.length, durationMs);
    }
    const representativeHigh = Math.max(high, peak * 0.85);
    const dynamics = Math.max(0, representativeHigh - low);
    if (dynamics < minimumDynamics) {
        return failure(sourceId, 'LOW_DYNAMICS', `Segment lacks dynamics for "${sourceId}" (span ${dynamics.toFixed(3)}).`, available.length, durationMs);
    }
    let totalDelta = 0;
    for (let index = 1; index < available.length; index++) {
        const current = clamp01(Number(available[index].sources[sourceId]));
        const previous = clamp01(Number(available[index - 1].sources[sourceId]));
        totalDelta += Math.abs(current - previous);
    }
    const meanAbsoluteDelta = totalDelta / Math.max(1, available.length - 1);
    const temporalActivity = clamp01(meanAbsoluteDelta / dynamics * 3);
    const attackMs = Math.round((260 - 230 * temporalActivity) / 10) * 10;
    const fallMs = Math.round((720 - 580 * temporalActivity) / 10) * 10;
    const sourceCoverage = available.length / Math.max(1, samples.length);
    const durationConfidence = clamp01(durationMs / 8_000);
    const sampleConfidence = clamp01(available.length / 160);
    const dynamicConfidence = clamp01((dynamics - minimumDynamics) / Math.max(0.01, 0.6 - minimumDynamics));
    const confidence = round(clamp01(0.2 * durationConfidence +
        0.2 * sampleConfidence +
        0.45 * dynamicConfidence +
        0.15 * sourceCoverage), 3);
    return {
        ok: true,
        sourceId,
        confidence,
        sampleCount: available.length,
        durationMs,
        metrics: {
            low: round(low),
            median: round(median),
            high: round(high),
            peak: round(peak),
            dynamics: round(dynamics),
            meanAbsoluteDelta: round(meanAbsoluteDelta),
            sourceCoverage: round(sourceCoverage)
        },
        suggestion: {
            threshold: round(clamp01(low + dynamics * 0.28)),
            range: suggestedRange(options.target, dynamics, options.rangeAnchor, options.rangeDirection),
            attackMs,
            fallMs
        }
    };
}
//# sourceMappingURL=learn-v0.js.map