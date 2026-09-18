import type { PcmFrame } from '../audio/types.js';
import type { ResolvedAudioFeatureFrame } from '../schema/types.js';
export interface CoreFeatureObservation {
    readonly frame: ResolvedAudioFeatureFrame;
    readonly spectrum: Float64Array;
    readonly peakAmplitude: number;
}
export declare function extractCoreFeatureObservation(frame: PcmFrame): CoreFeatureObservation;
export declare function extractCoreFeatures(frame: PcmFrame): ResolvedAudioFeatureFrame;
//# sourceMappingURL=core-feature-extractor.d.ts.map