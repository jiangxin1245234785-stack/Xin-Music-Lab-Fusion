import { FixedStepEngineClock } from '../clock/index.js';
import { OfflineDeterministicPlayback } from '../audio/index.js';
import { ContinuousFeatureExtractor, EventFeatureDetector, StructuralSignalDetector, } from '../features/index.js';
import { coreFeatureSourceValues, } from '../mapping/index.js';
import { TargetMixer } from '../mixer/index.js';
import { NodeGraphRuntime, mergeNodeOutputSources } from '../nodegraph/index.js';
import { loadPreset } from '../preset/index.js';
import { createSeededPrng } from '../random/index.js';
import { createAudioFeatureFrame } from '../schema/defaults.js';
import { PhysicalSafetyLimiter } from '../render/index.js';
import { VisualClockRuntime, mergeGeneratorControlSources } from '../runtime/index.js';
export function runOfflineDeterministicSession(options) {
    const frameSize = options.frameSize ?? 2048;
    const preset = loadPreset(options.preset);
    const playback = new OfflineDeterministicPlayback(options.buffer, frameSize);
    const clock = new FixedStepEngineClock(frameSize / options.buffer.sampleRate * 1000);
    const random = createSeededPrng(preset.seed, options.sessionSeed ?? 0);
    const nodeRandom = createSeededPrng(preset.seed ^ 0x4e4f4445, options.sessionSeed ?? 0);
    const mixer = new TargetMixer();
    const nodeGraphRuntime = new NodeGraphRuntime();
    const visualClockRuntime = new VisualClockRuntime();
    const events = new EventFeatureDetector();
    const continuousFeatures = new ContinuousFeatureExtractor();
    const structure = new StructuralSignalDetector();
    const safety = new PhysicalSafetyLimiter(preset.safety);
    const result = [];
    for (let pcm = playback.nextFrame(); pcm; pcm = playback.nextFrame()) {
        const clockFrame = clock.tick();
        const extracted = continuousFeatures.extract(pcm, clockFrame);
        const eventFeatures = events.apply(createAudioFeatureFrame({
            ...extracted,
            frameIndex: clockFrame.frameIndex,
            engineTimeMs: clockFrame.nowMs
        }));
        const features = structure.apply(eventFeatures, clockFrame);
        const visualClock = visualClockRuntime.evaluateLegacy(features, clockFrame, preset.visualClock);
        const primarySources = mergeGeneratorControlSources(coreFeatureSourceValues(features), visualClock);
        const nodeFrame = nodeGraphRuntime.evaluate(preset.nodeGraph, primarySources, clockFrame, () => nodeRandom.nextFloat());
        const mixed = mixer.mixFrame({
            mappings: preset.mappings,
            envelopes: preset.envelopes,
            sourceValues: mergeNodeOutputSources(primarySources, nodeFrame),
            baseState: preset.targetDefaults,
            clock: clockFrame,
            randomFloat: () => random.nextFloat(),
            energyBudget: preset.energyBudget
        });
        result.push({
            clock: clockFrame,
            features,
            targets: safety.apply(mixed.targets, clockFrame),
            randomSample: random.nextFloat()
        });
    }
    return result;
}
//# sourceMappingURL=offline-session.js.map