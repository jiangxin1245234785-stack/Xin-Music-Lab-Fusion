import type {
  AudioFeatureFrame,
  EnergyBudgetConfig,
  EventEnvelope,
  MappingABState,
  MappingCard,
  MappingModulation,
  MappingParameterSet,
  NodeGraph,
  NodeGraphEdge,
  NodeGraphNode,
  Preset,
  ResolvedAudioFeatureFrame,
  ResolvedEnergyBudgetConfig,
  ResolvedEventEnvelope,
  ResolvedMappingABState,
  ResolvedMappingCard,
  ResolvedMappingModulation,
  ResolvedMappingParameterSet,
  ResolvedNodeGraph,
  ResolvedNodeGraphEdge,
  ResolvedNodeGraphNode,
  ResolvedPreset,
  ResolvedSafetyConfig,
  ResolvedVisualClockConfig,
  ResolvedShaderCustomPassConfig,
  ResolvedShaderPipelineConfig,
  ResolvedShaderUniformConfig,
  ResolvedSnapshot,
  ResolvedVisualTargetState,
  Snapshot,
  SafetyConfig,
  VisualClockConfig,
  ShaderCustomPassConfig,
  ShaderPipelineConfig,
  ShaderUniformConfig,
  VisualTargetState
} from './types.js';
import {
  CURRENT_ENGINE_VERSION,
  CURRENT_PRESET_VERSION,
  CURRENT_SCHEMA_VERSION
} from '../preset/version.js';

