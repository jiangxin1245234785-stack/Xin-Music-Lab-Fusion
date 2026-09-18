import type {
  MappingDebugReason,
  TargetDebugReason
} from '../../debug/mapping-breakdown.js';
import {
  TARGET_MIXER_STEPS,
  type TargetMixerStep
} from '../../mixer/target-mixer.js';
import type {
  EventRetriggerMode,
  EventEnvelope,
  GlobalEventPolicy,
  MappingKind,
  MappingPolarity,
  MappingReplaceMode
} from '../../schema/types.js';
import type { TranslationKey } from '../i18n/index.js';
import {
  resolveSemanticDescriptor,
  safeSemanticId,
  type DescriptorResolutionOptions,
  type ResolvedUiSemanticDescriptor,
  type UiSemanticCategory,
  type UiSemanticDescriptor,
  type UiSemanticFormatter,
  type UiSemanticKind,
  type UiSemanticTranslator,
  type UiSemanticUnit
} from './types.js';

interface OperationDescriptorSpec {
  readonly labelKey: TranslationKey;
  readonly descriptionKey: TranslationKey;
  readonly kind: UiSemanticKind;
  readonly category: UiSemanticCategory;
  readonly unit?: UiSemanticUnit;
  readonly formatter?: UiSemanticFormatter;
  readonly technicalAlias?: string;
}

function descriptor(
  id: string,
  spec: OperationDescriptorSpec
): UiSemanticDescriptor {
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
} as const satisfies Readonly<Record<
  TargetMixerStep,
  Pick<OperationDescriptorSpec, 'labelKey' | 'descriptionKey'>
>>;

