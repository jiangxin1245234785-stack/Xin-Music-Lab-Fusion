export declare const RECOVERY_FORMAT_VERSION: 1;
export declare const DEFAULT_RECOVERY_SESSION_KEY = "gmg.recovery.session.v1";
export declare const DEFAULT_RECOVERY_AUTOSAVE_KEY = "gmg.recovery.autosave.v1";
export declare const DEFAULT_RECOVERY_SEQUENCE_KEY = "gmg.recovery.sequence.v1";
export interface RecoveryStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}
export interface RecoverySessionMarker {
    readonly formatVersion: typeof RECOVERY_FORMAT_VERSION;
    readonly sessionSequence: number;
    readonly status: 'open' | 'clean';
}
export interface RecoveryAutosave<T> {
    readonly formatVersion: typeof RECOVERY_FORMAT_VERSION;
    readonly sessionSequence: number;
    readonly autosaveSequence: number;
    readonly engineTimeMs: number;
    readonly state: T;
}
export interface RecoveryStartResult<T> {
    readonly sessionSequence: number;
    readonly candidate: RecoveryAutosave<T> | null;
    readonly warning: string | null;
}
export interface AutosaveRecoveryOptions<T> {
    readonly storage: RecoveryStorage;
    readonly parseState: (input: unknown) => T;
    readonly cloneState: (state: T) => T;
    readonly autosaveIntervalMs?: number;
    readonly sessionKey?: string;
    readonly autosaveKey?: string;
    readonly sequenceKey?: string;
}
export declare class AutosaveRecoveryManager<T> {
    private readonly storage;
    private readonly parseState;
    private readonly cloneState;
    private readonly autosaveIntervalMs;
    private readonly sessionKey;
    private readonly autosaveKey;
    private readonly sequenceKey;
    private sessionSequence;
    private autosaveSequence;
    private lastAutosaveEngineTimeMs;
    private pendingCandidate;
    constructor(options: AutosaveRecoveryOptions<T>);
    get hasPendingRecovery(): boolean;
    startSession(): RecoveryStartResult<T>;
    forceAutosave(state: T, engineTimeMs: number): RecoveryAutosave<T> | null;
    maybeAutosave(state: T, engineTimeMs: number): RecoveryAutosave<T> | null;
    shouldAutosave(engineTimeMs: number): boolean;
    recoverCandidate(): T | null;
    discardCandidate(): boolean;
    markClean(): void;
    private requireStarted;
    private writeSessionMarker;
    private readSequence;
    private readSessionMarker;
    private readAutosave;
}
//# sourceMappingURL=autosave-recovery.d.ts.map