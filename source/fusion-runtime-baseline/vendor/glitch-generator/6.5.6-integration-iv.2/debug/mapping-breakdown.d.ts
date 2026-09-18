import type { ContinuousMappingContribution } from '../mapping/index.js';
import type { GateDecision } from '../mixer/index.js';
import type { MappingCard } from '../schema/types.js';
export type MappingDebugReason = 'NO_MAPPING' | 'RACK_BYPASSED' | 'MAPPING_BYPASSED' | 'SOLO_FILTERED' | 'MISSING_SOURCE' | 'MISSING_TARGET' | 'GATE_CLOSED' | 'WAITING_EVENT' | 'PROBABILITY_BLOCKED' | 'BELOW_THRESHOLD' | 'ZERO_OUTPUT' | 'CONTRIBUTING';
export type TargetDebugReason = 'TARGET_AT_BASE' | 'SELECTED_MAPPING' | 'OTHER_MAPPING_OR_POST_PROCESS';
export interface MappingContributionDebugInput {
    readonly mapping?: MappingCard | undefined;
    readonly contribution?: ContinuousMappingContribution | undefined;
    readonly gateDecision?: GateDecision | undefined;
    readonly sourceValue?: number;
    readonly baseTargetValue?: number;
    readonly finalTargetValue?: number;
    readonly rackEnabled?: boolean;
    readonly soloMappingId?: string | null;
}
export interface MappingContributionBreakdown {
    readonly mappingId: string;
    readonly targetId: string;
    readonly sourceValue: number;
    readonly normalizedValue: number;
    readonly conditionedValue: number;
    readonly contributionValue: number;
    readonly baseTargetValue: number;
    readonly finalTargetValue: number;
    readonly mappingReason: MappingDebugReason;
    readonly mappingExplanation: string;
    readonly targetReason: TargetDebugReason;
    readonly targetExplanation: string;
}
export declare function explainMappingContribution(input: MappingContributionDebugInput): MappingContributionBreakdown;
//# sourceMappingURL=mapping-breakdown.d.ts.map