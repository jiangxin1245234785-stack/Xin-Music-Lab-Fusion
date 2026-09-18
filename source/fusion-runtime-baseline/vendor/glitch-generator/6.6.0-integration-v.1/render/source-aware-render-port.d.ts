import type { PerformanceMeasureSink } from '../performance/index.js';
import type { RuntimeFrameReport, RuntimeRenderPort } from '../runtime/runtime-facade.js';
import type { GlslUniformTargetDefinition } from './glsl-uniform-target-registry.js';
import { FORMAL_TARGET_UNIFORM_CONTRACT, type ResolvedFormalTargetUniformBinding } from './formal-target-uniform-bindings.js';
import { type RenderQualityDecision, type RenderQualityMode, type RenderResolutionBudget, type RenderSkipReason } from './render-quality-controller.js';
export declare const SOURCE_AWARE_RENDER_PORT_VERSION: "4.3.0-resilient-quality";
export interface SourceDescriptor {
    readonly available: boolean;
    readonly width: number;
    readonly height: number;
    readonly kind: string;
}
interface SourceRenderer {
    render(targets: RuntimeFrameReport['targets'], clock: RuntimeFrameReport['clock'], seedPhase: number, customTargets: readonly GlslUniformTargetDefinition[], profiler: PerformanceMeasureSink | undefined, source: TexImageSource | null, resolutionBudget: RenderResolutionBudget): void;
    resetFeedback(): void;
    dispose(): void;
}
export interface SourceAwareRenderPortOptions {
    readonly seedPhase?: number;
    readonly customTargets?: readonly GlslUniformTargetDefinition[];
    readonly profiler?: PerformanceMeasureSink;
    readonly qualityMode?: RenderQualityMode;
    readonly rendererFactory?: (canvas: HTMLCanvasElement) => SourceRenderer;
}
export interface RenderContextStatus {
    readonly state: 'ready' | 'lost' | 'restore-failed';
    readonly contextLosses: number;
    readonly contextRestores: number;
    readonly gpuContextsCreated: number;
    readonly lastError: string | null;
}
export interface SourceAwareRenderResult extends SourceDescriptor {
    readonly contract: 'xin.generator-source-render/1';
    readonly version: typeof SOURCE_AWARE_RENDER_PORT_VERSION;
    readonly evaluationSerial: number;
    readonly frameIndex: number;
    readonly rendered: boolean;
    readonly skipReason: RenderSkipReason;
    readonly quality: RenderQualityDecision;
    readonly context: RenderContextStatus;
    readonly targetBindingContract: typeof FORMAL_TARGET_UNIFORM_CONTRACT;
    readonly targetBindingCount: 21;
    readonly targetBindings: readonly ResolvedFormalTargetUniformBinding[];
}
export declare function describeTexImageSource(source: unknown): SourceDescriptor;
export declare class SourceAwareWebglRenderPort implements RuntimeRenderPort {
    private readonly canvas;
    private renderer;
    private readonly rendererFactory;
    private readonly quality;
    private readonly seedPhase;
    private readonly customTargets;
    private readonly profiler;
    private renderCalls;
    private sourceUploads;
    private contextState;
    private contextLosses;
    private contextRestores;
    private gpuContextsCreated;
    private contextError;
    private disposed;
    private readonly onContextLost;
    private readonly onContextRestored;
    constructor(canvas: HTMLCanvasElement, options?: SourceAwareRenderPortOptions);
    setQualityMode(mode: RenderQualityMode): void;
    render(source: unknown, evaluation: RuntimeFrameReport): SourceAwareRenderResult;
    reset(): void;
    dispose(): void;
    status(): {
        readonly quality: RenderQualityDecision;
        readonly context: RenderContextStatus;
    };
    profile(): {
        readonly renderCalls: number;
        readonly gpuContextsCreated: number;
        readonly canvasTouches: number;
        readonly rafRequests: number;
    };
    private createRenderer;
    private contextStatus;
}
export declare function createSourceAwareWebglRenderPort(canvas: HTMLCanvasElement, options?: SourceAwareRenderPortOptions): SourceAwareWebglRenderPort;
export {};
//# sourceMappingURL=source-aware-render-port.d.ts.map