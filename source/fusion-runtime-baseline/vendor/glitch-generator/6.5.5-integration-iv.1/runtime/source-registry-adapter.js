import { CONTINUOUS_MUSIC_FEATURE_IDS, EVENT_MUSIC_FEATURE_IDS, LABEL_MUSIC_FEATURE_IDS, STATE_MUSIC_FEATURE_IDS } from '../contracts/index.js';
import { adaptChordLabelToHue, HARMONY_ADAPTER_VERSION } from './harmony-adapter.js';
export const RUNTIME_SOURCE_CONTRACT = 'xin.glitch-source-frame/1';
export const SOURCE_REGISTRY_VERSION = '3.3.0-shadow';
const definitions = Object.freeze([
    ...CONTINUOUS_MUSIC_FEATURE_IDS.map(featureId => Object.freeze({
        sourceId: `audio.${featureId}`,
        featureId,
        group: 'continuous',
        adapter: 'identity'
    })),
    ...STATE_MUSIC_FEATURE_IDS.map(featureId => Object.freeze({
        sourceId: `state.${featureId}`,
        featureId,
        group: 'state',
        adapter: 'identity'
    })),
    ...EVENT_MUSIC_FEATURE_IDS.map(featureId => Object.freeze({
        sourceId: `event.${featureId}`,
        featureId,
        group: 'event',
        adapter: 'identity'
    })),
    Object.freeze({
        sourceId: 'confidence.sectionBoundary',
        featureId: 'sectionBoundary',
        group: 'confidence',
        adapter: 'meta-confidence'
    }),
    Object.freeze({
        sourceId: 'confidence.chord',
        featureId: 'chord',
        group: 'confidence',
        adapter: 'meta-confidence'
    }),
    Object.freeze({
        sourceId: 'confidence.climax',
        featureId: 'inClimax',
        group: 'confidence',
        adapter: 'meta-confidence'
    }),
    Object.freeze({
        sourceId: 'harmony.chordHue',
        featureId: 'chord',
        group: 'harmony',
        adapter: 'harmony-chord-hue'
    })
]);
export const RUNTIME_SOURCE_REGISTRY = definitions;
export const RUNTIME_SOURCE_IDS = Object.freeze(definitions.map(definition => definition.sourceId));
function identityValueFor(frame, definition) {
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
function clamp01(value) {
    return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
function outputFor(frame, definition) {
    const featureMeta = frame.meta[definition.featureId];
    if (definition.adapter === 'identity') {
        const identity = identityValueFor(frame, definition);
        return {
            value: identity.value,
            active: identity.active && featureMeta.available,
            available: featureMeta.available,
            fallbackReason: featureMeta.fallbackReason,
            providerDetail: featureMeta.providerDetail
        };
    }
    if (definition.adapter === 'meta-confidence') {
        const confidence = featureMeta.confidence;
        const available = featureMeta.available && Number.isFinite(confidence);
        return {
            value: available ? clamp01(confidence ?? 0) : 0,
            active: false,
            available,
            fallbackReason: available ? null : featureMeta.fallbackReason ?? 'NO_SOURCE',
            providerDetail: featureMeta.providerDetail
        };
    }
    const harmony = adaptChordLabelToHue(frame.labels.chord);
    const available = featureMeta.available && harmony.recognized;
    return {
        value: available ? harmony.hue : 0,
        active: false,
        available,
        fallbackReason: available ? null : featureMeta.fallbackReason ?? 'NO_SOURCE',
        providerDetail: Object.freeze({
            engineId: `harmony-adapter:${HARMONY_ADAPTER_VERSION}`,
            providerVersion: featureMeta.providerDetail.providerVersion
        })
    };
}
export function adaptUnifiedMusicFrameToSources(frame) {
    const values = {};
    const meta = {};
    let availableSourceCount = 0;
    let activeEventCount = 0;
    for (const definition of RUNTIME_SOURCE_REGISTRY) {
        const featureMeta = frame.meta[definition.featureId];
        const resolved = outputFor(frame, definition);
        values[definition.sourceId] = resolved.available ? resolved.value : 0;
        if (resolved.available)
            availableSourceCount++;
        if (resolved.active)
            activeEventCount++;
        meta[definition.sourceId] = Object.freeze({
            sourceId: definition.sourceId,
            featureId: definition.featureId,
            group: definition.group,
            adapter: definition.adapter,
            available: resolved.available,
            active: resolved.active,
            sourceProvider: featureMeta.sourceProvider,
            providerDetail: Object.freeze({ ...resolved.providerDetail }),
            confidence: featureMeta.confidence,
            ageMs: featureMeta.ageMs,
            fallbackReason: resolved.fallbackReason
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