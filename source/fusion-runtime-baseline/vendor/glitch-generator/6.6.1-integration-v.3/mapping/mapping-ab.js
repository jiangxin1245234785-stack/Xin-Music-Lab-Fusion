import { createMappingCard, createMappingParameterSet } from '../schema/defaults.js';
function variantKey(variant) {
    return variant === 'B' ? 'b' : 'a';
}
export function updateMappingABParameters(input, patch, variant) {
    const mapping = createMappingCard(input);
    const selected = variant ?? mapping.ab.active;
    const key = variantKey(selected);
    const parameters = createMappingParameterSet(patch, mapping.ab[key]);
    return createMappingCard({
        ...mapping,
        ab: {
            ...mapping.ab,
            [key]: parameters
        }
    });
}
export function setMappingABVariant(input, variant) {
    const mapping = createMappingCard(input);
    return createMappingCard({
        ...mapping,
        ab: {
            ...mapping.ab,
            active: variant
        }
    });
}
export function setMappingABVariantById(mappings, mappingId, variant) {
    return mappings.map(input => {
        const mapping = createMappingCard(input);
        return mapping.id === mappingId
            ? setMappingABVariant(mapping, variant)
            : mapping;
    });
}
//# sourceMappingURL=mapping-ab.js.map