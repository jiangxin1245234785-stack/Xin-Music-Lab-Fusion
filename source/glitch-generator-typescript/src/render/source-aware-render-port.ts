import type { PerformanceMeasureSink } from '../performance/index.js';
import type {
  RuntimeFrameReport,
  RuntimeRenderPort
} from '../runtime/runtime-facade.js';
import type { ShaderPipelineConfig } from '../schema/types.js';
import {
  GLSLUniformTargetRegistry,
  type GlslUniformTargetDefinition
} from './glsl-uniform-target-registry.js';
import {
  MinimalWebglRenderer,
  PASSTHROUGH_FRAGMENT_SHADER,
  type MaterialFieldSources
} from './minimal-webgl-renderer.js';
import type { ShaderPassStageResult } from './staged-shader-pass.js';
import {
  FORMAL_TARGET_UNIFORM_CONTRACT,
  resolveFormalTargetUniformBindings,
  type ResolvedFormalTargetUniformBinding
} from './formal-target-uniform-bindings.js';
import {
  RenderQualityController,
  type RenderQualityDecision,
  type RenderQualityMode,
  type RenderResolutionBudget,
  type RenderSkipReason
} from './render-quality-controller.js';

export const SOURCE_AWARE_RENDER_PORT_VERSION =
  '4.3.0-resilient-quality' as const;
export const MATERIAL_FIELD_INPUT_CONTRACT =
  'xin.generator-material-fields/1' as const;

export interface SourceDescriptor {
  readonly available: boolean;
  readonly width: number;
  readonly height: number;
  readonly kind: string;
}

interface SourceRenderer {
  render(
    targets: RuntimeFrameReport['targets'],
    clock: RuntimeFrameReport['clock'],
    seedPhase: number,
    customTargets: readonly GlslUniformTargetDefinition[],
    profiler: PerformanceMeasureSink | undefined,
    source: TexImageSource | null,
    resolutionBudget: RenderResolutionBudget,
    materialFields?: MaterialFieldSources
  ): void;
  resetFeedback(): void;
  stageFragmentPass(
    fragmentSource: string,
    label?: string
  ): ShaderPassStageResult;
  setPassOrder(order: ShaderPipelineConfig['passOrder']): void;
  setCustomPassEnabled(enabled: boolean): void;
  dispose(): void;
}

interface ActiveShaderPipeline {
  readonly passOrder: NonNullable<ShaderPipelineConfig['passOrder']>;
  readonly customPass: {
    readonly enabled: boolean;
    readonly label: string;
    readonly source: string;
  };
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
  readonly materialFields: {
    readonly contract: typeof MATERIAL_FIELD_INPUT_CONTRACT;
    readonly availableIds: readonly ('density' | 'age')[];
    readonly density: SourceDescriptor;
    readonly age: SourceDescriptor;
  };
}

function finiteDimension(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? Math.floor(number)
    : 0;
}

export function describeTexImageSource(source: unknown): SourceDescriptor {
  if (!source || typeof source !== 'object') {
    return Object.freeze({
      available: false,
      width: 0,
      height: 0,
      kind: 'unavailable'
    });
  }
  const candidate = source as Record<string, unknown>;
  const width = finiteDimension(
    candidate.videoWidth ?? candidate.naturalWidth ?? candidate.width
  );
  const height = finiteDimension(
    candidate.videoHeight ?? candidate.naturalHeight ?? candidate.height
  );
  const kind = String(
    candidate.nodeName ?? candidate.constructor?.name ?? 'TexImageSource'
  ).toLowerCase();
  return Object.freeze({
    available: width > 0 && height > 0,
    width,
    height,
    kind
  });
}

interface ResolvedSourcePayload {
  readonly source: unknown;
  readonly descriptor: SourceDescriptor;
  readonly materialFields: MaterialFieldSources;
  readonly materialFieldDescriptors: {
    readonly density: SourceDescriptor;
    readonly age: SourceDescriptor;
  };
}

function resolveSourcePayload(input: unknown): ResolvedSourcePayload {
  const payload = input && typeof input === 'object'
    ? input as Record<string, unknown>
    : null;
  const source = payload && 'source' in payload
    ? payload.source
    : input;
  const fields = payload?.materialFields &&
    typeof payload.materialFields === 'object'
    ? payload.materialFields as Record<string, unknown>
    : {};
  const densityRecord = fields.density &&
    typeof fields.density === 'object'
    ? fields.density as Record<string, unknown>
    : null;
  const ageRecord = fields.age && typeof fields.age === 'object'
    ? fields.age as Record<string, unknown>
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
        ? density as TexImageSource
        : null,
      age: describeTexImageSource(age).available
        ? age as TexImageSource
        : null
    }),
    materialFieldDescriptors: Object.freeze({
      density: describeTexImageSource(density),
      age: describeTexImageSource(age)
    })
  });
}

