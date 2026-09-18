import { createMappingCard } from '../schema/defaults.js';
export function filterMappingsForRuntime(mappings, options = {}) {
    const rackEnabled = options.rackEnabled !== false;
    const soloId = options.soloMappingId ?? null;
    return mappings.map(input => {
        const mapping = createMappingCard(input);
        const isolated = soloId === null || mapping.id === soloId;
        return createMappingCard({
            ...mapping,
            enabled: rackEnabled && isolated && mapping.enabled
        });
    });
}
export function toggleMappingBypass(mappings, mappingId) {
    return mappings.map(input => {
        const mapping = createMappingCard(input);
        return mapping.id === mappingId
            ? createMappingCard({ ...mapping, enabled: !mapping.enabled })
            : mapping;
    });
}
function nextDuplicateId(mappings, sourceId) {
    const occupied = new Set(mappings.map(mapping => mapping.id ?? ''));
    const stem = `${sourceId || 'mapping'}-copy`;
    if (!occupied.has(stem))
        return stem;
    let suffix = 2;
    while (occupied.has(`${stem}-${suffix}`))
        suffix++;
    return `${stem}-${suffix}`;
}
export function duplicateMapping(mappings, mappingId) {
    const result = mappings.map(createMappingCard);
    const source = result.find(mapping => mapping.id === mappingId);
    if (!source)
        return { mappings: result, duplicateId: null };
    const duplicateId = nextDuplicateId(result, source.id);
    result.push(createMappingCard({ ...source, id: duplicateId }));
    return { mappings: result, duplicateId };
}
export function deleteMapping(mappings, mappingId) {
    return mappings
        .filter(mapping => mapping.id !== mappingId)
        .map(createMappingCard);
}
export function createNextMapping(mappings, template = {}) {
    const occupied = new Set(mappings.map(mapping => mapping.id ?? ''));
    let suffix = mappings.length + 1;
    while (occupied.has(`mapping-${suffix}`))
        suffix++;
    return createMappingCard({
        id: `mapping-${suffix}`,
        ...template
    });
}
//# sourceMappingURL=mapping-operations.js.map