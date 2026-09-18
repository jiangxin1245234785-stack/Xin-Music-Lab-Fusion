import type { MappingSourceValues } from '../mapping/index.js';
import { type RuntimeSourceId } from './source-registry-adapter.js';
import { type VisualClockFrame, type VisualClockSourceId } from './visual-clock.js';
export type GeneratorMappingSourceId = RuntimeSourceId | VisualClockSourceId;
export interface VisualClockSourceDefinition {
    readonly sourceId: VisualClockSourceId;
    readonly group: 'derived-control';
    readonly adapter: 'visual-clock';
}
export declare const VISUAL_CLOCK_SOURCE_REGISTRY: readonly VisualClockSourceDefinition[];
export declare const GENERATOR_MAPPING_SOURCE_IDS: readonly GeneratorMappingSourceId[];
export declare function mergeGeneratorControlSources(musicSources: MappingSourceValues, visualClock: VisualClockFrame): MappingSourceValues;
//# sourceMappingURL=control-source-registry.d.ts.map