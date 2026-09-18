export type NumericTargetMap = Readonly<Record<string, number>>;
export type StringMetadataMap = Readonly<Record<string, string>>;
export type MappingRange = readonly [number, number];
export type MappingKind = 'continuous' | 'event';
export type MappingABVariant = 'A' | 'B';
export type MappingPolarity = 'normal' | 'inverted';
export type MappingReplaceMode = 'multiply' | 'add' | 'max' | 'min' | 'replace';
export type MappingModulationTarget =
  'amount' | 'threshold' | 'fallMs' | 'probability';
export type EventRetriggerMode =
  'restart' | 'ignore-until-release' | 'accumulate';
export type GlobalEventPolicy = 'drop-low-priority' | 'queue';
export type NodeKind =
  'bus' | 'math' | 'shaper' | 'logic' | 'lfo' | 'sample-hold';
export type NodeBusMode = 'sum' | 'average' | 'max' | 'min';
export type NodeMathOperation = 'add' | 'subtract' | 'multiply' | 'divide';
export type NodeShaperMode = 'clamp' | 'power' | 'smoothstep';
export type NodeLogicOperation =
  'greater' | 'less' | 'and' | 'or' | 'not';
export type NodeLfoWaveform = 'sine' | 'triangle' | 'square' | 'saw';
export type NodeSampleMode = 'random' | 'input';
export type ShaderPassId = 'builtin-feedback' | 'custom-glsl';
export type ShaderUniformType = 'float' | 'int' | 'bool';
export type ShaderImpactCategory = 'high' | 'medium' | 'low';
export type VisualClockMode =
  'auto' | 'onset' | 'rhythm-phase' | 'adaptive';

export interface AudioFeatureFrame {
  frameIndex?: number;
  engineTimeMs?: number;
  available?: boolean;
  loudness?: number;
  bass?: number;
  mid?: number;
  treble?: number;
  dynamicRange?: number;
  spectralDensity?: number;
  buildEnergy?: number;
  sectionDrive?: number;
  rhythmPhase?: number;
  flux?: number;
  flatness?: number;
  sharpness?: number;
  onset?: number;
  bassPeak?: number;
  sectionBoundary?: number;
  dropEnter?: number;
  climaxEnter?: number;
  inBuild?: number;
  inDrop?: number;
  inClimax?: number;
  sectionBoundaryConfidence?: number;
  buildConfidence?: number;
  dropConfidence?: number;
  climaxConfidence?: number;
  sectionBoundaryAvailable?: boolean;
  buildAvailable?: boolean;
  dropAvailable?: boolean;
  climaxAvailable?: boolean;
  structureFallbackActive?: boolean;
  structureManualOverrideActive?: boolean;
}

export interface VisualTargetState {
  id?: string;
  enabled?: boolean;
  values?: NumericTargetMap;
}

export interface MappingParameterSet {
  amount?: number;
  range?: MappingRange;
  curve?: number;
  attackMs?: number;
  fallMs?: number;
  threshold?: number;
  priority?: number;
}

export interface MappingABState {
  active?: MappingABVariant;
  a?: MappingParameterSet;
  b?: MappingParameterSet;
}

export interface MappingModulation {
  id?: string;
  sourceId?: string;
  targetParameter?: MappingModulationTarget;
  depth?: number;
  enabled?: boolean;
}

export interface MappingCard {
  id?: string;
  sourceId?: string;
  targetId?: string;
  enabled?: boolean;
  amount?: number;
  range?: MappingRange;
  curve?: number;
  attackMs?: number;
  fallMs?: number;
  threshold?: number;
  priority?: number;
  kind?: MappingKind;
  envelopeId?: string;
  gateSourceId?: string;
  gateThreshold?: number;
  polarity?: MappingPolarity;
  replaceMode?: MappingReplaceMode;
  safetyClamp?: boolean;
  probability?: number;
  ab?: MappingABState;
  modulations?: readonly MappingModulation[];
}

export interface EventEnvelope {
  id?: string;
  delayMs?: number;
  attackMs?: number;
  holdMs?: number;
  decayMs?: number;
  sustain?: number;
  releaseMs?: number;
  cooldownMs?: number;
  retriggerMode?: EventRetriggerMode;
}

export interface SafetyConfig {
  whiteoutProtection?: boolean;
  blackoutProtection?: boolean;
  feedbackRunawayProtection?: boolean;
}

export interface EnergyBudgetConfig {
  enabled?: boolean;
  budget?: number;
  weights?: NumericTargetMap;
  eventVoiceLimit?: number;
  globalEventPolicy?: GlobalEventPolicy;
  experimentalQueueEnabled?: boolean;
}

export interface NodeGraphNode {
  id?: string;
  kind?: NodeKind;
  label?: string;
  enabled?: boolean;
  busMode?: NodeBusMode;
  mathOperation?: NodeMathOperation;
  shaperMode?: NodeShaperMode;
  logicOperation?: NodeLogicOperation;
  lfoWaveform?: NodeLfoWaveform;
  sampleMode?: NodeSampleMode;
  value?: number;
  minimum?: number;
  maximum?: number;
  curve?: number;
  threshold?: number;
  frequencyHz?: number;
  phaseOffset?: number;
  amplitude?: number;
  offset?: number;
}

