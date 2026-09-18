import { TARGET_MIXER_STEPS } from '../../mixer/target-mixer.js';
import { resolveSemanticDescriptor, safeSemanticId } from './types.js';
function descriptor(id, spec) {
    return Object.freeze({
        id,
        kind: spec.kind,
        classification: 'stable',
        labelKey: spec.labelKey,
        descriptionKey: spec.descriptionKey,
        category: spec.category,
        unit: spec.unit ?? 'none',
        formatter: spec.formatter ?? 'raw',
        technicalAlias: spec.technicalAlias ?? id
    });
}
const MIXER_STEP_SPECS = {
    base: {
        labelKey: 'semantic.operation.mixer.base.label',
        descriptionKey: 'semantic.operation.mixer.base.description'
    },
    multiply: {
        labelKey: 'semantic.operation.mixer.multiply.label',
        descriptionKey: 'semantic.operation.mixer.multiply.description'
    },
    add: {
        labelKey: 'semantic.operation.mixer.add.label',
        descriptionKey: 'semantic.operation.mixer.add.description'
    },
    'max-min': {
        labelKey: 'semantic.operation.mixer.maxMin.label',
        descriptionKey: 'semantic.operation.mixer.maxMin.description'
    },
    replace: {
        labelKey: 'semantic.operation.mixer.replace.label',
        descriptionKey: 'semantic.operation.mixer.replace.description'
    },
    gate: {
        labelKey: 'semantic.operation.mixer.gate.label',
        descriptionKey: 'semantic.operation.mixer.gate.description'
    },
    'energy-budget-clamp': {
        labelKey: 'semantic.operation.mixer.energyBudgetClamp.label',
        descriptionKey: 'semantic.operation.mixer.energyBudgetClamp.description'
    }
};
export const MIXER_STEP_DESCRIPTORS = Object.freeze(TARGET_MIXER_STEPS.map(id => descriptor(id, {
    ...MIXER_STEP_SPECS[id],
    kind: 'operation',
    category: 'mixer-step'
})));
const MAPPING_OPERATION_SPECS = {
    multiply: {
        labelKey: 'semantic.operation.mapping.multiply.label',
        descriptionKey: 'semantic.operation.mapping.multiply.description'
    },
    add: {
        labelKey: 'semantic.operation.mapping.add.label',
        descriptionKey: 'semantic.operation.mapping.add.description'
    },
    max: {
        labelKey: 'semantic.operation.mapping.max.label',
        descriptionKey: 'semantic.operation.mapping.max.description'
    },
    min: {
        labelKey: 'semantic.operation.mapping.min.label',
        descriptionKey: 'semantic.operation.mapping.min.description'
    },
    replace: {
        labelKey: 'semantic.operation.mapping.replace.label',
        descriptionKey: 'semantic.operation.mapping.replace.description'
    }
};
export const MAPPING_OPERATION_IDS = Object.freeze(Object.keys(MAPPING_OPERATION_SPECS));
export const MAPPING_OPERATION_DESCRIPTORS = Object.freeze(MAPPING_OPERATION_IDS.map(id => descriptor(id, {
    ...MAPPING_OPERATION_SPECS[id],
    kind: 'operation',
    category: 'mapping-operation'
})));
const ENVELOPE_SPECS = {
    delayMs: ['semantic.envelope.delayMs.label', 'semantic.envelope.delayMs.description'],
    attackMs: ['semantic.envelope.attackMs.label', 'semantic.envelope.attackMs.description'],
    holdMs: ['semantic.envelope.holdMs.label', 'semantic.envelope.holdMs.description'],
    decayMs: ['semantic.envelope.decayMs.label', 'semantic.envelope.decayMs.description'],
    sustain: ['semantic.envelope.sustain.label', 'semantic.envelope.sustain.description'],
    releaseMs: ['semantic.envelope.releaseMs.label', 'semantic.envelope.releaseMs.description'],
    cooldownMs: ['semantic.envelope.cooldownMs.label', 'semantic.envelope.cooldownMs.description']
};
export const ENVELOPE_FIELD_IDS = Object.freeze(Object.keys(ENVELOPE_SPECS));
export const ENVELOPE_DESCRIPTORS = Object.freeze(ENVELOPE_FIELD_IDS.map(id => descriptor(id, {
    labelKey: ENVELOPE_SPECS[id][0],
    descriptionKey: ENVELOPE_SPECS[id][1],
    kind: 'envelope',
    category: 'envelope-stage',
    unit: id === 'sustain' ? 'normalized' : 'milliseconds',
    formatter: id === 'sustain' ? 'percent' : 'milliseconds',
    technicalAlias: id
})));
export const GATE_STATE_IDS = Object.freeze(['none', 'open', 'closed']);
const GATE_SPECS = {
    none: ['semantic.gate.none.label', 'semantic.gate.none.description'],
    open: ['semantic.gate.open.label', 'semantic.gate.open.description'],
    closed: ['semantic.gate.closed.label', 'semantic.gate.closed.description']
};
export const GATE_STATE_DESCRIPTORS = Object.freeze(GATE_STATE_IDS.map(id => descriptor(id, {
    labelKey: GATE_SPECS[id][0],
    descriptionKey: GATE_SPECS[id][1],
    kind: 'gate',
    category: 'gate-state'
})));
export const GATE_PARAMETER_IDS = Object.freeze(['gateThreshold']);
export const GATE_PARAMETER_DESCRIPTORS = Object.freeze([
    descriptor('gateThreshold', {
        labelKey: 'semantic.gate.threshold.label',
        descriptionKey: 'semantic.gate.threshold.description',
        kind: 'gate',
        category: 'gate-parameter',
        unit: 'normalized',
        formatter: 'decimal',
        technicalAlias: 'gateThreshold'
    })
]);
export const GATE_DESCRIPTORS = Object.freeze([
    ...GATE_STATE_DESCRIPTORS,
    ...GATE_PARAMETER_DESCRIPTORS
]);
const MAPPING_KIND_SPECS = {
    continuous: ['semantic.mappingKind.continuous.label', 'semantic.mappingKind.continuous.description'],
    event: ['semantic.mappingKind.event.label', 'semantic.mappingKind.event.description']
};
export const MAPPING_KIND_IDS = Object.freeze(Object.keys(MAPPING_KIND_SPECS));
export const MAPPING_KIND_DESCRIPTORS = Object.freeze(MAPPING_KIND_IDS.map(id => descriptor(id, {
    labelKey: MAPPING_KIND_SPECS[id][0],
    descriptionKey: MAPPING_KIND_SPECS[id][1],
    kind: 'operation',
    category: 'mapping-kind'
})));
const MAPPING_POLARITY_SPECS = {
    normal: ['semantic.polarity.normal.label', 'semantic.polarity.normal.description'],
    inverted: ['semantic.polarity.inverted.label', 'semantic.polarity.inverted.description']
};
export const MAPPING_POLARITY_IDS = Object.freeze(Object.keys(MAPPING_POLARITY_SPECS));
export const MAPPING_POLARITY_DESCRIPTORS = Object.freeze(MAPPING_POLARITY_IDS.map(id => descriptor(id, {
    labelKey: MAPPING_POLARITY_SPECS[id][0],
    descriptionKey: MAPPING_POLARITY_SPECS[id][1],
    kind: 'operation',
    category: 'mapping-polarity'
})));
const EVENT_RETRIGGER_SPECS = {
    restart: ['semantic.retrigger.restart.label', 'semantic.retrigger.restart.description'],
    'ignore-until-release': ['semantic.retrigger.ignoreUntilRelease.label', 'semantic.retrigger.ignoreUntilRelease.description'],
    accumulate: ['semantic.retrigger.accumulate.label', 'semantic.retrigger.accumulate.description']
};
export const EVENT_RETRIGGER_IDS = Object.freeze(Object.keys(EVENT_RETRIGGER_SPECS));
export const EVENT_RETRIGGER_DESCRIPTORS = Object.freeze(EVENT_RETRIGGER_IDS.map(id => descriptor(id, {
    labelKey: EVENT_RETRIGGER_SPECS[id][0],
    descriptionKey: EVENT_RETRIGGER_SPECS[id][1],
    kind: 'operation',
    category: 'event-retrigger'
})));
const GLOBAL_EVENT_POLICY_SPECS = {
    'drop-low-priority': ['semantic.eventPolicy.dropLowPriority.label', 'semantic.eventPolicy.dropLowPriority.description'],
    queue: ['semantic.eventPolicy.queue.label', 'semantic.eventPolicy.queue.description']
};
export const GLOBAL_EVENT_POLICY_IDS = Object.freeze(Object.keys(GLOBAL_EVENT_POLICY_SPECS));
export const GLOBAL_EVENT_POLICY_DESCRIPTORS = Object.freeze(GLOBAL_EVENT_POLICY_IDS.map(id => descriptor(id, {
    labelKey: GLOBAL_EVENT_POLICY_SPECS[id][0],
    descriptionKey: GLOBAL_EVENT_POLICY_SPECS[id][1],
    kind: 'operation',
    category: 'event-policy'
})));
const MAPPING_DEBUG_REASON_SPECS = {
    NO_MAPPING: [
        'semantic.mappingStatus.NO_MAPPING.label',
        'semantic.mappingStatus.NO_MAPPING.description'
    ],
    RACK_BYPASSED: [
        'semantic.mappingStatus.RACK_BYPASSED.label',
        'semantic.mappingStatus.RACK_BYPASSED.description'
    ],
    MAPPING_BYPASSED: [
        'semantic.mappingStatus.MAPPING_BYPASSED.label',
        'semantic.mappingStatus.MAPPING_BYPASSED.description'
    ],
    SOLO_FILTERED: [
        'semantic.mappingStatus.SOLO_FILTERED.label',
        'semantic.mappingStatus.SOLO_FILTERED.description'
    ],
    MISSING_SOURCE: [
        'semantic.mappingStatus.MISSING_SOURCE.label',
        'semantic.mappingStatus.MISSING_SOURCE.description'
    ],
    MISSING_TARGET: [
        'semantic.mappingStatus.MISSING_TARGET.label',
        'semantic.mappingStatus.MISSING_TARGET.description'
    ],
    GATE_CLOSED: [
        'semantic.mappingStatus.GATE_CLOSED.label',
        'semantic.mappingStatus.GATE_CLOSED.description'
    ],
    WAITING_EVENT: [
        'semantic.mappingStatus.WAITING_EVENT.label',
        'semantic.mappingStatus.WAITING_EVENT.description'
    ],
    PROBABILITY_BLOCKED: [
        'semantic.mappingStatus.PROBABILITY_BLOCKED.label',
        'semantic.mappingStatus.PROBABILITY_BLOCKED.description'
    ],
    BELOW_THRESHOLD: [
        'semantic.mappingStatus.BELOW_THRESHOLD.label',
        'semantic.mappingStatus.BELOW_THRESHOLD.description'
    ],
    ZERO_OUTPUT: [
        'semantic.mappingStatus.ZERO_OUTPUT.label',
        'semantic.mappingStatus.ZERO_OUTPUT.description'
    ],
    CONTRIBUTING: [
        'semantic.mappingStatus.CONTRIBUTING.label',
        'semantic.mappingStatus.CONTRIBUTING.description'
    ]
};
export const MAPPING_DEBUG_REASON_IDS = Object.freeze(Object.keys(MAPPING_DEBUG_REASON_SPECS));
export const MAPPING_DEBUG_REASON_DESCRIPTORS = Object.freeze(MAPPING_DEBUG_REASON_IDS.map(id => descriptor(id, {
    labelKey: MAPPING_DEBUG_REASON_SPECS[id][0],
    descriptionKey: MAPPING_DEBUG_REASON_SPECS[id][1],
    kind: 'status',
    category: 'mapping-status'
})));
const TARGET_DEBUG_REASON_SPECS = {
    TARGET_AT_BASE: [
        'semantic.targetStatus.TARGET_AT_BASE.label',
        'semantic.targetStatus.TARGET_AT_BASE.description'
    ],
    SELECTED_MAPPING: [
        'semantic.targetStatus.SELECTED_MAPPING.label',
        'semantic.targetStatus.SELECTED_MAPPING.description'
    ],
    OTHER_MAPPING_OR_POST_PROCESS: [
        'semantic.targetStatus.OTHER_MAPPING_OR_POST_PROCESS.label',
        'semantic.targetStatus.OTHER_MAPPING_OR_POST_PROCESS.description'
    ]
};
export const TARGET_DEBUG_REASON_IDS = Object.freeze(Object.keys(TARGET_DEBUG_REASON_SPECS));
export const TARGET_DEBUG_REASON_DESCRIPTORS = Object.freeze(TARGET_DEBUG_REASON_IDS.map(id => descriptor(id, {
    labelKey: TARGET_DEBUG_REASON_SPECS[id][0],
    descriptionKey: TARGET_DEBUG_REASON_SPECS[id][1],
    kind: 'status',
    category: 'target-status'
})));
export const OPERATION_DESCRIPTOR_CATALOGS = Object.freeze(Object.fromEntries([
    ['mixer-step', MIXER_STEP_DESCRIPTORS],
    ['mapping-operation', MAPPING_OPERATION_DESCRIPTORS],
    ['envelope', ENVELOPE_DESCRIPTORS],
    ['gate', GATE_DESCRIPTORS],
    ['mapping-kind', MAPPING_KIND_DESCRIPTORS],
    ['mapping-polarity', MAPPING_POLARITY_DESCRIPTORS],
    ['event-retrigger', EVENT_RETRIGGER_DESCRIPTORS],
    ['event-policy', GLOBAL_EVENT_POLICY_DESCRIPTORS],
    ['mapping-status', MAPPING_DEBUG_REASON_DESCRIPTORS],
    ['target-status', TARGET_DEBUG_REASON_DESCRIPTORS]
].map(([domain, descriptors]) => [domain, Object.freeze(Object.fromEntries(descriptors.map(item => [item.id, item])))])));
export function resolveOperationDescriptor(domain, idInput, translator, options = {}) {
    const id = safeSemanticId(idInput);
    const stable = OPERATION_DESCRIPTOR_CATALOGS[domain][id];
    if (stable)
        return resolveSemanticDescriptor(stable, translator);
    options.onMissingDescriptor?.({ domain: 'operation', id: `${domain}:${id}` });
    const fallback = Object.freeze({
        id,
        kind: domain === 'envelope'
            ? 'envelope'
            : domain === 'gate'
                ? 'gate'
                : domain === 'mapping-status' || domain === 'target-status'
                    ? 'status'
                    : 'operation',
        classification: 'unknown',
        labelKey: 'semantic.operation.unknown.label',
        descriptionKey: 'semantic.operation.unknown.description',
        category: 'unknown',
        unit: 'unknown',
        formatter: 'raw',
        technicalAlias: id || '(empty)'
    });
    return resolveSemanticDescriptor(fallback, translator, {
        id: `${domain}:${id || '(empty)'}`
    });
}
//# sourceMappingURL=operation-descriptors.js.map