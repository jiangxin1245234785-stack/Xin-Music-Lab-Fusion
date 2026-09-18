import {
  LiveAudioInput,
  OfflineDeterministicPlayback,
  type PcmFrame
} from '../audio/index.js';
import {
  FixedStepEngineClock,
  RealtimeEngineClock,
  type EngineClock
} from '../clock/index.js';
import {
  DebugConsoleLogBuffer,
  DebugEventLog,
  buildDebugBundle,
  installConsoleLogCapture,
  measureGlobalEnergyDebug
} from '../debug/index.js';
import {
  ContinuousFeatureExtractor,
  createStructuralSignalValidationBuffer,
  EventFeatureDetector,
  StructuralSignalDetector,
  type StructureFallbackMode,
  type StructureManualOverride
} from '../features/index.js';
import {
  UndoHistory,
  type UndoTransactionKind
} from '../history/index.js';
import {
  FeatureHistoryBuffer,
  learnV0,
  type LearnV0Result
} from '../learn/index.js';
import {
  CORE_MAPPING_SOURCE_IDS,
  applyMappingMacros,
  coreFeatureSourceValues,
  createNextMappingModulation,
  createNextMapping,
  deleteMappingModulation,
  deleteMapping,
  duplicateMapping,
  filterMappingsForRuntime,
  setMappingABVariantById,
  updateMappingModulation,
  updateMappingABParameters,
  toggleMappingBypass,
  type MappingSourceValues
} from '../mapping/index.js';
import { TargetMixer, type TargetMixerFrame } from '../mixer/index.js';
import {
  NodeGraphRuntime,
  NodeProbeBank,
  addNodeGraphNode,
  connectNodeGraph,
  disconnectNodeGraphEdge,
  mergeNodeOutputSources,
  nodeOutputSourceId,
  nodeOutputSourceIds,
  projectGraphView,
  projectNodeProbeWaveform,
  removeNodeGraphNode
} from '../nodegraph/index.js';
import {
  PERFORMANCE_STAGE_IDS,
  PerformanceProfiler,
  type PerformanceStageId
} from '../performance/index.js';
import {
  PresetValidationError,
  PRODUCT_BUILTIN_PRESETS,
  SnapshotStack,
  buildPresetCompatibilityReport,
  loadCustomPresetsFromStorage,
  loadPreset,
  loadPresetInputFromStorage,
  saveCustomPresetToStorage,
  savePresetToStorage,
  stagePresetJson,
  validatePreset,
  type PresetCompatibilityReport,
  type PresetValidationReport
} from '../preset/index.js';
import { createSeededPrng, type SeededPrng } from '../random/index.js';
import {
  VisualClockRuntime,
  mergeGeneratorControlSources
} from '../runtime/index.js';
import {
  AutosaveRecoveryManager,
  type RecoveryAutosave,
  type RecoveryStartResult
} from '../recovery/index.js';
import {
  BROKEN_SHADER_PASS_SAMPLE,
  GLSL_IMPACT_CATEGORY_DEFAULTS,
  GLSLUniformTargetRegistry,
  MinimalWebglRenderer,
  moveShaderPass,
  PASSTHROUGH_FRAGMENT_SHADER,
  PhysicalSafetyLimiter,
  VALID_SHADER_PASS_SAMPLE,
  VISUAL_TARGET_REGISTRY,
  VISUAL_TARGETS,
  createDefaultVisualValues,
  type GlslImpactCategory,
  type GlslUniformMetadata,
  type GlslUniformTargetDefinition,
  type VisualTargetDefinition
} from '../render/index.js';
import {
  createAudioFeatureFrame,
  createEnergyBudgetConfig,
  createEventEnvelope,
  createMappingCard,
  createNodeGraph,
  createSafetyConfig,
  createShaderPipelineConfig,
  createSnapshot,
  createVisualTargetState
} from '../schema/defaults.js';
import type {
  EventEnvelope,
  MappingCard,
  MappingModulationTarget,
  NodeKind,
  Preset,
  ResolvedAudioFeatureFrame,
  ResolvedEnergyBudgetConfig,
  ResolvedNodeGraph,
  ResolvedPreset,
  ResolvedSafetyConfig,
  ResolvedShaderPipelineConfig,
  ResolvedSnapshot,
  ResolvedVisualTargetState,
  ShaderPassId,
  Snapshot
} from '../schema/types.js';
import {
  createLocaleController,
  mountLocalizedSurface,
  mountLocaleUi,
  translateSurfaceText,
  type LocaleHostAdapter
} from '../ui/i18n/index.js';
import {
  createMappingIntentViewModel,
  createMappingRuntimeViewModel
} from '../ui/presenters/index.js';
import {
  resolveSourceDescriptor,
  resolveTargetDescriptor
} from '../ui/semantics/index.js';
import { FeatureMeterController } from './meter-controller.js';

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing Phase 1 control: ${selector}`);
  return element;
}

function getLocaleStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const localeController = createLocaleController({
  storage: getLocaleStorage(),
  onMissingTranslation: diagnostic => {
    const isDevelopment =
      location.protocol === 'file:' ||
      location.hostname === 'localhost' ||
      location.hostname === '127.0.0.1';
    if (isDevelopment) {
      console.warn(
        `[i18n] Missing ${diagnostic.key} for ${diagnostic.requestedLocale}; ` +
        `fallback=${diagnostic.resolvedLocale ?? 'key'}`
      );
    }
  }
});
const mountedLocaleUi = mountLocaleUi(localeController, {
  documentElement: document.documentElement,
  label: requireElement<HTMLLabelElement>('#localeLabel'),
  select: requireElement<HTMLSelectElement>('#localeSelect'),
  zhOption: requireElement<HTMLOptionElement>('#localeOptionZh'),
  enOption: requireElement<HTMLOptionElement>('#localeOptionEn'),
  status: requireElement<HTMLOutputElement>('#localeSource')
});
const mountedLocalizedSurface = mountLocalizedSurface(
  localeController,
  document.body
);
const localeHostWindow = window as Window & {
  xinGlitchGeneratorLocale?: LocaleHostAdapter;
};
localeHostWindow.xinGlitchGeneratorLocale = mountedLocaleUi.host;

const pageButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-page-button]'));
const pages = Array.from(document.querySelectorAll<HTMLElement>('[data-page]'));
const mapCardViewButton =
  requireElement<HTMLButtonElement>('#mapCardViewButton');
const mapGraphViewButton =
  requireElement<HTMLButtonElement>('#mapGraphViewButton');
const mapCardView = requireElement<HTMLElement>('#mapCardView');
const mapGraphView = requireElement<HTMLElement>('#mapGraphView');
const graphViewStatus =
  requireElement<HTMLOutputElement>('#graphViewStatus');
const graphViewSources =
  requireElement<HTMLElement>('#graphViewSources');
const graphViewCoreNodes =
  requireElement<HTMLElement>('#graphViewCoreNodes');
const graphViewMappings =
  requireElement<HTMLElement>('#graphViewMappings');
const graphViewTargets =
  requireElement<HTMLElement>('#graphViewTargets');
const graphViewEdges =
  requireElement<HTMLOListElement>('#graphViewEdges');
const presetSelect = requireElement<HTMLSelectElement>('#presetSelect');
const undoButton = requireElement<HTMLButtonElement>('#undoButton');
const redoButton = requireElement<HTMLButtonElement>('#redoButton');
const historyStatus = requireElement<HTMLElement>('#historyStatus');
const presetNameInput = requireElement<HTMLInputElement>('#presetName');
const captureSnapshotButton = requireElement<HTMLButtonElement>('#captureSnapshotButton');
const restoreSnapshotButton = requireElement<HTMLButtonElement>('#restoreSnapshotButton');
const snapshotNoteInput = requireElement<HTMLInputElement>('#snapshotNote');
const snapshotCount = requireElement<HTMLOutputElement>('#snapshotCount');
const snapshotStackElement = requireElement<HTMLElement>('#snapshotStack');
const savePresetButton = requireElement<HTMLButtonElement>('#savePresetButton');
const loadPresetButton = requireElement<HTMLButtonElement>('#loadPresetButton');
const persistenceStatus = requireElement<HTMLElement>('#persistenceStatus');
const presetValidationStatus =
  requireElement<HTMLOutputElement>('#presetValidationStatus');
const presetValidationIssues =
  requireElement<HTMLOListElement>('#presetValidationIssues');
const presetCompatibilityStatus =
  requireElement<HTMLOutputElement>('#presetCompatibilityStatus');
const presetCompatibilitySummary =
  requireElement<HTMLElement>('#presetCompatibilitySummary');
const presetCompatibilitySource =
  requireElement<HTMLOutputElement>('#presetCompatibilitySource');
const presetCompatibilityTarget =
  requireElement<HTMLOutputElement>('#presetCompatibilityTarget');
const presetMigrationCount =
  requireElement<HTMLOutputElement>('#presetMigrationCount');
const presetMigratedFieldCount =
  requireElement<HTMLOutputElement>('#presetMigratedFieldCount');
const presetNonMigratedFieldCount =
  requireElement<HTMLOutputElement>('#presetNonMigratedFieldCount');
const presetMigrationSteps =
  requireElement<HTMLOListElement>('#presetMigrationSteps');
const presetMigratedFields =
  requireElement<HTMLOListElement>('#presetMigratedFields');
const presetNonMigratedFields =
  requireElement<HTMLOListElement>('#presetNonMigratedFields');
const presetCompatibilityWarnings =
  requireElement<HTMLOListElement>('#presetCompatibilityWarnings');
const offlineButton = requireElement<HTMLButtonElement>('#offlineButton');
const microphoneButton = requireElement<HTMLButtonElement>('#microphoneButton');
const stopButton = requireElement<HTMLButtonElement>('#stopButton');
const sourceStatus = requireElement<HTMLElement>('#sourceStatus');
const shaderPassFile =
  requireElement<HTMLInputElement>('#shaderPassFile');
const shaderPassSource =
  requireElement<HTMLTextAreaElement>('#shaderPassSource');
const shaderApplyButton =
  requireElement<HTMLButtonElement>('#shaderApplyButton');
const shaderValidSampleButton =
  requireElement<HTMLButtonElement>('#shaderValidSampleButton');
const shaderBrokenSampleButton =
  requireElement<HTMLButtonElement>('#shaderBrokenSampleButton');
const shaderPassStatus =
  requireElement<HTMLOutputElement>('#shaderPassStatus');
const shaderLiveLabel =
  requireElement<HTMLElement>('#shaderLiveLabel');
const shaderLiveRevision =
  requireElement<HTMLOutputElement>('#shaderLiveRevision');
const shaderCompileLog =
  requireElement<HTMLElement>('#shaderCompileLog');
const shaderLogCard =
  requireElement<HTMLElement>('#shaderLogCard');
const passOrderEditor =
  requireElement<HTMLElement>('#passOrderEditor');
const passOrderStatus =
  requireElement<HTMLOutputElement>('#passOrderStatus');
const framebufferPreview =
  requireElement<HTMLCanvasElement>('#framebufferPreview');
const framebufferPreviewStatus =
  requireElement<HTMLOutputElement>('#framebufferPreviewStatus');
const framebufferPreviewButton =
  requireElement<HTMLButtonElement>('#framebufferPreviewButton');
const rawJsonEditor =
  requireElement<HTMLTextAreaElement>('#rawJsonEditor');
const rawJsonLoadButton =
  requireElement<HTMLButtonElement>('#rawJsonLoadButton');
const rawJsonValidateButton =
  requireElement<HTMLButtonElement>('#rawJsonValidateButton');
const rawJsonApplyButton =
  requireElement<HTMLButtonElement>('#rawJsonApplyButton');
const rawJsonStatus =
  requireElement<HTMLOutputElement>('#rawJsonStatus');
const rawJsonLog =
  requireElement<HTMLElement>('#rawJsonLog');
const debugBundleExportButton =
  requireElement<HTMLButtonElement>('#debugBundleExportButton');
const debugBundleStatus =
  requireElement<HTMLOutputElement>('#debugBundleStatus');
const debugBundleClockMode =
  requireElement<HTMLElement>('#debugBundleClockMode');
const debugBundleSummary =
  requireElement<HTMLOutputElement>('#debugBundleSummary');
const performanceProfilerEnabled =
  requireElement<HTMLInputElement>('#performanceProfilerEnabled');
const performanceProfilerThreshold =
  requireElement<HTMLInputElement>('#performanceProfilerThreshold');
const performanceProfilerReset =
  requireElement<HTMLButtonElement>('#performanceProfilerReset');
const performanceProfilerStatus =
  requireElement<HTMLOutputElement>('#performanceProfilerStatus');
const performanceFrameAverage =
  requireElement<HTMLOutputElement>('#performanceFrameAverage');
const performanceFramePeak =
  requireElement<HTMLOutputElement>('#performanceFramePeak');
const performanceOverBudget =
  requireElement<HTMLOutputElement>('#performanceOverBudget');
const performanceBottleneck =
  requireElement<HTMLOutputElement>('#performanceBottleneck');
const performanceStageList =
  requireElement<HTMLElement>('#performanceStageList');
const recoveryPanel =
  requireElement<HTMLElement>('#recoveryPanel');
const recoveryStatus =
  requireElement<HTMLOutputElement>('#recoveryStatus');
const recoverySummary =
  requireElement<HTMLElement>('#recoverySummary');
const recoveryRestoreButton =
  requireElement<HTMLButtonElement>('#recoveryRestoreButton');
const recoveryDiscardButton =
  requireElement<HTMLButtonElement>('#recoveryDiscardButton');
const autosaveNowButton =
  requireElement<HTMLButtonElement>('#autosaveNowButton');
const uniformRegistryStatus =
  requireElement<HTMLOutputElement>('#uniformRegistryStatus');
const uniformNameInput =
  requireElement<HTMLInputElement>('#uniformName');
const uniformTypeSelect =
  requireElement<HTMLSelectElement>('#uniformType');
const uniformLabelInput =
  requireElement<HTMLInputElement>('#uniformLabel');
const uniformRangeMinInput =
  requireElement<HTMLInputElement>('#uniformRangeMin');
const uniformRangeMaxInput =
  requireElement<HTMLInputElement>('#uniformRangeMax');
const uniformDefaultInput =
  requireElement<HTMLInputElement>('#uniformDefault');
const uniformImpactCategorySelect =
  requireElement<HTMLSelectElement>('#uniformImpactCategory');
const uniformImpactWeightInput =
  requireElement<HTMLInputElement>('#uniformImpactWeight');
const uniformDeclareButton =
  requireElement<HTMLButtonElement>('#uniformDeclareButton');
const uniformRegistryMessage =
  requireElement<HTMLOutputElement>('#uniformRegistryMessage');
const uniformRegistryList =
  requireElement<HTMLElement>('#uniformRegistryList');
const fxRackToggle = requireElement<HTMLButtonElement>('#fxRackToggle');
const macroIntensityInput = requireElement<HTMLInputElement>('#macroIntensity');
const macroResponseInput = requireElement<HTMLInputElement>('#macroResponse');
const macroIntensityValue = requireElement<HTMLOutputElement>('#macroIntensityValue');
const macroResponseValue = requireElement<HTMLOutputElement>('#macroResponseValue');
const safetyWhiteoutInput = requireElement<HTMLInputElement>('#safetyWhiteout');
const safetyBlackoutInput = requireElement<HTMLInputElement>('#safetyBlackout');
const safetyFeedbackRunawayInput =
  requireElement<HTMLInputElement>('#safetyFeedbackRunaway');
const safetyModeStatus = requireElement<HTMLOutputElement>('#safetyModeStatus');
const safetyInterventionStatus =
  requireElement<HTMLOutputElement>('#safetyInterventionStatus');
const mappingSelect = requireElement<HTMLSelectElement>('#mappingSelect');
const addMappingButton = requireElement<HTMLButtonElement>('#addMappingButton');
const soloMappingButton = requireElement<HTMLButtonElement>('#soloMappingButton');
const bypassMappingButton = requireElement<HTMLButtonElement>('#bypassMappingButton');
const duplicateMappingButton = requireElement<HTMLButtonElement>('#duplicateMappingButton');
const deleteMappingButton = requireElement<HTMLButtonElement>('#deleteMappingButton');
const mappingVariantAButton = requireElement<HTMLButtonElement>('#mappingVariantA');
const mappingVariantBButton = requireElement<HTMLButtonElement>('#mappingVariantB');
const mappingABStatus = requireElement<HTMLOutputElement>('#mappingABStatus');
const mappingIntentStatus =
  requireElement<HTMLOutputElement>('#mappingIntentStatus');
const mappingIntentSummary =
  requireElement<HTMLElement>('#mappingIntentSummary');
const mappingIntentDetails =
  requireElement<HTMLDetailsElement>('#mappingIntentDetails');
const mappingIntentSource =
  requireElement<HTMLOutputElement>('#mappingIntentSource');
const mappingIntentTarget =
  requireElement<HTMLOutputElement>('#mappingIntentTarget');
const mappingIntentOperation =
  requireElement<HTMLOutputElement>('#mappingIntentOperation');
const mappingIntentAmount =
  requireElement<HTMLOutputElement>('#mappingIntentAmount');
const mappingIntentRange =
  requireElement<HTMLOutputElement>('#mappingIntentRange');
const mappingIntentResponse =
  requireElement<HTMLOutputElement>('#mappingIntentResponse');
const mappingIntentConditions =
  requireElement<HTMLOutputElement>('#mappingIntentConditions');
const mappingIntentEnvelope =
  requireElement<HTMLOutputElement>('#mappingIntentEnvelope');
const mappingIntentRawIds =
  requireElement<HTMLElement>('#mappingIntentRawIds');
const learnWindowSeconds = requireElement<HTMLSelectElement>('#learnWindowSeconds');
const learnAnalyzeButton = requireElement<HTMLButtonElement>('#learnAnalyzeButton');
const learnStatus = requireElement<HTMLOutputElement>('#learnStatus');
const learnConfidenceFill = requireElement<HTMLElement>('#learnConfidenceFill');
const learnConfidence = requireElement<HTMLOutputElement>('#learnConfidence');
const learnThreshold = requireElement<HTMLOutputElement>('#learnThreshold');
const learnRange = requireElement<HTMLOutputElement>('#learnRange');
const learnAttack = requireElement<HTMLOutputElement>('#learnAttack');
const learnFall = requireElement<HTMLOutputElement>('#learnFall');
const learnMessage = requireElement<HTMLOutputElement>('#learnMessage');
const learnCoverage = requireElement<HTMLOutputElement>('#learnCoverage');
const mappingKindSelect = requireElement<HTMLSelectElement>('#mappingKind');
const sourceSelect = requireElement<HTMLSelectElement>('#mappingSource');
const targetSelect = requireElement<HTMLSelectElement>('#mappingTarget');
const mappingEnvelopeSelect = requireElement<HTMLSelectElement>('#mappingEnvelope');
const amountInput = requireElement<HTMLInputElement>('#mappingAmount');
const rangeMinInput = requireElement<HTMLInputElement>('#rangeMin');
const rangeMaxInput = requireElement<HTMLInputElement>('#rangeMax');
const curveInput = requireElement<HTMLInputElement>('#mappingCurve');
const attackInput = requireElement<HTMLInputElement>('#mappingAttack');
const fallInput = requireElement<HTMLInputElement>('#mappingFall');
const thresholdInput = requireElement<HTMLInputElement>('#mappingThreshold');
const priorityInput = requireElement<HTMLInputElement>('#mappingPriority');
const polaritySelect = requireElement<HTMLSelectElement>('#mappingPolarity');
const replaceModeSelect = requireElement<HTMLSelectElement>('#mappingReplaceMode');
const probabilityInput = requireElement<HTMLInputElement>('#mappingProbability');
const safetyClampSelect = requireElement<HTMLSelectElement>('#mappingSafetyClamp');
const gateSourceSelect = requireElement<HTMLSelectElement>('#mappingGateSource');
const gateThresholdInput = requireElement<HTMLInputElement>('#mappingGateThreshold');
const mappingModulationSelect =
  requireElement<HTMLSelectElement>('#mappingModulationSelect');
const mappingModulationSourceSelect =
  requireElement<HTMLSelectElement>('#mappingModulationSource');
const mappingModulationTargetSelect =
  requireElement<HTMLSelectElement>('#mappingModulationTarget');
const mappingModulationDepthInput =
  requireElement<HTMLInputElement>('#mappingModulationDepth');
const mappingModulationEnabledInput =
  requireElement<HTMLInputElement>('#mappingModulationEnabled');
const mappingModulationCount =
  requireElement<HTMLOutputElement>('#mappingModulationCount');
const addMappingModulationButton =
  requireElement<HTMLButtonElement>('#addMappingModulation');
const deleteMappingModulationButton =
  requireElement<HTMLButtonElement>('#deleteMappingModulation');
const envelopePanel = requireElement<HTMLElement>('#eventEnvelopePanel');
const envelopeDelayInput = requireElement<HTMLInputElement>('#envelopeDelay');
const envelopeAttackInput = requireElement<HTMLInputElement>('#envelopeAttack');
const envelopeHoldInput = requireElement<HTMLInputElement>('#envelopeHold');
const envelopeDecayInput = requireElement<HTMLInputElement>('#envelopeDecay');
const envelopeSustainInput = requireElement<HTMLInputElement>('#envelopeSustain');
const envelopeReleaseInput = requireElement<HTMLInputElement>('#envelopeRelease');
const envelopeCooldownInput = requireElement<HTMLInputElement>('#envelopeCooldown');
const envelopeRetriggerSelect = requireElement<HTMLSelectElement>('#envelopeRetrigger');
const nodeGraphKindSelect =
  requireElement<HTMLSelectElement>('#nodeGraphKind');
const nodeGraphAddNodeButton =
  requireElement<HTMLButtonElement>('#nodeGraphAddNode');
const nodeGraphNodeSelect =
  requireElement<HTMLSelectElement>('#nodeGraphNode');
const nodeGraphDeleteNodeButton =
  requireElement<HTMLButtonElement>('#nodeGraphDeleteNode');
const nodeGraphEdgeSourceSelect =
  requireElement<HTMLSelectElement>('#nodeGraphEdgeSource');
const nodeGraphEdgeTargetSelect =
  requireElement<HTMLSelectElement>('#nodeGraphEdgeTarget');
const nodeGraphEdgePortSelect =
  requireElement<HTMLSelectElement>('#nodeGraphEdgePort');
const nodeGraphConnectButton =
  requireElement<HTMLButtonElement>('#nodeGraphConnect');
const nodeGraphStatus =
  requireElement<HTMLOutputElement>('#nodeGraphStatus');
const nodeGraphRejectedEdge =
  requireElement<HTMLElement>('#nodeGraphRejectedEdge');
const nodeGraphCount =
  requireElement<HTMLOutputElement>('#nodeGraphCount');
const nodeGraphEdges =
  requireElement<HTMLOListElement>('#nodeGraphEdges');
const nodeProbeStatus =
  requireElement<HTMLOutputElement>('#nodeProbeStatus');
const nodeProbeGrid =
  requireElement<HTMLElement>('#nodeProbeGrid');
const seedInput = requireElement<HTMLInputElement>('#sessionSeed');
const sourceReadout = requireElement<HTMLOutputElement>('#sourceReadout');
const normalizedReadout = requireElement<HTMLOutputElement>('#normalizedReadout');
const conditionedReadout = requireElement<HTMLOutputElement>('#conditionedReadout');
const contributionReadout = requireElement<HTMLOutputElement>('#contributionReadout');
const mappingModeReadout = requireElement<HTMLOutputElement>('#mappingModeReadout');
const probabilityReadout = requireElement<HTMLOutputElement>('#probabilityReadout');
const safetyClampReadout = requireElement<HTMLOutputElement>('#safetyClampReadout');
const baseReadout = requireElement<HTMLOutputElement>('#baseReadout');
const finalReadout = requireElement<HTMLOutputElement>('#finalReadout');
const mappingDebugStatus = requireElement<HTMLOutputElement>('#mappingDebugStatus');
const mappingDebugReason = requireElement<HTMLOutputElement>('#mappingDebugReason');
const targetDebugReason = requireElement<HTMLOutputElement>('#targetDebugReason');
const mappingRuntimeSummary =
  requireElement<HTMLElement>('#mappingRuntimeSummary');
const mappingRuntimeDetails =
  requireElement<HTMLDetailsElement>('#mappingRuntimeDetails');
const mappingRawReasonCodes =
  requireElement<HTMLElement>('#mappingRawReasonCodes');
const mappingRuntimeProvider =
  requireElement<HTMLOutputElement>('#mappingRuntimeProvider');
const mappingRuntimeClock =
  requireElement<HTMLOutputElement>('#mappingRuntimeClock');
const mappingRuntimePipeline =
  requireElement<HTMLOListElement>('#mappingRuntimePipeline');
const energyMeterFill = requireElement<HTMLElement>('#energyMeterFill');
const energyPercent = requireElement<HTMLOutputElement>('#energyPercent');
const energyRaw = requireElement<HTMLOutputElement>('#energyRaw');
const energyActiveTargets = requireElement<HTMLOutputElement>('#energyActiveTargets');
const energyPeak = requireElement<HTMLOutputElement>('#energyPeak');
const energyBudgetEnabledInput =
  requireElement<HTMLInputElement>('#energyBudgetEnabled');
const energyBudgetValueInput =
  requireElement<HTMLInputElement>('#energyBudgetValue');
const eventVoiceLimitInput =
  requireElement<HTMLInputElement>('#eventVoiceLimit');
const globalEventPolicySelect =
  requireElement<HTMLSelectElement>('#globalEventPolicy');
const experimentalQueueEnabledInput =
  requireElement<HTMLInputElement>('#experimentalQueueEnabled');
const energyBudgetStatus =
  requireElement<HTMLOutputElement>('#energyBudgetStatus');
const energyBudgetAttenuation =
  requireElement<HTMLOutputElement>('#energyBudgetAttenuation');
const eventVoiceStatus =
  requireElement<HTMLOutputElement>('#eventVoiceStatus');
const energyWeightTableBody =
  requireElement<HTMLTableSectionElement>('#energyWeightTableBody');
const energyDebugNote = requireElement<HTMLElement>('#energyDebugNote');
const eventLogCount = requireElement<HTMLOutputElement>('#eventLogCount');
const eventLogElement = requireElement<HTMLOListElement>('#eventLog');
const clearEventLogButton = requireElement<HTMLButtonElement>('#clearEventLogButton');
const structureSensitivityInput = requireElement<HTMLInputElement>('#structureSensitivity');
const structureSensitivityValue = requireElement<HTMLOutputElement>('#structureSensitivityValue');
const structureHoldInput = requireElement<HTMLInputElement>('#structureHoldDuration');
const structureHoldValue = requireElement<HTMLOutputElement>('#structureHoldValue');
const structureFallbackSelect = requireElement<HTMLSelectElement>('#structureFallback');
const structureManualSelect = requireElement<HTMLSelectElement>('#structureManualOverride');
const structureModeStatus = requireElement<HTMLOutputElement>('#structureModeStatus');
const structureBoundaryValue = requireElement<HTMLOutputElement>('#structureBoundaryValue');
const structureBoundaryConfidence = requireElement<HTMLOutputElement>('#structureBoundaryConfidence');
const structureBoundaryAvailability = requireElement<HTMLOutputElement>('#structureBoundaryAvailability');
const structureBoundaryCard = requireElement<HTMLElement>('[data-structure-card="boundary"]');
const structureBuildState = requireElement<HTMLOutputElement>('#structureBuildState');
const structureBuildConfidence = requireElement<HTMLOutputElement>('#structureBuildConfidence');
const structureBuildAvailability = requireElement<HTMLOutputElement>('#structureBuildAvailability');
const structureBuildCard = requireElement<HTMLElement>('[data-structure-card="build"]');
const structureDropState = requireElement<HTMLOutputElement>('#structureDropState');
const structureDropEnter = requireElement<HTMLOutputElement>('#structureDropEnter');
const structureDropConfidence = requireElement<HTMLOutputElement>('#structureDropConfidence');
const structureDropAvailability = requireElement<HTMLOutputElement>('#structureDropAvailability');
const structureDropCard = requireElement<HTMLElement>('[data-structure-card="drop"]');
const structureClimaxState = requireElement<HTMLOutputElement>('#structureClimaxState');
const structureClimaxEnter = requireElement<HTMLOutputElement>('#structureClimaxEnter');
const structureClimaxConfidence = requireElement<HTMLOutputElement>('#structureClimaxConfidence');
const structureClimaxAvailability = requireElement<HTMLOutputElement>('#structureClimaxAvailability');
const structureClimaxCard = requireElement<HTMLElement>('[data-structure-card="climax"]');
const visualTableBody = requireElement<HTMLTableSectionElement>('#visualTableBody');
const canvas = requireElement<HTMLCanvasElement>('#phase1Canvas');

const meters = new FeatureMeterController();
const liveInput = new LiveAudioInput(2048);
const mixer = new TargetMixer();
const continuousFeatures = new ContinuousFeatureExtractor();
const eventDetector = new EventFeatureDetector();
const structureDetector = new StructuralSignalDetector();
const debugEventLog = new DebugEventLog(64);
const learnHistory = new FeatureHistoryBuffer(30_000);
const safety = new PhysicalSafetyLimiter();
const uniformTargetRegistry = new GLSLUniformTargetRegistry();

const defaultTargets = (): Record<string, number> => ({
  ...createDefaultVisualValues()
});

const BUILTIN_PRESETS: Readonly<Record<string, Preset>> = Object.freeze({
  ...PRODUCT_BUILTIN_PRESETS,
  buildLab: {
    name: 'Build Retention Lab',
    description: 'Phase 3.1 validation mapping; fully editable.',
    seed: 3131,
    mappings: [{
      id: 'build-energy-to-retention',
      sourceId: 'audio.buildEnergy',
      targetId: VISUAL_TARGETS.feedbackRetention,
      range: [0.74, 0.97],
      curve: 1.15,
      attackMs: 180,
      fallMs: 720,
      threshold: 0.04,
      priority: 45
    }],
    targetDefaults: { id: 'build-lab-targets', values: defaultTargets() }
  },
  structureLab: {
    name: 'Structure Gate Lab',
    description: 'Phase 3.2 heuristic events, persistent states and Gate.',
    seed: 3232,
    mappings: [
      {
        id: 'climax-density-to-saturation',
        sourceId: 'audio.spectralDensity',
        targetId: VISUAL_TARGETS.colorSaturation,
        gateSourceId: 'state.inClimax',
        gateThreshold: 0.5,
        range: [0.8, 1.75],
        attackMs: 80,
        fallMs: 420,
        priority: 45
      },
      {
        id: 'drop-enter-to-collapse',
        kind: 'event',
        sourceId: 'event.dropEnter',
        targetId: VISUAL_TARGETS.dropoutOpacity,
        envelopeId: 'structure-impact-envelope',
        range: [0, 0.9],
        threshold: 0.12,
        priority: 80
      },
      {
        id: 'boundary-to-decay-reset',
        kind: 'event',
        sourceId: 'event.sectionBoundary',
        targetId: VISUAL_TARGETS.feedbackDecay,
        envelopeId: 'structure-impact-envelope',
        range: [0.94, 0.35],
        threshold: 0.12,
        priority: 70
      }
    ],
    envelopes: [{
      id: 'structure-impact-envelope',
      attackMs: 0,
      holdMs: 70,
      decayMs: 180,
      sustain: 0.2,
      releaseMs: 320,
      cooldownMs: 420,
      retriggerMode: 'restart'
    }],
    targetDefaults: { id: 'structure-lab-targets', values: defaultTargets() }
  },
  nodeSourceLab: {
    name: 'Bass + Flux Node Source Lab',
    description:
      'Phase 4.3 validation: editable Bass + Flux Bus drives block spawn.',
    seed: 4343,
    mappings: [{
      id: 'bass-flux-bus-to-block-spawn',
      sourceId: 'node:bass-flux-bus',
      targetId: VISUAL_TARGETS.blockSpawnProbability,
      range: [0.02, 0.92],
      curve: 1.15,
      attackMs: 35,
      fallMs: 260,
      threshold: 0.03,
      priority: 55
    }],
    nodeGraph: {
      nodes: [{
        id: 'bass-flux-bus',
        kind: 'bus',
        label: 'Bass + Flux Bus',
        busMode: 'average'
      }],
      edges: [
        {
          id: 'bass-to-bass-flux-bus',
          sourceId: 'audio.bass',
          targetNodeId: 'bass-flux-bus',
          targetPort: 'input'
        },
        {
          id: 'flux-to-bass-flux-bus',
          sourceId: 'audio.flux',
          targetNodeId: 'bass-flux-bus',
          targetPort: 'input'
        }
      ]
    },
    targetDefaults: {
      id: 'node-source-lab-targets',
      values: defaultTargets()
    }
  },
  modulationLab: {
    name: 'Second-order Modulation Lab',
    description:
      'Phase 4.4: state and LFO sources modulate Mapping parameters.',
    seed: 4444,
    mappings: [
      {
        id: 'bass-peak-to-block-displacement',
        kind: 'event',
        sourceId: 'event.bassPeak',
        targetId: VISUAL_TARGETS.blockDisplacementX,
        envelopeId: 'modulation-impact-envelope',
        amount: 0.35,
        range: [0, 0.82],
        threshold: 0.14,
        priority: 80,
        modulations: [{
          id: 'in-drop-to-impact-amount',
          sourceId: 'state.inDrop',
          targetParameter: 'amount',
          depth: 1.1,
          enabled: true
        }]
      },
      {
        id: 'mid-to-rgb-angle',
        sourceId: 'audio.mid',
        targetId: VISUAL_TARGETS.rgbAngle,
        amount: 0.35,
        range: [-0.7, 0.7],
        attackMs: 45,
        fallMs: 220,
        priority: 45,
        modulations: [{
          id: 'lfo-to-rgb-angle-amount',
          sourceId: 'node:rgb-angle-lfo',
          targetParameter: 'amount',
          depth: 0.8,
          enabled: true
        }]
      }
    ],
    envelopes: [{
      id: 'modulation-impact-envelope',
      attackMs: 0,
      holdMs: 45,
      decayMs: 110,
      sustain: 0.25,
      releaseMs: 220,
      cooldownMs: 260,
      retriggerMode: 'restart'
    }],
    nodeGraph: {
      nodes: [{
        id: 'rgb-angle-lfo',
        kind: 'lfo',
        label: 'RGB Angle LFO',
        lfoWaveform: 'sine',
        frequencyHz: 0.35,
        amplitude: 1,
        offset: 0
      }],
      edges: []
    },
    targetDefaults: {
      id: 'modulation-lab-targets',
      values: defaultTargets()
    }
  }
});

interface VisualRow {
  readonly base: HTMLOutputElement;
  readonly mapped: HTMLOutputElement;
  readonly final: HTMLOutputElement;
}

interface EditorHistoryState {
  readonly preset: Preset;
  readonly selectedMappingId: string;
  readonly soloMappingId: string | null;
  readonly rackEnabled: boolean;
  readonly macroIntensity: number;
  readonly macroResponse: number;
  readonly sessionSeed: number;
}

interface EditorRecoveryState {
  readonly editor: EditorHistoryState;
  readonly snapshots: readonly ResolvedSnapshot[];
}

interface NodeProbeRow {
  readonly value: HTMLOutputElement;
  readonly waveform: SVGPolylineElement;
}

interface PerformanceStageRow {
  readonly element: HTMLElement;
  readonly track: HTMLElement;
  readonly values: HTMLOutputElement;
}

const visualRows = new Map<string, VisualRow>();
const performanceStageRows =
  new Map<PerformanceStageId, PerformanceStageRow>();
const PERFORMANCE_STAGE_LABELS: Readonly<Record<PerformanceStageId, string>> =
  Object.freeze({
    'feature-extraction': 'Feature extraction',
    conditioning: 'Mapping conditioning',
    nodes: 'NodeGraph',
    mixer: 'TargetMixer + Safety',
    'render-setup': 'Render setup',
    'render:builtin-feedback': 'Pass · Built-in feedback',
    'render:custom-glsl': 'Pass · Custom GLSL',
    'render:display': 'Pass · Display'
  });

function allVisualTargetDefinitions(): readonly VisualTargetDefinition[] {
  return Object.freeze([
    ...VISUAL_TARGET_REGISTRY,
    ...uniformTargetRegistry.targetDefinitions()
  ]);
}

function isGlslUniformTarget(
  target: VisualTargetDefinition
): target is GlslUniformTargetDefinition {
  return target.module === 'Custom(GLSL)';
}

let activePreset = loadPreset(BUILTIN_PRESETS.balanced!);
let mappings: MappingCard[] = activePreset.mappings.map(createMappingCard);
let envelopes: EventEnvelope[] = activePreset.envelopes.map(createEventEnvelope);
let energyBudgetConfig: ResolvedEnergyBudgetConfig =
  createEnergyBudgetConfig(activePreset.energyBudget);
let safetyConfig: ResolvedSafetyConfig = createSafetyConfig(activePreset.safety);
let nodeGraph: ResolvedNodeGraph = createNodeGraph(activePreset.nodeGraph);
let shaderPipelineConfig: ResolvedShaderPipelineConfig =
  createShaderPipelineConfig(activePreset.shaderPipeline);
let baseState = createVisualTargetState(activePreset.targetDefaults);
safety.configure(safetyConfig);
let selectedMappingId = mappings[0]?.id ?? '';
let selectedModulationId =
  createMappingCard(mappings[0]).modulations[0]?.id ?? '';
let selectedNodeId = nodeGraph.nodes[0]?.id ?? '';
let mapViewMode: 'card' | 'graph' = 'card';
let soloMappingId: string | null = null;
let rackEnabled = true;
const snapshotStack = new SnapshotStack();
let customPresets: readonly ResolvedPreset[] = [];
let lastEngineTimeMs = 0;
let clockMode: 'idle' | 'offline-deterministic' | 'realtime-microphone' =
  'idle';
let lastFeatureSample = createAudioFeatureFrame();
let lastMixerFrame: TargetMixerFrame | null = null;
let lastSourceValues: MappingSourceValues = {};
let lastTargetState = createVisualTargetState(baseState);
let renderer: MinimalWebglRenderer | null = null;
let stagedShaderLabel = 'Valid sample';
let clock: EngineClock = new FixedStepEngineClock(2048 / 48000 * 1000);
let random: SeededPrng = createSeededPrng(activePreset.seed, 0);
let nodeRandom: SeededPrng = createSeededPrng(
  activePreset.seed ^ 0x4e4f4445,
  0
);
const nodeGraphRuntime = new NodeGraphRuntime();
const visualClockRuntime = new VisualClockRuntime();
const nodeProbeBank = new NodeProbeBank(96);
const nodeProbeRows = new Map<string, NodeProbeRow>();
let animationFrame = 0;
let framebufferPreviewPending = false;
let stopped = true;
const history = new UndoHistory<EditorHistoryState>({
  clone: cloneEditorHistoryState,
  limit: 100
});
const recoveryManager = new AutosaveRecoveryManager<EditorRecoveryState>({
  storage: localStorage,
  parseState: parseEditorRecoveryState,
  cloneState: cloneEditorRecoveryState,
  autosaveIntervalMs: 5000
});
let recoveryStartup: RecoveryStartResult<EditorRecoveryState> | null = null;
const performanceProfiler = new PerformanceProfiler({
  thresholdMs: 16.7,
  windowSize: 120,
  now: () => performance.now()
});
const debugConsoleLogs = new DebugConsoleLogBuffer(200);
const restoreConsoleLogCapture = installConsoleLogCapture(
  console,
  debugConsoleLogs,
  () => lastEngineTimeMs
);
window.addEventListener('beforeunload', restoreConsoleLogCapture, {
  once: true
});
window.addEventListener('error', event => {
  debugConsoleLogs.record(lastEngineTimeMs, 'error', [
    event.message,
    event.error
  ]);
});
window.addEventListener('unhandledrejection', event => {
  debugConsoleLogs.record(lastEngineTimeMs, 'error', [
    'Unhandled promise rejection',
    event.reason
  ]);
});

try {
  renderer = new MinimalWebglRenderer(canvas);
} catch (error) {
  setStatus(error instanceof Error ? error.message : 'WEBGL2 ERROR', 'error');
}
shaderPassSource.value = VALID_SHADER_PASS_SAMPLE;
rawJsonEditor.value = JSON.stringify(activePreset, null, 2);
syncShaderRuntimeFromConfig();
renderPassOrderEditor();
refreshLiveShaderPass();

function setStatus(message: string, state: string): void {
  sourceStatus.textContent = message;
  sourceStatus.dataset.state = state;
}

function refreshLiveShaderPass(): void {
  if (!renderer) {
    shaderLiveLabel.textContent = 'WebGL2 unavailable';
    shaderLiveRevision.value = 'NO LIVE PASS';
    shaderPassStatus.value = 'WEBGL2 UNAVAILABLE';
    shaderPassStatus.dataset.state = 'rejected';
    return;
  }
  const live = renderer.getLiveFragmentPass();
  shaderLiveLabel.textContent = live.label;
  shaderLiveRevision.value = `REVISION ${live.revision}`;
}

function setShaderStageStatus(
  state: 'staged' | 'applied' | 'rejected',
  message: string,
  log: string
): void {
  shaderPassStatus.dataset.state = state;
  shaderPassStatus.value = message;
  shaderLogCard.dataset.state = state;
  shaderCompileLog.textContent = log;
}

function persistedUniformRegistry() {
  return uniformTargetRegistry.list().map(
    registration => ({ ...registration.metadata })
  );
}

function updateShaderUniformConfig(): void {
  shaderPipelineConfig = createShaderPipelineConfig({
    ...shaderPipelineConfig,
    uniformRegistry: persistedUniformRegistry()
  });
}

function syncShaderRuntimeFromConfig(): void {
  uniformTargetRegistry.replaceAll(shaderPipelineConfig.uniformRegistry);
  if (!renderer) return;
  renderer.setPassOrder(shaderPipelineConfig.passOrder);
  renderer.setCustomPassEnabled(shaderPipelineConfig.customPass.enabled);
  const source = shaderPipelineConfig.customPass.source;
  const result = renderer.stageFragmentPass(
    source || PASSTHROUGH_FRAGMENT_SHADER,
    source
      ? shaderPipelineConfig.customPass.label
      : 'Custom GLSL pass · bypass'
  );
  if (!result.applied) {
    throw new Error(`Stored custom pass failed to compile: ${result.log}`);
  }
  if (source) shaderPassSource.value = source;
  refreshLiveShaderPass();
}

function renderPassOrderEditor(): void {
  const labels: Readonly<Record<ShaderPassId, string>> = {
    'builtin-feedback': 'Built-in Feedback',
    'custom-glsl': 'Custom GLSL'
  };
  passOrderStatus.value =
    `${shaderPipelineConfig.passOrder.length} PASSES`;
  passOrderEditor.replaceChildren(...shaderPipelineConfig.passOrder.map(
    (passId, index) => {
      const row = document.createElement('article');
      row.className = 'pass-order-row';
      row.dataset.passId = passId;
      const copy = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = `${index + 1}. ${labels[passId]}`;
      const id = document.createElement('code');
      id.textContent = passId;
      copy.append(title, id);
      const actions = document.createElement('div');
      actions.className = 'pass-order-actions';
      for (const [direction, label] of [[-1, '↑'], [1, '↓']] as const) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.ariaLabel =
          `Move ${labels[passId]} ${direction < 0 ? 'up' : 'down'}`;
        button.disabled =
          (direction < 0 && index === 0) ||
          (direction > 0 &&
            index === shaderPipelineConfig.passOrder.length - 1);
        button.addEventListener('click', () => runDiscrete(
          'Reorder shader passes',
          () => {
            shaderPipelineConfig = createShaderPipelineConfig({
              ...shaderPipelineConfig,
              passOrder: moveShaderPass(
                shaderPipelineConfig.passOrder,
                passId,
                direction
              )
            });
            renderer?.setPassOrder(shaderPipelineConfig.passOrder);
            renderPassOrderEditor();
          }
        ));
        actions.append(button);
      }
      row.append(copy, actions);
      return row;
    }
  ));
}

function captureFramebufferPreview(): void {
  if (!renderer || framebufferPreviewPending) return;
  const state = renderer.getFramebufferPreviewState();
  framebufferPreviewPending = true;
  framebufferPreviewButton.disabled = true;
  void createImageBitmap(canvas, {
    resizeWidth: framebufferPreview.width,
    resizeHeight: framebufferPreview.height,
    resizeQuality: 'low'
  }).then(bitmap => {
    const context = framebufferPreview.getContext('2d');
    if (!context) return;
    context.clearRect(
      0,
      0,
      framebufferPreview.width,
      framebufferPreview.height
    );
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    framebufferPreviewStatus.value =
      `FBO ${state.activeSurfaceIndex + 1}/2 · ` +
      `${state.width}×${state.height} · ` +
      state.passOrder.join(' → ') +
      ` · ENGINE ${lastEngineTimeMs.toFixed(0)} ms`;
  }).catch(error => {
    framebufferPreviewStatus.value =
      error instanceof Error ? error.message : 'PREVIEW UNAVAILABLE';
  }).finally(() => {
    framebufferPreviewPending = false;
    framebufferPreviewButton.disabled = false;
  });
}

function setRawJsonStatus(
  state: 'idle' | 'staged' | 'valid' | 'error' | 'applied',
  message: string,
  log: string
): void {
  rawJsonStatus.dataset.state = state;
  rawJsonStatus.value = message;
  rawJsonLog.textContent = log;
}

function loadLivePresetIntoRawStage(): void {
  rawJsonEditor.value = JSON.stringify(currentPreset(), null, 2);
  setRawJsonStatus(
    'staged',
    'LIVE COPY STAGED',
    'This is an isolated text copy. Live state has not changed.'
  );
}

function validateRawJsonCandidate(): ResolvedPreset | null {
  const staged = stagePresetJson(rawJsonEditor.value);
  if (staged.report) {
    renderPresetValidation(staged.report);
    renderPresetCompatibility(
      buildPresetCompatibilityReport(JSON.parse(rawJsonEditor.value))
    );
  }
  if (!staged.valid || !staged.preset) {
    setRawJsonStatus('error', 'REJECTED', staged.log);
    return null;
  }
  try {
    const source = staged.preset.shaderPipeline.customPass.source;
    const shaderLog = renderer?.validateFragmentPass(source) ??
      'WebGL2 unavailable; schema passed but shader compile was not checked.';
    setRawJsonStatus(
      'valid',
      'VALID · STAGED ONLY',
      `${staged.log}\n${shaderLog}\nLive state remains unchanged.`
    );
    return staged.preset;
  } catch (error) {
    setRawJsonStatus(
      'error',
      'SHADER REJECTED',
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}

function applyRawJsonCandidate(): void {
  const candidate = validateRawJsonCandidate();
  if (!candidate) return;
  runDiscrete('Apply staged Raw JSON', () => {
    snapshotStack.capture({
      name: `${presetNameInput.value || activePreset.name} · pre JSON edit`,
      engineTimeMs: lastEngineTimeMs,
      note: 'Automatic snapshot before Raw JSON apply',
      thumbnail: captureCanvasThumbnail(),
      preset: currentPreset(),
      targetState: lastTargetState
    });
    renderSnapshotStack();
    applyLoadedPreset(candidate);
  });
  rawJsonEditor.value = JSON.stringify(currentPreset(), null, 2);
  setRawJsonStatus(
    'applied',
    'APPLIED · UNDO READY',
    'Validated preset replaced live state. A pre-edit snapshot and one undo transaction were created.'
  );
}

function loadShaderSample(
  source: string,
  label: string
): void {
  shaderPassSource.value = source;
  stagedShaderLabel = label;
  shaderPassFile.value = '';
  setShaderStageStatus(
    'staged',
    'CANDIDATE STAGED',
    `${label} loaded. Live pass is unchanged until compile succeeds.`
  );
}

function applyStagedShaderPass(): void {
  if (!renderer) {
    setShaderStageStatus(
      'rejected',
      'WEBGL2 UNAVAILABLE',
      'Cannot compile a GLSL pass because WebGL2 is unavailable.'
    );
    return;
  }
  const result = renderer.stageFragmentPass(
    shaderPassSource.value,
    stagedShaderLabel
  );
  if (result.applied) {
    shaderPipelineConfig = createShaderPipelineConfig({
      ...shaderPipelineConfig,
      customPass: {
        enabled: true,
        label: result.livePass.label,
        source: result.livePass.source
      }
    });
    renderer.setCustomPassEnabled(true);
  }
  refreshLiveShaderPass();
  setShaderStageStatus(
    result.status,
    result.applied
      ? `APPLIED · REVISION ${result.livePass.revision}`
      : `REJECTED · LIVE REVISION ${result.livePass.revision}`,
    result.log
  );
}

async function stageShaderFile(): Promise<void> {
  const file = shaderPassFile.files?.[0];
  if (!file) return;
  try {
    shaderPassSource.value = await file.text();
    stagedShaderLabel = file.name;
    setShaderStageStatus(
      'staged',
      'FILE STAGED',
      `${file.name} loaded. Compile is pending; live pass is unchanged.`
    );
  } catch (error) {
    setShaderStageStatus(
      'rejected',
      'FILE READ FAILED',
      error instanceof Error ? error.message : String(error)
    );
  }
}

function selectedMapping(): MappingCard | undefined {
  return mappings.find(mapping => mapping.id === selectedMappingId);
}

function localizedSurfaceText(value: string): string {
  return translateSurfaceText(localeController.getLocale(), value);
}

function renderMappingIntent(): void {
  const mapping = selectedMapping();
  const resolved = mapping ? createMappingCard(mapping) : null;
  const nodeId = resolved?.sourceId.startsWith('node:')
    ? resolved.sourceId.slice('node:'.length)
    : '';
  const node = nodeId
    ? nodeGraph.nodes.find(candidate => candidate.id === nodeId)
    : undefined;
  const model = createMappingIntentViewModel({
    mapping,
    envelope: selectedEnvelope(),
    translator: localeController,
    locale: localeController.getLocale(),
    targetDefinitions: allVisualTargetDefinitions(),
    ...(nodeId
      ? {
          nodeSource: {
            nodeId,
            ...(node?.label ? { label: node.label } : {}),
            ...(node?.kind ? { kind: node.kind } : {})
          }
        }
      : {})
  });
  const unavailable = '—';

  mappingIntentStatus.value = localizedSurfaceText(
    !model.available
      ? 'NO MAPPING'
      : model.mapping?.enabled === false
        ? 'BYPASS'
        : 'READY'
  );
  mappingIntentStatus.dataset.state = !model.available
    ? 'empty'
    : model.mapping?.enabled === false
      ? 'bypassed'
      : 'ready';
  mappingIntentSummary.textContent = model.summary;
  mappingIntentDetails.dataset.available = String(model.available);

  if (!model.available || !model.mapping) {
    mappingIntentSource.value = unavailable;
    mappingIntentTarget.value = unavailable;
    mappingIntentOperation.value = unavailable;
    mappingIntentAmount.value = unavailable;
    mappingIntentRange.value = unavailable;
    mappingIntentResponse.value = unavailable;
    mappingIntentConditions.value = unavailable;
    mappingIntentEnvelope.value = unavailable;
    mappingIntentRawIds.textContent = unavailable;
    return;
  }

  mappingIntentSource.value =
    `${model.source?.label ?? unavailable} · ${model.mapping.sourceId}`;
  mappingIntentTarget.value =
    `${model.target?.label ?? unavailable} · ${model.mapping.targetId}`;
  mappingIntentOperation.value =
    `${model.kind?.label ?? unavailable} · ` +
    `${model.operation?.label ?? unavailable}`;
  mappingIntentAmount.value =
    `${model.polarity?.label ?? unavailable} · ${model.amountRole} · ` +
    model.mapping.amount.toFixed(3);
  mappingIntentRange.value =
    `${model.rangeText} · ${model.mapping.threshold.toFixed(3)}`;
  mappingIntentResponse.value = model.responseText;
  mappingIntentConditions.value =
    `${model.gateText} · ${model.probabilityText}`;
  mappingIntentEnvelope.value =
    `${model.envelopeText} · ${model.modulationCount}`;
  mappingIntentRawIds.textContent =
    `mapping=${model.mapping.id || '(empty)'} | ` +
    `source=${model.mapping.sourceId || '(empty)'} | ` +
    `target=${model.mapping.targetId || '(empty)'}`;
}

function renderMappingRuntime(
  mixed: TargetMixerFrame | null,
  finalState: ResolvedVisualTargetState,
  sourceValues: MappingSourceValues,
  frameIndex: number,
  engineTimeMs: number
): void {
  const mapping = selectedMapping();
  const model = createMappingRuntimeViewModel({
    mapping,
    ...(mixed ? { mixerFrame: mixed } : {}),
    finalState,
    sourceValues,
    translator: localeController,
    locale: localeController.getLocale(),
    rackEnabled,
    soloMappingId,
    targetDefinitions: allVisualTargetDefinitions(),
    frameIndex,
    engineTimeMs
  });
  const unavailable = '—';
  const breakdown = model.breakdown;
  const resolved = mapping ? createMappingCard(mapping) : null;

  mappingRuntimeSummary.textContent = model.summary;
  mappingRuntimeDetails.dataset.available = String(model.available);
  mappingRuntimeProvider.value = model.providerText;
  mappingRuntimeClock.value = model.available
    ? `#${model.frameIndex} · ${formatDebugTime(model.engineTimeMs)} · ` +
      `${model.engineTimeMs.toFixed(2)} ms`
    : unavailable;
  mappingRuntimePipeline.replaceChildren(...model.pipeline.map(stage => {
    const item = document.createElement('li');
    item.dataset.changed = String(stage.changedFromPrevious);
    item.dataset.stage = stage.id;
    const label = document.createElement('span');
    label.textContent = stage.label;
    const value = document.createElement('output');
    value.value = stage.value.toFixed(3);
    item.append(label, value);
    return item;
  }));

  if (!model.available || !breakdown || !resolved) {
    sourceReadout.value = unavailable;
    normalizedReadout.value = unavailable;
    conditionedReadout.value = unavailable;
    contributionReadout.value = unavailable;
    mappingModeReadout.value = unavailable;
    probabilityReadout.value = model.probabilityText;
    safetyClampReadout.value = unavailable;
    baseReadout.value = unavailable;
    finalReadout.value = unavailable;
    mappingDebugStatus.value = localizedSurfaceText('NO MAPPING');
    delete mappingDebugStatus.dataset.reason;
    mappingDebugReason.value = model.summary;
    targetDebugReason.value = model.summary;
    mappingRawReasonCodes.textContent = unavailable;
    return;
  }

  sourceReadout.value = breakdown.sourceValue.toFixed(3);
  normalizedReadout.value = breakdown.normalizedValue.toFixed(3);
  conditionedReadout.value = breakdown.conditionedValue.toFixed(3);
  contributionReadout.value = breakdown.contributionValue.toFixed(3);
  mappingModeReadout.value = model.operation?.label ?? resolved.replaceMode;
  probabilityReadout.value = model.probabilityText;
  safetyClampReadout.value = localizedSurfaceText(
    resolved.safetyClamp ? 'TARGET RANGE' : 'FINAL CAP ONLY'
  );
  baseReadout.value = breakdown.baseTargetValue.toFixed(3);
  finalReadout.value = breakdown.finalTargetValue.toFixed(3);
  mappingDebugStatus.value =
    model.mappingStatus?.label ?? breakdown.mappingReason;
  mappingDebugStatus.dataset.reason = breakdown.mappingReason;
  mappingDebugReason.value = breakdown.mappingExplanation;
  targetDebugReason.value = breakdown.targetExplanation;
  mappingRawReasonCodes.textContent =
    `${breakdown.mappingReason} / ${breakdown.targetReason}`;

}

