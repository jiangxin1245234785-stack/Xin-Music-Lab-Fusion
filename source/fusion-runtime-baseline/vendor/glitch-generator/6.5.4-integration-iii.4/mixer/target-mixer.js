import { ContinuousMappingProcessor, EventMappingProcessor, resolveMappingCollectionModulations } from '../mapping/index.js';
import { applyAbsolutePhysicalCaps } from '../render/physical-safety.js';
import { VISUAL_TARGET_BY_ID, VISUAL_TARGET_REGISTRY } from '../render/visual-targets.js';
import { createEnergyBudgetConfig, createVisualTargetState } from '../schema/defaults.js';
import { measurePerformanceStage } from '../performance/index.js';
export const TARGET_MIXER_STEPS = Object.freeze([
    'base',
    'multiply',
    'add',
    'max-min',
    'replace',
    'gate',
    'energy-budget-clamp'
]);
function cloneState(input) {
    return createVisualTargetState(input);
}
function resolveTargetDefinitions(extensions = []) {
    const definitions = new Map(VISUAL_TARGET_REGISTRY.map(target => [target.id, target]));
    for (const target of extensions)
        definitions.set(target.id, target);
    return Object.freeze([...definitions.values()]);
}
function targetDefinitionMap(definitions) {
    return new Map(definitions.map(target => [target.id, target]));
}
function withDynamicTargetDefaults(input, definitions) {
    const state = cloneState(input);
    const values = { ...state.values };
    for (const target of definitions) {
        if (!VISUAL_TARGET_BY_ID.has(target.id) &&
            !(target.id in values)) {
            values[target.id] = target.defaultValue;
        }
    }
    return { ...state, values };
}
function applyMultiplyLayer(input, contributions, targets) {
    const state = cloneState(input);
    const values = { ...state.values };
    for (const contribution of stableModeContributions(contributions, 'multiply')) {
        const current = Number(values[contribution.targetId] ?? 0);
        values[contribution.targetId] = applyMappingSafetyClamp(contribution, current * contribution.value, targets);
    }
    return { ...state, values };
}
function applyAddLayer(input, contributions, targets) {
    const state = cloneState(input);
    const values = { ...state.values };
    for (const contribution of stableModeContributions(contributions, 'add')) {
        const current = Number(values[contribution.targetId] ?? 0);
        values[contribution.targetId] = applyMappingSafetyClamp(contribution, current + contribution.value, targets);
    }
    return { ...state, values };
}
function applyMaxMinLayer(input, contributions, targets) {
    const state = cloneState(input);
    const values = { ...state.values };
    for (const contribution of stableModeContributions(contributions, 'max')) {
        const current = Number(values[contribution.targetId] ?? 0);
        values[contribution.targetId] = applyMappingSafetyClamp(contribution, Math.max(current, contribution.value), targets);
    }
    for (const contribution of stableModeContributions(contributions, 'min')) {
        const current = Number(values[contribution.targetId] ?? 0);
        values[contribution.targetId] = applyMappingSafetyClamp(contribution, Math.min(current, contribution.value), targets);
    }
    return { ...state, values };
}
function stableModeContributions(contributions, mode) {
    return [...contributions]
        .filter(contribution => contribution.replaceMode === mode)
        .sort((left, right) => left.mappingId.localeCompare(right.mappingId));
}
function applyMappingSafetyClamp(contribution, value, targets) {
    const finite = Number.isFinite(value) ? value : 0;
    if (!contribution.safetyClamp)
        return finite;
    const target = targets.get(contribution.targetId);
    if (!target)
        return finite;
    return Math.max(target.min, Math.min(target.max, finite));
}
function winsReplaceTie(candidate, incumbent) {
    if (candidate.priority !== incumbent.priority) {
        return candidate.priority > incumbent.priority;
    }
    if (candidate.effectiveMagnitude !== incumbent.effectiveMagnitude) {
        return candidate.effectiveMagnitude > incumbent.effectiveMagnitude;
    }
    return candidate.mappingId.localeCompare(incumbent.mappingId) < 0;
}
function applyReplaceLayer(input, contributions, targets) {
    const state = cloneState(input);
    const values = { ...state.values };
    const withMagnitudes = contributions.map(contribution => ({
        ...contribution,
        effectiveMagnitude: Math.abs(applyMappingSafetyClamp(contribution, contribution.value, targets) -
            Number(values[contribution.targetId] ?? 0))
    }));
    const winners = new Map();
    for (const contribution of withMagnitudes) {
        if (contribution.replaceMode !== 'replace')
            continue;
        const incumbent = winners.get(contribution.targetId);
        if (!incumbent || winsReplaceTie(contribution, incumbent)) {
            winners.set(contribution.targetId, contribution);
        }
    }
    for (const [targetId, winner] of winners) {
        values[targetId] = applyMappingSafetyClamp(winner, winner.value, targets);
    }
    return {
        state: { ...state, values },
        contributions: withMagnitudes,
        winners
    };
}
function applyGateLayer(input, base, contributions, sourceValues, targets) {
    const decisions = [];
    const openContributions = [];
    let hasClosedGate = false;
    for (const contribution of contributions) {
        if (!contribution.gateSourceId) {
            openContributions.push(contribution);
            continue;
        }
        const sourceValue = Math.max(0, Math.min(1, Number(sourceValues[contribution.gateSourceId] ?? 0)));
        const threshold = Math.max(0, Math.min(1, contribution.gateThreshold));
        const open = sourceValue >= threshold;
        decisions.push({
            mappingId: contribution.mappingId,
            targetId: contribution.targetId,
            sourceId: contribution.gateSourceId,
            sourceValue,
            threshold,
            open
        });
        if (open)
            openContributions.push(contribution);
        else
            hasClosedGate = true;
    }
    const state = hasClosedGate
        ? composeThroughReplace(base, openContributions, targets).replace
        : cloneState(input);
    return {
        state,
        decisions
    };
}
function composeThroughReplace(base, contributions, targets) {
    const multiply = applyMultiplyLayer(base, contributions, targets);
    const add = applyAddLayer(multiply, contributions, targets);
    const maxMin = applyMaxMinLayer(add, contributions, targets);
    const replaceResult = applyReplaceLayer(maxMin, contributions, targets);
    return {
        multiply,
        add,
        maxMin,
        replace: replaceResult.state,
        contributions: replaceResult.contributions
    };
}
function applyEnergyBudgetLayer(input, base, configInput, definitions) {
    const config = createEnergyBudgetConfig(configInput);
    const state = cloneState(input);
    const values = { ...state.values };
    const budget = Math.max(0.01, Math.min(100, Number.isFinite(config.budget) ? config.budget : 1));
    let rawWeightedEnergy = 0;
    let activeTargets = 0;
    for (const target of definitions) {
        const baseValue = Number(base.values?.[target.id] ?? target.defaultValue);
        const value = Number(values[target.id] ?? baseValue);
        const span = Math.max(1e-12, target.max - target.min);
        const impact = Math.abs(value - baseValue) / span;
        const configuredWeight = Math.max(0, Number.isFinite(config.weights[target.id])
            ? Number(config.weights[target.id])
            : 1);
        const declaredImpactWeight = Number('impactWeight' in target ? target.impactWeight : 1);
        const weight = configuredWeight * (Number.isFinite(declaredImpactWeight)
            ? Math.max(0, declaredImpactWeight)
            : 1);
        rawWeightedEnergy += impact * weight;
        if (impact > 1e-9 && weight > 0)
            activeTargets += 1;
    }
    const attenuation = config.enabled && rawWeightedEnergy > budget
        ? budget / rawWeightedEnergy
        : 1;
    if (attenuation < 1) {
        for (const target of definitions) {
            if (!(target.id in values))
                continue;
            const baseValue = Number(base.values?.[target.id] ?? target.defaultValue);
            values[target.id] =
                baseValue + (Number(values[target.id]) - baseValue) * attenuation;
        }
    }
    return {
        state: { ...state, values },
        decision: Object.freeze({
            enabled: config.enabled,
            budget,
            rawWeightedEnergy,
            finalWeightedEnergy: rawWeightedEnergy * attenuation,
            attenuation,
            activeTargets
        })
    };
}
export class TargetMixer {
    mappings = new ContinuousMappingProcessor();
    events = new EventMappingProcessor();
    reset() {
        this.mappings.reset();
        this.events.reset();
    }
    mixFrame(input) {
        // The order below is an invariant. Future phases may fill an existing layer,
        // but must not reorder or replace this seven-step pipeline.
        const setup = measurePerformanceStage(input.profiler, 'mixer', () => {
            const targetDefinitions = resolveTargetDefinitions(input.targetDefinitions);
            return {
                targetDefinitions,
                targetsById: targetDefinitionMap(targetDefinitions),
                base: withDynamicTargetDefaults(input.baseState ?? {}, targetDefinitions),
                randomFloat: input.randomFloat ?? (() => 0),
                energyConfig: createEnergyBudgetConfig(input.energyBudget)
            };
        });
        const evaluated = measurePerformanceStage(input.profiler, 'conditioning', () => {
            const modulatedMappings = resolveMappingCollectionModulations(input.mappings, input.sourceValues);
            const continuous = this.mappings.evaluate(modulatedMappings, input.sourceValues, input.clock, setup.randomFloat);
            const events = this.events.evaluate(modulatedMappings, input.envelopes ?? [], input.sourceValues, input.clock, setup.randomFloat, {
                enabled: setup.energyConfig.enabled,
                voiceLimit: setup.energyConfig.eventVoiceLimit,
                globalEventPolicy: setup.energyConfig.globalEventPolicy,
                experimentalQueueEnabled: setup.energyConfig.experimentalQueueEnabled
            });
            return [...continuous, ...events];
        });
        return measurePerformanceStage(input.profiler, 'mixer', () => {
            const composed = composeThroughReplace(setup.base, evaluated, setup.targetsById);
            const gateResult = applyGateLayer(composed.replace, setup.base, composed.contributions, input.sourceValues, setup.targetsById);
            const energyBudgetResult = applyEnergyBudgetLayer(gateResult.state, setup.base, setup.energyConfig, setup.targetDefinitions);
            const clamp = applyAbsolutePhysicalCaps(energyBudgetResult.state, setup.targetDefinitions);
            return {
                targets: clamp,
                contributions: composed.contributions,
                gateDecisions: gateResult.decisions,
                energyBudgetDecision: energyBudgetResult.decision,
                eventBudgetReport: this.events.getLastBudgetReport(),
                trace: {
                    base: setup.base,
                    multiply: composed.multiply,
                    add: composed.add,
                    maxMin: composed.maxMin,
                    replace: composed.replace,
                    gate: gateResult.state,
                    energyBudget: energyBudgetResult.state,
                    clamp
                }
            };
        });
    }
}
//# sourceMappingURL=target-mixer.js.map