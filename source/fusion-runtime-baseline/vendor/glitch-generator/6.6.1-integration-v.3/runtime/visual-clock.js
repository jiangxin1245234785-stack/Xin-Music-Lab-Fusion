import { createVisualClockConfig } from '../schema/defaults.js';
export const VISUAL_CLOCK_CONTRACT = 'xin.visual-clock-frame/1';
export const VISUAL_CLOCK_VERSION = '1.0.0';
export const VISUAL_CLOCK_SOURCE_IDS = Object.freeze([
    'control.visualPulse',
    'control.pulse2',
    'control.pulse4',
    'control.pulse8',
    'control.pulse16',
    'control.superCycle'
]);
function clamp01(value) {
    return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
function finiteOr(value, fallback) {
    return Number.isFinite(value) ? Number(value) : fallback;
}
function neutralValues() {
    return Object.freeze({
        'control.visualPulse': 0,
        'control.pulse2': 0,
        'control.pulse4': 0,
        'control.pulse8': 0,
        'control.pulse16': 0,
        'control.superCycle': 0
    });
}
function resolvedConfidence(available, value) {
    if (!available)
        return 0;
    return value === null || value === undefined
        ? 1
        : clamp01(value);
}
function unifiedSignals(frame) {
    const onset = frame.events.onset;
    const section = frame.events.sectionBoundary;
    const onsetMeta = frame.meta.onset;
    const phaseMeta = frame.meta.rhythmPhase;
    const sectionMeta = frame.meta.sectionBoundary;
    const adaptiveAvailable = ['bass', 'mid', 'treble'].some(id => frame.meta[id].available);
    const fallbackEventId = onset
        ? `onset:${onset.epoch}:${onset.engineTimeMs}:${onset.mediaTimeMs ?? 'na'}`
        : null;
    return {
        clock: frame.clock,
        epoch: frame.transport.epoch,
        playing: frame.transport.state === 'playing',
        onset: {
            available: onsetMeta.available,
            confidence: resolvedConfidence(onsetMeta.available, onsetMeta.confidence),
            eventId: onset ? onset.eventId || fallbackEventId : null,
            strength: clamp01(onset?.strength ?? 0)
        },
        phase: {
            available: phaseMeta.available,
            confidence: resolvedConfidence(phaseMeta.available, phaseMeta.confidence),
            value: clamp01(frame.continuous.rhythmPhase)
        },
        adaptive: {
            available: adaptiveAvailable,
            value: clamp01(Math.max(frame.continuous.bass, frame.continuous.mid, frame.continuous.treble))
        },
        section: {
            active: sectionMeta.available && section !== null,
            confidence: resolvedConfidence(sectionMeta.available, sectionMeta.confidence),
            eventId: section
                ? section.eventId ||
                    `section:${section.epoch}:${section.engineTimeMs}`
                : null
        }
    };
}
function legacySignals(frame, clock) {
    const onsetActive = frame.onset > 0;
    const sectionActive = frame.sectionBoundary > 0;
    return {
        clock,
        epoch: 0,
        playing: true,
        onset: {
            available: frame.available,
            confidence: frame.available ? 1 : 0,
            eventId: onsetActive ? `legacy-onset:${frame.frameIndex}` : null,
            strength: clamp01(frame.onset)
        },
        phase: {
            available: frame.available,
            confidence: frame.available ? 0.65 : 0,
            value: clamp01(frame.rhythmPhase)
        },
        adaptive: {
            available: frame.available,
            value: clamp01(Math.max(frame.bass, frame.mid, frame.treble))
        },
        section: {
            active: frame.available && sectionActive,
            confidence: clamp01(frame.sectionBoundaryConfidence),
            eventId: sectionActive ? `legacy-section:${frame.frameIndex}` : null
        }
    };
}
export class VisualClockRuntime {
    pulseIndex = 0;
    lastEpoch = null;
    lastOnsetKey = null;
    lastSectionKey = null;
    previousPhase = null;
    adaptiveAverage = null;
    adaptivePeak = 0;
    lastTriggerMs = null;
    resetReason = 'initial';
    reset(reason = 'manual') {
        this.pulseIndex = 0;
        this.lastEpoch = null;
        this.lastOnsetKey = null;
        this.lastSectionKey = null;
        this.previousPhase = null;
        this.adaptiveAverage = null;
        this.adaptivePeak = 0;
        this.lastTriggerMs = null;
        this.resetReason = String(reason || 'manual');
    }
    evaluate(frame, configInput = {}) {
        return this.evaluateSignals(unifiedSignals(frame), createVisualClockConfig(configInput));
    }
    evaluateLegacy(frame, clock, configInput = {}) {
        return this.evaluateSignals(legacySignals(frame, clock), createVisualClockConfig(configInput));
    }
    evaluateSignals(signals, config) {
        if (this.lastEpoch !== null && signals.epoch !== this.lastEpoch) {
            this.reset('transport-epoch');
        }
        this.lastEpoch = signals.epoch;
        if (!config.enabled) {
            return this.frame(signals.epoch, false, 'none', 0, null, neutralValues());
        }
        if (config.resetOnSectionBoundary &&
            signals.section.active &&
            signals.section.confidence >= config.sectionBoundaryConfidence) {
            const sectionKey = `${signals.epoch}:${signals.section.eventId ?? ''}`;
            if (sectionKey !== this.lastSectionKey) {
                this.reset('section-boundary');
                this.lastEpoch = signals.epoch;
                this.lastSectionKey = sectionKey;
            }
        }
        if (!signals.playing) {
            return this.frame(signals.epoch, true, 'none', 0, null, neutralValues());
        }
        const onsetAllowed = config.mode === 'auto' || config.mode === 'onset';
        const phaseAllowed = config.mode === 'auto' || config.mode === 'rhythm-phase';
        const adaptiveAllowed = config.mode === 'auto' || config.mode === 'adaptive';
        if (onsetAllowed && signals.onset.available) {
            const confident = signals.onset.confidence >= config.minimumConfidence;
            const key = signals.onset.eventId
                ? `${signals.epoch}:${signals.onset.eventId}`
                : null;
            const triggered = confident && key !== null && key !== this.lastOnsetKey;
            if (key !== null)
                this.lastOnsetKey = key;
            return this.advanceOrHold(signals, config, 'onset-event', signals.onset.confidence, signals.onset.eventId, triggered, signals.onset.strength);
        }
        if (phaseAllowed && signals.phase.available) {
            const previous = this.previousPhase;
            const current = signals.phase.value;
            this.previousPhase = current;
            const triggered = signals.phase.confidence >= config.minimumConfidence &&
                previous !== null &&
                previous >= 0.75 &&
                current <= 0.25;
            return this.advanceOrHold(signals, config, 'rhythm-phase-wrap', signals.phase.confidence, null, triggered, 1);
        }
        if (adaptiveAllowed && signals.adaptive.available) {
            const triggered = this.adaptiveTrigger(signals.adaptive.value, signals.clock, config.refractoryMs);
            return this.advanceOrHold(signals, config, 'adaptive-fallback', 0.35, null, triggered, 1);
        }
        return this.frame(signals.epoch, true, 'none', 0, null, neutralValues());
    }
    adaptiveTrigger(value, clock, refractoryMs) {
        if (this.adaptiveAverage === null) {
            this.adaptiveAverage = value;
            return false;
        }
        const deltaMs = Math.max(0, finiteOr(clock.deltaMs, 0));
        const decay = Math.exp(-deltaMs / 650);
        const threshold = this.adaptiveAverage + Math.max(0.04, this.adaptivePeak * 0.55);
        const refractoryReady = this.lastTriggerMs === null ||
            clock.nowMs - this.lastTriggerMs >= refractoryMs;
        const triggered = value > threshold && refractoryReady;
        const averageAlpha = 1 - Math.exp(-deltaMs / 420);
        const priorAverage = this.adaptiveAverage;
        this.adaptiveAverage += (value - this.adaptiveAverage) * averageAlpha;
        this.adaptivePeak = Math.max(this.adaptivePeak * decay, Math.max(0, value - priorAverage));
        return triggered;
    }
    advanceOrHold(signals, config, basis, confidence, eventId, triggered, strength) {
        if (!triggered) {
            return this.frame(signals.epoch, true, basis, confidence, eventId, neutralValues());
        }
        this.pulseIndex += 1;
        this.lastTriggerMs = signals.clock.nowMs;
        const divisions = new Set(config.divisions);
        const values = Object.freeze({
            'control.visualPulse': clamp01(strength),
            'control.pulse2': divisions.has(2) && this.pulseIndex % 2 === 0 ? 1 : 0,
            'control.pulse4': divisions.has(4) && this.pulseIndex % 4 === 0 ? 1 : 0,
            'control.pulse8': divisions.has(8) && this.pulseIndex % 8 === 0 ? 1 : 0,
            'control.pulse16': divisions.has(16) && this.pulseIndex % 16 === 0 ? 1 : 0,
            'control.superCycle': this.pulseIndex % 128 === 0 ? 1 : 0
        });
        return this.frame(signals.epoch, true, basis, confidence, eventId, values);
    }
    frame(epoch, enabled, basis, confidence, eventId, values) {
        return Object.freeze({
            contract: VISUAL_CLOCK_CONTRACT,
            version: VISUAL_CLOCK_VERSION,
            enabled,
            epoch,
            basis,
            confidence: clamp01(confidence),
            pulseIndex: this.pulseIndex,
            eventId,
            lastTriggerMs: this.lastTriggerMs,
            values,
            resetReason: this.resetReason
        });
    }
}
//# sourceMappingURL=visual-clock.js.map