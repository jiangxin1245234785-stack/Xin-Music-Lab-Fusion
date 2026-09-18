import type { EngineClockFrame } from '../clock/index.js';
import {
  buildUnifiedMusicFrame,
  type ResolvedUnifiedMusicFrame,
  type UnifiedMusicFrame
} from '../contracts/index.js';
import type {
  EventBudgetReport,
  MappingSourceValues
} from '../mapping/index.js';
import {
  TargetMixer,
  TARGET_MIXER_STEPS,
  type EnergyBudgetDecision,
  type GateDecision
} from '../mixer/index.js';
import {
  NodeGraphRuntime,
  mergeNodeOutputSources
} from '../nodegraph/index.js';
import { loadValidatedPreset } from '../preset/index.js';
import {
  createSeededPrng,
  type SeededPrng
} from '../random/index.js';
import {
  GLSLUniformTargetRegistry,
  PhysicalSafetyLimiter,
  createDefaultVisualValues,
  VISUAL_TARGET_REGISTRY,
  type SafetyStatus,
  type VisualTargetDefinition
} from '../render/index.js';
import { PRESET_DEFAULTS } from '../schema/defaults.js';
import type {
  EventEnvelope,
  MappingCard,
  Preset,
  ResolvedPreset,
  ResolvedShaderPipelineConfig,
  ResolvedVisualTargetState
} from '../schema/types.js';
import {
  adaptUnifiedMusicFrameToSources,
  type RuntimeSourceFrame
} from './source-registry-adapter.js';
import { mergeGeneratorControlSources } from './control-source-registry.js';
import {
  VisualClockRuntime,
  type VisualClockFrame
} from './visual-clock.js';
import {
  describeGeneratorTargetIntent,
  type GeneratorTargetIntent
} from './target-intent.js';

export const GENERATOR_RUNTIME_CONTRACT =
  'xin.glitch-runtime-frame/1' as const;
export const GENERATOR_RUNTIME_VERSION =
  '3.5.0-visual-clock' as const;
export const GENERATOR_PRESET_CONTROL_VERSION =
  '5.1.0-product-preset' as const;

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
  configurePresetShaderPipeline?(
    pipeline: ResolvedShaderPipelineConfig
  ): unknown;
  dispose?(): void;
  profile?(): Partial<
    Pick<
      GeneratorRuntimeProfile,
      | 'renderCalls'
      | 'gpuContextsCreated'
      | 'canvasTouches'
      | 'rafRequests'
    >
  >;
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

function freezeCopy<T>(input: T): T {
  if (Array.isArray(input)) {
    return Object.freeze(input.map(freezeCopy)) as T;
  }
  if (input && typeof input === 'object') {
    return Object.freeze(Object.fromEntries(
      Object.entries(input).map(([key, value]) => [
        key,
        freezeCopy(value)
      ])
    )) as T;
  }
  return input;
}

function resolveClock(input: EngineClockFrame): EngineClockFrame {
  const frameIndex = Number(input?.frameIndex);
  const nowMs = Number(input?.nowMs);
  const deltaMs = Number(input?.deltaMs);
  if (
    !Number.isInteger(frameIndex) ||
    frameIndex < 0 ||
    !Number.isFinite(nowMs) ||
    nowMs < 0 ||
    !Number.isFinite(deltaMs) ||
    deltaMs < 0
  ) {
    throw new Error('RUNTIME_CLOCK_INVALID');
  }
  return Object.freeze({ frameIndex, nowMs, deltaMs });
}

function assertSameClock(
  frame: ResolvedUnifiedMusicFrame,
  clock: EngineClockFrame
): void {
  if (
    frame.clock.frameIndex !== clock.frameIndex ||
    frame.clock.nowMs !== clock.nowMs ||
    frame.clock.deltaMs !== clock.deltaMs
  ) {
    throw new Error('RUNTIME_CLOCK_MISMATCH');
  }
}

