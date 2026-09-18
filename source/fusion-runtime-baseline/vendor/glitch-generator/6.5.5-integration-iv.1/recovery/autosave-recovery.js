export const RECOVERY_FORMAT_VERSION = 1;
export const DEFAULT_RECOVERY_SESSION_KEY = 'gmg.recovery.session.v1';
export const DEFAULT_RECOVERY_AUTOSAVE_KEY = 'gmg.recovery.autosave.v1';
export const DEFAULT_RECOVERY_SEQUENCE_KEY = 'gmg.recovery.sequence.v1';
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function parseNonNegativeInteger(value, label) {
    if (!Number.isInteger(value) || value < 0) {
        throw new Error(`${label} must be a non-negative integer`);
    }
    return value;
}
function parseFiniteEngineTime(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error('engineTimeMs must be finite');
    }
    return Math.max(0, value);
}
function cloneAutosave(autosave, cloneState) {
    return Object.freeze({
        ...autosave,
        state: cloneState(autosave.state)
    });
}
export class AutosaveRecoveryManager {
    storage;
    parseState;
    cloneState;
    autosaveIntervalMs;
    sessionKey;
    autosaveKey;
    sequenceKey;
    sessionSequence = null;
    autosaveSequence = 0;
    lastAutosaveEngineTimeMs = null;
    pendingCandidate = null;
    constructor(options) {
        this.storage = options.storage;
        this.parseState = options.parseState;
        this.cloneState = options.cloneState;
        this.autosaveIntervalMs = Math.max(250, options.autosaveIntervalMs ?? 5000);
        this.sessionKey =
            options.sessionKey ?? DEFAULT_RECOVERY_SESSION_KEY;
        this.autosaveKey =
            options.autosaveKey ?? DEFAULT_RECOVERY_AUTOSAVE_KEY;
        this.sequenceKey =
            options.sequenceKey ?? DEFAULT_RECOVERY_SEQUENCE_KEY;
    }
    get hasPendingRecovery() {
        return this.pendingCandidate !== null;
    }
    startSession() {
        if (this.sessionSequence !== null) {
            throw new Error('Recovery session has already started');
        }
        const markerResult = this.readSessionMarker();
        const autosaveResult = this.readAutosave();
        const previousSequence = this.readSequence();
        const previousMarker = markerResult.value;
        const previousAutosave = autosaveResult.value;
        if (previousMarker?.status === 'open' &&
            previousAutosave?.sessionSequence === previousMarker.sessionSequence) {
            this.pendingCandidate = cloneAutosave(previousAutosave, this.cloneState);
        }
        const highestSequence = Math.max(previousSequence, previousMarker?.sessionSequence ?? 0, previousAutosave?.sessionSequence ?? 0);
        this.sessionSequence = highestSequence + 1;
        this.autosaveSequence = 0;
        this.storage.setItem(this.sequenceKey, String(this.sessionSequence));
        this.writeSessionMarker('open');
        const invalidParts = [
            markerResult.invalid ? 'session marker' : '',
            autosaveResult.invalid ? 'autosave' : ''
        ].filter(Boolean);
        return Object.freeze({
            sessionSequence: this.sessionSequence,
            candidate: this.pendingCandidate
                ? cloneAutosave(this.pendingCandidate, this.cloneState)
                : null,
            warning: invalidParts.length > 0
                ? `Ignored invalid ${invalidParts.join(' and ')}.`
                : null
        });
    }
    forceAutosave(state, engineTimeMs) {
        const sessionSequence = this.requireStarted();
        if (this.pendingCandidate)
            return null;
        const autosave = Object.freeze({
            formatVersion: RECOVERY_FORMAT_VERSION,
            sessionSequence,
            autosaveSequence: this.autosaveSequence++,
            engineTimeMs: parseFiniteEngineTime(engineTimeMs),
            state: this.cloneState(state)
        });
        this.storage.setItem(this.autosaveKey, JSON.stringify(autosave));
        this.lastAutosaveEngineTimeMs = autosave.engineTimeMs;
        return cloneAutosave(autosave, this.cloneState);
    }
    maybeAutosave(state, engineTimeMs) {
        if (!this.shouldAutosave(engineTimeMs))
            return null;
        return this.forceAutosave(state, engineTimeMs);
    }
    shouldAutosave(engineTimeMs) {
        this.requireStarted();
        if (this.pendingCandidate)
            return false;
        const currentTime = parseFiniteEngineTime(engineTimeMs);
        if (this.lastAutosaveEngineTimeMs === null)
            return true;
        if (currentTime < this.lastAutosaveEngineTimeMs) {
            this.lastAutosaveEngineTimeMs = currentTime;
            return false;
        }
        return (currentTime - this.lastAutosaveEngineTimeMs <
            this.autosaveIntervalMs)
            ? false
            : true;
    }
    recoverCandidate() {
        this.requireStarted();
        const candidate = this.pendingCandidate;
        if (!candidate)
            return null;
        this.pendingCandidate = null;
        this.storage.removeItem(this.autosaveKey);
        this.lastAutosaveEngineTimeMs = null;
        return this.cloneState(candidate.state);
    }
    discardCandidate() {
        this.requireStarted();
        if (!this.pendingCandidate)
            return false;
        this.pendingCandidate = null;
        this.storage.removeItem(this.autosaveKey);
        this.lastAutosaveEngineTimeMs = null;
        return true;
    }
    markClean() {
        if (this.sessionSequence === null)
            return;
        this.writeSessionMarker('clean');
    }
    requireStarted() {
        if (this.sessionSequence === null) {
            throw new Error('Recovery session has not started');
        }
        return this.sessionSequence;
    }
    writeSessionMarker(status) {
        const marker = Object.freeze({
            formatVersion: RECOVERY_FORMAT_VERSION,
            sessionSequence: this.requireStarted(),
            status
        });
        this.storage.setItem(this.sessionKey, JSON.stringify(marker));
    }
    readSequence() {
        const serialized = this.storage.getItem(this.sequenceKey);
        if (serialized === null)
            return 0;
        const parsed = Number(serialized);
        return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
    }
    readSessionMarker() {
        const serialized = this.storage.getItem(this.sessionKey);
        if (serialized === null)
            return { value: null, invalid: false };
        try {
            const parsed = JSON.parse(serialized);
            if (!isRecord(parsed))
                throw new Error('marker must be an object');
            if (parsed.formatVersion !== RECOVERY_FORMAT_VERSION) {
                throw new Error('unsupported recovery marker version');
            }
            const status = parsed.status;
            if (status !== 'open' && status !== 'clean') {
                throw new Error('invalid recovery marker status');
            }
            return {
                value: Object.freeze({
                    formatVersion: RECOVERY_FORMAT_VERSION,
                    sessionSequence: parseNonNegativeInteger(parsed.sessionSequence, 'sessionSequence'),
                    status
                }),
                invalid: false
            };
        }
        catch {
            return { value: null, invalid: true };
        }
    }
    readAutosave() {
        const serialized = this.storage.getItem(this.autosaveKey);
        if (serialized === null)
            return { value: null, invalid: false };
        try {
            const parsed = JSON.parse(serialized);
            if (!isRecord(parsed))
                throw new Error('autosave must be an object');
            if (parsed.formatVersion !== RECOVERY_FORMAT_VERSION) {
                throw new Error('unsupported recovery autosave version');
            }
            const autosave = Object.freeze({
                formatVersion: RECOVERY_FORMAT_VERSION,
                sessionSequence: parseNonNegativeInteger(parsed.sessionSequence, 'sessionSequence'),
                autosaveSequence: parseNonNegativeInteger(parsed.autosaveSequence, 'autosaveSequence'),
                engineTimeMs: parseFiniteEngineTime(parsed.engineTimeMs),
                state: this.parseState(parsed.state)
            });
            return {
                value: cloneAutosave(autosave, this.cloneState),
                invalid: false
            };
        }
        catch {
            return { value: null, invalid: true };
        }
    }
}
//# sourceMappingURL=autosave-recovery.js.map