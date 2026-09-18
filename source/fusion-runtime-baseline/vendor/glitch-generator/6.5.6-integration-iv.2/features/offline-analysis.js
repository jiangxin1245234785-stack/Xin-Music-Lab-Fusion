import { OfflineDeterministicPlayback } from '../audio/offline-playback.js';
import { FixedStepEngineClock } from '../clock/engine-clock.js';
import { ContinuousFeatureExtractor } from './continuous-feature-extractor.js';
import { EventFeatureDetector } from './event-feature-detector.js';
import { StructuralSignalDetector } from './structural-signal-detector.js';
export function analyzeOfflineBuffer(buffer, frameSize = 2048, structuralSettings = {}) {
    const playback = new OfflineDeterministicPlayback(buffer, frameSize);
    const clock = new FixedStepEngineClock(frameSize / buffer.sampleRate * 1000);
    const extractor = new ContinuousFeatureExtractor();
    const events = new EventFeatureDetector();
    const structure = new StructuralSignalDetector(structuralSettings);
    const frames = [];
    for (let frame = playback.nextFrame(); frame; frame = playback.nextFrame()) {
        const clockFrame = clock.tick();
        const continuous = extractor.extract(frame, clockFrame);
        frames.push(structure.apply(events.apply(continuous), clockFrame));
    }
    return frames;
}
//# sourceMappingURL=offline-analysis.js.map