import { createMappingCard } from '../schema/defaults.js';
import type {
  MappingCard,
  ResolvedMappingCard
} from '../schema/types.js';

export interface MappingRuntimeFilter {
  readonly rackEnabled?: boolean;
  readonly soloMappingId?: string | null;
}

export function filterMappingsForRuntime(
  mappings: readonly MappingCard[],
  options: MappingRuntimeFilter = {}
): readonly ResolvedMappingCard[] {
  const rackEnabled = options.rackEnabled !== false;
  const soloId = options.soloMappingId ?? null;

  return mappings.map(input => {
    const mapping = createMappingCard(input);
    const isolated = soloId === null || mapping.id === soloId;
    return createMappingCard({
      ...mapping,
      enabled: rackEnabled && isolated && mapping.enabled
    });
  });
}

export function toggleMappingBypass(
  mappings: readonly MappingCard[],
  mappingId: string
): readonly ResolvedMappingCard[] {
  return mappings.map(input => {
    const mapping = createMappingCard(input);
    return mapping.id === mappingId
      ? createMappingCard({ ...mapping, enabled: !mapping.enabled })
      : mapping;
  });
}

function nextDuplicateId(
  mappings: readonly MappingCard[],
  sourceId: string
): string {
  const occupied = new Set(mappings.map(mapping => mapping.id ?? ''));
  const stem = `${sourceId || 'mapping'}-copy`;
  if (!occupied.has(stem)) return stem;
  let suffix = 2;
  while (occupied.has(`${stem}-${suffix}`)) suffix++;
  return `${stem}-${suffix}`;
}

export function duplicateMapping(
  mappings: readonly MappingCard[],
  mappingId: string
): {
  readonly mappings: readonly ResolvedMappingCard[];
  readonly duplicateId: string | null;
} {
  const result = mappings.map(createMappingCard);
  const source = result.find(mapping => mapping.id === mappingId);
  if (!source) return { mappings: result, duplicateId: null };

  const duplicateId = nextDuplicateId(result, source.id);
  result.push(createMappingCard({ ...source, id: duplicateId }));
  return { mappings: result, duplicateId };
}

export function deleteMapping(
  mappings: readonly MappingCard[],
  mappingId: string
): readonly ResolvedMappingCard[] {
  return mappings
    .filter(mapping => mapping.id !== mappingId)
    .map(createMappingCard);
}

export function createNextMapping(
  mappings: readonly MappingCard[],
  template: MappingCard = {}
): ResolvedMappingCard {
  const occupied = new Set(mappings.map(mapping => mapping.id ?? ''));
  let suffix = mappings.length + 1;
  while (occupied.has(`mapping-${suffix}`)) suffix++;
  return createMappingCard({
    id: `mapping-${suffix}`,
    ...template
  });
}
