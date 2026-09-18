import type { PcmFrame } from './types.js';
export declare class LiveAudioInput {
    private context;
    private analyser;
    private stream;
    private frameIndex;
    readonly frameSize: number;
    constructor(frameSize?: number);
    get active(): boolean;
    start(): Promise<void>;
    readFrame(): PcmFrame | null;
    stop(): Promise<void>;
}
//# sourceMappingURL=live-input.d.ts.map