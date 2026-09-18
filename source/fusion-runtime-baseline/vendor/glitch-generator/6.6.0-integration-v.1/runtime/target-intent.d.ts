import type { ResolvedVisualTargetState } from '../schema/types.js';
export declare const TARGET_INTENT_CONTRACT: "xin.generator-target-intent/1";
export type VisualIntentDimension = 'luminance' | 'motion' | 'texture' | 'rupture' | 'color';
export type VisualIntentLevel = 'QUIET' | 'PRESENT' | 'INTENSE';
export interface TargetIntentDimensionReport {
    readonly id: VisualIntentDimension;
    readonly level: VisualIntentLevel;
    readonly targetIds: readonly string[];
}
export interface GeneratorTargetIntent {
    readonly contract: typeof TARGET_INTENT_CONTRACT;
    readonly dimensions: Readonly<Record<VisualIntentDimension, TargetIntentDimensionReport>>;
}
/**
 * Summarizes final Generator targets as semantic visual intentions.
 * It intentionally has no audio input and exposes no raw cross-engine delta.
 */
export declare function describeGeneratorTargetIntent(targets: ResolvedVisualTargetState): GeneratorTargetIntent;
//# sourceMappingURL=target-intent.d.ts.map