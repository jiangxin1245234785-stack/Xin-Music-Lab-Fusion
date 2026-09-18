import type { VisualTargetState } from '../schema/types.js';
export declare const FORMAL_TARGET_UNIFORM_CONTRACT: "xin.generator-target-uniform-bindings/1";
export interface FormalTargetUniformBindingDefinition {
    readonly targetId: string;
    readonly uniformName: string;
}
export interface ResolvedFormalTargetUniformBinding extends FormalTargetUniformBindingDefinition {
    readonly value: number;
}
export declare const FORMAL_TARGET_UNIFORM_BINDINGS: readonly FormalTargetUniformBindingDefinition[];
export declare function requiredFormalTargetValue(state: VisualTargetState, targetId: string): number;
export declare function resolveFormalTargetUniformBindings(state: VisualTargetState): readonly ResolvedFormalTargetUniformBinding[];
//# sourceMappingURL=formal-target-uniform-bindings.d.ts.map