import { CONTINUOUS_MUSIC_FEATURE_IDS, EVENT_MUSIC_FEATURE_IDS, LABEL_MUSIC_FEATURE_IDS, STATE_MUSIC_FEATURE_IDS, UNIFIED_MUSIC_FEATURE_IDS, UNIFIED_MUSIC_FRAME_CONTRACT, UNIFIED_MUSIC_FRAME_CONTRACT_VERSION } from './registry.js';
function createFrozenRecord(keys, createValue) {
    return Object.freeze(Object.fromEntries(keys.map(key => [key, createValue(key)])));
}
export const UNIFIED_ENGINE_CLOCK_DEFAULTS = Object.freeze({
    frameIndex: 0,
    nowMs: 0,
    deltaMs: 0
});
export const MUSIC_TRANSPORT_DEFAULTS = Object.freeze({
    mode: 'offline-test',
    state: 'stopped',
    trackId: null,
    mediaTimeMs: null,
    durationMs: null,
    epoch: 0
});
export const FEATURE_PROVIDER_DETAIL_DEFAULTS = Object.freeze({
    engineId: '',
    providerVersion: ''
});
export const FEATURE_META_DEFAULTS = Object.freeze({
    sourceProvider: 'neutral',
    providerDetail: FEATURE_PROVIDER_DETAIL_DEFAULTS,
    confidence: null,
    available: false,
    ageMs: 0,
    fallbackReason: 'NO_SOURCE'
});
export const MUSIC_EVENT_DEFAULTS = Object.freeze({
    eventId: '',
    strength: 0,
    engineTimeMs: 0,
    mediaTimeMs: null,
    epoch: 0
});
export const CONTINUOUS_MUSIC_FEATURE_DEFAULTS = createFrozenRecord(CONTINUOUS_MUSIC_FEATURE_IDS, () => 0);
export const STATE_MUSIC_FEATURE_DEFAULTS = createFrozenRecord(STATE_MUSIC_FEATURE_IDS, () => 0);
export const EVENT_MUSIC_FEATURE_DEFAULTS = createFrozenRecord(EVENT_MUSIC_FEATURE_IDS, () => null);
export const LABEL_MUSIC_FEATURE_DEFAULTS = createFrozenRecord(LABEL_MUSIC_FEATURE_IDS, () => null);
export const UNIFIED_MUSIC_FEATURE_META_DEFAULTS = createFrozenRecord(UNIFIED_MUSIC_FEATURE_IDS, () => Object.freeze({
    ...FEATURE_META_DEFAULTS,
    providerDetail: Object.freeze({
        ...FEATURE_PROVIDER_DETAIL_DEFAULTS
    })
}));
export const UNIFIED_MUSIC_FRAME_DEFAULTS = Object.freeze({
    contract: UNIFIED_MUSIC_FRAME_CONTRACT,
    contractVersion: UNIFIED_MUSIC_FRAME_CONTRACT_VERSION,
    clock: UNIFIED_ENGINE_CLOCK_DEFAULTS,
    transport: MUSIC_TRANSPORT_DEFAULTS,
    continuous: CONTINUOUS_MUSIC_FEATURE_DEFAULTS,
    states: STATE_MUSIC_FEATURE_DEFAULTS,
    events: EVENT_MUSIC_FEATURE_DEFAULTS,
    labels: LABEL_MUSIC_FEATURE_DEFAULTS,
    meta: UNIFIED_MUSIC_FEATURE_META_DEFAULTS
});
//# sourceMappingURL=defaults.js.map