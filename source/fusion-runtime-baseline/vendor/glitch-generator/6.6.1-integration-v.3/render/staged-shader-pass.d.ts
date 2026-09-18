export interface ShaderPassDescriptor {
    readonly label: string;
    readonly source: string;
    readonly revision: number;
}
export declare const VALID_SHADER_PASS_SAMPLE = "#version 300 es\nprecision highp float;\nin vec2 vUv;\nout vec4 outColor;\nuniform sampler2D uPreviousFrame;\nuniform float uTime;\nuniform float u_corruptionAmount;\n\nvoid main() {\n  float corruption = clamp(u_corruptionAmount, 0.0, 1.0);\n  float tearBand = step(\n    0.72,\n    fract(sin(floor(vUv.y * 42.0) + floor(uTime * 9.0)) * 43758.5453)\n  );\n  vec2 damagedUv = vUv;\n  damagedUv.x += tearBand * corruption * 0.08;\n  vec3 previous = texture(uPreviousFrame, damagedUv).rgb;\n  float pulse = 0.5 + 0.5 * sin((vUv.y + uTime * 0.08) * 48.0);\n  vec3 signal = mix(vec3(0.08, 0.02, 0.16), vec3(0.18, 0.92, 0.72), pulse);\n  signal.r += tearBand * corruption * 0.45;\n  outColor = vec4(max(previous * 0.94, signal * 0.24), 1.0);\n}";
export declare const BROKEN_SHADER_PASS_SAMPLE = "#version 300 es\nprecision highp float;\nin vec2 vUv;\nout vec4 outColor;\n\nvoid main() {\n  outColor = vec4(vUv, 0.5, 1.0)\n}";
export interface ShaderPassCompilation<Resource> {
    readonly resource: Resource;
    readonly log: string;
}
export interface ShaderPassStageResult {
    readonly applied: boolean;
    readonly status: 'applied' | 'rejected';
    readonly log: string;
    readonly livePass: ShaderPassDescriptor;
}
export interface StagedShaderPassOptions<Resource> {
    readonly initialResource: Resource;
    readonly initialSource: string;
    readonly initialLabel?: string;
    readonly compile: (source: string) => ShaderPassCompilation<Resource>;
    readonly dispose: (resource: Resource) => void;
}
/**
 * Owns exactly one live shader resource. Candidates compile outside live state;
 * only a successful compilation may replace the current resource.
 */
export declare class StagedShaderPass<Resource> {
    private readonly options;
    private resource;
    private descriptor;
    private disposed;
    constructor(options: StagedShaderPassOptions<Resource>);
    get liveResource(): Resource;
    get livePass(): ShaderPassDescriptor;
    stage(source: string, label?: string): ShaderPassStageResult;
    dispose(): void;
    private rejected;
    private assertActive;
}
//# sourceMappingURL=staged-shader-pass.d.ts.map