function refreshMappingRuntime(): void {
  renderMappingRuntime(
    lastMixerFrame,
    lastTargetState,
    lastSourceValues,
    lastFeatureSample.frameIndex,
    lastFeatureSample.engineTimeMs
  );
}

function stopLoop(): void {
  stopped = true;
  if (animationFrame) cancelAnimationFrame(animationFrame);
  animationFrame = 0;
}

function macroState(): { intensity: number; response: number } {
  return {
    intensity: Number(macroIntensityInput.value),
    response: Number(macroResponseInput.value)
  };
}

function runtimeMappings(): readonly MappingCard[] {
  return filterMappingsForRuntime(
    applyMappingMacros(mappings, macroState()),
    { rackEnabled, soloMappingId }
  );
}

function updateVisualTable(
  mixed: TargetMixerFrame,
  finalState: ResolvedVisualTargetState
): void {
  for (const target of allVisualTargetDefinitions()) {
    const row = visualRows.get(target.id);
    if (!row) continue;
    row.base.value = Number(
      mixed.trace.base.values[target.id] ?? target.defaultValue
    ).toFixed(3);
    row.mapped.value = Number(
      mixed.trace.replace.values[target.id] ?? target.defaultValue
    ).toFixed(3);
    row.final.value = Number(
      finalState.values[target.id] ?? target.defaultValue
    ).toFixed(3);
  }
}

