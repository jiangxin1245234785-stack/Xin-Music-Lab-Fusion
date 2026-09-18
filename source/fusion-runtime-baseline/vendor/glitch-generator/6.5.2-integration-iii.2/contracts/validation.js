import { CONTINUOUS_MUSIC_FEATURE_IDS, EVENT_MUSIC_FEATURE_IDS, LABEL_MUSIC_FEATURE_IDS, MUSIC_FEATURE_FALLBACK_REASONS, MUSIC_FEATURE_PROVIDERS, STATE_MUSIC_FEATURE_IDS, UNIFIED_MUSIC_FEATURE_IDS, UNIFIED_MUSIC_FRAME_CONTRACT, UNIFIED_MUSIC_FRAME_CONTRACT_VERSION } from './registry.js';
const ROOT_FIELDS = Object.freeze([
    'contract',
    'contractVersion',
    'clock',
    'transport',
    'continuous',
    'states',
    'events',
    'labels',
    'meta'
]);
const CLOCK_FIELDS = Object.freeze([
    'frameIndex',
    'nowMs',
    'deltaMs'
]);
const TRANSPORT_FIELDS = Object.freeze([
    'mode',
    'state',
    'trackId',
    'mediaTimeMs',
    'durationMs',
    'epoch'
]);
const EVENT_FIELDS = Object.freeze([
    'eventId',
    'strength',
    'engineTimeMs',
    'mediaTimeMs',
    'epoch'
]);
const META_FIELDS = Object.freeze([
    'sourceProvider',
    'providerDetail',
    'confidence',
    'available',
    'ageMs',
    'fallbackReason'
]);
const PROVIDER_DETAIL_FIELDS = Object.freeze([
    'engineId',
    'providerVersion'
]);
const TRANSPORT_MODES = Object.freeze([
    'internal',
    'external',
    'offline-test'
]);
const TRANSPORT_STATES = Object.freeze([
    'playing',
    'paused',
    'seeking',
    'stopped'
]);
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function hasOwn(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
}
function addIssue(issues, code, path, message) {
    issues.push(Object.freeze({
        severity: 'error',
        code,
        path,
        message
    }));
}
function validateObjectShape(value, path, knownFields, mode, issues) {
    if (!isRecord(value)) {
        addIssue(issues, 'NOT_OBJECT', path, `${path} must be an object.`);
        return null;
    }
    const known = new Set(knownFields);
    for (const key of Object.keys(value)) {
        if (!known.has(key)) {
            addIssue(issues, 'UNKNOWN_FIELD', `${path}.${key}`, `${path}.${key} is not declared by the v1 contract.`);
        }
    }
    if (mode === 'resolved') {
        for (const key of knownFields) {
            if (!hasOwn(value, key)) {
                addIssue(issues, 'MISSING_FIELD', `${path}.${key}`, `${path}.${key} is required in a resolved frame.`);
            }
        }
    }
    return value;
}
function validateFiniteNumber(value, path, issues, minimum, maximum) {
    if (typeof value !== 'number') {
        addIssue(issues, 'INVALID_TYPE', path, `${path} must be a number.`);
        return;
    }
    if (!Number.isFinite(value)) {
        addIssue(issues, 'NON_FINITE_NUMBER', path, `${path} must be finite.`);
        return;
    }
    if ((minimum !== undefined && value < minimum) ||
        (maximum !== undefined && value > maximum)) {
        addIssue(issues, 'OUT_OF_RANGE', path, `${path} must be within ${String(minimum)}..${String(maximum)}.`);
    }
}
function validateInteger(value, path, issues, minimum = 0) {
    validateFiniteNumber(value, path, issues, minimum);
    if (typeof value === 'number' && Number.isFinite(value) && !Number.isInteger(value)) {
        addIssue(issues, 'INVALID_TYPE', path, `${path} must be an integer.`);
    }
}
function validateNullableNonNegativeNumber(value, path, issues) {
    if (value === null)
        return;
    validateFiniteNumber(value, path, issues, 0);
}
function validateEnum(value, path, allowed, issues) {
    if (typeof value !== 'string') {
        addIssue(issues, 'INVALID_TYPE', path, `${path} must be a string.`);
        return;
    }
    if (!allowed.includes(value)) {
        addIssue(issues, 'INVALID_ENUM', path, `${path} must be one of: ${allowed.join(', ')}.`);
    }
}
function validatePresentField(object, key, mode, validate, basePath) {
    if (hasOwn(object, key)) {
        validate(object[key], `${basePath}.${key}`);
    }
    else if (mode === 'resolved') {
        // validateObjectShape already emitted the missing-field issue.
    }
}
function validateClock(value, mode, issues) {
    const clock = validateObjectShape(value, 'clock', CLOCK_FIELDS, mode, issues);
    if (!clock)
        return;
    validatePresentField(clock, 'frameIndex', mode, (entry, path) => validateInteger(entry, path, issues), 'clock');
    for (const key of ['nowMs', 'deltaMs']) {
        validatePresentField(clock, key, mode, (entry, path) => validateFiniteNumber(entry, path, issues, 0), 'clock');
    }
}
function validateTransport(value, mode, issues) {
    const transport = validateObjectShape(value, 'transport', TRANSPORT_FIELDS, mode, issues);
    if (!transport)
        return;
    validatePresentField(transport, 'mode', mode, (entry, path) => validateEnum(entry, path, TRANSPORT_MODES, issues), 'transport');
    validatePresentField(transport, 'state', mode, (entry, path) => validateEnum(entry, path, TRANSPORT_STATES, issues), 'transport');
    validatePresentField(transport, 'trackId', mode, (entry, path) => {
        if (entry !== null && typeof entry !== 'string') {
            addIssue(issues, 'INVALID_TYPE', path, `${path} must be a string or null.`);
        }
    }, 'transport');
    for (const key of ['mediaTimeMs', 'durationMs']) {
        validatePresentField(transport, key, mode, (entry, path) => validateNullableNonNegativeNumber(entry, path, issues), 'transport');
    }
    validatePresentField(transport, 'epoch', mode, (entry, path) => validateInteger(entry, path, issues), 'transport');
}
function validateNumericFeatureRecord(value, path, featureIds, mode, issues) {
    const record = validateObjectShape(value, path, featureIds, mode, issues);
    if (!record)
        return;
    for (const featureId of featureIds) {
        validatePresentField(record, featureId, mode, (entry, entryPath) => validateFiniteNumber(entry, entryPath, issues, 0, 1), path);
    }
}
function validateEvent(value, path, mode, issues) {
    if (value === null)
        return;
    const event = validateObjectShape(value, path, EVENT_FIELDS, mode, issues);
    if (!event)
        return;
    validatePresentField(event, 'eventId', mode, (entry, entryPath) => {
        if (typeof entry !== 'string') {
            addIssue(issues, 'INVALID_TYPE', entryPath, `${entryPath} must be a string.`);
        }
        else if (entry.trim().length === 0) {
            addIssue(issues, 'EMPTY_EVENT_ID', entryPath, `${entryPath} must identify an emitted event.`);
        }
    }, path);
    validatePresentField(event, 'strength', mode, (entry, entryPath) => validateFiniteNumber(entry, entryPath, issues, 0, 1), path);
    validatePresentField(event, 'engineTimeMs', mode, (entry, entryPath) => validateFiniteNumber(entry, entryPath, issues, 0), path);
    validatePresentField(event, 'mediaTimeMs', mode, (entry, entryPath) => validateNullableNonNegativeNumber(entry, entryPath, issues), path);
    validatePresentField(event, 'epoch', mode, (entry, entryPath) => validateInteger(entry, entryPath, issues), path);
}
function validateEvents(value, mode, issues) {
    const events = validateObjectShape(value, 'events', EVENT_MUSIC_FEATURE_IDS, mode, issues);
    if (!events)
        return;
    for (const eventId of EVENT_MUSIC_FEATURE_IDS) {
        validatePresentField(events, eventId, mode, (entry, path) => validateEvent(entry, path, mode, issues), 'events');
    }
}
function validateLabels(value, mode, issues) {
    const labels = validateObjectShape(value, 'labels', LABEL_MUSIC_FEATURE_IDS, mode, issues);
    if (!labels)
        return;
    for (const labelId of LABEL_MUSIC_FEATURE_IDS) {
        validatePresentField(labels, labelId, mode, (entry, path) => {
            if (entry !== null && typeof entry !== 'string') {
                addIssue(issues, 'INVALID_TYPE', path, `${path} must be a string or null.`);
            }
        }, 'labels');
    }
}
function validateProviderDetail(value, path, mode, issues) {
    const detail = validateObjectShape(value, path, PROVIDER_DETAIL_FIELDS, mode, issues);
    if (!detail)
        return;
    for (const key of PROVIDER_DETAIL_FIELDS) {
        validatePresentField(detail, key, mode, (entry, entryPath) => {
            if (typeof entry !== 'string') {
                addIssue(issues, 'INVALID_TYPE', entryPath, `${entryPath} must be a string.`);
            }
        }, path);
    }
}
function validateFeatureMeta(value, path, mode, issues) {
    const meta = validateObjectShape(value, path, META_FIELDS, mode, issues);
    if (!meta)
        return;
    validatePresentField(meta, 'sourceProvider', mode, (entry, entryPath) => validateEnum(entry, entryPath, MUSIC_FEATURE_PROVIDERS, issues), path);
    validatePresentField(meta, 'providerDetail', mode, (entry, entryPath) => validateProviderDetail(entry, entryPath, mode, issues), path);
    validatePresentField(meta, 'confidence', mode, (entry, entryPath) => {
        if (entry !== null) {
            validateFiniteNumber(entry, entryPath, issues, 0, 1);
        }
    }, path);
    validatePresentField(meta, 'available', mode, (entry, entryPath) => {
        if (typeof entry !== 'boolean') {
            addIssue(issues, 'INVALID_TYPE', entryPath, `${entryPath} must be a boolean.`);
        }
    }, path);
    validatePresentField(meta, 'ageMs', mode, (entry, entryPath) => validateFiniteNumber(entry, entryPath, issues, 0), path);
    validatePresentField(meta, 'fallbackReason', mode, (entry, entryPath) => {
        if (entry !== null) {
            validateEnum(entry, entryPath, MUSIC_FEATURE_FALLBACK_REASONS, issues);
        }
    }, path);
}
function validateMeta(value, mode, issues) {
    const meta = validateObjectShape(value, 'meta', UNIFIED_MUSIC_FEATURE_IDS, mode, issues);
    if (!meta)
        return;
    for (const featureId of UNIFIED_MUSIC_FEATURE_IDS) {
        validatePresentField(meta, featureId, mode, (entry, path) => validateFeatureMeta(entry, path, mode, issues), 'meta');
    }
}
export function validateUnifiedMusicFrame(input, mode = 'resolved') {
    const issues = [];
    const root = validateObjectShape(input, 'frame', ROOT_FIELDS, mode, issues);
    if (!root) {
        return Object.freeze({
            valid: false,
            mode,
            issues: Object.freeze(issues)
        });
    }
    validatePresentField(root, 'contract', mode, (value, path) => {
        if (value !== UNIFIED_MUSIC_FRAME_CONTRACT) {
            addIssue(issues, 'CONTRACT_MISMATCH', path, `${path} must equal ${UNIFIED_MUSIC_FRAME_CONTRACT}.`);
        }
    }, 'frame');
    validatePresentField(root, 'contractVersion', mode, (value, path) => {
        if (typeof value !== 'number' ||
            !Number.isInteger(value) ||
            value !== UNIFIED_MUSIC_FRAME_CONTRACT_VERSION) {
            addIssue(issues, 'CONTRACT_VERSION_UNSUPPORTED', path, `${path} must equal ${String(UNIFIED_MUSIC_FRAME_CONTRACT_VERSION)}.`);
        }
    }, 'frame');
    validatePresentField(root, 'clock', mode, value => validateClock(value, mode, issues), 'frame');
    validatePresentField(root, 'transport', mode, value => validateTransport(value, mode, issues), 'frame');
    validatePresentField(root, 'continuous', mode, value => validateNumericFeatureRecord(value, 'continuous', CONTINUOUS_MUSIC_FEATURE_IDS, mode, issues), 'frame');
    validatePresentField(root, 'states', mode, value => validateNumericFeatureRecord(value, 'states', STATE_MUSIC_FEATURE_IDS, mode, issues), 'frame');
    validatePresentField(root, 'events', mode, value => validateEvents(value, mode, issues), 'frame');
    validatePresentField(root, 'labels', mode, value => validateLabels(value, mode, issues), 'frame');
    validatePresentField(root, 'meta', mode, value => validateMeta(value, mode, issues), 'frame');
    return Object.freeze({
        valid: issues.length === 0,
        mode,
        issues: Object.freeze(issues)
    });
}
export class UnifiedMusicFrameValidationError extends Error {
    report;
    constructor(report) {
        super(report.issues.length > 0
            ? `${report.issues[0].path}: ${report.issues[0].message}`
            : 'UnifiedMusicFrame validation failed.');
        this.name = 'UnifiedMusicFrameValidationError';
        this.report = report;
    }
}
//# sourceMappingURL=validation.js.map