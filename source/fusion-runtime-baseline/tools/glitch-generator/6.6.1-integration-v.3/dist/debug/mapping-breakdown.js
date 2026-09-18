import { createMappingCard } from '../schema/defaults.js';
const finiteOr = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
function mappingReasonFor(input) {
    if (!input.mapping) {
        return { reason: 'NO_MAPPING', explanation: 'No MappingCard is selected.' };
    }
    const mapping = createMappingCard(input.mapping);
    if (input.rackEnabled === false) {
        return { reason: 'RACK_BYPASSED', explanation: 'FX Rack is bypassed.' };
    }
    if (!mapping.enabled) {
        return {
            reason: 'MAPPING_BYPASSED',
            explanation: 'This MappingCard is bypassed.'
        };
    }
    if (input.soloMappingId &&
        input.soloMappingId !== mapping.id) {
        return {
            reason: 'SOLO_FILTERED',
            explanation: `Solo is isolating ${input.soloMappingId}.`
        };
    }
    if (!mapping.sourceId) {
        return { reason: 'MISSING_SOURCE', explanation: 'No source is assigned.' };
    }
    if (!mapping.targetId) {
        return { reason: 'MISSING_TARGET', explanation: 'No target is assigned.' };
    }
    if (input.gateDecision && !input.gateDecision.open) {
        return {
            reason: 'GATE_CLOSED',
            explanation: `Gate ${input.gateDecision.sourceId} is ` +
                `${input.gateDecision.sourceValue.toFixed(3)} < ` +
                `${input.gateDecision.threshold.toFixed(3)}.`
        };
    }
    if (!input.contribution) {
        return mapping.kind === 'event'
            ? {
                reason: 'WAITING_EVENT',
                explanation: 'Event mapping is armed and waiting for a trigger.'
            }
            : {
                reason: 'ZERO_OUTPUT',
                explanation: 'The mapping produced no contribution this frame.'
            };
    }
    if (input.contribution.normalizedValue <= 1e-6 &&
        finiteOr(input.sourceValue) <= mapping.threshold) {
        return {
            reason: 'BELOW_THRESHOLD',
            explanation: `Source is below threshold ${mapping.threshold.toFixed(3)}.`
        };
    }
    if (input.contribution.probability < 1 &&
        input.contribution.probabilitySample >= input.contribution.probability) {
        return {
            reason: 'PROBABILITY_BLOCKED',
            explanation: `Probability sample ${input.contribution.probabilitySample.toFixed(3)} ` +
                `did not pass ${input.contribution.probability.toFixed(3)}.`
        };
    }
    if (Math.abs(input.contribution.value) <= 1e-9) {
        return {
            reason: 'ZERO_OUTPUT',
            explanation: 'Conditioning is active, but the mapped output is zero.'
        };
    }
    return {
        reason: 'CONTRIBUTING',
        explanation: 'This MappingCard is contributing to its target.'
    };
}
export function explainMappingContribution(input) {
    const mapping = input.mapping
        ? createMappingCard(input.mapping)
        : null;
    const baseTargetValue = finiteOr(input.baseTargetValue);
    const finalTargetValue = finiteOr(input.finalTargetValue, baseTargetValue);
    const targetMoved = Math.abs(finalTargetValue - baseTargetValue) > 1e-6;
    const mappingReason = mappingReasonFor(input);
    const selectedContributed = input.contribution !== undefined &&
        targetMoved &&
        mappingReason.reason === 'CONTRIBUTING' &&
        (mapping?.replaceMode !== 'replace' ||
            Math.abs(input.contribution.value - finalTargetValue) <= 1e-6);
    const targetReason = !targetMoved
        ? 'TARGET_AT_BASE'
        : selectedContributed
            ? 'SELECTED_MAPPING'
            : 'OTHER_MAPPING_OR_POST_PROCESS';
    const targetExplanation = targetReason === 'TARGET_AT_BASE'
        ? 'Target remains at its base value.'
        : targetReason === 'SELECTED_MAPPING'
            ? 'Selected mapping moved the target away from base.'
            : 'Target moved through another mapping or a later processing stage.';
    return Object.freeze({
        mappingId: mapping?.id ?? '',
        targetId: mapping?.targetId ?? '',
        sourceValue: finiteOr(input.sourceValue),
        normalizedValue: finiteOr(input.contribution?.normalizedValue),
        conditionedValue: finiteOr(input.contribution?.conditionedValue),
        contributionValue: finiteOr(input.contribution?.value),
        baseTargetValue,
        finalTargetValue,
        mappingReason: mappingReason.reason,
        mappingExplanation: mappingReason.explanation,
        targetReason,
        targetExplanation
    });
}
//# sourceMappingURL=mapping-breakdown.js.map