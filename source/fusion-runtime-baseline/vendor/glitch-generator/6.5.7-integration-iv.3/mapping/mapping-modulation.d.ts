import type { MappingCard, MappingModulation, MappingModulationTarget, ResolvedMappingCard } from '../schema/types.js';
import type { MappingSourceValues } from './minimal-mapper.js';
export interface MappingModulationTrace {
    readonly id: string;
    readonly sourceId: string;
    readonly targetParameter: MappingModulationTarget;
    readonly sourceValue: number;
    readonly depth: number;
    readonly contribution: number;
}
export interface MappingModulationResolution {
    readonly mapping: ResolvedMappingCard;
    readonly traces: readonly MappingModulationTrace[];
}
export declare function resolveMappingModulations(input: MappingCard, sourceValues: MappingSourceValues): MappingModulationResolution;
export declare function resolveMappingCollectionModulations(mappings: readonly MappingCard[], sourceValues: MappingSourceValues): readonly ResolvedMappingCard[];
export declare function createNextMappingModulation(input: MappingCard, template?: MappingModulation): ResolvedMappingCard;
export declare function updateMappingModulation(input: MappingCard, modulationId: string, patch: MappingModulation): ResolvedMappingCard;
export declare function deleteMappingModulation(input: MappingCard, modulationId: string): ResolvedMappingCard;
//# sourceMappingURL=mapping-modulation.d.ts.map