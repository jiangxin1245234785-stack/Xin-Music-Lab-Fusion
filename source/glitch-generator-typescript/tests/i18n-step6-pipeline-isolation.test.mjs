import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONTINUOUS_MUSIC_FEATURE_IDS,
  ContinuousFeatureExtractor,
  FixedStepEngineClock,
  NodeGraphRuntime,
  OfflineDeterministicPlayback,
  PhysicalSafetyLimiter,
  TargetMixer,
  VISUAL_TARGET_REGISTRY,
  adaptUnifiedMusicFrameToSources,
  buildUnifiedMusicFrame,
  createSeededPrng,
  createSineBuffer,
  getProductBuiltInPreset,
  loadPreset,
  mergeNodeOutputSources
} from '../dist/index.js';
import {
  createLocaleController,
  translateSurfaceText
} from '../dist/ui/i18n/index.js';
import {
  createMappingIntentViewModel,
  createMappingRuntimeViewModel
} from '../dist/ui/presenters/index.js';

const FRAME_COUNT = 188;
const FRAME_SIZE = 2048;
const SESSION_SEED = 0x5336494f;

function continuousValues(feature) {
  return Object.fromEntries(CONTINUOUS_MUSIC_FEATURE_IDS.map(id => [
    id,
    id === 'chordConfidence' ? 0 : Number(feature[id] ?? 0)
  ]));
}

function continuousMeta() {
  return Object.fromEntries(CONTINUOUS_MUSIC_FEATURE_IDS.map(id => [id, {
    sourceProvider: 'realtime.core',
    providerDetail: {
      engineId: 'step6-offline-deterministic',
      providerVersion: '1'
    },
    confidence: 1,
    available: true,
    ageMs: 0,
    fallbackReason: null
  }]));
}

function runPipeline(onFrame) {
  const buffer = createSineBuffer({
    frequencyHz: 997,
    amplitude: 0.63,
    durationSeconds: 9.5
  });
  const playback = new OfflineDeterministicPlayback(buffer, FRAME_SIZE);
  const extractor = new ContinuousFeatureExtractor();
  const preset = loadPreset(getProductBuiltInPreset('balanced'));
  const presetBefore = JSON.stringify(preset);
  const frameDurationMs = FRAME_SIZE / buffer.sampleRate * 1000;
  const clock = new FixedStepEngineClock(frameDurationMs);
  const mappingRandom = createSeededPrng(preset.seed, SESSION_SEED);
  const nodeRandom = createSeededPrng(
    preset.seed ^ 0x4e4f4445,
    SESSION_SEED
  );
  const probeRandom = createSeededPrng(
    preset.seed ^ 0x50524f42,
    SESSION_SEED
  );
  const mixer = new TargetMixer();
  const nodeGraph = new NodeGraphRuntime();
  const safety = new PhysicalSafetyLimiter(preset.safety);
  const durationMs = buffer.channels[0].length / buffer.sampleRate * 1000;
  const output = [];

  for (let frameIndex = 0; frameIndex < FRAME_COUNT; frameIndex += 1) {
    const pcm = playback.nextFrame();
    assert.ok(pcm, `offline fixture ended before frame ${frameIndex}`);
    const clockFrame = clock.tick();
    const feature = extractor.extract(pcm, clockFrame);
    const unified = buildUnifiedMusicFrame({
      clock: clockFrame,
      transport: {
        mode: 'offline-test',
        state: 'playing',
        trackId: 'i18n-step6-fixed-sine',
        mediaTimeMs: clockFrame.nowMs,
        durationMs,
        epoch: 0
      },
      continuous: continuousValues(feature),
      meta: continuousMeta()
    });
    const sourceFrame = adaptUnifiedMusicFrameToSources(unified);
    const nodeFrame = nodeGraph.evaluate(
      preset.nodeGraph,
      sourceFrame.values,
      clockFrame,
      () => nodeRandom.nextFloat()
    );
    const sourceValues = mergeNodeOutputSources(
      sourceFrame.values,
      nodeFrame
    );
    const mixed = mixer.mixFrame({
      mappings: preset.mappings,
      envelopes: preset.envelopes,
      sourceValues,
      baseState: preset.targetDefaults,
      clock: clockFrame,
      randomFloat: () => mappingRandom.nextFloat(),
      energyBudget: preset.energyBudget,
      targetDefinitions: VISUAL_TARGET_REGISTRY
    });
    const finalTargets = safety.apply(
      mixed.targets,
      clockFrame,
      VISUAL_TARGET_REGISTRY
    );
    const unifiedBeforeUi = structuredClone(unified);
    const sourceBeforeUi = structuredClone(sourceFrame);
    const mixerBeforeUi = structuredClone(mixed);
    const safetyBeforeUi = structuredClone({
      targets: finalTargets,
      status: safety.getLastReport()
    });

    onFrame?.({
      frameIndex,
      preset,
      unified,
      sourceFrame,
      sourceValues,
      mixed,
      finalTargets,
      clockFrame
    });

    assert.deepEqual(unified, unifiedBeforeUi);
    assert.deepEqual(sourceFrame, sourceBeforeUi);
    assert.deepEqual(mixed, mixerBeforeUi);
    assert.deepEqual({
      targets: finalTargets,
      status: safety.getLastReport()
    }, safetyBeforeUi);

    output.push({
      clock: clockFrame,
      unified,
      sourceFrame,
      nodeOutputs: nodeFrame.outputs,
      mapping: {
        contributions: mixed.contributions,
        gateDecisions: mixed.gateDecisions,
        energyBudget: mixed.energyBudgetDecision,
        eventBudget: mixed.eventBudgetReport
      },
      mixer: {
        targets: mixed.targets,
        trace: mixed.trace
      },
      physicalSafety: {
        targets: finalTargets,
        status: safety.getLastReport()
      },
      seededProbe: probeRandom.nextFloat()
    });
  }

  assert.equal(JSON.stringify(preset), presetBefore);
  return output;
}

