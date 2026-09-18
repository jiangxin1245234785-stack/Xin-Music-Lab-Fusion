import type { MappingCard, ResolvedMappingCard } from '../schema/types.js';
export interface MappingMacroState {
    readonly intensity?: number;
    readonly response?: number;
}
export declare function applyMappingMacros(mappings: readonly MappingCard[], macros?: MappingMacroState): readonly ResolvedMappingCard[];
//# sourceMappingURL=mapping-macros.d.ts.map