import { MinimalWebglRenderer } from './minimal-webgl-renderer.js';
import { FORMAL_TARGET_UNIFORM_CONTRACT, resolveFormalTargetUniformBindings } from './formal-target-uniform-bindings.js';
import { RenderQualityController } from './render-quality-controller.js';
export const SOURCE_AWARE_RENDER_PORT_VERSION = '4.3.0-resilient-quality';
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
    renderer = null;
    rendererFactory;
    quality;
    seedPhase;
    customTargets;
    profiler;
    renderCalls = 0;
    sourceUploads = 0;
    contextState = 'ready';
    contextLosses = 0;
    contextRestores = 0;
    gpuContextsCreated = 0;
    contextError = null;
    disposed = false;
    onContextLost = (event) => {
        event.preventDefault();
        if (this.disposed)
            return;
        this.contextLosses++;
        this.contextState = 'lost';
        this.contextError = null;
        this.renderer = null;
    };
    onContextRestored = () => {
        if (this.disposed)
            return;
        this.contextRestores++;
        try {
            this.renderer = this.createRenderer();
            this.contextState = 'ready';
            this.contextError = null;
            this.quality.resetSchedule();
        }
        catch (error) {
            this.renderer = null;
            this.contextState = 'restore-failed';
            this.contextError = error instanceof Error ? error.message : String(error);
        }
    };
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.rendererFactory = options.rendererFactory ??
            (target => new MinimalWebglRenderer(target));
        this.quality = new RenderQualityController(options.qualityMode);
        this.seedPhase = Number.isFinite(Number(options.seedPhase))
            ? Number(options.seedPhase)
            : 0;
        this.customTargets = Object.freeze([...(options.customTargets ?? [])]);
        this.profiler = options.profiler;
        this.renderer = this.createRenderer();
        this.canvas.addEventListener?.('webglcontextlost', this.onContextLost);
        this.canvas.addEventListener?.('webglcontextrestored', this.onContextRestored);
    }
    setQualityMode(mode) {
        this.quality.setMode(mode);
    }
    render(source, evaluation) {
        const descriptor = describeTexImageSource(source);
        if (!descriptor.available)
            throw new Error('RENDER_SOURCE_UNAVAILABLE');
        const targetBindings = resolveFormalTargetUniformBindings(evaluation.targets);
        if (targetBindings.length !== 21) {
            throw new Error('RENDER_TARGET_BINDING_COUNT_INVALID');
        }
        const quality = this.quality.decide(evaluation.clock, this.contextState);
        if (quality.shouldRender && this.renderer) {
            this.renderer.render(evaluation.targets, evaluation.clock, this.seedPhase, this.customTargets, this.profiler, source, quality);
            this.renderCalls++;
            this.sourceUploads++;
        }
        return Object.freeze({
            contract: 'xin.generator-source-render/1',
            version: SOURCE_AWARE_RENDER_PORT_VERSION,
            evaluationSerial: evaluation.evaluationSerial,
            frameIndex: evaluation.clock.frameIndex,
            rendered: quality.shouldRender && this.renderer !== null,
            skipReason: quality.skipReason,
            quality,
            context: this.contextStatus(),
            targetBindingContract: FORMAL_TARGET_UNIFORM_CONTRACT,
            targetBindingCount: 21,
            targetBindings,
            ...descriptor
        });
    }
    reset() {
        this.renderer?.resetFeedback();
        this.quality.resetSchedule();
    }
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.canvas.removeEventListener?.('webglcontextlost', this.onContextLost);
        this.canvas.removeEventListener?.('webglcontextrestored', this.onContextRestored);
        this.renderer?.dispose();
        this.renderer = null;
    }
    status() {
        return Object.freeze({
            quality: this.quality.status(),
            context: this.contextStatus()
        });
    }
    profile() {
        return Object.freeze({
            renderCalls: this.renderCalls,
            gpuContextsCreated: this.gpuContextsCreated,
            canvasTouches: this.sourceUploads,
            rafRequests: 0
        });
    }
    createRenderer() {
        const renderer = this.rendererFactory(this.canvas);
        this.gpuContextsCreated++;
        return renderer;
    }
    contextStatus() {
        return Object.freeze({
            state: this.contextState,
            contextLosses: this.contextLosses,
            contextRestores: this.contextRestores,
            gpuContextsCreated: this.gpuContextsCreated,
            lastError: this.contextError
        });
    }
}
export function createSourceAwareWebglRenderPort(canvas, options = {}) {
    return new SourceAwareWebglRenderPort(canvas, options);
}
//# sourceMappingURL=source-aware-render-port.js.map