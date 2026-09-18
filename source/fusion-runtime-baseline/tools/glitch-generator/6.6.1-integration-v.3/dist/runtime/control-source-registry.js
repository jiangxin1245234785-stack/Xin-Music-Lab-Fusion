import { RUNTIME_SOURCE_IDS } from './source-registry-adapter.js';
import { VISUAL_CLOCK_SOURCE_IDS } from './visual-clock.js';
export const VISUAL_CLOCK_SOURCE_REGISTRY = Object.freeze(VISUAL_CLOCK_SOURCE_IDS.map(sourceId => Object.freeze({
    sourceId,
    group: 'derived-control',
    adapter: 'visual-clock'
})));
export const GENERATOR_MAPPING_SOURCE_IDS = Object.freeze([
    ...RUNTIME_SOURCE_IDS,
    ...VISUAL_CLOCK_SOURCE_IDS
]);
export function mergeGeneratorControlSources(musicSources, visualClock) {
    return Object.freeze({
        ...musicSources,
        ...visualClock.values
    });
}
//# sourceMappingURL=control-source-registry.js.map