export const AUDIO_FEATURE_FRAME_DEFAULTS: Readonly<ResolvedAudioFeatureFrame> = Object.freeze({
  frameIndex: 0,
  engineTimeMs: 0,
  available: false,
  loudness: 0,
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

export const VISUAL_TARGET_STATE_DEFAULTS: Readonly<ResolvedVisualTargetState> = Object.freeze({
  id: '',
  enabled: true,
  values: Object.freeze({})
});

export const MAPPING_PARAMETER_SET_DEFAULTS:
Readonly<ResolvedMappingParameterSet> = Object.freeze({
  amount: 1,
  range: Object.freeze([0, 1]) as readonly [number, number],
  curve: 1,
  attackMs: 80,
  fallMs: 240,
  threshold: 0,
  priority: 0
});

export const MAPPING_AB_DEFAULTS: Readonly<ResolvedMappingABState> =
Object.freeze({
  active: 'A',
  a: MAPPING_PARAMETER_SET_DEFAULTS,
  b: MAPPING_PARAMETER_SET_DEFAULTS
});

export const MAPPING_MODULATION_DEFAULTS:
Readonly<ResolvedMappingModulation> = Object.freeze({
  id: '',
  sourceId: '',
  targetParameter: 'amount',
  depth: 0,
  enabled: true
});

export const MAPPING_CARD_DEFAULTS: Readonly<ResolvedMappingCard> = Object.freeze({
  id: '',
  sourceId: '',
  targetId: '',
  enabled: true,
  amount: 1,
  range: Object.freeze([0, 1]) as readonly [number, number],
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
  ab: MAPPING_AB_DEFAULTS,
  modulations: Object.freeze([])
});

export const EVENT_ENVELOPE_DEFAULTS: Readonly<ResolvedEventEnvelope> = Object.freeze({
  id: '',
  delayMs: 0,
  attackMs: 0,
  holdMs: 0,
  decayMs: 120,
  sustain: 0,
  releaseMs: 120,
  cooldownMs: 250,
  retriggerMode: 'restart'
});

export const SAFETY_CONFIG_DEFAULTS: Readonly<ResolvedSafetyConfig> =
Object.freeze({
  whiteoutProtection: true,
  blackoutProtection: true,
  feedbackRunawayProtection: true
});

export const VISUAL_CLOCK_CONFIG_DEFAULTS:
Readonly<ResolvedVisualClockConfig> = Object.freeze({
  enabled: false,
  mode: 'auto',
  minimumConfidence: 0.5,
  refractoryMs: 100,
  divisions: Object.freeze([2, 4, 8, 16]),
  resetOnSectionBoundary: false,
  sectionBoundaryConfidence: 0.7
});

export const ENERGY_BUDGET_CONFIG_DEFAULTS:
Readonly<ResolvedEnergyBudgetConfig> = Object.freeze({
  enabled: false,
  budget: 1,
  weights: Object.freeze({}),
  eventVoiceLimit: 4,
  globalEventPolicy: 'drop-low-priority',
  experimentalQueueEnabled: false
});

export const NODE_GRAPH_NODE_DEFAULTS:
Readonly<ResolvedNodeGraphNode> = Object.freeze({
  id: '',
  kind: 'bus',
  label: '',
  enabled: true,
  busMode: 'sum',
  mathOperation: 'add',
  shaperMode: 'clamp',
  logicOperation: 'greater',
  lfoWaveform: 'sine',
  sampleMode: 'random',
  value: 0,
  minimum: 0,
  maximum: 1,
  curve: 1,
  threshold: 0.5,
  frequencyHz: 1,
  phaseOffset: 0,
  amplitude: 0.5,
  offset: 0.5
});

export const NODE_GRAPH_EDGE_DEFAULTS:
Readonly<ResolvedNodeGraphEdge> = Object.freeze({
  id: '',
  sourceId: '',
  targetNodeId: '',
  targetPort: 'input'
});

export const NODE_GRAPH_DEFAULTS: Readonly<ResolvedNodeGraph> = Object.freeze({
  nodes: Object.freeze([]),
  edges: Object.freeze([])
});

export const SHADER_CUSTOM_PASS_DEFAULTS:
Readonly<ResolvedShaderCustomPassConfig> = Object.freeze({
  enabled: true,
  label: 'Custom GLSL pass',
  source: ''
});

export const SHADER_UNIFORM_DEFAULTS:
Readonly<Omit<ResolvedShaderUniformConfig, 'name' | 'label'>> = Object.freeze({
  type: 'float',
  range: Object.freeze([0, 1] as const),
  default: 0,
  impactWeight: 0.55,
  impactCategory: 'medium'
});

export const SHADER_PIPELINE_DEFAULTS:
Readonly<ResolvedShaderPipelineConfig> = Object.freeze({
  passOrder: Object.freeze(['builtin-feedback', 'custom-glsl'] as const),
  customPass: SHADER_CUSTOM_PASS_DEFAULTS,
  uniformRegistry: Object.freeze([])
});

export const PRESET_DEFAULTS: Readonly<ResolvedPreset> = Object.freeze({
  schemaVersion: CURRENT_SCHEMA_VERSION,
  engineVersion: CURRENT_ENGINE_VERSION,
  presetVersion: CURRENT_PRESET_VERSION,
  seed: 1,
  id: '',
  name: 'Untitled preset',
  description: '',
  mappings: Object.freeze([]),
  envelopes: Object.freeze([]),
  energyBudget: ENERGY_BUDGET_CONFIG_DEFAULTS,
  safety: SAFETY_CONFIG_DEFAULTS,
  visualClock: VISUAL_CLOCK_CONFIG_DEFAULTS,
  nodeGraph: NODE_GRAPH_DEFAULTS,
  shaderPipeline: SHADER_PIPELINE_DEFAULTS,
  targetDefaults: VISUAL_TARGET_STATE_DEFAULTS,
  metadata: Object.freeze({})
});

export const SNAPSHOT_DEFAULTS: Readonly<ResolvedSnapshot> = Object.freeze({
  schemaVersion: CURRENT_SCHEMA_VERSION,
  id: '',
  name: 'Untitled snapshot',
  engineTimeMs: 0,
  note: '',
  thumbnail: '',
  preset: PRESET_DEFAULTS,
  targetState: VISUAL_TARGET_STATE_DEFAULTS
});

export function createAudioFeatureFrame(
  input: AudioFeatureFrame = {}
): ResolvedAudioFeatureFrame {
  return {
    ...AUDIO_FEATURE_FRAME_DEFAULTS,
    ...input
  };
}

export function createVisualTargetState(
  input: VisualTargetState = {}
): ResolvedVisualTargetState {
  return {
    ...VISUAL_TARGET_STATE_DEFAULTS,
    ...input,
    values: { ...(input.values ?? VISUAL_TARGET_STATE_DEFAULTS.values) }
  };
}

export function createMappingParameterSet(
  input: MappingParameterSet = {},
  fallback: MappingParameterSet = MAPPING_PARAMETER_SET_DEFAULTS
): ResolvedMappingParameterSet {
  const range =
    input.range ??
    fallback.range ??
    MAPPING_PARAMETER_SET_DEFAULTS.range;
  return {
    amount:
      input.amount ??
      fallback.amount ??
      MAPPING_PARAMETER_SET_DEFAULTS.amount,
    range: [range[0], range[1]],
    curve:
      input.curve ??
      fallback.curve ??
      MAPPING_PARAMETER_SET_DEFAULTS.curve,
    attackMs:
      input.attackMs ??
      fallback.attackMs ??
      MAPPING_PARAMETER_SET_DEFAULTS.attackMs,
    fallMs:
      input.fallMs ??
      fallback.fallMs ??
      MAPPING_PARAMETER_SET_DEFAULTS.fallMs,
    threshold:
      input.threshold ??
      fallback.threshold ??
      MAPPING_PARAMETER_SET_DEFAULTS.threshold,
    priority:
      input.priority ??
      fallback.priority ??
      MAPPING_PARAMETER_SET_DEFAULTS.priority
  };
}

function mappingTopLevelParameters(
  input: MappingCard
): ResolvedMappingParameterSet {
  const parameters: MappingParameterSet = {};
  if (input.amount !== undefined) parameters.amount = input.amount;
  if (input.range !== undefined) parameters.range = input.range;
  if (input.curve !== undefined) parameters.curve = input.curve;
  if (input.attackMs !== undefined) parameters.attackMs = input.attackMs;
  if (input.fallMs !== undefined) parameters.fallMs = input.fallMs;
  if (input.threshold !== undefined) parameters.threshold = input.threshold;
  if (input.priority !== undefined) parameters.priority = input.priority;
  return createMappingParameterSet(parameters);
}

export function createMappingABState(
  input: MappingABState | undefined,
  fallback: MappingParameterSet
): ResolvedMappingABState {
  return {
    active: input?.active === 'B' ? 'B' : 'A',
    a: createMappingParameterSet(input?.a, fallback),
    b: createMappingParameterSet(input?.b, fallback)
  };
}

export function createMappingModulation(
  input: MappingModulation = {},
  fallbackId = ''
): ResolvedMappingModulation {
  return {
    ...MAPPING_MODULATION_DEFAULTS,
    ...input,
    id: input.id?.trim() || fallbackId
  };
}

export function createMappingCard(input: MappingCard = {}): ResolvedMappingCard {
  const topLevel = mappingTopLevelParameters(input);
  const ab = createMappingABState(input.ab, topLevel);
  const effective = input.ab === undefined
    ? topLevel
    : ab.active === 'B' ? ab.b : ab.a;
  const mappingId = input.id?.trim() || 'mapping';
  const modulations = (input.modulations ?? []).map(
    (modulation, index) => createMappingModulation(
      modulation,
      `${mappingId}-modulation-${index + 1}`
    )
  );
  return {
    ...MAPPING_CARD_DEFAULTS,
    ...input,
    ...effective,
    range: [effective.range[0], effective.range[1]],
    ab,
    modulations
  };
}

export function createEventEnvelope(
  input: EventEnvelope = {}
): ResolvedEventEnvelope {
  return {
    ...EVENT_ENVELOPE_DEFAULTS,
    ...input
  };
}

export function createSafetyConfig(
  input: SafetyConfig = {}
): ResolvedSafetyConfig {
  return {
    ...SAFETY_CONFIG_DEFAULTS,
    ...input
  };
}

export function createVisualClockConfig(
  input: VisualClockConfig = {}
): ResolvedVisualClockConfig {
  return {
    ...VISUAL_CLOCK_CONFIG_DEFAULTS,
    ...input,
    divisions: [
      ...(input.divisions ?? VISUAL_CLOCK_CONFIG_DEFAULTS.divisions)
    ]
  };
}

export function createEnergyBudgetConfig(
  input: EnergyBudgetConfig = {}
): ResolvedEnergyBudgetConfig {
  return {
    ...ENERGY_BUDGET_CONFIG_DEFAULTS,
    ...input,
    weights: {
      ...(input.weights ?? ENERGY_BUDGET_CONFIG_DEFAULTS.weights)
    }
  };
}

export function createNodeGraphNode(
  input: NodeGraphNode = {}
): ResolvedNodeGraphNode {
  return {
    ...NODE_GRAPH_NODE_DEFAULTS,
    ...input
  };
}

export function createNodeGraphEdge(
  input: NodeGraphEdge = {}
): ResolvedNodeGraphEdge {
  return {
    ...NODE_GRAPH_EDGE_DEFAULTS,
    ...input
  };
}

export function createNodeGraph(input: NodeGraph = {}): ResolvedNodeGraph {
  return {
    nodes: (input.nodes ?? NODE_GRAPH_DEFAULTS.nodes).map(
      createNodeGraphNode
    ),
    edges: (input.edges ?? NODE_GRAPH_DEFAULTS.edges).map(
      createNodeGraphEdge
    )
  };
}

export function createShaderCustomPassConfig(
  input: ShaderCustomPassConfig = {}
): ResolvedShaderCustomPassConfig {
  return {
    ...SHADER_CUSTOM_PASS_DEFAULTS,
    ...input
  };
}

export function createShaderUniformConfig(
  input: ShaderUniformConfig = {}
): ResolvedShaderUniformConfig {
  const name = input.name?.trim() ?? '';
  const range = input.range ?? SHADER_UNIFORM_DEFAULTS.range;
  return {
    ...SHADER_UNIFORM_DEFAULTS,
    ...input,
    name,
    label: input.label?.trim() || name,
    range: [range[0], range[1]]
  };
}

export function createShaderPipelineConfig(
  input: ShaderPipelineConfig = {}
): ResolvedShaderPipelineConfig {
  return {
    passOrder: [
      ...(input.passOrder ?? SHADER_PIPELINE_DEFAULTS.passOrder)
    ],
    customPass: createShaderCustomPassConfig(input.customPass),
    uniformRegistry: (
      input.uniformRegistry ?? SHADER_PIPELINE_DEFAULTS.uniformRegistry
    ).map(createShaderUniformConfig)
  };
}

export function createPreset(input: Preset = {}): ResolvedPreset {
  return {
    ...PRESET_DEFAULTS,
    ...input,
    mappings: (input.mappings ?? PRESET_DEFAULTS.mappings).map(createMappingCard),
    envelopes: (input.envelopes ?? PRESET_DEFAULTS.envelopes).map(createEventEnvelope),
    energyBudget: createEnergyBudgetConfig(input.energyBudget),
    safety: createSafetyConfig(input.safety),
    visualClock: createVisualClockConfig(input.visualClock),
    nodeGraph: createNodeGraph(input.nodeGraph),
    shaderPipeline: createShaderPipelineConfig(input.shaderPipeline),
    targetDefaults: createVisualTargetState(input.targetDefaults),
    metadata: { ...(input.metadata ?? PRESET_DEFAULTS.metadata) }
  };
}

export function createSnapshot(input: Snapshot = {}): ResolvedSnapshot {
  return {
    ...SNAPSHOT_DEFAULTS,
    ...input,
    preset: createPreset(input.preset),
    targetState: createVisualTargetState(input.targetState)
  };
}