function formatDebugTime(engineTimeMs: number): string {
  const seconds = Math.max(0, engineTimeMs) / 1000;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds - minutes * 60).toFixed(2).padStart(5, '0')}`;
}

function renderEventLog(): void {
  eventLogElement.replaceChildren();
  const allEntries = debugEventLog.list();
  const entries = [...allEntries].reverse().slice(0, 12);
  eventLogCount.value =
    `${allEntries.length} EVENT${allEntries.length === 1 ? '' : 'S'}`;
  if (entries.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'event-log-empty';
    empty.textContent = 'No events detected yet.';
    eventLogElement.append(empty);
    return;
  }
  for (const entry of entries) {
    const item = document.createElement('li');
    item.dataset.event = entry.type;
    const time = document.createElement('time');
    time.textContent = formatDebugTime(entry.engineTimeMs);
    const label = document.createElement('span');
    label.textContent = {
      onset: 'ONSET',
      bassPeak: 'BASS PEAK',
      sectionBoundary: 'SECTION BOUNDARY',
      dropEnter: 'DROP ENTER',
      climaxEnter: 'CLIMAX ENTER'
    }[entry.type];
    const strength = document.createElement('output');
    strength.value = entry.strength.toFixed(3);
    item.append(time, label, strength);
    eventLogElement.append(item);
  }
}

function structureFallbackMode(): StructureFallbackMode {
  return structureFallbackSelect.value === 'hold-last'
    ? 'hold-last'
    : 'zero';
}

function structureManualOverride(): StructureManualOverride {
  const value = structureManualSelect.value;
  return ['none', 'build', 'drop', 'climax'].includes(value)
    ? value as StructureManualOverride
    : 'auto';
}

function configureStructureDetector(reset = true): void {
  structureDetector.configure({
    sensitivity: Number(structureSensitivityInput.value),
    holdDurationMs: Number(structureHoldInput.value),
    fallbackMode: structureFallbackMode(),
    manualOverride: structureManualOverride()
  });
  structureSensitivityValue.value =
    Number(structureSensitivityInput.value).toFixed(2);
  structureHoldValue.value =
    `${Math.round(Number(structureHoldInput.value))} ms`;
  if (reset) structureDetector.reset();
}

function renderStructurePanel(frame: ResolvedAudioFeatureFrame): void {
  const availability = (
    output: HTMLOutputElement,
    available: boolean
  ): void => {
    output.value = available ? 'READY' : 'WARMING';
    output.dataset.available = String(available);
  };
  const confidence = (
    output: HTMLOutputElement,
    value: number
  ): void => {
    output.value = `${Math.round(value * 100)}%`;
  };
  const state = (
    output: HTMLOutputElement,
    card: HTMLElement,
    active: number
  ): void => {
    const enabled = active >= 0.5;
    output.value = enabled ? 'ACTIVE' : 'IDLE';
    card.dataset.active = String(enabled);
  };

  structureBoundaryValue.value = frame.sectionBoundary.toFixed(3);
  structureBoundaryCard.dataset.active =
    String(frame.sectionBoundary > 0);
  confidence(
    structureBoundaryConfidence,
    frame.sectionBoundaryConfidence
  );
  availability(
    structureBoundaryAvailability,
    frame.sectionBoundaryAvailable
  );
  state(structureBuildState, structureBuildCard, frame.inBuild);
  confidence(structureBuildConfidence, frame.buildConfidence);
  availability(structureBuildAvailability, frame.buildAvailable);
  state(structureDropState, structureDropCard, frame.inDrop);
  structureDropEnter.value = frame.dropEnter.toFixed(3);
  confidence(structureDropConfidence, frame.dropConfidence);
  availability(structureDropAvailability, frame.dropAvailable);
  state(structureClimaxState, structureClimaxCard, frame.inClimax);
  structureClimaxEnter.value = frame.climaxEnter.toFixed(3);
  confidence(structureClimaxConfidence, frame.climaxConfidence);
  availability(structureClimaxAvailability, frame.climaxAvailable);

  if (frame.structureManualOverrideActive) {
    structureModeStatus.value =
      `MANUAL · ${structureManualSelect.value.toUpperCase()}`;
    structureModeStatus.dataset.state = 'manual';
  } else if (frame.structureFallbackActive) {
    structureModeStatus.value =
      `FALLBACK · ${structureFallbackSelect.value.toUpperCase()}`;
    structureModeStatus.dataset.state = 'warming';
  } else {
    structureModeStatus.value = 'AUTO · READY';
    structureModeStatus.dataset.state = 'ready';
  }
}

function refreshEnergyWeightTable(): void {
  energyWeightTableBody.replaceChildren(...allVisualTargetDefinitions().map(target => {
    const semanticLabel = targetSemanticLabel(target);
    const row = document.createElement('tr');
    const moduleCell = document.createElement('td');
    moduleCell.textContent = target.module;
    const targetCell = document.createElement('td');
    targetCell.textContent = isGlslUniformTarget(target)
      ? `${semanticLabel} · ${target.id} · IMPACT ${target.impactWeight.toFixed(2)}`
      : `${semanticLabel} · ${target.id}`;
    const weightCell = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.max = '10';
    input.step = '0.05';
    input.dataset.energyWeightTarget = target.id;
    input.setAttribute('aria-label', `${semanticLabel} energy weight`);
    input.addEventListener('change', () => runDiscrete(
      `Change ${target.label} energy weight`,
      updateEnergyBudgetConfig
    ));
    weightCell.append(input);
    row.append(moduleCell, targetCell, weightCell);
    return row;
  }));
}

function energyWeightInputs(): readonly HTMLInputElement[] {
  return Array.from(
    energyWeightTableBody.querySelectorAll<HTMLInputElement>(
      '[data-energy-weight-target]'
    )
  );
}

function refreshEnergyBudgetControls(): void {
  energyBudgetEnabledInput.checked = energyBudgetConfig.enabled;
  energyBudgetValueInput.value = String(energyBudgetConfig.budget);
  eventVoiceLimitInput.value = String(energyBudgetConfig.eventVoiceLimit);
  globalEventPolicySelect.value = energyBudgetConfig.globalEventPolicy;
  experimentalQueueEnabledInput.checked =
    energyBudgetConfig.experimentalQueueEnabled;
  experimentalQueueEnabledInput.disabled =
    energyBudgetConfig.globalEventPolicy !== 'queue';
  for (const input of energyWeightInputs()) {
    const targetId = input.dataset.energyWeightTarget ?? '';
    input.value = String(energyBudgetConfig.weights[targetId] ?? 1);
  }
}

function updateEnergyBudgetConfig(): void {
  const weights = Object.fromEntries(energyWeightInputs().map(input => [
    input.dataset.energyWeightTarget ?? '',
    Number(input.value)
  ]));
  energyBudgetConfig = createEnergyBudgetConfig({
    enabled: energyBudgetEnabledInput.checked,
    budget: Number(energyBudgetValueInput.value),
    weights,
    eventVoiceLimit: Number(eventVoiceLimitInput.value),
    globalEventPolicy: globalEventPolicySelect.value === 'queue'
      ? 'queue'
      : 'drop-low-priority',
    experimentalQueueEnabled:
      experimentalQueueEnabledInput.checked &&
      globalEventPolicySelect.value === 'queue'
  });
  mixer.reset();
  refreshEnergyBudgetControls();
}

function refreshSafetyControls(): void {
  safetyWhiteoutInput.checked = safetyConfig.whiteoutProtection;
  safetyBlackoutInput.checked = safetyConfig.blackoutProtection;
  safetyFeedbackRunawayInput.checked =
    safetyConfig.feedbackRunawayProtection;
  const report = safety.getLastReport();
  safetyModeStatus.value = `${report.mode} · PHYSICAL CAP`;
  safetyModeStatus.dataset.state = report.mode === 'UNSAFE' ? 'unsafe' : 'safe';
  const active = Object.entries(report.interventions)
    .filter(([, value]) => value)
    .map(([key]) => key.replaceAll(/([A-Z])/g, ' $1').toUpperCase());
  safetyInterventionStatus.value = active.length > 0
    ? `ACTIVE · ${active.join(' / ')}`
    : 'No intervention this frame.';
}

function updateSafetyConfig(): void {
  safetyConfig = createSafetyConfig({
    whiteoutProtection: safetyWhiteoutInput.checked,
    blackoutProtection: safetyBlackoutInput.checked,
    feedbackRunawayProtection: safetyFeedbackRunawayInput.checked
  });
  safety.configure(safetyConfig);
  safety.reset();
  refreshSafetyControls();
}

function nodeKindLabel(kind: NodeKind): string {
  if (kind === 'sample-hold') return 'SAMPLE & HOLD';
  return kind.toUpperCase();
}

function setNodeGraphConnectionState(
  state: 'idle' | 'accepted' | 'rejected',
  message: string
): void {
  nodeGraphRejectedEdge.dataset.state = state;
  nodeGraphRejectedEdge.textContent = message;
  nodeGraphStatus.dataset.state = state === 'rejected' ? 'rejected' : 'ready';
  nodeGraphStatus.value = state === 'rejected' ? 'DAG REJECTED' : 'DAG READY';
}

function mappingSourceOption(
  value: string,
  label: string
): HTMLOptionElement {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
}

function sourceSemanticLabel(sourceId: string): string {
  const nodeId = sourceId.startsWith('node:')
    ? sourceId.slice('node:'.length)
    : '';
  const node = nodeGraph.nodes.find(candidate => candidate.id === nodeId);
  const descriptor = resolveSourceDescriptor(sourceId, localeController, {
    ...(nodeId
      ? {
          node: {
            nodeId,
            ...(node?.label ? { label: node.label } : {}),
            ...(node?.kind ? { kind: node.kind } : {})
          }
        }
      : {})
  });
  return `${descriptor.label} · ${descriptor.id}`;
}

function refreshMappingSourceOptions(selectedSourceId: string): void {
  const options = CORE_MAPPING_SOURCE_IDS.map(sourceId =>
    mappingSourceOption(sourceId, sourceSemanticLabel(sourceId))
  );
  for (const sourceId of nodeOutputSourceIds(nodeGraph)) {
    const nodeId = sourceId.slice('node:'.length);
    const node = nodeGraph.nodes.find(candidate => candidate.id === nodeId);
    options.push(mappingSourceOption(
      sourceId,
      sourceSemanticLabel(sourceId)
    ));
  }
  if (
    selectedSourceId &&
    !options.some(option => option.value === selectedSourceId)
  ) {
    options.push(mappingSourceOption(
      selectedSourceId,
      `MISSING · ${selectedSourceId}`
    ));
  }
  sourceSelect.replaceChildren(...options);
  sourceSelect.value = selectedSourceId;
}

function refreshGateSourceOptions(selectedSourceId: string): void {
  const options = [
    mappingSourceOption('', 'No Gate'),
    ...[
      'state.inBuild',
      'state.inDrop',
      'state.inClimax',
      'confidence.sectionBoundary',
      'confidence.chord',
      'confidence.climax'
    ].map(sourceId => mappingSourceOption(
      sourceId,
      sourceSemanticLabel(sourceId)
    ))
  ];
  for (const sourceId of nodeOutputSourceIds(nodeGraph)) {
    const nodeId = sourceId.slice('node:'.length);
    const node = nodeGraph.nodes.find(candidate => candidate.id === nodeId);
    options.push(mappingSourceOption(
      sourceId,
      sourceSemanticLabel(sourceId)
    ));
  }
  if (
    selectedSourceId &&
    !options.some(option => option.value === selectedSourceId)
  ) {
    options.push(mappingSourceOption(
      selectedSourceId,
      `Missing · ${selectedSourceId}`
    ));
  }
  gateSourceSelect.replaceChildren(...options);
  gateSourceSelect.value = selectedSourceId;
}

function refreshMappingModulationSourceOptions(
  selectedSourceId: string
): void {
  const options = CORE_MAPPING_SOURCE_IDS.map(sourceId =>
    mappingSourceOption(sourceId, sourceSemanticLabel(sourceId))
  );
  for (const sourceId of nodeOutputSourceIds(nodeGraph)) {
    const nodeId = sourceId.slice('node:'.length);
    const node = nodeGraph.nodes.find(candidate => candidate.id === nodeId);
    options.push(mappingSourceOption(
      sourceId,
      sourceSemanticLabel(sourceId)
    ));
  }
  if (
    selectedSourceId &&
    !options.some(option => option.value === selectedSourceId)
  ) {
    options.push(mappingSourceOption(
      selectedSourceId,
      `MISSING · ${selectedSourceId}`
    ));
  }
  mappingModulationSourceSelect.replaceChildren(...options);
  mappingModulationSourceSelect.value = selectedSourceId;
}

function selectedMappingModulation() {
  const mapping = createMappingCard(selectedMapping());
  return mapping.modulations.find(
    modulation => modulation.id === selectedModulationId
  );
}

function refreshMappingModulationEditor(): void {
  const mapping = createMappingCard(selectedMapping());
  if (
    !mapping.modulations.some(
      modulation => modulation.id === selectedModulationId
    )
  ) {
    selectedModulationId = mapping.modulations[0]?.id ?? '';
  }
  mappingModulationSelect.replaceChildren(
    ...mapping.modulations.map(modulation => {
      const option = document.createElement('option');
      option.value = modulation.id;
      option.textContent =
        `${modulation.sourceId} ⇢ ${modulation.targetParameter}`;
      return option;
    })
  );
  mappingModulationSelect.value = selectedModulationId;
  mappingModulationCount.value =
    `${mapping.modulations.length} ` +
    `${mapping.modulations.length === 1 ? 'LINK' : 'LINKS'}`;
  const modulation = selectedMappingModulation();
  refreshMappingModulationSourceOptions(modulation?.sourceId ?? '');
  if (modulation) {
    mappingModulationTargetSelect.value = modulation.targetParameter;
    mappingModulationDepthInput.value = String(modulation.depth);
    mappingModulationEnabledInput.checked = modulation.enabled;
  } else {
    mappingModulationTargetSelect.value = 'amount';
    mappingModulationDepthInput.value = '0';
    mappingModulationEnabledInput.checked = true;
  }
  const hasMapping = mappings.some(
    candidate => candidate.id === selectedMappingId
  );
  const hasModulation = modulation !== undefined;
  addMappingModulationButton.disabled = !hasMapping;
  deleteMappingModulationButton.disabled = !hasModulation;
  mappingModulationSelect.disabled = !hasModulation;
  mappingModulationSourceSelect.disabled = !hasModulation;
  mappingModulationTargetSelect.disabled = !hasModulation;
  mappingModulationDepthInput.disabled = !hasModulation;
  mappingModulationEnabledInput.disabled = !hasModulation;
}

function addSelectedMappingModulation(): void {
  const index = mappings.findIndex(
    mapping => mapping.id === selectedMappingId
  );
  if (index < 0) return;
  const updated = createNextMappingModulation(mappings[index]!, {
    sourceId: 'state.inDrop',
    targetParameter: 'amount',
    depth: 0.5,
    enabled: true
  });
  mappings[index] = updated;
  selectedModulationId = updated.modulations.at(-1)?.id ?? '';
  mixer.reset();
  refreshMappingSelect();
}

function deleteSelectedMappingModulation(): void {
  const index = mappings.findIndex(
    mapping => mapping.id === selectedMappingId
  );
  if (index < 0 || !selectedModulationId) return;
  mappings[index] = deleteMappingModulation(
    mappings[index]!,
    selectedModulationId
  );
  selectedModulationId =
    createMappingCard(mappings[index]).modulations[0]?.id ?? '';
  mixer.reset();
  refreshMappingSelect();
}

function updateSelectedMappingModulation(refreshEditor = true): void {
  const index = mappings.findIndex(
    mapping => mapping.id === selectedMappingId
  );
  if (index < 0 || !selectedModulationId) return;
  const targetParameter =
    mappingModulationTargetSelect.value as MappingModulationTarget;
  mappings[index] = updateMappingModulation(
    mappings[index]!,
    selectedModulationId,
    {
      sourceId: mappingModulationSourceSelect.value,
      targetParameter,
      depth: Number(mappingModulationDepthInput.value),
      enabled: mappingModulationEnabledInput.checked
    }
  );
  mixer.reset();
  if (refreshEditor) refreshMappingSelect();
  else {
    refreshGraphView();
    renderMappingIntent();
  }
}

function renderNodeProbeValues(): void {
  for (const snapshot of nodeProbeBank.snapshots()) {
    const row = nodeProbeRows.get(snapshot.sourceId);
    if (!row) continue;
    row.value.value = snapshot.value.toFixed(4);
    row.waveform.setAttribute(
      'points',
      projectNodeProbeWaveform(snapshot.samples, 120, 32)
    );
  }
}

function refreshNodeProbePanel(): void {
  nodeProbeRows.clear();
  nodeProbeStatus.value = `${nodeGraph.nodes.length} PROBES`;
  if (nodeGraph.nodes.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'node-probe-empty';
    empty.textContent = 'Create a node to expose its output probe.';
    nodeProbeGrid.replaceChildren(empty);
    return;
  }
  const cards = nodeGraph.nodes.map(node => {
    const sourceId = nodeOutputSourceId(node.id);
    const card = document.createElement('article');
    card.className = 'node-probe-card';
    card.dataset.nodeProbeSource = sourceId;
    const title = document.createElement('strong');
    title.textContent = node.label || node.id;
    const output = document.createElement('output');
    output.value = '0.0000';
    const source = document.createElement('small');
    source.textContent = sourceId;
    const waveform = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'svg'
    );
    waveform.classList.add('node-probe-waveform');
    waveform.setAttribute('viewBox', '0 0 120 32');
    waveform.setAttribute('preserveAspectRatio', 'none');
    waveform.setAttribute('aria-label', `${sourceId} live waveform`);
    const polyline = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'polyline'
    );
    waveform.append(polyline);
    card.append(title, output, source, waveform);
    nodeProbeRows.set(sourceId, { value: output, waveform: polyline });
    return card;
  });
  nodeProbeGrid.replaceChildren(...cards);
  renderNodeProbeValues();
}

function refreshNodeGraphPanel(): void {
  if (!nodeGraph.nodes.some(node => node.id === selectedNodeId)) {
    selectedNodeId = nodeGraph.nodes[0]?.id ?? '';
  }
  const previousSource = nodeGraphEdgeSourceSelect.value;
  const previousTarget = nodeGraphEdgeTargetSelect.value;

  nodeGraphNodeSelect.replaceChildren(...nodeGraph.nodes.map(node => {
    const option = document.createElement('option');
    option.value = node.id;
    option.textContent = `${nodeKindLabel(node.kind)} · ${node.id}`;
    return option;
  }));
  nodeGraphNodeSelect.value = selectedNodeId;

  const sourceOptions: HTMLOptionElement[] = [];
  for (const sourceId of CORE_MAPPING_SOURCE_IDS) {
    const option = document.createElement('option');
    option.value = sourceId;
    option.textContent = `SOURCE · ${sourceId}`;
    sourceOptions.push(option);
  }
  for (const node of nodeGraph.nodes) {
    const option = document.createElement('option');
    option.value = node.id;
    option.textContent = `NODE · ${node.id}`;
    sourceOptions.push(option);
  }
  nodeGraphEdgeSourceSelect.replaceChildren(...sourceOptions);
  if (sourceOptions.some(option => option.value === previousSource)) {
    nodeGraphEdgeSourceSelect.value = previousSource;
  }

  nodeGraphEdgeTargetSelect.replaceChildren(...nodeGraph.nodes.map(node => {
    const option = document.createElement('option');
    option.value = node.id;
    option.textContent = `${nodeKindLabel(node.kind)} · ${node.id}`;
    return option;
  }));
  if (nodeGraph.nodes.some(node => node.id === previousTarget)) {
    nodeGraphEdgeTargetSelect.value = previousTarget;
  }

  const hasNodes = nodeGraph.nodes.length > 0;
  nodeGraphDeleteNodeButton.disabled = !hasNodes;
  nodeGraphNodeSelect.disabled = !hasNodes;
  nodeGraphEdgeTargetSelect.disabled = !hasNodes;
  nodeGraphConnectButton.disabled = !hasNodes;
  nodeGraphCount.value =
    `${nodeGraph.nodes.length} nodes · ${nodeGraph.edges.length} edges`;
  const mapping = createMappingCard(selectedMapping());
  refreshMappingSourceOptions(mapping.sourceId);
  refreshGateSourceOptions(mapping.gateSourceId);
  refreshMappingModulationEditor();
  refreshNodeProbePanel();
  refreshGraphView();

  if (nodeGraph.edges.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'node-graph-empty';
    empty.textContent = 'Create nodes, then connect them.';
    nodeGraphEdges.replaceChildren(empty);
    return;
  }
  nodeGraphEdges.replaceChildren(...nodeGraph.edges.map(edge => {
    const item = document.createElement('li');
    const label = document.createElement('span');
    label.textContent =
      `${edge.sourceId} → ${edge.targetNodeId}:${edge.targetPort}`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'danger';
    remove.textContent = 'Disconnect';
    remove.dataset.nodeEdgeId = edge.id;
    remove.addEventListener('click', () => runDiscrete(
      'Disconnect node edge',
      () => {
        nodeGraph = disconnectNodeGraphEdge(nodeGraph, edge.id);
        nodeGraphRuntime.reset();
        nodeProbeBank.reset();
        refreshNodeGraphPanel();
        setNodeGraphConnectionState(
          'idle',
          `Disconnected ${edge.sourceId} → ${edge.targetNodeId}.`
        );
      }
    ));
    item.append(label, remove);
    return item;
  }));
}

function createSelectedNodeKind(): void {
  const kind = nodeGraphKindSelect.value as NodeKind;
  nodeGraph = addNodeGraphNode(nodeGraph, {
    kind,
    label: nodeKindLabel(kind)
  });
  selectedNodeId = nodeGraph.nodes.at(-1)?.id ?? selectedNodeId;
  nodeGraphRuntime.reset();
  nodeProbeBank.reset();
  refreshNodeGraphPanel();
  setNodeGraphConnectionState(
    'idle',
    `Created ${selectedNodeId}.`
  );
}

function deleteSelectedNode(): void {
  if (!selectedNodeId) return;
  const deleting = selectedNodeId;
  nodeGraph = removeNodeGraphNode(nodeGraph, deleting);
  selectedNodeId = nodeGraph.nodes[0]?.id ?? '';
  nodeGraphRuntime.reset();
  nodeProbeBank.reset();
  refreshNodeGraphPanel();
  setNodeGraphConnectionState('idle', `Deleted ${deleting}.`);
}

function connectSelectedNodes(): void {
  const result = connectNodeGraph(nodeGraph, {
    sourceId: nodeGraphEdgeSourceSelect.value,
    targetNodeId: nodeGraphEdgeTargetSelect.value,
    targetPort: nodeGraphEdgePortSelect.value
  });
  if (!result.accepted) {
    const cycle = result.cyclePath?.join(' → ');
    setNodeGraphConnectionState(
      'rejected',
      `${result.edge.sourceId} → ${result.edge.targetNodeId}:` +
      `${result.edge.targetPort} · ${result.rejection}` +
      (cycle ? ` · ${cycle}` : '')
    );
    return;
  }
  nodeGraph = result.graph;
  nodeGraphRuntime.reset();
  nodeProbeBank.reset();
  refreshNodeGraphPanel();
  setNodeGraphConnectionState(
    'accepted',
    `${result.edge.sourceId} → ${result.edge.targetNodeId}:` +
    `${result.edge.targetPort} · CONNECTED`
  );
}

function updateDebugPanel(
  features: ReturnType<typeof createAudioFeatureFrame>,
  mixed: TargetMixerFrame,
  finalState: ResolvedVisualTargetState,
  sourceValues: MappingSourceValues,
  targetDefinitions: readonly VisualTargetDefinition[]
): void {
  renderMappingRuntime(
    mixed,
    finalState,
    sourceValues,
    features.frameIndex,
    features.engineTimeMs
  );

  const energy = measureGlobalEnergyDebug(
    mixed.trace.energyBudget,
    targetDefinitions
  );
  const decision = mixed.energyBudgetDecision;
  const utilization = decision.enabled
    ? Math.max(
        0,
        Math.min(1, decision.finalWeightedEnergy / decision.budget)
      )
    : energy.normalized;
  energyMeterFill.style.transform =
    `scaleX(${utilization.toFixed(6)})`;
  energyPercent.value = decision.enabled
    ? `${Math.round(utilization * 100)}% OF BUDGET`
    : `${Math.round(utilization * 100)}% PASSIVE`;
  energyRaw.value = decision.rawWeightedEnergy.toFixed(3);
  energyActiveTargets.value =
    `${decision.activeTargets} / ${energy.totalTargets}`;
  const peakDefinition = targetDefinitions.find(
    target => target.id === energy.peakTargetId
  );
  energyPeak.value = peakDefinition
    ? `${peakDefinition.label} · ${energy.peakTargetImpact.toFixed(3)}`
    : '—';
  energyBudgetAttenuation.value =
    `${Math.round(decision.attenuation * 100)}%`;
  const eventReport = mixed.eventBudgetReport;
  eventVoiceStatus.value =
    `${eventReport.activeVoices}/${Number.isFinite(eventReport.voiceLimit)
      ? eventReport.voiceLimit
      : '∞'} ACTIVE · ${eventReport.droppedTriggers} DROP · ` +
    `${eventReport.queuedVoices} QUEUE`;
  energyBudgetStatus.value = decision.enabled
    ? decision.attenuation < 1
      ? 'LIMITING'
      : 'ARMED'
    : 'PASSIVE';
  energyBudgetStatus.dataset.state = decision.attenuation < 1
    ? 'limiting'
    : decision.enabled
      ? 'armed'
      : 'passive';
  energyDebugNote.textContent = decision.enabled
    ? `Weighted ${decision.rawWeightedEnergy.toFixed(3)} → ` +
      `${decision.finalWeightedEnergy.toFixed(3)} · ` +
      `${eventReport.effectivePolicy.toUpperCase()}`
    : 'Step 3.4 is passive. Enable the budget to attenuate aggregate output.';

  if (debugEventLog.recordFrame(features).length > 0) {
    renderEventLog();
  }
}

function renderFrame(frame: PcmFrame): void {
  const clockFrame = clock.tick();
  performanceProfiler.beginFrame(clockFrame);
  const features = performanceProfiler.measure(
    'feature-extraction',
    () => {
      const extracted = continuousFeatures.extract(frame, clockFrame);
      const eventFeatures = eventDetector.apply(createAudioFeatureFrame({
        ...extracted,
        frameIndex: clockFrame.frameIndex,
        engineTimeMs: clockFrame.nowMs
      }));
      return structureDetector.apply(eventFeatures, clockFrame);
    }
  );
  meters.render(features);
  renderStructurePanel(features);

  const visualClock = visualClockRuntime.evaluateLegacy(
    features,
    clockFrame,
    activePreset.visualClock
  );
  const primarySources = mergeGeneratorControlSources(
    coreFeatureSourceValues(features),
    visualClock
  );
  const nodeFrame = performanceProfiler.measure(
    'nodes',
    () => nodeGraphRuntime.evaluate(
      nodeGraph,
      primarySources,
      clockFrame,
      () => nodeRandom.nextFloat()
    )
  );
  nodeProbeBank.record(clockFrame, nodeFrame);
  renderNodeProbeValues();
  const sourceValues = mergeNodeOutputSources(primarySources, nodeFrame);
  learnHistory.record(clockFrame.nowMs, sourceValues);
  const targetDefinitions = allVisualTargetDefinitions();
  const mixed = mixer.mixFrame({
    mappings: runtimeMappings(),
    envelopes,
    sourceValues,
    baseState,
    clock: clockFrame,
    randomFloat: () => random.nextFloat(),
    energyBudget: energyBudgetConfig,
    targetDefinitions,
    profiler: performanceProfiler
  });
  const targets = performanceProfiler.measure(
    'mixer',
    () => safety.apply(
      mixed.targets,
      clockFrame,
      targetDefinitions
    )
  );
  refreshSafetyControls();
  lastEngineTimeMs = clockFrame.nowMs;
  lastFeatureSample = createAudioFeatureFrame(features);
  lastMixerFrame = mixed;
  lastSourceValues = { ...sourceValues };
  lastTargetState = createVisualTargetState(targets);
  maybeAutosaveCurrentState();

  renderer?.render(
    targets,
    clockFrame,
    random.nextFloat(),
    uniformTargetRegistry.targetDefinitions(),
    performanceProfiler
  );
  performanceProfiler.endFrame();
  refreshPerformanceProfiler();
  renderUniformBindingStatus();
  updateVisualTable(mixed, targets);
  updateDebugPanel(
    features,
    mixed,
    targets,
    sourceValues,
    targetDefinitions
  );
}

function resetRuntime(nextClock: EngineClock = clock): void {
  clock = nextClock;
  clock.reset();
  framebufferPreviewPending = false;
  mixer.reset();
  continuousFeatures.reset();
  eventDetector.reset();
  structureDetector.reset();
  debugEventLog.clear();
  renderEventLog();
  learnHistory.clear();
  resetLearnPanel();
  nodeGraphRuntime.reset();
  visualClockRuntime.reset('demo-runtime-reset');
  nodeProbeBank.reset();
  refreshNodeProbePanel();
  safety.reset();
  performanceProfiler.reset();
  refreshPerformanceProfiler();
  lastEngineTimeMs = 0;
  lastFeatureSample = createAudioFeatureFrame();
  lastMixerFrame = null;
  lastSourceValues = {};
  lastTargetState = createVisualTargetState(baseState);
  refreshMappingRuntime();
  renderer?.resetFeedback();
  random = createSeededPrng(
    activePreset.seed,
    Number(seedInput.value) || 0
  );
  nodeRandom = createSeededPrng(
    activePreset.seed ^ 0x4e4f4445,
    Number(seedInput.value) || 0
  );
}

function updateRackState(): void {
  fxRackToggle.dataset.enabled = String(rackEnabled);
  fxRackToggle.setAttribute('aria-pressed', String(rackEnabled));
  fxRackToggle.textContent = rackEnabled ? 'FX RACK · ON' : 'FX RACK · BYPASS';
}

function setMapView(mode: 'card' | 'graph'): void {
  mapViewMode = mode;
  const graphActive = mode === 'graph';
  mapCardView.hidden = graphActive;
  mapGraphView.hidden = !graphActive;
  mapCardViewButton.dataset.active = String(!graphActive);
  mapGraphViewButton.dataset.active = String(graphActive);
  mapCardViewButton.setAttribute('aria-pressed', String(!graphActive));
  mapGraphViewButton.setAttribute('aria-pressed', String(graphActive));
  if (graphActive) refreshGraphView();
}

function graphEmpty(message: string): HTMLElement {
  const empty = document.createElement('p');
  empty.className = 'graph-view-empty';
  empty.textContent = message;
  return empty;
}

function graphNode(
  className: string,
  title: string,
  detail: string
): HTMLElement {
  const node = document.createElement('article');
  node.className = `graph-view-node ${className}`;
  const strong = document.createElement('strong');
  strong.textContent = title;
  const small = document.createElement('small');
  small.textContent = detail;
  node.append(strong, small);
  return node;
}

function visualTargetDetail(
  definition: VisualTargetDefinition | undefined,
  targetId: string
): string {
  if (!definition) return `VISUAL · ${targetId}`;
  if (!isGlslUniformTarget(definition)) {
    return `${definition.module} · ${targetId}`;
  }
  return `${definition.module} · ${definition.uniformType.toUpperCase()} · ` +
    `${definition.impactCategory.toUpperCase()} ` +
    `${definition.impactWeight.toFixed(2)} · ${targetId}`;
}

function refreshGraphView(): void {
  const view = projectGraphView(mappings, nodeGraph);
  graphViewStatus.value =
    `${view.mappingNodes.length} MAPPINGS · ` +
    `${view.coreNodes.length} CORE NODES`;

  graphViewSources.replaceChildren(...(
    view.sources.length > 0
      ? view.sources.map(sourceId =>
          graphNode('graph-source-node', sourceId, 'PRIMARY SOURCE')
        )
      : [graphEmpty('No routed sources.')]
  ));

  graphViewTargets.replaceChildren(...(
    view.targets.length > 0
      ? view.targets.map(targetId => {
          const definition = allVisualTargetDefinitions().find(
            target => target.id === targetId
          );
          return graphNode(
            'graph-target-node',
            definition ? targetSemanticLabel(definition) : targetId,
            visualTargetDetail(definition, targetId)
          );
        })
      : [graphEmpty('No routed targets.')]
  ));

  graphViewCoreNodes.replaceChildren(...(
    view.coreNodes.length > 0
      ? view.coreNodes.map(core => {
          const node = graphNode(
            'graph-core-node',
            core.label || core.id,
            `${nodeKindLabel(core.kind)} · ${core.id}`
          );
          const actions = document.createElement('div');
          actions.className = 'graph-node-actions';
          const edit = document.createElement('button');
          edit.type = 'button';
          edit.textContent = 'Edit Card';
          edit.addEventListener('click', () => {
            selectedNodeId = core.id;
            refreshNodeGraphPanel();
            setMapView('card');
          });
          const remove = document.createElement('button');
          remove.type = 'button';
          remove.className = 'danger';
          remove.textContent = 'Delete';
          remove.addEventListener('click', () => runDiscrete(
            'Delete NodeGraph node from Graph View',
            () => {
              nodeGraph = removeNodeGraphNode(nodeGraph, core.id);
              selectedNodeId = nodeGraph.nodes[0]?.id ?? '';
              nodeGraphRuntime.reset();
              nodeProbeBank.reset();
              refreshNodeGraphPanel();
            }
          ));
          actions.append(edit, remove);
          node.append(actions);
          return node;
        })
      : [graphEmpty('No core nodes. Create one in Card View.')]
  ));

  graphViewMappings.replaceChildren(...(
    view.mappingNodes.length > 0
      ? view.mappingNodes.map(mapping => {
          const node = graphNode(
            'graph-mapping-node',
            mapping.id,
            `${mapping.kind.toUpperCase()} · ` +
            `${mapping.replaceMode.toUpperCase()} · ${mapping.activeVariant} · ` +
            `AMOUNT ${mapping.amount.toFixed(2)} · ` +
            `[${mapping.range[0].toFixed(2)}, ${mapping.range[1].toFixed(2)}] · ` +
            `${mapping.modulationCount} MOD`
          );
          node.dataset.mappingId = mapping.id;
          node.dataset.enabled = String(mapping.enabled);
          node.dataset.selected = String(mapping.id === selectedMappingId);
          const route = document.createElement('small');
          route.textContent = `${mapping.sourceId} → ${mapping.targetId}`;
          const actions = document.createElement('div');
          actions.className = 'graph-node-actions';
          const edit = document.createElement('button');
          edit.type = 'button';
          edit.textContent = 'Edit Card';
          edit.addEventListener('click', () => {
            selectedMappingId = mapping.id;
            refreshMappingSelect();
            setMapView('card');
          });
          const bypass = document.createElement('button');
          bypass.type = 'button';
          bypass.textContent = mapping.enabled ? 'Bypass' : 'Enable';
          bypass.addEventListener('click', () => runDiscrete(
            'Toggle mapping bypass from Graph View',
            () => {
              mappings = [...toggleMappingBypass(mappings, mapping.id)];
              mixer.reset();
              refreshMappingSelect();
            }
          ));
          const remove = document.createElement('button');
          remove.type = 'button';
          remove.className = 'danger';
          remove.textContent = 'Delete';
          remove.addEventListener('click', () => runDiscrete(
            'Delete mapping from Graph View',
            () => {
              mappings = [...deleteMapping(mappings, mapping.id)];
              if (soloMappingId === mapping.id) soloMappingId = null;
              selectedMappingId = mappings[0]?.id ?? '';
              mixer.reset();
              refreshMappingSelect();
            }
          ));
          actions.append(edit, bypass, remove);
          node.append(route, actions);
          return node;
        })
      : [graphEmpty('No MappingCards.')]
  ));

  const connectionItems = [
    ...view.edges.map(edge => {
      const item = document.createElement('li');
      item.dataset.linkKind = 'main';
      item.textContent =
        `${edge.sourceId} → ${edge.targetNodeId}:${edge.targetPort}`;
      return item;
    }),
    ...view.mappingLinks.map(link => {
      const item = document.createElement('li');
      item.dataset.linkKind = link.kind;
      item.textContent = link.kind === 'modulation'
        ? `${link.sourceId} ⇢ ${link.mappingId}.${link.targetParameter}`
        : `${link.sourceId} → ${link.mappingId} → ${link.targetId}`;
      return item;
    })
  ];
  if (connectionItems.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'graph-view-empty';
    empty.textContent = 'No signal connections.';
    graphViewEdges.replaceChildren(empty);
  } else {
    graphViewEdges.replaceChildren(...connectionItems);
  }
}

function refreshMappingSelect(): void {
  mappingSelect.replaceChildren(...mappings.map(mapping => {
    const option = document.createElement('option');
    option.value = mapping.id ?? '';
    const states = [
      createMappingCard(mapping).ab.active,
      mapping.enabled === false ? 'BYPASS' : '',
      mapping.id === soloMappingId ? 'SOLO' : ''
    ].filter(Boolean);
    option.textContent =
      `${mapping.sourceId} → ${mapping.targetId}` +
      (states.length ? ` · ${states.join(' / ')}` : '');
    return option;
  }));
  if (!mappings.some(mapping => mapping.id === selectedMappingId)) {
    selectedMappingId = mappings[0]?.id ?? '';
  }
  mappingSelect.value = selectedMappingId;
  refreshMappingEditor();
  refreshGraphView();
}

function refreshMappingEditor(): void {
  const mapping = createMappingCard(selectedMapping());
  refreshMappingSourceOptions(mapping.sourceId);
  refreshGateSourceOptions(mapping.gateSourceId);
  mappingKindSelect.value = mapping.kind;
  refreshTargetOptions(mapping.targetId);
  targetSelect.value = mapping.targetId;
  mappingEnvelopeSelect.value = mapping.envelopeId;
  amountInput.value = String(mapping.amount);
  rangeMinInput.value = String(mapping.range[0]);
  rangeMaxInput.value = String(mapping.range[1]);
  curveInput.value = String(mapping.curve);
  attackInput.value = String(mapping.attackMs);
  fallInput.value = String(mapping.fallMs);
  thresholdInput.value = String(mapping.threshold);
  priorityInput.value = String(mapping.priority);
  polaritySelect.value = mapping.polarity;
  replaceModeSelect.value = mapping.replaceMode;
  probabilityInput.value = String(mapping.probability);
  safetyClampSelect.value = String(mapping.safetyClamp);
  gateThresholdInput.value = String(mapping.gateThreshold);
  envelopePanel.hidden = mapping.kind !== 'event';
  refreshEnvelopeEditor();
  refreshMappingModulationEditor();
  resetLearnPanel('Mapping changed. Analyze a representative passage again.');
  updateOperationButtons();
  renderMappingIntent();
}

function resetLearnPanel(
  message = 'Play a representative passage, then analyze it.'
): void {
  learnStatus.value = 'READY';
  learnStatus.dataset.state = 'idle';
  learnConfidenceFill.style.transform = 'scaleX(0)';
  learnConfidence.value = '—';
  learnThreshold.value = '—';
  learnRange.value = '—';
  learnAttack.value = '—';
  learnFall.value = '—';
  learnMessage.value = message;
  learnCoverage.value = '0.0 s · 0 samples';
}

function renderLearnResult(result: LearnV0Result): void {
  learnCoverage.value =
    `${(result.durationMs / 1000).toFixed(1)} s · ${result.sampleCount} samples`;
  if (!result.ok) {
    learnStatus.value = result.code.replaceAll('_', ' ');
    learnStatus.dataset.state = 'error';
    learnConfidenceFill.style.transform = 'scaleX(0)';
    learnConfidence.value = '0%';
    learnThreshold.value = '—';
    learnRange.value = '—';
    learnAttack.value = '—';
    learnFall.value = '—';
    learnMessage.value = result.message;
    return;
  }

  learnStatus.value = 'SUGGESTION READY';
  learnStatus.dataset.state = 'success';
  learnConfidenceFill.style.transform =
    `scaleX(${result.confidence.toFixed(4)})`;
  learnConfidence.value = `${Math.round(result.confidence * 100)}%`;
  learnThreshold.value = result.suggestion.threshold.toFixed(3);
  learnRange.value =
    `${result.suggestion.range[0].toFixed(3)} → ` +
    result.suggestion.range[1].toFixed(3);
  learnAttack.value = `${result.suggestion.attackMs} ms`;
  learnFall.value = `${result.suggestion.fallMs} ms`;
  learnMessage.value =
    `Observed ${result.sourceId} dynamics ${result.metrics.dynamics.toFixed(3)}.`;
}

function analyzeLearnSegment(): void {
  const mapping = selectedMapping();
  if (!mapping) {
    renderLearnResult({
      ok: false,
      sourceId: '',
      code: 'SOURCE_UNAVAILABLE',
      message: 'Select a MappingCard before running Learn.',
      confidence: 0,
      sampleCount: 0,
      durationMs: 0
    });
    return;
  }
  const target = allVisualTargetDefinitions().find(
    definition => definition.id === mapping.targetId
  );
  const seconds = Math.max(1, Number(learnWindowSeconds.value) || 8);
  renderLearnResult(learnV0({
    sourceId: mapping.sourceId ?? '',
    samples: learnHistory.recent(lastEngineTimeMs, seconds * 1000),
    ...(mapping.range ? {
      rangeAnchor: mapping.range[0],
      rangeDirection: mapping.range[1] >= mapping.range[0] ? 1 : -1
    } : {}),
    ...(target ? {
      target: {
        min: target.min,
        max: target.max,
        defaultValue: target.defaultValue
      }
    } : {})
  }));
}

function updateOperationButtons(): void {
  const mapping = selectedMapping();
  const unavailable = !mapping;
  for (const button of [
    soloMappingButton,
    bypassMappingButton,
    duplicateMappingButton,
    deleteMappingButton,
    mappingVariantAButton,
    mappingVariantBButton,
    learnAnalyzeButton
  ]) {
    button.disabled = unavailable;
  }
  soloMappingButton.dataset.active = String(
    mapping !== undefined && mapping.id === soloMappingId
  );
  soloMappingButton.textContent =
    mapping?.id === soloMappingId ? 'Unsolo' : 'Solo';
  bypassMappingButton.textContent =
    mapping?.enabled === false ? 'Enable' : 'Bypass';
  const activeVariant = createMappingCard(mapping).ab.active;
  mappingVariantAButton.dataset.active = String(
    !unavailable && activeVariant === 'A'
  );
  mappingVariantBButton.dataset.active = String(
    !unavailable && activeVariant === 'B'
  );
  mappingVariantAButton.setAttribute(
    'aria-pressed',
    String(!unavailable && activeVariant === 'A')
  );
  mappingVariantBButton.setAttribute(
    'aria-pressed',
    String(!unavailable && activeVariant === 'B')
  );
  mappingABStatus.value = unavailable
    ? 'NO MAPPING'
    : `${activeVariant} ACTIVE · EDITS STAY IN ${activeVariant}`;
}

function updateSelectedMapping(refreshEditor = true): void {
  const index = mappings.findIndex(mapping => mapping.id === selectedMappingId);
  if (index < 0) return;
  const routed = createMappingCard({
    ...mappings[index],
    kind: mappingKindSelect.value === 'event' ? 'event' : 'continuous',
    sourceId: sourceSelect.value,
    targetId: targetSelect.value,
    envelopeId: mappingEnvelopeSelect.value,
    polarity: polaritySelect.value === 'inverted' ? 'inverted' : 'normal',
    replaceMode: replaceModeSelect.value === 'multiply'
      ? 'multiply'
      : replaceModeSelect.value === 'add'
        ? 'add'
        : replaceModeSelect.value === 'max'
          ? 'max'
          : replaceModeSelect.value === 'min'
            ? 'min'
            : 'replace',
    safetyClamp: safetyClampSelect.value !== 'false',
    probability: Number(probabilityInput.value),
    gateSourceId: gateSourceSelect.value,
    gateThreshold: Number(gateThresholdInput.value)
  });
  mappings[index] = updateMappingABParameters(routed, {
    amount: Number(amountInput.value),
    range: [Number(rangeMinInput.value), Number(rangeMaxInput.value)],
    curve: Number(curveInput.value),
    attackMs: Number(attackInput.value),
    fallMs: Number(fallInput.value),
    threshold: Number(thresholdInput.value),
    priority: Number(priorityInput.value)
  });
  mixer.reset();
  if (refreshEditor) refreshMappingSelect();
  else {
    refreshGraphView();
    renderMappingIntent();
  }
}

function refreshEnvelopeOptions(): void {
  mappingEnvelopeSelect.replaceChildren(...envelopes.map(envelope => {
    const option = document.createElement('option');
    option.value = envelope.id ?? '';
    option.textContent = envelope.id || 'Untitled envelope';
    return option;
  }));
}

function selectedEnvelope(): EventEnvelope | undefined {
  return envelopes.find(envelope => envelope.id === mappingEnvelopeSelect.value);
}

function refreshEnvelopeEditor(): void {
  refreshEnvelopeOptions();
  const mapping = createMappingCard(selectedMapping());
  mappingEnvelopeSelect.value = mapping.envelopeId;
  const envelope = createEventEnvelope(selectedEnvelope());
  envelopeDelayInput.value = String(envelope.delayMs);
  envelopeAttackInput.value = String(envelope.attackMs);
  envelopeHoldInput.value = String(envelope.holdMs);
  envelopeDecayInput.value = String(envelope.decayMs);
  envelopeSustainInput.value = String(envelope.sustain);
  envelopeReleaseInput.value = String(envelope.releaseMs);
  envelopeCooldownInput.value = String(envelope.cooldownMs);
  envelopeRetriggerSelect.value = envelope.retriggerMode;
}

function updateSelectedEnvelope(): void {
  const id = mappingEnvelopeSelect.value;
  const index = envelopes.findIndex(envelope => envelope.id === id);
  if (index < 0) return;
  envelopes[index] = createEventEnvelope({
    ...envelopes[index],
    delayMs: Number(envelopeDelayInput.value),
    attackMs: Number(envelopeAttackInput.value),
    holdMs: Number(envelopeHoldInput.value),
    decayMs: Number(envelopeDecayInput.value),
    sustain: Number(envelopeSustainInput.value),
    releaseMs: Number(envelopeReleaseInput.value),
    cooldownMs: Number(envelopeCooldownInput.value),
    retriggerMode: envelopeRetriggerSelect.value === 'ignore-until-release'
      ? 'ignore-until-release'
      : envelopeRetriggerSelect.value === 'accumulate'
        ? 'accumulate'
        : 'restart'
  });
  mixer.reset();
  renderMappingIntent();
}

function loadBuiltInPreset(id: string): void {
  const input = BUILTIN_PRESETS[id];
  if (!input) return;
  applyLoadedPreset(loadPreset(input));
}

function presetSelectValue(preset: Preset): string {
  const resolved = loadPreset(preset);
  const builtIn = Object.entries(BUILTIN_PRESETS).find(
    ([, candidate]) => candidate.name === resolved.name
  );
  if (builtIn) return builtIn[0];
  if (customPresets.some(candidate => candidate.id === resolved.id)) {
    return `custom:${resolved.id}`;
  }
  return 'saved';
}

function refreshCustomPresetOptions(): void {
  presetSelect.querySelector('[data-custom-preset-group]')?.remove();
  if (customPresets.length === 0) return;
  const group = document.createElement('optgroup');
  group.label = 'Custom Presets';
  group.dataset.customPresetGroup = 'true';
  for (const preset of customPresets) {
    const option = document.createElement('option');
    option.value = `custom:${preset.id}`;
    option.textContent = preset.name;
    option.dataset.customPresetId = preset.id;
    group.append(option);
  }
  presetSelect.append(group);
}

function refreshCustomPresetLibrary(): void {
  customPresets = loadCustomPresetsFromStorage(localStorage);
  refreshCustomPresetOptions();
}

function loadPresetSelection(value: string): void {
  if (value.startsWith('custom:')) {
    const id = value.slice('custom:'.length);
    const preset = customPresets.find(candidate => candidate.id === id);
    if (preset) applyLoadedPreset(preset);
    return;
  }
  loadBuiltInPreset(value);
}

function applyLoadedPreset(preset: Preset): void {
  const compatibility = buildPresetCompatibilityReport(preset);
  const validation = compatibility.validation;
  renderPresetCompatibility(compatibility);
  renderPresetValidation(validation);
  if (!validation.valid || !validation.preset) {
    throw new PresetValidationError(validation);
  }
  const nextShaderPipeline = createShaderPipelineConfig(
    validation.preset.shaderPipeline
  );
  renderer?.validateFragmentPass(
    nextShaderPipeline.customPass.source
  );
  activePreset = validation.preset;
  mappings = activePreset.mappings.map(createMappingCard);
  envelopes = activePreset.envelopes.map(createEventEnvelope);
  energyBudgetConfig = createEnergyBudgetConfig(activePreset.energyBudget);
  safetyConfig = createSafetyConfig(activePreset.safety);
  nodeGraph = createNodeGraph(activePreset.nodeGraph);
  shaderPipelineConfig = nextShaderPipeline;
  safety.configure(safetyConfig);
  baseState = createVisualTargetState(activePreset.targetDefaults);
  lastTargetState = createVisualTargetState(baseState);
  selectedMappingId = mappings[0]?.id ?? '';
  selectedModulationId =
    createMappingCard(mappings[0]).modulations[0]?.id ?? '';
  selectedNodeId = nodeGraph.nodes[0]?.id ?? '';
  soloMappingId = null;
  presetNameInput.value = activePreset.name;
  syncShaderRuntimeFromConfig();
  resetRuntime();
  refreshUniformRegistrySurfaces(selectedMapping()?.targetId ?? '');
  renderPassOrderEditor();
  refreshMappingSelect();
  refreshNodeGraphPanel();
  setNodeGraphConnectionState('idle', 'Preset NodeGraph loaded.');
  refreshEnergyBudgetControls();
  refreshSafetyControls();
}

function currentPreset(): Preset {
  return {
    ...activePreset,
    name: presetNameInput.value.trim() || activePreset.name,
    mappings: mappings.map(createMappingCard),
    envelopes: envelopes.map(createEventEnvelope),
    energyBudget: createEnergyBudgetConfig(energyBudgetConfig),
    safety: createSafetyConfig(safetyConfig),
    nodeGraph: createNodeGraph(nodeGraph),
    shaderPipeline: createShaderPipelineConfig({
      ...shaderPipelineConfig,
      uniformRegistry: persistedUniformRegistry()
    }),
    targetDefaults: createVisualTargetState(baseState)
  };
}

async function captureCanvasPngBytes(): Promise<Uint8Array> {
  const capture = document.createElement('canvas');
  capture.width = Math.max(1, canvas.width);
  capture.height = Math.max(1, canvas.height);
  const context = capture.getContext('2d');
  if (!context) throw new Error('Canvas screenshot context is unavailable.');

  if ('createImageBitmap' in window) {
    const bitmap = await createImageBitmap(canvas);
    context.drawImage(bitmap, 0, 0, capture.width, capture.height);
    bitmap.close();
  } else {
    context.drawImage(canvas, 0, 0, capture.width, capture.height);
  }
  const blob = await new Promise<Blob>((resolve, reject) => {
    capture.toBlob(result => {
      if (result) resolve(result);
      else reject(new Error('Canvas PNG encoding returned no data.'));
    }, 'image/png');
  });
  return new Uint8Array(await blob.arrayBuffer());
}

function debugShaderState(): unknown {
  return {
    config: createShaderPipelineConfig({
      ...shaderPipelineConfig,
      uniformRegistry: persistedUniformRegistry()
    }),
    livePass: renderer?.getLiveFragmentPass() ?? null,
    framebuffer: renderer?.getFramebufferPreviewState() ?? null,
    uniformBindings: uniformTargetRegistry.targetDefinitions().map(
      target => ({
        targetId: target.id,
        uniformName: target.uniformName,
        status: renderer?.getCustomUniformBindingStatus(
          target.uniformName
        ) ?? 'unresolved'
      })
    )
  };
}

function setDebugBundleStatus(
  state: 'idle' | 'working' | 'ready' | 'error',
  message: string,
  summary: string
): void {
  debugBundleStatus.dataset.state = state;
  debugBundleStatus.value = message;
  debugBundleSummary.value = summary;
}

function createPerformanceStageRows(): void {
  performanceStageRows.clear();
  performanceStageList.replaceChildren();
  for (const stageId of PERFORMANCE_STAGE_IDS) {
    const element = document.createElement('div');
    element.className = 'performance-stage-row';
    element.dataset.stage = stageId;
    element.dataset.dominant = 'false';

    const copy = document.createElement('div');
    copy.className = 'performance-stage-copy';
    const label = document.createElement('span');
    label.textContent = 'STAGE';
    const name = document.createElement('strong');
    name.textContent = PERFORMANCE_STAGE_LABELS[stageId];
    copy.append(label, name);

    const track = document.createElement('i');
    const trackShell = document.createElement('div');
    trackShell.className = 'performance-stage-track';
    trackShell.append(track);

    const values = document.createElement('output');
    values.className = 'performance-stage-values';
    values.value = 'AVG 0.00 · PEAK 0.00 · LAST 0.00 ms';

    element.append(copy, trackShell, values);
    performanceStageList.append(element);
    performanceStageRows.set(stageId, { element, track, values });
  }
}

function refreshPerformanceProfiler(): void {
  const snapshot = performanceProfiler.snapshot();
  performanceProfilerEnabled.checked = snapshot.enabled;
  if (document.activeElement !== performanceProfilerThreshold) {
    performanceProfilerThreshold.value = snapshot.thresholdMs.toFixed(1);
  }
  performanceFrameAverage.value =
    `${snapshot.averageFrameMs.toFixed(2)} ms`;
  performanceFramePeak.value = `${snapshot.peakFrameMs.toFixed(2)} ms`;
  performanceOverBudget.value =
    `${snapshot.overBudgetFrames} / ${snapshot.frameCount}`;
  performanceBottleneck.value = snapshot.bottleneckStage
    ? `${PERFORMANCE_STAGE_LABELS[snapshot.bottleneckStage]} · ` +
      `${snapshot.bottleneckAverageMs.toFixed(2)} ms`
    : '—';

  if (!snapshot.enabled) {
    performanceProfilerStatus.dataset.state = 'paused';
    performanceProfilerStatus.value = 'PAUSED';
  } else if (snapshot.bottleneckStage) {
    performanceProfilerStatus.dataset.state = 'bottleneck';
    performanceProfilerStatus.value =
      `${Math.round(snapshot.overBudgetRatio * 100)}% OVER BUDGET`;
  } else {
    performanceProfilerStatus.dataset.state = 'ready';
    performanceProfilerStatus.value = snapshot.frameCount > 0
      ? 'WITHIN BUDGET'
      : 'PROFILING';
  }

  for (const stage of snapshot.stages) {
    const row = performanceStageRows.get(stage.stageId);
    if (!row) continue;
    row.element.dataset.dominant = String(
      stage.stageId === snapshot.bottleneckStage
    );
    row.track.style.transform =
      `scaleX(${Math.min(1, stage.averageMs / snapshot.thresholdMs)})`;
    row.values.value =
      `AVG ${stage.averageMs.toFixed(2)} · ` +
      `PEAK ${stage.peakMs.toFixed(2)} · ` +
      `LAST ${stage.lastMs.toFixed(2)} ms`;
  }
}

function downloadDebugArchive(archive: Uint8Array, filename: string): void {
  const bytes = new Uint8Array(archive);
  const blob = new Blob([bytes.buffer], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  queueMicrotask(() => URL.revokeObjectURL(url));
}

async function exportDebugBundle(): Promise<void> {
  if (debugBundleExportButton.disabled) return;
  debugBundleExportButton.disabled = true;
  setDebugBundleStatus(
    'working',
    'CAPTURING',
    'Freezing the current debug state and encoding PNG.'
  );
  console.info('[DebugBundle] Export requested.', {
    engineTimeMs: lastEngineTimeMs,
    clockMode
  });

  const screenshotPromise = captureCanvasPngBytes();
  const preset = currentPreset();
  const snapshotState = {
    engineTimeMs: lastEngineTimeMs,
    selectedMappingId,
    selectedModulationId,
    selectedNodeId,
    soloMappingId,
    rackEnabled,
    macroIntensity: Number(macroIntensityInput.value),
    macroResponse: Number(macroResponseInput.value),
    performanceProfile: performanceProfiler.snapshot(),
    snapshotStack: snapshotStack.list()
  };
  const mixerFrame = lastMixerFrame;
  const mappingContributions = {
    available: mixerFrame !== null,
    sourceValues: { ...lastSourceValues },
    contributions: mixerFrame?.contributions ?? [],
    gateDecisions: mixerFrame?.gateDecisions ?? [],
    trace: mixerFrame?.trace ?? null
  };
  const energyBudgetState = {
    config: createEnergyBudgetConfig(energyBudgetConfig),
    decision: mixerFrame?.energyBudgetDecision ?? null,
    eventBudgetReport: mixerFrame?.eventBudgetReport ?? null
  };
  const engine = {
    presetSeed: preset.seed ?? activePreset.seed,
    sessionSeed: Number(seedInput.value) || 0,
    clockMode,
    engineTimeMs: lastEngineTimeMs
  };

  try {
    const screenshotPng = await screenshotPromise;
    const bundle = buildDebugBundle({
      preset,
      snapshotState,
      audioFeatureSample: lastFeatureSample,
      mappingContributions,
      targetFinalValues: lastTargetState,
      energyBudgetState,
      safetyLimiterState: safety.getLastReport(),
      shaderPassConfig: debugShaderState(),
      screenshotPng,
      consoleLogs: debugConsoleLogs.list(),
      engine
    });
    const stamp = Math.round(lastEngineTimeMs)
      .toString()
      .padStart(8, '0');
    downloadDebugArchive(
      bundle.archive,
      `glitch-debug-${stamp}ms.zip`
    );
    setDebugBundleStatus(
      'ready',
      'EXPORTED',
      `${bundle.entries.length} files · ` +
      `${Math.ceil(bundle.archive.byteLength / 1024)} KiB · ` +
      `${clockMode.toUpperCase()}`
    );
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : 'Debug bundle export failed.';
    console.error('[DebugBundle] Export failed.', error);
    setDebugBundleStatus('error', 'EXPORT FAILED', message);
  } finally {
    debugBundleExportButton.disabled = false;
  }
}

function cloneEditorHistoryState(
  state: EditorHistoryState
): EditorHistoryState {
  return {
    preset: loadPreset(state.preset),
    selectedMappingId: state.selectedMappingId,
    soloMappingId: state.soloMappingId,
    rackEnabled: state.rackEnabled,
    macroIntensity: state.macroIntensity,
    macroResponse: state.macroResponse,
    sessionSeed: state.sessionSeed
  };
}

function assertRecoveryRecord(
  value: unknown,
  label: string
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function recoveryNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be finite`);
  }
  return value;
}

