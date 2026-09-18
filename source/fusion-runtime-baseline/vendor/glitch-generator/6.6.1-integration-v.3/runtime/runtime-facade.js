import { buildUnifiedMusicFrame } from '../contracts/index.js';
import { TargetMixer, TARGET_MIXER_STEPS } from '../mixer/index.js';
import { NodeGraphRuntime, mergeNodeOutputSources } from '../nodegraph/index.js';
import { loadValidatedPreset } from '../preset/index.js';
import { createSeededPrng } from '../random/index.js';
import { GLSLUniformTargetRegistry, PhysicalSafetyLimiter, createDefaultVisualValues, VISUAL_TARGET_REGISTRY } from '../render/index.js';
import { PRESET_DEFAULTS } from '../schema/defaults.js';
import { adaptUnifiedMusicFrameToSources } from './source-registry-adapter.js';
import { mergeGeneratorControlSources } from './control-source-registry.js';
import { VisualClockRuntime } from './visual-clock.js';
import { describeGeneratorTargetIntent } from './target-intent.js';
export const GENERATOR_RUNTIME_CONTRACT = 'xin.glitch-runtime-frame/1';
export const GENERATOR_RUNTIME_VERSION = '3.5.0-visual-clock';
export const GENERATOR_PRESET_CONTROL_VERSION = '5.1.0-product-preset';
function freezeCopy(input) {
    if (Array.isArray(input)) {
        return Object.freeze(input.map(freezeCopy));
    }
    if (input && typeof input === 'object') {
        return Object.freeze(Object.fromEntries(Object.entries(input).map(([key, value]) => [
            key,
            freezeCopy(value)
        ])));
    }
    return input;
}
function resolveClock(input) {
    const frameIndex = Number(input?.frameIndex);
    const nowMs = Number(input?.nowMs);
    const deltaMs = Number(input?.deltaMs);
    if (!Number.isInteger(frameIndex) ||
        frameIndex < 0 ||
        !Number.isFinite(nowMs) ||
        nowMs < 0 ||
        !Number.isFinite(deltaMs) ||
        deltaMs < 0) {
        throw new Error('RUNTIME_CLOCK_INVALID');
    }
    return Object.freeze({ frameIndex, nowMs, deltaMs });
}
function assertSameClock(frame, clock) {
    if (frame.clock.frameIndex !== clock.frameIndex ||
        frame.clock.nowMs !== clock.nowMs ||
        frame.clock.deltaMs !== clock.deltaMs) {
        throw new Error('RUNTIME_CLOCK_MISMATCH');
    }
}
function inputSummary(frame) {
    return {
        contract: frame.contract,
        contractVersion: frame.contractVersion,
        transport: { ...frame.transport },
        availableFeatureCount: Object.values(frame.meta)
            .filter(meta => meta.available).length,
        activeEventCount: Object.values(frame.events)
            .filter(event => event !== null).length,
        presentLabelCount: Object.values(frame.labels)
            .filter(label => label !== null).length
    };
}
function runtimeTargetDefinitions(preset, extensions = []) {
    const custom = new GLSLUniformTargetRegistry();
    custom.replaceAll(preset.shaderPipeline.uniformRegistry);
    return Object.freeze([
        ...VISUAL_TARGET_REGISTRY,
        ...custom.targetDefinitions(),
        ...extensions
    ]);
}
function normalizeMappingExtension(input) {
    const targetDefinitions = freezeCopy([
        ...(input?.targetDefinitions ?? [])
    ]);
    const mappings = freezeCopy([...(input?.mappings ?? [])]);
    const envelopes = freezeCopy([...(input?.envelopes ?? [])]);
    const reservedTargetIds = new Set(VISUAL_TARGET_REGISTRY.map(definition => definition.id));
    const extensionTargetIds = new Set();
    for (const definition of targetDefinitions) {
        if (!definition ||
            typeof definition.id !== 'string' ||
            !definition.id.startsWith('material.')) {
            throw new Error('RUNTIME_MAPPING_EXTENSION_TARGET_NAMESPACE_INVALID');
        }
        if (definition.module !== 'Material' ||
            definition.ownerLayer !== 'material') {
            throw new Error('RUNTIME_MAPPING_EXTENSION_TARGET_OWNERSHIP_INVALID');
        }
        if (reservedTargetIds.has(definition.id) ||
            extensionTargetIds.has(definition.id)) {
            throw new Error('RUNTIME_MAPPING_EXTENSION_TARGET_DUPLICATE');
        }
        if (!Number.isFinite(definition.defaultValue) ||
            !Number.isFinite(definition.min) ||
            !Number.isFinite(definition.max) ||
            definition.min > definition.max ||
            definition.defaultValue < definition.min ||
            definition.defaultValue > definition.max) {
            throw new Error('RUNTIME_MAPPING_EXTENSION_TARGET_RANGE_INVALID');
        }
        extensionTargetIds.add(definition.id);
    }
    const mappingIds = new Set();
    for (const mapping of mappings) {
        const id = String(mapping?.id || '');
        const sourceId = String(mapping?.sourceId || '');
        const targetId = String(mapping?.targetId || '');
        if (!id || !sourceId || !extensionTargetIds.has(targetId)) {
            throw new Error('RUNTIME_MAPPING_EXTENSION_MAPPING_INVALID');
        }
        if (mappingIds.has(id)) {
            throw new Error('RUNTIME_MAPPING_EXTENSION_MAPPING_DUPLICATE');
        }
        mappingIds.add(id);
    }
    return Object.freeze({
        targetDefinitions,
        mappings,
        envelopes
    });
}
export class GeneratorRuntimeFacade {
    preset;
    sessionSeed;
    renderPort;
    mappingExtension;
    targetDefinitions;
    runtimeMappings;
    runtimeEnvelopes;
    baseState;
    mixer = new TargetMixer();
    nodeGraph = new NodeGraphRuntime();
    visualClock = new VisualClockRuntime();
    safety;
    random;
    nodeRandom;
    disposed = false;
    evaluationSerial = 0;
    evaluateCalls = 0;
    renderAttempts = 0;
    resetCount = 0;
    presetRevision = 0;
    resetReason = 'initial';
    lastClock = null;
    lastEpoch = null;
    lastReport = null;
    constructor(options = {}) {
        this.preset = loadValidatedPreset(options.preset ?? PRESET_DEFAULTS);
        this.sessionSeed = Number.isFinite(Number(options.sessionSeed))
            ? Number(options.sessionSeed)
            : 0;
        this.renderPort = options.renderPort;
        this.mappingExtension = normalizeMappingExtension(options.mappingExtension);
        this.targetDefinitions = runtimeTargetDefinitions(this.preset, this.mappingExtension.targetDefinitions);
        this.runtimeMappings = Object.freeze([
            ...this.preset.mappings,
            ...this.mappingExtension.mappings
        ]);
        this.runtimeEnvelopes = Object.freeze([
            ...this.preset.envelopes,
            ...this.mappingExtension.envelopes
        ]);
        this.baseState = Object.freeze({
            ...this.preset.targetDefaults,
            values: Object.freeze({
                ...createDefaultVisualValues(),
                ...this.preset.targetDefaults.values
            })
        });
        this.safety = new PhysicalSafetyLimiter(this.preset.safety);
        this.random = createSeededPrng(this.preset.seed, this.sessionSeed);
        this.nodeRandom = createSeededPrng(this.preset.seed ^ 0x4e4f4445, this.sessionSeed);
        this.renderPort?.configurePresetShaderPipeline?.(this.preset.shaderPipeline);
        this.resetCore('initial', false);
    }
    evaluate(frameInput, clockInput) {
        this.assertActive();
        const clock = resolveClock(clockInput);
        const frame = buildUnifiedMusicFrame(frameInput);
        assertSameClock(frame, clock);
        if (this.lastEpoch !== null &&
            frame.transport.epoch !== this.lastEpoch) {
            this.resetCore('transport-epoch', true);
        }
        if (this.lastClock &&
            clock.nowMs < this.lastClock.nowMs) {
            throw new Error('RUNTIME_CLOCK_REWIND_REQUIRES_RESET');
        }
        const sources = adaptUnifiedMusicFrameToSources(frame);
        const visualClock = this.visualClock.evaluate(frame, this.preset.visualClock);
        const primarySources = mergeGeneratorControlSources(sources.values, visualClock);
        const nodeFrame = this.nodeGraph.evaluate(this.preset.nodeGraph, primarySources, clock, () => this.nodeRandom.nextFloat());
        const mixed = this.mixer.mixFrame({
            mappings: this.runtimeMappings,
            envelopes: this.runtimeEnvelopes,
            sourceValues: mergeNodeOutputSources(primarySources, nodeFrame),
            baseState: this.baseState,
            clock,
            randomFloat: () => this.random.nextFloat(),
            energyBudget: this.preset.energyBudget,
            targetDefinitions: this.targetDefinitions
        });
        const targets = this.safety.apply(mixed.targets, clock, this.targetDefinitions);
        this.evaluationSerial++;
        this.evaluateCalls++;
        this.lastClock = clock;
        this.lastEpoch = frame.transport.epoch;
        this.lastReport = freezeCopy({
            contract: GENERATOR_RUNTIME_CONTRACT,
            runtimeVersion: GENERATOR_RUNTIME_VERSION,
            evaluationSerial: this.evaluationSerial,
            clock,
            input: inputSummary(frame),
            sources,
            visualClock,
            nodeOutputCount: Object.keys(nodeFrame.outputs).length,
            targets,
            visualIntent: describeGeneratorTargetIntent(targets),
            mixer: {
                pipeline: TARGET_MIXER_STEPS,
                contributionCount: mixed.contributions.length,
                gateDecisions: mixed.gateDecisions,
                energyBudget: mixed.energyBudgetDecision,
                eventBudget: mixed.eventBudgetReport
            },
            safety: this.safety.getLastReport(),
            profile: this.profile(),
            resetReason: this.resetReason
        });
        return this.getLastReport();
    }
    render(source, evaluation) {
        this.assertActive();
        if (evaluation.contract !== GENERATOR_RUNTIME_CONTRACT ||
            evaluation.runtimeVersion !== GENERATOR_RUNTIME_VERSION) {
            throw new Error('RUNTIME_EVALUATION_INCOMPATIBLE');
        }
        this.renderAttempts++;
        if (!this.renderPort) {
            return freezeCopy({
                status: 'unavailable',
                output: null,
                profile: this.profile()
            });
        }
        const output = this.renderPort.render(source, evaluation);
        return freezeCopy({
            status: 'rendered',
            output,
            profile: this.profile()
        });
    }
    reset(reason = 'manual') {
        this.assertActive();
        this.resetCore(reason, true);
    }
    setPreset(input, reason = 'preset-change') {
        this.assertActive();
        const nextPreset = loadValidatedPreset(input);
        const nextTargetDefinitions = runtimeTargetDefinitions(nextPreset, this.mappingExtension.targetDefinitions);
        const nextRuntimeMappings = Object.freeze([
            ...nextPreset.mappings,
            ...this.mappingExtension.mappings
        ]);
        const nextRuntimeEnvelopes = Object.freeze([
            ...nextPreset.envelopes,
            ...this.mappingExtension.envelopes
        ]);
        const nextBaseState = Object.freeze({
            ...nextPreset.targetDefaults,
            values: Object.freeze({
                ...createDefaultVisualValues(),
                ...nextPreset.targetDefaults.values
            })
        });
        const nextSafety = new PhysicalSafetyLimiter(nextPreset.safety);
        // Validation and all CPU-side construction complete before any live
        // runtime field changes. A render-port reset failure therefore leaves the
        // current preset fully intact.
        this.renderPort?.configurePresetShaderPipeline?.(nextPreset.shaderPipeline);
        this.renderPort?.reset?.(String(reason || 'preset-change'));
        this.preset = nextPreset;
        this.targetDefinitions = nextTargetDefinitions;
        this.runtimeMappings = nextRuntimeMappings;
        this.runtimeEnvelopes = nextRuntimeEnvelopes;
        this.baseState = nextBaseState;
        this.safety = nextSafety;
        this.presetRevision++;
        this.resetCore(reason, true, false);
        return freezeCopy(this.preset);
    }
    getPreset() {
        this.assertActive();
        return freezeCopy(this.preset);
    }
    dispose() {
        if (this.disposed)
            return;
        this.renderPort?.dispose?.();
        this.disposed = true;
        this.lastClock = null;
        this.lastEpoch = null;
        this.lastReport = null;
    }
    getLastReport() {
        return this.lastReport ? freezeCopy(this.lastReport) : null;
    }
    profile() {
        const render = this.renderPort?.profile?.() ?? {};
        const renderCalls = Math.max(0, Number(render.renderCalls) || 0);
        const gpuContextsCreated = Math.max(0, Number(render.gpuContextsCreated) || 0);
        const canvasTouches = Math.max(0, Number(render.canvasTouches) || 0);
        const rafRequests = Math.max(0, Number(render.rafRequests) || 0);
        return Object.freeze({
            evaluateCalls: this.evaluateCalls,
            renderAttempts: this.renderAttempts,
            renderCalls,
            gpuContextsCreated,
            canvasTouches,
            rafRequests,
            zeroGpu: renderCalls === 0 &&
                gpuContextsCreated === 0 &&
                canvasTouches === 0 &&
                rafRequests === 0
        });
    }
    status() {
        return freezeCopy({
            lifecycle: this.disposed ? 'disposed' : 'active',
            resetCount: this.resetCount,
            resetReason: this.resetReason,
            evaluationSerial: this.evaluationSerial,
            lastClock: this.lastClock,
            lastEpoch: this.lastEpoch,
            preset: {
                contract: GENERATOR_PRESET_CONTROL_VERSION,
                id: this.preset.id,
                name: this.preset.name,
                schemaVersion: this.preset.schemaVersion,
                revision: this.presetRevision
            },
            profile: this.profile()
        });
    }
    resetCore(reason, count, resetRenderPort = true) {
        this.mixer.reset();
        this.nodeGraph.reset();
        this.visualClock.reset(reason);
        this.safety.reset();
        this.random = createSeededPrng(this.preset.seed, this.sessionSeed);
        this.nodeRandom = createSeededPrng(this.preset.seed ^ 0x4e4f4445, this.sessionSeed);
        this.evaluationSerial = 0;
        this.lastClock = null;
        this.lastEpoch = null;
        this.lastReport = null;
        this.resetReason = String(reason || 'manual');
        if (count)
            this.resetCount++;
        if (resetRenderPort)
            this.renderPort?.reset?.(this.resetReason);
    }
    assertActive() {
        if (this.disposed)
            throw new Error('RUNTIME_DISPOSED');
    }
}
export function createGeneratorRuntime(options = {}) {
    return new GeneratorRuntimeFacade(options);
}
//# sourceMappingURL=runtime-facade.js.map