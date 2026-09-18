import type { EngineClockFrame } from '../clock/index.js';

export const RENDER_QUALITY_CONTROLLER_VERSION =
  '4.3.0-engine-clock-quality' as const;

export type RenderQualityMode = 'auto' | 'eco' | 'high';
export type RenderSkipReason = 'quality-budget' | 'context-lost' |
  'context-restore-failed' | null;

export interface RenderResolutionBudget {
  readonly renderScale: number;
  readonly maxDpr: number;
}

export interface RenderQualityProfile extends RenderResolutionBudget {
  readonly id: string;
  readonly minFrameIntervalMs: number;
}

export interface RenderQualityDecision extends RenderQualityProfile {
  readonly mode: RenderQualityMode;
  readonly autoLevel: number;
  readonly emaFrameMs: number;
  readonly shouldRender: boolean;
  readonly skipReason: RenderSkipReason;
  readonly renderRequests: number;
  readonly renderedFrames: number;
  readonly skippedFrames: number;
}

const AUTO_PROFILES: readonly RenderQualityProfile[] = Object.freeze([
  Object.freeze({ id: 'auto-eco', renderScale: 0.5, maxDpr: 1, minFrameIntervalMs: 1000 / 30 }),
  Object.freeze({ id: 'auto-low', renderScale: 0.67, maxDpr: 1.15, minFrameIntervalMs: 1000 / 45 }),
  Object.freeze({ id: 'auto-balanced', renderScale: 0.82, maxDpr: 1.35, minFrameIntervalMs: 1000 / 60 }),
  Object.freeze({ id: 'auto-high', renderScale: 1, maxDpr: 1.5, minFrameIntervalMs: 1000 / 60 })
]);

export const RENDER_QUALITY_PROFILES = Object.freeze({
  eco: Object.freeze({
    id: 'eco',
    renderScale: 0.5,
    maxDpr: 1,
    minFrameIntervalMs: 1000 / 30
  }),
  high: Object.freeze({
    id: 'high',
    renderScale: 1,
    maxDpr: 2,
    minFrameIntervalMs: 0
  }),
  auto: AUTO_PROFILES
});

function normalizedMode(input: unknown): RenderQualityMode {
  return input === 'eco' || input === 'high' ? input : 'auto';
}

export class RenderQualityController {
  private mode: RenderQualityMode;
  private autoLevel = 2;
  private emaFrameMs = 1000 / 60;
  private slowFrames = 0;
  private stableFrames = 0;
  private lastRenderedAt: number | null = null;
  private renderRequests = 0;
  private renderedFrames = 0;
  private skippedFrames = 0;

  constructor(mode: RenderQualityMode = 'auto') {
    this.mode = normalizedMode(mode);
  }

  setMode(mode: RenderQualityMode): void {
    const next = normalizedMode(mode);
    if (next === this.mode) return;
    this.mode = next;
    if (next === 'auto') {
      this.autoLevel = 2;
      this.emaFrameMs = 1000 / 60;
      this.slowFrames = 0;
      this.stableFrames = 0;
    }
    this.lastRenderedAt = null;
  }

  resetSchedule(): void {
    this.lastRenderedAt = null;
  }

  decide(
    clock: EngineClockFrame,
    contextState: 'ready' | 'lost' | 'restore-failed' = 'ready'
  ): RenderQualityDecision {
    this.renderRequests++;
    this.updateAuto(clock.deltaMs);
    const profile = this.profile();
    let skipReason: RenderSkipReason = null;
    if (contextState === 'lost') skipReason = 'context-lost';
    else if (contextState === 'restore-failed') {
      skipReason = 'context-restore-failed';
    } else if (
      this.lastRenderedAt !== null &&
      clock.nowMs - this.lastRenderedAt < profile.minFrameIntervalMs - 0.25
    ) {
      skipReason = 'quality-budget';
    }
    const shouldRender = skipReason === null;
    if (shouldRender) {
      this.renderedFrames++;
      this.lastRenderedAt = clock.nowMs;
    } else {
      this.skippedFrames++;
    }
    return Object.freeze({
      ...profile,
      mode: this.mode,
      autoLevel: this.autoLevel,
      emaFrameMs: this.emaFrameMs,
      shouldRender,
      skipReason,
      renderRequests: this.renderRequests,
      renderedFrames: this.renderedFrames,
      skippedFrames: this.skippedFrames
    });
  }

  status(): RenderQualityDecision {
    const profile = this.profile();
    return Object.freeze({
      ...profile,
      mode: this.mode,
      autoLevel: this.autoLevel,
      emaFrameMs: this.emaFrameMs,
      shouldRender: false,
      skipReason: null,
      renderRequests: this.renderRequests,
      renderedFrames: this.renderedFrames,
      skippedFrames: this.skippedFrames
    });
  }

  private profile(): RenderQualityProfile {
    if (this.mode === 'eco') return RENDER_QUALITY_PROFILES.eco;
    if (this.mode === 'high') return RENDER_QUALITY_PROFILES.high;
    return AUTO_PROFILES[this.autoLevel]!;
  }

  private updateAuto(deltaMs: number): void {
    if (this.mode !== 'auto' || !Number.isFinite(deltaMs) || deltaMs <= 0) {
      return;
    }
    this.emaFrameMs += (deltaMs - this.emaFrameMs) * 0.08;
    if (this.emaFrameMs > 21.5 || deltaMs > 28) {
      this.slowFrames++;
      this.stableFrames = 0;
      if (this.slowFrames >= 12 && this.autoLevel > 0) {
        this.autoLevel--;
        this.slowFrames = 0;
        this.lastRenderedAt = null;
      }
      return;
    }
    if (this.emaFrameMs < 17.8 && deltaMs < 20) {
      this.stableFrames++;
      this.slowFrames = 0;
      if (this.stableFrames >= 180 && this.autoLevel < AUTO_PROFILES.length - 1) {
        this.autoLevel++;
        this.stableFrames = 0;
        this.lastRenderedAt = null;
      }
      return;
    }
    this.slowFrames = 0;
    this.stableFrames = 0;
  }
}