function inputSummary(
  frame: ResolvedUnifiedMusicFrame
): RuntimeInputSummary {
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

function runtimeTargetDefinitions(
  preset: ResolvedPreset,
  extensions: readonly VisualTargetDefinition[] = []
): readonly VisualTargetDefinition[] {
  const custom = new GLSLUniformTargetRegistry();
  custom.replaceAll(preset.shaderPipeline.uniformRegistry);
  return Object.freeze([
    ...VISUAL_TARGET_REGISTRY,
    ...custom.targetDefinitions(),
    ...extensions
  ]);
}

function normalizeMappingExtension(
  input: GeneratorMappingExtension | undefined
): Required<GeneratorMappingExtension> {
  const targetDefinitions = freezeCopy([
    ...(input?.targetDefinitions ?? [])
  ]);
  const mappings = freezeCopy([...(input?.mappings ?? [])]);
  const envelopes = freezeCopy([...(input?.envelopes ?? [])]);
  const reservedTargetIds = new Set(
    VISUAL_TARGET_REGISTRY.map(definition => definition.id)
  );
  const extensionTargetIds = new Set<string>();
  for (const definition of targetDefinitions) {
    if (
      !definition ||
      typeof definition.id !== 'string' ||
      !definition.id.startsWith('material.')
    ) {
      throw new Error('RUNTIME_MAPPING_EXTENSION_TARGET_NAMESPACE_INVALID');
    }
    if (
      definition.module !== 'Material' ||
      definition.ownerLayer !== 'material'
    ) {
      throw new Error('RUNTIME_MAPPING_EXTENSION_TARGET_OWNERSHIP_INVALID');
    }
    if (
      reservedTargetIds.has(definition.id) ||
      extensionTargetIds.has(definition.id)
    ) {
      throw new Error('RUNTIME_MAPPING_EXTENSION_TARGET_DUPLICATE');
    }
    if (
      !Number.isFinite(definition.defaultValue) ||
      !Number.isFinite(definition.min) ||
      !Number.isFinite(definition.max) ||
      definition.min > definition.max ||
      definition.defaultValue < definition.min ||
      definition.defaultValue > definition.max
    ) {
      throw new Error('RUNTIME_MAPPING_EXTENSION_TARGET_RANGE_INVALID');
    }
    extensionTargetIds.add(definition.id);
  }
  const mappingIds = new Set<string>();
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
  private preset: ResolvedPreset;
  private readonly sessionSeed: number;
  private readonly renderPort: RuntimeRenderPort | undefined;
  private readonly mappingExtension: Required<GeneratorMappingExtension>;
  private targetDefinitions: readonly VisualTargetDefinition[];
  private runtimeMappings: readonly MappingCard[];
  private runtimeEnvelopes: readonly EventEnvelope[];
  private baseState: ResolvedVisualTargetState;
  private readonly mixer = new TargetMixer();
  private readonly nodeGraph = new NodeGraphRuntime();
  private readonly visualClock = new VisualClockRuntime();
  private safety: PhysicalSafetyLimiter;
  private random: SeededPrng;
  private nodeRandom: SeededPrng;
  private disposed = false;
  private evaluationSerial = 0;
  private evaluateCalls = 0;
  private renderAttempts = 0;
  private resetCount = 0;
  private presetRevision = 0;
  private resetReason = 'initial';
  private lastClock: EngineClockFrame | null = null;
  private lastEpoch: number | null = null;
  private lastReport: RuntimeFrameReport | null = null;

  constructor(options: GeneratorRuntimeOptions = {}) {
    this.preset = loadValidatedPreset(
      options.preset ?? PRESET_DEFAULTS
    );
    this.sessionSeed = Number.isFinite(Number(options.sessionSeed))
      ? Number(options.sessionSeed)
      : 0;
    this.renderPort = options.renderPort;
    this.mappingExtension = normalizeMappingExtension(
      options.mappingExtension
    );
    this.targetDefinitions = runtimeTargetDefinitions(
      this.preset,
      this.mappingExtension.targetDefinitions
    );
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
    this.random = createSeededPrng(
      this.preset.seed,
      this.sessionSeed
    );
    this.nodeRandom = createSeededPrng(
      this.preset.seed ^ 0x4e4f4445,
      this.sessionSeed
    );
    this.renderPort?.configurePresetShaderPipeline?.(this.preset.shaderPipeline);
    this.resetCore('initial', false);
  }

  evaluate(
    frameInput: UnifiedMusicFrame,
    clockInput: EngineClockFrame
  ): RuntimeFrameReport {
    this.assertActive();
    const clock = resolveClock(clockInput);
    const frame = buildUnifiedMusicFrame(frameInput);
    assertSameClock(frame, clock);

    if (
      this.lastEpoch !== null &&
      frame.transport.epoch !== this.lastEpoch
    ) {
      this.resetCore('transport-epoch', true);
    }
    if (
      this.lastClock &&
      clock.nowMs < this.lastClock.nowMs
    ) {
      throw new Error('RUNTIME_CLOCK_REWIND_REQUIRES_RESET');
    }

    const sources = adaptUnifiedMusicFrameToSources(frame);
    const visualClock = this.visualClock.evaluate(
      frame,
      this.preset.visualClock
    );
    const primarySources: MappingSourceValues =
      mergeGeneratorControlSources(sources.values, visualClock);
    const nodeFrame = this.nodeGraph.evaluate(
      this.preset.nodeGraph,
      primarySources,
      clock,
      () => this.nodeRandom.nextFloat()
    );
    const mixed = this.mixer.mixFrame({
      mappings: this.runtimeMappings,
      envelopes: this.runtimeEnvelopes,
      sourceValues: mergeNodeOutputSources(
        primarySources,
        nodeFrame
      ),
      baseState: this.baseState,
      clock,
      randomFloat: () => this.random.nextFloat(),
      energyBudget: this.preset.energyBudget,
      targetDefinitions: this.targetDefinitions
    });
    const targets = this.safety.apply(
      mixed.targets,
      clock,
      this.targetDefinitions
    );

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
    return this.getLastReport()!;
  }

  render(
    source: unknown,
    evaluation: RuntimeFrameReport
  ): RuntimeRenderResult {
    this.assertActive();
    if (
      evaluation.contract !== GENERATOR_RUNTIME_CONTRACT ||
      evaluation.runtimeVersion !== GENERATOR_RUNTIME_VERSION
    ) {
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

  reset(reason = 'manual'): void {
    this.assertActive();
    this.resetCore(reason, true);
  }

  setPreset(
    input: Preset,
    reason = 'preset-change'
  ): ResolvedPreset {
    this.assertActive();
    const nextPreset = loadValidatedPreset(input);
    const nextTargetDefinitions = runtimeTargetDefinitions(
      nextPreset,
      this.mappingExtension.targetDefinitions
    );
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

  getPreset(): ResolvedPreset {
    this.assertActive();
    return freezeCopy(this.preset);
  }

  dispose(): void {
    if (this.disposed) return;
    this.renderPort?.dispose?.();
    this.disposed = true;
    this.lastClock = null;
    this.lastEpoch = null;
    this.lastReport = null;
  }

  getLastReport(): RuntimeFrameReport | null {
    return this.lastReport ? freezeCopy(this.lastReport) : null;
  }

  profile(): GeneratorRuntimeProfile {
    const render = this.renderPort?.profile?.() ?? {};
    const renderCalls = Math.max(
      0,
      Number(render.renderCalls) || 0
    );
    const gpuContextsCreated = Math.max(
      0,
      Number(render.gpuContextsCreated) || 0
    );
    const canvasTouches = Math.max(
      0,
      Number(render.canvasTouches) || 0
    );
    const rafRequests = Math.max(
      0,
      Number(render.rafRequests) || 0
    );
    return Object.freeze({
      evaluateCalls: this.evaluateCalls,
      renderAttempts: this.renderAttempts,
      renderCalls,
      gpuContextsCreated,
      canvasTouches,
      rafRequests,
      zeroGpu:
        renderCalls === 0 &&
        gpuContextsCreated === 0 &&
        canvasTouches === 0 &&
        rafRequests === 0
    });
  }

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
  } {
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

  private resetCore(
    reason: string,
    count: boolean,
    resetRenderPort = true
  ): void {
    this.mixer.reset();
    this.nodeGraph.reset();
    this.visualClock.reset(reason);
    this.safety.reset();
    this.random = createSeededPrng(
      this.preset.seed,
      this.sessionSeed
    );
    this.nodeRandom = createSeededPrng(
      this.preset.seed ^ 0x4e4f4445,
      this.sessionSeed
    );
    this.evaluationSerial = 0;
    this.lastClock = null;
    this.lastEpoch = null;
    this.lastReport = null;
    this.resetReason = String(reason || 'manual');
    if (count) this.resetCount++;
    if (resetRenderPort) this.renderPort?.reset?.(this.resetReason);
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('RUNTIME_DISPOSED');
  }
}

export function createGeneratorRuntime(
  options: GeneratorRuntimeOptions = {}
): GeneratorRuntimeFacade {
  return new GeneratorRuntimeFacade(options);
}
