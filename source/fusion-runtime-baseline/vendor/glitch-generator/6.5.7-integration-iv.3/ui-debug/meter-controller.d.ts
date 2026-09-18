import type { ResolvedAudioFeatureFrame } from '../schema/types.js';
declare const FEATURE_KEYS: readonly ["loudness", "bass", "mid", "treble", "dynamicRange", "spectralDensity", "buildEnergy", "sectionDrive", "rhythmPhase", "flux", "flatness", "sharpness"];
type MeterKey = typeof FEATURE_KEYS[number];
export declare class FeatureMeterController {
    private readonly featureKeys;
    private readonly fills;
    private readonly values;
    constructor(root?: ParentNode, featureKeys?: readonly MeterKey[]);
    render(frame: ResolvedAudioFeatureFrame): void;
    private requireElement;
}
export {};
//# sourceMappingURL=meter-controller.d.ts.map