import type { PcmAudioBuffer } from '../audio/types.js';
import type { ResolvedAudioFeatureFrame } from '../schema/types.js';
import { type StructuralSignalSettings } from './structural-signal-detector.js';
export declare function analyzeOfflineBuffer(buffer: PcmAudioBuffer, frameSize?: number, structuralSettings?: StructuralSignalSettings): readonly ResolvedAudioFeatureFrame[];
//# sourceMappingURL=offline-analysis.d.ts.map