export const MIXER_STEP_DESCRIPTORS: readonly UiSemanticDescriptor[] =
  Object.freeze(TARGET_MIXER_STEPS.map(id => descriptor(id, {
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
} as const satisfies Readonly<Record<
  MappingReplaceMode,
  Pick<OperationDescriptorSpec, 'labelKey' | 'descriptionKey'>
>>;

export const MAPPING_OPERATION_IDS: readonly MappingReplaceMode[] =
  Object.freeze(Object.keys(MAPPING_OPERATION_SPECS) as MappingReplaceMode[]);

export const MAPPING_OPERATION_DESCRIPTORS = Object.freeze(
  MAPPING_OPERATION_IDS.map(id => descriptor(id, {
    ...MAPPING_OPERATION_SPECS[id],
    kind: 'operation',
    category: 'mapping-operation'
  }))
);

export type EnvelopeFieldId = Exclude<
  keyof EventEnvelope,
  'id' | 'retriggerMode'
>;

const ENVELOPE_SPECS = {
  delayMs: ['semantic.envelope.delayMs.label', 'semantic.envelope.delayMs.description'],
  attackMs: ['semantic.envelope.attackMs.label', 'semantic.envelope.attackMs.description'],
  holdMs: ['semantic.envelope.holdMs.label', 'semantic.envelope.holdMs.description'],
  decayMs: ['semantic.envelope.decayMs.label', 'semantic.envelope.decayMs.description'],
  sustain: ['semantic.envelope.sustain.label', 'semantic.envelope.sustain.description'],
  releaseMs: ['semantic.envelope.releaseMs.label', 'semantic.envelope.releaseMs.description'],
  cooldownMs: ['semantic.envelope.cooldownMs.label', 'semantic.envelope.cooldownMs.description']
} as const satisfies Readonly<Record<
  EnvelopeFieldId,
  readonly [TranslationKey, TranslationKey]
>>;

export const ENVELOPE_FIELD_IDS: readonly EnvelopeFieldId[] =
  Object.freeze(Object.keys(ENVELOPE_SPECS) as EnvelopeFieldId[]);

export const ENVELOPE_DESCRIPTORS = Object.freeze(
  ENVELOPE_FIELD_IDS.map(id => descriptor(id, {
    labelKey: ENVELOPE_SPECS[id][0],
    descriptionKey: ENVELOPE_SPECS[id][1],
    kind: 'envelope',
    category: 'envelope-stage',
    unit: id === 'sustain' ? 'normalized' : 'milliseconds',
    formatter: id === 'sustain' ? 'percent' : 'milliseconds',
    technicalAlias: id
  }))
);

export const GATE_STATE_IDS = Object.freeze(['none', 'open', 'closed'] as const);
export type GateStateId = typeof GATE_STATE_IDS[number];
const GATE_SPECS = {
  none: ['semantic.gate.none.label', 'semantic.gate.none.description'],
  open: ['semantic.gate.open.label', 'semantic.gate.open.description'],
  closed: ['semantic.gate.closed.label', 'semantic.gate.closed.description']
} as const satisfies Readonly<Record<GateStateId, readonly [TranslationKey, TranslationKey]>>;
export const GATE_STATE_DESCRIPTORS = Object.freeze(
  GATE_STATE_IDS.map(id => descriptor(id, {
    labelKey: GATE_SPECS[id][0],
    descriptionKey: GATE_SPECS[id][1],
    kind: 'gate',
    category: 'gate-state'
  }))
);

export const GATE_PARAMETER_IDS = Object.freeze(['gateThreshold'] as const);
export type GateParameterId = typeof GATE_PARAMETER_IDS[number];
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
} as const satisfies Readonly<Record<MappingKind, readonly [TranslationKey, TranslationKey]>>;
export const MAPPING_KIND_IDS: readonly MappingKind[] =
  Object.freeze(Object.keys(MAPPING_KIND_SPECS) as MappingKind[]);
export const MAPPING_KIND_DESCRIPTORS = Object.freeze(
  MAPPING_KIND_IDS.map(id => descriptor(id, {
    labelKey: MAPPING_KIND_SPECS[id][0],
    descriptionKey: MAPPING_KIND_SPECS[id][1],
    kind: 'operation',
    category: 'mapping-kind'
  }))
);

const MAPPING_POLARITY_SPECS = {
  normal: ['semantic.polarity.normal.label', 'semantic.polarity.normal.description'],
  inverted: ['semantic.polarity.inverted.label', 'semantic.polarity.inverted.description']
} as const satisfies Readonly<Record<MappingPolarity, readonly [TranslationKey, TranslationKey]>>;
export const MAPPING_POLARITY_IDS: readonly MappingPolarity[] =
  Object.freeze(Object.keys(MAPPING_POLARITY_SPECS) as MappingPolarity[]);
export const MAPPING_POLARITY_DESCRIPTORS = Object.freeze(
  MAPPING_POLARITY_IDS.map(id => descriptor(id, {
    labelKey: MAPPING_POLARITY_SPECS[id][0],
    descriptionKey: MAPPING_POLARITY_SPECS[id][1],
    kind: 'operation',
    category: 'mapping-polarity'
  }))
);

const EVENT_RETRIGGER_SPECS = {
  restart: ['semantic.retrigger.restart.label', 'semantic.retrigger.restart.description'],
  'ignore-until-release': ['semantic.retrigger.ignoreUntilRelease.label', 'semantic.retrigger.ignoreUntilRelease.description'],
  accumulate: ['semantic.retrigger.accumulate.label', 'semantic.retrigger.accumulate.description']
} as const satisfies Readonly<Record<EventRetriggerMode, readonly [TranslationKey, TranslationKey]>>;
export const EVENT_RETRIGGER_IDS: readonly EventRetriggerMode[] =
  Object.freeze(Object.keys(EVENT_RETRIGGER_SPECS) as EventRetriggerMode[]);
export const EVENT_RETRIGGER_DESCRIPTORS = Object.freeze(
  EVENT_RETRIGGER_IDS.map(id => descriptor(id, {
    labelKey: EVENT_RETRIGGER_SPECS[id][0],
    descriptionKey: EVENT_RETRIGGER_SPECS[id][1],
    kind: 'operation',
    category: 'event-retrigger'
  }))
);

const GLOBAL_EVENT_POLICY_SPECS = {
  'drop-low-priority': ['semantic.eventPolicy.dropLowPriority.label', 'semantic.eventPolicy.dropLowPriority.description'],
  queue: ['semantic.eventPolicy.queue.label', 'semantic.eventPolicy.queue.description']
} as const satisfies Readonly<Record<GlobalEventPolicy, readonly [TranslationKey, TranslationKey]>>;
export const GLOBAL_EVENT_POLICY_IDS: readonly GlobalEventPolicy[] =
  Object.freeze(Object.keys(GLOBAL_EVENT_POLICY_SPECS) as GlobalEventPolicy[]);
export const GLOBAL_EVENT_POLICY_DESCRIPTORS = Object.freeze(
  GLOBAL_EVENT_POLICY_IDS.map(id => descriptor(id, {
    labelKey: GLOBAL_EVENT_POLICY_SPECS[id][0],
    descriptionKey: GLOBAL_EVENT_POLICY_SPECS[id][1],
    kind: 'operation',
    category: 'event-policy'
  }))
);

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
} as const satisfies Readonly<Record<
  MappingDebugReason,
  readonly [TranslationKey, TranslationKey]
>>;

export const MAPPING_DEBUG_REASON_IDS: readonly MappingDebugReason[] =
  Object.freeze(Object.keys(MAPPING_DEBUG_REASON_SPECS) as MappingDebugReason[]);

export const MAPPING_DEBUG_REASON_DESCRIPTORS = Object.freeze(
  MAPPING_DEBUG_REASON_IDS.map(id => descriptor(id, {
    labelKey: MAPPING_DEBUG_REASON_SPECS[id][0],
    descriptionKey: MAPPING_DEBUG_REASON_SPECS[id][1],
    kind: 'status',
    category: 'mapping-status'
  }))
);

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
} as const satisfies Readonly<Record<
  TargetDebugReason,
  readonly [TranslationKey, TranslationKey]
