import { createAudioFeatureFrame } from '../schema/defaults.js';
import { extractCoreFeatureObservation } from './core-feature-extractor.js';
const clamp01 = (value) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
function follow(previous, target, durationMs, deltaMs) {
    if (deltaMs <= 0 || durationMs <= 0)
        return target;
    const alpha = 1 - Math.exp(-deltaMs / durationMs);
    return previous + (target - previous) * alpha;
}
function quantile(sorted, fraction) {
    if (sorted.length === 0)
        return 0;
    const index = clamp01(fraction) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const blend = index - lower;
    const left = sorted[lower] ?? 0;
    const right = sorted[upper] ?? left;
    return left + (right - left) * blend;
}
function positiveSpectralFlux(previous, current) {
    if (!previous || previous.length !== current.length)
        return 0;
    let squared = 0;
    let active = 0;
    for (let index = 1; index < current.length; index++) {
        const difference = (current[index] ?? 0) - (previous[index] ?? 0);
        if (difference <= 0)
            continue;
        squared += difference * difference;
        active += 1;
    }
    if (active === 0)
        return 0;
    return clamp01(Math.sqrt(squared / current.length) * 8);
}
export class ContinuousFeatureExtractor {
    dynamicRangeWindowMs;
    buildSensitivity;
    buildWindowMs;
    rhythmSensitivity;
    loudnessHistory = [];
    previousSpectrum = null;
    previousEngineTimeMs = 0;
    previousSectionDrive = 0;
    fastDrive = 0;
    slowDrive = 0;
    sectionDrive = 0;
    buildEnergy = 0;
    fluxBaseline = 0;
    lastBeatAtMs = null;
    beatPeriodMs = null;
    constructor(options = {}) {
        this.dynamicRangeWindowMs = Math.max(250, options.dynamicRangeWindowMs ?? 2_000);
        this.buildSensitivity = Math.max(0.1, options.buildSensitivity ?? 1);
        this.buildWindowMs = Math.max(250, options.buildWindowMs ?? 1_800);
        this.rhythmSensitivity = Math.max(0.25, options.rhythmSensitivity ?? 1);
    }
    reset() {
        this.loudnessHistory.length = 0;
        this.previousSpectrum = null;
        this.previousEngineTimeMs = 0;
        this.previousSectionDrive = 0;
        this.fastDrive = 0;
        this.slowDrive = 0;
        this.sectionDrive = 0;
        this.buildEnergy = 0;
        this.fluxBaseline = 0;
        this.lastBeatAtMs = null;
        this.beatPeriodMs = null;
    }
    extract(pcm, clock) {
        if (clock.nowMs < this.previousEngineTimeMs)
            this.reset();
        const observation = extractCoreFeatureObservation(pcm);
        const core = observation.frame;
        const flux = positiveSpectralFlux(this.previousSpectrum, observation.spectrum);
        this.previousSpectrum = new Float64Array(observation.spectrum);
        this.loudnessHistory.push({
            engineTimeMs: clock.nowMs,
            value: core.loudness
        });
        const cutoff = clock.nowMs - this.dynamicRangeWindowMs;
        while (this.loudnessHistory.length > 0 &&
            this.loudnessHistory[0].engineTimeMs < cutoff) {
            this.loudnessHistory.shift();
        }
        const loudnessValues = this.loudnessHistory
            .map(sample => sample.value)
            .sort((left, right) => left - right);
        const rollingRange = Math.max(0, quantile(loudnessValues, 0.9) - quantile(loudnessValues, 0.1));
        const dynamicRange = clamp01(rollingRange * 1.8 + core.dynamicRange * 0.2);
        const driveTarget = clamp01(core.loudness * 0.4 +
            core.spectralDensity * 0.3 +
            flux * 0.2 +
            core.sharpness * 0.1);
        this.fastDrive = follow(this.fastDrive, driveTarget, 180, clock.deltaMs);
        this.slowDrive = follow(this.slowDrive, driveTarget, this.buildWindowMs, clock.deltaMs);
        const trend = clamp01(Math.max(0, this.fastDrive - this.slowDrive) *
            4.5 *
            this.buildSensitivity);
        const sectionTarget = clamp01(driveTarget * 0.72 +
            flux * 0.18 +
            dynamicRange * 0.1);
        this.sectionDrive = follow(this.sectionDrive, sectionTarget, sectionTarget >= this.sectionDrive ? 140 : 620, clock.deltaMs);
        const sectionRise = clamp01(Math.max(0, this.sectionDrive - this.previousSectionDrive) * 12);
        this.previousSectionDrive = this.sectionDrive;
        const buildTarget = clamp01(trend * 0.72 +
            sectionRise * 0.18 +
            this.sectionDrive * 0.1);
        this.buildEnergy = follow(this.buildEnergy, buildTarget, buildTarget >= this.buildEnergy ? 360 : 1_200, clock.deltaMs);
        const rhythmThreshold = Math.max(0.055, this.fluxBaseline * (1.6 + this.rhythmSensitivity * 0.45));
        const sinceBeat = this.lastBeatAtMs === null
            ? Number.POSITIVE_INFINITY
            : clock.nowMs - this.lastBeatAtMs;
        if (flux >= rhythmThreshold && sinceBeat >= 180) {
            if (this.lastBeatAtMs !== null && sinceBeat <= 1_600) {
                this.beatPeriodMs = this.beatPeriodMs === null
                    ? sinceBeat
                    : this.beatPeriodMs * 0.72 + sinceBeat * 0.28;
            }
            this.lastBeatAtMs = clock.nowMs;
        }
        this.fluxBaseline = follow(this.fluxBaseline, flux, flux >= this.fluxBaseline ? 120 : 900, clock.deltaMs);
        const rhythmPhase = this.lastBeatAtMs !== null && this.beatPeriodMs !== null
            ? clamp01(((clock.nowMs - this.lastBeatAtMs) % this.beatPeriodMs) /
                this.beatPeriodMs)
            : 0;
        this.previousEngineTimeMs = clock.nowMs;
        return createAudioFeatureFrame({
            ...core,
            frameIndex: clock.frameIndex,
            engineTimeMs: clock.nowMs,
            dynamicRange,
            buildEnergy: clamp01(this.buildEnergy),
            sectionDrive: clamp01(this.sectionDrive),
            rhythmPhase,
            flux
        });
    }
}
//# sourceMappingURL=continuous-feature-extractor.js.map