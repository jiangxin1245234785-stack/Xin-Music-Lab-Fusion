export interface PcmAudioBuffer {
    readonly sampleRate: number;
    readonly channels: readonly Float32Array[];
}
export interface PcmFrame {
    readonly frameIndex: number;
    readonly sampleOffset: number;
    readonly sampleRate: number;
    readonly samples: Float32Array;
}
export declare function createPcmAudioBuffer(sampleRate: number, channels: readonly Float32Array[]): PcmAudioBuffer;
//# sourceMappingURL=types.d.ts.map