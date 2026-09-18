import { type VisualTargetDefinition } from '../render/visual-targets.js';
import type { VisualTargetState } from '../schema/types.js';
export interface EnergyDebugTargetCost {
    readonly targetId: string;
    readonly normalizedImpact: number;
}
export interface GlobalEnergyDebugSample {
    readonly aggregate: number;
    readonly normalized: number;
    readonly activeTargets: number;
    readonly totalTargets: number;
    readonly peakTargetId: string;
    readonly peakTargetImpact: number;
    readonly targetCosts: readonly EnergyDebugTargetCost[];
}
export declare function measureGlobalEnergyDebug(state: VisualTargetState, registry?: readonly VisualTargetDefinition[]): GlobalEnergyDebugSample;
//# sourceMappingURL=energy-debug.d.ts.map