export interface NodeGraphEdge {
  id?: string;
  sourceId?: string;
  targetNodeId?: string;
  targetPort?: string;
}

export interface NodeGraph {
  nodes?: readonly NodeGraphNode[];
  edges?: readonly NodeGraphEdge[];
}

export interface ShaderCustomPassConfig {
  enabled?: boolean;
  label?: string;
  source?: string;
}

export interface ShaderUniformConfig {
  name?: string;
  type?: ShaderUniformType;
  range?: readonly [number, number];
  default?: number;
  label?: string;
  impactWeight?: number;
  impactCategory?: ShaderImpactCategory;
}

export interface ShaderPipelineConfig {
  passOrder?: readonly ShaderPassId[];
  customPass?: ShaderCustomPassConfig;
  uniformRegistry?: readonly ShaderUniformConfig[];
}

export interface VisualClockConfig {
  enabled?: boolean;
  mode?: VisualClockMode;
  minimumConfidence?: number;
  refractoryMs?: number;
  divisions?: readonly number[];
  resetOnSectionBoundary?: boolean;
  sectionBoundaryConfidence?: number;
}

export interface Preset {
  schemaVersion?: number;
  engineVersion?: string;
  presetVersion?: number;
  seed?: number;
  id?: string;
  name?: string;
  description?: string;
  mappings?: readonly MappingCard[];
  envelopes?: readonly EventEnvelope[];
  energyBudget?: EnergyBudgetConfig;
  safety?: SafetyConfig;
  visualClock?: VisualClockConfig;
  nodeGraph?: NodeGraph;
  shaderPipeline?: ShaderPipelineConfig;
  targetDefaults?: VisualTargetState;
  metadata?: StringMetadataMap;
}

export interface Snapshot {
  schemaVersion?: number;
  id?: string;
  name?: string;
  engineTimeMs?: number;
  note?: string;
  thumbnail?: string;
  preset?: Preset;
  targetState?: VisualTargetState;
}

export type Resolved<T> = {
  [Key in keyof T]-?: T[Key];
};

export type ResolvedAudioFeatureFrame = Resolved<AudioFeatureFrame>;
export type ResolvedVisualTargetState = Resolved<VisualTargetState>;
export type ResolvedMappingParameterSet = Resolved<MappingParameterSet>;
export interface ResolvedMappingABState
  extends Omit<Resolved<MappingABState>, 'a' | 'b'> {
  a: ResolvedMappingParameterSet;
  b: ResolvedMappingParameterSet;
}
export type ResolvedMappingModulation = Resolved<MappingModulation>;
export interface ResolvedMappingCard
  extends Omit<Resolved<MappingCard>, 'ab' | 'modulations'> {
  ab: ResolvedMappingABState;
  modulations: readonly ResolvedMappingModulation[];
}
export type ResolvedEventEnvelope = Resolved<EventEnvelope>;
export interface ResolvedEnergyBudgetConfig
  extends Omit<Resolved<EnergyBudgetConfig>, 'weights'> {
  weights: NumericTargetMap;
}
export type ResolvedSafetyConfig = Resolved<SafetyConfig>;
export interface ResolvedVisualClockConfig
  extends Omit<Resolved<VisualClockConfig>, 'divisions'> {
  divisions: readonly number[];
}
export type ResolvedNodeGraphNode = Resolved<NodeGraphNode>;
export type ResolvedNodeGraphEdge = Resolved<NodeGraphEdge>;
export interface ResolvedNodeGraph
  extends Omit<Resolved<NodeGraph>, 'nodes' | 'edges'> {
  nodes: readonly ResolvedNodeGraphNode[];
  edges: readonly ResolvedNodeGraphEdge[];
}
export type ResolvedShaderCustomPassConfig =
  Resolved<ShaderCustomPassConfig>;
export type ResolvedShaderUniformConfig = Resolved<ShaderUniformConfig>;
export interface ResolvedShaderPipelineConfig
  extends Omit<
    Resolved<ShaderPipelineConfig>,
    'passOrder' | 'customPass' | 'uniformRegistry'
  > {
  passOrder: readonly ShaderPassId[];
  customPass: ResolvedShaderCustomPassConfig;
  uniformRegistry: readonly ResolvedShaderUniformConfig[];
}

export interface ResolvedPreset
  extends Omit<
    Resolved<Preset>,
    | 'mappings'
    | 'envelopes'
    | 'energyBudget'
    | 'safety'
    | 'visualClock'
    | 'nodeGraph'
    | 'shaderPipeline'
    | 'targetDefaults'
  > {
  mappings: readonly ResolvedMappingCard[];
  envelopes: readonly ResolvedEventEnvelope[];
  energyBudget: ResolvedEnergyBudgetConfig;
  safety: ResolvedSafetyConfig;
  visualClock: ResolvedVisualClockConfig;
  nodeGraph: ResolvedNodeGraph;
  shaderPipeline: ResolvedShaderPipelineConfig;
  targetDefaults: ResolvedVisualTargetState;
}

export interface ResolvedSnapshot
  extends Omit<Resolved<Snapshot>, 'preset' | 'targetState'> {
  preset: ResolvedPreset;
  targetState: ResolvedVisualTargetState;
}
