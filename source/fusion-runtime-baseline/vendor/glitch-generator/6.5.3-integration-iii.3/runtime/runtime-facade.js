import { buildUnifiedMusicFrame } from '../contracts/index.js';
import { TargetMixer, TARGET_MIXER_STEPS } from '../mixer/index.js';
import { NodeGraphRuntime, mergeNodeOutputSources } from '../nodegraph/index.js';
import { loadValidatedPreset } from '../preset/index.js';
import { createSeededPrng } from '../random/index.js';
import { GLSLUniformTargetRegistry, PhysicalSafetyLimiter, VISUAL_TARGET_REGISTRY } from '../render/index.js';
import { PRESET_DEFAULTS } from '../schema/defaults.js';
import { adaptUnifiedMusicFrameToSources } from './source-registry-adapter.js';
export const GENERATOR_RUNTIME_CONTRACT = 'xin.glitch-runtime-frame/1';
export const GENERATOR_RUNTIME_VERSION = '3.3.0-shadow';
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
function runtimeTargetDefinitions(preset) {
    const custom = new GLSLUniformTargetRegistry();
    custom.replaceAll(preset.shaderPipeline.uniformRegistry);
    return Object.freeze([
        ...VISUAL_TARGET_REGISTRY,
        ...custom.targetDefinitions()
    ]);
}
export class GeneratorRuntimeFacade {
    preset;
    sessionSeed;
    renderPort;
    targetDefinitions;
    mixer = new TargetMixer();
    nodeGraph = new NodeGraphRuntime();
    safety;
    random;
    nodeRandom;
    disposed = false;
    evaluationSerial = 0;
    evaluateCalls = 0;
    renderAttempts = 0;
    resetCount = 0;
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
        this.targetDefinitions = runtimeTargetDefinitions(this.preset);
        this.safety = new PhysicalSafetyLimiter(this.preset.safety);
        this.random = createSeededPrng(this.preset.seed, this.sessionSeed);
        this.nodeRandom = createSeededPrng(this.preset.seed ^ 0x4e4f4445, this.sessionSeed);
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
        const primarySources = sources.values;
        const nodeFrame = this.nodeGraph.evaluate(this.preset.nodeGraph, primarySources, clock, () => this.nodeRandom.nextFloat());
        const mixed = this.mixer.mixFrame({
            mappings: this.preset.mappings,
            envelopes: this.preset.envelopes,
            sourceValues: mergeNodeOutputSources(primarySources, nodeFrame),
            baseState: this.preset.targetDefaults,
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
            nodeOutputCount: Object.keys(nodeFrame.outputs).length,
            targets,
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
            profile: this.profile()
        });
    }
    resetCore(reason, count) {
        this.mixer.reset();
        this.nodeGraph.reset();
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