function parseEditorRecoveryState(input: unknown): EditorRecoveryState {
  const recovery = assertRecoveryRecord(input, 'Recovery state');
  const editor = assertRecoveryRecord(recovery.editor, 'Recovery editor');
  const preset = assertRecoveryRecord(editor.preset, 'Recovery preset');
  if (
    typeof editor.selectedMappingId !== 'string' ||
    !(
      editor.soloMappingId === null ||
      typeof editor.soloMappingId === 'string'
    ) ||
    typeof editor.rackEnabled !== 'boolean'
  ) {
    throw new Error('Recovery editor selection state is invalid');
  }
  if (!Array.isArray(recovery.snapshots)) {
    throw new Error('Recovery snapshots must be an array');
  }

  return cloneEditorRecoveryState({
    editor: {
      preset: loadPreset(preset as Preset),
      selectedMappingId: editor.selectedMappingId,
      soloMappingId: editor.soloMappingId,
      rackEnabled: editor.rackEnabled,
      macroIntensity: recoveryNumber(
        editor.macroIntensity,
        'macroIntensity'
      ),
      macroResponse: recoveryNumber(editor.macroResponse, 'macroResponse'),
      sessionSeed: recoveryNumber(editor.sessionSeed, 'sessionSeed')
    },
    snapshots: recovery.snapshots.map((snapshot, index) => {
      const resolved = createSnapshot(
        assertRecoveryRecord(
          snapshot,
          `Recovery snapshot ${index}`
        ) as Snapshot
      );
      return createSnapshot({
        ...resolved,
        preset: loadPreset(resolved.preset)
      });
    })
  });
}

