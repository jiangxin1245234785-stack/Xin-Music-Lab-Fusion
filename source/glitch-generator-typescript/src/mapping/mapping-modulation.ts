import {
  createMappingCard,
  createMappingModulation
} from '../schema/defaults.js';
import type {
  MappingCard,
  MappingModulation,
  MappingModulationTarget,
  ResolvedMappingCard,
  ResolvedMappingModulation
} from '../schema/types.js';
import type { MappingSourceValues } from './minimal-mapper.js';

export interface MappingModulationTrace {
  readonly id: string;
  readonly sourceId: string;
  readonly targetParameter: MappingModulationTarget;
  readonly sourceValue: number;
  readonly depth: number;
  readonly contribution: number;
}

export interface MappingModulationResolution {
  readonly mapping: ResolvedMappingCard;
  readonly traces: readonly MappingModulationTrace[];
}

const finiteOr = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const clamp01 = (value: number): number =>
  Math.max(0, Math.min(1, finiteOr(value)));

function stableModulationId(
  mapping: ResolvedMappingCard,
  modulation: ResolvedMappingModulation,
  index: number
): string {
  return modulation.id ||
    `${mapping.id || 'mapping'}-modulation-${index + 1}`;
}

export function resolveMappingModulations(
  input: MappingCard,
  sourceValues: MappingSourceValues
): MappingModulationResolution {
  const mapping = createMappingCard(input);
  const totals: Record<MappingModulationTarget, number> = {
    amount: 0,
    threshold: 0,
    fallMs: 0,
    probability: 0
  };
  const traces = mapping.modulations
    .map((modulation, index) => ({
      modulation,
      id: stableModulationId(mapping, modulation, index)
    }))
    .sort((left, right) => left.id.localeCompare(right.id))
    .flatMap(({ modulation, id }): MappingModulationTrace[] => {
      if (!modulation.enabled || !modulation.sourceId) return [];
      const sourceValue = finiteOr(sourceValues[modulation.sourceId]);
      const depth = finiteOr(modulation.depth);
      const contribution = sourceValue * depth;
      totals[modulation.targetParameter] += contribution;
      return [Object.freeze({
        id,
        sourceId: modulation.sourceId,
        targetParameter: modulation.targetParameter,
        sourceValue,
        depth,
        contribution
      })];
    });

  const amount = finiteOr(mapping.amount, 1) + totals.amount;
  const threshold = clamp01(
    finiteOr(mapping.threshold) + totals.threshold
  );
  const fallMs = Math.max(
    0,
    finiteOr(mapping.fallMs) + totals.fallMs
  );
  const probability = clamp01(
    finiteOr(mapping.probability, 1) + totals.probability
  );
  const activeKey = mapping.ab.active === 'B' ? 'b' : 'a';
  const resolved = createMappingCard({
    ...mapping,
    probability,
    ab: {
      ...mapping.ab,
      [activeKey]: {
        ...mapping.ab[activeKey],
        amount,
        threshold,
        fallMs
      }
    }
  });
  return Object.freeze({
    mapping: resolved,
    traces: Object.freeze(traces)
  });
}

export function resolveMappingCollectionModulations(
  mappings: readonly MappingCard[],
  sourceValues: MappingSourceValues
): readonly ResolvedMappingCard[] {
  return Object.freeze(
    mappings.map(mapping =>
      resolveMappingModulations(mapping, sourceValues).mapping
    )
  );
}

function nextModulationId(mapping: ResolvedMappingCard): string {
  const occupied = new Set(
    mapping.modulations.map(modulation => modulation.id)
  );
  const stem = `${mapping.id || 'mapping'}-modulation`;
  let suffix = mapping.modulations.length + 1;
  while (occupied.has(`${stem}-${suffix}`)) suffix += 1;
  return `${stem}-${suffix}`;
}

export function createNextMappingModulation(
  input: MappingCard,
  template: MappingModulation = {}
): ResolvedMappingCard {
  const mapping = createMappingCard(input);
  const modulation = createMappingModulation(
    template,
    nextModulationId(mapping)
  );
  return createMappingCard({
    ...mapping,
    modulations: [...mapping.modulations, modulation]
  });
}

export function updateMappingModulation(
  input: MappingCard,
  modulationId: string,
  patch: MappingModulation
): ResolvedMappingCard {
  const mapping = createMappingCard(input);
  return createMappingCard({
    ...mapping,
    modulations: mapping.modulations.map(modulation =>
      modulation.id === modulationId
        ? createMappingModulation({
            ...modulation,
            ...patch,
            id: modulation.id
          })
        : modulation
    )
  });
}

export function deleteMappingModulation(
  input: MappingCard,
  modulationId: string
): ResolvedMappingCard {
  const mapping = createMappingCard(input);
  return createMappingCard({
    ...mapping,
    modulations: mapping.modulations.filter(
      modulation => modulation.id !== modulationId
    )
  });
}
