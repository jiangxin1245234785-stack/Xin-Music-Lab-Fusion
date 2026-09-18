import type { EngineClockFrame } from '../clock/index.js';
import type { ResolvedUnifiedMusicFrame } from '../contracts/index.js';
import { createVisualClockConfig } from '../schema/defaults.js';
import type {
  ResolvedAudioFeatureFrame,
  ResolvedVisualClockConfig,
  VisualClockConfig
} from '../schema/types.js';

export const VISUAL_CLOCK_CONTRACT =
  'xin.visual-clock-frame/1' as const;
export const VISUAL_CLOCK_VERSION = '1.0.0' as const;

export const VISUAL_CLOCK_SOURCE_IDS = Object.freeze([
  'control.visualPulse',
  'control.pulse2',
  'control.pulse4',
  'control.pulse8',
  'control.pulse16',
  'control.superCycle'
] as const);

export type VisualClockSourceId =
  typeof VISUAL_CLOCK_SOURCE_IDS[number];
export type VisualClockBasis =
  | 'onset-event'
  | 'rhythm-phase-wrap'
  | 'adaptive-fallback'
  | 'none';

export type VisualClockValues = Readonly<
  Record<VisualClockSourceId, number>
>;

export interface VisualClockFrame {
  readonly contract: typeof VISUAL_CLOCK_CONTRACT;
  readonly version: typeof VISUAL_CLOCK_VERSION;
  readonly enabled: boolean;
  readonly epoch: number;
  readonly basis: VisualClockBasis;
  readonly confidence: number;
  readonly pulseIndex: number;
  readonly eventId: string | null;
  readonly lastTriggerMs: number | null;
  readonly values: VisualClockValues;
  readonly resetReason: string;
}

interface OnsetSignal {
  readonly available: boolean;
  readonly confidence: number;
  readonly eventId: string | null;
  readonly strength: number;
}

interface PhaseSignal {
  readonly available: boolean;
  readonly confidence: number;
  readonly value: number;
}

interface AdaptiveSignal {
  readonly available: boolean;
  readonly value: number;
}

interface SectionSignal {
  readonly active: boolean;
  readonly confidence: number;
  readonly eventId: string | null;
}

