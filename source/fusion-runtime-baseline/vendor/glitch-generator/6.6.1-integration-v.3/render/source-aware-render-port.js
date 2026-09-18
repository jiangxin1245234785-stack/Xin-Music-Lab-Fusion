import { GLSLUniformTargetRegistry } from './glsl-uniform-target-registry.js';
import { MinimalWebglRenderer, PASSTHROUGH_FRAGMENT_SHADER } from './minimal-webgl-renderer.js';
import { FORMAL_TARGET_UNIFORM_CONTRACT, resolveFormalTargetUniformBindings } from './formal-target-uniform-bindings.js';
import { RenderQualityController } from './render-quality-controller.js';
export const SOURCE_AWARE_RENDER_PORT_VERSION = '4.3.0-resilient-quality';
export const MATERIAL_FIELD_INPUT_CONTRACT = 'xin.generator-material-fields/1';
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
function resolveSourcePayload(input) {
    const payload = input && typeof input === 'object'
        ? input
        : null;
    const source = payload && 'source' in payload
        ? payload.source
        : input;
    const fields = payload?.materialFields &&
        typeof payload.materialFields === 'object'
        ? payload.materialFields
        : {};
    const densityRecord = fields.density &&
        typeof fields.density === 'object'
        ? fields.density
        : null;
    const ageRecord = fields.age && typeof fields.age === 'object'
        ? fields.age
        : null;
    const density = densityRecord && 'source' in densityRecord
        ? densityRecord.source
        : null;
    const age = ageRecord && 'source' in ageRecord
        ? ageRecord.source
        : null;
    return Object.freeze({
        source,
        descriptor: describeTexImageSource(source),
        materialFields: Object.freeze({
            density: describeTexImageSource(density).available
                ? density
                : null,
            age: describeTexImageSource(age).available
                ? age
                : null
        }),
        materialFieldDescriptors: Object.freeze({
            density: describeTexImageSource(density),
            age: describeTexImageSource(age)
        })
    });
}
export class SourceAwareWebglRenderPort {
    canvas;
    renderer = null;
    rendererFactory;
    quality;
    seedPhase;
    customTargets;
    shaderPipeline = null;
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
    configurePresetShaderPipeline(input = {}) {
        const registry = new GLSLUniformTargetRegistry();
        registry.replaceAll(input.uniformRegistry ?? []);
        const nextPipeline = Object.freeze({
            passOrder: Object.freeze([
                ...(input.passOrder ?? ['builtin-feedback', 'custom-glsl'])
            ]),
            customPass: Object.freeze({
                enabled: Boolean(input.customPass?.enabled),
                label: String(input.customPass?.label || 'Preset custom GLSL pass'),
                source: String(input.customPass?.source || PASSTHROUGH_FRAGMENT_SHADER)
            })
        });
        if (this.renderer)
            this.applyShaderPipeline(this.renderer, nextPipeline);
        this.customTargets = registry.targetDefinitions();
        this.shaderPipeline = nextPipeline;
        return Object.freeze({
            enabled: nextPipeline.customPass.enabled,
            label: nextPipeline.customPass.label,
            customTargetCount: this.customTargets.length,
            passOrder: nextPipeline.passOrder
        });
    }
    render(source, evaluation) {
        const payload = resolveSourcePayload(source);
        const descriptor = payload.descriptor;
        if (!descriptor.available)
            throw new Error('RENDER_SOURCE_UNAVAILABLE');
        const targetBindings = resolveFormalTargetUniformBindings(evaluation.targets);
        if (targetBindings.length !== 21) {
            throw new Error('RENDER_TARGET_BINDING_COUNT_INVALID');
        }
        const quality = this.quality.decide(evaluation.clock, this.contextState);
        if (quality.shouldRender && this.renderer) {
            this.renderer.render(evaluation.targets, evaluation.clock, this.seedPhase, this.customTargets, this.profiler, payload.source, quality, payload.materialFields);
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
            materialFields: Object.freeze({
                contract: MATERIAL_FIELD_INPUT_CONTRACT,
                availableIds: Object.freeze(['density', 'age'].filter(id => payload.materialFieldDescriptors[id].available)),
                ...payload.materialFieldDescriptors
            }),
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
        if (this.shaderPipeline) {
            this.applyShaderPipeline(renderer, this.shaderPipeline);
        }
        this.gpuContextsCreated++;
        return renderer;
    }
    applyShaderPipeline(renderer, pipeline) {
        const staged = renderer.stageFragmentPass(pipeline.customPass.source, pipeline.customPass.label);
        if (!staged.applied) {
            throw new Error(`RENDER_PRESET_SHADER_COMPILE_FAILED: ${staged.log || 'Unknown shader error'}`);
        }
        renderer.setPassOrder(pipeline.passOrder);
        renderer.setCustomPassEnabled(pipeline.customPass.enabled);
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