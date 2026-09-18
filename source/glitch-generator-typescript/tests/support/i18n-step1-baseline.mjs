import { createHash } from 'node:crypto';

import {
  CONTINUOUS_MUSIC_FEATURE_IDS,
  CURRENT_ENGINE_VERSION,
  CURRENT_SCHEMA_VERSION,
  EVENT_MUSIC_FEATURE_IDS,
  LABEL_MUSIC_FEATURE_IDS,
  NodeGraphRuntime,
  PhysicalSafetyLimiter,
  RUNTIME_SOURCE_IDS,
  STATE_MUSIC_FEATURE_IDS,
  TARGET_MIXER_STEPS,
  TargetMixer,
  UNIFIED_MUSIC_FEATURE_IDS,
  VISUAL_TARGET_REGISTRY,
  adaptUnifiedMusicFrameToSources,
  analyzeOfflineBuffer,
  buildUnifiedMusicFrame,
  createSeededPrng,
  createStructuralSignalValidationBuffer,
  getProductBuiltInPreset,
  loadPreset,
  mergeNodeOutputSources
} from '../../dist/index.js';

const FORMAT = 'xin.glitch-generator.i18n-step1-baseline/1';
const FRAME_SIZE = 2048;
const SESSION_SEED = 0x4931384e;
const PRESET_ID = 'balanced';

const CONTINUOUS_CORE_IDS = new Set([
  'loudness',
  'bass',
  'mid',
  'treble',
  'dynamicRange',
  'spectralDensity',
  'flux',
  'flatness',
  'sharpness'
]);

const STRUCTURE_AVAILABILITY = Object.freeze({
  inBuild: 'buildAvailable',
  inDrop: 'dropAvailable',
  inClimax: 'climaxAvailable',
  sectionBoundary: 'sectionBoundaryAvailable',
  dropEnter: 'dropAvailable',
  climaxEnter: 'climaxAvailable'
});

function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function round(value) {
  return Number.isFinite(value) ? Number(value.toFixed(12)) : value;
}

function canonicalize(value) {
  if (typeof value === 'number') return round(value);
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort((left, right) => left.localeCompare(right))
        .map(key => [key, canonicalize(value[key])])
    );
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function eventValue(id, feature) {
  if (id === 'chordChange') return 0;
  return clamp01(Number(feature[id] ?? 0));
}

function availabilityFor(id, feature) {
  if (id === 'chordConfidence' || id === 'chordChange') return false;
  if (id === 'sectionId' || id === 'sectionLabel' || id === 'chord') {
    return false;
  }
  if (id === 'silence') return Boolean(feature.available);
  const availabilityKey = STRUCTURE_AVAILABILITY[id];
  if (availabilityKey) return Boolean(feature[availabilityKey]);
  return Boolean(feature.available);
}

function providerFor(id) {
  if (LABEL_MUSIC_FEATURE_IDS.includes(id) || id === 'chordConfidence') {
    return 'neutral';
  }
  if (
    CONTINUOUS_CORE_IDS.has(id) ||
    id === 'onset' ||
    id === 'bassPeak'
  ) return 'realtime.core';
  return 'realtime.heuristic';
}

function metaFor(id, feature) {
  const available = availabilityFor(id, feature);
  return {
    sourceProvider: providerFor(id),
    providerDetail: {
      engineId: 'step1-fixed-buffer-adapter',
      providerVersion: '1'
    },
    confidence: available ? 1 : null,
    available,
    ageMs: 0,
    fallbackReason: available ? null : 'NO_SOURCE'
  };
}

function unifiedFrameFromFeature(feature, index, durationMs, deltaMs) {
  const clock = {
    frameIndex: index,
    nowMs: round(feature.engineTimeMs),
    deltaMs: index === 0 ? 0 : round(deltaMs)
  };
  const continuous = Object.fromEntries(
    CONTINUOUS_MUSIC_FEATURE_IDS.map(id => [
      id,
      id === 'chordConfidence' ? 0 : clamp01(Number(feature[id] ?? 0))
    ])
  );
  const states = {
    silence: feature.loudness <= 0.0001 ? 1 : 0,
    inBuild: clamp01(feature.inBuild),
    inDrop: clamp01(feature.inDrop),
    inClimax: clamp01(feature.inClimax)
  };
  const events = Object.fromEntries(EVENT_MUSIC_FEATURE_IDS.map(id => {
    const strength = eventValue(id, feature);
    return [id, strength > 0 ? {
      eventId: `step1:${id}:${index}`,
      strength,
      engineTimeMs: clock.nowMs,
      mediaTimeMs: clock.nowMs,
      epoch: 0
    } : null];
  }));
  const labels = Object.fromEntries(
    LABEL_MUSIC_FEATURE_IDS.map(id => [id, null])
  );
  const meta = Object.fromEntries(
    UNIFIED_MUSIC_FEATURE_IDS.map(id => [id, metaFor(id, feature)])
  );
  return buildUnifiedMusicFrame({
    clock,
    transport: {
      mode: 'offline-test',
      state: 'playing',
      trackId: 'step1-structural-validation-buffer',
      mediaTimeMs: clock.nowMs,
      durationMs,
      epoch: 0
    },
    continuous,
    states,
    events,
    labels,
    meta
  });
}