function cloneEditorRecoveryState(
  state: EditorRecoveryState
): EditorRecoveryState {
  return {
    editor: cloneEditorHistoryState(state.editor),
    snapshots: state.snapshots.map(snapshot => createSnapshot({
      ...snapshot,
      preset: loadPreset(snapshot.preset)
    }))
  };
}

function captureRecoveryState(): EditorRecoveryState {
  return cloneEditorRecoveryState({
    editor: captureHistoryState(),
    snapshots: snapshotStack.list()
  });
}

function applyRecoveryState(state: EditorRecoveryState): void {
  const restored = cloneEditorRecoveryState(state);
  applyHistoryState(restored.editor);
  snapshotStack.replaceAll(restored.snapshots);
  history.clear();
  renderSnapshotStack();
  updateHistoryControls('RECOVERED · HISTORY RESET');
}

function captureHistoryState(): EditorHistoryState {
  return cloneEditorHistoryState({
    preset: currentPreset(),
    selectedMappingId,
    soloMappingId,
    rackEnabled,
    macroIntensity: Number(macroIntensityInput.value),
    macroResponse: Number(macroResponseInput.value),
    sessionSeed: Number(seedInput.value) || 0
  });
}

function applyHistoryState(state: EditorHistoryState): void {
  const restored = cloneEditorHistoryState(state);
  activePreset = loadPreset(restored.preset);
  mappings = activePreset.mappings.map(createMappingCard);
  envelopes = activePreset.envelopes.map(createEventEnvelope);
  energyBudgetConfig = createEnergyBudgetConfig(activePreset.energyBudget);
  safetyConfig = createSafetyConfig(activePreset.safety);
  nodeGraph = createNodeGraph(activePreset.nodeGraph);
  shaderPipelineConfig = createShaderPipelineConfig(
    activePreset.shaderPipeline
  );
  safety.configure(safetyConfig);
  baseState = createVisualTargetState(activePreset.targetDefaults);
  lastTargetState = createVisualTargetState(baseState);
  selectedMappingId = mappings.some(
    mapping => mapping.id === restored.selectedMappingId
  )
    ? restored.selectedMappingId
    : mappings[0]?.id ?? '';
  selectedModulationId =
    createMappingCard(
      mappings.find(mapping => mapping.id === selectedMappingId)
    ).modulations[0]?.id ?? '';
  soloMappingId = mappings.some(mapping => mapping.id === restored.soloMappingId)
    ? restored.soloMappingId
    : null;
  selectedNodeId = nodeGraph.nodes.some(node => node.id === selectedNodeId)
    ? selectedNodeId
    : nodeGraph.nodes[0]?.id ?? '';
  rackEnabled = restored.rackEnabled;
  macroIntensityInput.value = String(restored.macroIntensity);
  macroResponseInput.value = String(restored.macroResponse);
  macroIntensityValue.value = restored.macroIntensity.toFixed(2);
  macroResponseValue.value = restored.macroResponse.toFixed(2);
  seedInput.value = String(restored.sessionSeed);
  presetSelect.value = presetSelectValue(activePreset);
  presetNameInput.value = activePreset.name;
  syncShaderRuntimeFromConfig();
  resetRuntime();
  refreshUniformRegistrySurfaces(selectedMapping()?.targetId ?? '');
  renderPassOrderEditor();
  refreshMappingSelect();
  refreshNodeGraphPanel();
  setNodeGraphConnectionState('idle', 'NodeGraph restored from history.');
  refreshEnergyBudgetControls();
  refreshSafetyControls();
  updateRackState();
  renderPresetCompatibility(
    buildPresetCompatibilityReport(activePreset)
  );
  updateHistoryControls();
}

