import type { ResolvedPreset, ResolvedSnapshot } from '../schema/types.js';
import { type SnapshotCaptureInput } from './persistence.js';
export interface PromoteSnapshotOptions {
    readonly id?: string;
    readonly name?: string;
    readonly description?: string;
}
export declare class SnapshotStack {
    private readonly snapshots;
    private sequence;
    get size(): number;
    list(): readonly ResolvedSnapshot[];
    latest(): ResolvedSnapshot | null;
    capture(input: SnapshotCaptureInput): ResolvedSnapshot;
    get(id: string): ResolvedSnapshot | null;
    restore(id: string): ResolvedSnapshot;
    delete(id: string): boolean;
    replaceAll(snapshots: readonly ResolvedSnapshot[]): void;
    promoteToPreset(id: string, options?: PromoteSnapshotOptions): ResolvedPreset;
    clear(): void;
}
//# sourceMappingURL=snapshot-stack.d.ts.map