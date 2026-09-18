import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CURRENT_ENGINE_VERSION,
  CURRENT_PRESET_VERSION,
  CURRENT_SCHEMA_VERSION,
  createAudioFeatureFrame,
  createEnergyBudgetConfig,
  createEventEnvelope,
  createMappingCard,
  createNodeGraph,
  createNodeGraphEdge,
  createNodeGraphNode,
  createPreset,
  createSafetyConfig,
  createSnapshot,
  createVisualTargetState,
  loadPreset
} from '../dist/index.js';

test('a partial preset resolves every missing field to a default', () => {
  const partial = {
    name: 'Step 0.1 partial',
    mappings: [{ sourceId: 'audio.loudness' }],
    metadata: { author: 'Xin' }
  };

  const resolved = createPreset(partial);

  assert.equal(resolved.name, 'Step 0.1 partial');
  assert.equal(resolved.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(resolved.engineVersion, CURRENT_ENGINE_VERSION);
  assert.equal(resolved.presetVersion, CURRENT_PRESET_VERSION);
  assert.equal(resolved.seed, 1);
  assert.equal(resolved.id, '');
  assert.equal(resolved.description, '');
  assert.equal(resolved.mappings.length, 1);
  assert.deepEqual(resolved.mappings[0], {
    id: '',
    sourceId: 'audio.loudness',
    targetId: '',
    enabled: true,
    amount: 1,
    range: [0, 1],
    curve: 1,
    attackMs: 80,
    fallMs: 240,
    threshold: 0,
    priority: 0,
    kind: 'continuous',
    envelopeId: '',
    gateSourceId: '',
    gateThreshold: 0.5,
    polarity: 'normal',
    replaceMode: 'replace',
    safetyClamp: true,
    probability: 1,
    ab: {
      active: 'A',
      a: {
        amount: 1,
        range: [0, 1],
        curve: 1,
        attackMs: 80,
        fallMs: 240,
        threshold: 0,
        priority: 0
      },
      b: {
        amount: 1,
        range: [0, 1],
        curve: 1,
        attackMs: 80,
        fallMs: 240,
        threshold: 0,
        priority: 0
      }
    },
    modulations: []
  });
  assert.deepEqual(resolved.envelopes, []);
  assert.deepEqual(resolved.energyBudget, {
    enabled: false,
    budget: 1,
    weights: {},
    eventVoiceLimit: 4,
    globalEventPolicy: 'drop-low-priority',
    experimentalQueueEnabled: false
  });
  assert.deepEqual(resolved.safety, {
    whiteoutProtection: true,
    blackoutProtection: true,
    feedbackRunawayProtection: true
  });
  assert.deepEqual(resolved.nodeGraph, {
    nodes: [],
    edges: []
  });
  assert.deepEqual(resolved.shaderPipeline, {
    passOrder: ['builtin-feedback', 'custom-glsl'],
    customPass: {
      enabled: true,
      label: 'Custom GLSL pass',
      source: ''
    },
    uniformRegistry: []
  });
  assert.deepEqual(resolved.targetDefaults, {
    id: '',
    enabled: true,
    values: {}
  });
  assert.deepEqual(resolved.metadata, { author: 'Xin' });
  assert.deepEqual(partial, {
    name: 'Step 0.1 partial',
    mappings: [{ sourceId: 'audio.loudness' }],
    metadata: { author: 'Xin' }
  });
});

test('default factories return isolated nested collections', () => {
  const first = createPreset();
  const second = createPreset();

  assert.notStrictEqual(first.mappings, second.mappings);
  assert.notStrictEqual(first.envelopes, second.envelopes);
  assert.notStrictEqual(first.energyBudget, second.energyBudget);
  assert.notStrictEqual(first.energyBudget.weights, second.energyBudget.weights);
  assert.notStrictEqual(first.safety, second.safety);
  assert.notStrictEqual(first.nodeGraph, second.nodeGraph);
  assert.notStrictEqual(first.nodeGraph.nodes, second.nodeGraph.nodes);
  assert.notStrictEqual(first.nodeGraph.edges, second.nodeGraph.edges);
  assert.notStrictEqual(first.shaderPipeline, second.shaderPipeline);
  assert.notStrictEqual(
    first.shaderPipeline.passOrder,
    second.shaderPipeline.passOrder
  );
  assert.notStrictEqual(
    first.shaderPipeline.uniformRegistry,
    second.shaderPipeline.uniformRegistry
  );
  assert.notStrictEqual(first.metadata, second.metadata);
  assert.notStrictEqual(first.targetDefaults, second.targetDefaults);
  assert.notStrictEqual(first.targetDefaults.values, second.targetDefaults.values);
  assert.notStrictEqual(createMappingCard().range, createMappingCard().range);
  assert.notStrictEqual(createMappingCard().ab, createMappingCard().ab);
  assert.notStrictEqual(createMappingCard().ab.a, createMappingCard().ab.a);
  assert.notStrictEqual(createMappingCard().ab.a.range, createMappingCard().ab.a.range);
});

test('all schema factories accept empty or partial input', () => {
  assert.deepEqual(createAudioFeatureFrame({ loudness: 0.5 }), {
    frameIndex: 0,
    engineTimeMs: 0,
    available: false,
    loudness: 0.5,
    bass: 0,
    mid: 0,
    treble: 0,
    dynamicRange: 0,
    spectralDensity: 0,
    buildEnergy: 0,
    sectionDrive: 0,
    rhythmPhase: 0,
    flux: 0,
    flatness: 0,
    sharpness: 0,
    onset: 0,
    bassPeak: 0,
    sectionBoundary: 0,
    dropEnter: 0,
    climaxEnter: 0,
    inBuild: 0,
    inDrop: 0,
    inClimax: 0,
    sectionBoundaryConfidence: 0,
    buildConfidence: 0,
    dropConfidence: 0,
    climaxConfidence: 0,
    sectionBoundaryAvailable: false,
    buildAvailable: false,
    dropAvailable: false,
    climaxAvailable: false,
    structureFallbackActive: false,
    structureManualOverrideActive: false
  });
  assert.equal(createVisualTargetState({ id: 'main' }).enabled, true);
  assert.equal(createMappingCard({ amount: 0.25 }).sourceId, '');
  assert.equal(createEnergyBudgetConfig({ budget: 0.5 }).budget, 0.5);
  assert.equal(
    createSafetyConfig({ whiteoutProtection: false }).whiteoutProtection,
    false
  );
  assert.equal(createNodeGraphNode({ kind: 'lfo' }).frequencyHz, 1);
  assert.equal(createNodeGraphEdge({ sourceId: 'audio.bass' }).targetPort, 'input');
  assert.deepEqual(createNodeGraph(), { nodes: [], edges: [] });
  assert.deepEqual(createEventEnvelope({ decayMs: 240 }), {
    id: '',
    delayMs: 0,
    attackMs: 0,
    holdMs: 0,
    decayMs: 240,
    sustain: 0,
    releaseMs: 120,
    cooldownMs: 250,
    retriggerMode: 'restart'
  });
  assert.equal(createPreset({ name: 'Partial' }).name, 'Partial');
  assert.deepEqual(createSnapshot({ name: 'Frame A' }), {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: '',
    name: 'Frame A',
    engineTimeMs: 0,
    note: '',
    thumbnail: '',
    preset: createPreset(),
    targetState: createVisualTargetState()
  });
});