function updateHistoryControls(message = ''): void {
  undoButton.disabled = !history.canUndo;
  redoButton.disabled = !history.canRedo;
  undoButton.textContent = history.undoLabel
    ? `Undo · ${history.undoLabel}`
    : 'Undo';
  redoButton.textContent = history.redoLabel
    ? `Redo · ${history.redoLabel}`
    : 'Redo';
  historyStatus.textContent = message || (
    history.activeContinuousKey
      ? `EDITING · ${history.activeContinuousKey}`
      : 'HISTORY READY'
  );
}

function commitActiveContinuous(): void {
  const transaction = history.commitContinuous(captureHistoryState());
  updateHistoryControls(
    transaction ? `RECORDED · ${transaction.label}` : ''
  );
  if (transaction) forceAutosaveCurrentState();
}

function beginContinuous(key: string, label: string): void {
  if (
    history.activeContinuousKey &&
    history.activeContinuousKey !== key
  ) {
    commitActiveContinuous();
  }
  history.beginContinuous(
    key,
    label,
    captureHistoryState(),
    lastEngineTimeMs
  );
  updateHistoryControls();
}

function runDiscrete(
  label: string,
  mutate: () => void,
  kind: Exclude<UndoTransactionKind, 'continuous'> = 'discrete'
): void {
  commitActiveContinuous();
  const before = captureHistoryState();
  mutate();
  const transaction = history.recordDiscrete(
    label,
    before,
    captureHistoryState(),
    lastEngineTimeMs,
    kind
  );
  updateHistoryControls(
    transaction ? `RECORDED · ${transaction.label}` : ''
  );
  if (transaction) forceAutosaveCurrentState();
}

function performUndo(): void {
  commitActiveContinuous();
  const result = history.undo();
  if (!result) return;
  applyHistoryState(result.state);
  updateHistoryControls(`UNDO · ${result.transaction.label}`);
  forceAutosaveCurrentState('UNDO AUTOSAVED');
}

function performRedo(): void {
  commitActiveContinuous();
  const result = history.redo();
  if (!result) return;
  applyHistoryState(result.state);
  updateHistoryControls(`REDO · ${result.transaction.label}`);
  forceAutosaveCurrentState('REDO AUTOSAVED');
}

function registerContinuousControl(
  control: HTMLInputElement,
  key: string,
  label: string,
  apply: () => void
): void {
  const begin = (): void => beginContinuous(key, label);
  control.addEventListener('pointerdown', begin);
  control.addEventListener('focus', begin);
  control.addEventListener('input', () => {
    begin();
    apply();
  });
  control.addEventListener('change', () => {
    apply();
    commitActiveContinuous();
  });
  control.addEventListener('blur', commitActiveContinuous);
}

