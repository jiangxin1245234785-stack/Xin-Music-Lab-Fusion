import {
  explainMappingContribution,
  type MappingContributionBreakdown
} from '../../debug/mapping-breakdown.js';
import type { ContinuousMappingContribution, MappingSourceValues } from '../../mapping/index.js';
import type {
  GateDecision,
  TargetMixerFrame,
  TargetMixerStep
} from '../../mixer/index.js';
import { createMappingCard } from '../../schema/defaults.js';
import type {
  MappingCard,
  ResolvedVisualTargetState
} from '../../schema/types.js';
import type { VisualTargetDefinition } from '../../render/visual-targets.js';
import type { SupportedLocale } from '../i18n/index.js';
import {
  formatSemanticValue,
  resolveOperationDescriptor,
  resolveSourceDescriptor,
  resolveTargetDescriptor,
  type ResolvedUiSemanticDescriptor,
  type UiSemanticTranslator
} from '../semantics/index.js';

export interface MappingRuntimeSourceMeta {
  readonly sourceId?: string;
  readonly sourceProvider: string;
  readonly confidence: number | null;
  readonly ageMs: number;
  readonly available: boolean;
  readonly providerDetail?: Readonly<Record<string, string>>;
  readonly fallbackReason?: string | null;
}

export interface MappingRuntimePresenterInput {
  readonly mapping?: MappingCard | undefined;
  readonly mixerFrame?: TargetMixerFrame | undefined;
  readonly finalState?: ResolvedVisualTargetState | undefined;
  readonly sourceValues?: MappingSourceValues;
  readonly translator: UiSemanticTranslator;
  readonly rackEnabled?: boolean;
  readonly soloMappingId?: string | null;
  readonly targetDefinitions?: readonly VisualTargetDefinition[];
  readonly sourceMeta?: MappingRuntimeSourceMeta | null;
  readonly locale?: SupportedLocale;
  readonly frameIndex?: number;
  readonly engineTimeMs?: number;
}

export interface MappingRuntimePipelineStage {
  readonly id:
    | TargetMixerStep
    | 'energy-budget'
    | 'absolute-clamp'
    | 'physical-safety-final';
  readonly label: string;
  readonly value: number;
  readonly changedFromPrevious: boolean;
}

export interface MappingRuntimeViewModel {
  readonly available: boolean;
  readonly summary: string;
  readonly mappingId: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly source: ResolvedUiSemanticDescriptor | null;
  readonly target: ResolvedUiSemanticDescriptor | null;
  readonly operation: ResolvedUiSemanticDescriptor | null;
  readonly mappingStatus: ResolvedUiSemanticDescriptor | null;
  readonly targetStatus: ResolvedUiSemanticDescriptor | null;
  readonly breakdown: MappingContributionBreakdown | null;
  readonly contribution: ContinuousMappingContribution | null;
  readonly gateDecision: GateDecision | null;
  readonly pipeline: readonly MappingRuntimePipelineStage[];
  readonly probabilityText: string;
  readonly providerText: string;
  readonly sourceMeta: MappingRuntimeSourceMeta | null;
  readonly frameIndex: number;
  readonly engineTimeMs: number;
}

function finite(value: number | undefined, fallback = 0): number {
  return Number.isFinite(value) ? value! : fallback;
}

function fixed(value: number | undefined, digits = 3): string {
  const normalized = Object.is(value, -0) ? 0 : finite(value);
  return normalized
    .toFixed(digits)
    .replace(/\.0+$/, '')
    .replace(/(\.\d*?)0+$/, '$1');
}

function stageValue(
  state: ResolvedVisualTargetState,
  targetId: string,
  fallback: number
): number {
  return finite(state.values[targetId], fallback);
}

function providerText(
  meta: MappingRuntimeSourceMeta | null,
  expectedSourceId: string,
  translator: UiSemanticTranslator
): string {
  if (!meta) return translator.t('presenter.runtime.providerUnavailable');
  if (meta.sourceId && meta.sourceId !== expectedSourceId) {
    return translator.t('presenter.runtime.providerMismatch');
  }
  if (!meta.available) {
    return meta.fallbackReason
      ? translator.t('presenter.runtime.providerUnavailableFallback', {
          reason: meta.fallbackReason
        })
      : translator.t('presenter.runtime.providerUnavailable');
  }
  return translator.t('presenter.runtime.provider', {
    provider: meta.sourceProvider,
    confidence: meta.confidence === null ? '—' : fixed(meta.confidence),
    age: `${fixed(meta.ageMs, 0)} ms`
  });
}

