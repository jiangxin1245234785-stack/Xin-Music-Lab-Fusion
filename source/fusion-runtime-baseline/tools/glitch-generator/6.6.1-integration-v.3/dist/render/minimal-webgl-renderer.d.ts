import type { EngineClockFrame } from '../clock/engine-clock.js';
import { type PerformanceMeasureSink } from '../performance/index.js';
import type { ShaderPassId, VisualTargetState } from '../schema/types.js';
import { type ShaderPassDescriptor, type ShaderPassStageResult } from './staged-shader-pass.js';
import { type GlslUniformTargetDefinition } from './glsl-uniform-target-registry.js';
import type { RenderResolutionBudget } from './render-quality-controller.js';
export declare const PING_PONG_BUFFER_COUNT = 2;
export declare const TEMPORAL_HISTORY_BUFFER_COUNT = 8;
export interface MaterialFieldSources {
    readonly density?: TexImageSource | null;
    readonly age?: TexImageSource | null;
}
export declare const MINIMAL_FRAGMENT_SHADER = "#version 300 es\nprecision highp float;\nin vec2 vUv;\nout vec4 outColor;\nuniform sampler2D uPreviousFrame;\nuniform sampler2D uSourceFrame;\nuniform float uSourceAvailable;\nuniform sampler2D uMaterialDensity;\nuniform float uMaterialDensityAvailable;\nuniform sampler2D uMaterialAge;\nuniform float uMaterialAgeAvailable;\nuniform vec2 uResolution;\nuniform float uTime;\nuniform float uAlpha;\nuniform float uSeedPhase;\nuniform float uFeedbackRetention;\nuniform float uFeedbackDecay;\nuniform float uFeedbackZoom;\nuniform float uFeedbackRotation;\nuniform float uBlockSize;\nuniform float uBlockDisplacementX;\nuniform float uBlockSpawnProbability;\nuniform float uBlockLifetime;\nuniform float uRgbDistance;\nuniform float uRgbAngle;\nuniform float uRgbDecay;\nuniform float uScanlineDepth;\nuniform float uGrainDensity;\nuniform float uGrainContrast;\nuniform float uDropoutProbability;\nuniform float uDropoutOpacity;\nuniform float uWhiteTearBrightness;\nuniform float uColorBrightness;\nuniform float uColorContrast;\nuniform float uColorSaturation;\nuniform float uColorFlashStrength;\n\nfloat hash21(vec2 p) {\n  p = fract(p * vec2(123.34, 345.45));\n  p += dot(p, p + 34.345 + uSeedPhase);\n  return fract(p.x * p.y);\n}\n\nmat2 rotate2d(float angle) {\n  float c = cos(angle);\n  float s = sin(angle);\n  return mat2(c, -s, s, c);\n}\n\nvec3 sourceColor(vec2 uv, float timeValue) {\n  vec3 uploaded = texture(uSourceFrame, clamp(uv, 0.0, 1.0)).rgb;\n  vec2 centered = uv - 0.5;\n  centered.x *= uResolution.x / max(1.0, uResolution.y);\n  float radius = length(centered);\n  float wave = 0.5 + 0.5 * sin(radius * 20.0 - timeValue * 1.8 + uSeedPhase * 6.2831853);\n  float halo = exp(-radius * 4.2);\n  vec3 cold = vec3(0.22, 0.15, 0.62);\n  vec3 hot = vec3(0.22, 0.91, 0.78);\n  vec3 fallback = mix(cold, hot, wave) * (0.18 + halo * 1.45);\n  return mix(fallback, uploaded, clamp(uSourceAvailable, 0.0, 1.0));\n}\n\nfloat materialDensityAt(vec2 uv) {\n  float value = texture(uMaterialDensity, clamp(uv, 0.0, 1.0)).r;\n  return mix(0.5, value, clamp(uMaterialDensityAvailable, 0.0, 1.0));\n}\n\nfloat materialAgeAt(vec2 uv) {\n  float value = texture(uMaterialAge, clamp(uv, 0.0, 1.0)).r;\n  return mix(0.5, value, clamp(uMaterialAgeAvailable, 0.0, 1.0));\n}\n\nvoid main() {\n  vec2 feedbackUv = rotate2d(uFeedbackRotation) * (vUv - 0.5);\n  feedbackUv = feedbackUv / max(0.5, uFeedbackZoom) + 0.5;\n  vec3 previousFrame = texture(uPreviousFrame, feedbackUv).rgb;\n\n  vec2 uv = vUv;\n  float localDensity = materialDensityAt(uv);\n  float localAge = materialAgeAt(uv);\n  float safeBlockSize = max(0.01, uBlockSize);\n  vec2 blockCell = floor(uv / safeBlockSize);\n  float lifetimeTick = floor(uTime / max(0.03, uBlockLifetime));\n  float densitySusceptibility = mix(0.7, 1.3, localDensity);\n  float blockProbability = clamp(\n    uBlockSpawnProbability * densitySusceptibility,\n    0.0,\n    1.0\n  );\n  float blockAlive = step(1.0 - blockProbability, hash21(blockCell + lifetimeTick));\n  uv.x += blockAlive * uBlockDisplacementX * 0.12;\n\n  vec2 rgbDirection = vec2(cos(uRgbAngle), sin(uRgbAngle));\n  vec2 rgbOffset = rgbDirection * uRgbDistance * mix(0.25, 1.0, uRgbDecay);\n  vec3 base = sourceColor(uv, uTime);\n  vec3 currentFrame = vec3(\n    sourceColor(uv + rgbOffset, uTime).r,\n    base.g,\n    sourceColor(uv - rgbOffset, uTime).b\n  );\n\n  float scanline = sin(uv.y * uResolution.y * 3.14159265);\n  currentFrame *= 1.0 - uScanlineDepth * (0.5 + 0.5 * scanline);\n  float grain = hash21(gl_FragCoord.xy + floor(uTime * 30.0));\n  float grainProbability = clamp(\n    uGrainDensity * densitySusceptibility,\n    0.0,\n    1.0\n  );\n  float grainMask = step(1.0 - grainProbability, grain);\n  currentFrame += (grain - 0.5) * grainMask * uGrainContrast * 0.18;\n\n  float signalCell = hash21(vec2(floor(uv.y * 48.0), floor(uTime * 8.0)));\n  float dropoutProbability = clamp(\n    uDropoutProbability * densitySusceptibility,\n    0.0,\n    1.0\n  );\n  float dropout = step(1.0 - dropoutProbability, signalCell);\n  currentFrame *= 1.0 - dropout * uDropoutOpacity;\n  float tear = step(0.985, hash21(vec2(floor(uv.y * 90.0), floor(uTime * 12.0))));\n  currentFrame += tear * uWhiteTearBrightness;\n\n  float ageRetention = mix(0.92, 1.08, localAge);\n  float retention = clamp(uFeedbackRetention * ageRetention, 0.0, 1.0);\n  float decay = clamp(uFeedbackDecay, 0.0, 1.0);\n  vec3 retainedFrame = previousFrame * decay;\n  vec3 combined = mix(currentFrame, max(currentFrame, retainedFrame), retention);\n\n  float luminance = dot(combined, vec3(0.2126, 0.7152, 0.0722));\n  combined = mix(vec3(luminance), combined, uColorSaturation);\n  combined = (combined - 0.5) * uColorContrast + 0.5;\n  float safeBrightness = clamp(\n    uColorBrightness + uColorFlashStrength * 0.22,\n    0.0,\n    1.0\n  );\n  combined *= safeBrightness;\n  outColor = vec4(clamp(combined, 0.0, 1.0), uAlpha);\n}";
export declare const DISPLAY_FRAGMENT_SHADER = "#version 300 es\nprecision highp float;\nin vec2 vUv;\nout vec4 outColor;\nuniform sampler2D uFrame;\nvoid main() {\n  outColor = texture(uFrame, vUv);\n}";
export declare const PASSTHROUGH_FRAGMENT_SHADER = "#version 300 es\nprecision highp float;\nin vec2 vUv;\nout vec4 outColor;\nuniform sampler2D uPreviousFrame;\nvoid main() {\n  outColor = texture(uPreviousFrame, vUv);\n}";
export type CustomUniformBindingStatus = 'unresolved' | 'bound' | 'inactive';
export declare class MinimalWebglRenderer {
    private readonly canvas;
    private readonly gl;
    private readonly builtInFeedbackProgram;
    private readonly feedbackPass;
    private readonly displayProgram;
    private readonly sourceTexture;
    private readonly materialDensityTexture;
    private readonly materialAgeTexture;
    private sourceAvailable;
    private materialDensityAvailable;
    private materialAgeAvailable;
    private surfaces;
    private historySurfaces;
    private historyWriteIndex;
    private historyAvailable;
    private readIndex;
    private surfaceWidth;
    private surfaceHeight;
    private passOrder;
    private customPassEnabled;
    constructor(canvas: HTMLCanvasElement);
    stageFragmentPass(fragmentSource: string, label?: string): ShaderPassStageResult;
    validateFragmentPass(fragmentSource: string): string;
    setPassOrder(order: readonly ShaderPassId[]): void;
    getPassOrder(): readonly ShaderPassId[];
    setCustomPassEnabled(enabled: boolean): void;
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
    };
    getLiveFragmentPass(): ShaderPassDescriptor;
    getCustomUniformBindingStatus(uniformName: string): CustomUniformBindingStatus;
    render(targets: VisualTargetState, clock: EngineClockFrame, seedPhase: number, customTargets?: readonly GlslUniformTargetDefinition[], profiler?: PerformanceMeasureSink, source?: TexImageSource | null, resolutionBudget?: RenderResolutionBudget, materialFields?: MaterialFieldSources): void;
    private drawPass;
    private writeCustomUniformTargets;
    resetFeedback(): void;
    dispose(): void;
    private uploadSource;
    private uploadMaterialFields;
    private uploadTexture;
    private resize;
    private ensureFeedbackSurfaces;
    private captureHistory;
    private historyTextureAtAge;
    private destroyFeedbackSurfaces;
}
//# sourceMappingURL=minimal-webgl-renderer.d.ts.map