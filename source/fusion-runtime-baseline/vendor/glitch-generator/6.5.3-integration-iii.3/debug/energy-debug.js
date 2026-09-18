import { VISUAL_TARGET_REGISTRY } from '../render/visual-targets.js';
const clamp01 = (value) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
export function measureGlobalEnergyDebug(state, registry = VISUAL_TARGET_REGISTRY) {
    const costs = registry.map(definition => {
        const span = Math.max(1e-12, definition.max - definition.min);
        const value = Number(state.values?.[definition.id] ?? definition.defaultValue);
        return {
            targetId: definition.id,
            normalizedImpact: clamp01(Math.abs(value - definition.defaultValue) / span)
        };
    });
    const aggregate = Math.sqrt(costs.reduce((sum, target) => sum + target.normalizedImpact ** 2, 0));
    const peak = costs.reduce((current, target) => current === null ||
        target.normalizedImpact > current.normalizedImpact
        ? target
        : current, null);
    return Object.freeze({
        aggregate,
        normalized: clamp01(aggregate),
        activeTargets: costs.filter(target => target.normalizedImpact > 1e-6).length,
        totalTargets: costs.length,
        peakTargetId: peak?.targetId ?? '',
        peakTargetImpact: peak?.normalizedImpact ?? 0,
        targetCosts: costs.map(target => Object.freeze({ ...target }))
    });
}
//# sourceMappingURL=energy-debug.js.map