export function createMappingRuntimeViewModel(
  input: MappingRuntimePresenterInput
): MappingRuntimeViewModel {
  if (!input.mapping || !input.mixerFrame) {
    return Object.freeze({
      available: false,
      summary: input.translator.t('presenter.runtime.noTrace'),
      mappingId: input.mapping?.id ?? '',
      sourceId: input.mapping?.sourceId ?? '',
      targetId: input.mapping?.targetId ?? '',
      source: null,
      target: null,
      operation: null,
      mappingStatus: null,
      targetStatus: null,
      breakdown: null,
      contribution: null,
      gateDecision: null,
      pipeline: [],
      probabilityText: '—',
      providerText: providerText(
        input.sourceMeta ?? null,
        input.mapping?.sourceId ?? '',
        input.translator
      ),
      sourceMeta: input.sourceMeta ?? null,
      frameIndex: finite(input.frameIndex, -1),
      engineTimeMs: finite(input.engineTimeMs)
    });
  }

  const mapping = createMappingCard(input.mapping);
  const mixerFrame = input.mixerFrame;
  const contribution = mixerFrame.contributions.find(
    item => item.mappingId === mapping.id
  ) ?? null;
  const gateDecision = mixerFrame.gateDecisions.find(
    item => item.mappingId === mapping.id
  ) ?? null;
  const definition = input.targetDefinitions?.find(
    item => item.id === mapping.targetId
  );
  const baseValue = stageValue(
    mixerFrame.trace.base,
    mapping.targetId,
    definition?.defaultValue ?? 0
  );
  const finalValue = finite(
    input.finalState?.values[mapping.targetId],
    finite(mixerFrame.targets.values[mapping.targetId], baseValue)
  );
  const sourceValue = finite(
    contribution?.sourceValue,
    finite(input.sourceValues?.[mapping.sourceId])
  );
  const breakdown = explainMappingContribution({
    mapping,
    ...(contribution ? { contribution } : {}),
    ...(gateDecision ? { gateDecision } : {}),
    sourceValue,
    baseTargetValue: baseValue,
    finalTargetValue: finalValue,
    rackEnabled: input.rackEnabled ?? true,
    soloMappingId: input.soloMappingId ?? null
  });
  const source = resolveSourceDescriptor(mapping.sourceId, input.translator);
  const target = resolveTargetDescriptor(mapping.targetId, input.translator, {
    ...(input.targetDefinitions
      ? { extensionDefinitions: input.targetDefinitions }
      : {})
  });
  const operation = resolveOperationDescriptor(
    'mapping-operation',
    contribution?.replaceMode ?? mapping.replaceMode,
    input.translator
  );
  const mappingStatus = resolveOperationDescriptor(
    'mapping-status',
    breakdown.mappingReason,
    input.translator
  );
  const targetStatus = resolveOperationDescriptor(
    'target-status',
    breakdown.targetReason,
    input.translator
  );

  const traceStages: readonly [TargetMixerStep, ResolvedVisualTargetState][] = [
    ['base', mixerFrame.trace.base],
    ['multiply', mixerFrame.trace.multiply],
    ['add', mixerFrame.trace.add],
    ['max-min', mixerFrame.trace.maxMin],
    ['replace', mixerFrame.trace.replace],
    ['gate', mixerFrame.trace.gate]
  ];
  let previous = baseValue;
  const pipeline: MappingRuntimePipelineStage[] = traceStages.map(
    ([id, state]) => {
      const value = stageValue(state, mapping.targetId, previous);
      const descriptor = resolveOperationDescriptor(
        'mixer-step',
        id,
        input.translator
      );
      const stage = Object.freeze({
        id,
        label: descriptor.label,
        value,
        changedFromPrevious: Math.abs(value - previous) > 1e-9
      });
      previous = value;
      return stage;
    }
  );
  const energyBudgetValue = stageValue(
    mixerFrame.trace.energyBudget,
    mapping.targetId,
    previous
  );
  pipeline.push(Object.freeze({
    id: 'energy-budget',
    label: input.translator.t('presenter.runtime.energyBudget'),
    value: energyBudgetValue,
    changedFromPrevious: Math.abs(energyBudgetValue - previous) > 1e-9
  }));
  previous = energyBudgetValue;
  const clampValue = stageValue(
    mixerFrame.trace.clamp,
    mapping.targetId,
    previous
  );
  pipeline.push(Object.freeze({
    id: 'absolute-clamp',
    label: input.translator.t('presenter.runtime.absoluteClamp'),
    value: clampValue,
    changedFromPrevious: Math.abs(clampValue - previous) > 1e-9
  }));
  previous = clampValue;
  if (input.finalState) {
    pipeline.push(Object.freeze({
      id: 'physical-safety-final',
      label: input.translator.t('presenter.runtime.physicalSafety'),
      value: finalValue,
      changedFromPrevious: Math.abs(finalValue - previous) > 1e-9
    }));
  }

  const locale = input.locale ?? 'zh-CN';
  const probabilityStatus = contribution
    ? contribution.probabilitySample < contribution.probability
      ? input.translator.t('presenter.runtime.probability.pass')
      : input.translator.t('presenter.runtime.probability.block')
    : input.translator.t('presenter.runtime.probability.armed');
  const probabilityText = contribution
    ? `${fixed(contribution.probabilitySample)} / ` +
      `${fixed(contribution.probability)} · ` +
      probabilityStatus
    : `${fixed(mapping.probability)} · ${probabilityStatus}`;
  const formattedFinalValue = formatSemanticValue(target, finalValue, locale);
  const sameTargetReplaceCount = mixerFrame.contributions.filter(item =>
    item.targetId === mapping.targetId && item.replaceMode === 'replace'
  ).length;
  const targetAttributionIsConservative =
    breakdown.targetReason !== 'SELECTED_MAPPING' ||
    (contribution?.replaceMode === 'replace' && sameTargetReplaceCount > 1);
  let summary: string;
  if (breakdown.mappingReason === 'CONTRIBUTING' && contribution) {
    summary = targetAttributionIsConservative
      ? input.translator.t('presenter.runtime.contributionAltered', {
          source: source.label,
          contribution: fixed(contribution.value),
          target: target.label,
          finalValue: formattedFinalValue
        })
      : input.translator.t('presenter.runtime.contributing', {
          source: source.label,
          sourceValue: formatSemanticValue(
            source,
            contribution.sourceValue,
            locale
          ),
          contribution: fixed(contribution.value),
          operation: operation.label,
          target: target.label,
          finalValue: formattedFinalValue
        });
  } else if (breakdown.mappingReason === 'GATE_CLOSED' && gateDecision) {
    const gateSource = resolveSourceDescriptor(
      gateDecision.sourceId,
      input.translator
    );
    summary = input.translator.t('presenter.runtime.gateClosed', {
      status: mappingStatus.label,
      gateSource: gateSource.label,
      gateValue: formatSemanticValue(
        gateSource,
        gateDecision.sourceValue,
        locale
      ),
      gateThreshold: formatSemanticValue(
        gateSource,
        gateDecision.threshold,
        locale
      ),
      targetDescription: targetStatus.description
    });
  } else if (
    breakdown.mappingReason === 'PROBABILITY_BLOCKED' &&
    contribution
  ) {
    summary = Math.abs(contribution.value) > 1e-9
      ? input.translator.t(
          'presenter.runtime.probabilityBlockedWithContribution',
          {
            status: mappingStatus.label,
            sample: fixed(contribution.probabilitySample),
            probability: fixed(contribution.probability),
            contribution: fixed(contribution.value),
            finalValue: formattedFinalValue,
            targetDescription: targetStatus.description
          }
        )
      : input.translator.t('presenter.runtime.probabilityBlocked', {
          status: mappingStatus.label,
          sample: fixed(contribution.probabilitySample),
          probability: fixed(contribution.probability),
          targetDescription: targetStatus.description
        });
  } else {
    summary = input.translator.t('presenter.runtime.status', {
      status: mappingStatus.label,
      description: mappingStatus.description,
      targetDescription: targetStatus.description
    });
  }

  return Object.freeze({
    available: true,
    summary,
    mappingId: mapping.id,
    sourceId: mapping.sourceId,
    targetId: mapping.targetId,
    source,
    target,
    operation,
    mappingStatus,
    targetStatus,
    breakdown,
    contribution,
    gateDecision,
    pipeline: Object.freeze(pipeline),
    probabilityText,
    providerText: providerText(
      input.sourceMeta ?? null,
      mapping.sourceId,
      input.translator
    ),
    sourceMeta: input.sourceMeta ?? null,
    frameIndex: finite(input.frameIndex, -1),
    engineTimeMs: finite(input.engineTimeMs)
  });
}
