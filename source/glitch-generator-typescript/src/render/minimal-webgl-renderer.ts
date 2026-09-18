import type { EngineClockFrame } from '../clock/engine-clock.js';
import {
  measurePerformanceStage,
  type PerformanceMeasureSink,
  type PerformanceStageId
} from '../performance/index.js';
import type {
  ShaderPassId,
  VisualTargetState
} from '../schema/types.js';
import {
  StagedShaderPass,
  type ShaderPassDescriptor,
  type ShaderPassStageResult
} from './staged-shader-pass.js';
import {
  coerceGlslUniformValue,
  type GlslUniformTargetDefinition
} from './glsl-uniform-target-registry.js';
import {
  resolveShaderPassOrder
} from './shader-pass-order.js';
import { requiredFormalTargetValue } from './formal-target-uniform-bindings.js';
import type { RenderResolutionBudget } from './render-quality-controller.js';
import { VISUAL_TARGETS } from './visual-targets.js';

export const PING_PONG_BUFFER_COUNT = 2;
export const TEMPORAL_HISTORY_BUFFER_COUNT = 8;

export interface MaterialFieldSources {
  readonly density?: TexImageSource | null;
  readonly age?: TexImageSource | null;
}

const FULL_RESOLUTION_BUDGET: RenderResolutionBudget = Object.freeze({
  renderScale: 1,
  maxDpr: 2
});

