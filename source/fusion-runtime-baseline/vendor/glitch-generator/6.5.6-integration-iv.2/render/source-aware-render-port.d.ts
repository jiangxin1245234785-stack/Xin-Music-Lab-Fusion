import type { PerformanceMeasureSink } from '../performance/index.js';
import type { RuntimeFrameReport, RuntimeRenderPort } from '../runtime/runtime-facade.js';
import type { GlslUniformTargetDefinition } from './glsl-uniform-target-registry.js';
import { FORMAL_TARGET_UNIFORM_CONTRACT, type ResolvedFormalTargetUniformBinding } from './formal-target-uniform-bindings.js';
export declare const SOURCE_AWARE_RENDER_PORT_VERSION: "4.2.0-target-bound";
export interface SourceDescriptor {
    readonly available: boolean;
    readonly width: number;
    readonly height: number;
    readonly kind: string;
}
export interface SourceAwareRenderPortOptions {
    readonly seedPhase?: number;
    readonly customTargets?: readonly GlslUniformTargetDefinition[];
    readonly profiler?: PerformanceMeasureSink;
}
export interface SourceAwareRenderResult extends SourceDescriptor {
    readonly contract: 'xin.generator-source-render/1';
    readonly version: typeof SOURCE_AWARE_RENDER_PORT_VERSION;
    readonly evaluationSerial: number;
    readonly frameIndex: number;
    readonly targetBindingContract: typeof FORMAL_TARGET_UNIFORM_CONTRACT;
    readonly targetBindingCount: 21;
    readonly targetBindings: readonly ResolvedFormalTargetUniformBinding[];
}
export declare function describeTexImageSource(source: unknown): SourceDescriptor;
export declare class SourceAwareWebglRenderPort implements RuntimeRenderPort {
    private readonly canvas;
    private readonly renderer;
    private readonly seedPhase;
    private readonly customTargets;
    private readonly profiler;
    private renderCalls;
    private sourceUploads;
    constructor(canvas: HTMLCanvasElement, options?: SourceAwareRenderPortOptions);
    render(source: unknown, evaluation: RuntimeFrameReport): SourceAwareRenderResult;
    reset(): void;
    dispose(): void;
    profile(): {
        readonly renderCalls: number;
        readonly gpuContextsCreated: number;
        readonly canvasTouches: number;
        readonly rafRequests: number;
    };
}
export declare function createSourceAwareWebglRenderPort(canvas: HTMLCanvasElement, options?: SourceAwareRenderPortOptions): SourceAwareWebglRenderPort;
//# sourceMappingURL=source-aware-render-port.d.ts.map