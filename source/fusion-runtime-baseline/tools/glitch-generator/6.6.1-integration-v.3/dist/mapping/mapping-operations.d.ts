import type { MappingCard, ResolvedMappingCard } from '../schema/types.js';
export interface MappingRuntimeFilter {
    readonly rackEnabled?: boolean;
    readonly soloMappingId?: string | null;
}
export declare function filterMappingsForRuntime(mappings: readonly MappingCard[], options?: MappingRuntimeFilter): readonly ResolvedMappingCard[];
export declare function toggleMappingBypass(mappings: readonly MappingCard[], mappingId: string): readonly ResolvedMappingCard[];
export declare function duplicateMapping(mappings: readonly MappingCard[], mappingId: string): {
    readonly mappings: readonly ResolvedMappingCard[];
    readonly duplicateId: string | null;
};
export declare function deleteMapping(mappings: readonly MappingCard[], mappingId: string): readonly ResolvedMappingCard[];
export declare function createNextMapping(mappings: readonly MappingCard[], template?: MappingCard): ResolvedMappingCard;
//# sourceMappingURL=mapping-operations.d.ts.map