function registerDiscreteControl(
  control: HTMLSelectElement,
  label: string,
  apply: () => void
): void {
  control.addEventListener('change', () => runDiscrete(label, apply));
}

function setPersistenceStatus(message: string, state: string): void {
  persistenceStatus.textContent = message;
  persistenceStatus.dataset.state = state;
}

function createTechnicalDetails(
  summaryText: string,
  rawText: string
): HTMLDetailsElement {
  const details = document.createElement('details');
  details.className = 'technical-details';
  const summary = document.createElement('summary');
  summary.textContent = summaryText;
  const raw = document.createElement('pre');
  raw.dataset.i18nRaw = 'true';
  raw.textContent = rawText;
  details.append(summary, raw);
  return details;
}

function renderPresetValidation(report: PresetValidationReport): void {
  const errorCount = report.issues.filter(
    issue => issue.severity === 'error'
  ).length;
  const warningCount = report.issues.length - errorCount;
  const state = errorCount > 0
    ? 'error'
    : warningCount > 0
      ? 'warning'
      : 'valid';
  presetValidationStatus.dataset.state = state;
  presetValidationStatus.value = errorCount > 0
    ? `INVALID · ${errorCount} ERROR`
    : warningCount > 0
      ? `VALID · ${warningCount} WARNING`
      : 'VALID · NO ISSUES';

  if (report.issues.length === 0) {
    const item = document.createElement('li');
    item.dataset.severity = 'valid';
    item.textContent =
      `Schema ${report.targetSchemaVersion} · all validation checks passed.`;
    presetValidationIssues.replaceChildren(item);
    return;
  }
  presetValidationIssues.replaceChildren(...report.issues.map(issue => {
    const item = document.createElement('li');
    item.dataset.severity = issue.severity;
    const summary = document.createElement('span');
    summary.textContent = issue.severity === 'error'
      ? 'Preset validation error. The live project was not changed.'
      : 'Preset validation warning. Review before saving.';
    item.append(
      summary,
      createTechnicalDetails(
        'Show original code, path and message',
        `${issue.code} · ${issue.path} · ${issue.message}`
      )
    );
    return item;
  }));
}

function renderPresetValidationError(error: unknown): void {
  if (error instanceof PresetValidationError) {
    renderPresetValidation(error.report);
  }
}

function replaceCompatibilityList(
  element: HTMLOListElement,
  entries: readonly {
    readonly text: string;
    readonly state?: 'valid' | 'warning' | 'error' | 'idle';
  }[]
): void {
  element.replaceChildren(...entries.map(entry => {
    const item = document.createElement('li');
    item.dataset.state = entry.state ?? 'valid';
    item.textContent = entry.text;
    return item;
  }));
}

function renderPresetCompatibility(
  report: PresetCompatibilityReport
): void {
  presetCompatibilityStatus.dataset.state = report.status;
  presetCompatibilityStatus.value = report.status.toUpperCase();
  presetCompatibilitySource.value =
    `schema ${report.sourceSchemaVersion ?? 'invalid'} · engine ` +
    `${report.sourceEngineVersion ?? 'unspecified'}`;
  presetCompatibilityTarget.value =
    `schema ${report.targetSchemaVersion} · engine ` +
    `${report.targetEngineVersion}`;
  presetMigrationCount.value = String(report.appliedMigrations.length);
  presetMigratedFieldCount.value = String(report.migratedFields.length);
  presetNonMigratedFieldCount.value =
    String(report.nonMigratedFields.length);

  presetCompatibilitySummary.textContent = report.status === 'incompatible'
    ? 'Preset cannot be loaded. The current live project remains unchanged; ' +
      'every rejected field is named below.'
    : report.status === 'partial'
      ? 'Supported fields can load, but unsupported fields have no migration ' +
        'or runtime behavior. Review the named fields before saving again.'
      : report.status === 'migrated'
        ? 'The old preset has a complete migration path to the current ' +
          'schema. Defaults and preserved fields are listed below.'
        : 'Preset already matches the current schema. No migration is required.';

  replaceCompatibilityList(
    presetMigrationSteps,
    report.appliedMigrations.length > 0
      ? report.appliedMigrations.map(step => ({
          text: `${step.from} → ${step.to} · ${step.label}`,
          state: 'valid' as const
        }))
      : [{
          text: 'Current schema · no migration steps required.',
          state: 'valid'
        }]
  );
  replaceCompatibilityList(
    presetMigratedFields,
    report.migratedFields.length > 0
      ? report.migratedFields.map(field => ({
          text: `${field.path} · ${field.action.toUpperCase()} · ` +
            `${field.description}`,
          state: 'valid' as const
        }))
      : [{
          text: 'No field defaults or transformations were required.',
          state: 'valid'
        }]
  );
  replaceCompatibilityList(
    presetNonMigratedFields,
    report.nonMigratedFields.length > 0
      ? report.nonMigratedFields.map(field => ({
          text: `${field.path} · ${field.reason}`,
          state: report.compatible
            ? 'warning' as const
            : 'error' as const
        }))
      : [{
          text: 'All discovered fields are supported by the current schema.',
          state: 'valid'
        }]
  );
  replaceCompatibilityList(
    presetCompatibilityWarnings,
    report.warnings.length > 0
      ? report.warnings.map(warning => ({
          text: `${warning.path} · ${warning.reason}`,
          state: 'warning' as const
        }))
      : [{
          text: 'No compatibility warnings.',
          state: 'valid'
        }]
  );
}