function checkpointIndexes(length) {
  return [...new Set([0, 0.125, 0.25, 0.5, 0.625, 0.75, 0.875, 1]
    .map(value => Math.min(length - 1, Math.round((length - 1) * value))))];
}

function eventStrengths(events) {
  return Object.fromEntries(
    Object.entries(events).map(([id, event]) => [id, event?.strength ?? 0])
  );
}

export function buildI18nStep1DeterministicBaseline() {
  const buffer = createStructuralSignalValidationBuffer();
  const durationMs = buffer.channels[0].length / buffer.sampleRate * 1000;
  const deltaMs = FRAME_SIZE / buffer.sampleRate * 1000;
  const featureFrames = analyzeOfflineBuffer(buffer, FRAME_SIZE);
  const preset = loadPreset(getProductBuiltInPreset(PRESET_ID));
  const mixer = new TargetMixer();
  const safety = new PhysicalSafetyLimiter(preset.safety);
  const nodeGraph = new NodeGraphRuntime();
  const random = createSeededPrng(preset.seed, SESSION_SEED);
  const nodeRandom = createSeededPrng(
    preset.seed ^ 0x4e4f4445,
    SESSION_SEED
  );
  const resolvedFrames = [];
  const sourceFrames = [];
  const contributions = [];
  const mixerOutputs = [];
  const safetyOutputs = [];

  for (let index = 0; index < featureFrames.length; index += 1) {
    const unified = unifiedFrameFromFeature(
      featureFrames[index],
      index,
      durationMs,
      deltaMs
    );
    const sources = adaptUnifiedMusicFrameToSources(unified);
    const nodeFrame = nodeGraph.evaluate(
      preset.nodeGraph,
      sources.values,
      unified.clock,
      () => nodeRandom.nextFloat()
    );
    const mixed = mixer.mixFrame({
      mappings: preset.mappings,
      envelopes: preset.envelopes,
      sourceValues: mergeNodeOutputSources(sources.values, nodeFrame),
      baseState: preset.targetDefaults,
      clock: unified.clock,
      randomFloat: () => random.nextFloat(),
      energyBudget: preset.energyBudget,
      targetDefinitions: VISUAL_TARGET_REGISTRY
    });
    const finalTargets = safety.apply(
      mixed.targets,
      unified.clock,
      VISUAL_TARGET_REGISTRY
    );
    resolvedFrames.push(unified);
    sourceFrames.push(sources);
    contributions.push({
      values: mixed.contributions,
      gates: mixed.gateDecisions,
      energyBudget: mixed.energyBudgetDecision,
      eventBudget: mixed.eventBudgetReport
    });
    mixerOutputs.push({ targets: mixed.targets, trace: mixed.trace });
    safetyOutputs.push({
      targets: finalTargets,
      status: safety.getLastReport()
    });
  }

  const checkpoints = checkpointIndexes(resolvedFrames.length).map(index => ({
    index,
    clock: resolvedFrames[index].clock,
    unified: {
      continuous: resolvedFrames[index].continuous,
      states: resolvedFrames[index].states,
      events: eventStrengths(resolvedFrames[index].events)
    },
    sources: sourceFrames[index].values,
    contributions: contributions[index],
    mixer: mixerOutputs[index],
    safety: safetyOutputs[index]
  }));

  return canonicalize({
    format: FORMAT,
    package: {
      engineVersion: CURRENT_ENGINE_VERSION,
      schemaVersion: CURRENT_SCHEMA_VERSION
    },
    fixture: {
      buffer: 'createStructuralSignalValidationBuffer()',
      sampleRate: buffer.sampleRate,
      durationMs,
      frameSize: FRAME_SIZE,
      frameCount: resolvedFrames.length,
      presetId: PRESET_ID,
      presetSeed: preset.seed,
      sessionSeed: SESSION_SEED,
      clock: 'fixed-step-offline'
    },
    registry: {
      unifiedFeatureIds: [...UNIFIED_MUSIC_FEATURE_IDS],
      runtimeSourceIds: [...RUNTIME_SOURCE_IDS],
      formalTargetIds: VISUAL_TARGET_REGISTRY.map(target => target.id),
      mixerPipeline: [...TARGET_MIXER_STEPS]
    },
    hashes: {
      preset: sha256(preset),
      extractedAudioFeatures: sha256(featureFrames),
      unifiedMusicFrames: sha256(resolvedFrames),
      runtimeSourceFrames: sha256(sourceFrames),
      mappingContributions: sha256(contributions),
      targetMixerOutputs: sha256(mixerOutputs),
      physicalSafetyOutputs: sha256(safetyOutputs)
    },
    checkpoints
  });
}

export function serializeI18nStep1Baseline(baseline) {
  return `${JSON.stringify(baseline, null, 2)}\n`;
}
