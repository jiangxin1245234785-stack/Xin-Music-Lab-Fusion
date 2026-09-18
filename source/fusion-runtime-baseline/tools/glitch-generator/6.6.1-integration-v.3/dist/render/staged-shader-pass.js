export const VALID_SHADER_PASS_SAMPLE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uPreviousFrame;
uniform float uTime;
uniform float u_corruptionAmount;

void main() {
  float corruption = clamp(u_corruptionAmount, 0.0, 1.0);
  float tearBand = step(
    0.72,
    fract(sin(floor(vUv.y * 42.0) + floor(uTime * 9.0)) * 43758.5453)
  );
  vec2 damagedUv = vUv;
  damagedUv.x += tearBand * corruption * 0.08;
  vec3 previous = texture(uPreviousFrame, damagedUv).rgb;
  float pulse = 0.5 + 0.5 * sin((vUv.y + uTime * 0.08) * 48.0);
  vec3 signal = mix(vec3(0.08, 0.02, 0.16), vec3(0.18, 0.92, 0.72), pulse);
  signal.r += tearBand * corruption * 0.45;
  outColor = vec4(max(previous * 0.94, signal * 0.24), 1.0);
}`;
export const BROKEN_SHADER_PASS_SAMPLE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

void main() {
  outColor = vec4(vUv, 0.5, 1.0)
}`;
/**
 * Owns exactly one live shader resource. Candidates compile outside live state;
 * only a successful compilation may replace the current resource.
 */
export class StagedShaderPass {
    options;
    resource;
    descriptor;
    disposed = false;
    constructor(options) {
        this.options = options;
        this.resource = options.initialResource;
        this.descriptor = Object.freeze({
            label: options.initialLabel ?? 'Built-in feedback pass',
            source: options.initialSource,
            revision: 0
        });
    }
    get liveResource() {
        this.assertActive();
        return this.resource;
    }
    get livePass() {
        return this.descriptor;
    }
    stage(source, label = 'Uploaded GLSL pass') {
        this.assertActive();
        if (source.trim().length === 0) {
            return this.rejected('Fragment shader source is empty.');
        }
        let candidate;
        try {
            candidate = this.options.compile(source);
        }
        catch (error) {
            return this.rejected(error instanceof Error ? error.message : String(error));
        }
        const previous = this.resource;
        this.resource = candidate.resource;
        this.descriptor = Object.freeze({
            label: label.trim() || 'Uploaded GLSL pass',
            source,
            revision: this.descriptor.revision + 1
        });
        let log = candidate.log.trim() || 'Compile and link succeeded.';
        try {
            this.options.dispose(previous);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            log += `\nWarning: previous shader cleanup failed: ${message}`;
        }
        return Object.freeze({
            applied: true,
            status: 'applied',
            log,
            livePass: this.descriptor
        });
    }
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.options.dispose(this.resource);
    }
    rejected(log) {
        return Object.freeze({
            applied: false,
            status: 'rejected',
            log,
            livePass: this.descriptor
        });
    }
    assertActive() {
        if (this.disposed)
            throw new Error('Staged shader pass is disposed.');
    }
}
//# sourceMappingURL=staged-shader-pass.js.map