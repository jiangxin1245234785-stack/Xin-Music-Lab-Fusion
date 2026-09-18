import type { AudioFeatureFrame } from '../schema/types.js';
export type DebugEventType = 'onset' | 'bassPeak' | 'sectionBoundary' | 'dropEnter' | 'climaxEnter';
export interface DebugEventEntry {
    readonly sequence: number;
    readonly type: DebugEventType;
    readonly engineTimeMs: number;
    readonly strength: number;
}
export declare class DebugEventLog {
    private readonly entries;
    private readonly previousStrength;
    private sequence;
    private readonly capacity;
    constructor(capacity?: number);
    recordFrame(input: AudioFeatureFrame): readonly DebugEventEntry[];
    list(): readonly DebugEventEntry[];
    clear(): void;
}
//# sourceMappingURL=event-log.d.ts.map