const VERTEX_SHADER = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 position = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = position;
  gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
}`;

export const MINIMAL_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uPreviousFrame;
uniform sampler2D uSourceFrame;
uniform float uSourceAvailable;
uniform sampler2D uMaterialDensity;
uniform float uMaterialDensityAvailable;
uniform sampler2D uMaterialAge;
uniform float uMaterialAgeAvailable;
uniform vec2 uResolution;
uniform float uTime;
uniform float uAlpha;
uniform float uSeedPhase;
uniform float uFeedbackRetention;
uniform float uFeedbackDecay;
uniform float uFeedbackZoom;
uniform float uFeedbackRotation;
uniform float uBlockSize;
uniform float uBlockDisplacementX;
uniform float uBlockSpawnProbability;
uniform float uBlockLifetime;
uniform float uRgbDistance;
uniform float uRgbAngle;
uniform float uRgbDecay;
uniform float uScanlineDepth;
uniform float uGrainDensity;
uniform float uGrainContrast;
uniform float uDropoutProbability;
uniform float uDropoutOpacity;
uniform float uWhiteTearBrightness;
uniform float uColorBrightness;
uniform float uColorContrast;
uniform float uColorSaturation;
uniform float uColorFlashStrength;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345 + uSeedPhase);
  return fract(p.x * p.y);
}

mat2 rotate2d(float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return mat2(c, -s, s, c);
}

vec3 sourceColor(vec2 uv, float timeValue) {
  vec3 uploaded = texture(uSourceFrame, clamp(uv, 0.0, 1.0)).rgb;
  vec2 centered = uv - 0.5;
  centered.x *= uResolution.x / max(1.0, uResolution.y);
  float radius = length(centered);
  float wave = 0.5 + 0.5 * sin(radius * 20.0 - timeValue * 1.8 + uSeedPhase * 6.2831853);
  float halo = exp(-radius * 4.2);
  vec3 cold = vec3(0.22, 0.15, 0.62);
  vec3 hot = vec3(0.22, 0.91, 0.78);
  vec3 fallback = mix(cold, hot, wave) * (0.18 + halo * 1.45);
  return mix(fallback, uploaded, clamp(uSourceAvailable, 0.0, 1.0));
}

float materialDensityAt(vec2 uv) {
  float value = texture(uMaterialDensity, clamp(uv, 0.0, 1.0)).r;
  return mix(0.5, value, clamp(uMaterialDensityAvailable, 0.0, 1.0));
}

float materialAgeAt(vec2 uv) {
  float value = texture(uMaterialAge, clamp(uv, 0.0, 1.0)).r;
  return mix(0.5, value, clamp(uMaterialAgeAvailable, 0.0, 1.0));
}

void main() {
  vec2 feedbackUv = rotate2d(uFeedbackRotation) * (vUv - 0.5);
  feedbackUv = feedbackUv / max(0.5, uFeedbackZoom) + 0.5;
  vec3 previousFrame = texture(uPreviousFrame, feedbackUv).rgb;

  vec2 uv = vUv;
  float localDensity = materialDensityAt(uv);
  float localAge = materialAgeAt(uv);
  float safeBlockSize = max(0.01, uBlockSize);
  vec2 blockCell = floor(uv / safeBlockSize);
  float lifetimeTick = floor(uTime / max(0.03, uBlockLifetime));
  float densitySusceptibility = mix(0.7, 1.3, localDensity);
  float blockProbability = clamp(
    uBlockSpawnProbability * densitySusceptibility,
    0.0,
    1.0
  );
  float blockAlive = step(1.0 - blockProbability, hash21(blockCell + lifetimeTick));
  uv.x += blockAlive * uBlockDisplacementX * 0.12;

  vec2 rgbDirection = vec2(cos(uRgbAngle), sin(uRgbAngle));
  vec2 rgbOffset = rgbDirection * uRgbDistance * mix(0.25, 1.0, uRgbDecay);
  vec3 base = sourceColor(uv, uTime);
  vec3 currentFrame = vec3(
    sourceColor(uv + rgbOffset, uTime).r,
    base.g,
    sourceColor(uv - rgbOffset, uTime).b
  );

  float scanline = sin(uv.y * uResolution.y * 3.14159265);
  currentFrame *= 1.0 - uScanlineDepth * (0.5 + 0.5 * scanline);
  float grain = hash21(gl_FragCoord.xy + floor(uTime * 30.0));
  float grainProbability = clamp(
    uGrainDensity * densitySusceptibility,
    0.0,
    1.0
  );
  float grainMask = step(1.0 - grainProbability, grain);
  currentFrame += (grain - 0.5) * grainMask * uGrainContrast * 0.18;

  float signalCell = hash21(vec2(floor(uv.y * 48.0), floor(uTime * 8.0)));
  float dropoutProbability = clamp(
    uDropoutProbability * densitySusceptibility,
    0.0,
    1.0
  );
  float dropout = step(1.0 - dropoutProbability, signalCell);
  currentFrame *= 1.0 - dropout * uDropoutOpacity;
  float tear = step(0.985, hash21(vec2(floor(uv.y * 90.0), floor(uTime * 12.0))));
  currentFrame += tear * uWhiteTearBrightness;

  float ageRetention = mix(0.92, 1.08, localAge);
  float retention = clamp(uFeedbackRetention * ageRetention, 0.0, 1.0);
  float decay = clamp(uFeedbackDecay, 0.0, 1.0);
  vec3 retainedFrame = previousFrame * decay;
  vec3 combined = mix(currentFrame, max(currentFrame, retainedFrame), retention);

  float luminance = dot(combined, vec3(0.2126, 0.7152, 0.0722));
  combined = mix(vec3(luminance), combined, uColorSaturation);
  combined = (combined - 0.5) * uColorContrast + 0.5;
  float safeBrightness = clamp(
    uColorBrightness + uColorFlashStrength * 0.22,
    0.0,
    1.0
  );
  combined *= safeBrightness;
  outColor = vec4(clamp(combined, 0.0, 1.0), uAlpha);
}`;

export const DISPLAY_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uFrame;
void main() {
  outColor = texture(uFrame, vUv);
}`;

export const PASSTHROUGH_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uPreviousFrame;
void main() {
  outColor = texture(uPreviousFrame, vUv);
}`;

const FEEDBACK_UNIFORM_NAMES = Object.freeze([
  'uPreviousFrame',
  'uSourceFrame',
  'uSourceAvailable',
  'uMaterialDensity',
  'uMaterialDensityAvailable',
  'uMaterialAge',
  'uMaterialAgeAvailable',
  'uHistory1',
  'uHistory2',
  'uHistory4',
  'uHistory7',
  'uHistoryAvailable',
  'uResolution',
  'uTime',
  'uAlpha',
  'uSeedPhase',
  'uFeedbackRetention',
  'uFeedbackDecay',
  'uFeedbackZoom',
  'uFeedbackRotation',
  'uBlockSize',
  'uBlockDisplacementX',
  'uBlockSpawnProbability',
  'uBlockLifetime',
  'uRgbDistance',
  'uRgbAngle',
  'uRgbDecay',
  'uScanlineDepth',
  'uGrainDensity',
  'uGrainContrast',
  'uDropoutProbability',
  'uDropoutOpacity',
  'uWhiteTearBrightness',
  'uColorBrightness',
  'uColorContrast',
  'uColorSaturation',
  'uColorFlashStrength'
] as const);

