import type { EngineClockFrame } from '../clock/engine-clock.js';
import {
  createSafetyConfig,
  createVisualTargetState
} from '../schema/defaults.js';
import type {
  ResolvedSafetyConfig,
  ResolvedVisualTargetState,
  SafetyConfig,
  VisualTargetState
} from '../schema/types.js';
import {
  VISUAL_TARGETS,
  VISUAL_TARGET_REGISTRY,
  type VisualTargetDefinition
} from './visual-targets.js';

export const ABSOLUTE_BRIGHTNESS_MAX = 1;
export const MAX_BRIGHTNESS_DELTA_PER_SECOND = 2.4;
export const MIN_FLASH_INTERVAL_MS = 1000 / 3;
export const FLASH_RISE_THRESHOLD = 0.18;
export const ABSOLUTE_FLASH_STRENGTH_MAX = 0.35;

export const SOFT_WHITEOUT_BRIGHTNESS_MAX = 0.92;
export const SOFT_WHITE_TEAR_BRIGHTNESS_MAX = 0.65;
export const SOFT_FLASH_STRENGTH_MAX = 0.25;
export const SOFT_BLACKOUT_BRIGHTNESS_MIN = 0.06;
export const SOFT_BLACKOUT_ALPHA_MIN = 0.08;
export const SOFT_FEEDBACK_RETENTION_MAX = 0.985;
export const SOFT_FEEDBACK_DECAY_MAX = 0.99;
export const SOFT_FEEDBACK_ZOOM_MIN = 0.7;
export const SOFT_FEEDBACK_ZOOM_MAX = 1.35;

export interface SafetyInterventions {
  readonly whiteout: boolean;
  readonly blackout: boolean;
  readonly feedbackRunaway: boolean;
  readonly brightnessCapped: boolean;
  readonly flashStrengthCapped: boolean;
  readonly flashFrequencySuppressed: boolean;
  readonly brightnessSlewLimited: boolean;
}

export interface SafetyStatus {
  readonly mode: 'SAFE' | 'UNSAFE';
  readonly physicalCapActive: true;
  readonly config: ResolvedSafetyConfig;
  readonly interventions: SafetyInterventions;
}

const clamp = (value: number, low: number, high: number): number =>
  Math.max(low, Math.min(high, Number.isFinite(value) ? value : low));

function changed(before: number | undefined, after: number): boolean {
  return before !== undefined &&
    Number.isFinite(before) &&
    Math.abs(before - after) > 1e-9;
}

function completeTargetDefinitions(
  extensions: readonly VisualTargetDefinition[]
): readonly VisualTargetDefinition[] {
  const definitions = new Map(
    VISUAL_TARGET_REGISTRY.map(target => [target.id, target])
  );
  for (const target of extensions) definitions.set(target.id, target);
  return [...definitions.values()];
}

export function applyAbsolutePhysicalCaps(
  input: VisualTargetState,
  targetDefinitions: readonly VisualTargetDefinition[] =
    VISUAL_TARGET_REGISTRY
): ResolvedVisualTargetState {
  const state = createVisualTargetState(input);
  const values: Record<string, number> = { ...state.values };

  for (const target of completeTargetDefinitions(targetDefinitions)) {
    if (target.id in values) {
      values[target.id] = clamp(values[target.id]!, target.min, target.max);
    }
  }
  if (VISUAL_TARGETS.brightness in values) {
    values[VISUAL_TARGETS.brightness] = clamp(
      values[VISUAL_TARGETS.brightness]!,
      0,
      ABSOLUTE_BRIGHTNESS_MAX
    );
  }
  if (VISUAL_TARGETS.scale in values) {
    values[VISUAL_TARGETS.scale] = clamp(
      values[VISUAL_TARGETS.scale]!,
      0.25,
      2
    );
  }
  if (VISUAL_TARGETS.alpha in values) {
    values[VISUAL_TARGETS.alpha] = clamp(
      values[VISUAL_TARGETS.alpha]!,
      0,
      1
    );
  }
  if (VISUAL_TARGETS.feedbackZoom in values) {
    values[VISUAL_TARGETS.feedbackZoom] = clamp(
      values[VISUAL_TARGETS.feedbackZoom]!,
      0.5,
      2
    );
  }
  if (VISUAL_TARGETS.colorBrightness in values) {
    values[VISUAL_TARGETS.colorBrightness] = clamp(
      values[VISUAL_TARGETS.colorBrightness]!,
      0,
      ABSOLUTE_BRIGHTNESS_MAX
    );
  }
  if (VISUAL_TARGETS.colorFlashStrength in values) {
    values[VISUAL_TARGETS.colorFlashStrength] = clamp(
      values[VISUAL_TARGETS.colorFlashStrength]!,
      0,
      ABSOLUTE_FLASH_STRENGTH_MAX
    );
  }
  return { ...state, values };
}

