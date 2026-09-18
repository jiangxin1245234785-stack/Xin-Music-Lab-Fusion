import type { EngineClockFrame } from '../clock/engine-clock.js';
import type { NodeGraphFrame } from './node-graph.js';
export interface NodeProbeSample {
    readonly engineTimeMs: number;
    readonly value: number;
}
export interface NodeProbeSnapshot {
    readonly sourceId: string;
    readonly value: number;
    readonly samples: readonly NodeProbeSample[];
}
export declare class NodeProbeBank {
    readonly capacity: number;
    private readonly histories;
    constructor(capacity?: number);
    reset(): void;
    record(clock: EngineClockFrame, frame: NodeGraphFrame): readonly NodeProbeSnapshot[];
    snapshot(sourceId: string): NodeProbeSnapshot;
    snapshots(): readonly NodeProbeSnapshot[];
}
export declare function projectNodeProbeWaveform(samples: readonly NodeProbeSample[], width?: number, height?: number): string;
//# sourceMappingURL=node-probe.d.ts.map