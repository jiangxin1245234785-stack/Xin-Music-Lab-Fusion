import { MinimalWebglRenderer } from './minimal-webgl-renderer.js';
import { FORMAL_TARGET_UNIFORM_CONTRACT, resolveFormalTargetUniformBindings } from './formal-target-uniform-bindings.js';
export const SOURCE_AWARE_RENDER_PORT_VERSION = '4.2.0-target-bound';
function finiteDimension(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0
        ? Math.floor(number)
        : 0;
}
export function describeTexImageSource(source) {
    if (!source || typeof source !== 'object') {
        return Object.freeze({
            available: false,
            width: 0,
            height: 0,
            kind: 'unavailable'
        });
    }
    const candidate = source;
    const width = finiteDimension(candidate.videoWidth ?? candidate.naturalWidth ?? candidate.width);
    const height = finiteDimension(candidate.videoHeight ?? candidate.naturalHeight ?? candidate.height);
    const kind = String(candidate.nodeName ?? candidate.constructor?.name ?? 'TexImageSource').toLowerCase();
    return Object.freeze({
        available: width > 0 && height > 0,
        width,
        height,
        kind
    });
}
export class SourceAwareWebglRenderPort {
    canvas;
    renderer;
    seedPhase;
    customTargets;
    profiler;
    renderCalls = 0;
    sourceUploads = 0;
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.renderer = new MinimalWebglRenderer(canvas);
        this.seedPhase = Number.isFinite(Number(options.seedPhase))
            ? Number(options.seedPhase)
            : 0;
        this.customTargets = Object.freeze([...(options.customTargets ?? [])]);
        this.profiler = options.profiler;
    }
    render(source, evaluation) {
        const descriptor = describeTexImageSource(source);
        if (!descriptor.available)
            throw new Error('RENDER_SOURCE_UNAVAILABLE');
        const targetBindings = resolveFormalTargetUniformBindings(evaluation.targets);
        if (targetBindings.length !== 21) {
            throw new Error('RENDER_TARGET_BINDING_COUNT_INVALID');
        }
        this.renderer.render(evaluation.targets, evaluation.clock, this.seedPhase, this.customTargets, this.profiler, source);
        this.renderCalls++;
        this.sourceUploads++;
        return Object.freeze({
            contract: 'xin.generator-source-render/1',
            version: SOURCE_AWARE_RENDER_PORT_VERSION,
            evaluationSerial: evaluation.evaluationSerial,
            frameIndex: evaluation.clock.frameIndex,
            targetBindingContract: FORMAL_TARGET_UNIFORM_CONTRACT,
            targetBindingCount: 21,
            targetBindings,
            ...descriptor
        });
    }
    reset() {
        this.renderer.resetFeedback();
    }
    dispose() {
        this.renderer.dispose();
    }
    profile() {
        return Object.freeze({
            renderCalls: this.renderCalls,
            gpuContextsCreated: 1,
            canvasTouches: this.sourceUploads,
            rafRequests: 0
        });
    }
}
export function createSourceAwareWebglRenderPort(canvas, options = {}) {
    return new SourceAwareWebglRenderPort(canvas, options);
}
//# sourceMappingURL=source-aware-render-port.js.map