import type { EngineClockFrame } from '../clock/engine-clock.js';
import type { AudioFeatureFrame, ResolvedAudioFeatureFrame } from '../schema/types.js';
export type StructureFallbackMode = 'zero' | 'hold-last';
export type StructureManualOverride = 'auto' | 'none' | 'build' | 'drop' | 'climax';
export interface StructuralSignalSettings {
    readonly sensitivity?: number;
    readonly holdDurationMs?: number;
    readonly fallbackMode?: StructureFallbackMode;
    readonly manualOverride?: StructureManualOverride;
}
export interface ResolvedStructuralSignalSettings {
    readonly sensitivity: number;
    readonly holdDurationMs: number;
    readonly fallbackMode: StructureFallbackMode;
    readonly manualOverride: StructureManualOverride;
}
export declare const STRUCTURAL_SIGNAL_DEFAULTS: Readonly<ResolvedStructuralSignalSettings>;
export declare class StructuralSignalDetector {
    private settingsValue;
    private startedAtMs;
    private previousEngineTimeMs;
    private previousDrive;
    private previousDensity;
    private previousLoudness;
    private previousBoundaryAbove;
    private lastBoundaryAtMs;
    private slowDrive;
    private recentPeak;
    private inBuild;
    private inDrop;
    private inClimax;
    private buildUntilMs;
    private dropUntilMs;
    private climaxUntilMs;
    constructor(settings?: StructuralSignalSettings);
    configure(settings: StructuralSignalSettings): void;
    settings(): ResolvedStructuralSignalSettings;
    reset(): void;
    apply(input: AudioFeatureFrame, clock: EngineClockFrame): ResolvedAudioFeatureFrame;
}
//# sourceMappingURL=structural-signal-detector.d.ts.map