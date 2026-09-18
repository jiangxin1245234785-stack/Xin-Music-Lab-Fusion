export type UndoTransactionKind =
  | 'continuous'
  | 'discrete'
  | 'snapshot-restore';

export interface UndoableTransaction<T> {
  readonly sequence: number;
  readonly label: string;
  readonly kind: UndoTransactionKind;
  readonly engineTimeMs: number;
  readonly before: T;
  readonly after: T;
}

export interface UndoResult<T> {
  readonly state: T;
  readonly transaction: UndoableTransaction<T>;
}

interface ActiveContinuousTransaction<T> {
  readonly key: string;
  readonly label: string;
  readonly engineTimeMs: number;
  readonly before: T;
}

export interface UndoHistoryOptions<T> {
  readonly clone: (state: T) => T;
  readonly equals?: (left: T, right: T) => boolean;
  readonly limit?: number;
}

export class UndoHistory<T> {
  private readonly past: UndoableTransaction<T>[] = [];
  private readonly future: UndoableTransaction<T>[] = [];
  private active: ActiveContinuousTransaction<T> | null = null;
  private sequence = 0;
  private readonly equals: (left: T, right: T) => boolean;
  private readonly limit: number;

  constructor(private readonly options: UndoHistoryOptions<T>) {
    this.equals = options.equals ?? (
      (left, right) => JSON.stringify(left) === JSON.stringify(right)
    );
    this.limit = Math.max(1, Math.floor(options.limit ?? 100));
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  get undoLabel(): string | null {
    return this.past.at(-1)?.label ?? null;
  }

  get redoLabel(): string | null {
    return this.future.at(-1)?.label ?? null;
  }

  get activeContinuousKey(): string | null {
    return this.active?.key ?? null;
  }

  beginContinuous(
    key: string,
    label: string,
    before: T,
    engineTimeMs: number
  ): void {
    if (this.active?.key === key) return;
    if (this.active) {
      throw new Error(
        `Continuous transaction "${this.active.key}" must commit before "${key}"`
      );
    }
    this.active = {
      key,
      label,
      engineTimeMs,
      before: this.options.clone(before)
    };
  }

  commitContinuous(after: T): UndoableTransaction<T> | null {
    if (!this.active) return null;
    const active = this.active;
    this.active = null;
    return this.record(
      active.label,
      'continuous',
      active.before,
      after,
      active.engineTimeMs
    );
  }

  cancelContinuous(): void {
    this.active = null;
  }

  recordDiscrete(
    label: string,
    before: T,
    after: T,
    engineTimeMs: number,
    kind: Exclude<UndoTransactionKind, 'continuous'> = 'discrete'
  ): UndoableTransaction<T> | null {
    if (this.active) {
      throw new Error(
        `Cannot record discrete transaction while "${this.active.key}" is active`
      );
    }
    return this.record(label, kind, before, after, engineTimeMs);
  }

  undo(): UndoResult<T> | null {
    this.cancelContinuous();
    const transaction = this.past.pop();
    if (!transaction) return null;
    this.future.push(transaction);
    return {
      state: this.options.clone(transaction.before),
      transaction
    };
  }

  redo(): UndoResult<T> | null {
    this.cancelContinuous();
    const transaction = this.future.pop();
    if (!transaction) return null;
    this.past.push(transaction);
    return {
      state: this.options.clone(transaction.after),
      transaction
    };
  }

  clear(): void {
    this.past.length = 0;
    this.future.length = 0;
    this.active = null;
    this.sequence = 0;
  }

  private record(
    label: string,
    kind: UndoTransactionKind,
    before: T,
    after: T,
    engineTimeMs: number
  ): UndoableTransaction<T> | null {
    const beforeClone = this.options.clone(before);
    const afterClone = this.options.clone(after);
    if (this.equals(beforeClone, afterClone)) return null;

    const transaction: UndoableTransaction<T> = Object.freeze({
      sequence: this.sequence++,
      label,
      kind,
      engineTimeMs: Number.isFinite(engineTimeMs) ? engineTimeMs : 0,
      before: beforeClone,
      after: afterClone
    });
    this.past.push(transaction);
    if (this.past.length > this.limit) this.past.shift();
    this.future.length = 0;
    return transaction;
  }
}