export class SourceAwareWebglRenderPort implements RuntimeRenderPort {
  private renderer: SourceRenderer | null = null;
  private readonly rendererFactory: (canvas: HTMLCanvasElement) => SourceRenderer;
  private readonly quality: RenderQualityController;
  private readonly seedPhase: number;
  private customTargets: readonly GlslUniformTargetDefinition[];
  private shaderPipeline: ActiveShaderPipeline | null = null;
  private readonly profiler: PerformanceMeasureSink | undefined;
  private renderCalls = 0;
  private sourceUploads = 0;
  private contextState: RenderContextStatus['state'] = 'ready';
  private contextLosses = 0;
  private contextRestores = 0;
  private gpuContextsCreated = 0;
  private contextError: string | null = null;
  private disposed = false;

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    if (this.disposed) return;
    this.contextLosses++;
    this.contextState = 'lost';
    this.contextError = null;
    this.renderer = null;
  };

  private readonly onContextRestored = (): void => {
    if (this.disposed) return;
    this.contextRestores++;
    try {
      this.renderer = this.createRenderer();
      this.contextState = 'ready';
      this.contextError = null;
      this.quality.resetSchedule();
    } catch (error) {
      this.renderer = null;
      this.contextState = 'restore-failed';
      this.contextError = error instanceof Error ? error.message : String(error);
    }
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    options: SourceAwareRenderPortOptions = {}
  ) {
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
    this.canvas.addEventListener?.(
      'webglcontextrestored',
      this.onContextRestored
    );
  }

  setQualityMode(mode: RenderQualityMode): void {
    this.quality.setMode(mode);
  }

  configurePresetShaderPipeline(input: ShaderPipelineConfig = {}): {
    readonly enabled: boolean;
    readonly label: string;
    readonly customTargetCount: number;
    readonly passOrder: NonNullable<ShaderPipelineConfig['passOrder']>;
  } {
    const registry = new GLSLUniformTargetRegistry();
    registry.replaceAll(input.uniformRegistry ?? []);
    const nextPipeline: ActiveShaderPipeline = Object.freeze({
      passOrder: Object.freeze([
        ...(input.passOrder ?? ['builtin-feedback', 'custom-glsl'])
      ]),
      customPass: Object.freeze({
        enabled: Boolean(input.customPass?.enabled),
        label: String(
          input.customPass?.label || 'Preset custom GLSL pass'
        ),
        source: String(
          input.customPass?.source || PASSTHROUGH_FRAGMENT_SHADER
        )
      })
    });
    if (this.renderer) this.applyShaderPipeline(this.renderer, nextPipeline);
    this.customTargets = registry.targetDefinitions();
    this.shaderPipeline = nextPipeline;
    return Object.freeze({
      enabled: nextPipeline.customPass.enabled,
      label: nextPipeline.customPass.label,
      customTargetCount: this.customTargets.length,
      passOrder: nextPipeline.passOrder
    });
  }

  render(source: unknown, evaluation: RuntimeFrameReport): SourceAwareRenderResult {
    const payload = resolveSourcePayload(source);
    const descriptor = payload.descriptor;
    if (!descriptor.available) throw new Error('RENDER_SOURCE_UNAVAILABLE');
    const targetBindings = resolveFormalTargetUniformBindings(
      evaluation.targets
    );
    if (targetBindings.length !== 21) {
      throw new Error('RENDER_TARGET_BINDING_COUNT_INVALID');
    }
    const quality = this.quality.decide(evaluation.clock, this.contextState);
    if (quality.shouldRender && this.renderer) {
      this.renderer.render(
        evaluation.targets,
        evaluation.clock,
        this.seedPhase,
        this.customTargets,
        this.profiler,
        payload.source as TexImageSource,
        quality,
        payload.materialFields
      );
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
        availableIds: Object.freeze(
          (['density', 'age'] as const).filter(
            id => payload.materialFieldDescriptors[id].available
          )
        ),
        ...payload.materialFieldDescriptors
      }),
      ...descriptor
    });
  }

  reset(): void {
    this.renderer?.resetFeedback();
    this.quality.resetSchedule();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.canvas.removeEventListener?.('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener?.(
      'webglcontextrestored',
      this.onContextRestored
    );
    this.renderer?.dispose();
    this.renderer = null;
  }

  status(): {
    readonly quality: RenderQualityDecision;
    readonly context: RenderContextStatus;
  } {
    return Object.freeze({
      quality: this.quality.status(),
      context: this.contextStatus()
    });
  }

  profile(): {
    readonly renderCalls: number;
    readonly gpuContextsCreated: number;
    readonly canvasTouches: number;
    readonly rafRequests: number;
  } {
    return Object.freeze({
      renderCalls: this.renderCalls,
      gpuContextsCreated: this.gpuContextsCreated,
      canvasTouches: this.sourceUploads,
      rafRequests: 0
    });
  }

  private createRenderer(): SourceRenderer {
    const renderer = this.rendererFactory(this.canvas);
    if (this.shaderPipeline) {
      this.applyShaderPipeline(renderer, this.shaderPipeline);
    }
    this.gpuContextsCreated++;
    return renderer;
  }

  private applyShaderPipeline(
    renderer: SourceRenderer,
    pipeline: ActiveShaderPipeline
  ): void {
    const staged = renderer.stageFragmentPass(
      pipeline.customPass.source,
      pipeline.customPass.label
    );
    if (!staged.applied) {
      throw new Error(
        `RENDER_PRESET_SHADER_COMPILE_FAILED: ${
          staged.log || 'Unknown shader error'
        }`
      );
    }
    renderer.setPassOrder(pipeline.passOrder);
    renderer.setCustomPassEnabled(pipeline.customPass.enabled);
  }

  private contextStatus(): RenderContextStatus {
    return Object.freeze({
      state: this.contextState,
      contextLosses: this.contextLosses,
      contextRestores: this.contextRestores,
      gpuContextsCreated: this.gpuContextsCreated,
      lastError: this.contextError
    });
  }
}

export function createSourceAwareWebglRenderPort(
  canvas: HTMLCanvasElement,
  options: SourceAwareRenderPortOptions = {}
): SourceAwareWebglRenderPort {
  return new SourceAwareWebglRenderPort(canvas, options);
}