test('Step 6 locale-interleaved presentation leaves every deterministic pipeline stage byte-identical', () => {
  const control = runPipeline();
  const locale = createLocaleController();
  const localized = runPipeline(context => {
    if (context.frameIndex === 40) locale.setLocalLocale('en-US');
    if (context.frameIndex === 80) locale.setHostLocale('zh-CN');
    if (context.frameIndex === 120) locale.clearHostLocale();
    if (context.frameIndex === 160) locale.setLocalLocale('zh-CN');

    translateSurfaceText(locale.getLocale(), 'Mapping contributions');
    const mapping = context.preset.mappings[
      context.frameIndex % context.preset.mappings.length
    ];
    const envelope = context.preset.envelopes.find(
      item => item.id === mapping.envelopeId
    );
    const sourceMeta = context.sourceFrame.meta[mapping.sourceId] ?? null;
    createMappingIntentViewModel({
      mapping,
      ...(envelope ? { envelope } : {}),
      translator: locale,
      locale: locale.getLocale(),
      targetDefinitions: VISUAL_TARGET_REGISTRY
    });
    createMappingRuntimeViewModel({
      mapping,
      mixerFrame: context.mixed,
      finalState: context.finalTargets,
      sourceValues: context.sourceValues,
      sourceMeta,
      translator: locale,
      locale: locale.getLocale(),
      targetDefinitions: VISUAL_TARGET_REGISTRY,
      frameIndex: context.clockFrame.frameIndex,
      engineTimeMs: context.clockFrame.nowMs
    });
  });

  assert.equal(control.length, FRAME_COUNT);
  assert.equal(localized.length, FRAME_COUNT);
  assert.deepEqual(localized, control);
  assert.ok(control.some(frame =>
    frame.sourceFrame.values['audio.loudness'] > 0
  ));
  assert.ok(control.some(frame => frame.mapping.contributions.length > 0));
  assert.equal(control.at(-1).clock.frameIndex, FRAME_COUNT - 1);
  assert.equal(locale.getLocale(), 'zh-CN');
});
