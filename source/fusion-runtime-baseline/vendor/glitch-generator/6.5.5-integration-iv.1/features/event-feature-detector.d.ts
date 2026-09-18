import type { AudioFeatureFrame, ResolvedAudioFeatureFrame } from '../schema/types.js';
export declare class EventFeatureDetector {
    private previousLoudness;
    private previousBass;
    reset(): void;
    apply(input: AudioFeatureFrame): ResolvedAudioFeatureFrame;
}
//# sourceMappingURL=event-feature-detector.d.ts.map