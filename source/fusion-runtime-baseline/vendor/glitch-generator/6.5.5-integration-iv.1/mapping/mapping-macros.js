import { createMappingCard } from '../schema/defaults.js';
import { updateMappingABParameters } from './mapping-ab.js';
const finitePositive = (value, fallback) => Number.isFinite(value) && value > 0 ? value : fallback;
export function applyMappingMacros(mappings, macros = {}) {
    const intensity = finitePositive(macros.intensity, 1);
    const response = finitePositive(macros.response, 1);
    return mappings.map(input => {
        const mapping = createMappingCard(input);
        return updateMappingABParameters(mapping, {
            amount: mapping.amount * intensity,
            attackMs: mapping.attackMs / response,
            fallMs: mapping.fallMs / response
        });
    });
}
//# sourceMappingURL=mapping-macros.js.map