type FeedbackUniformName = typeof FEEDBACK_UNIFORM_NAMES[number];

interface FeedbackProgramState {
  readonly program: WebGLProgram;
  readonly uniforms: Readonly<
    Record<FeedbackUniformName, WebGLUniformLocation | null>
  >;
  readonly customUniforms: Map<string, WebGLUniformLocation | null>;
}

export type CustomUniformBindingStatus =
  'unresolved' | 'bound' | 'inactive';

interface DisplayProgramState {
  readonly program: WebGLProgram;
  readonly frame: WebGLUniformLocation | null;
}

interface FeedbackSurface {
  readonly texture: WebGLTexture;
  readonly framebuffer: WebGLFramebuffer;
}

function createSourceTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error('Unable to create source texture');
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([0, 0, 0, 0])
  );
  return texture;
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Unable to create WebGL shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const error = gl.getShaderInfoLog(shader) ?? 'Unknown shader compile error';
    gl.deleteShader(shader);
    throw new Error(error);
  }
  return shader;
}

function linkProgram(
  gl: WebGL2RenderingContext,
  fragmentSource: string
): WebGLProgram {
  let vertex: WebGLShader | null = null;
  let fragment: WebGLShader | null = null;
  let program: WebGLProgram | null = null;
  try {
    vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    program = gl.createProgram();
    if (!program) throw new Error('Unable to create WebGL program');
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const error =
        gl.getProgramInfoLog(program) ?? 'Unknown program link error';
      gl.deleteProgram(program);
      program = null;
      throw new Error(`Program link failed:\n${error}`);
    }
    return program;
  } finally {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
  }
}

function createFeedbackProgram(
  gl: WebGL2RenderingContext,
  fragmentSource = MINIMAL_FRAGMENT_SHADER
): FeedbackProgramState {
  const program = linkProgram(gl, fragmentSource);
  return {
    program,
    uniforms: Object.fromEntries(
      FEEDBACK_UNIFORM_NAMES.map(name => [
        name,
        gl.getUniformLocation(program, name)
      ])
    ) as unknown as Readonly<
      Record<FeedbackUniformName, WebGLUniformLocation | null>
    >,
    customUniforms: new Map()
  };
}

function createDisplayProgram(gl: WebGL2RenderingContext): DisplayProgramState {
  const program = linkProgram(gl, DISPLAY_FRAGMENT_SHADER);
  return {
    program,
    frame: gl.getUniformLocation(program, 'uFrame')
  };
}

function createFeedbackSurface(
  gl: WebGL2RenderingContext,
  width: number,
  height: number
): FeedbackSurface {
  const texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  if (!texture || !framebuffer) {
    if (texture) gl.deleteTexture(texture);
    if (framebuffer) gl.deleteFramebuffer(framebuffer);
    throw new Error('Unable to create ping-pong framebuffer resources');
  }

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA8,
    width,
    height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null
  );

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0
  );
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(texture);
    throw new Error('Ping-pong framebuffer is incomplete');
  }
  return { texture, framebuffer };
}

function targetValue(
  state: VisualTargetState,
  id: string,
  fallback: number
): number {
  const value = Number(state.values?.[id]);
  return Number.isFinite(value) ? value : fallback;
}

