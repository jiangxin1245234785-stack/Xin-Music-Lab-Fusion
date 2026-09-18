(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SmokeResonanceGlitchWebGL = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const clamp = (value, low, high) => Math.max(low, Math.min(high, Number(value) || 0));
  const clamp01 = value => clamp(value, 0, 1);

  const VERTEX_SHADER = `#version 300 es
    precision highp float;
    out vec2 vUv;
    void main() {
      vec2 position = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
      vUv = position;
      gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
    }`;

  const FEEDBACK_SHADER = `#version 300 es
    precision highp float;
    in vec2 vUv;
    out vec4 outColor;
    uniform sampler2D uSource;
    uniform sampler2D uPrevious;
    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uHasHistory;
    uniform float uBass;
    uniform float uMid;
    uniform float uBuild;
    uniform float uSection;
    uniform float uBoundary;
    uniform float uClimax;
    uniform float uDrop;
    uniform float uStrength;

    void main() {
      vec2 uv = vUv;
      vec2 centered = uv - 0.5;
      float aspect = uResolution.x / max(1.0, uResolution.y);
      centered.x *= aspect;
      float radius = length(centered);
      float phase = uTime * (0.16 + uMid * 0.28);
      vec2 drift = vec2(
        sin(uv.y * 7.0 + phase * 3.1),
        cos(uv.x * 6.0 - phase * 2.7)
      ) * (0.00045 + uMid * 0.0038) * uStrength;
      vec2 radial = normalize(centered + vec2(0.0001)) * sin(radius * 16.0 - phase * 4.0)
        * uBass * 0.0028 * uStrength;
      float boundaryKick = max(uBoundary, max(uClimax, uDrop));
      vec2 kick = vec2(
        sin(phase * 19.0 + 1.7),
        cos(phase * 17.0 - 0.9)
      ) * boundaryKick * 0.006 * uStrength;
      vec2 previousUv = clamp(uv + drift + radial + kick, vec2(0.001), vec2(0.999));
      vec4 source = texture(uSource, uv);
      vec4 previous = texture(uPrevious, previousUv);
      float retention = clamp(
        0.18 + uBuild * 0.43 + uSection * 0.12 + uBass * 0.08 - uDrop * 0.12,
        0.0,
        0.91
      ) * uHasHistory;
      vec3 carried = mix(source.rgb, previous.rgb, retention);
      carried += max(previous.rgb - source.rgb, vec3(0.0)) * retention * 0.08;
      float alpha = max(source.a, previous.a * retention);
      outColor = vec4(carried, alpha);
    }`;

  const DAMAGE_SHADER = `#version 300 es
    precision highp float;
    in vec2 vUv;
    out vec4 outColor;
    uniform sampler2D uInput;
    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uSeed;
    uniform float uBassPeak;
    uniform float uOnset;
    uniform float uTreble;
    uniform float uAcid;
    uniform float uEnsemble;
    uniform float uBoundary;
    uniform float uClimax;
    uniform float uDrop;
    uniform float uStrength;

    float hash21(vec2 value) {
      value = fract(value * vec2(123.34, 345.45));
      value += dot(value, value + 34.345);
      return fract(value.x * value.y);
    }

    void main() {
      vec2 uv = vUv;
      float macroEvent = max(uBoundary, max(uClimax, uDrop));
      float hit = max(uBassPeak, max(uOnset * 0.72, macroEvent));
      vec2 grid = vec2(
        mix(8.0, 28.0, uEnsemble),
        mix(6.0, 22.0, uTreble)
      );
      vec2 cell = floor(uv * grid);
      float cellNoise = hash21(cell + floor(uSeed * 4096.0));
      float blockMask = step(0.82 - uEnsemble * 0.16 - macroEvent * 0.14, cellNoise) * hit;
      float direction = hash21(cell.yx + uSeed * 731.0) * 2.0 - 1.0;
      vec2 blockOffset = vec2(
        direction * blockMask * (0.006 + uBassPeak * 0.065 + uClimax * 0.035),
        (hash21(cell + 18.7) - 0.5) * blockMask * uAcid * 0.018
      ) * uStrength;
      vec2 damagedUv = clamp(uv + blockOffset, vec2(0.001), vec2(0.999));
      float split = (0.0007 + uTreble * 0.0045 + uAcid * 0.008 + hit * 0.003) * uStrength;
      vec2 splitDirection = normalize(vec2(1.0, 0.16 + uAcid * 0.54));
      float red = texture(uInput, clamp(damagedUv + splitDirection * split, vec2(0.001), vec2(0.999))).r;
      vec4 centerSample = texture(uInput, damagedUv);
      float green = centerSample.g;
      float blue = texture(uInput, clamp(damagedUv - splitDirection * split, vec2(0.001), vec2(0.999))).b;
      vec3 color = vec3(red, green, blue);

      float scan = sin((uv.y * uResolution.y + uTime * (32.0 + uTreble * 88.0)) * 3.14159265);
      color *= 1.0 - (0.012 + uTreble * 0.075) * (0.5 + 0.5 * scan);
      float fineNoise = hash21(floor(uv * uResolution * vec2(0.34, 0.52)) + floor(uTime * 37.0));
      color += (fineNoise - 0.5) * (uTreble * 0.035 + uAcid * 0.028) * uStrength;

      float lossMask = step(0.91 - uDrop * 0.2, hash21(cell * vec2(0.73, 1.37) + uSeed * 97.0));
      color *= 1.0 - lossMask * uDrop * 0.88;
      float alpha = centerSample.a * (1.0 - lossMask * uDrop * 0.72);
      float whiteTear = step(0.985 - uClimax * 0.018, hash21(vec2(cell.y, floor(uv.y * 180.0)) + uSeed));
      color += vec3(whiteTear * uClimax * 0.34);
      outColor = vec4(max(color, vec3(0.0)), alpha);
    }`;

  const COMPOSITE_SHADER = `#version 300 es
    precision highp float;
    in vec2 vUv;
    out vec4 outColor;
    uniform sampler2D uInput;
    uniform vec3 uMainColor;
    uniform vec3 uHotColor;
    uniform float uLoudness;
    uniform float uTreble;
    uniform float uAcid;
    uniform float uEnsemble;
    uniform float uFlash;
    uniform float uStrength;

    vec3 saturation(vec3 color, float amount) {
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      return mix(vec3(luma), color, amount);
    }

    void main() {
      vec4 inputColor = texture(uInput, vUv);
      vec3 color = inputColor.rgb;
      float brightness = 0.96 + uLoudness * 0.34 + uFlash * 0.11;
      float contrast = 1.0 + uAcid * 0.34 + uFlash * 0.18;
      color = (color - 0.5) * contrast + 0.5;
      color *= brightness;
      color = saturation(color, 0.92 + uEnsemble * 0.58 + uTreble * 0.18);
      vec3 tint = mix(uMainColor, uHotColor, clamp(uTreble + uFlash * 0.5, 0.0, 1.0));
      color += tint * (uAcid * 0.025 + uFlash * 0.095) * uStrength;
      outColor = vec4(max(color, vec3(0.0)), inputColor.a);
    }`;

  function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader) || 'shader-compile-failed';
      gl.deleteShader(shader);
      throw new Error(message);
    }
    return shader;
  }

  function createProgram(gl, fragmentSource, uniformNames) {
    const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(program) || 'program-link-failed';
      gl.deleteProgram(program);
      throw new Error(message);
    }
    const uniforms = Object.fromEntries(uniformNames.map(name => [name, gl.getUniformLocation(program, name)]));
    return { program, uniforms };
  }

  class GlitchWebGLRenderer {
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      this.options = options;
      this.gl = null;
      this.available = false;
      this.lost = false;
      this.error = '';
      this.width = 0;
      this.height = 0;
      this.cssWidth = 0;
      this.cssHeight = 0;
      this.readIndex = 0;
      this.hasHistory = false;
      this.lastFrame = null;
      this.programs = [];
      this.targets = [];
      this.uploadCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
      this.uploadContext = this.uploadCanvas?.getContext('2d', { alpha: true, desynchronized: true }) || null;
      this.onContextLost = event => {
        event.preventDefault();
        this.lost = true;
        this.available = false;
        this.error = 'webgl-context-lost';
        this.options.onState?.(this.get());
      };
      this.onContextRestored = () => {
        this.lost = false;
        try {
          this.initializeResources();
          if (this.cssWidth && this.cssHeight) this.resize(this.cssWidth, this.cssHeight, this.lastDpr || 1, this.lastScale || .75);
          this.options.onState?.(this.get());
        } catch (error) {
          this.available = false;
          this.error = error.message;
          this.options.onState?.(this.get());
        }
      };
      if (!canvas || !this.uploadContext) {
        this.error = 'webgl-canvas-missing';
        return;
      }
      canvas.addEventListener('webglcontextlost', this.onContextLost, false);
      canvas.addEventListener('webglcontextrestored', this.onContextRestored, false);
      try {
        this.gl = canvas.getContext('webgl2', {
          alpha: true,
          antialias: false,
          depth: false,
          stencil: false,
          premultipliedAlpha: false,
          preserveDrawingBuffer: false,
          powerPreference: 'high-performance'
        });
        if (!this.gl) throw new Error('webgl2-unavailable');
        this.initializeResources();
      } catch (error) {
        this.available = false;
        this.error = error.message;
      }
    }

    initializeResources() {
      const gl = this.gl;
      if (!gl) throw new Error('webgl2-unavailable');
      this.destroyResources();
      this.feedbackProgram = createProgram(gl, FEEDBACK_SHADER, [
        'uSource', 'uPrevious', 'uResolution', 'uTime', 'uHasHistory',
        'uBass', 'uMid', 'uBuild', 'uSection', 'uBoundary', 'uClimax', 'uDrop', 'uStrength'
      ]);
      this.damageProgram = createProgram(gl, DAMAGE_SHADER, [
        'uInput', 'uResolution', 'uTime', 'uSeed', 'uBassPeak', 'uOnset',
        'uTreble', 'uAcid', 'uEnsemble', 'uBoundary', 'uClimax', 'uDrop', 'uStrength'
      ]);
      this.compositeProgram = createProgram(gl, COMPOSITE_SHADER, [
        'uInput', 'uMainColor', 'uHotColor', 'uLoudness', 'uTreble',
        'uAcid', 'uEnsemble', 'uFlash', 'uStrength'
      ]);
      this.programs = [this.feedbackProgram, this.damageProgram, this.compositeProgram];
      this.vao = gl.createVertexArray();
      this.sourceTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.disable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);
      this.available = true;
      this.error = '';
    }

    destroyResources() {
      const gl = this.gl;
      if (!gl) return;
      for (const target of this.targets) {
        if (target.texture) gl.deleteTexture(target.texture);
        if (target.framebuffer) gl.deleteFramebuffer(target.framebuffer);
      }
      this.targets = [];
      for (const item of this.programs) if (item?.program) gl.deleteProgram(item.program);
      this.programs = [];
      if (this.sourceTexture) gl.deleteTexture(this.sourceTexture);
      if (this.vao) gl.deleteVertexArray(this.vao);
      this.sourceTexture = null;
      this.vao = null;
      this.width = 0;
      this.height = 0;
    }

    createTarget(width, height) {
      const gl = this.gl;
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        gl.deleteFramebuffer(framebuffer);
        gl.deleteTexture(texture);
        throw new Error('framebuffer-incomplete');
      }
      return { texture, framebuffer };
    }

    resize(cssWidth, cssHeight, dpr = 1, scale = .75) {
      if (!this.available || !this.gl) return false;
      this.cssWidth = Math.max(1, Math.round(cssWidth));
      this.cssHeight = Math.max(1, Math.round(cssHeight));
      this.lastDpr = clamp(dpr, .5, 2);
      this.lastScale = clamp(scale, .45, 1);
      const maxDimension = Math.max(1280, Number(this.options.maxDimension) || 2560);
      const ratio = Math.min(1, maxDimension / Math.max(this.cssWidth * this.lastDpr, this.cssHeight * this.lastDpr));
      const width = Math.max(2, Math.round(this.cssWidth * this.lastDpr * this.lastScale * ratio));
      const height = Math.max(2, Math.round(this.cssHeight * this.lastDpr * this.lastScale * ratio));
      this.canvas.style.width = `${this.cssWidth}px`;
      this.canvas.style.height = `${this.cssHeight}px`;
      if (width === this.width && height === this.height) return true;
      this.width = width;
      this.height = height;
      this.canvas.width = width;
      this.canvas.height = height;
      this.uploadCanvas.width = width;
      this.uploadCanvas.height = height;
      const gl = this.gl;
      for (const target of this.targets) {
        gl.deleteTexture(target.texture);
        gl.deleteFramebuffer(target.framebuffer);
      }
      this.targets = [
        this.createTarget(width, height),
        this.createTarget(width, height),
        this.createTarget(width, height)
      ];
      gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      this.reset();
      return true;
    }

    clearTarget(target) {
      const gl = this.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, target?.framebuffer || null);
      gl.viewport(0, 0, this.width, this.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    reset() {
      if (!this.available || !this.targets.length) return false;
      for (const target of this.targets) this.clearTarget(target);
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
      this.readIndex = 0;
      this.hasHistory = false;
      this.lastFrame = null;
      return true;
    }

    bindTexture(unit, texture) {
      const gl = this.gl;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
    }

    upload(sourceCanvas) {
      if (!sourceCanvas?.width || !sourceCanvas?.height) return false;
      try {
        this.uploadContext.setTransform(1, 0, 0, 1, 0, 0);
        this.uploadContext.clearRect(0, 0, this.width, this.height);
        this.uploadContext.drawImage(sourceCanvas, 0, 0, this.width, this.height);
        const gl = this.gl;
        gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.uploadCanvas);
        return true;
      } catch (error) {
        this.error = `source-upload-failed: ${error.message}`;
        return false;
      }
    }

    draw(programInfo, target, configure) {
      const gl = this.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, target?.framebuffer || null);
      gl.viewport(0, 0, this.width, this.height);
      gl.useProgram(programInfo.program);
      gl.bindVertexArray(this.vao);
      configure(programInfo.uniforms);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    present() {
      if (!this.available || !this.lastFrame || !this.targets.length) return false;
      const gl = this.gl;
      const frame = this.lastFrame;
      const texture = this.targets[this.readIndex].texture;
      this.draw(this.compositeProgram, null, uniforms => {
        this.bindTexture(0, texture);
        gl.uniform1i(uniforms.uInput, 0);
        gl.uniform3fv(uniforms.uMainColor, frame.mainColor);
        gl.uniform3fv(uniforms.uHotColor, frame.hotColor);
        gl.uniform1f(uniforms.uLoudness, frame.continuous.loudness);
        gl.uniform1f(uniforms.uTreble, frame.continuous.treble);
        gl.uniform1f(uniforms.uAcid, frame.continuous.acid);
        gl.uniform1f(uniforms.uEnsemble, frame.continuous.ensemble);
        gl.uniform1f(uniforms.uFlash, Math.max(frame.events.climaxEnter, frame.events.dropEnter));
        gl.uniform1f(uniforms.uStrength, frame.strength);
      });
      return true;
    }

    render(frame = {}) {
      if (!this.available || this.lost || !this.targets.length || !this.upload(frame.sourceCanvas)) return false;
      const gl = this.gl;
      const continuous = frame.features?.continuous || {};
      const events = frame.features?.events || {};
      const strength = clamp(frame.strength, .25, 2);
      const time = Math.max(0, Number(frame.time) || 0) / 1000;
      const palette = frame.palette || {};
      const mainColor = (palette.main || [141, 124, 255]).map(value => clamp(value / 255, 0, 1));
      const hotColor = (palette.hot || [114, 232, 206]).map(value => clamp(value / 255, 0, 1));
      const writeIndex = 1 - this.readIndex;
      const previous = this.targets[this.readIndex];
      const next = this.targets[writeIndex];
      const work = this.targets[2];

      this.draw(this.feedbackProgram, work, uniforms => {
        this.bindTexture(0, this.sourceTexture);
        this.bindTexture(1, previous.texture);
        gl.uniform1i(uniforms.uSource, 0);
        gl.uniform1i(uniforms.uPrevious, 1);
        gl.uniform2f(uniforms.uResolution, this.width, this.height);
        gl.uniform1f(uniforms.uTime, time);
        gl.uniform1f(uniforms.uHasHistory, this.hasHistory ? 1 : 0);
        gl.uniform1f(uniforms.uBass, clamp01(continuous.bassSmooth));
        gl.uniform1f(uniforms.uMid, clamp01(continuous.midSmooth));
        gl.uniform1f(uniforms.uBuild, clamp01(continuous.build));
        gl.uniform1f(uniforms.uSection, clamp01(continuous.sectionDrive));
        gl.uniform1f(uniforms.uBoundary, clamp01(events.sectionBoundary));
        gl.uniform1f(uniforms.uClimax, clamp01(events.climaxEnter));
        gl.uniform1f(uniforms.uDrop, clamp01(events.dropEnter));
        gl.uniform1f(uniforms.uStrength, strength);
      });

      this.draw(this.damageProgram, next, uniforms => {
        this.bindTexture(0, work.texture);
        gl.uniform1i(uniforms.uInput, 0);
        gl.uniform2f(uniforms.uResolution, this.width, this.height);
        gl.uniform1f(uniforms.uTime, time);
        gl.uniform1f(uniforms.uSeed, clamp01(frame.features?.seed));
        gl.uniform1f(uniforms.uBassPeak, clamp01(events.bassPeak));
        gl.uniform1f(uniforms.uOnset, clamp01(events.onset));
        gl.uniform1f(uniforms.uTreble, clamp01(continuous.trebleSmooth));
        gl.uniform1f(uniforms.uAcid, clamp01(continuous.acid));
        gl.uniform1f(uniforms.uEnsemble, clamp01(continuous.ensemble));
        gl.uniform1f(uniforms.uBoundary, clamp01(events.sectionBoundary));
        gl.uniform1f(uniforms.uClimax, clamp01(events.climaxEnter));
        gl.uniform1f(uniforms.uDrop, clamp01(events.dropEnter));
        gl.uniform1f(uniforms.uStrength, strength);
      });

      this.readIndex = writeIndex;
      this.hasHistory = true;
      this.lastFrame = {
        continuous: { ...continuous },
        events: { ...events },
        strength,
        mainColor,
        hotColor
      };
      this.present();
      this.error = '';
      return true;
    }

    get() {
      return {
        available: this.available,
        lost: this.lost,
        error: this.error,
        width: this.width,
        height: this.height,
        hasHistory: this.hasHistory
      };
    }

    dispose() {
      this.destroyResources();
      this.canvas?.removeEventListener('webglcontextlost', this.onContextLost);
      this.canvas?.removeEventListener('webglcontextrestored', this.onContextRestored);
      this.available = false;
    }
  }

  return Object.freeze({
    create: (canvas, options) => new GlitchWebGLRenderer(canvas, options),
    shaders: Object.freeze({
      vertex: VERTEX_SHADER,
      feedback: FEEDBACK_SHADER,
      damage: DAMAGE_SHADER,
      composite: COMPOSITE_SHADER
    })
  });
});
