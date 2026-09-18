import { type PcmAudioBuffer } from '../audio/types.js';
export interface SineBufferOptions {
    readonly frequencyHz: number;
    readonly amplitude?: number;
    readonly durationSeconds?: number;
    readonly sampleRate?: number;
}
export declare function createSineBuffer(options: SineBufferOptions): PcmAudioBuffer;
export declare function createValidationBuffer(sampleRate?: number, segmentSeconds?: number): PcmAudioBuffer;
export declare function createContinuousFeatureValidationBuffer(sampleRate?: number, segmentSeconds?: number): PcmAudioBuffer;
export declare function createStructuralSignalValidationBuffer(sampleRate?: number): PcmAudioBuffer;
//# sourceMappingURL=validation-buffer.d.ts.map