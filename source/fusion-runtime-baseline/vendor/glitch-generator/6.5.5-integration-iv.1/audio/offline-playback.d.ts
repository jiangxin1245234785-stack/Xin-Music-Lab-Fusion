import type { PcmAudioBuffer, PcmFrame } from './types.js';
export declare class OfflineDeterministicPlayback {
    private readonly buffer;
    readonly frameSize: number;
    private sampleOffset;
    private frameIndex;
    constructor(buffer: PcmAudioBuffer, frameSize: number);
    get ended(): boolean;
    reset(): void;
    nextFrame(): PcmFrame | null;
}
//# sourceMappingURL=offline-playback.d.ts.map