function applySoftProtections(
  input: VisualTargetState,
  config: ResolvedSafetyConfig
): {
  readonly state: ResolvedVisualTargetState;
  readonly whiteout: boolean;
  readonly blackout: boolean;
  readonly feedbackRunaway: boolean;
} {
  const state = createVisualTargetState(input);
  const values: Record<string, number> = { ...state.values };
  let whiteout = false;
  let blackout = false;
  let feedbackRunaway = false;

  if (config.whiteoutProtection) {
    for (const targetId of [
      VISUAL_TARGETS.brightness,
      VISUAL_TARGETS.colorBrightness
    ]) {
      if (!(targetId in values)) continue;
      const next = Math.min(
        Number(values[targetId]),
        SOFT_WHITEOUT_BRIGHTNESS_MAX
      );
      whiteout = changed(values[targetId], next) || whiteout;
      values[targetId] = next;
    }
    if (VISUAL_TARGETS.whiteTearBrightness in values) {
      const next = Math.min(
        Number(values[VISUAL_TARGETS.whiteTearBrightness]),
        SOFT_WHITE_TEAR_BRIGHTNESS_MAX
      );
      whiteout = changed(
        values[VISUAL_TARGETS.whiteTearBrightness],
        next
      ) || whiteout;
      values[VISUAL_TARGETS.whiteTearBrightness] = next;
    }
    if (VISUAL_TARGETS.colorFlashStrength in values) {
      const next = Math.min(
        Number(values[VISUAL_TARGETS.colorFlashStrength]),
        SOFT_FLASH_STRENGTH_MAX
      );
      whiteout = changed(
        values[VISUAL_TARGETS.colorFlashStrength],
        next
      ) || whiteout;
      values[VISUAL_TARGETS.colorFlashStrength] = next;
    }
  }

  if (config.blackoutProtection) {
    for (const targetId of [
      VISUAL_TARGETS.brightness,
      VISUAL_TARGETS.colorBrightness
    ]) {
      if (!(targetId in values)) continue;
      const next = Math.max(
        Number(values[targetId]),
        SOFT_BLACKOUT_BRIGHTNESS_MIN
      );
      blackout = changed(values[targetId], next) || blackout;
      values[targetId] = next;
    }
    if (VISUAL_TARGETS.alpha in values) {
      const next = Math.max(
        Number(values[VISUAL_TARGETS.alpha]),
        SOFT_BLACKOUT_ALPHA_MIN
      );
      blackout = changed(values[VISUAL_TARGETS.alpha], next) || blackout;
      values[VISUAL_TARGETS.alpha] = next;
    }
  }

  if (config.feedbackRunawayProtection) {
    const constraints: readonly [string, number, number][] = [
      [VISUAL_TARGETS.feedbackRetention, 0, SOFT_FEEDBACK_RETENTION_MAX],
      [VISUAL_TARGETS.feedbackDecay, 0, SOFT_FEEDBACK_DECAY_MAX],
      [
        VISUAL_TARGETS.feedbackZoom,
        SOFT_FEEDBACK_ZOOM_MIN,
        SOFT_FEEDBACK_ZOOM_MAX
      ]
    ];
    for (const [targetId, minimum, maximum] of constraints) {
      if (!(targetId in values)) continue;
      const next = clamp(Number(values[targetId]), minimum, maximum);
      feedbackRunaway = changed(values[targetId], next) || feedbackRunaway;
      values[targetId] = next;
    }
  }

  return {
    state: { ...state, values },
    whiteout,
    blackout,
    feedbackRunaway
  };
}

const noInterventions = (): SafetyInterventions => ({
  whiteout: false,
  blackout: false,
  feedbackRunaway: false,
  brightnessCapped: false,
  flashStrengthCapped: false,
  flashFrequencySuppressed: false,
  brightnessSlewLimited: false
});

export class PhysicalSafetyLimiter {
  private previousBrightness = 0;
  private previousRequestedFlashStrength = 0;
  private lastFlashAt = -Infinity;
  private flashBlockedUntilRelease = false;
  private initialized = false;
  private config = createSafetyConfig();
  private report: SafetyStatus = Object.freeze({
    mode: 'SAFE',
    physicalCapActive: true,
    config: this.config,
    interventions: noInterventions()
  });

  constructor(config: SafetyConfig = {}) {
    this.configure(config);
  }

  configure(config: SafetyConfig = {}): ResolvedSafetyConfig {
    this.config = createSafetyConfig(config);
    return this.config;
  }

  getLastReport(): SafetyStatus {
    return this.report;
  }

  reset(initialBrightness = 0): void {
    this.previousBrightness = clamp(
      initialBrightness,
      0,
      ABSOLUTE_BRIGHTNESS_MAX
    );
    this.previousRequestedFlashStrength = 0;
    this.lastFlashAt = -Infinity;
    this.flashBlockedUntilRelease = false;
    this.initialized = false;
    this.report = Object.freeze({
      mode: this.isUnsafe() ? 'UNSAFE' : 'SAFE',
      physicalCapActive: true,
      config: this.config,
      interventions: noInterventions()
    });
  }