function formatEngineTimestamp(engineTimeMs: number): string {
  const totalSeconds = Math.max(0, engineTimeMs) / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`;
}

let recoveryEnabled = true;

function showPage(targetPage: string): void {
  for (const page of pages) page.hidden = page.dataset.page !== targetPage;
  for (const button of pageButtons) {
    button.dataset.active = String(
      button.dataset.pageButton === targetPage
    );
  }
}

function setRecoveryStatus(
  state: 'ready' | 'saved' | 'pending' | 'error',
  message: string,
  summary: string
): void {
  recoveryStatus.dataset.state = state;
  recoveryStatus.value = message;
  recoverySummary.textContent = summary;
}

function describeAutosave(
  autosave: RecoveryAutosave<EditorRecoveryState>,
  prefix = 'AUTO SAVED'
): void {
  setRecoveryStatus(
    'saved',
    prefix,
    `${autosave.state.editor.preset.name} · ` +
    `${autosave.state.snapshots.length} snapshots · engine ` +
    `${formatEngineTimestamp(autosave.engineTimeMs)} · recovery point ` +
    `${autosave.autosaveSequence + 1}`
  );
}

function renderRecoveryStartup(
  startup: RecoveryStartResult<EditorRecoveryState>
): void {
  const candidate = startup.candidate;
  recoveryPanel.dataset.recoveryPending = String(candidate !== null);
  recoveryRestoreButton.hidden = candidate === null;
  recoveryDiscardButton.hidden = candidate === null;
  autosaveNowButton.disabled = candidate !== null;

  if (candidate) {
    setRecoveryStatus(
      'pending',
      'RECOVERY AVAILABLE',
      `Session ${candidate.sessionSequence} ended unexpectedly. ` +
      `${candidate.state.editor.preset.name} was saved at engine ` +
      `${formatEngineTimestamp(candidate.engineTimeMs)} with ` +
      `${candidate.state.snapshots.length} snapshots. Restore or discard ` +
      `before new autosaves can replace it.`
    );
    showPage('advanced');
  } else if (startup.warning) {
    setRecoveryStatus(
      'error',
      'OLD SAVE IGNORED',
      `${startup.warning} Current session ${startup.sessionSequence} can ` +
      `continue with a fresh recovery point.`
    );
  } else {
    setRecoveryStatus(
      'ready',
      'AUTOSAVE READY',
      `Session ${startup.sessionSequence} is protected. Edits save at ` +
      `transaction boundaries and every 5.0 engine seconds.`
    );
  }
}

function forceAutosaveCurrentState(prefix = 'AUTO SAVED'): void {
  if (!recoveryEnabled || recoveryStartup === null) return;
  try {
    const autosave = recoveryManager.forceAutosave(
      captureRecoveryState(),
      lastEngineTimeMs
    );
    if (autosave) describeAutosave(autosave, prefix);
  } catch (error) {
    recoveryEnabled = false;
    autosaveNowButton.disabled = true;
    setRecoveryStatus(
      'error',
      'AUTOSAVE FAILED',
      error instanceof Error ? error.message : 'Recovery storage failed.'
    );
  }
}

function maybeAutosaveCurrentState(): void {
  if (!recoveryEnabled || recoveryStartup === null) return;
  try {
    if (!recoveryManager.shouldAutosave(lastEngineTimeMs)) return;
    const autosave = recoveryManager.forceAutosave(
      captureRecoveryState(),
      lastEngineTimeMs
    );
    if (autosave) describeAutosave(autosave);
  } catch (error) {
    recoveryEnabled = false;
    autosaveNowButton.disabled = true;
    setRecoveryStatus(
      'error',
      'AUTOSAVE FAILED',
      error instanceof Error ? error.message : 'Recovery storage failed.'
    );
  }
}

function initializeRecovery(): void {
  try {
    recoveryStartup = recoveryManager.startSession();
    renderRecoveryStartup(recoveryStartup);
    if (!recoveryStartup.candidate) {
      forceAutosaveCurrentState(
        recoveryStartup.warning ? 'FRESH AUTOSAVE' : 'INITIAL AUTOSAVE'
      );
    }
  } catch (error) {
    recoveryEnabled = false;
    autosaveNowButton.disabled = true;
    setRecoveryStatus(
      'error',
      'RECOVERY UNAVAILABLE',
      error instanceof Error ? error.message : 'Recovery startup failed.'
    );
  }
}

function restoreRecoveryCandidate(): void {
  if (!recoveryEnabled) return;
  try {
    const restored = recoveryManager.recoverCandidate();
    if (!restored) return;
    applyRecoveryState(restored);
    recoveryStartup = Object.freeze({
      sessionSequence: recoveryStartup?.sessionSequence ?? 0,
      candidate: null,
      warning: null
    });
    recoveryPanel.dataset.recoveryPending = 'false';
    recoveryRestoreButton.hidden = true;
    recoveryDiscardButton.hidden = true;
    autosaveNowButton.disabled = false;
    forceAutosaveCurrentState('RECOVERED + SAVED');
  } catch (error) {
    setRecoveryStatus(
      'error',
      'RESTORE FAILED',
      error instanceof Error ? error.message : 'Recovery restore failed.'
    );
  }
}

function discardRecoveryCandidate(): void {
  if (!recoveryEnabled || !recoveryManager.discardCandidate()) return;
  recoveryStartup = Object.freeze({
    sessionSequence: recoveryStartup?.sessionSequence ?? 0,
    candidate: null,
    warning: null
  });
  recoveryPanel.dataset.recoveryPending = 'false';
  recoveryRestoreButton.hidden = true;
  recoveryDiscardButton.hidden = true;
  autosaveNowButton.disabled = false;
  forceAutosaveCurrentState('FRESH AUTOSAVE');
}

function captureCanvasThumbnail(): string {
  try {
    return canvas.toDataURL('image/webp', 0.62);
  } catch {
    return '';
  }
}

function renderSnapshotStack(): void {
  snapshotStackElement.replaceChildren();
  const snapshots = [...snapshotStack.list()].reverse();
  snapshotCount.value = `${snapshots.length} snapshot${snapshots.length === 1 ? '' : 's'}`;
  restoreSnapshotButton.disabled = snapshots.length === 0;
  if (snapshots.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'snapshot-empty';
    empty.textContent = 'Capture a state to begin comparing.';
    snapshotStackElement.append(empty);
    return;
  }
  for (const snapshot of snapshots) {
    const card = document.createElement('article');
    card.className = 'snapshot-card';
    card.dataset.snapshotId = snapshot.id;

    if (snapshot.thumbnail) {
      const image = document.createElement('img');
      image.src = snapshot.thumbnail;
      image.alt = `${snapshot.name} thumbnail`;
      card.append(image);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'snapshot-thumb-placeholder';
      placeholder.textContent = 'NO THUMBNAIL';
      card.append(placeholder);
    }

    const body = document.createElement('div');
    body.className = 'snapshot-body';
    const title = document.createElement('div');
    title.className = 'snapshot-title';
    const strong = document.createElement('strong');
    strong.textContent = snapshot.name;
    const time = document.createElement('time');
    time.textContent = formatEngineTimestamp(snapshot.engineTimeMs);
    title.append(strong, time);

    const note = document.createElement('p');
    note.textContent = snapshot.note || 'No note';

    const actions = document.createElement('div');
    actions.className = 'snapshot-actions';
    for (const [action, label] of [
      ['restore', 'Restore'],
      ['promote', 'Promote'],
      ['delete', 'Delete']
    ] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.snapshotAction = action;
      button.dataset.snapshotId = snapshot.id;
      button.textContent = label;
      actions.append(button);
    }
    body.append(title, note, actions);
    card.append(body);
    snapshotStackElement.append(card);
  }
}

function captureCurrentSnapshot(): void {
  const snapshot = snapshotStack.capture({
    name: `${presetNameInput.value || activePreset.name} snapshot`,
    engineTimeMs: lastEngineTimeMs,
    note: snapshotNoteInput.value.trim(),
    thumbnail: captureCanvasThumbnail(),
    preset: currentPreset(),
    targetState: lastTargetState
  });
  snapshotNoteInput.value = '';
  renderSnapshotStack();
  setPersistenceStatus(`CAPTURED · ${snapshot.id}`, 'ok');
  forceAutosaveCurrentState('SNAPSHOT AUTOSAVED');
}

function restoreSnapshotById(id: string): void {
  const restored = snapshotStack.restore(id);
  applyLoadedPreset({
    ...restored.preset,
    targetDefaults: restored.targetState
  });
  setPersistenceStatus(`RESTORED · ${restored.id}`, 'ok');
}

function restoreCurrentSnapshot(): void {
  const latest = snapshotStack.latest();
  if (latest) restoreSnapshotById(latest.id);
}

function deleteSnapshotById(id: string): void {
  if (!snapshotStack.delete(id)) return;
  renderSnapshotStack();
  setPersistenceStatus(`DELETED · ${id}`, 'ok');
  forceAutosaveCurrentState('SNAPSHOT AUTOSAVED');
}

function promoteSnapshotById(id: string): void {
  const promoted = snapshotStack.promoteToPreset(id, {
    id: `custom-${id}`
  });
  const saved = saveCustomPresetToStorage(localStorage, promoted);
  refreshCustomPresetLibrary();
  setPersistenceStatus(`PROMOTED · ${saved.name}`, 'ok');
}

function saveCurrentPreset(): void {
  try {
    const preset = currentPreset();
    const compatibility = buildPresetCompatibilityReport(preset);
    const validation = compatibility.validation;
    renderPresetCompatibility(compatibility);
    renderPresetValidation(validation);
    if (!validation.valid || !validation.preset) {
      throw new PresetValidationError(validation);
    }
    activePreset = savePresetToStorage(localStorage, validation.preset);
    setPersistenceStatus('PRESET SAVED', 'ok');
  } catch (error) {
    renderPresetValidationError(error);
    setPersistenceStatus(
      error instanceof Error ? error.message : 'PRESET SAVE FAILED',
      'error'
    );
  }
}

function loadStoredPreset(): void {
  try {
    const loaded = loadPresetInputFromStorage(localStorage);
    applyLoadedPreset(loaded);
    presetSelect.value = 'saved';
    setPersistenceStatus('PRESET LOADED', 'ok');
  } catch (error) {
    renderPresetValidationError(error);
    setPersistenceStatus(
      error instanceof Error ? error.message : 'PRESET LOAD FAILED',
      'error'
    );
  }
}

async function stopAll(): Promise<void> {
  stopLoop();
  await liveInput.stop();
  clockMode = 'idle';
  debugBundleClockMode.textContent = 'IDLE';
  setStatus('IDLE', 'idle');
}

function startOffline(): void {
  void liveInput.stop();
  stopLoop();
  const buffer = createStructuralSignalValidationBuffer();
  const playback = new OfflineDeterministicPlayback(buffer, 2048);
  resetRuntime(new FixedStepEngineClock(2048 / buffer.sampleRate * 1000));
  clockMode = 'offline-deterministic';
  debugBundleClockMode.textContent = 'OFFLINE DETERMINISTIC';
  stopped = false;
  setStatus('OFFLINE DETERMINISTIC', 'offline');

  const step = (): void => {
    if (stopped) return;
    const frame = playback.nextFrame();
    if (!frame) {
      playback.reset();
      animationFrame = requestAnimationFrame(step);
      return;
    }
    renderFrame(frame);
    animationFrame = requestAnimationFrame(step);
  };
  step();
}

async function startMicrophone(): Promise<void> {
  stopLoop();
  try {
    await liveInput.start();
    resetRuntime(new RealtimeEngineClock(() => performance.now()));
    clockMode = 'realtime-microphone';
    debugBundleClockMode.textContent = 'REALTIME MICROPHONE';
    stopped = false;
    setStatus('LIVE MICROPHONE', 'live');
    const step = (): void => {
      if (stopped) return;
      const frame = liveInput.readFrame();
      if (frame) renderFrame(frame);
      animationFrame = requestAnimationFrame(step);
    };
    step();
  } catch (error) {
    setStatus(
      error instanceof Error ? error.message : 'MICROPHONE ERROR',
      'error'
    );
  }
}

function targetOptionLabel(target: VisualTargetDefinition): string {
  const semanticLabel = targetSemanticLabel(target);
  if (!isGlslUniformTarget(target)) return `${semanticLabel} · ${target.id}`;
  return `${semanticLabel} · ${target.id} · ${target.uniformType} · ` +
    `${target.impactCategory} ${target.impactWeight.toFixed(2)}`;
}

function targetSemanticLabel(target: VisualTargetDefinition): string {
  return resolveTargetDescriptor(target.id, localeController, {
    extensionDefinitions: allVisualTargetDefinitions()
  }).label;
}

function refreshTargetOptions(
  selectedTargetId = targetSelect.value
): void {
  targetSelect.replaceChildren();
  const groups = new Map<string, HTMLOptGroupElement>();
  const targets = allVisualTargetDefinitions();
  for (const target of targets) {
    let group = groups.get(target.module);
    if (!group) {
      group = document.createElement('optgroup');
      group.label = target.module;
      groups.set(target.module, group);
      targetSelect.append(group);
    }
    const option = document.createElement('option');
    option.value = target.id;
    option.textContent = targetOptionLabel(target);
    group.append(option);
  }
  if (
    selectedTargetId &&
    !targets.some(target => target.id === selectedTargetId)
  ) {
    const missingGroup = document.createElement('optgroup');
    missingGroup.label = 'Missing Target';
    const missing = document.createElement('option');
    missing.value = selectedTargetId;
    missing.textContent = `${selectedTargetId} · UNREGISTERED`;
    missingGroup.append(missing);
    targetSelect.append(missingGroup);
  }
  targetSelect.value = selectedTargetId;
}

function refreshVisualTableTargets(): void {
  visualRows.clear();
  visualTableBody.replaceChildren();
  for (const target of allVisualTargetDefinitions()) {
    const row = document.createElement('tr');
    const name = document.createElement('th');
    name.scope = 'row';
    name.textContent = isGlslUniformTarget(target)
      ? `${target.module} · ${targetSemanticLabel(target)} · ${target.id} · ` +
        `${target.impactCategory.toUpperCase()} ` +
        target.impactWeight.toFixed(2)
      : `${target.module} · ${targetSemanticLabel(target)} · ${target.id}`;
    const base = document.createElement('output');
    const mapped = document.createElement('output');
    const final = document.createElement('output');
    for (const output of [base, mapped, final]) {
      const cell = document.createElement('td');
      cell.append(output);
      row.append(cell);
    }
    row.prepend(name);
    visualTableBody.append(row);
    visualRows.set(target.id, { base, mapped, final });
  }
}

function selectedImpactCategory(): GlslImpactCategory {
  const category = uniformImpactCategorySelect.value;
  return category === 'high' || category === 'low' ? category : 'medium';
}

function readUniformMetadata(): GlslUniformMetadata {
  return {
    name: uniformNameInput.value,
    type: uniformTypeSelect.value === 'int'
      ? 'int'
      : uniformTypeSelect.value === 'bool'
        ? 'bool'
        : 'float',
    label: uniformLabelInput.value,
    range: [
      Number(uniformRangeMinInput.value),
      Number(uniformRangeMaxInput.value)
    ],
    default: Number(uniformDefaultInput.value),
    impactCategory: selectedImpactCategory(),
    impactWeight: Number(uniformImpactWeightInput.value)
  };
}

function setUniformRegistryMessage(
  message: string,
  state: 'idle' | 'ready' | 'warning' | 'error'
): void {
  uniformRegistryMessage.value = message;
  uniformRegistryMessage.dataset.state = state;
}

function uniformMetadataItem(label: string, value: string): HTMLElement {
  const item = document.createElement('div');
  const term = document.createElement('dt');
  term.textContent = label;
  const detail = document.createElement('dd');
  detail.textContent = value;
  item.append(term, detail);
  return item;
}

function renderUniformBindingStatus(): void {
  const outputs = Array.from(
    uniformRegistryList.querySelectorAll<HTMLOutputElement>(
      '[data-uniform-binding]'
    )
  );
  for (const output of outputs) {
    const name = output.dataset.uniformBinding ?? '';
    const status = renderer?.getCustomUniformBindingStatus(name) ??
      'unresolved';
    output.dataset.state = status;
    output.value = {
      bound: 'GLSL BOUND',
      inactive: 'NOT IN LIVE SHADER',
      unresolved: 'WAITING FOR FRAME'
    }[status];
  }
}

function refreshUniformRegistry(): void {
  const registrations = uniformTargetRegistry.list();
  uniformRegistryStatus.value =
    `${registrations.length} TARGET${registrations.length === 1 ? '' : 'S'}`;
  uniformRegistryStatus.dataset.state =
    registrations.some(entry => entry.warnings.length > 0)
      ? 'warning'
      : registrations.length > 0
        ? 'ready'
        : 'idle';

  uniformRegistryList.replaceChildren(...registrations.map(registration => {
    const card = document.createElement('article');
    card.className = 'uniform-target-card';
    card.dataset.warning = String(registration.warnings.length > 0);

    const header = document.createElement('header');
    const title = document.createElement('div');
    const label = document.createElement('strong');
    label.textContent = registration.metadata.label;
    const targetId = document.createElement('code');
    targetId.textContent = registration.target.id;
    title.append(label, targetId);
    const actions = document.createElement('div');
    actions.className = 'uniform-target-actions';
    const binding = document.createElement('output');
    binding.className = 'uniform-binding-status';
    binding.dataset.uniformBinding = registration.metadata.name;
    binding.dataset.state = 'unresolved';
    binding.value = 'WAITING FOR FRAME';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'danger';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      runDiscrete('Remove GLSL uniform', () => {
        uniformTargetRegistry.remove(registration.metadata.name);
        updateShaderUniformConfig();
        refreshUniformRegistrySurfaces(
          selectedMapping()?.targetId ?? registration.target.id
        );
        setUniformRegistryMessage(
          `${registration.metadata.name} removed from the preset registry.`,
          'idle'
        );
      });
    });
    actions.append(binding, remove);
    header.append(title, actions);

    const metadata = document.createElement('dl');
    metadata.className = 'uniform-target-metadata';
    metadata.append(
      uniformMetadataItem('TYPE', registration.metadata.type),
      uniformMetadataItem(
        'RANGE',
        `${registration.metadata.range[0]} → ${registration.metadata.range[1]}`
      ),
      uniformMetadataItem(
        'DEFAULT',
        String(registration.metadata.default)
      ),
      uniformMetadataItem(
        'IMPACT',
        `${registration.metadata.impactCategory.toUpperCase()} · ` +
          registration.metadata.impactWeight.toFixed(2)
      )
    );
    card.append(header, metadata);

    for (const warning of registration.warnings) {
      const warningElement = document.createElement('p');
      warningElement.className = 'uniform-target-warning';
      warningElement.textContent = warning.message;
      card.append(warningElement);
    }
    return card;
  }));
  renderUniformBindingStatus();
}

function refreshUniformRegistrySurfaces(
  selectedTargetId = targetSelect.value
): void {
  refreshUniformRegistry();
  refreshTargetOptions(selectedTargetId);
  refreshVisualTableTargets();
  refreshEnergyWeightTable();
  refreshEnergyBudgetControls();
  mixer.reset();
  safety.reset();
  refreshGraphView();
}

function declareUniformTarget(): void {
  try {
    const input = readUniformMetadata();
    const name = input.name?.trim() ?? '';
    const existing = uniformTargetRegistry.get(name);
    const registration = existing
      ? uniformTargetRegistry.replace(name, input)
      : uniformTargetRegistry.register(input);
    updateShaderUniformConfig();
    refreshUniformRegistrySurfaces(
      selectedMapping()?.targetId ?? registration.target.id
    );
    const warning = registration.warnings[0];
    setUniformRegistryMessage(
      warning?.message ??
        `${registration.target.id} registered as a mappable target.`,
      warning ? 'warning' : 'ready'
    );
  } catch (error) {
    setUniformRegistryMessage(
      error instanceof Error ? error.message : String(error),
      'error'
    );
  }
}

function applyUniformTypeDefaults(): void {
  const type = uniformTypeSelect.value;
  const integer = type === 'int' || type === 'bool';
  for (const input of [
    uniformRangeMinInput,
    uniformRangeMaxInput,
    uniformDefaultInput
  ]) {
    input.step = integer ? '1' : '0.01';
  }
  if (type === 'bool') {
    uniformRangeMinInput.value = '0';
    uniformRangeMaxInput.value = '1';
    uniformDefaultInput.value = '0';
  }
}

shaderPassFile.addEventListener('change', () => {
  void stageShaderFile();
});
shaderValidSampleButton.addEventListener('click', () => {
  loadShaderSample(VALID_SHADER_PASS_SAMPLE, 'Valid sample');
});
shaderBrokenSampleButton.addEventListener('click', () => {
  loadShaderSample(BROKEN_SHADER_PASS_SAMPLE, 'Broken sample');
});
shaderApplyButton.addEventListener('click', () => runDiscrete(
  'Apply GLSL pass',
  applyStagedShaderPass
));
uniformDeclareButton.addEventListener('click', () => runDiscrete(
  'Declare GLSL uniform',
  declareUniformTarget
));
uniformTypeSelect.addEventListener('change', applyUniformTypeDefaults);
uniformImpactCategorySelect.addEventListener('change', () => {
  uniformImpactWeightInput.value = String(
    GLSL_IMPACT_CATEGORY_DEFAULTS[selectedImpactCategory()].weight
  );
});
rawJsonLoadButton.addEventListener('click', loadLivePresetIntoRawStage);
rawJsonValidateButton.addEventListener('click', validateRawJsonCandidate);
rawJsonApplyButton.addEventListener('click', applyRawJsonCandidate);
debugBundleExportButton.addEventListener('click', () => {
  void exportDebugBundle();
});
performanceProfilerEnabled.addEventListener('change', () => {
  performanceProfiler.setEnabled(performanceProfilerEnabled.checked);
  performanceProfiler.reset();
  refreshPerformanceProfiler();
});
performanceProfilerThreshold.addEventListener('change', () => {
  const threshold = Number(performanceProfilerThreshold.value);
  try {
    performanceProfiler.setThresholdMs(threshold);
    performanceProfiler.reset();
  } catch {
    performanceProfilerThreshold.value =
      performanceProfiler.thresholdMs.toFixed(1);
  }
  refreshPerformanceProfiler();
});
performanceProfilerReset.addEventListener('click', () => {
  performanceProfiler.reset();
  refreshPerformanceProfiler();
});
recoveryRestoreButton.addEventListener('click', restoreRecoveryCandidate);
recoveryDiscardButton.addEventListener('click', discardRecoveryCandidate);
autosaveNowButton.addEventListener('click', () => {
  forceAutosaveCurrentState('MANUAL AUTOSAVE');
});
framebufferPreviewButton.addEventListener(
  'click',
  captureFramebufferPreview
);
rawJsonEditor.addEventListener('input', () => {
  setRawJsonStatus(
    'staged',
    'EDITING STAGED COPY',
    'Changes are isolated. Validate before applying to live state.'
  );
});

for (const button of pageButtons) {
  button.addEventListener('click', () => {
    const targetPage = button.dataset.pageButton;
    if (targetPage) showPage(targetPage);
  });
}
captureSnapshotButton.addEventListener('click', captureCurrentSnapshot);
restoreSnapshotButton.addEventListener('click', () => runDiscrete(
  'Restore snapshot',
  restoreCurrentSnapshot,
  'snapshot-restore'
));
snapshotStackElement.addEventListener('click', event => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest<HTMLButtonElement>('[data-snapshot-action]');
  const id = button?.dataset.snapshotId;
  if (!button || !id) return;

  const action = button.dataset.snapshotAction;
  if (action === 'restore') {
    runDiscrete(
      'Restore snapshot',
      () => restoreSnapshotById(id),
      'snapshot-restore'
    );
  } else if (action === 'delete') {
    deleteSnapshotById(id);
  } else if (action === 'promote') {
    try {
      promoteSnapshotById(id);
    } catch (error) {
      setPersistenceStatus(
        error instanceof Error ? error.message : 'PRESET PROMOTION FAILED',
        'error'
      );
    }
  }
});
savePresetButton.addEventListener('click', saveCurrentPreset);
loadPresetButton.addEventListener('click', () => runDiscrete(
  'Load saved preset',
  loadStoredPreset
));
offlineButton.addEventListener('click', startOffline);
microphoneButton.addEventListener('click', () => void startMicrophone());
stopButton.addEventListener('click', () => void stopAll());
clearEventLogButton.addEventListener('click', () => {
  debugEventLog.clear();
  renderEventLog();
});
for (const input of [structureSensitivityInput, structureHoldInput]) {
  input.addEventListener('input', () => configureStructureDetector(false));
  input.addEventListener('change', () => configureStructureDetector(true));
}
structureFallbackSelect.addEventListener(
  'change',
  () => configureStructureDetector(true)
);
structureManualSelect.addEventListener(
  'change',
  () => configureStructureDetector(true)
);
learnAnalyzeButton.addEventListener('click', analyzeLearnSegment);
undoButton.addEventListener('click', performUndo);
redoButton.addEventListener('click', performRedo);
fxRackToggle.addEventListener('click', () => runDiscrete('Toggle FX Rack', () => {
  rackEnabled = !rackEnabled;
  mixer.reset();
  updateRackState();
}));
mappingSelect.addEventListener('change', () => {
  selectedMappingId = mappingSelect.value;
  refreshMappingEditor();
  refreshGraphView();
});
mappingModulationSelect.addEventListener('change', () => {
  selectedModulationId = mappingModulationSelect.value;
  refreshMappingModulationEditor();
});
addMappingModulationButton.addEventListener('click', () => runDiscrete(
  'Add mapping modulation',
  addSelectedMappingModulation
));
deleteMappingModulationButton.addEventListener('click', () => runDiscrete(
  'Delete mapping modulation',
  deleteSelectedMappingModulation
));
mapCardViewButton.addEventListener('click', () => setMapView('card'));
mapGraphViewButton.addEventListener('click', () => setMapView('graph'));
addMappingButton.addEventListener('click', () => runDiscrete('Add mapping', () => {
  const created = createNextMapping(mappings, {
    sourceId: 'audio.bass',
    targetId: VISUAL_TARGETS.feedbackZoom,
    range: [0.9, 1.1]
  });
  mappings = [...mappings, created];
  selectedMappingId = created.id;
  refreshMappingSelect();
}));
soloMappingButton.addEventListener('click', () => runDiscrete('Toggle mapping solo', () => {
  if (!selectedMappingId) return;
  soloMappingId = soloMappingId === selectedMappingId
    ? null
    : selectedMappingId;
  mixer.reset();
  refreshMappingSelect();
}));
bypassMappingButton.addEventListener('click', () => runDiscrete('Toggle mapping bypass', () => {
  if (!selectedMappingId) return;
  mappings = [...toggleMappingBypass(mappings, selectedMappingId)];
  mixer.reset();
  refreshMappingSelect();
}));
duplicateMappingButton.addEventListener('click', () => runDiscrete('Duplicate mapping', () => {
  if (!selectedMappingId) return;
  const duplicated = duplicateMapping(mappings, selectedMappingId);
  mappings = [...duplicated.mappings];
  if (duplicated.duplicateId) selectedMappingId = duplicated.duplicateId;
  mixer.reset();
  refreshMappingSelect();
}));
deleteMappingButton.addEventListener('click', () => runDiscrete('Delete mapping', () => {
  if (!selectedMappingId) return;
  const deleting = selectedMappingId;
  mappings = [...deleteMapping(mappings, deleting)];
  if (soloMappingId === deleting) soloMappingId = null;
  selectedMappingId = mappings[0]?.id ?? '';
  mixer.reset();
  refreshMappingSelect();
}));
mappingVariantAButton.addEventListener('click', () => runDiscrete(
  'Switch mapping to A',
  () => {
    mappings = [...setMappingABVariantById(
      mappings,
      selectedMappingId,
      'A'
    )];
    refreshMappingSelect();
  }
));
mappingVariantBButton.addEventListener('click', () => runDiscrete(
  'Switch mapping to B',
  () => {
    mappings = [...setMappingABVariantById(
      mappings,
      selectedMappingId,
      'B'
    )];
    refreshMappingSelect();
  }
));
nodeGraphNodeSelect.addEventListener('change', () => {
  selectedNodeId = nodeGraphNodeSelect.value;
});
nodeGraphAddNodeButton.addEventListener('click', () => runDiscrete(
  'Create NodeGraph node',
  createSelectedNodeKind
));
nodeGraphDeleteNodeButton.addEventListener('click', () => runDiscrete(
  'Delete NodeGraph node',
  deleteSelectedNode
));
nodeGraphConnectButton.addEventListener('click', () => runDiscrete(
  'Connect NodeGraph edge',
  connectSelectedNodes
));

registerDiscreteControl(presetSelect, 'Load preset', () => {
  loadPresetSelection(presetSelect.value);
});
registerDiscreteControl(mappingKindSelect, 'Change mapping kind', () => {
  updateSelectedMapping(true);
});
registerDiscreteControl(sourceSelect, 'Change mapping source', () => {
  updateSelectedMapping(true);
});
registerDiscreteControl(targetSelect, 'Change mapping target', () => {
  updateSelectedMapping(true);
});
registerDiscreteControl(mappingEnvelopeSelect, 'Change event envelope', () => {
  updateSelectedMapping(true);
});
registerDiscreteControl(polaritySelect, 'Change mapping polarity', () => {
  updateSelectedMapping(true);
});
registerDiscreteControl(replaceModeSelect, 'Change replace mode', () => {
  updateSelectedMapping(true);
});
registerDiscreteControl(safetyClampSelect, 'Change safety clamp', () => {
  updateSelectedMapping(true);
});
registerDiscreteControl(gateSourceSelect, 'Change mapping gate source', () => {
  updateSelectedMapping(true);
});
registerDiscreteControl(
  mappingModulationSourceSelect,
  'Change modulation source',
  () => updateSelectedMappingModulation(true)
);
registerDiscreteControl(
  mappingModulationTargetSelect,
  'Change modulation target',
  () => updateSelectedMappingModulation(true)
);
mappingModulationEnabledInput.addEventListener('change', () => runDiscrete(
  'Toggle mapping modulation',
  () => updateSelectedMappingModulation(true)
));
registerDiscreteControl(envelopeRetriggerSelect, 'Change retrigger mode', () => {
  updateSelectedEnvelope();
});
registerDiscreteControl(globalEventPolicySelect, 'Change global event policy', () => {
  updateEnergyBudgetConfig();
});
for (const [input, label, update] of [
  [
    energyBudgetEnabledInput,
    'Toggle global energy budget',
    updateEnergyBudgetConfig
  ],
  [
    experimentalQueueEnabledInput,
    'Toggle experimental event queue',
    updateEnergyBudgetConfig
  ],
  [
    safetyWhiteoutInput,
    'Toggle whiteout protection',
    updateSafetyConfig
  ],
  [
    safetyBlackoutInput,
    'Toggle blackout protection',
    updateSafetyConfig
  ],
  [
    safetyFeedbackRunawayInput,
    'Toggle feedback runaway protection',
    updateSafetyConfig
  ]
] as const) {
  input.addEventListener('change', () => runDiscrete(label, update));
}

for (const [input, key, label] of [
  [amountInput, 'mapping.amount', 'Change amount'],
  [rangeMinInput, 'mapping.range.min', 'Change range minimum'],
  [rangeMaxInput, 'mapping.range.max', 'Change range maximum'],
  [curveInput, 'mapping.curve', 'Change curve'],
  [attackInput, 'mapping.attack', 'Change attack'],
  [fallInput, 'mapping.fall', 'Change fall'],
  [thresholdInput, 'mapping.threshold', 'Change threshold'],
  [priorityInput, 'mapping.priority', 'Change priority'],
  [probabilityInput, 'mapping.probability', 'Change probability'],
  [gateThresholdInput, 'mapping.gateThreshold', 'Change gate threshold'],
  [
    mappingModulationDepthInput,
    'mapping.modulation.depth',
    'Change modulation depth'
  ]
] as const) {
  registerContinuousControl(input, key, label, () => {
    if (input === mappingModulationDepthInput) {
      updateSelectedMappingModulation(false);
    } else {
      updateSelectedMapping(false);
    }
  });
}
for (const [input, key, label] of [
  [envelopeDelayInput, 'envelope.delay', 'Change envelope delay'],
  [envelopeAttackInput, 'envelope.attack', 'Change envelope attack'],
  [envelopeHoldInput, 'envelope.hold', 'Change envelope hold'],
  [envelopeDecayInput, 'envelope.decay', 'Change envelope decay'],
  [envelopeSustainInput, 'envelope.sustain', 'Change envelope sustain'],
  [envelopeReleaseInput, 'envelope.release', 'Change envelope release'],
  [envelopeCooldownInput, 'envelope.cooldown', 'Change envelope cooldown']
] as const) {
  registerContinuousControl(input, key, label, updateSelectedEnvelope);
}
for (const [input, key, label] of [
  [macroIntensityInput, 'macro.intensity', 'Change intensity macro'],
  [macroResponseInput, 'macro.response', 'Change response macro'],
  [
    energyBudgetValueInput,
    'energyBudget.budget',
    'Change global energy budget'
  ],
  [
    eventVoiceLimitInput,
    'energyBudget.eventVoiceLimit',
    'Change event voice limit'
  ]
] as const) {
  registerContinuousControl(input, key, label, () => {
    if (
      input === macroIntensityInput ||
      input === macroResponseInput
    ) {
      macroIntensityValue.value = Number(macroIntensityInput.value).toFixed(2);
      macroResponseValue.value = Number(macroResponseInput.value).toFixed(2);
    } else {
      updateEnergyBudgetConfig();
    }
  });
}
registerContinuousControl(
  presetNameInput,
  'preset.name',
  'Rename preset',
  () => undefined
);
registerContinuousControl(
  seedInput,
  'session.seed',
  'Change session seed',
  resetRuntime
);
window.addEventListener('keydown', event => {
  if (!(event.ctrlKey || event.metaKey)) return;
  if (event.key.toLowerCase() === 'z' && !event.shiftKey) {
    event.preventDefault();
    performUndo();
  } else if (
    event.key.toLowerCase() === 'y' ||
    (event.key.toLowerCase() === 'z' && event.shiftKey)
  ) {
    event.preventDefault();
    performRedo();
  }
});
/*
 * Continuous transaction registration intentionally replaces the former
 * per-input listeners. A drag/focus-to-change gesture records one history item.
 */
for (const input of [
  amountInput,
  rangeMinInput,
  rangeMaxInput,
  curveInput,
  attackInput,
  fallInput,
  thresholdInput,
  priorityInput,
  probabilityInput,
  gateThresholdInput,
  mappingModulationDepthInput,
  energyBudgetValueInput,
  eventVoiceLimitInput
]) {
  input.dataset.undoGranularity = 'continuous';
}
const unsubscribeMappingPresenters = localeController.subscribe(() => {
  renderMappingIntent();
  refreshMappingRuntime();
});
window.addEventListener('beforeunload', () => {
  unsubscribeMappingPresenters();
  mountedLocalizedSurface.dispose();
  mountedLocaleUi.dispose();
  delete localeHostWindow.xinGlitchGeneratorLocale;
  if (recoveryEnabled) recoveryManager.markClean();
  void liveInput.stop();
});

refreshTargetOptions();
refreshVisualTableTargets();
createPerformanceStageRows();
refreshPerformanceProfiler();
refreshUniformRegistry();
refreshEnergyWeightTable();
configureStructureDetector(false);
try {
  refreshCustomPresetLibrary();
} catch (error) {
  customPresets = [];
  setPersistenceStatus(
    error instanceof Error ? error.message : 'CUSTOM PRESET LOAD FAILED',
    'error'
  );
}
renderSnapshotStack();
presetNameInput.value = activePreset.name;
refreshMappingSelect();
refreshNodeGraphPanel();
setNodeGraphConnectionState('idle', 'No pending connection.');
setMapView('card');
refreshEnergyBudgetControls();
refreshSafetyControls();
updateRackState();
updateHistoryControls();
renderPresetCompatibility(
  buildPresetCompatibilityReport(activePreset)
);
initializeRecovery();
startOffline();
