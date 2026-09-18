import type { MappingSourceValues } from '../mapping/index.js';
import {
  RUNTIME_SOURCE_IDS,
  type RuntimeSourceId
} from './source-registry-adapter.js';
import {
  VISUAL_CLOCK_SOURCE_IDS,
  type VisualClockFrame,
  type VisualClockSourceId
} from './visual-clock.js';

export type GeneratorMappingSourceId =
  | RuntimeSourceId
  | VisualClockSourceId;

export interface VisualClockSourceDefinition {
  readonly sourceId: VisualClockSourceId;
  readonly group: 'derived-control';
  readonly adapter: 'visual-clock';
}

export const VISUAL_CLOCK_SOURCE_REGISTRY:
readonly VisualClockSourceDefinition[] = Object.freeze(
  VISUAL_CLOCK_SOURCE_IDS.map(sourceId => Object.freeze({
    sourceId,
    group: 'derived-control' as const,
    adapter: 'visual-clock' as const
  }))
);

export const GENERATOR_MAPPING_SOURCE_IDS:
readonly GeneratorMappingSourceId[] = Object.freeze([
  ...RUNTIME_SOURCE_IDS,
  ...VISUAL_CLOCK_SOURCE_IDS
]);

export function mergeGeneratorControlSources(
  musicSources: MappingSourceValues,
  visualClock: VisualClockFrame
): MappingSourceValues {
  return Object.freeze({
    ...musicSources,
    ...visualClock.values
  });
}

