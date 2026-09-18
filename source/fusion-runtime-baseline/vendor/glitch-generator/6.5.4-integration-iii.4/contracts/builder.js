import { CONTINUOUS_MUSIC_FEATURE_DEFAULTS, EVENT_MUSIC_FEATURE_DEFAULTS, FEATURE_META_DEFAULTS, FEATURE_PROVIDER_DETAIL_DEFAULTS, LABEL_MUSIC_FEATURE_DEFAULTS, MUSIC_EVENT_DEFAULTS, MUSIC_TRANSPORT_DEFAULTS, STATE_MUSIC_FEATURE_DEFAULTS, UNIFIED_ENGINE_CLOCK_DEFAULTS, UNIFIED_MUSIC_FEATURE_META_DEFAULTS } from './defaults.js';
import { CONTINUOUS_MUSIC_FEATURE_IDS, EVENT_MUSIC_FEATURE_IDS, LABEL_MUSIC_FEATURE_IDS, STATE_MUSIC_FEATURE_IDS, UNIFIED_MUSIC_FEATURE_IDS, UNIFIED_MUSIC_FRAME_CONTRACT, UNIFIED_MUSIC_FRAME_CONTRACT_VERSION } from './registry.js';
import { UnifiedMusicFrameValidationError, validateUnifiedMusicFrame } from './validation.js';
function buildNumberRecord(keys, defaults, input) {
    const output = {};
    for (const key of keys)
        output[key] = input?.[key] ?? defaults[key];
    return output;
}
function buildEventRecord(input) {
    const output = {};
    for (const key of EVENT_MUSIC_FEATURE_IDS) {
        const event = input?.[key] ?? EVENT_MUSIC_FEATURE_DEFAULTS[key];
        output[key] = event === null
            ? null
            : {
                ...MUSIC_EVENT_DEFAULTS,
                ...event
            };
    }
    return output;
}
function buildLabelRecord(input) {
    const output = {};
    for (const key of LABEL_MUSIC_FEATURE_IDS) {
        output[key] = input?.[key] ?? LABEL_MUSIC_FEATURE_DEFAULTS[key];
    }
    return output;
}
function buildMetaRecord(input) {
    const output = {};
    for (const key of UNIFIED_MUSIC_FEATURE_IDS) {
        const meta = input?.[key];
        output[key] = {
            ...UNIFIED_MUSIC_FEATURE_META_DEFAULTS[key],
            ...meta,
            providerDetail: {
                ...FEATURE_PROVIDER_DETAIL_DEFAULTS,
                ...(meta?.providerDetail ?? FEATURE_META_DEFAULTS.providerDetail)
            }
        };
    }
    return output;
}
/**
 * Resolves a partial, already-unified fixture into a complete v1 frame.
 *
 * This pure function performs no provider arbitration and reads no external
 * clock, DOM, audio, XML state or random source.
 */
export function buildUnifiedMusicFrame(input = {}) {
    const inputReport = validateUnifiedMusicFrame(input, 'partial');
    if (!inputReport.valid) {
        throw new UnifiedMusicFrameValidationError(inputReport);
    }
    const frame = {
        contract: input.contract ?? UNIFIED_MUSIC_FRAME_CONTRACT,
        contractVersion: input.contractVersion ?? UNIFIED_MUSIC_FRAME_CONTRACT_VERSION,
        clock: {
            ...UNIFIED_ENGINE_CLOCK_DEFAULTS,
            ...input.clock
        },
        transport: {
            ...MUSIC_TRANSPORT_DEFAULTS,
            ...input.transport
        },
        continuous: buildNumberRecord(CONTINUOUS_MUSIC_FEATURE_IDS, CONTINUOUS_MUSIC_FEATURE_DEFAULTS, input.continuous),
        states: buildNumberRecord(STATE_MUSIC_FEATURE_IDS, STATE_MUSIC_FEATURE_DEFAULTS, input.states),
        events: buildEventRecord(input.events),
        labels: buildLabelRecord(input.labels),
        meta: buildMetaRecord(input.meta)
    };
    const resolvedReport = validateUnifiedMusicFrame(frame, 'resolved');
    if (!resolvedReport.valid) {
        throw new UnifiedMusicFrameValidationError(resolvedReport);
    }
    return frame;
}
//# sourceMappingURL=builder.js.map