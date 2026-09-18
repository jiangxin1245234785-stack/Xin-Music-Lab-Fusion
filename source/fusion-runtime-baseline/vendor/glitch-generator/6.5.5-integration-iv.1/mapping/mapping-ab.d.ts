import type { MappingABVariant, MappingCard, MappingParameterSet, ResolvedMappingCard } from '../schema/types.js';
export declare function updateMappingABParameters(input: MappingCard, patch: MappingParameterSet, variant?: MappingABVariant): ResolvedMappingCard;
export declare function setMappingABVariant(input: MappingCard, variant: MappingABVariant): ResolvedMappingCard;
export declare function setMappingABVariantById(mappings: readonly MappingCard[], mappingId: string, variant: MappingABVariant): readonly ResolvedMappingCard[];
//# sourceMappingURL=mapping-ab.d.ts.map