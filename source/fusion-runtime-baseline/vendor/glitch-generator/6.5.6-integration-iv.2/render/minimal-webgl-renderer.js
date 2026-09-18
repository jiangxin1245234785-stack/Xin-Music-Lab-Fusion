import { measurePerformanceStage } from '../performance/index.js';
import { StagedShaderPass } from './staged-shader-pass.js';
import { coerceGlslUniformValue } from './glsl-uniform-target-registry.js';
import { resolveShaderPassOrder } from './shader-pass-order.js';
import { requiredFormalTargetValue } from './formal-target-uniform-bindings.js';
import { VISUAL_TARGETS } from './visual-targets.js';
export const PING_PONG_BUFFER_COUNT = 2;
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

void main() {
  vec2 feedbackUv = rotate2d(uFeedbackRotation) * (vUv - 0.5);
  feedbackUv = feedbackUv / max(0.5, uFeedbackZoom) + 0.5;
  vec3 previousFrame = texture(uPreviousFrame, feedbackUv).rgb;

  vec2 uv = vUv;
  float safeBlockSize = max(0.01, uBlockSize);
  vec2 blockCell = floor(uv / safeBlockSize);
  float lifetimeTick = floor(uTime / max(0.03, uBlockLifetime));
  float blockAlive = step(1.0 - uBlockSpawnProbability, hash21(blockCell + lifetimeTick));
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
  float grainMask = step(1.0 - uGrainDensity, grain);
  currentFrame += (grain - 0.5) * grainMask * uGrainContrast * 0.18;

  float signalCell = hash21(vec2(floor(uv.y * 48.0), floor(uTime * 8.0)));
  float dropout = step(1.0 - uDropoutProbability, signalCell);
  currentFrame *= 1.0 - dropout * uDropoutOpacity;
  float tear = step(0.985, hash21(vec2(floor(uv.y * 90.0), floor(uTime * 12.0))));
  currentFrame += tear * uWhiteTearBrightness;

  float retention = clamp(uFeedbackRetention, 0.0, 1.0);
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
]);
function createSourceTexture(gl) {
    const texture = gl.createTexture();
    if (!texture)
        throw new Error('Unable to create source texture');
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    return texture;
}
function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    if (!shader)
        throw new Error('Unable to create WebGL shader');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const error = gl.getShaderInfoLog(shader) ?? 'Unknown shader compile error';
        gl.deleteShader(shader);
        throw new Error(error);
    }
    return shader;
}
function linkProgram(gl, fragmentSource) {
    let vertex = null;
    let fragment = null;
    let program = null;
    try {
        vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
        fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
        program = gl.createProgram();
        if (!program)
            throw new Error('Unable to create WebGL program');
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const error = gl.getProgramInfoLog(program) ?? 'Unknown program link error';
            gl.deleteProgram(program);
            program = null;
            throw new Error(`Program link failed:\n${error}`);
        }
        return program;
    }
    finally {
        if (vertex)
            gl.deleteShader(vertex);
        if (fragment)
            gl.deleteShader(fragment);
    }
}
function createFeedbackProgram(gl, fragmentSource = MINIMAL_FRAGMENT_SHADER) {
    const program = linkProgram(gl, fragmentSource);
    return {
        program,
        uniforms: Object.fromEntries(FEEDBACK_UNIFORM_NAMES.map(name => [
            name,
            gl.getUniformLocation(program, name)
        ])),
        customUniforms: new Map()
    };
}
function createDisplayProgram(gl) {
    const program = linkProgram(gl, DISPLAY_FRAGMENT_SHADER);
    return {
        program,
        frame: gl.getUniformLocation(program, 'uFrame')
    };
}
function createFeedbackSurface(gl, width, height) {
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    if (!texture || !framebuffer) {
        if (texture)
            gl.deleteTexture(texture);
        if (framebuffer)
            gl.deleteFramebuffer(framebuffer);
        throw new Error('Unable to create ping-pong framebuffer resources');
    }
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        gl.deleteFramebuffer(framebuffer);
        gl.deleteTexture(texture);
        throw new Error('Ping-pong framebuffer is incomplete');
    }
    return { texture, framebuffer };
}
function targetValue(state, id, fallback) {
    const value = Number(state.values?.[id]);
    return Number.isFinite(value) ? value : fallback;
}
export class MinimalWebglRenderer {
    canvas;
    gl;
    builtInFeedbackProgram;
    feedbackPass;
    displayProgram;
    sourceTexture;
    sourceAvailable = false;
    surfaces = [];
    readIndex = 0;
    surfaceWidth = 0;
    surfaceHeight = 0;
    passOrder = Object.freeze(['builtin-feedback', 'custom-glsl']);
    customPassEnabled = true;
    constructor(canvas) {
        this.canvas = canvas;
        const gl = canvas.getContext('webgl2', {
            alpha: true,
            antialias: false,
            depth: false,
            stencil: false
        });
        if (!gl)
            throw new Error('WebGL2 is unavailable');
        this.gl = gl;
        this.builtInFeedbackProgram = createFeedbackProgram(gl);
        this.feedbackPass = new StagedShaderPass({
            initialResource: createFeedbackProgram(gl, PASSTHROUGH_FRAGMENT_SHADER),
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
    }
    stageFragmentPass(fragmentSource, label = 'Uploaded GLSL pass') {
        const result = this.feedbackPass.stage(fragmentSource, label);
        if (result.applied)
            this.resetFeedback();
        return result;
    }
    validateFragmentPass(fragmentSource) {
        if (fragmentSource.trim().length === 0) {
            return 'Empty custom pass uses the built-in passthrough shader.';
        }
        const candidate = createFeedbackProgram(this.gl, fragmentSource);
        this.gl.deleteProgram(candidate.program);
        return 'Fragment shader compiled and linked successfully.';
    }
    setPassOrder(order) {
        this.passOrder = resolveShaderPassOrder(order);
        this.resetFeedback();
    }
    getPassOrder() {
        return Object.freeze([...this.passOrder]);
    }
    setCustomPassEnabled(enabled) {
        this.customPassEnabled = enabled;
        this.resetFeedback();
    }
    getFramebufferPreviewState() {
        return Object.freeze({
            activeSurfaceIndex: this.readIndex,
            width: this.surfaceWidth,
            height: this.surfaceHeight,
            passOrder: this.getPassOrder()
        });
    }
    getLiveFragmentPass() {
        return this.feedbackPass.livePass;
    }
    getCustomUniformBindingStatus(uniformName) {
        const customUniforms = this.feedbackPass.liveResource.customUniforms;
        if (!customUniforms.has(uniformName))
            return 'unresolved';
        return customUniforms.get(uniformName) === null
            ? 'inactive'
            : 'bound';
    }
    render(targets, clock, seedPhase, customTargets = [], profiler, source = null) {
        measurePerformanceStage(profiler, 'render-setup', () => {
            this.resize();
            this.ensureFeedbackSurfaces();
            this.uploadSource(source);
        });
        const gl = this.gl;
        let sourceIndex = this.readIndex;
        for (const passId of this.passOrder) {
            if (passId === 'custom-glsl' && !this.customPassEnabled)
                continue;
            const destinationIndex = 1 - sourceIndex;
            const program = passId === 'builtin-feedback'
                ? this.builtInFeedbackProgram
                : this.feedbackPass.liveResource;
            const stageId = passId === 'builtin-feedback'
                ? 'render:builtin-feedback'
                : 'render:custom-glsl';
            measurePerformanceStage(profiler, stageId, () => this.drawPass(program, this.surfaces[sourceIndex], this.surfaces[destinationIndex], targets, clock, seedPhase, customTargets));
            sourceIndex = destinationIndex;
        }
        measurePerformanceStage(profiler, 'render:display', () => {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, this.canvas.width, this.canvas.height);
            gl.useProgram(this.displayProgram.program);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.surfaces[sourceIndex].texture);
            gl.uniform1i(this.displayProgram.frame, 0);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        });
        this.readIndex = sourceIndex;
    }
    drawPass(program, readSurface, writeSurface, targets, clock, seedPhase, customTargets) {
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
    writeCustomUniformTargets(program, targets, customTargets) {
        const gl = this.gl;
        for (const target of customTargets) {
            if (!program.customUniforms.has(target.uniformName)) {
                program.customUniforms.set(target.uniformName, gl.getUniformLocation(program.program, target.uniformName));
            }
            const location = program.customUniforms.get(target.uniformName);
            if (location === null || location === undefined)
                continue;
            const value = coerceGlslUniformValue(target, targetValue(targets, target.id, target.defaultValue));
            if (target.uniformType === 'float')
                gl.uniform1f(location, value);
            else
                gl.uniform1i(location, value);
        }
    }
    resetFeedback() {
        const gl = this.gl;
        for (const surface of this.surfaces) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, surface.framebuffer);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        this.readIndex = 0;
    }
    dispose() {
        this.destroyFeedbackSurfaces();
        this.feedbackPass.dispose();
        this.gl.deleteProgram(this.builtInFeedbackProgram.program);
        this.gl.deleteProgram(this.displayProgram.program);
        this.gl.deleteTexture(this.sourceTexture);
    }
    uploadSource(source) {
        this.sourceAvailable = false;
        if (!source)
            return;
        const gl = this.gl;
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        try {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
            this.sourceAvailable = true;
        }
        finally {
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        }
    }
    resize() {
        const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        if (this.canvas.clientWidth <= 0 || this.canvas.clientHeight <= 0) {
            return;
        }
        const width = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
        const height = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
        }
    }
    ensureFeedbackSurfaces() {
        if (this.surfaces.length === PING_PONG_BUFFER_COUNT &&
            this.surfaceWidth === this.canvas.width &&
            this.surfaceHeight === this.canvas.height) {
            return;
        }
        this.destroyFeedbackSurfaces();
        this.surfaceWidth = this.canvas.width;
        this.surfaceHeight = this.canvas.height;
        this.surfaces = Array.from({ length: PING_PONG_BUFFER_COUNT }, () => createFeedbackSurface(this.gl, this.surfaceWidth, this.surfaceHeight));
        this.resetFeedback();
    }
    destroyFeedbackSurfaces() {
        for (const surface of this.surfaces) {
            this.gl.deleteFramebuffer(surface.framebuffer);
            this.gl.deleteTexture(surface.texture);
        }
        this.surfaces = [];
        this.surfaceWidth = 0;
        this.surfaceHeight = 0;
        this.readIndex = 0;
    }
}
//# sourceMappingURL=minimal-webgl-renderer.js.map