import type { EngineClockFrame } from '../clock/engine-clock.js';
import { createAudioFeatureFrame } from '../schema/defaults.js';
import type {
  AudioFeatureFrame,
  ResolvedAudioFeatureFrame
} from '../schema/types.js';

export type StructureFallbackMode = 'zero' | 'hold-last';
export type StructureManualOverride =
  | 'auto'
  | 'none'
  | 'build'
  | 'drop'
  | 'climax';

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

export const STRUCTURAL_SIGNAL_DEFAULTS:
Readonly<ResolvedStructuralSignalSettings> = Object.freeze({
  sensitivity: 1,
  holdDurationMs: 2_500,
  fallbackMode: 'zero',
  manualOverride: 'auto'
});

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

const clamp01 = (value: number): number => clamp(value, 0, 1);

function follow(
  previous: number,
  target: number,
  durationMs: number,
  deltaMs: number
): number {
  if (deltaMs <= 0 || durationMs <= 0) return target;
  const alpha = 1 - Math.exp(-deltaMs / durationMs);
  return previous + (target - previous) * alpha;
}

function resolveSettings(
  input: StructuralSignalSettings = {}
): ResolvedStructuralSignalSettings {
  const fallbackMode: StructureFallbackMode =
    input.fallbackMode === 'hold-last' ? 'hold-last' : 'zero';
  const manualOverride: StructureManualOverride = [
    'none',
    'build',
    'drop',
    'climax'
  ].includes(input.manualOverride ?? '')
    ? input.manualOverride as StructureManualOverride
    : 'auto';
  return {
    sensitivity: clamp(
      input.sensitivity ?? STRUCTURAL_SIGNAL_DEFAULTS.sensitivity,
      0.25,
      3
    ),
    holdDurationMs: clamp(
      input.holdDurationMs ?? STRUCTURAL_SIGNAL_DEFAULTS.holdDurationMs,
      250,
      12_000
    ),
    fallbackMode,
    manualOverride
  };
}

export class StructuralSignalDetector {
  private settingsValue: ResolvedStructuralSignalSettings;
  private startedAtMs: number | null = null;
  private previousEngineTimeMs = 0;
  private previousDrive = 0;
  private previousDensity = 0;
  private previousLoudness = 0;
  private previousBoundaryAbove = false;
  private lastBoundaryAtMs = -Infinity;
  private slowDrive = 0;
  private recentPeak = 0;
  private inBuild = false;
  private inDrop = false;
  private inClimax = false;
  private buildUntilMs = 0;
  private dropUntilMs = 0;
  private climaxUntilMs = 0;

  constructor(settings: StructuralSignalSettings = {}) {
    this.settingsValue = resolveSettings(settings);
  }

  configure(settings: StructuralSignalSettings): void {
    this.settingsValue = resolveSettings({
      ...this.settingsValue,
      ...settings
    });
  }

  settings(): ResolvedStructuralSignalSettings {
    return { ...this.settingsValue };
  }

  reset(): void {
    this.startedAtMs = null;
    this.previousEngineTimeMs = 0;
    this.previousDrive = 0;
    this.previousDensity = 0;
    this.previousLoudness = 0;
    this.previousBoundaryAbove = false;
    this.lastBoundaryAtMs = -Infinity;
    this.slowDrive = 0;
    this.recentPeak = 0;
    this.inBuild = false;
    this.inDrop = false;
    this.inClimax = false;
    this.buildUntilMs = 0;
    this.dropUntilMs = 0;
    this.climaxUntilMs = 0;
  }

