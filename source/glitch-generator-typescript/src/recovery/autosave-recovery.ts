export const RECOVERY_FORMAT_VERSION = 1 as const;
export const DEFAULT_RECOVERY_SESSION_KEY =
  'gmg.recovery.session.v1';
export const DEFAULT_RECOVERY_AUTOSAVE_KEY =
  'gmg.recovery.autosave.v1';
export const DEFAULT_RECOVERY_SEQUENCE_KEY =
  'gmg.recovery.sequence.v1';

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

interface ReadResult<T> {
  readonly value: T | null;
  readonly invalid: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value as number;
}

function parseFiniteEngineTime(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('engineTimeMs must be finite');
  }
  return Math.max(0, value);
}

function cloneAutosave<T>(
  autosave: RecoveryAutosave<T>,
  cloneState: (state: T) => T
): RecoveryAutosave<T> {
  return Object.freeze({
    ...autosave,
    state: cloneState(autosave.state)
  });
}

export class AutosaveRecoveryManager<T> {
  private readonly storage: RecoveryStorage;
  private readonly parseState: (input: unknown) => T;
  private readonly cloneState: (state: T) => T;
  private readonly autosaveIntervalMs: number;
  private readonly sessionKey: string;
  private readonly autosaveKey: string;
  private readonly sequenceKey: string;
  private sessionSequence: number | null = null;
  private autosaveSequence = 0;
  private lastAutosaveEngineTimeMs: number | null = null;
  private pendingCandidate: RecoveryAutosave<T> | null = null;

  constructor(options: AutosaveRecoveryOptions<T>) {
    this.storage = options.storage;
    this.parseState = options.parseState;
    this.cloneState = options.cloneState;
    this.autosaveIntervalMs = Math.max(
      250,
      options.autosaveIntervalMs ?? 5000
    );
    this.sessionKey =
      options.sessionKey ?? DEFAULT_RECOVERY_SESSION_KEY;
    this.autosaveKey =
      options.autosaveKey ?? DEFAULT_RECOVERY_AUTOSAVE_KEY;
    this.sequenceKey =
      options.sequenceKey ?? DEFAULT_RECOVERY_SEQUENCE_KEY;
  }

  get hasPendingRecovery(): boolean {
    return this.pendingCandidate !== null;
  }

  startSession(): RecoveryStartResult<T> {
    if (this.sessionSequence !== null) {
      throw new Error('Recovery session has already started');
    }

    const markerResult = this.readSessionMarker();
    const autosaveResult = this.readAutosave();
    const previousSequence = this.readSequence();
    const previousMarker = markerResult.value;
    const previousAutosave = autosaveResult.value;

    if (
      previousMarker?.status === 'open' &&
      previousAutosave?.sessionSequence === previousMarker.sessionSequence
    ) {
      this.pendingCandidate = cloneAutosave(
        previousAutosave,
        this.cloneState
      );
    }

    const highestSequence = Math.max(
      previousSequence,
      previousMarker?.sessionSequence ?? 0,
      previousAutosave?.sessionSequence ?? 0
    );
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

  forceAutosave(
    state: T,
    engineTimeMs: number
  ): RecoveryAutosave<T> | null {
    const sessionSequence = this.requireStarted();
    if (this.pendingCandidate) return null;
    const autosave: RecoveryAutosave<T> = Object.freeze({
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

  maybeAutosave(
    state: T,
    engineTimeMs: number
  ): RecoveryAutosave<T> | null {
    if (!this.shouldAutosave(engineTimeMs)) return null;
    return this.forceAutosave(state, engineTimeMs);
  }

  shouldAutosave(engineTimeMs: number): boolean {
    this.requireStarted();
    if (this.pendingCandidate) return false;
    const currentTime = parseFiniteEngineTime(engineTimeMs);
    if (this.lastAutosaveEngineTimeMs === null) return true;
    if (currentTime < this.lastAutosaveEngineTimeMs) {
      this.lastAutosaveEngineTimeMs = currentTime;
      return false;
    }
    return (
      currentTime - this.lastAutosaveEngineTimeMs <
      this.autosaveIntervalMs
    )
      ? false
      : true;
  }

  recoverCandidate(): T | null {
    this.requireStarted();
    const candidate = this.pendingCandidate;
    if (!candidate) return null;
    this.pendingCandidate = null;
    this.storage.removeItem(this.autosaveKey);
    this.lastAutosaveEngineTimeMs = null;
    return this.cloneState(candidate.state);
  }

  discardCandidate(): boolean {
    this.requireStarted();
    if (!this.pendingCandidate) return false;
    this.pendingCandidate = null;
    this.storage.removeItem(this.autosaveKey);
    this.lastAutosaveEngineTimeMs = null;
    return true;
  }

  markClean(): void {
    if (this.sessionSequence === null) return;
    this.writeSessionMarker('clean');
  }

  private requireStarted(): number {
    if (this.sessionSequence === null) {
      throw new Error('Recovery session has not started');
    }
    return this.sessionSequence;
  }

  private writeSessionMarker(status: 'open' | 'clean'): void {
    const marker: RecoverySessionMarker = Object.freeze({
      formatVersion: RECOVERY_FORMAT_VERSION,
      sessionSequence: this.requireStarted(),
      status
    });
    this.storage.setItem(this.sessionKey, JSON.stringify(marker));
  }

  private readSequence(): number {
    const serialized = this.storage.getItem(this.sequenceKey);
    if (serialized === null) return 0;
    const parsed = Number(serialized);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
  }

  private readSessionMarker(): ReadResult<RecoverySessionMarker> {
    const serialized = this.storage.getItem(this.sessionKey);
    if (serialized === null) return { value: null, invalid: false };
    try {
      const parsed: unknown = JSON.parse(serialized);
      if (!isRecord(parsed)) throw new Error('marker must be an object');
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
          sessionSequence: parseNonNegativeInteger(
            parsed.sessionSequence,
            'sessionSequence'
          ),
          status
        }),
        invalid: false
      };
    } catch {
      return { value: null, invalid: true };
    }
  }

  private readAutosave(): ReadResult<RecoveryAutosave<T>> {
    const serialized = this.storage.getItem(this.autosaveKey);
    if (serialized === null) return { value: null, invalid: false };
    try {
      const parsed: unknown = JSON.parse(serialized);
      if (!isRecord(parsed)) throw new Error('autosave must be an object');
      if (parsed.formatVersion !== RECOVERY_FORMAT_VERSION) {
        throw new Error('unsupported recovery autosave version');
      }
      const autosave: RecoveryAutosave<T> = Object.freeze({
        formatVersion: RECOVERY_FORMAT_VERSION,
        sessionSequence: parseNonNegativeInteger(
          parsed.sessionSequence,
          'sessionSequence'
        ),
        autosaveSequence: parseNonNegativeInteger(
          parsed.autosaveSequence,
          'autosaveSequence'
        ),
        engineTimeMs: parseFiniteEngineTime(parsed.engineTimeMs),
        state: this.parseState(parsed.state)
      });
      return {
        value: cloneAutosave(autosave, this.cloneState),
        invalid: false
      };
    } catch {
      return { value: null, invalid: true };
    }
  }
}
