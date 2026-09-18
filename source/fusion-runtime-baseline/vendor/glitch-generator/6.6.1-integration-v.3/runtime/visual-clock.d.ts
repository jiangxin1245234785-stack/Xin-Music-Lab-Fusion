import type { EngineClockFrame } from '../clock/index.js';
import type { ResolvedUnifiedMusicFrame } from '../contracts/index.js';
import type { ResolvedAudioFeatureFrame, VisualClockConfig } from '../schema/types.js';
export declare const VISUAL_CLOCK_CONTRACT: "xin.visual-clock-frame/1";
export declare const VISUAL_CLOCK_VERSION: "1.0.0";
export declare const VISUAL_CLOCK_SOURCE_IDS: readonly ["control.visualPulse", "control.pulse2", "control.pulse4", "control.pulse8", "control.pulse16", "control.superCycle"];
export type VisualClockSourceId = typeof VISUAL_CLOCK_SOURCE_IDS[number];
export type VisualClockBasis = 'onset-event' | 'rhythm-phase-wrap' | 'adaptive-fallback' | 'none';
export type VisualClockValues = Readonly<Record<VisualClockSourceId, number>>;
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
export declare class VisualClockRuntime {
    private pulseIndex;
    private lastEpoch;
    private lastOnsetKey;
    private lastSectionKey;
    private previousPhase;
    private adaptiveAverage;
    private adaptivePeak;
    private lastTriggerMs;
    private resetReason;
    reset(reason?: string): void;
    evaluate(frame: ResolvedUnifiedMusicFrame, configInput?: VisualClockConfig): VisualClockFrame;
    evaluateLegacy(frame: ResolvedAudioFeatureFrame, clock: EngineClockFrame, configInput?: VisualClockConfig): VisualClockFrame;
    private evaluateSignals;
    private adaptiveTrigger;
    private advanceOrHold;
    private frame;
}
//# sourceMappingURL=visual-clock.d.ts.map