export class MinimalWebglRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly builtInFeedbackProgram: FeedbackProgramState;
  private readonly feedbackPass: StagedShaderPass<FeedbackProgramState>;
  private readonly displayProgram: DisplayProgramState;
  private readonly sourceTexture: WebGLTexture;
  private readonly materialDensityTexture: WebGLTexture;
  private readonly materialAgeTexture: WebGLTexture;
  private sourceAvailable = false;
  private materialDensityAvailable = false;
  private materialAgeAvailable = false;
  private surfaces: FeedbackSurface[] = [];
  private historySurfaces: FeedbackSurface[] = [];
  private historyWriteIndex = 0;
  private historyAvailable = 0;
  private readIndex = 0;
  private surfaceWidth = 0;
  private surfaceHeight = 0;
  private passOrder: readonly ShaderPassId[] =
    Object.freeze(['builtin-feedback', 'custom-glsl']);
  private customPassEnabled = true;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false
    });
    if (!gl) throw new Error('WebGL2 is unavailable');
    this.gl = gl;
    this.builtInFeedbackProgram = createFeedbackProgram(gl);
    this.feedbackPass = new StagedShaderPass({
      initialResource: createFeedbackProgram(
        gl,
        PASSTHROUGH_FRAGMENT_SHADER
      ),
      initialSource: PASSTHROUGH_FRAGMENT_SHADER,
      initialLabel: 'Custom GLSL pass · bypass',
      compile: source => ({
        resource: createFeedbackProgram(gl, source),
        log: 'Fragment shader compiled and linked successfully.'
      }),
      dispose: state => gl.deleteProgram(state.program)
    });
    this.displayProgram = createDisplayProgram(gl);
    this.sourceTexture = createSourceTexture(gl);
    this.materialDensityTexture = createSourceTexture(gl);
    this.materialAgeTexture = createSourceTexture(gl);
  }

  stageFragmentPass(
    fragmentSource: string,
    label = 'Uploaded GLSL pass'
  ): ShaderPassStageResult {
    const result = this.feedbackPass.stage(fragmentSource, label);
    if (result.applied) this.resetFeedback();
    return result;
  }

  validateFragmentPass(fragmentSource: string): string {
    if (fragmentSource.trim().length === 0) {
      return 'Empty custom pass uses the built-in passthrough shader.';
    }
    const candidate = createFeedbackProgram(this.gl, fragmentSource);
    this.gl.deleteProgram(candidate.program);
    return 'Fragment shader compiled and linked successfully.';
  }

  setPassOrder(order: readonly ShaderPassId[]): void {
    this.passOrder = resolveShaderPassOrder(order);
    this.resetFeedback();
  }

  getPassOrder(): readonly ShaderPassId[] {
    return Object.freeze([...this.passOrder]);
  }

  setCustomPassEnabled(enabled: boolean): void {
    this.customPassEnabled = enabled;
    this.resetFeedback();
  }

  getFramebufferPreviewState(): {
    readonly activeSurfaceIndex: number;
    readonly width: number;
    readonly height: number;
    readonly passOrder: readonly ShaderPassId[];
    readonly temporalHistory: {
      readonly depth: number;
      readonly available: number;
      readonly nextWriteIndex: number;
    };
  } {
    return Object.freeze({
      activeSurfaceIndex: this.readIndex,
      width: this.surfaceWidth,
      height: this.surfaceHeight,
      passOrder: this.getPassOrder(),
      temporalHistory: Object.freeze({
        depth: TEMPORAL_HISTORY_BUFFER_COUNT,
        available: this.historyAvailable,
        nextWriteIndex: this.historyWriteIndex
      })
    });
  }

  getLiveFragmentPass(): ShaderPassDescriptor {
    return this.feedbackPass.livePass;
  }

  getCustomUniformBindingStatus(
    uniformName: string
  ): CustomUniformBindingStatus {
    const customUniforms = this.feedbackPass.liveResource.customUniforms;
    if (!customUniforms.has(uniformName)) return 'unresolved';
    return customUniforms.get(uniformName) === null
      ? 'inactive'
      : 'bound';
  }

  render(
    targets: VisualTargetState,
    clock: EngineClockFrame,
    seedPhase: number,
    customTargets: readonly GlslUniformTargetDefinition[] = [],
    profiler?: PerformanceMeasureSink,
    source: TexImageSource | null = null,
    resolutionBudget: RenderResolutionBudget = FULL_RESOLUTION_BUDGET,
    materialFields: MaterialFieldSources = {}
  ): void {
    measurePerformanceStage(profiler, 'render-setup', () => {
      this.resize(resolutionBudget);
      this.ensureFeedbackSurfaces();
      this.uploadSource(source);
      this.uploadMaterialFields(materialFields);
    });
    const gl = this.gl;
    let sourceIndex = this.readIndex;
    for (const passId of this.passOrder) {
      if (passId === 'custom-glsl' && !this.customPassEnabled) continue;
      const destinationIndex = 1 - sourceIndex;
      const program = passId === 'builtin-feedback'
        ? this.builtInFeedbackProgram
        : this.feedbackPass.liveResource;
      const stageId: PerformanceStageId =
        passId === 'builtin-feedback'
          ? 'render:builtin-feedback'
          : 'render:custom-glsl';
      measurePerformanceStage(
        profiler,
        stageId,
        () => this.drawPass(
          program,
          this.surfaces[sourceIndex]!,
          this.surfaces[destinationIndex]!,
          targets,
          clock,
          seedPhase,
          customTargets
        )
      );
      sourceIndex = destinationIndex;
    }

    measurePerformanceStage(
      profiler,
      'render:history-capture' as PerformanceStageId,
      () => this.captureHistory(this.surfaces[sourceIndex]!)
    );

    measurePerformanceStage(profiler, 'render:display', () => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.useProgram(this.displayProgram.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.surfaces[sourceIndex]!.texture);
      gl.uniform1i(this.displayProgram.frame, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    });
    this.readIndex = sourceIndex;
  }

  private drawPass(
    program: FeedbackProgramState,
    readSurface: FeedbackSurface,
    writeSurface: FeedbackSurface,
    targets: VisualTargetState,
    clock: EngineClockFrame,
    seedPhase: number,
    customTargets: readonly GlslUniformTargetDefinition[]
  ): void {
    const gl = this.gl;
    const u = program.uniforms;
    gl.bindFramebuffer(gl.FRAMEBUFFER, writeSurface.framebuffer);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(program.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, readSurface.texture);
    gl.uniform1i(u.uPreviousFrame, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
    gl.uniform1i(u.uSourceFrame, 1);
    gl.uniform1f(u.uSourceAvailable, this.sourceAvailable ? 1 : 0);
    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_2D, this.materialDensityTexture);
    gl.uniform1i(u.uMaterialDensity, 7);
    gl.uniform1f(
      u.uMaterialDensityAvailable,
      this.materialDensityAvailable ? 1 : 0
    );
    gl.activeTexture(gl.TEXTURE8);
    gl.bindTexture(gl.TEXTURE_2D, this.materialAgeTexture);
    gl.uniform1i(u.uMaterialAge, 8);
    gl.uniform1f(
      u.uMaterialAgeAvailable,
      this.materialAgeAvailable ? 1 : 0
    );
    const historyBindings: readonly [
      WebGLUniformLocation | null,
      number,
      number
    ][] = [
      [u.uHistory1, 2, 1],
      [u.uHistory2, 3, 2],
      [u.uHistory4, 4, 4],
      [u.uHistory7, 5, 7]
    ];
    for (const [location, unit, age] of historyBindings) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(
        gl.TEXTURE_2D,
        this.historyTextureAtAge(age, readSurface.texture)
      );
      gl.uniform1i(location, unit);
    }
    gl.uniform1f(
      u.uHistoryAvailable,
      this.historyAvailable / TEMPORAL_HISTORY_BUFFER_COUNT
    );
    gl.uniform2f(u.uResolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.uTime, clock.nowMs / 1000);
    gl.uniform1f(u.uAlpha, targetValue(targets, VISUAL_TARGETS.alpha, 1));
    gl.uniform1f(u.uSeedPhase, seedPhase);
    gl.uniform1f(u.uFeedbackRetention, requiredFormalTargetValue(targets, VISUAL_TARGETS.feedbackRetention));
    gl.uniform1f(u.uFeedbackDecay, requiredFormalTargetValue(targets, VISUAL_TARGETS.feedbackDecay));
    gl.uniform1f(u.uFeedbackZoom, requiredFormalTargetValue(targets, VISUAL_TARGETS.feedbackZoom));
    gl.uniform1f(u.uFeedbackRotation, requiredFormalTargetValue(targets, VISUAL_TARGETS.feedbackRotation));
    gl.uniform1f(u.uBlockSize, requiredFormalTargetValue(targets, VISUAL_TARGETS.blockSize));
    gl.uniform1f(u.uBlockDisplacementX, requiredFormalTargetValue(targets, VISUAL_TARGETS.blockDisplacementX));
    gl.uniform1f(u.uBlockSpawnProbability, requiredFormalTargetValue(targets, VISUAL_TARGETS.blockSpawnProbability));
    gl.uniform1f(u.uBlockLifetime, requiredFormalTargetValue(targets, VISUAL_TARGETS.blockLifetime));
    gl.uniform1f(u.uRgbDistance, requiredFormalTargetValue(targets, VISUAL_TARGETS.rgbDistance));
    gl.uniform1f(u.uRgbAngle, requiredFormalTargetValue(targets, VISUAL_TARGETS.rgbAngle));
    gl.uniform1f(u.uRgbDecay, requiredFormalTargetValue(targets, VISUAL_TARGETS.rgbDecay));
    gl.uniform1f(u.uScanlineDepth, requiredFormalTargetValue(targets, VISUAL_TARGETS.scanlineDepth));
    gl.uniform1f(u.uGrainDensity, requiredFormalTargetValue(targets, VISUAL_TARGETS.grainDensity));
    gl.uniform1f(u.uGrainContrast, requiredFormalTargetValue(targets, VISUAL_TARGETS.grainContrast));
    gl.uniform1f(u.uDropoutProbability, requiredFormalTargetValue(targets, VISUAL_TARGETS.dropoutProbability));
    gl.uniform1f(u.uDropoutOpacity, requiredFormalTargetValue(targets, VISUAL_TARGETS.dropoutOpacity));
    gl.uniform1f(u.uWhiteTearBrightness, requiredFormalTargetValue(targets, VISUAL_TARGETS.whiteTearBrightness));
    gl.uniform1f(u.uColorBrightness, requiredFormalTargetValue(targets, VISUAL_TARGETS.colorBrightness));
    gl.uniform1f(u.uColorContrast, requiredFormalTargetValue(targets, VISUAL_TARGETS.colorContrast));
    gl.uniform1f(u.uColorSaturation, requiredFormalTargetValue(targets, VISUAL_TARGETS.colorSaturation));
    gl.uniform1f(u.uColorFlashStrength, requiredFormalTargetValue(targets, VISUAL_TARGETS.colorFlashStrength));
    this.writeCustomUniformTargets(program, targets, customTargets);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private writeCustomUniformTargets(
    program: FeedbackProgramState,
    targets: VisualTargetState,
    customTargets: readonly GlslUniformTargetDefinition[]
  ): void {
    const gl = this.gl;
    for (const target of customTargets) {
      if (!program.customUniforms.has(target.uniformName)) {
        program.customUniforms.set(
          target.uniformName,
          gl.getUniformLocation(program.program, target.uniformName)
        );
      }
      const location = program.customUniforms.get(target.uniformName);
      if (location === null || location === undefined) continue;
      const value = coerceGlslUniformValue(
        target,
        targetValue(targets, target.id, target.defaultValue)
      );
      if (target.uniformType === 'float') gl.uniform1f(location, value);
      else gl.uniform1i(location, value);
    }
  }

  resetFeedback(): void {
    const gl = this.gl;
    for (const surface of [...this.surfaces, ...this.historySurfaces]) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, surface.framebuffer);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.readIndex = 0;
    this.historyWriteIndex = 0;
    this.historyAvailable = 0;
  }

  dispose(): void {
    this.destroyFeedbackSurfaces();
    this.feedbackPass.dispose();
    this.gl.deleteProgram(this.builtInFeedbackProgram.program);
    this.gl.deleteProgram(this.displayProgram.program);
    this.gl.deleteTexture(this.sourceTexture);
    this.gl.deleteTexture(this.materialDensityTexture);
    this.gl.deleteTexture(this.materialAgeTexture);
  }

  private uploadSource(source: TexImageSource | null): void {
    this.sourceAvailable = this.uploadTexture(
      this.sourceTexture,
      source,
      1
    );
  }

  private uploadMaterialFields(fields: MaterialFieldSources): void {
    this.materialDensityAvailable = this.uploadTexture(
      this.materialDensityTexture,
      fields.density ?? null,
      7
    );
    this.materialAgeAvailable = this.uploadTexture(
      this.materialAgeTexture,
      fields.age ?? null,
      8
    );
  }

  private uploadTexture(
    texture: WebGLTexture,
    source: TexImageSource | null,
    unit: number
  ): boolean {
    if (!source) return false;
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    try {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source
      );
      return true;
    } finally {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    }
  }

  private resize(resolutionBudget: RenderResolutionBudget): void {
    const maxDpr = Math.max(0.5, Math.min(2, resolutionBudget.maxDpr));
    const renderScale = Math.max(0.25, Math.min(1, resolutionBudget.renderScale));
    const dpr = Math.max(0.5, Math.min(maxDpr, window.devicePixelRatio || 1));
    if (this.canvas.clientWidth <= 0 || this.canvas.clientHeight <= 0) {
      return;
    }
    const width = Math.max(1, Math.round(
      this.canvas.clientWidth * dpr * renderScale
    ));
    const height = Math.max(1, Math.round(
      this.canvas.clientHeight * dpr * renderScale
    ));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  private ensureFeedbackSurfaces(): void {
    if (
      this.surfaces.length === PING_PONG_BUFFER_COUNT &&
      this.surfaceWidth === this.canvas.width &&
      this.surfaceHeight === this.canvas.height
    ) {
      return;
    }
    this.destroyFeedbackSurfaces();
    this.surfaceWidth = this.canvas.width;
    this.surfaceHeight = this.canvas.height;
    this.surfaces = Array.from(
      { length: PING_PONG_BUFFER_COUNT },
      () => createFeedbackSurface(
        this.gl,
        this.surfaceWidth,
        this.surfaceHeight
      )
    );
    this.historySurfaces = Array.from(
      { length: TEMPORAL_HISTORY_BUFFER_COUNT },
      () => createFeedbackSurface(
        this.gl,
        this.surfaceWidth,
        this.surfaceHeight
      )
    );
    this.resetFeedback();
  }

  private captureHistory(surface: FeedbackSurface): void {
    if (this.historySurfaces.length !== TEMPORAL_HISTORY_BUFFER_COUNT) return;
    const gl = this.gl;
    const destination = this.historySurfaces[this.historyWriteIndex]!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, surface.framebuffer);
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, destination.texture);
    gl.copyTexSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      0,
      0,
      this.surfaceWidth,
      this.surfaceHeight
    );
    this.historyWriteIndex =
      (this.historyWriteIndex + 1) % TEMPORAL_HISTORY_BUFFER_COUNT;
    this.historyAvailable = Math.min(
      TEMPORAL_HISTORY_BUFFER_COUNT,
      this.historyAvailable + 1
    );
  }

  private historyTextureAtAge(
    age: number,
    fallback: WebGLTexture
  ): WebGLTexture {
    if (this.historyAvailable <= 0 || this.historySurfaces.length === 0) {
      return fallback;
    }
    const resolvedAge = Math.min(
      this.historyAvailable,
      Math.max(1, Math.floor(age))
    );
    const index = (
      this.historyWriteIndex -
      resolvedAge +
      TEMPORAL_HISTORY_BUFFER_COUNT
    ) % TEMPORAL_HISTORY_BUFFER_COUNT;
    return this.historySurfaces[index]!.texture;
  }

  private destroyFeedbackSurfaces(): void {
    for (const surface of [...this.surfaces, ...this.historySurfaces]) {
      this.gl.deleteFramebuffer(surface.framebuffer);
      this.gl.deleteTexture(surface.texture);
    }
    this.surfaces = [];
    this.historySurfaces = [];
    this.surfaceWidth = 0;
    this.surfaceHeight = 0;
    this.readIndex = 0;
    this.historyWriteIndex = 0;
    this.historyAvailable = 0;
  }
}
