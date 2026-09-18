import { createMappingCard } from '../schema/defaults.js';
import type {
  MappingCard,
  ResolvedMappingCard
} from '../schema/types.js';
import { updateMappingABParameters } from './mapping-ab.js';

export interface MappingMacroState {
  readonly intensity?: number;
  readonly response?: number;
}

const finitePositive = (
  value: number | undefined,
  fallback: number
): number => Number.isFinite(value) && value! > 0 ? value! : fallback;

export function applyMappingMacros(
  mappings: readonly MappingCard[],
  macros: MappingMacroState = {}
): readonly ResolvedMappingCard[] {
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