interface VisualClockSignals {
  readonly clock: EngineClockFrame;
  readonly epoch: number;
  readonly playing: boolean;
  readonly onset: OnsetSignal;
  readonly phase: PhaseSignal;
  readonly adaptive: AdaptiveSignal;
  readonly section: SectionSignal;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function finiteOr(value: number | null | undefined, fallback: number): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function neutralValues(): VisualClockValues {
  return Object.freeze({
    'control.visualPulse': 0,
    'control.pulse2': 0,
    'control.pulse4': 0,
    'control.pulse8': 0,
    'control.pulse16': 0,
    'control.superCycle': 0
  });
}

function resolvedConfidence(
  available: boolean,
  value: number | null | undefined
): number {
  if (!available) return 0;
  return value === null || value === undefined
    ? 1
    : clamp01(value);
}

function unifiedSignals(
  frame: ResolvedUnifiedMusicFrame
): VisualClockSignals {
  const onset = frame.events.onset;
  const section = frame.events.sectionBoundary;
  const onsetMeta = frame.meta.onset;
  const phaseMeta = frame.meta.rhythmPhase;
  const sectionMeta = frame.meta.sectionBoundary;
  const adaptiveAvailable = ['bass', 'mid', 'treble'].some(
    id => frame.meta[id as 'bass' | 'mid' | 'treble'].available
  );
  const fallbackEventId = onset
    ? `onset:${onset.epoch}:${onset.engineTimeMs}:${onset.mediaTimeMs ?? 'na'}`
    : null;
  return {
    clock: frame.clock,
    epoch: frame.transport.epoch,
    playing: frame.transport.state === 'playing',
    onset: {
      available: onsetMeta.available,
      confidence: resolvedConfidence(
        onsetMeta.available,
        onsetMeta.confidence
      ),
      eventId: onset ? onset.eventId || fallbackEventId : null,
      strength: clamp01(onset?.strength ?? 0)
    },
    phase: {
      available: phaseMeta.available,
      confidence: resolvedConfidence(
        phaseMeta.available,
        phaseMeta.confidence
      ),
      value: clamp01(frame.continuous.rhythmPhase)
    },
    adaptive: {
      available: adaptiveAvailable,
      value: clamp01(Math.max(
        frame.continuous.bass,
        frame.continuous.mid,
        frame.continuous.treble
      ))
    },
    section: {
      active: sectionMeta.available && section !== null,
      confidence: resolvedConfidence(
        sectionMeta.available,
        sectionMeta.confidence
      ),
      eventId: section
        ? section.eventId ||
          `section:${section.epoch}:${section.engineTimeMs}`
        : null
    }
  };
}

function legacySignals(
  frame: ResolvedAudioFeatureFrame,
  clock: EngineClockFrame
): VisualClockSignals {
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
  private pulseIndex = 0;
  private lastEpoch: number | null = null;
  private lastOnsetKey: string | null = null;
  private lastSectionKey: string | null = null;
  private previousPhase: number | null = null;
  private adaptiveAverage: number | null = null;
  private adaptivePeak = 0;
  private lastTriggerMs: number | null = null;
  private resetReason = 'initial';

  reset(reason = 'manual'): void {
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

  evaluate(
    frame: ResolvedUnifiedMusicFrame,
    configInput: VisualClockConfig = {}
  ): VisualClockFrame {
    return this.evaluateSignals(
      unifiedSignals(frame),
      createVisualClockConfig(configInput)
    );
  }

  evaluateLegacy(
    frame: ResolvedAudioFeatureFrame,
    clock: EngineClockFrame,
    configInput: VisualClockConfig = {}
  ): VisualClockFrame {
    return this.evaluateSignals(
      legacySignals(frame, clock),
      createVisualClockConfig(configInput)
    );
  }

  private evaluateSignals(
    signals: VisualClockSignals,
    config: ResolvedVisualClockConfig
  ): VisualClockFrame {
    if (this.lastEpoch !== null && signals.epoch !== this.lastEpoch) {
      this.reset('transport-epoch');
    }
    this.lastEpoch = signals.epoch;

    if (!config.enabled) {
      return this.frame(
        signals.epoch,
        false,
        'none',
        0,
        null,
        neutralValues()
      );
    }

    if (
      config.resetOnSectionBoundary &&
      signals.section.active &&
      signals.section.confidence >= config.sectionBoundaryConfidence
    ) {
      const sectionKey = `${signals.epoch}:${signals.section.eventId ?? ''}`;
      if (sectionKey !== this.lastSectionKey) {
        this.reset('section-boundary');
        this.lastEpoch = signals.epoch;
        this.lastSectionKey = sectionKey;
      }
    }

    if (!signals.playing) {
      return this.frame(
        signals.epoch,
        true,
        'none',
        0,
        null,
        neutralValues()
      );
    }

    const onsetAllowed = config.mode === 'auto' || config.mode === 'onset';
    const phaseAllowed =
      config.mode === 'auto' || config.mode === 'rhythm-phase';
    const adaptiveAllowed =
      config.mode === 'auto' || config.mode === 'adaptive';

    if (onsetAllowed && signals.onset.available) {
      const confident = signals.onset.confidence >= config.minimumConfidence;
      const key = signals.onset.eventId
        ? `${signals.epoch}:${signals.onset.eventId}`
        : null;
      const triggered = confident && key !== null && key !== this.lastOnsetKey;
      if (key !== null) this.lastOnsetKey = key;
      return this.advanceOrHold(
        signals,
        config,
        'onset-event',
        signals.onset.confidence,
        signals.onset.eventId,
        triggered,
        signals.onset.strength
      );
    }

    if (phaseAllowed && signals.phase.available) {
      const previous = this.previousPhase;
      const current = signals.phase.value;
      this.previousPhase = current;
      const triggered =
        signals.phase.confidence >= config.minimumConfidence &&
        previous !== null &&
        previous >= 0.75 &&
        current <= 0.25;
      return this.advanceOrHold(
        signals,
        config,
        'rhythm-phase-wrap',
        signals.phase.confidence,
        null,
        triggered,
        1
      );
    }

    if (adaptiveAllowed && signals.adaptive.available) {
      const triggered = this.adaptiveTrigger(
        signals.adaptive.value,
        signals.clock,
        config.refractoryMs
      );
      return this.advanceOrHold(
        signals,
        config,
        'adaptive-fallback',
        0.35,
        null,
        triggered,
        1
      );
    }

    return this.frame(
      signals.epoch,
      true,
      'none',
      0,
      null,
      neutralValues()
    );
  }

  private adaptiveTrigger(
    value: number,
    clock: EngineClockFrame,
    refractoryMs: number
  ): boolean {
    if (this.adaptiveAverage === null) {
      this.adaptiveAverage = value;
      return false;
    }
    const deltaMs = Math.max(0, finiteOr(clock.deltaMs, 0));
    const decay = Math.exp(-deltaMs / 650);
    const threshold = this.adaptiveAverage + Math.max(
      0.04,
      this.adaptivePeak * 0.55
    );
    const refractoryReady =
      this.lastTriggerMs === null ||
      clock.nowMs - this.lastTriggerMs >= refractoryMs;
    const triggered = value > threshold && refractoryReady;
    const averageAlpha = 1 - Math.exp(-deltaMs / 420);
    const priorAverage = this.adaptiveAverage;
    this.adaptiveAverage += (value - this.adaptiveAverage) * averageAlpha;
    this.adaptivePeak = Math.max(
      this.adaptivePeak * decay,
      Math.max(0, value - priorAverage)
    );
    return triggered;
  }

  private advanceOrHold(
    signals: VisualClockSignals,
    config: ResolvedVisualClockConfig,
    basis: VisualClockBasis,
    confidence: number,
    eventId: string | null,
    triggered: boolean,
    strength: number
  ): VisualClockFrame {
    if (!triggered) {
      return this.frame(
        signals.epoch,
        true,
        basis,
        confidence,
        eventId,
        neutralValues()
      );
    }
    this.pulseIndex += 1;
    this.lastTriggerMs = signals.clock.nowMs;
    const divisions = new Set(config.divisions);
    const values: VisualClockValues = Object.freeze({
      'control.visualPulse': clamp01(strength),
      'control.pulse2': divisions.has(2) && this.pulseIndex % 2 === 0 ? 1 : 0,
      'control.pulse4': divisions.has(4) && this.pulseIndex % 4 === 0 ? 1 : 0,
      'control.pulse8': divisions.has(8) && this.pulseIndex % 8 === 0 ? 1 : 0,
      'control.pulse16': divisions.has(16) && this.pulseIndex % 16 === 0 ? 1 : 0,
      'control.superCycle': this.pulseIndex % 128 === 0 ? 1 : 0
    });
    return this.frame(
      signals.epoch,
      true,
      basis,
      confidence,
      eventId,
      values
    );
  }

  private frame(
    epoch: number,
    enabled: boolean,
    basis: VisualClockBasis,
    confidence: number,
    eventId: string | null,
    values: VisualClockValues
  ): VisualClockFrame {
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

