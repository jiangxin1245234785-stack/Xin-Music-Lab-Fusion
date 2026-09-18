import type { EngineClockFrame } from '../clock/index.js';
import { type ResolvedUnifiedMusicFrame, type UnifiedMusicFrame } from '../contracts/index.js';
import type { EventBudgetReport } from '../mapping/index.js';
import { TARGET_MIXER_STEPS, type EnergyBudgetDecision, type GateDecision } from '../mixer/index.js';
import { type SafetyStatus, type VisualTargetDefinition } from '../render/index.js';
import type { EventEnvelope, MappingCard, Preset, ResolvedPreset, ResolvedShaderPipelineConfig, ResolvedVisualTargetState } from '../schema/types.js';
import { type RuntimeSourceFrame } from './source-registry-adapter.js';
import { type VisualClockFrame } from './visual-clock.js';
import { type GeneratorTargetIntent } from './target-intent.js';
export declare const GENERATOR_RUNTIME_CONTRACT: "xin.glitch-runtime-frame/1";
export declare const GENERATOR_RUNTIME_VERSION: "3.5.0-visual-clock";
export declare const GENERATOR_PRESET_CONTROL_VERSION: "5.1.0-product-preset";
export interface GeneratorRuntimeProfile {
    readonly evaluateCalls: number;
    readonly renderAttempts: number;
    readonly renderCalls: number;
    readonly gpuContextsCreated: number;
    readonly canvasTouches: number;
    readonly rafRequests: number;
    readonly zeroGpu: boolean;
}
export interface RuntimeInputSummary {
    readonly contract: 'xin.music-frame/1';
    readonly contractVersion: number;
    readonly transport: ResolvedUnifiedMusicFrame['transport'];
    readonly availableFeatureCount: number;
    readonly activeEventCount: number;
    readonly presentLabelCount: number;
}
export type RuntimeSourceSummary = RuntimeSourceFrame;
export interface RuntimeMixerReport {
    readonly pipeline: typeof TARGET_MIXER_STEPS;
    readonly contributionCount: number;
    readonly gateDecisions: readonly GateDecision[];
    readonly energyBudget: EnergyBudgetDecision;
    readonly eventBudget: EventBudgetReport;
}
export interface RuntimeFrameReport {
    readonly contract: typeof GENERATOR_RUNTIME_CONTRACT;
    readonly runtimeVersion: typeof GENERATOR_RUNTIME_VERSION;
    readonly evaluationSerial: number;
    readonly clock: EngineClockFrame;
    readonly input: RuntimeInputSummary;
    readonly sources: RuntimeSourceSummary;
    readonly visualClock: VisualClockFrame;
    readonly nodeOutputCount: number;
    readonly targets: ResolvedVisualTargetState;
    readonly visualIntent: GeneratorTargetIntent;
    readonly mixer: RuntimeMixerReport;
    readonly safety: SafetyStatus;
    readonly profile: GeneratorRuntimeProfile;
    readonly resetReason: string;
}
export interface RuntimeRenderPort {
    render(source: unknown, evaluation: RuntimeFrameReport): unknown;
    reset?(reason: string): void;
    configurePresetShaderPipeline?(pipeline: ResolvedShaderPipelineConfig): unknown;
    dispose?(): void;
    profile?(): Partial<Pick<GeneratorRuntimeProfile, 'renderCalls' | 'gpuContextsCreated' | 'canvasTouches' | 'rafRequests'>>;
}
export interface GeneratorRuntimeOptions {
    readonly preset?: Preset;
    readonly sessionSeed?: number;
    readonly renderPort?: RuntimeRenderPort;
    readonly mappingExtension?: GeneratorMappingExtension;
}
export interface GeneratorMappingExtension {
    readonly targetDefinitions?: readonly VisualTargetDefinition[];
    readonly mappings?: readonly MappingCard[];
    readonly envelopes?: readonly EventEnvelope[];
}
export interface RuntimeRenderResult {
    readonly status: 'rendered' | 'unavailable';
    readonly output: unknown;
    readonly profile: GeneratorRuntimeProfile;
}
export declare class GeneratorRuntimeFacade {
    private preset;
    private readonly sessionSeed;
    private readonly renderPort;
    private readonly mappingExtension;
    private targetDefinitions;
    private runtimeMappings;
    private runtimeEnvelopes;
    private baseState;
    private readonly mixer;
    private readonly nodeGraph;
    private readonly visualClock;
    private safety;
    private random;
    private nodeRandom;
    private disposed;
    private evaluationSerial;
    private evaluateCalls;
    private renderAttempts;
    private resetCount;
    private presetRevision;
    private resetReason;
    private lastClock;
    private lastEpoch;
    private lastReport;
    constructor(options?: GeneratorRuntimeOptions);
    evaluate(frameInput: UnifiedMusicFrame, clockInput: EngineClockFrame): RuntimeFrameReport;
    render(source: unknown, evaluation: RuntimeFrameReport): RuntimeRenderResult;
    reset(reason?: string): void;
    setPreset(input: Preset, reason?: string): ResolvedPreset;
    getPreset(): ResolvedPreset;
    dispose(): void;
    getLastReport(): RuntimeFrameReport | null;
    profile(): GeneratorRuntimeProfile;
    status(): {
        readonly lifecycle: 'active' | 'disposed';
        readonly resetCount: number;
        readonly resetReason: string;
        readonly evaluationSerial: number;
        readonly lastClock: EngineClockFrame | null;
        readonly lastEpoch: number | null;
        readonly preset: {
            readonly contract: typeof GENERATOR_PRESET_CONTROL_VERSION;
            readonly id: string;
            readonly name: string;
            readonly schemaVersion: number;
            readonly revision: number;
        };
        readonly profile: GeneratorRuntimeProfile;
    };
    private resetCore;
    private assertActive;
}
export declare function createGeneratorRuntime(options?: GeneratorRuntimeOptions): GeneratorRuntimeFacade;
//# sourceMappingURL=runtime-facade.d.ts.map