import {
  CORE_MAPPING_SOURCE_IDS
} from '../../mapping/minimal-mapper.js';
import { TARGET_MIXER_STEPS } from '../../mixer/target-mixer.js';
import {
  FORMAL_TARGET_UNIFORM_BINDINGS,
  VISUAL_TARGET_REGISTRY,
  VISUAL_TARGETS
} from '../../render/index.js';
import {
  RUNTIME_SOURCE_IDS
} from '../../runtime/source-registry-adapter.js';
import {
  GENERATOR_MAPPING_SOURCE_IDS
} from '../../runtime/control-source-registry.js';
import {
  VISUAL_CLOCK_SOURCE_IDS
} from '../../runtime/visual-clock.js';
import {
  EN_US_MESSAGES,
  ZH_CN_MESSAGES,
  type TranslationKey
} from '../i18n/index.js';
import {
  ENVELOPE_FIELD_IDS,
  EVENT_RETRIGGER_IDS,
  GATE_PARAMETER_IDS,
  GATE_STATE_IDS,
  GLOBAL_EVENT_POLICY_IDS,
  MAPPING_DEBUG_REASON_IDS,
  MAPPING_KIND_IDS,
  MAPPING_OPERATION_IDS,
  MAPPING_POLARITY_IDS,
  OPERATION_DESCRIPTOR_CATALOGS,
  TARGET_DEBUG_REASON_IDS,
  type OperationDescriptorDomain
} from './operation-descriptors.js';
import {
  SOURCE_DESCRIPTORS
} from './source-descriptors.js';
import {
  FORMAL_TARGET_DESCRIPTORS,
  LEGACY_TARGET_DESCRIPTORS,
  STATIC_TARGET_DESCRIPTORS
} from './target-descriptors.js';
import type { UiSemanticDescriptor } from './types.js';

export interface SemanticCoverageSection {
  readonly expected: readonly string[];
  readonly actual: readonly string[];
  readonly missing: readonly string[];
  readonly unexpected: readonly string[];
  readonly duplicates: readonly string[];
  readonly complete: boolean;
}

export interface SemanticCoverageReport {
  readonly sourceRegistry: SemanticCoverageSection;
  readonly sourceSetConsistency: SemanticCoverageSection;
  readonly formalTargets: SemanticCoverageSection;
  readonly formalUniformBindings: SemanticCoverageSection;
  readonly formalUniformNames: SemanticCoverageSection;
  readonly staticTargetPartition: SemanticCoverageSection;
  readonly operationDomains: Readonly<Record<
    OperationDescriptorDomain,
    SemanticCoverageSection
  >>;
  readonly missingEnglishKeys: readonly string[];
  readonly missingChineseKeys: readonly string[];
  readonly forbiddenDescriptorFields: readonly string[];
  readonly forbiddenTargetRelations: readonly string[];
  readonly complete: boolean;
}

function sorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...values].sort((left, right) => left.localeCompare(right)));
}

function duplicateIds(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return sorted([...duplicates]);
}

function compare(
  expectedInput: readonly string[],
  actualInput: readonly string[]
): SemanticCoverageSection {
  const expected = sorted(expectedInput);
  const actual = sorted(actualInput);
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const missing = sorted(expected.filter(id => !actualSet.has(id)));
  const unexpected = sorted(actual.filter(id => !expectedSet.has(id)));
  const duplicates = duplicateIds(actualInput);
  return Object.freeze({
    expected,
    actual,
    missing,
    unexpected,
    duplicates,
    complete:
      missing.length === 0 &&
      unexpected.length === 0 &&
      duplicates.length === 0
  });
}

const LEGACY_TARGET_IDS = Object.freeze([
  VISUAL_TARGETS.alpha,
  VISUAL_TARGETS.brightness,
  VISUAL_TARGETS.scale
]);

const EXPECTED_OPERATION_IDS: Readonly<Record<
  OperationDescriptorDomain,
  readonly string[]
>> = Object.freeze({
  'mixer-step': TARGET_MIXER_STEPS,
  'mapping-operation': MAPPING_OPERATION_IDS,
  envelope: ENVELOPE_FIELD_IDS,
  gate: [...GATE_STATE_IDS, ...GATE_PARAMETER_IDS],
  'mapping-kind': MAPPING_KIND_IDS,
  'mapping-polarity': MAPPING_POLARITY_IDS,
  'event-retrigger': EVENT_RETRIGGER_IDS,
  'event-policy': GLOBAL_EVENT_POLICY_IDS,
  'mapping-status': MAPPING_DEBUG_REASON_IDS,
  'target-status': TARGET_DEBUG_REASON_IDS
});

function descriptorKeys(
  descriptors: readonly UiSemanticDescriptor[]
): readonly TranslationKey[] {
  return Object.freeze(descriptors.flatMap(descriptor => [
    descriptor.labelKey,
    descriptor.descriptionKey
  ]));
}