  apply(
    input: VisualTargetState,
    clock: EngineClockFrame,
    targetDefinitions: readonly VisualTargetDefinition[] =
      VISUAL_TARGET_REGISTRY
  ): ResolvedVisualTargetState {
    const soft = applySoftProtections(input, this.config);
    const beforePhysical = createVisualTargetState(soft.state);
    const state = applyAbsolutePhysicalCaps(
      beforePhysical,
      targetDefinitions
    );
    const values: Record<string, number> = { ...state.values };
    const brightnessTarget = VISUAL_TARGETS.colorBrightness in values
      ? VISUAL_TARGETS.colorBrightness
      : VISUAL_TARGETS.brightness;
    const requestedBrightness = Number(
      beforePhysical.values[brightnessTarget] ?? this.previousBrightness
    );
    let brightness = clamp(
      values[brightnessTarget] ?? this.previousBrightness,
      0,
      ABSOLUTE_BRIGHTNESS_MAX
    );
    let brightnessSlewLimited = false;
    let flashFrequencySuppressed = false;

    if (this.initialized) {
      const requestedRise = brightness - this.previousBrightness;
      if (requestedRise >= FLASH_RISE_THRESHOLD) {
        if (clock.nowMs - this.lastFlashAt < MIN_FLASH_INTERVAL_MS) {
          brightness = this.previousBrightness;
          flashFrequencySuppressed = true;
        } else {
          this.lastFlashAt = clock.nowMs;
        }
      }
      const maxDelta =
        MAX_BRIGHTNESS_DELTA_PER_SECOND *
        Math.max(0, clock.deltaMs) /
        1000;
      const limited = clamp(
        brightness,
        this.previousBrightness - maxDelta,
        this.previousBrightness + maxDelta
      );
      brightnessSlewLimited = Math.abs(limited - brightness) > 1e-9;
      brightness = limited;
    } else {
      this.initialized = true;
      if (brightness - this.previousBrightness >= FLASH_RISE_THRESHOLD) {
        this.lastFlashAt = clock.nowMs;
      }
    }

    const requestedFlashStrength = clamp(
      Number(values[VISUAL_TARGETS.colorFlashStrength] ?? 0),
      0,
      ABSOLUTE_FLASH_STRENGTH_MAX
    );
    const flashRising =
      requestedFlashStrength >= FLASH_RISE_THRESHOLD &&
      this.previousRequestedFlashStrength < FLASH_RISE_THRESHOLD;
    if (requestedFlashStrength < FLASH_RISE_THRESHOLD) {
      this.flashBlockedUntilRelease = false;
    } else if (flashRising) {
      if (clock.nowMs - this.lastFlashAt < MIN_FLASH_INTERVAL_MS) {
        this.flashBlockedUntilRelease = true;
        flashFrequencySuppressed = true;
      } else {
        this.lastFlashAt = clock.nowMs;
        this.flashBlockedUntilRelease = false;
      }
    }
    values[VISUAL_TARGETS.colorFlashStrength] =
      this.flashBlockedUntilRelease ? 0 : requestedFlashStrength;
    this.previousRequestedFlashStrength = requestedFlashStrength;

    this.previousBrightness = brightness;
    values[brightnessTarget] = brightness;
    values[VISUAL_TARGETS.scale] = clamp(
      values[VISUAL_TARGETS.scale] ?? 1,
      0.25,
      2
    );
    values[VISUAL_TARGETS.alpha] = clamp(
      values[VISUAL_TARGETS.alpha] ?? 1,
      0,
      1
    );
    values[VISUAL_TARGETS.feedbackZoom] = clamp(
      values[VISUAL_TARGETS.feedbackZoom] ?? 1,
      0.5,
      2
    );

    this.report = Object.freeze({
      mode: this.isUnsafe() ? 'UNSAFE' : 'SAFE',
      physicalCapActive: true,
      config: this.config,
      interventions: Object.freeze({
        whiteout: soft.whiteout,
        blackout: soft.blackout,
        feedbackRunaway: soft.feedbackRunaway,
        brightnessCapped:
          requestedBrightness > ABSOLUTE_BRIGHTNESS_MAX,
        flashStrengthCapped:
          Number(beforePhysical.values[VISUAL_TARGETS.colorFlashStrength] ?? 0) >
          ABSOLUTE_FLASH_STRENGTH_MAX,
        flashFrequencySuppressed,
        brightnessSlewLimited
      })
    });
    return { ...state, values };
  }

  private isUnsafe(): boolean {
    return !this.config.whiteoutProtection ||
      !this.config.blackoutProtection ||
      !this.config.feedbackRunawayProtection;
  }
}