>>;
export const TARGET_DEBUG_REASON_IDS: readonly TargetDebugReason[] =
  Object.freeze(Object.keys(TARGET_DEBUG_REASON_SPECS) as TargetDebugReason[]);
export const TARGET_DEBUG_REASON_DESCRIPTORS = Object.freeze(
  TARGET_DEBUG_REASON_IDS.map(id => descriptor(id, {
    labelKey: TARGET_DEBUG_REASON_SPECS[id][0],
    descriptionKey: TARGET_DEBUG_REASON_SPECS[id][1],
    kind: 'status',
    category: 'target-status'
  }))
);

export type OperationDescriptorDomain =
  | 'mixer-step'
  | 'mapping-operation'
  | 'envelope'
  | 'gate'
  | 'mapping-kind'
  | 'mapping-polarity'
  | 'event-retrigger'
  | 'event-policy'
  | 'mapping-status'
  | 'target-status';

export const OPERATION_DESCRIPTOR_CATALOGS: Readonly<Record<
  OperationDescriptorDomain,
  Readonly<Record<string, UiSemanticDescriptor>>
>> = Object.freeze(Object.fromEntries(([
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
] as const).map(([domain, descriptors]) => [domain, Object.freeze(
  Object.fromEntries(descriptors.map(item => [item.id, item]))
)])) as Record<OperationDescriptorDomain, Readonly<Record<string, UiSemanticDescriptor>>>);

export interface OperationDescriptorResolutionOptions
  extends DescriptorResolutionOptions {}

export function resolveOperationDescriptor(
  domain: OperationDescriptorDomain,
  idInput: unknown,
  translator: UiSemanticTranslator,
  options: OperationDescriptorResolutionOptions = {}
): ResolvedUiSemanticDescriptor {
  const id = safeSemanticId(idInput);
  const stable = OPERATION_DESCRIPTOR_CATALOGS[domain][id];
  if (stable) return resolveSemanticDescriptor(stable, translator);
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
  } satisfies UiSemanticDescriptor);
  return resolveSemanticDescriptor(fallback, translator, {
    id: `${domain}:${id || '(empty)'}`
  });
}
