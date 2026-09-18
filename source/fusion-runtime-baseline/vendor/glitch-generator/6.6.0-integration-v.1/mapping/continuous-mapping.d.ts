import type { EngineClockFrame } from '../clock/engine-clock.js';
import type { MappingCard, MappingPolarity, MappingReplaceMode } from '../schema/types.js';
import type { MappingSourceValues } from './minimal-mapper.js';
export type MappingRandomSource = () => number;
export interface ContinuousMappingContribution {
    readonly mappingId: string;
    readonly sourceId: string;
    readonly targetId: string;
    readonly sourceValue: number;
    readonly normalizedValue: number;
    readonly polarizedValue: number;
    readonly conditionedValue: number;
    readonly value: number;
    readonly priority: number;
    readonly effectiveMagnitude: number;
    readonly gateSourceId: string;
    readonly gateThreshold: number;
    readonly polarity: MappingPolarity;
    readonly replaceMode: MappingReplaceMode;
    readonly safetyClamp: boolean;
    readonly probability: number;
    readonly probabilitySample: number;
    readonly eventVoiceCount: number;
}
export declare class ContinuousMappingProcessor {
    private readonly states;
    reset(): void;
    evaluate(mappings: readonly MappingCard[], sourceValues: MappingSourceValues, clock: EngineClockFrame, randomFloat?: MappingRandomSource): readonly ContinuousMappingContribution[];
}
//# sourceMappingURL=continuous-mapping.d.ts.map