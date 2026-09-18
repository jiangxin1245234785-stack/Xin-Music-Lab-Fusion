import type { VisualTargetDefinition } from './visual-targets.js';
export type GlslUniformType = 'float' | 'int' | 'bool';
export type GlslImpactCategory = 'high' | 'medium' | 'low';
export interface GlslUniformMetadata {
    readonly name?: string;
    readonly type?: GlslUniformType;
    readonly range?: readonly [number, number];
    readonly default?: number;
    readonly label?: string;
    readonly impactWeight?: number;
    readonly impactCategory?: GlslImpactCategory;
}
export interface ResolvedGlslUniformMetadata {
    readonly name: string;
    readonly type: GlslUniformType;
    readonly range: readonly [number, number];
    readonly default: number;
    readonly label: string;
    readonly impactWeight: number;
    readonly impactCategory: GlslImpactCategory;
}
export interface GlslUniformWarning {
    readonly code: 'IMPACT_WEIGHT_BELOW_RECOMMENDED';
    readonly message: string;
}
export interface GlslUniformTargetDefinition extends VisualTargetDefinition {
    readonly module: 'Custom(GLSL)';
    readonly uniformName: string;
    readonly uniformType: GlslUniformType;
    readonly impactWeight: number;
    readonly impactCategory: GlslImpactCategory;
}
export interface GlslUniformRegistration {
    readonly metadata: ResolvedGlslUniformMetadata;
    readonly target: GlslUniformTargetDefinition;
    readonly warnings: readonly GlslUniformWarning[];
}
export declare const GLSL_IMPACT_CATEGORY_DEFAULTS: Readonly<Record<GlslImpactCategory, {
    readonly weight: number;
    readonly minimum: number;
}>>;
export declare const GLSL_UNIFORM_METADATA_DEFAULTS: Readonly<Omit<ResolvedGlslUniformMetadata, 'name' | 'label'>>;
export declare const GLSL_ENGINE_UNIFORM_NAMES: ReadonlySet<string>;
export declare function glslUniformTargetId(name: string): string;
export declare function resolveGlslUniformMetadata(input: GlslUniformMetadata): ResolvedGlslUniformMetadata;
export declare function inspectGlslUniformImpact(metadata: ResolvedGlslUniformMetadata): readonly GlslUniformWarning[];
export declare function coerceGlslUniformValue(target: GlslUniformTargetDefinition, input: number): number;
export declare class GLSLUniformTargetRegistry {
    private readonly registrations;
    register(input: GlslUniformMetadata): GlslUniformRegistration;
    replace(name: string, input: GlslUniformMetadata): GlslUniformRegistration;
    remove(name: string): boolean;
    replaceAll(inputs: readonly GlslUniformMetadata[]): readonly GlslUniformRegistration[];
    clear(): void;
    get(name: string): GlslUniformRegistration | undefined;
    list(): readonly GlslUniformRegistration[];
    targetDefinitions(): readonly GlslUniformTargetDefinition[];
}
//# sourceMappingURL=glsl-uniform-target-registry.d.ts.map