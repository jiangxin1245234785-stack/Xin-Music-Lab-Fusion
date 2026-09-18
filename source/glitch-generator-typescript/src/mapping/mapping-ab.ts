import {
  createMappingCard,
  createMappingParameterSet
} from '../schema/defaults.js';
import type {
  MappingABVariant,
  MappingCard,
  MappingParameterSet,
  ResolvedMappingCard
} from '../schema/types.js';

function variantKey(variant: MappingABVariant): 'a' | 'b' {
  return variant === 'B' ? 'b' : 'a';
}

export function updateMappingABParameters(
  input: MappingCard,
  patch: MappingParameterSet,
  variant?: MappingABVariant
): ResolvedMappingCard {
  const mapping = createMappingCard(input);
  const selected = variant ?? mapping.ab.active;
  const key = variantKey(selected);
  const parameters = createMappingParameterSet(
    patch,
    mapping.ab[key]
  );
  return createMappingCard({
    ...mapping,
    ab: {
      ...mapping.ab,
      [key]: parameters
    }
  });
}

export function setMappingABVariant(
  input: MappingCard,
  variant: MappingABVariant
): ResolvedMappingCard {
  const mapping = createMappingCard(input);
  return createMappingCard({
    ...mapping,
    ab: {
      ...mapping.ab,
      active: variant
    }
  });
}

export function setMappingABVariantById(
  mappings: readonly MappingCard[],
  mappingId: string,
  variant: MappingABVariant
): readonly ResolvedMappingCard[] {
  return mappings.map(input => {
    const mapping = createMappingCard(input);
    return mapping.id === mappingId
      ? setMappingABVariant(mapping, variant)
      : mapping;
  });
}
