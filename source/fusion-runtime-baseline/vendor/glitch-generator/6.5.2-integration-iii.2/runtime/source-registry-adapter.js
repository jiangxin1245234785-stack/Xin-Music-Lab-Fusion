import { CONTINUOUS_MUSIC_FEATURE_IDS, EVENT_MUSIC_FEATURE_IDS, LABEL_MUSIC_FEATURE_IDS, STATE_MUSIC_FEATURE_IDS } from '../contracts/index.js';
export const RUNTIME_SOURCE_CONTRACT = 'xin.glitch-source-frame/1';
export const SOURCE_REGISTRY_VERSION = '3.2.0-shadow';
const definitions = Object.freeze([
    ...CONTINUOUS_MUSIC_FEATURE_IDS.map(featureId => Object.freeze({
        sourceId: `audio.${featureId}`,
        featureId,
        group: 'continuous'
    })),
    ...STATE_MUSIC_FEATURE_IDS.map(featureId => Object.freeze({
        sourceId: `state.${featureId}`,
        featureId,
        group: 'state'
    })),
    ...EVENT_MUSIC_FEATURE_IDS.map(featureId => Object.freeze({
        sourceId: `event.${featureId}`,
        featureId,
        group: 'event'
    }))
]);
export const RUNTIME_SOURCE_REGISTRY = definitions;
export const RUNTIME_SOURCE_IDS = Object.freeze(definitions.map(definition => definition.sourceId));
function valueFor(frame, definition) {
    if (definition.group === 'continuous') {
        return {
            value: frame.continuous[definition.featureId],
            active: false
        };
    }
    if (definition.group === 'state') {
        return {
            value: frame.states[definition.featureId],
            active: false
        };
    }
    const event = frame.events[definition.featureId];
    return {
        value: event?.strength ?? 0,
        active: event !== null
    };
}
export function adaptUnifiedMusicFrameToSources(frame) {
    const values = {};
    const meta = {};
    let availableSourceCount = 0;
    let activeEventCount = 0;
    for (const definition of RUNTIME_SOURCE_REGISTRY) {
        const featureMeta = frame.meta[definition.featureId];
        const resolved = valueFor(frame, definition);
        values[definition.sourceId] = featureMeta.available
            ? resolved.value
            : 0;
        if (featureMeta.available)
            availableSourceCount++;
        if (resolved.active)
            activeEventCount++;
        meta[definition.sourceId] = Object.freeze({
            sourceId: definition.sourceId,
            featureId: definition.featureId,
            group: definition.group,
            available: featureMeta.available,
            active: resolved.active,
            sourceProvider: featureMeta.sourceProvider,
            providerDetail: Object.freeze({
                ...featureMeta.providerDetail
            }),
            confidence: featureMeta.confidence,
            ageMs: featureMeta.ageMs,
            fallbackReason: featureMeta.fallbackReason
        });
    }
    return Object.freeze({
        contract: RUNTIME_SOURCE_CONTRACT,
        registryVersion: SOURCE_REGISTRY_VERSION,
        values: Object.freeze(values),
        meta: Object.freeze(meta),
        sourceCount: RUNTIME_SOURCE_IDS.length,
        availableSourceCount,
        activeEventCount,
        excludedLabels: LABEL_MUSIC_FEATURE_IDS
    });
}
//# sourceMappingURL=source-registry-adapter.js.map