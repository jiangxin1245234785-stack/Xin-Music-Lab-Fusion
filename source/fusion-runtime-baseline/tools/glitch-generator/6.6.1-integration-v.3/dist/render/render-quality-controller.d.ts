import type { EngineClockFrame } from '../clock/index.js';
export declare const RENDER_QUALITY_CONTROLLER_VERSION: "4.3.0-engine-clock-quality";
export type RenderQualityMode = 'auto' | 'eco' | 'high';
export type RenderSkipReason = 'quality-budget' | 'context-lost' | 'context-restore-failed' | null;
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
export declare const RENDER_QUALITY_PROFILES: Readonly<{
    eco: Readonly<{
        id: "eco";
        renderScale: 0.5;
        maxDpr: 1;
        minFrameIntervalMs: number;
    }>;
    high: Readonly<{
        id: "high";
        renderScale: 1;
        maxDpr: 2;
        minFrameIntervalMs: 0;
    }>;
    auto: readonly RenderQualityProfile[];
}>;
export declare class RenderQualityController {
    private mode;
    private autoLevel;
    private emaFrameMs;
    private slowFrames;
    private stableFrames;
    private lastRenderedAt;
    private renderRequests;
    private renderedFrames;
    private skippedFrames;
    constructor(mode?: RenderQualityMode);
    setMode(mode: RenderQualityMode): void;
    resetSchedule(): void;
    decide(clock: EngineClockFrame, contextState?: 'ready' | 'lost' | 'restore-failed'): RenderQualityDecision;
    status(): RenderQualityDecision;
    private profile;
    private updateAuto;
}
//# sourceMappingURL=render-quality-controller.d.ts.map