  apply(
    input: AudioFeatureFrame,
    clock: EngineClockFrame
  ): ResolvedAudioFeatureFrame {
    if (clock.nowMs < this.previousEngineTimeMs) this.reset();
    const frame = createAudioFeatureFrame(input);
    if (this.startedAtMs === null) this.startedAtMs = clock.nowMs;
    const historyMs = Math.max(0, clock.nowMs - this.startedAtMs);
    const sectionBoundaryAvailable = frame.available && historyMs >= 600;
    const buildAvailable = frame.available && historyMs >= 1_000;
    const dropAvailable = frame.available && historyMs >= 1_600;
    const climaxAvailable = frame.available && historyMs >= 1_600;
    const allAvailable =
      sectionBoundaryAvailable &&
      buildAvailable &&
      dropAvailable &&
      climaxAvailable;

    this.slowDrive = follow(
      this.slowDrive,
      frame.sectionDrive,
      1_800,
      clock.deltaMs
    );
    const positiveTrend = Math.max(0, frame.sectionDrive - this.slowDrive);
    const boundaryDelta =
      Math.abs(frame.sectionDrive - this.previousDrive) * 2.8 +
      Math.abs(frame.spectralDensity - this.previousDensity) * 0.75 +
      Math.abs(frame.loudness - this.previousLoudness) * 0.7 +
      frame.flux * 1.4;
    const sectionBoundaryConfidence = clamp01(boundaryDelta);
    const buildConfidence = clamp01(
      frame.buildEnergy * 0.72 +
      positiveTrend * 2.4 +
      frame.sectionDrive * 0.18 +
      frame.spectralDensity * 0.1
    );
    const climaxConfidence = clamp01(
      frame.sectionDrive * 0.62 +
      frame.spectralDensity * 0.24 +
      frame.loudness * 0.22 +
      frame.sharpness * 0.06
    );
    const negativeDrive =
      Math.max(0, this.previousDrive - frame.sectionDrive) * 1.8 +
      Math.max(0, this.previousDensity - frame.spectralDensity) * 0.7 +
      Math.max(0, this.previousLoudness - frame.loudness) * 0.8;
    const dropContext = clamp01(
      (this.recentPeak - frame.sectionDrive) * 1.3
    );
    const dropConfidence = clamp01(
      negativeDrive * 1.25 + dropContext * 0.45
    );

    const threshold = (base: number): number =>
      clamp(base / this.settingsValue.sensitivity, 0.08, 0.95);
    const boundaryAbove =
      sectionBoundaryAvailable &&
      sectionBoundaryConfidence >= threshold(0.42);
    const sectionBoundary =
      boundaryAbove &&
      !this.previousBoundaryAbove &&
      clock.nowMs - this.lastBoundaryAtMs >= 320
        ? sectionBoundaryConfidence
        : 0;
    if (sectionBoundary > 0) this.lastBoundaryAtMs = clock.nowMs;
    this.previousBoundaryAbove = boundaryAbove;

    const previousDrop = this.inDrop;
    const previousClimax = this.inClimax;
    const useHoldFallback =
      this.settingsValue.fallbackMode === 'hold-last';

    if (buildAvailable) {
      if (buildConfidence >= threshold(0.36)) {
        this.inBuild = true;
        this.buildUntilMs = clock.nowMs + this.settingsValue.holdDurationMs;
      } else if (clock.nowMs >= this.buildUntilMs) {
        this.inBuild = false;
      }
    } else if (!useHoldFallback) {
      this.inBuild = false;
    }

    if (climaxAvailable) {
      if (climaxConfidence >= threshold(0.34)) {
        this.inClimax = true;
        this.climaxUntilMs = clock.nowMs + this.settingsValue.holdDurationMs;
      } else if (clock.nowMs >= this.climaxUntilMs) {
        this.inClimax = false;
      }
    } else if (!useHoldFallback) {
      this.inClimax = false;
    }

    if (dropAvailable) {
      if (dropConfidence >= threshold(0.5)) {
        this.inDrop = true;
        this.dropUntilMs = clock.nowMs + this.settingsValue.holdDurationMs;
      } else if (clock.nowMs >= this.dropUntilMs) {
        this.inDrop = false;
      }
    } else if (!useHoldFallback) {
      this.inDrop = false;
    }

    if (this.inDrop) {
      this.inClimax = false;
      this.inBuild = false;
    } else if (this.inClimax) {
      this.inBuild = false;
    }

    const manualActive = this.settingsValue.manualOverride !== 'auto';
    if (manualActive) {
      this.inBuild = this.settingsValue.manualOverride === 'build';
      this.inDrop = this.settingsValue.manualOverride === 'drop';
      this.inClimax = this.settingsValue.manualOverride === 'climax';
    }

    const dropEnter = this.inDrop && !previousDrop
      ? manualActive ? 1 : dropConfidence
      : 0;
    const climaxEnter = this.inClimax && !previousClimax
      ? manualActive ? 1 : climaxConfidence
      : 0;

    this.recentPeak = Math.max(
      frame.sectionDrive,
      follow(this.recentPeak, frame.sectionDrive, 3_000, clock.deltaMs)
    );
    this.previousDrive = frame.sectionDrive;
    this.previousDensity = frame.spectralDensity;
    this.previousLoudness = frame.loudness;
    this.previousEngineTimeMs = clock.nowMs;

    return createAudioFeatureFrame({
      ...frame,
      frameIndex: clock.frameIndex,
      engineTimeMs: clock.nowMs,
      sectionBoundary,
      dropEnter,
      climaxEnter,
      inBuild: this.inBuild ? 1 : 0,
      inDrop: this.inDrop ? 1 : 0,
      inClimax: this.inClimax ? 1 : 0,
      sectionBoundaryConfidence,
      buildConfidence,
      dropConfidence,
      climaxConfidence,
      sectionBoundaryAvailable,
      buildAvailable,
      dropAvailable,
      climaxAvailable,
      structureFallbackActive: !allAvailable && !manualActive,
      structureManualOverrideActive: manualActive
    });
  }
}