export function buildSemanticCoverageReport(): SemanticCoverageReport {
  const sourceRegistry = compare(
    GENERATOR_MAPPING_SOURCE_IDS,
    SOURCE_DESCRIPTORS.map(descriptor => descriptor.id)
  );
  const sourceSetConsistency = compare(
    GENERATOR_MAPPING_SOURCE_IDS,
    [...CORE_MAPPING_SOURCE_IDS, ...VISUAL_CLOCK_SOURCE_IDS]
  );
  const formalTargetIds = VISUAL_TARGET_REGISTRY.map(target => target.id);
  const formalTargets = compare(
    formalTargetIds,
    FORMAL_TARGET_DESCRIPTORS.map(descriptor => descriptor.id)
  );
  const formalUniformBindings = compare(
    formalTargetIds,
    FORMAL_TARGET_UNIFORM_BINDINGS.map(binding => binding.targetId)
  );
  const uniformNames = FORMAL_TARGET_UNIFORM_BINDINGS
    .map(binding => binding.uniformName);
  const formalUniformNames = compare(uniformNames, uniformNames);
  const staticTargetPartition = compare(
    Object.values(VISUAL_TARGETS),
    STATIC_TARGET_DESCRIPTORS.map(descriptor => descriptor.id)
  );

  const operationDomains = Object.freeze(Object.fromEntries(
    (Object.keys(EXPECTED_OPERATION_IDS) as OperationDescriptorDomain[])
      .map(domain => [domain, compare(
        EXPECTED_OPERATION_IDS[domain],
        Object.keys(OPERATION_DESCRIPTOR_CATALOGS[domain])
      )])
  ) as Record<OperationDescriptorDomain, SemanticCoverageSection>);

  const allDescriptors = Object.freeze([
    ...SOURCE_DESCRIPTORS,
    ...FORMAL_TARGET_DESCRIPTORS,
    ...LEGACY_TARGET_DESCRIPTORS,
    ...Object.values(OPERATION_DESCRIPTOR_CATALOGS)
      .flatMap(catalog => Object.values(catalog))
  ]);
  const keys = descriptorKeys(allDescriptors);
  const missingEnglishKeys = sorted(keys.filter(key =>
    typeof EN_US_MESSAGES[key] !== 'string' || EN_US_MESSAGES[key].length === 0
  ));
  const missingChineseKeys = sorted(keys.filter(key =>
    typeof ZH_CN_MESSAGES[key] !== 'string' || ZH_CN_MESSAGES[key].length === 0
  ));
  const forbiddenNames = new Set([
    'sourceId', 'targetId', 'mappingId', 'defaultTargetId', 'audioFeatureId'
  ]);
  const forbiddenDescriptorFields = sorted(allDescriptors.flatMap(item =>
    Object.keys(item)
      .filter(key => forbiddenNames.has(key))
      .map(key => `${item.kind}:${item.id}:${key}`)
  ));
  const targetRelationPattern =
    /\baudio\.|sourceId|→|->|低频|中频|高频|响度|音乐特征/i;
  const forbiddenTargetRelations = sorted([
    ...FORMAL_TARGET_DESCRIPTORS,
    ...LEGACY_TARGET_DESCRIPTORS
  ].flatMap(item => ([
    ['en-US', EN_US_MESSAGES[item.labelKey], 'label'],
    ['en-US', EN_US_MESSAGES[item.descriptionKey], 'description'],
    ['zh-CN', ZH_CN_MESSAGES[item.labelKey], 'label'],
    ['zh-CN', ZH_CN_MESSAGES[item.descriptionKey], 'description']
  ] as const)
    .filter(([, text]) => targetRelationPattern.test(text))
    .map(([locale, , field]) => `${item.id}:${locale}:${field}`)
  ));
  const operationsComplete = Object.values(operationDomains)
    .every(section => section.complete);

  return Object.freeze({
    sourceRegistry,
    sourceSetConsistency,
    formalTargets,
    formalUniformBindings,
    formalUniformNames,
    staticTargetPartition,
    operationDomains,
    missingEnglishKeys,
    missingChineseKeys,
    forbiddenDescriptorFields,
    forbiddenTargetRelations,
    complete:
      sourceRegistry.complete &&
      sourceSetConsistency.complete &&
      formalTargets.complete &&
      formalUniformBindings.complete &&
      formalUniformNames.complete &&
      staticTargetPartition.complete &&
      operationsComplete &&
      missingEnglishKeys.length === 0 &&
      missingChineseKeys.length === 0 &&
      forbiddenDescriptorFields.length === 0 &&
      forbiddenTargetRelations.length === 0 &&
      LEGACY_TARGET_DESCRIPTORS.map(item => item.id).every(id =>
        LEGACY_TARGET_IDS.includes(id as typeof LEGACY_TARGET_IDS[number])
      )
  });
}
