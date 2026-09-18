export type UndoTransactionKind = 'continuous' | 'discrete' | 'snapshot-restore';
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
export interface UndoHistoryOptions<T> {
    readonly clone: (state: T) => T;
    readonly equals?: (left: T, right: T) => boolean;
    readonly limit?: number;
}
export declare class UndoHistory<T> {
    private readonly options;
    private readonly past;
    private readonly future;
    private active;
    private sequence;
    private readonly equals;
    private readonly limit;
    constructor(options: UndoHistoryOptions<T>);
    get canUndo(): boolean;
    get canRedo(): boolean;
    get undoLabel(): string | null;
    get redoLabel(): string | null;
    get activeContinuousKey(): string | null;
    beginContinuous(key: string, label: string, before: T, engineTimeMs: number): void;
    commitContinuous(after: T): UndoableTransaction<T> | null;
    cancelContinuous(): void;
    recordDiscrete(label: string, before: T, after: T, engineTimeMs: number, kind?: Exclude<UndoTransactionKind, 'continuous'>): UndoableTransaction<T> | null;
    undo(): UndoResult<T> | null;
    redo(): UndoResult<T> | null;
    clear(): void;
    private record;
}
//# sourceMappingURL=undo-history.d.ts.map