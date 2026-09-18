(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const dynamicI18n = window.XinMusicLabDynamicUi;
  const uiText = (key, fallback, params) => dynamicI18n?.t(key, params, fallback) || fallback;
  const bindUiText = (element, key, fallback, params) => dynamicI18n?.bindText(element, key, params, fallback)
    || (element ? (element.textContent = uiText(key, fallback, params)) : fallback);
  const bindUiAttribute = (element, attribute, key, fallback, params) => dynamicI18n?.bindAttribute(element, attribute, key, params, fallback)
    || (element ? (element.setAttribute(attribute, uiText(key, fallback, params)), element.getAttribute(attribute)) : fallback);
  const stage = $('.stage');
  const canvas = $('#visualizer');
  const ctx = canvas.getContext('2d', { alpha: true });
  const betaCanvas = $('#betaCanvas');
  const glitchCanvas = $('#glitchCanvas');
  const glitchCtx = glitchCanvas.getContext('2d', { alpha: true });
  const glitchWebglCanvas = $('#glitchWebglCanvas');
  const generatorCanvas = $('#generatorCanvas');
  const materialApi = window.SmokeResonanceVisualMaterial || null;
  const experimentalMaterialApi =
    window.SmokeResonanceExperimentalMaterials || null;
  const materialRegistry = materialApi?.createRegistry() || null;
  const materialTargetRegistry =
    window.SmokeResonanceMaterialTargets?.create() || null;
  const materialTargetDefaults =
    materialTargetRegistry?.defaults() || Object.freeze({});
  let materialMappedTargets = Object.freeze({});
  let materialTargetOverrides = Object.freeze({});
  let materialRuntime = null;
  let materialFrameOrchestrator = null;
  let materialRuntimeFailureNotified = false;
  const glitchFeatureBus = window.SmokeResonanceGlitchFeatureBus?.create() || null;
  const realtimeProviderAdapter = window.SmokeResonanceRealtimeProvider?.create({
    providerVersion: '2.1.0-shadow'
  }) || null;
  let realtimeProviderFrame = realtimeProviderAdapter?.get() || null;
  let realtimeProviderLastAt = 0;
  const engineFrameSubscribers = Object.freeze({
    preMaterial: new Set(),
    postMaterial: new Set()
  });
  let engineClockFrame = {
    frameIndex: 0,
    nowMs: 0,
    deltaMs: 0
  };
  const glitchWebglRenderer = window.SmokeResonanceGlitchWebGL?.create(glitchWebglCanvas, { maxDimension: 2560 }) || null;
  let webglFailureNotified = false;
  const conductorCanvas = $('#conductorCanvas');
  const conductorCtx = conductorCanvas.getContext('2d', { alpha: true });
  const playButton = $('#playButton');
  const mediaPrevious = $('#mediaPrevious');
  const mediaPlayPause = $('#mediaPlayPause');
  const mediaNext = $('#mediaNext');
  const enterButton = $('#enterButton');
  const captureButton = $('#captureButton');
  const welcome = $('#welcome');
  const trackTitle = $('#trackTitle');
  const trackMeta = $('#trackMeta');
  const sourceLabel = $('#sourceLabel');
  const energyLabel = $('#energyLabel');
  const timelineFill = $('#timelineFill');
  const intensityInput = $('#intensity');
  const calibrationButton = $('#calibrationButton');
  const calibrationPanel = $('#calibrationPanel');
  const calibrationClose = $('#calibrationClose');
  const calibrationReset = $('#calibrationReset');
  const paletteButton = $('#paletteButton');
  const palettePanel = $('#palettePanel');
  const paletteClose = $('#paletteClose');
  const conductorToggle = $('#conductorToggle');
  const conductorSettingsButton = $('#conductorSettingsButton');
  const conductorPanel = $('#conductorPanel');
  const conductorClose = $('#conductorClose');
  const conductorReset = $('#conductorReset');
  const glitchPowerButton = $('#glitchPowerButton');
  const glitchSettingsButton = $('#glitchSettingsButton');
  const glitchPanel = $('#glitchPanel');
  const glitchClose = $('#glitchClose');
  const glitchReset = $('#glitchReset');
  const glitchRackToggle = $('#glitchRackToggle');
  const glitchCurveCanvas = $('#glitchCurveCanvas');
  const glitchCurveCtx = glitchCurveCanvas.getContext('2d');
  const glitchPresetName = $('#glitchPresetName');
  const glitchPresetSave = $('#glitchPresetSave');
  const glitchPresetList = $('#glitchPresetList');
  const glitchRendererState = $('#glitchRendererState');
  const immersiveButton = $('#immersiveButton');
  const immersiveExit = $('#immersiveExit');
  const directorToggle = $('#directorToggle');
  const qualityButton = $('#qualityButton');
  const pulsarLayoutButton = $('#pulsarLayoutButton');
  const pulsarStyleButton = $('#pulsarStyleButton');
  const snapshotButton = $('#snapshotButton');
  const pinButton = $('#pinButton');
  const mappingLabButton = $('#mappingLabButton');
  const colorFlash = $('#colorFlash');
  const toast = $('#toast');

  const palettes = {
    aurora: { main: [141, 124, 255], hot: [114, 232, 206], dark: [26, 21, 58] },
    ember: { main: [255, 105, 84], hot: [255, 198, 102], dark: [67, 20, 18] },
    moon: { main: [183, 211, 255], hot: [101, 151, 255], dark: [18, 35, 65] },
    synthwave: { main: [255, 79, 216], hot: [67, 244, 255], dark: [42, 12, 61] },
    toxic: { main: [145, 255, 56], hot: [232, 255, 99], dark: [18, 42, 12] },
    ultraviolet: { main: [103, 93, 255], hot: [255, 79, 168], dark: [24, 13, 64] },
    solar: { main: [255, 181, 46], hot: [255, 78, 66], dark: [60, 22, 9] }
  };
  const customColors = { main: '#8d7cff', hot: '#72e8ce', dark: '#1a153a' };

  const effectNames = {
    'spectral-fabric': '材料 · 频谱织物',
    'temporal-strata': '材料 · 时间地层',
    spectrum: '经典 LED 频谱',
    mirror: '镜像频谱',
    waveform: '示波器波形',
    radial: '环形频谱',
    waterfall: '频谱瀑布图',
    vu: '机械 VU 表',
    ribbons: '现代 · 霓虹丝带',
    pulsar: '现代 · 层叠脉冲星',
    tunnel: '现代 · 超空间',
    'pulse-grid': '现代 · 脉冲网格',
    bloom: '现代 · 棱镜花',
    'original-glitch': '原创 · 壮丽崩坏实验室'
  };

  const calibrationPresets = {
    'open-flat': { label: '开源分析器', minFreq: 20, maxFreq: 20000, minDb: -92, maxDb: -18, tilt: 2, smoothing: .68, scale: 'log', autoGain: false },
    classic: { label: '千千经典', minFreq: 30, maxFreq: 16000, minDb: -78, maxDb: -16, tilt: 1.5, smoothing: .78, scale: 'log', autoGain: false },
    electronic: { label: '电子低频', minFreq: 25, maxFreq: 18000, minDb: -84, maxDb: -12, tilt: 1, smoothing: .7, scale: 'log', autoGain: true },
    vocal: { label: '人声清晰', minFreq: 70, maxFreq: 16000, minDb: -90, maxDb: -22, tilt: 3.5, smoothing: .62, scale: 'log', autoGain: true },
    air: { label: '高频展开', minFreq: 40, maxFreq: 22000, minDb: -96, maxDb: -24, tilt: 6, smoothing: .58, scale: 'log', autoGain: true }
  };
  const calibration = { ...calibrationPresets['open-flat'] };
  const responsePresets = {
    flat: { label: '平直', lowGain: 0, midGain: 0, highGain: 0, weighting: 'flat' },
    warm: { label: '暖厚', lowGain: 4, midGain: 1.5, highGain: -2, weighting: 'flat' },
    clarity: { label: '清晰', lowGain: -1.5, midGain: 3, highGain: 2, weighting: 'flat' },
    air: { label: '空气感', lowGain: -2, midGain: 0, highGain: 5, weighting: 'flat' },
    'a-weighted': { label: 'A 感知', lowGain: 0, midGain: 0, highGain: 0, weighting: 'a' },
    'c-weighted': { label: 'C 冲击', lowGain: 0, midGain: 0, highGain: 0, weighting: 'c' },
    itu468: { label: '468 细节', lowGain: 0, midGain: 0, highGain: 0, weighting: '468' }
  };
  const frequencyResponse = { ...responsePresets.flat, preset: 'flat' };
  const betaPresetNames = {
    'beta-1': 'Eo.S. - glowsticks v2 05 and proton lights (+Krash′s beat code) _Phat_remix02b',
    'beta-2': 'Geiss - Thumb Drum',
    'beta-3': 'martin - another kind of groove',
    'beta-4': 'flexi - bouncing balls [double mindblob neon mix]',
    'beta-5': 'Zylot - Paint Spill (Music Reactive Paint Mix)',
    'beta-6': 'Fumbling_Foo & Flexi, Martin, Orb, Unchained - Star Nova v7b',
    'beta-7': 'Unchained - Rewop',
    'beta-glitch-1': '_Rovastar + Geiss - Hurricane Nightmare (Posterize Mix)',
    'beta-glitch-2': 'Geiss + Flexi + Martin - disconnected',
    'beta-glitch-3': 'An AdamFX n Martin Infusion 2 flexi - Why The Sky Looks Diffrent Today - AdamFx n Martin Infusion - Tack Tile Disfunction B',
    'beta-glitch-4': 'flexi - what is the matrix',
    'beta-glitch-5': 'Geiss + Flexi + Martin - disconnected',
    'beta-glitch-6': '_Rovastar + Geiss - Hurricane Nightmare (Posterize Mix)',
    'beta-glitch-7': 'An AdamFX n Martin Infusion 2 flexi - Why The Sky Looks Diffrent Today - AdamFx n Martin Infusion - Tack Tile Disfunction B',
    'beta-glitch-8': 'flexi - what is the matrix'
  };
  const betaFallbackPresets = [
    'Aderrasi - Potion of Spirits',
    'Krash + Illusion - Spiral Movement',
    'Unchained - Unified Drag 2'
  ];
  const availableEffects = new Set([...Object.keys(effectNames), ...Object.keys(betaPresetNames)]);
  const glitchProfiles = {
    'beta-glitch-1': { mode: 'horizontal', burst: 6, hue: 12 },
    'beta-glitch-2': { mode: 'chroma', burst: 8, hue: 58 },
    'beta-glitch-3': { mode: 'tiles', burst: 11, hue: 34 },
    'beta-glitch-4': { mode: 'scan', burst: 9, hue: 82 },
    'beta-glitch-5': { mode: 'datamosh', burst: 7, hue: 18, persistence: .86 },
    'beta-glitch-6': { mode: 'rgb', burst: 5, hue: 120, rgb: true },
    'beta-glitch-7': { mode: 'codec', burst: 14, hue: 42, quantize: true },
    'beta-glitch-8': { mode: 'loss', burst: 10, hue: 8, dropout: true }
  };

  const directorScenes = [
    { id: 'beta-1', energy: .36, centroid: .64, texture: .56 },
    { id: 'beta-2', energy: .42, centroid: .48, texture: .46 },
    { id: 'beta-3', energy: .48, centroid: .5, texture: .52 },
    { id: 'beta-4', energy: .52, centroid: .56, texture: .58 },
    { id: 'beta-5', energy: .58, centroid: .66, texture: .7 },
    { id: 'beta-6', energy: .68, centroid: .62, texture: .68 },
    { id: 'beta-7', energy: .54, centroid: .58, texture: .6 },
    { id: 'beta-glitch-1', energy: .62, centroid: .54, texture: .76, glitch: true },
    { id: 'beta-glitch-2', energy: .55, centroid: .67, texture: .8, glitch: true },
    { id: 'beta-glitch-3', energy: .72, centroid: .58, texture: .88, glitch: true },
    { id: 'beta-glitch-4', energy: .65, centroid: .72, texture: .82, glitch: true },
    { id: 'beta-glitch-5', energy: .58, centroid: .52, texture: .84, glitch: true },
    { id: 'beta-glitch-6', energy: .7, centroid: .7, texture: .86, glitch: true },
    { id: 'beta-glitch-7', energy: .76, centroid: .6, texture: .92, glitch: true },
    { id: 'beta-glitch-8', energy: .6, centroid: .76, texture: .9, glitch: true }
  ];

  let currentPalette = palettes.aurora;
  let basePalette = palettes.aurora;
  let activePaletteName = 'aurora';
  let activeEffect = 'spectrum';
  let intensity = 1;
  let w = 0;
  let h = 0;
  let dpr = 1;
  let frame = 0;
  let switchToken = 0;
  let captureToken = 0;
  let capturePending = false;
  let resizeRequest = 0;
  let toastTimer;
  let autoGainOffset = 0;

  const spectrumLevels = [];
  const spectrumPeaks = [];
  const mirrorLevels = [];
  const ribbonSpectrumLevels = [];
  const ribbonFastLevels = [];
  const ribbonPreviousRaw = [];
  const ribbonTransientLevels = [];
  const vuLevels = [0, 0];
  const vuState = { detailBaseline: 0, previousCentroid: 0 };
  const waterfallCanvas = document.createElement('canvas');
  const waterfallCtx = waterfallCanvas.getContext('2d', { alpha: false });
  const waterfallState = { lastUpdateAt: 0, primed: false };
  const bandCache = new Map();
  const modernParticles = [];
  const modernState = {
    tunnelTravel: 0,
    tunnelDrift: 0,
    tunnelCx: .5,
    tunnelCy: .48,
    bloomRotation: 0
  };
  const pulsarState = {
    history: [],
    lastCaptureAt: 0,
    lastDrawAt: 0,
    captureInterval: 150,
    mode: 'mono',
    layout: 'folded',
    stereoAvailable: false
  };
  const conductorState = {
    enabled: false,
    phase: 0,
    bass: 0,
    mid: 0,
    treble: 0,
    overall: 0,
    bassAccent: 0,
    midAccent: 0,
    highAccent: 0,
    prevBass: 0,
    prevMid: 0,
    prevHigh: 0,
    legendStartedAt: performance.now()
  };
  const conductorDefaults = { speed: 1, gesture: 1, size: 1, x: .57, y: .87, orchestra: .55, facing: 'auto', labels: 'auto' };
  const conductorConfig = { ...conductorDefaults };
  const glitchDefaults = {
    enabled: false,
    ensembleWeight: 1,
    drumWeight: 1,
    abrasionWeight: 1,
    sectionDrive: 1,
    fxStrength: 1.25,
    rhythmLock: .65,
    drumLow: 1,
    drumMid: 1,
    drumHigh: 1,
    abrasionDissonance: 1,
    abrasionRoughness: 1,
    abrasionTransient: 1,
    abrasionSweep: 1,
    baseLayer: 1,
    noiseLayer: .85,
    burstLayer: 1,
    tensionBuild: 1,
    eventSpacing: 1,
    rhythmSubdivision: 1
  };
  const glitchPresets = {
    balanced: { label: '均衡', ensembleWeight: 1, drumWeight: 1, abrasionWeight: 1, sectionDrive: 1, fxStrength: 1.25, rhythmLock: .65, baseLayer: 1, noiseLayer: .85, burstLayer: 1, tensionBuild: 1, eventSpacing: 1 },
    orchestral: { label: '编制优先', ensembleWeight: 1.7, drumWeight: .55, abrasionWeight: .65, sectionDrive: 1.35, fxStrength: 1.35, rhythmLock: .45, baseLayer: .85, noiseLayer: .55, burstLayer: 1.2, tensionBuild: 1.2, eventSpacing: 1.15 },
    impact: { label: '鼓点冲击', ensembleWeight: .55, drumWeight: 1.75, abrasionWeight: .65, sectionDrive: .8, fxStrength: 1.5, rhythmLock: .82, drumLow: 1.35, drumMid: 1.2, drumHigh: .75, baseLayer: .75, noiseLayer: .55, burstLayer: 1.55, eventSpacing: .75 },
    acid: { label: 'Acid 撕裂', ensembleWeight: .65, drumWeight: .7, abrasionWeight: 1.75, sectionDrive: .9, fxStrength: 1.55, rhythmLock: .72, abrasionSweep: 1.45, abrasionTransient: 1.25, baseLayer: .9, noiseLayer: 1.45, burstLayer: 1.3, eventSpacing: .8 },
    weg: { label: '壮丽崩坏', ensembleWeight: 1.45, drumWeight: 1.15, abrasionWeight: 1.6, sectionDrive: 1.65, fxStrength: 1.7, rhythmLock: .56, baseLayer: .72, noiseLayer: 1.15, burstLayer: 1.85, tensionBuild: 1.55, eventSpacing: 1.35, abrasionDissonance: 1.25, abrasionTransient: 1.35 },
    restrained: { label: '克制留白', ensembleWeight: .55, drumWeight: .4, abrasionWeight: .45, sectionDrive: .55, fxStrength: .7, rhythmLock: .3, baseLayer: .45, noiseLayer: .25, burstLayer: .5, tensionBuild: .65, eventSpacing: 1.7 }
  };
  const glitchConfig = { ...glitchDefaults };
  const fusionTimelineState = {
    connected: false,
    section: 0,
    climax: 0,
    drop: 0,
    build: 0,
    boundaryPulse: 0,
    boundarySerial: 0,
    sectionLabel: '—',
    chord: '—',
    chordConfidence: 0,
    chordPulse: 0
  };
  let activeGlitchPreset = 'balanced';
  let glitchUserPresets = [];
  const glitchCurveState = { history: [], lastSampleAt: 0, width: 0, height: 0 };
  const rhythmState = {
    interval: 520,
    phase: 0,
    confidence: 0,
    pulse: 0,
    lastBeatAt: 0,
    previousOnset: 0,
    intervals: []
  };
  const colorFxDefaults = { cycle: 0, breath: 0, strobe: 0 };
  const colorFx = { ...colorFxDefaults };
  const colorFxState = { flash: 0, lastFlashAt: 0 };

  const qualityBudgets = Object.freeze([
    Object.freeze({ pulsarRows: 36, pulsarSamples: 80, pulsarGlowRows: 0, pulsarCaptureMs: 170, pulsarFrameMs: 42, glitchFragments: 6, glitchNoiseLines: 5, webglScale: .5 }),
    Object.freeze({ pulsarRows: 44, pulsarSamples: 96, pulsarGlowRows: 1, pulsarCaptureMs: 150, pulsarFrameMs: 34, glitchFragments: 8, glitchNoiseLines: 8, webglScale: .62 }),
    Object.freeze({ pulsarRows: 52, pulsarSamples: 120, pulsarGlowRows: 3, pulsarCaptureMs: 130, pulsarFrameMs: 28, glitchFragments: 11, glitchNoiseLines: 12, webglScale: .75 }),
    Object.freeze({ pulsarRows: 60, pulsarSamples: 144, pulsarGlowRows: 5, pulsarCaptureMs: 115, pulsarFrameMs: 22, glitchFragments: 14, glitchNoiseLines: 16, webglScale: .88 })
  ]);
  const qualityState = {
    mode: 'auto',
    adaptiveDpr: Math.min(window.devicePixelRatio || 1, 1.35),
    complexityLevel: 2,
    sampleStartedAt: performance.now(),
    sampleFrames: 0,
    fps: 60,
    frameTimeEma: 16.7,
    longFrames: 0,
    longFrameRatio: 0,
    stableSamples: 0,
    lastFrameAt: 0,
    lastAdjustmentAt: 0,
    lastUiAt: 0
  };
  const directorState = {
    enabled: false,
    beatCount: 0,
    previousOnset: 0,
    lastBeatAt: 0,
    lastSwitchAt: 0,
    energyAnchor: 0,
    lastSection: 'SPARSE',
    sectionChangedAt: 0,
    history: []
  };

  const audioState = {
    context: null,
    analyser: null,
    sectionAnalyser: null,
    data: null,
    floatData: null,
    waveData: null,
    sectionFloatData: null,
    sectionWaveData: null,
    sectionLastAt: 0,
    sectionFrame: null,
    source: null,
    stream: null,
    sourceKind: 'none',
    mediaElement: null,
    mediaSource: null,
    mediaConnected: false,
    playing: false,
    started: false,
    rawRms: 0,
    energy: { bass: 0, mid: 0, treble: 0, overall: 0 },
    instant: { bass: 0, mid: 0, treble: 0, overall: 0 },
    accents: { bass: 0, mid: 0, treble: 0, overall: 0 },
    features: {
      rms: 0,
      flux: 0,
      centroid: .5,
      flatness: 0,
      density: 0,
      breadth: 0,
      voices: 0,
      richness: 0,
      orchestrationDensity: 0,
      orchestrationDelta: 0,
      orchestrationPersistence: 0,
      orchestrationFall: 0,
      effectiveParts: 0,
      acid: 0,
      resonance: 0,
      sweep: 0,
      sharpness: 0,
      roughness: 0,
      dynamicRange: 0,
      onset: 0
    },
    previousMagnitudes: null,
    splitter: null,
    leftAnalyser: null,
    rightAnalyser: null,
    leftData: null,
    rightData: null,
    stereoSource: null,
    loudnessHistory: [],
    orchestrationBaseline: null,
    previousOrchestration: 0,
    orchestrationPersistence: 0,
    acidPeakPosition: .42,
    acidSweepDirection: 0,
    acidSweepCoherence: 0
  };

  const betaState = {
    visualizer: null,
    presets: null,
    loadPromise: null,
    lastError: '',
    renderFailures: 0,
    currentPreset: ''
  };
  const betaRhythmState = { loudness: 0, pulse: 0 };
  const glitchState = {
    prevBass: 0,
    smoothBass: 0,
    beatPulse: 0,
    density: 0,
    acid: 0,
    ensemble: 0,
    loudness: 0,
    dynamicRange: 0,
    tension: 0,
    rateAccumulator: 0,
    lastBurstAt: 0,
    lastNoiseAt: 0,
    lastFxAt: 0,
    slowEnvelope: 0,
    fastEnvelope: 0,
    transient: 0,
    baseLayer: 0,
    noiseLayer: 0,
    burstLayer: 0,
    burstFlash: 0,
    noiseLines: [],
    fragments: [],
    filter: ''
  };
  const mappingEngine = window.SmokeResonanceMappingEngine?.create();
  const sectionFeatureExtractor = window.SmokeResonanceSectionFeatures?.create({ bandCount: 24 });
  const sectionEngineSuite = window.SmokeResonanceSectionEngines?.create();
  const glitchEngine = window.SmokeResonanceGlitchEngine?.create();
  const originalGlitchRenderer = window.SmokeResonanceOriginalGlitch?.create();
  const mappingLab = mappingEngine && window.SmokeResonanceMappingLab?.create(mappingEngine, sectionEngineSuite);
  const liveHarmony = window.SmokeResonanceLiveHarmony?.create();
  let mappingOutput = mappingEngine?.get() || null;
  let sectionOutput = sectionEngineSuite?.get() || null;
  let liveChord = { label: '—', root: -1, rootName: 'N', confidence: 0 };
  // Live-chord signal consumed by the glitch engine when no XLD timeline is
  // connected (i.e. external monitoring). change decays each frame.
  const liveChordSignal = { chord: '—', confidence: 0, change: 0 };
  let liveChordKey = '';
  let liveChordFrame = 0;

  function showToast(message, duration = 2300) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
  }

  function createAudioAnalyser(fftSize) {
    const analyser = audioState.context.createAnalyser();
    analyser.fftSize = fftSize;
    analyser.minDecibels = -120;
    analyser.maxDecibels = 0;
    analyser.smoothingTimeConstant = calibration.smoothing;
    return analyser;
  }

  function createSectionAnalyser(fftSize) {
    const analyser = audioState.context.createAnalyser();
    analyser.fftSize = fftSize;
    analyser.minDecibels = -120;
    analyser.maxDecibels = 0;
    analyser.smoothingTimeConstant = .12;
    return analyser;
  }

  // Large FFT for real-time chord (chroma) analysis — finer low-frequency
  // resolution so roots/bass register. Light internal smoothing; the harmony
  // engine adds its own temporal smoothing on top.
  function createChromaAnalyser(fftSize) {
    const analyser = audioState.context.createAnalyser();
    analyser.fftSize = fftSize;
    analyser.minDecibels = -100;
    analyser.maxDecibels = -10;
    analyser.smoothingTimeConstant = .55;
    return analyser;
  }

  function ensureStereoAnalysis() {
    if (!audioState.context) return false;
    if (!audioState.splitter) {
      audioState.leftAnalyser = createAudioAnalyser(2048);
      audioState.rightAnalyser = createAudioAnalyser(2048);
      audioState.splitter = audioState.context.createChannelSplitter(2);
      audioState.splitter.connect(audioState.leftAnalyser, 0);
      audioState.splitter.connect(audioState.rightAnalyser, 1);
      audioState.leftData = new Uint8Array(audioState.leftAnalyser.frequencyBinCount);
      audioState.rightData = new Uint8Array(audioState.rightAnalyser.frequencyBinCount);
    }
    if (audioState.source && audioState.stereoSource !== audioState.source) {
      try {
        audioState.source.connect(audioState.splitter);
        audioState.stereoSource = audioState.source;
      } catch (_) { return false; }
    }
    return true;
  }

  function setStereoAnalysisEnabled(enabled) {
    if (enabled) return ensureStereoAnalysis();
    if (audioState.stereoSource && audioState.splitter) {
      try { audioState.stereoSource.disconnect(audioState.splitter); } catch (_) {}
    }
    audioState.stereoSource = null;
    return false;
  }

  function initAudio() {
    if (audioState.context) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw new Error('当前环境不支持 Web Audio');
    audioState.context = new AudioContext();
    audioState.analyser = createAudioAnalyser(4096);
    audioState.sectionAnalyser = createSectionAnalyser(4096);
    audioState.chromaAnalyser = createChromaAnalyser(16384);
    audioState.data = new Uint8Array(audioState.analyser.frequencyBinCount);
    audioState.floatData = new Float32Array(audioState.analyser.frequencyBinCount);
    audioState.waveData = new Uint8Array(audioState.analyser.fftSize);
    audioState.sectionFloatData = new Float32Array(audioState.sectionAnalyser.frequencyBinCount);
    audioState.sectionWaveData = new Uint8Array(audioState.sectionAnalyser.fftSize);
    audioState.chromaData = new Float32Array(audioState.chromaAnalyser.frequencyBinCount);
  }

  function connectBetaAudio() {
    if (!betaState.visualizer || !audioState.source) return;
    try { betaState.visualizer.connectAudio(audioState.source); } catch (_) {}
  }

  function setCapturePending(pending) {
    capturePending = Boolean(pending);
    enterButton.disabled = capturePending;
    captureButton.disabled = capturePending;
    if (capturePending) bindUiText(captureButton.querySelector('span'), 'runtime.capture.connecting', '正在连接…');
  }

  function resetAudioAnalysis() {
    audioState.rawRms = 0;
    for (const group of [audioState.energy, audioState.instant, audioState.accents]) {
      for (const key of Object.keys(group)) group[key] = 0;
    }
    for (const key of Object.keys(audioState.features)) audioState.features[key] = key === 'centroid' ? .5 : 0;
    audioState.previousMagnitudes?.fill(0);
    audioState.leftData?.fill(0);
    audioState.rightData?.fill(0);
    audioState.loudnessHistory.length = 0;
    audioState.orchestrationBaseline = null;
    audioState.previousOrchestration = 0;
    audioState.orchestrationPersistence = 0;
    audioState.acidPeakPosition = .42;
    audioState.acidSweepDirection = 0;
    audioState.acidSweepCoherence = 0;
    rhythmState.interval = 520;
    rhythmState.phase = 0;
    rhythmState.confidence = 0;
    rhythmState.pulse = 0;
    rhythmState.lastBeatAt = 0;
    rhythmState.previousOnset = 0;
    rhythmState.intervals.length = 0;
    bandCache.clear();
    if (mappingEngine) mappingOutput = mappingEngine.reset(performance.now());
    sectionFeatureExtractor?.reset();
    audioState.sectionLastAt = 0;
    audioState.sectionFrame = sectionFeatureExtractor?.get() || null;
    if (sectionEngineSuite) sectionOutput = sectionEngineSuite.reset(performance.now());
  }

  function stopCapture(showMessage = true, invalidateRequest = true) {
    if (invalidateRequest) captureToken++;
    const source = audioState.source;
    const stream = audioState.stream;
    audioState.source = null;
    audioState.stream = null;
    audioState.sourceKind = 'none';
    if (source === audioState.mediaSource) audioState.mediaConnected = false;
    if (audioState.stereoSource === source) audioState.stereoSource = null;
    if (source) {
      try { source.disconnect(); } catch (_) {}
    }
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    audioState.playing = false;
    audioState.started = false;
    bindUiText(sourceLabel, 'runtime.audio.system', '系统音频');
    bindUiText(energyLabel, 'runtime.audio.waiting', '等待连接');
    timelineFill.style.width = '0%';
    if (!capturePending) bindUiText(captureButton.querySelector('span'), 'runtime.capture.connect', '连接声音');
    updatePlayButton();
    if (showMessage) showToast(uiText('runtime.capture.stopped', '已停止监听电脑声音'));
  }

  async function attachInternalMedia(element) {
    if (!(element instanceof HTMLMediaElement)) return { ok: false, error: 'invalid-media-element' };
    initAudio();
    if (audioState.stream || audioState.sourceKind === 'external') stopCapture(false);
    try { await audioState.context.resume(); } catch (_) {}
    if (audioState.mediaElement && audioState.mediaElement !== element) return { ok: false, error: 'media-element-conflict' };
    if (!audioState.mediaSource) {
      try {
        audioState.mediaSource = audioState.context.createMediaElementSource(element);
        audioState.mediaElement = element;
      } catch (_) {
        return { ok: false, error: 'media-source-failed' };
      }
    }
    if (!audioState.mediaConnected) {
      try {
        audioState.mediaSource.connect(audioState.analyser);
        audioState.mediaSource.connect(audioState.sectionAnalyser);
        if (audioState.chromaAnalyser) audioState.mediaSource.connect(audioState.chromaAnalyser);
        audioState.mediaSource.connect(audioState.context.destination);
        audioState.mediaConnected = true;
      } catch (_) {
        return { ok: false, error: 'media-connect-failed' };
      }
    }
    audioState.source = audioState.mediaSource;
    audioState.sourceKind = 'internal';
    audioState.started = true;
    audioState.playing = !element.paused;
    setStereoAnalysisEnabled(pulsarState.layout === 'stereo');
    connectBetaAudio();
    resetAudioAnalysis();
    updatePlayButton();
    return { ok: true, kind: 'internal' };
  }

  function detachInternalMedia() {
    if (audioState.sourceKind !== 'internal') return { ok: true, kind: audioState.sourceKind };
    try { audioState.mediaSource?.disconnect(); } catch (_) {}
    audioState.mediaConnected = false;
    audioState.source = null;
    audioState.sourceKind = 'none';
    audioState.started = false;
    audioState.playing = false;
    if (audioState.stereoSource === audioState.mediaSource) audioState.stereoSource = null;
    resetAudioAnalysis();
    updatePlayButton();
    return { ok: true, kind: 'none' };
  }

  function setInternalPlaying(playing) {
    if (audioState.sourceKind !== 'internal') return false;
    audioState.playing = Boolean(playing);
    updatePlayButton();
    return audioState.playing;
  }

  async function startCapture() {
    if (capturePending) return;
    if (!navigator.mediaDevices?.getDisplayMedia) {
      showToast('请使用最新版 Edge 或 Chrome 打开', 3200);
      return;
    }
    const requestId = ++captureToken;
    setCapturePending(true);
    let stream = null;
    try {
      initAudio();
      await audioState.context.resume();
      if (requestId !== captureToken) return;
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'monitor', frameRate: { ideal: 1, max: 5 } },
        audio: { suppressLocalAudioPlayback: false },
        systemAudio: 'include',
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'exclude'
      });
    } catch (error) {
      const message = error?.name === 'NotAllowedError'
        ? '已取消连接'
        : error?.message === '当前环境不支持 Web Audio'
          ? error.message
          : '未能连接系统音频';
      showToast(message);
      return;
    } finally {
      if (!stream || requestId !== captureToken) setCapturePending(false);
    }

    if (requestId !== captureToken) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }

    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) {
      stream.getTracks().forEach(track => track.stop());
      setCapturePending(false);
      showToast('请选择“整个屏幕”并开启“共享系统音频”', 3600);
      return;
    }

    let nextSource = null;
    try {
      nextSource = audioState.context.createMediaStreamSource(stream);
      nextSource.connect(audioState.analyser);
      nextSource.connect(audioState.sectionAnalyser);
      if (audioState.chromaAnalyser) nextSource.connect(audioState.chromaAnalyser);
    } catch (_) {
      try { nextSource?.disconnect(); } catch (_) {}
      stream.getTracks().forEach(track => track.stop());
      setCapturePending(false);
      showToast('音频分析器连接失败，请重新选择声音来源', 3600);
      return;
    }
    const previousSource = audioState.source;
    const previousStream = audioState.stream;
    audioState.source = nextSource;
    audioState.stream = stream;
    audioState.sourceKind = 'external';
    try { previousSource?.disconnect(); } catch (_) {}
    if (audioState.stereoSource === previousSource) audioState.stereoSource = null;
    previousStream?.getTracks().forEach(track => track.stop());
    setStereoAnalysisEnabled(pulsarState.layout === 'stereo');
    connectBetaAudio();
    audioState.started = true;
    audioState.playing = true;
    resetAudioAnalysis();
    welcome.classList.add('is-gone');
    bindUiText(trackTitle, 'runtime.capture.listeningTitle', '正在聆听这台电脑');
    bindUiText(trackMeta, 'runtime.capture.listeningMeta', '系统音频实时分析 · 不录制、不上传、不产生回声');
    dynamicI18n?.unbind(sourceLabel);
    sourceLabel.textContent = audioTracks[0].label || uiText('runtime.audio.system', '系统音频');
    bindUiText(captureButton.querySelector('span'), 'runtime.capture.change', '更换来源');
    const stopIfCurrent = () => {
      if (audioState.stream === stream && captureToken === requestId) stopCapture(false);
    };
    stream.getVideoTracks()[0]?.addEventListener('ended', stopIfCurrent, { once: true });
    audioTracks[0].addEventListener('ended', stopIfCurrent, { once: true });
    setCapturePending(false);
    bindUiText(captureButton.querySelector('span'), 'runtime.capture.change', '更换来源');
    updatePlayButton();
    showToast(uiText('runtime.capture.connected', '已连接，经典频谱开始工作'));
  }

  async function toggleListening() {
    if (!audioState.started) return startCapture();
    try {
      if (audioState.context.state === 'suspended') {
        await audioState.context.resume();
        audioState.playing = audioState.context.state === 'running';
        showToast(audioState.playing
          ? uiText('runtime.listen.resumed', '继续监听')
          : uiText('runtime.listen.resumeFailed', '音频分析器未能恢复'));
      } else {
        await audioState.context.suspend();
        audioState.playing = false;
        showToast(uiText('runtime.listen.paused', '已暂停分析，音乐不会受到影响'));
      }
    } catch (_) {
      audioState.playing = audioState.context?.state === 'running';
      showToast(uiText('runtime.listen.toggleFailed', '音频分析器状态切换失败，请重新连接声音'));
    }
    updatePlayButton();
  }

  function updatePlayButton() {
    playButton.setAttribute('aria-pressed', String(audioState.playing));
    bindUiAttribute(
      playButton,
      'aria-label',
      audioState.playing ? 'runtime.listen.pauseAria' : 'runtime.listen.startAria',
      audioState.playing ? '暂停监听' : '开始监听'
    );
  }

  function frequencyAt(position) {
    const t = Math.max(0, Math.min(1, position));
    if (calibration.scale === 'linear') {
      return calibration.minFreq + (calibration.maxFreq - calibration.minFreq) * t;
    }
    if (calibration.scale === 'bark') {
      const from = 6 * Math.asinh(calibration.minFreq / 600);
      const to = 6 * Math.asinh(calibration.maxFreq / 600);
      return 600 * Math.sinh((from + (to - from) * t) / 6);
    }
    if (calibration.scale === 'mel') {
      const from = 2595 * Math.log10(1 + calibration.minFreq / 700);
      const to = 2595 * Math.log10(1 + calibration.maxFreq / 700);
      return 700 * (Math.pow(10, (from + (to - from) * t) / 2595) - 1);
    }
    return calibration.minFreq * Math.pow(calibration.maxFreq / calibration.minFreq, t);
  }

  function frequencyPosition(frequency) {
    if (calibration.scale === 'linear') {
      return (frequency - calibration.minFreq) / (calibration.maxFreq - calibration.minFreq);
    }
    if (calibration.scale === 'bark') {
      const from = 6 * Math.asinh(calibration.minFreq / 600);
      const to = 6 * Math.asinh(calibration.maxFreq / 600);
      return (6 * Math.asinh(frequency / 600) - from) / (to - from);
    }
    if (calibration.scale === 'mel') {
      const from = 2595 * Math.log10(1 + calibration.minFreq / 700);
      const to = 2595 * Math.log10(1 + calibration.maxFreq / 700);
      return (2595 * Math.log10(1 + frequency / 700) - from) / (to - from);
    }
    return Math.log(frequency / calibration.minFreq) / Math.log(calibration.maxFreq / calibration.minFreq);
  }

  function averageBandDb(fromHz, toHz) {
    const data = audioState.floatData;
    if (!data?.length || !audioState.context) return calibration.minDb;
    const binHz = audioState.context.sampleRate / audioState.analyser.fftSize;
    const from = Math.max(0, Math.floor(fromHz / binHz));
    const to = Math.min(data.length - 1, Math.max(from, Math.ceil(toHz / binHz)));
    let power = 0;
    let count = 0;
    for (let i = from; i <= to; i++) {
      const db = Number.isFinite(data[i]) ? Math.max(-140, data[i]) : -140;
      power += Math.pow(10, db / 10);
      count++;
    }
    return 10 * Math.log10(Math.max(1e-14, power / Math.max(1, count)));
  }

  function visiblePeakDb() {
    const data = audioState.floatData;
    if (!data?.length || !audioState.context) return calibration.maxDb;
    const binHz = audioState.context.sampleRate / audioState.analyser.fftSize;
    const from = Math.max(0, Math.floor(calibration.minFreq / binHz));
    const to = Math.min(data.length - 1, Math.ceil(calibration.maxFreq / binHz));
    let peak = -140;
    for (let i = from; i <= to; i++) if (Number.isFinite(data[i])) peak = Math.max(peak, data[i]);
    return peak;
  }

  function calibratedValue(db, centerHz) {
    const tilt = calibration.tilt * Math.log2(Math.max(20, centerHz) / 1000);
    return Math.max(0, Math.min(1, (db + tilt + autoGainOffset - calibration.minDb) / (calibration.maxDb - calibration.minDb)));
  }

  const itu468Curve = [
    [20, -38], [31.5, -30], [63, -24], [100, -20], [200, -14], [400, -8],
    [800, -2], [1000, 0], [2000, 5.6], [3150, 9], [6300, 12.2], [10000, 8.1], [20000, -11.7]
  ];

  function smoothBlend(edge0, edge1, value) {
    const x = Math.max(0, Math.min(1, (value - edge0) / Math.max(1e-6, edge1 - edge0)));
    return x * x * (3 - 2 * x);
  }

  function standardWeightingDb(frequency, type) {
    const f = Math.max(10, Number(frequency) || 10);
    const f2 = f * f;
    if (type === 'a') {
      const numerator = 12200 ** 2 * f2 ** 2;
      const denominator = (f2 + 20.6 ** 2)
        * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2))
        * (f2 + 12200 ** 2);
      return Math.max(-24, Math.min(8, 20 * Math.log10(Math.max(1e-12, numerator / denominator)) + 2));
    }
    if (type === 'c') {
      const ratio = 12200 ** 2 * f2 / ((f2 + 20.6 ** 2) * (f2 + 12200 ** 2));
      return Math.max(-18, Math.min(6, 20 * Math.log10(Math.max(1e-12, ratio)) + .06));
    }
    if (type === '468') {
      const logF = Math.log(f);
      for (let index = 0; index < itu468Curve.length - 1; index++) {
        const from = itu468Curve[index];
        const to = itu468Curve[index + 1];
        if (f <= to[0]) {
          const amount = (logF - Math.log(from[0])) / Math.log(to[0] / from[0]);
          return from[1] + (to[1] - from[1]) * Math.max(0, Math.min(1, amount));
        }
      }
      return itu468Curve[itu468Curve.length - 1][1];
    }
    return 0;
  }

  function responseGainDb(frequency) {
    const logF = Math.log2(Math.max(20, frequency));
    const lowToMid = smoothBlend(Math.log2(110), Math.log2(440), logF);
    const midToHigh = smoothBlend(Math.log2(1200), Math.log2(4800), logF);
    let gain = frequencyResponse.lowGain + (frequencyResponse.midGain - frequencyResponse.lowGain) * lowToMid;
    gain += (frequencyResponse.highGain - gain) * midToHigh;
    gain += standardWeightingDb(frequency, frequencyResponse.weighting);
    return Math.max(-24, Math.min(16, gain));
  }

  function mappedValue(db, centerHz) {
    return calibratedValue(db + responseGainDb(centerHz), centerHz);
  }

  function averageHz(fromHz, toHz, mapped = true) {
    const center = Math.sqrt(Math.max(1, fromHz) * Math.max(1, toHz));
    const db = averageBandDb(fromHz, toHz);
    return mapped ? mappedValue(db, center) : calibratedValue(db, center);
  }

  function updateAudioFeatures(target) {
    const data = audioState.floatData;
    const analyser = audioState.analyser;
    const context = audioState.context;
    if (!data?.length || !analyser || !context) return audioState.features;

    const binHz = context.sampleRate / analyser.fftSize;
    const from = Math.max(1, Math.floor(25 / binHz));
    const to = Math.min(data.length - 1, Math.ceil(16000 / binHz));
    const stride = 2;
    const length = Math.ceil((to - from + 1) / stride);
    if (!audioState.previousMagnitudes || audioState.previousMagnitudes.length !== length) {
      audioState.previousMagnitudes = new Float32Array(length);
    }

    let weightedPosition = 0;
    let magnitudeSum = 0;
    let flux = 0;
    let logSum = 0;
    let active = 0;
    let index = 0;
    const ensembleBandCount = 36;
    const ensembleSums = new Float32Array(ensembleBandCount);
    const ensembleCounts = new Uint16Array(ensembleBandCount);
    for (let bin = from; bin <= to; bin += stride) {
      const frequency = Math.max(25, bin * binHz);
      const db = Number.isFinite(data[bin]) ? data[bin] : -140;
      const magnitude = Math.max(1e-5, calibratedValue(db, frequency));
      const logPosition = Math.max(0, Math.min(1, Math.log(frequency / 25) / Math.log(16000 / 25)));
      const ensembleIndex = Math.min(ensembleBandCount - 1, Math.floor(logPosition * ensembleBandCount));
      ensembleSums[ensembleIndex] += magnitude;
      ensembleCounts[ensembleIndex]++;
      weightedPosition += logPosition * magnitude;
      magnitudeSum += magnitude;
      logSum += Math.log(magnitude);
      if (magnitude > .1 + target.overall * .12) active++;
      const previous = audioState.previousMagnitudes[index];
      if (magnitude > previous) flux += magnitude - previous;
      audioState.previousMagnitudes[index] = magnitude;
      index++;
    }

    analyser.getByteTimeDomainData(audioState.waveData);
    let squareSum = 0;
    for (let i = 0; i < audioState.waveData.length; i += 2) {
      const sample = (audioState.waveData[i] - 128) / 128;
      squareSum += sample * sample;
    }
    const rms = Math.sqrt(squareSum / Math.max(1, audioState.waveData.length / 2));
    audioState.rawRms = rms;
    const arithmeticMean = magnitudeSum / Math.max(1, index);
    const flatness = arithmeticMean > 1e-5 ? Math.exp(logSum / Math.max(1, index)) / arithmeticMean : 0;
    const centroid = magnitudeSum > 1e-5 ? weightedPosition / magnitudeSum : .5;
    const fluxValue = Math.min(1, flux / Math.max(1, index) * 18);
    const density = active / Math.max(1, index);

    // A loud chorus is not necessarily louder in RMS.  This log-band summary is a
    // deliberately level-tolerant proxy for how many independent spectral regions
    // are sounding at once: occupancy + spread + entropy + stable local peaks.
    const ensembleBands = Array.from(ensembleSums, (sum, bandIndex) => sum / Math.max(1, ensembleCounts[bandIndex]));
    const ensemblePeak = Math.max(...ensembleBands, 1e-5);
    const ensembleTotal = ensembleBands.reduce((sum, value) => sum + value, 0);
    const relativeFloor = Math.max(.025, ensemblePeak * .16);
    const activeBands = ensembleBands.filter(value => value > relativeFloor).length;
    let entropy = 0;
    let localPeaks = 0;
    const zones = new Array(6).fill(0);
    const zonePeak = new Array(6).fill(0);
    const zoneFloor = new Array(6).fill(Infinity);
    ensembleBands.forEach((value, bandIndex) => {
      if (ensembleTotal > 1e-5 && value > 0) {
        const probability = value / ensembleTotal;
        entropy -= probability * Math.log(probability);
      }
      const zone = Math.min(5, Math.floor(bandIndex / ensembleBandCount * 6));
      zonePeak[zone] = Math.max(zonePeak[zone], value);
      zoneFloor[zone] = Math.min(zoneFloor[zone], value);
      if (value > relativeFloor) zones[zone] = 1;
      const left = ensembleBands[Math.max(0, bandIndex - 1)];
      const right = ensembleBands[Math.min(ensembleBandCount - 1, bandIndex + 1)];
      if (value > relativeFloor * 1.18 && value > left * 1.055 && value >= right * 1.055) localPeaks++;
    });
    entropy = Math.min(1, entropy / Math.log(ensembleBandCount));
    const occupancy = activeBands / ensembleBandCount;
    const spread = zones.reduce((sum, value) => sum + value, 0) / zones.length;
    const presence = Math.max(0, Math.min(1, (target.overall - .012) / .11));
    const breadth = Math.min(1, (occupancy * .58 + spread * .42) * (.55 + presence * .45));
    const voices = Math.min(1, localPeaks / 9) * (.6 + presence * .4);
    const spectralContrast = zonePeak.reduce((sum, peak, zone) => {
      const floor = Number.isFinite(zoneFloor[zone]) ? zoneFloor[zone] : 0;
      return sum + Math.max(0, peak - floor) / Math.max(.035, peak);
    }, 0) / zones.length;
    const activeFamilies = [target.bass, target.mid, target.treble].filter(value => value > .11 + target.overall * .12).length / 3;
    const harmonicLayers = Math.min(1, localPeaks / 8) * (1 - Math.min(.55, flatness * .5));
    const noisePenalty = Math.max(0, flatness - .48) * .32 + fluxValue * .1;
    const orchestrationDensity = Math.max(0, Math.min(1, (
      occupancy * .27
      + entropy * .18
      + spread * .18
      + harmonicLayers * .19
      + spectralContrast * .1
      + activeFamilies * .08
      - noisePenalty
    ) * (.55 + presence * .45)));
    if (audioState.orchestrationBaseline === null) audioState.orchestrationBaseline = orchestrationDensity;
    const previousOrchestration = audioState.previousOrchestration;
    const frameRise = Math.max(0, orchestrationDensity - previousOrchestration);
    const frameFall = Math.max(0, previousOrchestration - orchestrationDensity);
    audioState.previousOrchestration = orchestrationDensity;
    const baselineSpeed = orchestrationDensity > audioState.orchestrationBaseline ? .0015 : .0045;
    audioState.orchestrationBaseline += (orchestrationDensity - audioState.orchestrationBaseline) * baselineSpeed;
    const orchestrationDelta = Math.min(1,
      Math.max(0, orchestrationDensity - audioState.orchestrationBaseline) * 3.15
      + frameRise * 4.2
    );
    const persistenceTarget = orchestrationDensity > audioState.orchestrationBaseline + .045 ? 1 : orchestrationDensity > .5 ? .62 : 0;
    audioState.orchestrationPersistence += (persistenceTarget - audioState.orchestrationPersistence)
      * (persistenceTarget > audioState.orchestrationPersistence ? .018 : .01);
    const orchestrationPersistence = Math.max(0, Math.min(1, audioState.orchestrationPersistence));
    const orchestrationFall = Math.min(1, frameFall * 5.2 + Math.max(0, audioState.orchestrationBaseline - orchestrationDensity) * 2.2);
    const effectiveParts = Math.max(0, Math.min(6,
      zones.reduce((sum, value) => sum + value, 0) * .72
      + harmonicLayers * 1.4
      + activeFamilies * .7
    ));
    const richness = orchestrationDensity;

    // Acid is treated as a perceptual corrosion axis, not a genre classifier.
    // It looks for a prominent mid-band resonance that moves coherently, then
    // combines that with sharpness, roughness and fast spectral change.
    const acidFrom = Math.max(1, Math.floor(Math.log(70 / 25) / Math.log(16000 / 25) * ensembleBandCount));
    const acidTo = Math.min(ensembleBandCount - 2, Math.ceil(Math.log(6000 / 25) / Math.log(16000 / 25) * ensembleBandCount));
    let acidPeakIndex = acidFrom;
    let acidPeakValue = 0;
    let highWeighted = 0;
    for (let bandIndex = 0; bandIndex < ensembleBandCount; bandIndex++) {
      const value = ensembleBands[bandIndex];
      const position = bandIndex / Math.max(1, ensembleBandCount - 1);
      highWeighted += value * Math.pow(position, 1.65);
      if (bandIndex >= acidFrom && bandIndex <= acidTo && value > acidPeakValue) {
        acidPeakValue = value;
        acidPeakIndex = bandIndex;
      }
    }
    let neighborSum = 0;
    let neighborCount = 0;
    for (let offset = -3; offset <= 3; offset++) {
      if (Math.abs(offset) <= 1) continue;
      const bandIndex = Math.max(0, Math.min(ensembleBandCount - 1, acidPeakIndex + offset));
      neighborSum += ensembleBands[bandIndex];
      neighborCount++;
    }
    const neighborMean = neighborSum / Math.max(1, neighborCount);
    const resonance = Math.max(0, Math.min(1, (acidPeakValue - neighborMean) / Math.max(.035, acidPeakValue) * 1.75));
    const peakPosition = acidPeakIndex / Math.max(1, ensembleBandCount - 1);
    const peakDelta = peakPosition - audioState.acidPeakPosition;
    const direction = Math.sign(peakDelta);
    if (Math.abs(peakDelta) > .0025 && direction === audioState.acidSweepDirection) {
      audioState.acidSweepCoherence = Math.min(1, audioState.acidSweepCoherence + .11);
    } else {
      audioState.acidSweepCoherence *= .88;
    }
    if (direction) audioState.acidSweepDirection = direction;
    audioState.acidPeakPosition += (peakPosition - audioState.acidPeakPosition) * .42;
    const sweep = Math.min(1, Math.abs(peakDelta) * 18 * (.3 + audioState.acidSweepCoherence * .7));
    const sharpness = Math.min(1, highWeighted / Math.max(1e-5, ensembleTotal) * 2.25);
    const roughness = Math.min(1, flatness * .62 + fluxValue * .72);

    audioState.loudnessHistory.push(target.overall);
    if (audioState.loudnessHistory.length > 120) audioState.loudnessHistory.shift();
    let low = 1;
    let high = 0;
    for (const value of audioState.loudnessHistory) {
      low = Math.min(low, value);
      high = Math.max(high, value);
    }
    const dynamicRange = Math.min(1, (high - low) * 2.4);
    const onset = Math.min(1, Math.max(fluxValue * 1.25, audioState.accents.overall, audioState.accents.bass * .92, audioState.accents.treble * .78));
    const resonantSweep = Math.sqrt(Math.max(0, resonance * (.22 + sweep * .78)));
    const acid = Math.min(1, presence * (
      resonantSweep * .38
      + sharpness * .23
      + roughness * .19
      + fluxValue * .12
      + onset * .08
    ));
    const raw = {
      rms: Math.min(1, rms * 3.2),
      flux: fluxValue,
      centroid,
      flatness: Math.min(1, flatness),
      density,
      breadth,
      voices,
      richness,
      orchestrationDensity,
      orchestrationDelta,
      orchestrationPersistence,
      orchestrationFall,
      effectiveParts,
      acid,
      resonance,
      sweep,
      sharpness,
      roughness,
      dynamicRange,
      onset
    };
    for (const key of Object.keys(raw)) {
      const speed = ['flux', 'onset'].includes(key)
        ? .52
        : ['breadth', 'voices', 'richness', 'orchestrationDensity', 'orchestrationPersistence'].includes(key)
          ? raw[key] > audioState.features[key] ? .3 : .055
          : ['orchestrationDelta', 'orchestrationFall'].includes(key)
            ? raw[key] > audioState.features[key] ? .46 : .085
          : ['acid', 'resonance', 'sweep', 'sharpness', 'roughness'].includes(key)
            ? raw[key] > audioState.features[key] ? .36 : .075
          : raw[key] > audioState.features[key] ? .24 : .08;
      audioState.features[key] += (raw[key] - audioState.features[key]) * speed;
    }
    return audioState.features;
  }

  function updateRawSectionFrame(now) {
    if (!sectionFeatureExtractor || !audioState.sectionAnalyser || !audioState.context) return null;
    const interval = currentQualityLevel() === 0 ? 82 : currentQualityLevel() === 1 ? 66 : 52;
    if (now - audioState.sectionLastAt < interval) return null;
    audioState.sectionLastAt = now;
    if (audioState.playing) {
      audioState.sectionAnalyser.getFloatFrequencyData(audioState.sectionFloatData);
      audioState.sectionAnalyser.getByteTimeDomainData(audioState.sectionWaveData);
    }
    audioState.sectionFrame = sectionFeatureExtractor.update({
      spectrum: audioState.sectionFloatData,
      waveform: audioState.sectionWaveData,
      sampleRate: audioState.context.sampleRate,
      fftSize: audioState.sectionAnalyser.fftSize,
      playing: audioState.playing
    }, now);
    return audioState.sectionFrame;
  }

  const LIVE_SECTION_LABELS = { SPARSE: '稀疏', LAYERING: '加层', FULL: '全奏', CLIMAX: '高潮', DROP: '抽空', AFTERGLOW: '余波' };
  const liveHudChord = $('#fusionHudChord');
  const liveHudSection = $('#fusionHudSection');
  // The 段落 Lab panel's existing chord slot — in external mode it shows our
  // live chord engine, so section + live harmony sit together in one submenu.
  const liveLabChord = document.querySelector('[data-section-chord]');
  const liveLabChordConfidence = document.querySelector('[data-section-chord-confidence]');
  // Real-time chord (and live section) for external/system-audio monitoring,
  // where there is no XLD offline timeline. Drives the docked readout and feeds
  // the glitch chord channel. Local playback keeps using XLD's offline data.
  function updateLiveHarmony(now) {
    liveChordSignal.change *= 0.9;
    const external = stage?.dataset.fusionSource === 'external';
    if (!external || !audioState.playing || !audioState.chromaAnalyser || !liveHarmony) {
      if (liveChordKey) { liveChordKey = ''; liveHarmony?.reset?.(); }
      liveChordSignal.chord = '—';
      liveChordSignal.confidence = 0;
      return;
    }
    if (++liveChordFrame % 4 !== 0) return; // ~15 Hz is ample for chords
    audioState.chromaAnalyser.getFloatFrequencyData(audioState.chromaData);
    liveChord = liveHarmony.update(audioState.chromaData, audioState.context.sampleRate, audioState.chromaAnalyser.fftSize, true);
    liveChordSignal.chord = liveChord.label;
    liveChordSignal.confidence = liveChord.confidence;
    if (liveChord.label !== liveChordKey) {
      if (liveChordKey && liveChord.label !== 'N') {
        liveChordSignal.change = Math.max(liveChordSignal.change, Math.max(0.4, liveChord.confidence));
      }
      liveChordKey = liveChord.label;
    }
    if (liveHudChord) {
      liveHudChord.textContent = liveChord.label === 'N'
        ? 'CHORD —'
        : `CHORD ${liveChord.label} · ${Math.round(liveChord.confidence * 100)}%`;
    }
    if (liveHudSection) {
      const section = mappingOutput?.section;
      liveHudSection.textContent = `SECTION ${LIVE_SECTION_LABELS[section] || '实时'}`;
    }
    // Mirror into the 段落 Lab panel's chord slot (overrides its offline value
    // while monitoring live, so the lab shows the real-time chord).
    if (liveLabChord) liveLabChord.textContent = liveChord.label === 'N' ? '—' : liveChord.label;
    if (liveLabChordConfidence) liveLabChordConfidence.textContent = `${Math.round(liveChord.confidence * 100)}%`;
  }

  function getEnergy() {
    if (!audioState.analyser || !audioState.playing) {
      const idle = .025 + Math.sin(frame * .017) * .006;
      Object.keys(audioState.accents).forEach(key => { audioState.accents[key] *= .72; });
      return { bass: idle, mid: idle, treble: idle * .7, overall: idle };
    }
    audioState.analyser.smoothingTimeConstant = calibration.smoothing;
    audioState.analyser.getFloatFrequencyData(audioState.floatData);
    audioState.analyser.getByteFrequencyData(audioState.data);
    bandCache.clear();

    if (calibration.autoGain) {
      const peak = visiblePeakDb();
      const desired = Math.max(-12, Math.min(18, calibration.maxDb - 7 - peak));
      autoGainOffset += (desired - autoGainOffset) * .035;
    } else {
      autoGainOffset += (0 - autoGainOffset) * .08;
    }
    const rawTarget = {
      bass: averageHz(25, 220, false),
      mid: averageHz(220, 2400, false),
      treble: averageHz(2400, 12000, false),
      overall: averageHz(30, 14000, false)
    };
    const target = {
      bass: averageHz(25, 220),
      mid: averageHz(220, 2400),
      treble: averageHz(2400, 12000),
      overall: averageHz(30, 14000)
    };
    const accentGain = { bass: 5.2, mid: 6.2, treble: 8.4, overall: 5.4 };
    Object.keys(target).forEach(key => {
      const rise = Math.max(0, target[key] - audioState.instant[key]);
      const decay = key === 'treble' ? .58 : .7;
      audioState.accents[key] = Math.max(audioState.accents[key] * decay, Math.min(1, rise * accentGain[key]));
      audioState.instant[key] = target[key];
    });
    updateAudioFeatures(rawTarget);
    const energy = audioState.energy;
    Object.keys(energy).forEach(key => {
      energy[key] += (target[key] - energy[key]) * (target[key] > energy[key] ? .28 : .09);
    });
    return energy;
  }

  function updateRealtimeProviderFrame(energy, now) {
    if (!realtimeProviderAdapter) return null;
    const internal = audioState.sourceKind === 'internal';
    const media = internal ? audioState.mediaElement : null;
    const connected = Boolean(
      audioState.started
      && audioState.source
      && audioState.analyser
      && audioState.context
    );
    const sampling = Boolean(
      connected
      && audioState.playing
      && audioState.context.state === 'running'
    );
    const deltaMs = realtimeProviderLastAt
      ? Math.max(0, now - realtimeProviderLastAt)
      : 0;
    realtimeProviderLastAt = now;
    realtimeProviderFrame = realtimeProviderAdapter.update({
      clock: { frameIndex: frame, nowMs: now, deltaMs },
      transport: {
        mode: internal ? 'internal' : 'external',
        state: audioState.playing
          ? 'playing'
          : audioState.started ? 'paused' : 'stopped',
        trackId: null,
        mediaTimeMs: media && Number.isFinite(media.currentTime)
          ? media.currentTime * 1000
          : null,
        durationMs: media && Number.isFinite(media.duration)
          ? media.duration * 1000
          : null,
        epoch: 0
      },
      connected,
      sample: sampling ? {
        sampledAtMs: now,
        loudness: Math.min(1, energy.overall * 1.18),
        bass: energy.bass,
        mid: energy.mid,
        treble: energy.treble,
        flux: audioState.features.flux,
        onset: Math.max(
          audioState.features.onset,
          audioState.accents.overall
        ),
        bassPeak: audioState.accents.bass,
        silence: energy.overall < .022 && audioState.features.rms < .02
          ? 1
          : 0
      } : null
    });
    return realtimeProviderFrame;
  }

  function spectrumValue(index, total) {
    if (!audioState.playing || !audioState.floatData?.length) {
      return .018 + Math.max(0, Math.sin(frame * .025 + index * .36)) * .01;
    }
    if (!bandCache.has(total)) {
      const values = new Float32Array(total);
      for (let i = 0; i < total; i++) {
        const from = frequencyAt(i / total);
        const to = frequencyAt((i + 1) / total);
        const center = calibration.scale === 'log' ? Math.sqrt(from * to) : (from + to) * .5;
        values[i] = mappedValue(averageBandDb(from, to), center);
      }
      bandCache.set(total, values);
    }
    return bandCache.get(total)[index] || 0;
  }

  function drawGrid(horizon = .74) {
    const y0 = h * horizon;
    ctx.save();
    ctx.strokeStyle = `rgba(${currentPalette.main.join(',')},.052)`;
    ctx.lineWidth = 1;
    for (let y = y0; y < h; y += 18) {
      ctx.beginPath();
      ctx.moveTo(0, y + .5);
      ctx.lineTo(w, y + .5);
      ctx.stroke();
    }
    for (let x = 0; x < w; x += Math.max(48, w / 20)) {
      ctx.beginPath();
      ctx.moveTo(x + .5, y0);
      ctx.lineTo(x + .5, h);
      ctx.stroke();
    }
    ctx.restore();
  }

  function formatFrequency(value) {
    if (value >= 1000) return `${Number((value / 1000).toFixed(value < 10000 ? 1 : 0))}k`;
    return String(Math.round(value));
  }

  function drawSpectrumScale(pad, baseY, maxHeight) {
    const top = baseY - maxHeight;
    const frequencyTicks = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
    const dbTicks = [calibration.minDb, (calibration.minDb + calibration.maxDb) * .5, calibration.maxDb];
    ctx.save();
    ctx.lineWidth = 1;
    ctx.font = '8px "Segoe UI", sans-serif';
    ctx.textBaseline = 'top';
    for (const frequency of frequencyTicks) {
      if (frequency < calibration.minFreq || frequency > calibration.maxFreq) continue;
      const position = frequencyPosition(frequency);
      const x = pad + position * (w - pad * 2);
      ctx.strokeStyle = `rgba(${currentPalette.main.join(',')},.08)`;
      ctx.beginPath();
      ctx.moveTo(x + .5, top);
      ctx.lineTo(x + .5, baseY + 4);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.28)';
      ctx.textAlign = position < .04 ? 'left' : position > .96 ? 'right' : 'center';
      ctx.fillText(formatFrequency(frequency), x, baseY + 9);
    }
    for (const db of dbTicks) {
      const position = (db - calibration.minDb) / (calibration.maxDb - calibration.minDb);
      const y = baseY - position * maxHeight;
      ctx.strokeStyle = `rgba(${currentPalette.hot.join(',')},${db === calibration.maxDb ? .12 : .07})`;
      ctx.beginPath();
      ctx.moveTo(pad, y + .5);
      ctx.lineTo(w - pad, y + .5);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.25)';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${Math.round(db)} dB`, pad - 7, y);
    }
    ctx.restore();
  }

  function drawSpectrum(energy) {
    const pad = Math.max(24, w * .07);
    const available = w - pad * 2;
    const bars = Math.max(36, Math.min(88, Math.floor(available / 13)));
    const gap = Math.max(2, Math.min(5, available / bars * .25));
    const barWidth = (available - gap * (bars - 1)) / bars;
    const baseY = h * .72;
    const maxHeight = Math.min(h * .48, 430);
    const segment = Math.max(6, Math.min(10, h / 90));

    drawSpectrumScale(pad, baseY, maxHeight);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < bars; i++) {
      const target = Math.min(1, spectrumValue(i, bars) * intensity);
      const response = target > (spectrumLevels[i] || 0) ? .58 - calibration.smoothing * .18 : .22 - calibration.smoothing * .12;
      spectrumLevels[i] = (spectrumLevels[i] || 0) + (target - (spectrumLevels[i] || 0)) * response;
      spectrumPeaks[i] = Math.max(spectrumLevels[i], (spectrumPeaks[i] || 0) - .008);
      const value = spectrumLevels[i];
      const height = Math.max(segment, value * maxHeight);
      const x = pad + i * (barWidth + gap);
      const count = Math.max(1, Math.ceil(height / segment));
      for (let s = 0; s < count; s++) {
        const y = baseY - (s + 1) * segment;
        const progress = s / Math.max(1, count - 1);
        const color = progress > .68 ? currentPalette.hot : currentPalette.main;
        ctx.fillStyle = `rgba(${color.join(',')},${.27 + progress * .66})`;
        ctx.fillRect(x, y, barWidth, Math.max(2, segment - 2));
      }
      ctx.fillStyle = `rgba(${currentPalette.hot.join(',')},.92)`;
      ctx.fillRect(x, baseY - spectrumPeaks[i] * maxHeight - 3, barWidth, 2);
      ctx.globalAlpha = .15;
      ctx.fillStyle = `rgb(${currentPalette.main.join(',')})`;
      ctx.fillRect(x, baseY + 4, barWidth, Math.min(height * .22, h - baseY - 10));
      ctx.globalAlpha = 1;
    }
    ctx.shadowBlur = 16 + energy.treble * 20;
    ctx.shadowColor = `rgb(${currentPalette.hot.join(',')})`;
    ctx.fillStyle = `rgba(${currentPalette.hot.join(',')},${.2 + energy.bass * .42})`;
    ctx.fillRect(pad, baseY, available, 1);
    ctx.restore();
  }

  function drawMirrorSpectrum(energy) {
    const pad = Math.max(24, w * .06);
    const available = w - pad * 2;
    const bars = Math.max(32, Math.min(80, Math.floor(available / 14)));
    const gap = 3;
    const barWidth = (available - gap * (bars - 1)) / bars;
    const center = h * .5;
    const maxHeight = Math.min(h * .38, 300);
    const gradient = ctx.createLinearGradient(0, center - maxHeight, 0, center + maxHeight);
    gradient.addColorStop(0, `rgba(${currentPalette.hot.join(',')},.9)`);
    gradient.addColorStop(.5, `rgba(${currentPalette.main.join(',')},.25)`);
    gradient.addColorStop(1, `rgba(${currentPalette.hot.join(',')},.9)`);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = gradient;
    ctx.shadowBlur = 10 + energy.treble * 18;
    ctx.shadowColor = `rgb(${currentPalette.main.join(',')})`;
    for (let i = 0; i < bars; i++) {
      const target = Math.min(1, spectrumValue(i, bars) * intensity);
      mirrorLevels[i] = (mirrorLevels[i] || 0) + (target - (mirrorLevels[i] || 0)) * .3;
      const height = 2 + mirrorLevels[i] * maxHeight;
      const x = pad + i * (barWidth + gap);
      ctx.fillRect(x, center - height, barWidth, height - 2);
      ctx.fillRect(x, center + 2, barWidth, height - 2);
    }
    ctx.globalAlpha = .32;
    ctx.fillRect(pad, center, available, 1);
    ctx.restore();
  }

  function drawWaveform(energy) {
    drawGrid(.7);
    const samples = audioState.waveData;
    if (audioState.playing && audioState.analyser && samples) audioState.analyser.getByteTimeDomainData(samples);
    const pad = Math.max(28, w * .055);
    const centerY = h * .5;
    const amplitude = Math.min(h * .31, 260) * intensity;
    const gradient = ctx.createLinearGradient(pad, 0, w - pad, 0);
    gradient.addColorStop(0, `rgba(${currentPalette.main.join(',')},.18)`);
    gradient.addColorStop(.5, `rgba(${currentPalette.hot.join(',')},1)`);
    gradient.addColorStop(1, `rgba(${currentPalette.main.join(',')},.18)`);

    const trace = (mirror, alpha, width) => {
      ctx.beginPath();
      const count = samples?.length || 512;
      for (let i = 0; i < count; i++) {
        const idle = Math.sin(i * .055 + frame * .018) * .012;
        const sample = audioState.playing && samples ? (samples[i] - 128) / 128 : idle;
        const x = pad + i / (count - 1) * (w - pad * 2);
        const y = centerY + sample * amplitude * mirror;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.globalAlpha = alpha;
      ctx.lineWidth = width;
      ctx.stroke();
    };

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = gradient;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowBlur = 12 + energy.treble * 24;
    ctx.shadowColor = `rgb(${currentPalette.hot.join(',')})`;
    trace(1, .95, 2.1);
    trace(-1, .18, 1);
    ctx.restore();
  }

  function drawRadialSpectrum(energy) {
    const cx = w * .5;
    const cy = h * .49;
    const size = Math.min(w, h);
    const inner = size * (.14 + energy.bass * .025);
    const maxLength = size * .25 * intensity;
    const bars = w < 700 ? 72 : 104;
    const rotation = frame * .0012;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.lineCap = 'round';
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    for (let i = 0; i < bars; i++) {
      const mirrored = i < bars / 2 ? i : bars - i - 1;
      const value = Math.min(1, spectrumValue(mirrored, bars / 2) * intensity);
      const angle = i / bars * Math.PI * 2;
      const length = 3 + value * maxLength;
      const color = value > .56 ? currentPalette.hot : currentPalette.main;
      ctx.strokeStyle = `rgba(${color.join(',')},${.25 + value * .72})`;
      ctx.lineWidth = 1.2 + value * 2.4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      ctx.lineTo(Math.cos(angle) * (inner + length), Math.sin(angle) * (inner + length));
      ctx.stroke();
    }
    ctx.rotate(-rotation);
    ctx.shadowBlur = 18 + energy.bass * 28;
    ctx.shadowColor = `rgb(${currentPalette.hot.join(',')})`;
    ctx.strokeStyle = `rgba(${currentPalette.hot.join(',')},${.22 + energy.overall * .6})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, inner * .82, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, inner * (1.04 + energy.bass * .08), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function mixColor(a, b, amount) {
    return a.map((value, index) => Math.round(value + (b[index] - value) * amount));
  }

  function waterfallColor(value) {
    const level = Math.max(0, Math.min(1, Math.pow(Math.max(0, value - .025) / .975, 1.18)));
    if (level < .22) return mixColor([3, 5, 14], currentPalette.dark, level / .22);
    if (level < .52) return mixColor(currentPalette.dark, currentPalette.main, (level - .22) / .3);
    if (level < .8) return mixColor(currentPalette.main, currentPalette.hot, (level - .52) / .28);
    return mixColor(currentPalette.hot, [245, 250, 255], (level - .8) / .2);
  }

  function updateWaterfallHistory(now) {
    const width = waterfallCanvas.width;
    const height = waterfallCanvas.height;
    if (!audioState.playing || !width || now - waterfallState.lastUpdateAt < 55) return;
    waterfallState.lastUpdateAt = now;
    waterfallCtx.drawImage(waterfallCanvas, 0, 1, width, height - 1, 0, 0, width, height - 1);
    waterfallCtx.fillStyle = 'rgba(2,3,10,.012)';
    waterfallCtx.fillRect(0, 0, width, height - 1);
    for (let x = 0; x < width; x++) {
      const value = Math.min(1, spectrumValue(x, width) * intensity);
      const color = waterfallColor(value);
      waterfallCtx.fillStyle = `rgb(${color.join(',')})`;
      waterfallCtx.fillRect(x, height - 1, 1, 1);
    }
    waterfallState.primed = true;
  }

  function drawWaterfall() {
    ctx.save();
    ctx.globalAlpha = .97;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(waterfallCanvas, 0, 0, w, h);
    const scan = ctx.createLinearGradient(0, 0, 0, h);
    scan.addColorStop(0, 'rgba(0,0,0,.32)');
    scan.addColorStop(.72, 'rgba(0,0,0,.03)');
    scan.addColorStop(.982, 'rgba(255,255,255,0)');
    scan.addColorStop(1, 'rgba(255,255,255,.12)');
    ctx.fillStyle = scan;
    ctx.fillRect(0, 0, w, h);

    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
    ctx.font = '500 9px "Segoe UI", sans-serif';
    ctx.textBaseline = 'bottom';
    const frequencyTicks = [20, 100, 500, 1000, 5000, 10000, 20000];
    frequencyTicks.forEach((frequency, index) => {
      const x = frequencyPosition(frequency) * w;
      ctx.strokeStyle = 'rgba(255,255,255,.055)';
      ctx.beginPath();
      ctx.moveTo(x + .5, 0);
      ctx.lineTo(x + .5, h);
      ctx.stroke();
      ctx.fillStyle = index === 0 || index === frequencyTicks.length - 1 ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.2)';
      ctx.textAlign = index === 0 ? 'left' : index === frequencyTicks.length - 1 ? 'right' : 'center';
      ctx.fillText(formatFrequency(frequency), x, h - 14);
    });
    for (let row = 1; row < 8; row++) {
      const y = row / 8 * h;
      ctx.strokeStyle = 'rgba(255,255,255,.035)';
      ctx.beginPath();
      ctx.moveTo(0, y + .5);
      ctx.lineTo(w, y + .5);
      ctx.stroke();
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = `rgba(${currentPalette.hot.join(',')},.5)`;
    ctx.fillText(waterfallState.primed ? 'HISTORY  ↑' : 'BUILDING HISTORY', w - 18, 21);
    ctx.fillStyle = `rgba(${currentPalette.hot.join(',')},.7)`;
    ctx.fillText('NOW', w - 18, h - 18);
    ctx.restore();
  }

  function drawVuMeter(x, y, radius, level, label, readout) {
    const start = Math.PI * 1.15;
    const end = Math.PI * 1.85;
    ctx.save();
    ctx.translate(x, y);
    const panelX = -radius * 1.14;
    const panelY = -radius * 1.08;
    const panelW = radius * 2.28;
    const panelH = radius * 1.42;
    const face = ctx.createLinearGradient(0, panelY, 0, panelY + panelH);
    face.addColorStop(0, 'rgba(245,239,214,.13)');
    face.addColorStop(.58, 'rgba(80,76,72,.1)');
    face.addColorStop(1, 'rgba(5,7,12,.48)');
    ctx.fillStyle = 'rgba(3,5,10,.7)';
    ctx.fillRect(panelX - 5, panelY - 5, panelW + 10, panelH + 10);
    ctx.fillStyle = face;
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    ctx.lineWidth = 1;
    ctx.strokeRect(panelX + .5, panelY + .5, panelW - 1, panelH - 1);
    [[panelX + 9, panelY + 9], [panelX + panelW - 9, panelY + 9], [panelX + 9, panelY + panelH - 9], [panelX + panelW - 9, panelY + panelH - 9]].forEach(([sx, sy]) => {
      ctx.fillStyle = 'rgba(255,255,255,.12)';
      ctx.beginPath();
      ctx.arc(sx, sy, 2.2, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.strokeStyle = `rgba(${currentPalette.main.join(',')},.34)`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, radius, start, end);
    ctx.stroke();

    for (let i = 0; i <= 20; i++) {
      const angle = start + (end - start) * i / 20;
      const major = i % 5 === 0;
      const inner = radius - (major ? 15 : 8);
      ctx.strokeStyle = i > 16 ? 'rgba(255,105,84,.8)' : `rgba(${currentPalette.hot.join(',')},${major ? .72 : .32})`;
      ctx.lineWidth = major ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      ctx.stroke();
    }

    const needleAngle = start + (end - start) * Math.min(1, level);
    ctx.shadowBlur = 16;
    ctx.shadowColor = `rgb(${currentPalette.hot.join(',')})`;
    ctx.strokeStyle = `rgb(${currentPalette.hot.join(',')})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(needleAngle) * (radius - 12), Math.sin(needleAngle) * (radius - 12));
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = `rgb(${currentPalette.main.join(',')})`;
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.42)';
    ctx.font = '600 10px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, 0, -radius * .26);
    ctx.font = '8px "Segoe UI", sans-serif';
    ctx.fillText('−40   −20   −10    0', 0, -radius * .48);
    ctx.fillStyle = 'rgba(255,255,255,.26)';
    ctx.font = '600 9px "Segoe UI", sans-serif';
    ctx.fillText(readout, 0, radius * .12);
    ctx.fillStyle = level > .86 ? 'rgba(255,87,68,.92)' : 'rgba(255,255,255,.08)';
    ctx.beginPath();
    ctx.arc(radius * .92, -radius * .88, 3.5, 0, Math.PI * 2);
    ctx.fill();
    const glass = ctx.createLinearGradient(panelX, panelY, panelX + panelW, panelY + panelH);
    glass.addColorStop(0, 'rgba(255,255,255,.055)');
    glass.addColorStop(.42, 'rgba(255,255,255,0)');
    glass.addColorStop(1, 'rgba(255,255,255,.018)');
    ctx.fillStyle = glass;
    ctx.fillRect(panelX + 1, panelY + 1, panelW - 2, panelH - 2);
    ctx.restore();
  }

  function drawVu(energy) {
    const levelDb = audioState.playing
      ? Math.max(-72, Math.min(0, 20 * Math.log10(Math.max(1e-6, audioState.rawRms))))
      : -72;
    const meterLevel = db => Math.pow(Math.max(0, Math.min(1, (db + 42) / 42)), 1.22);
    const levelTarget = meterLevel(levelDb);
    const centroidMotion = Math.min(1, Math.abs(audioState.features.centroid - vuState.previousCentroid) * 5);
    vuState.previousCentroid = audioState.features.centroid;
    const detailRaw = audioState.playing ? Math.min(1,
      audioState.features.density * .26 +
      audioState.features.flux * .28 +
      energy.treble * .18 +
      audioState.accents.treble * .18 +
      centroidMotion * .1
    ) : 0;
    vuState.detailBaseline += (detailRaw - vuState.detailBaseline) * (detailRaw > vuState.detailBaseline ? .012 : .004);
    const detailTarget = audioState.playing
      ? Math.min(1, detailRaw * .62 + Math.max(0, detailRaw - vuState.detailBaseline) * 1.75)
      : 0;
    vuLevels[0] += (levelTarget - vuLevels[0]) * (levelTarget > vuLevels[0] ? .14 : .035);
    vuLevels[1] += (detailTarget - vuLevels[1]) * (detailTarget > vuLevels[1] ? .3 : .085);
    const radius = Math.min(w * .2, h * .33, 250);
    const y = h * .67;
    drawVuMeter(w * .28, y, radius, vuLevels[0], 'LEVEL', `${Math.round(levelDb)} dBFS`);
    drawVuMeter(w * .72, y, radius, vuLevels[1], 'DETAIL', `${Math.round(detailTarget * 100)}% MOTION`);
  }

  function traceSmoothRibbon(points) {
    if (points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let index = 0; index < points.length - 1; index++) {
      const p0 = points[Math.max(0, index - 1)];
      const p1 = points[index];
      const p2 = points[index + 1];
      const p3 = points[Math.min(points.length - 1, index + 2)];
      ctx.bezierCurveTo(
        p1.x + (p2.x - p0.x) / 6,
        p1.y + (p2.y - p0.y) / 6,
        p2.x - (p3.x - p1.x) / 6,
        p2.y - (p3.y - p1.y) / 6,
        p2.x,
        p2.y
      );
    }
  }

  function channelSpectrumValue(data, analyser, index, total) {
    if (!audioState.playing || !data?.length || !analyser || !audioState.context) return spectrumValue(index, total);
    const from = frequencyAt(index / total);
    const to = frequencyAt((index + 1) / total);
    const binHz = audioState.context.sampleRate / analyser.fftSize;
    const start = Math.max(0, Math.min(data.length - 1, Math.floor(from / binHz)));
    const end = Math.max(start + 1, Math.min(data.length, Math.ceil(to / binHz)));
    let amplitude = 0;
    for (let bin = start; bin < end; bin++) {
      const db = analyser.minDecibels + data[bin] / 255 * (analyser.maxDecibels - analyser.minDecibels);
      amplitude += Math.pow(10, db / 20);
    }
    const averageDb = 20 * Math.log10(Math.max(1e-6, amplitude / Math.max(1, end - start)));
    const center = calibration.scale === 'log' ? Math.sqrt(from * to) : (from + to) * .5;
    return mappedValue(averageDb, center);
  }

  function capturePulsarProfile(energy, now) {
    const budget = currentQualityBudget();
    const fastMotion = Math.min(1, Math.max(audioState.features.onset, audioState.features.flux, audioState.accents.treble));
    const captureInterval = Math.max(90, budget.pulsarCaptureMs - fastMotion * 28);
    if (now - pulsarState.lastCaptureAt < captureInterval) return false;
    pulsarState.lastCaptureAt = now;
    pulsarState.captureInterval = captureInterval;
    const samples = Math.max(80, Math.min(budget.pulsarSamples, Math.round(w / 8)));
    const sourceSamples = Math.max(96, samples);
    const profile = new Float32Array(samples);
    const trebleMotion = Math.min(1, audioState.accents.treble * .75 + audioState.features.flux * .45);
    let leftData = audioState.leftData;
    let rightData = audioState.rightData;
    if (pulsarState.layout === 'stereo' && audioState.playing && audioState.leftAnalyser && audioState.rightAnalyser) {
      audioState.leftAnalyser.smoothingTimeConstant = calibration.smoothing;
      audioState.rightAnalyser.smoothingTimeConstant = calibration.smoothing;
      audioState.leftAnalyser.getByteFrequencyData(leftData);
      audioState.rightAnalyser.getByteFrequencyData(rightData);
      let leftPower = 0;
      let rightPower = 0;
      for (let index = 0; index < leftData.length; index += 8) {
        leftPower += leftData[index];
        rightPower += rightData[index];
      }
      pulsarState.stereoAvailable = rightPower > Math.max(12, leftPower * .015);
      if (!pulsarState.stereoAvailable) rightData = leftData;
    }
    for (let index = 0; index < samples; index++) {
      const position = index / Math.max(1, samples - 1);
      const folded = Math.abs(position - .5) * 2;
      const frequencyPosition = pulsarState.layout === 'sweep'
        ? position
        : Math.pow(folded, .82);
      const sourceIndex = Math.min(sourceSamples - 1, Math.floor(frequencyPosition * sourceSamples));
      let spectrum;
      if (pulsarState.layout === 'stereo') {
        const channelData = position < .5 ? leftData : rightData;
        const channelAnalyser = position < .5 ? audioState.leftAnalyser : audioState.rightAnalyser;
        spectrum = channelSpectrumValue(channelData, channelAnalyser, sourceIndex, sourceSamples);
      } else {
        spectrum = spectrumValue(sourceIndex, sourceSamples);
      }
      spectrum = Math.max(0, spectrum - .018);
      const highPosition = pulsarState.layout === 'sweep' ? position : folded;
      const spectralEnvelope = .32 + Math.pow(Math.max(0, 1 - highPosition), .62) * .68;
      const highRipple = Math.sin(index * .74 + now * .018) * trebleMotion * .032 * Math.pow(highPosition, .55);
      profile[index] = Math.max(0, Math.min(1, Math.pow(spectrum, 1.12) * spectralEnvelope + highRipple));
    }
    for (let pass = 0; pass < 2; pass++) {
      for (let index = 1; index < samples - 1; index++) {
        profile[index] = profile[index] * .58 + (profile[index - 1] + profile[index + 1]) * .21;
      }
    }
    const sample = {
      profile,
      amplitude: .55 + energy.overall * .72 + audioState.accents.overall * .34,
      treble: trebleMotion,
      onset: audioState.features.onset
    };
    const maxRows = Math.max(28, Math.min(budget.pulsarRows, Math.round(h / 11)));
    if (!pulsarState.history.length) {
      for (let index = 0; index < maxRows; index++) {
        pulsarState.history.push({
          ...sample,
          profile: Float32Array.from(profile, value => value * (.25 + index / Math.max(1, maxRows - 1) * .75))
        });
      }
    }
    pulsarState.history.push(sample);
    // Keep one extra row so the oldest and newest rows can leave/enter smoothly
    // during the interval between audio profile captures.
    if (pulsarState.history.length > maxRows + 1) pulsarState.history.splice(0, pulsarState.history.length - maxRows - 1);
    return true;
  }

  function drawPulsar(energy, now) {
    capturePulsarProfile(energy, now);
    const budget = currentQualityBudget();
    if (now - pulsarState.lastDrawAt < budget.pulsarFrameMs) return;
    pulsarState.lastDrawAt = now;
    const neon = pulsarState.mode === 'neon';
    ctx.save();
    ctx.fillStyle = neon ? `rgb(${currentPalette.dark.map(value => Math.round(value * .15)).join(',')})` : '#020204';
    ctx.fillRect(0, 0, w, h);
    const maxRows = Math.max(28, Math.min(budget.pulsarRows, Math.round(h / 11)));
    const history = pulsarState.history;
    const start = Math.max(0, history.length - maxRows - 1);
    const rowCount = history.length - start;
    if (!rowCount) {
      ctx.restore();
      return;
    }
    const pad = Math.max(32, w * .075);
    const top = h * .12;
    const bottom = h * .85;
    const spacing = (bottom - top) / Math.max(1, Math.min(maxRows, rowCount) - 1);
    const maxLift = Math.min(h * .145, 150);
    const background = neon ? `rgba(${currentPalette.dark.join(',')},.94)` : 'rgba(2,2,4,.98)';
    const scrolling = rowCount > maxRows;
    const scrollPhase = scrolling
      ? Math.max(0, Math.min(1, (now - pulsarState.lastCaptureAt) / Math.max(1, pulsarState.captureInterval)))
      : 0;
    for (let row = 0; row < rowCount; row++) {
      const sample = history[start + row];
      const depth = Math.max(0, Math.min(1, (row - scrollPhase) / Math.max(1, maxRows - 1)));
      const baseline = top + (row - scrollPhase) * spacing;
      const lift = maxLift * (.58 + depth * .48) * sample.amplitude;
      if (baseline < top - maxLift * 1.5 || baseline > bottom + spacing * 1.5) continue;
      const denominator = Math.max(1, sample.profile.length - 1);
      const usableWidth = w - pad * 2;
      ctx.beginPath();
      ctx.moveTo(pad, baseline - sample.profile[0] * lift);
      for (let index = 1; index < sample.profile.length; index++) {
        ctx.lineTo(pad + index / denominator * usableWidth, baseline - sample.profile[index] * lift);
      }
      ctx.lineTo(w - pad, bottom + spacing * 2);
      ctx.lineTo(pad, bottom + spacing * 2);
      ctx.closePath();
      ctx.fillStyle = background;
      ctx.fill();

      const rowColor = neon ? mixColor(currentPalette.main, currentPalette.hot, depth) : [238, 240, 248];
      ctx.beginPath();
      ctx.moveTo(pad, baseline - sample.profile[0] * lift);
      for (let index = 1; index < sample.profile.length; index++) {
        ctx.lineTo(pad + index / denominator * usableWidth, baseline - sample.profile[index] * lift);
      }
      ctx.strokeStyle = `rgba(${rowColor.join(',')},${.28 + depth * .66})`;
      ctx.lineWidth = .72 + depth * .72 + sample.onset * .25;
      ctx.lineJoin = 'round';
      const glowStart = Math.max(0, rowCount - budget.pulsarGlowRows);
      ctx.shadowBlur = neon && budget.pulsarGlowRows > 0 && row >= glowStart ? 5 + sample.treble * 7 : 0;
      ctx.shadowColor = `rgba(${rowColor.join(',')},.65)`;
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = neon ? `rgba(${currentPalette.hot.join(',')},.5)` : 'rgba(255,255,255,.32)';
    ctx.font = '600 8px "Segoe UI", sans-serif';
    const layoutLabel = pulsarState.layout === 'sweep'
      ? 'LEFT LOW → RIGHT HIGH'
      : pulsarState.layout === 'stereo'
        ? `LEFT / RIGHT CHANNEL${pulsarState.stereoAvailable ? '' : ' · MONO FALLBACK'}`
        : 'FOLDED LOG SPECTRUM';
    ctx.fillText(`PSR B1919+21  ·  ${layoutLabel}`, pad, h - 28);
    ctx.restore();
  }

  function setPulsarLayout(layout, persist = true, notify = true) {
    const next = ['folded', 'sweep', 'stereo'].includes(layout) ? layout : 'folded';
    pulsarState.layout = next;
    pulsarState.history.length = 0;
    pulsarState.lastCaptureAt = 0;
    pulsarState.lastDrawAt = 0;
    setStereoAnalysisEnabled(next === 'stereo');
    const labels = { folded: 'Fold Spectrum', sweep: 'Frequency Sweep', stereo: 'Stereo L / R' };
    const messageFallbacks = {
      folded: '脉冲星 · 低频居中，频谱向两翼折叠',
      sweep: '脉冲星 · 左侧低频，右侧高频',
      stereo: '脉冲星 · 左右声道各占半幅；单声道会自动镜像回退'
    };
    bindUiText(pulsarLayoutButton, `runtime.pulsar.layout.${next}`, labels[next]);
    if (persist) {
      try { localStorage.setItem('xins-fusion-pulsar-layout', next); } catch (_) {}
    }
    if (notify) showToast(uiText(`runtime.pulsar.layoutToast.${next}`, messageFallbacks[next]));
    return next;
  }

  function setPulsarMode(mode, persist = true, notify = true) {
    pulsarState.mode = mode === 'neon' ? 'neon' : 'mono';
    bindUiText(
      pulsarStyleButton,
      pulsarState.mode === 'mono' ? 'runtime.pulsar.mode.mono' : 'runtime.pulsar.mode.neon',
      pulsarState.mode === 'mono' ? 'Ink Mono' : 'EVA Neon'
    );
    if (persist) {
      try { localStorage.setItem('xins-fusion-pulsar-mode', pulsarState.mode); } catch (_) {}
    }
    if (notify) showToast(pulsarState.mode === 'mono'
      ? uiText('runtime.pulsar.modeToast.mono', '脉冲星 · Unknown 黑白模式')
      : uiText('runtime.pulsar.modeToast.neon', '脉冲星 · EVA 霓虹模式'));
    return pulsarState.mode;
  }

  function drawRibbons(energy) {
    const points = Math.max(64, Math.min(112, Math.floor(w / 11)));
    const pad = Math.max(28, w * .055);
    const usable = w - pad * 2;
    while (ribbonSpectrumLevels.length < points) ribbonSpectrumLevels.push(0);
    while (ribbonFastLevels.length < points) ribbonFastLevels.push(0);
    while (ribbonPreviousRaw.length < points) ribbonPreviousRaw.push(0);
    while (ribbonTransientLevels.length < points) ribbonTransientLevels.push(0);
    if (ribbonSpectrumLevels.length > points) ribbonSpectrumLevels.length = points;
    ribbonFastLevels.length = points;
    ribbonPreviousRaw.length = points;
    ribbonTransientLevels.length = points;
    let highFlux = 0;
    let highWeightTotal = 0;
    for (let i = 0; i < points; i++) {
      const left = spectrumValue(Math.max(0, i - 1), points);
      const center = spectrumValue(i, points);
      const right = spectrumValue(Math.min(points - 1, i + 1), points);
      const raw = left * .22 + center * .56 + right * .22;
      const normalized = i / (points - 1);
      const highWeight = Math.max(0, Math.min(1, (normalized - .46) / .42));
      const transient = Math.max(0, raw - ribbonPreviousRaw[i]);
      ribbonTransientLevels[i] = Math.max(ribbonTransientLevels[i] * .42, transient);
      ribbonPreviousRaw[i] = raw;
      highFlux += transient * highWeight;
      highWeightTotal += highWeight;
      const slowResponse = .055 + highWeight * .075;
      ribbonSpectrumLevels[i] += (raw - ribbonSpectrumLevels[i]) * slowResponse;
      const fastResponse = raw > ribbonFastLevels[i] ? .26 + highWeight * .32 : .11 + highWeight * .09;
      ribbonFastLevels[i] += (raw - ribbonFastLevels[i]) * fastResponse;
    }
    const smoothSpectrum = ribbonSpectrumLevels.map((value, index) => {
      const a = ribbonSpectrumLevels[Math.max(0, index - 2)];
      const b = ribbonSpectrumLevels[Math.max(0, index - 1)];
      const d = ribbonSpectrumLevels[Math.min(points - 1, index + 1)];
      const e = ribbonSpectrumLevels[Math.min(points - 1, index + 2)];
      return (a + b * 2 + value * 3 + d * 2 + e) / 9;
    });
    smoothSpectrum.forEach((value, index) => { ribbonSpectrumLevels[index] += (value - ribbonSpectrumLevels[index]) * .28; });
    const highAccent = Math.min(1, Math.max(audioState.accents.treble, highFlux / Math.max(.001, highWeightTotal) * 22));

    const glow = ctx.createRadialGradient(w * .5, h * .52, 0, w * .5, h * .52, Math.max(w, h) * .58);
    glow.addColorStop(0, `rgba(${currentPalette.main.join(',')},${.08 + energy.bass * .16})`);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (let layer = 0; layer < 6; layer++) {
      const center = h * (.32 + layer * .072);
      const phase = frame * (.0042 + layer * .00045);
      const amplitude = h * (.055 + energy.bass * .04) * intensity;
      const gradient = ctx.createLinearGradient(pad, 0, w - pad, 0);
      gradient.addColorStop(0, `rgba(${currentPalette.main.join(',')},.03)`);
      gradient.addColorStop(.42, `rgba(${(layer % 2 ? currentPalette.hot : currentPalette.main).join(',')},${.42 - layer * .035})`);
      gradient.addColorStop(.68, `rgba(${(layer % 2 ? currentPalette.main : currentPalette.hot).join(',')},${.78 - layer * .06})`);
      gradient.addColorStop(1, `rgba(${currentPalette.hot.join(',')},.04)`);
      const ribbonPoints = [];
      for (let i = 0; i < points; i++) {
        const x = pad + i / (points - 1) * usable;
        const spectrum = smoothSpectrum[i];
        const fastSpectrum = (
          ribbonFastLevels[Math.max(0, i - 1)]
          + ribbonFastLevels[i] * 2
          + ribbonFastLevels[Math.min(points - 1, i + 1)]
        ) / 4;
        const normalized = i / (points - 1);
        const highWeight = Math.max(0, Math.min(1, (normalized - .46) / .42));
        const primary = Math.sin(normalized * Math.PI * 3.2 + phase + layer * .78);
        const secondary = Math.sin(normalized * Math.PI * 1.35 - phase * .62 + layer * 1.14) * .34;
        const wave = (primary + secondary) * amplitude * (.34 + spectrum * 1.48);
        const trebleRipple = Math.sin(normalized * Math.PI * (8.5 + layer * .35) - frame * (.026 + layer * .0015))
          * amplitude * highWeight * (fastSpectrum * .2 + highAccent * .1);
        const y = center + wave + trebleRipple + (spectrum - .3) * amplitude * .72 * (layer % 2 ? -1 : 1);
        ribbonPoints.push({ x, y });
      }
      traceSmoothRibbon(ribbonPoints);
      ctx.strokeStyle = gradient;
      ctx.globalAlpha = .12 + energy.overall * .12;
      ctx.lineWidth = 20 + energy.bass * 20 - layer * 1.1;
      ctx.shadowBlur = 34 + energy.mid * 38;
      ctx.shadowColor = `rgb(${(layer % 2 ? currentPalette.hot : currentPalette.main).join(',')})`;
      ctx.stroke();
      ctx.globalAlpha = .48 + energy.treble * .3;
      ctx.lineWidth = 7 + energy.bass * 10 - layer * .55;
      ctx.shadowBlur = 18 + energy.mid * 22;
      ctx.stroke();
      ctx.globalAlpha = .72 + highAccent * .24;
      ctx.lineWidth = .85 + smoothSpectrum[Math.min(points - 1, layer * 11)] * 1.05 + highAccent * .18;
      ctx.shadowBlur = 5 + highAccent * 7;
      ctx.stroke();
    }
    ctx.restore();
  }

  function ensureModernParticles() {
    const target = w < 720 ? 92 : 156;
    while (modernParticles.length < target) {
      modernParticles.push({
        x: Math.random() * 2 - 1,
        y: Math.random() * 2 - 1,
        z: .12 + Math.random() * .88,
        speed: .0015 + Math.random() * .0032,
        band: Math.floor(Math.random() * 72),
        screenX: NaN,
        screenY: NaN
      });
    }
    if (modernParticles.length > target) modernParticles.length = target;
  }

  function drawTunnel(energy) {
    ensureModernParticles();
    const bassAccent = audioState.accents.bass;
    modernState.tunnelDrift += .004 + energy.mid * .003;
    modernState.tunnelTravel = (modernState.tunnelTravel + .0022 + energy.bass * .0028 + bassAccent * .0045) % 1;
    const targetCx = .5 + Math.sin(modernState.tunnelDrift) * .035 * (.3 + energy.mid);
    const targetCy = .48 + Math.cos(modernState.tunnelDrift * .72) * .026 * (.3 + energy.bass);
    modernState.tunnelCx += (targetCx - modernState.tunnelCx) * .035;
    modernState.tunnelCy += (targetCy - modernState.tunnelCy) * .035;
    const cx = w * modernState.tunnelCx;
    const cy = h * modernState.tunnelCy;
    const maxRadius = Math.hypot(w, h) * .62;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    for (const particle of modernParticles) {
      const value = spectrumValue(particle.band, 72);
      const previousX = particle.screenX;
      const previousY = particle.screenY;
      particle.z -= particle.speed * (1.05 + energy.bass * 3.2 + bassAccent * 4.8 + value * 1.4);
      if (particle.z < .045) {
        particle.x = Math.random() * 2 - 1;
        particle.y = Math.random() * 2 - 1;
        particle.z = 1;
        particle.screenX = NaN;
        particle.screenY = NaN;
      }
      const x = cx + particle.x / particle.z * w * .16;
      const y = cy + particle.y / particle.z * h * .16;
      particle.screenX = x;
      particle.screenY = y;
      const alpha = Math.max(0, Math.min(1, Math.sin(Math.min(1, 1 - particle.z) * Math.PI * .82) * (.28 + value * .76)));
      const color = value > .5 ? currentPalette.hot : currentPalette.main;
      ctx.strokeStyle = `rgba(${color.join(',')},${alpha})`;
      ctx.lineWidth = Math.max(.55, (1 - particle.z) * (1.25 + value * 2.2));
      ctx.beginPath();
      if (Number.isFinite(previousX) && Math.hypot(x - previousX, y - previousY) < Math.max(w, h) * .12) ctx.moveTo(previousX, previousY);
      else ctx.moveTo(x, y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }

    const rings = 30;
    const segments = 132;
    for (let ring = 0; ring < rings; ring++) {
      const travel = (ring / rings + modernState.tunnelTravel) % 1;
      const radius = Math.pow(travel, 1.72) * maxRadius + 10;
      ctx.beginPath();
      for (let i = 0; i <= segments; i++) {
        const angle = i / segments * Math.PI * 2;
        const value = spectrumValue(i % 72, 72);
        const wobble = Math.sin(angle * 3 + modernState.tunnelDrift * 2.1 + ring * .8) * radius * .022 * (1 + value);
        const rr = radius + wobble + value * 19 * intensity;
        const x = cx + Math.cos(angle) * rr * (1 + energy.mid * .035);
        const y = cy + Math.sin(angle) * rr * (.62 + energy.treble * .08);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      const color = ring % 3 === 0 ? currentPalette.hot : currentPalette.main;
      const ringFade = Math.pow(Math.sin(travel * Math.PI), .7);
      ctx.strokeStyle = `rgba(${color.join(',')},${ringFade * (.07 + travel * .3)})`;
      ctx.lineWidth = .55 + travel * 1.4;
      ctx.shadowBlur = travel > .7 ? 12 : 0;
      ctx.shadowColor = `rgb(${color.join(',')})`;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPulseGrid(energy) {
    const horizon = h * .43;
    const pad = w * .04;
    const columns = w < 720 ? 14 : 22;
    const rows = 24;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.lineWidth = 1;
    ctx.shadowColor = `rgb(${currentPalette.main.join(',')})`;
    ctx.shadowBlur = 7 + energy.mid * 16;

    for (let col = 0; col <= columns; col++) {
      const t = col / columns;
      const xBottom = pad + t * (w - pad * 2);
      const xTop = w * .5 + (t - .5) * w * .1;
      ctx.strokeStyle = `rgba(${currentPalette.main.join(',')},${.06 + spectrumValue(Math.min(columns - 1, col), columns) * .24})`;
      ctx.beginPath();
      ctx.moveTo(xTop, horizon);
      ctx.lineTo(xBottom, h);
      ctx.stroke();
    }
    for (let row = 0; row < rows; row++) {
      const t = (row / rows + frame * .0035 * (1 + energy.bass * 3)) % 1;
      const perspective = t * t;
      const y = horizon + perspective * (h - horizon);
      const value = spectrumValue(row % 48, 48);
      ctx.strokeStyle = `rgba(${(row % 5 === 0 ? currentPalette.hot : currentPalette.main).join(',')},${.05 + perspective * .25 + value * .12})`;
      ctx.beginPath();
      ctx.moveTo(w * .5 - (w * .06 + perspective * w * .5), y + Math.sin(frame * .02 + row) * value * 4);
      ctx.lineTo(w * .5 + (w * .06 + perspective * w * .5), y - Math.sin(frame * .02 + row) * value * 4);
      ctx.stroke();
    }

    const bars = 54;
    const width = w * .58;
    const left = (w - width) * .5;
    for (let i = 0; i < bars; i++) {
      const value = spectrumValue(i, bars);
      const barWidth = width / bars * .58;
      const x = left + i / (bars - 1) * width;
      const height = (12 + value * h * .25) * intensity;
      const color = value > .58 ? currentPalette.hot : currentPalette.main;
      ctx.fillStyle = `rgba(${color.join(',')},${.16 + value * .72})`;
      ctx.fillRect(x, horizon - height, barWidth, height);
    }
    ctx.restore();
  }

  function traceClosedSmoothPath(points, tension = .72) {
    if (points.length < 3) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let index = 0; index < points.length; index++) {
      const p0 = points[(index - 1 + points.length) % points.length];
      const p1 = points[index];
      const p2 = points[(index + 1) % points.length];
      const p3 = points[(index + 2) % points.length];
      ctx.bezierCurveTo(
        p1.x + (p2.x - p0.x) / 6 * tension,
        p1.y + (p2.y - p0.y) / 6 * tension,
        p2.x - (p3.x - p1.x) / 6 * tension,
        p2.y - (p3.y - p1.y) / 6 * tension,
        p2.x,
        p2.y
      );
    }
    ctx.closePath();
  }

  function drawBloom(energy) {
    const cx = w * .5;
    const cy = h * .47;
    const petals = 8;
    const pointCount = 288;
    const spectrumBands = 96;
    const minSize = Math.min(w, h);
    modernState.bloomRotation += .0011 + energy.mid * .0008 + audioState.accents.treble * .0012;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(modernState.bloomRotation);
    ctx.globalCompositeOperation = 'screen';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const halo = ctx.createRadialGradient(0, 0, minSize * .035, 0, 0, minSize * .34);
    halo.addColorStop(0, `rgba(${currentPalette.hot.join(',')},${.055 + energy.bass * .08})`);
    halo.addColorStop(.45, `rgba(${currentPalette.main.join(',')},${.022 + energy.overall * .035})`);
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, minSize * .35, 0, Math.PI * 2);
    ctx.fill();

    for (let layer = 0; layer < 6; layer++) {
      const bloomPoints = [];
      for (let i = 0; i < pointCount; i++) {
        const normalized = i / pointCount;
        const angle = normalized * Math.PI * 2;
        const bandPosition = normalized * (spectrumBands - 1);
        const bandLow = Math.floor(bandPosition);
        const bandHigh = Math.min(spectrumBands - 1, bandLow + 1);
        const mix = bandPosition - bandLow;
        const value = spectrumValue(bandLow, spectrumBands) * (1 - mix) + spectrumValue(bandHigh, spectrumBands) * mix;
        const petalPhase = .5 - .5 * Math.cos(angle * petals + layer * .16);
        const petal = petalPhase * petalPhase * (3 - 2 * petalPhase);
        const base = minSize * (.115 + layer * .022 + energy.bass * .012);
        const petalLift = petal * minSize * (.045 + value * .022 * intensity);
        const spectrumLift = value * minSize * (.018 + intensity * .018);
        const harmonic = Math.sin(angle * 3 - modernState.bloomRotation * 4 + layer * .7) * minSize * .008 * (.35 + energy.mid);
        const radius = base + petalLift + spectrumLift + harmonic;
        bloomPoints.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
      }
      traceClosedSmoothPath(bloomPoints);
      const color = layer % 2 ? currentPalette.hot : currentPalette.main;
      ctx.strokeStyle = `rgba(${color.join(',')},${.18 + layer * .075 + energy.overall * .12})`;
      ctx.lineWidth = .75 + layer * .11 + energy.treble * 1.05;
      ctx.shadowBlur = 7 + energy.mid * 18 + audioState.accents.treble * 6;
      ctx.shadowColor = `rgb(${color.join(',')})`;
      ctx.stroke();
    }
    ctx.rotate(-modernState.bloomRotation * 1.75);
    ctx.fillStyle = `rgba(${currentPalette.hot.join(',')},${.1 + energy.bass * .28})`;
    ctx.shadowBlur = 28 + energy.bass * 42;
    ctx.shadowColor = `rgb(${currentPalette.hot.join(',')})`;
    ctx.beginPath();
    ctx.arc(0, 0, 4 + energy.bass * 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function conductorColor(rgb, alpha = 1) {
    return `rgba(${rgb.join(',')},${alpha})`;
  }

  function orchestraBandDrive(energy, band) {
    if (band === 'low') return energy.bass;
    if (band === 'high') return energy.treble;
    return energy.mid;
  }

  function orchestraBandAccent(energy, band) {
    if (band === 'low') return energy.bassAccent || 0;
    if (band === 'high') return energy.highAccent || 0;
    return energy.midAccent || 0;
  }

  function orchestraBandColor(band) {
    const amount = band === 'high' ? .92 : band === 'mid' ? .5 : .12;
    return currentPalette.main.map((value, index) => Math.round(value + (currentPalette.hot[index] - value) * amount));
  }

  function drawOrchestraMember(x, y, scale, instrument, band, index, energy) {
    const drive = Math.min(1, orchestraBandDrive(energy, band));
    const accent = Math.min(1, orchestraBandAccent(energy, band));
    const color = orchestraBandColor(band);
    const isString = ['violin', 'viola', 'cello', 'doubleBass'].includes(instrument);
    const isWoodwind = ['flute', 'oboe', 'clarinet', 'bassoon'].includes(instrument);
    const isBrass = ['horn', 'trumpet', 'trombone', 'tuba'].includes(instrument);
    const isStanding = instrument === 'doubleBass' || instrument === 'tuba';
    const actionPhase = conductorState.phase * (1.05 + drive * 2.15) + index * .74;
    const bounce = Math.sin(actionPhase * .53) * drive * 2.6;
    const lean = Math.sin(actionPhase * .62) * drive * (isString ? .075 : .038) - accent * (isString ? .045 : .02);
    conductorCtx.save();
    conductorCtx.translate(x, y + bounce);
    conductorCtx.scale(scale, scale);
    conductorCtx.rotate(lean);
    conductorCtx.globalAlpha *= .38 + drive * .62;
    conductorCtx.shadowBlur = 3 + drive * 13 + accent * 10;
    conductorCtx.shadowColor = conductorColor(color, .72);

    if (!isStanding) {
      conductorCtx.strokeStyle = 'rgba(255,255,255,.12)';
      conductorCtx.lineWidth = 2;
      conductorCtx.beginPath();
      conductorCtx.moveTo(-19, 13);
      conductorCtx.lineTo(-24, 45);
      conductorCtx.lineTo(14, 45);
      conductorCtx.lineTo(18, 12);
      conductorCtx.stroke();
    }

    conductorCtx.save();
    conductorCtx.translate(isString ? 34 : 39, 4);
    conductorCtx.strokeStyle = conductorColor(color, .25 + drive * .22);
    conductorCtx.lineWidth = 1.5;
    conductorCtx.beginPath();
    conductorCtx.moveTo(0, -4);
    conductorCtx.lineTo(0, 43);
    conductorCtx.moveTo(-12, 43);
    conductorCtx.lineTo(12, 43);
    conductorCtx.stroke();
    conductorCtx.fillStyle = 'rgba(8,11,19,.82)';
    conductorCtx.strokeStyle = conductorColor(color, .28 + drive * .22);
    conductorCtx.beginPath();
    conductorCtx.moveTo(-17, -16);
    conductorCtx.lineTo(18, -12);
    conductorCtx.lineTo(15, 7);
    conductorCtx.lineTo(-20, 3);
    conductorCtx.closePath();
    conductorCtx.fill();
    conductorCtx.stroke();
    conductorCtx.strokeStyle = 'rgba(255,255,255,.18)';
    conductorCtx.lineWidth = 1;
    conductorCtx.beginPath();
    conductorCtx.moveTo(-12, -9);
    conductorCtx.lineTo(11, -7);
    conductorCtx.moveTo(-13, -3);
    conductorCtx.lineTo(8, -1);
    conductorCtx.stroke();
    conductorCtx.restore();

    conductorCtx.shadowBlur = 0;
    conductorCtx.strokeStyle = 'rgba(255,255,255,.12)';
    conductorCtx.lineWidth = 2;
    conductorCtx.beginPath();
    conductorCtx.moveTo(-14, isStanding ? 9 : 15);
    conductorCtx.lineTo(-18, 50);
    conductorCtx.moveTo(14, isStanding ? 9 : 15);
    conductorCtx.lineTo(18, 50);
    conductorCtx.stroke();

    conductorCtx.fillStyle = 'rgba(11,14,24,.9)';
    conductorCtx.beginPath();
    conductorCtx.ellipse(0, 0, 21, 32, 0, 0, Math.PI * 2);
    conductorCtx.fill();
    conductorCtx.fillStyle = conductorColor(color, .34 + drive * .36);
    conductorCtx.beginPath();
    conductorCtx.arc(0, -39, 13, 0, Math.PI * 2);
    conductorCtx.fill();

    if (isString) {
      const bodySize = instrument === 'violin' ? .68 : instrument === 'viola' ? .82 : instrument === 'cello' ? 1.16 : 1.48;
      const bow = Math.sin(actionPhase) * (5 + drive * 26);
      const bowLift = accent * (8 + Math.max(0, Math.sin(actionPhase * .5)) * 17);
      const instrumentY = instrument === 'violin' ? -8 : instrument === 'viola' ? -4 : instrument === 'cello' ? 8 : -2;
      conductorCtx.save();
      conductorCtx.translate(instrument === 'doubleBass' ? 17 : 5, instrumentY);
      conductorCtx.rotate(instrument === 'doubleBass' ? -.1 : -.22);
      conductorCtx.fillStyle = conductorColor(color, .5 + drive * .42);
      conductorCtx.beginPath();
      conductorCtx.ellipse(0, 0, 12 * bodySize, 17 * bodySize, 0, 0, Math.PI * 2);
      conductorCtx.fill();
      conductorCtx.strokeStyle = 'rgba(255,255,255,.48)';
      conductorCtx.lineWidth = 1.3;
      conductorCtx.beginPath();
      conductorCtx.moveTo(2, -14 * bodySize);
      conductorCtx.lineTo(13, -31 * bodySize);
      conductorCtx.stroke();
      if (instrument === 'cello' || instrument === 'doubleBass') {
        conductorCtx.beginPath();
        conductorCtx.moveTo(0, 16 * bodySize);
        conductorCtx.lineTo(0, 29 * bodySize);
        conductorCtx.stroke();
      }
      conductorCtx.restore();
      conductorCtx.strokeStyle = conductorColor(color, .65 + drive * .34);
      conductorCtx.lineWidth = 1.5 + accent * 1.4;
      conductorCtx.shadowBlur = 4 + drive * 17;
      conductorCtx.shadowColor = conductorColor(color, .9);
      conductorCtx.beginPath();
      conductorCtx.moveTo(-18 + bow, -27 - bowLift);
      conductorCtx.lineTo(21 + bow, 20 - bowLift * .38);
      conductorCtx.stroke();
      conductorCtx.shadowBlur = 0;
      if (accent > .16) {
        conductorCtx.strokeStyle = conductorColor(color, .1 + accent * .35);
        conductorCtx.lineWidth = 1;
        for (let trail = 1; trail <= 3; trail++) {
          conductorCtx.beginPath();
          conductorCtx.moveTo(-18 + bow - trail * 7, -27 - bowLift + trail * 2);
          conductorCtx.lineTo(21 + bow - trail * 7, 20 - bowLift * .38 + trail * 2);
          conductorCtx.stroke();
        }
      }
    } else if (isWoodwind) {
      const lift = drive * 7 + accent * 5;
      const length = instrument === 'flute' ? 38 : instrument === 'bassoon' ? 47 : 35;
      const angle = instrument === 'flute' ? -.08 : instrument === 'bassoon' ? .68 : .34;
      conductorCtx.save();
      conductorCtx.translate(-9, -18 - lift);
      conductorCtx.rotate(angle);
      conductorCtx.strokeStyle = conductorColor(color, .58 + drive * .4);
      conductorCtx.lineWidth = instrument === 'bassoon' ? 5 : 3;
      conductorCtx.beginPath();
      conductorCtx.moveTo(0, 0);
      conductorCtx.lineTo(length, 0);
      conductorCtx.stroke();
      conductorCtx.fillStyle = conductorColor(color, .68 + drive * .3);
      for (let key = 1; key < 4; key++) {
        conductorCtx.beginPath();
        conductorCtx.arc(length * key / 5, -2, 1.5 + drive, 0, Math.PI * 2);
        conductorCtx.fill();
      }
      if (instrument !== 'flute') {
        conductorCtx.beginPath();
        conductorCtx.moveTo(length - 1, -5);
        conductorCtx.lineTo(length + 9, 0);
        conductorCtx.lineTo(length - 1, 5);
        conductorCtx.closePath();
        conductorCtx.fill();
      }
      conductorCtx.restore();
    } else if (isBrass) {
      const flare = drive * 18 + accent * 10;
      const lift = drive * 10;
      conductorCtx.strokeStyle = conductorColor(color, .62 + drive * .36);
      conductorCtx.fillStyle = conductorColor(color, .38 + drive * .4);
      conductorCtx.lineWidth = 4;
      if (instrument === 'horn') {
        conductorCtx.beginPath();
        conductorCtx.arc(7, -13 - lift * .4, 13 + drive * 2, 0, Math.PI * 2);
        conductorCtx.stroke();
        conductorCtx.beginPath();
        conductorCtx.moveTo(15, -22 - lift * .4);
        conductorCtx.lineTo(34, -25 - lift * .5);
        conductorCtx.lineTo(23, -11 - lift * .35);
        conductorCtx.closePath();
        conductorCtx.fill();
      } else if (instrument === 'tuba') {
        conductorCtx.lineWidth = 6;
        conductorCtx.beginPath();
        conductorCtx.arc(1, -7, 17, -.2, Math.PI * 1.7);
        conductorCtx.stroke();
        conductorCtx.beginPath();
        conductorCtx.moveTo(5, -22);
        conductorCtx.lineTo(21, -45 - lift * .4);
        conductorCtx.lineTo(39, -47 - lift * .4);
        conductorCtx.lineTo(20, -31 - lift * .35);
        conductorCtx.closePath();
        conductorCtx.fill();
      } else {
        const slide = instrument === 'trombone' ? 16 + drive * 25 : 0;
        conductorCtx.beginPath();
        conductorCtx.moveTo(-8, -17 - lift * .4);
        conductorCtx.lineTo(25 + slide, -22 - lift);
        conductorCtx.stroke();
        conductorCtx.beginPath();
        conductorCtx.moveTo(22 + slide, -30 - lift);
        conductorCtx.lineTo(39 + slide + flare * .12, -22 - lift);
        conductorCtx.lineTo(22 + slide, -14 - lift);
        conductorCtx.closePath();
        conductorCtx.fill();
      }
      if (drive > .2) {
        conductorCtx.strokeStyle = conductorColor(color, .14 + drive * .42);
        conductorCtx.lineWidth = 1;
        for (let line = 0; line < 3; line++) {
          conductorCtx.beginPath();
          conductorCtx.moveTo(42, -26 - lift + line * 5);
          conductorCtx.lineTo(54 + flare, -29 - lift + line * 7);
          conductorCtx.stroke();
        }
      }
    }
    conductorCtx.restore();
  }

  function drawConcertShell(floorY, energy) {
    const highGlow = Math.min(1, energy.treble + orchestraBandAccent(energy, 'high') * .55);
    const midGlow = Math.min(1, energy.mid + orchestraBandAccent(energy, 'mid') * .45);
    const bassGlow = Math.min(1, energy.bass * .72 + (energy.bassAccent || 0));

    conductorCtx.save();
    conductorCtx.globalCompositeOperation = 'screen';
    const stageGradient = conductorCtx.createRadialGradient(w * .5, floorY - 80, 10, w * .5, floorY - 70, w * .55);
    stageGradient.addColorStop(0, conductorColor(currentPalette.hot, .045 + Math.max(highGlow, midGlow) * .075));
    stageGradient.addColorStop(.48, conductorColor(currentPalette.main, .025 + energy.overall * .035));
    stageGradient.addColorStop(1, 'rgba(0,0,0,0)');
    conductorCtx.fillStyle = stageGradient;
    conductorCtx.fillRect(0, floorY - h * .48, w, h * .62);

    conductorCtx.lineCap = 'round';
    for (let arch = 0; arch < 4; arch++) {
      const inset = w * (.055 + arch * .048);
      const archTop = floorY - h * (.39 - arch * .028);
      conductorCtx.strokeStyle = conductorColor(arch % 2 ? currentPalette.hot : currentPalette.main, .07 + energy.overall * .055);
      conductorCtx.lineWidth = Math.max(1, 2.5 - arch * .35);
      conductorCtx.beginPath();
      conductorCtx.moveTo(inset, floorY + 5);
      conductorCtx.quadraticCurveTo(inset, archTop, w * .5, archTop);
      conductorCtx.quadraticCurveTo(w - inset, archTop, w - inset, floorY + 5);
      conductorCtx.stroke();
    }

    const spotlights = [
      { x: .2, color: orchestraBandColor('high'), drive: highGlow },
      { x: .5, color: orchestraBandColor('mid'), drive: midGlow },
      { x: .8, color: orchestraBandColor('low'), drive: bassGlow }
    ];
    spotlights.forEach((light, index) => {
      const topX = w * light.x;
      const spread = w * (.075 + light.drive * .025);
      const beam = conductorCtx.createLinearGradient(topX, floorY - h * .38, topX, floorY + 35);
      beam.addColorStop(0, conductorColor(light.color, .13 + light.drive * .12));
      beam.addColorStop(1, conductorColor(light.color, .008));
      conductorCtx.fillStyle = beam;
      conductorCtx.beginPath();
      conductorCtx.moveTo(topX - 7, floorY - h * .39);
      conductorCtx.lineTo(topX + 7, floorY - h * .39);
      conductorCtx.lineTo(topX + spread, floorY + 26);
      conductorCtx.lineTo(topX - spread, floorY + 26);
      conductorCtx.closePath();
      conductorCtx.fill();
      conductorCtx.fillStyle = conductorColor(light.color, .18 + light.drive * .28);
      conductorCtx.beginPath();
      conductorCtx.ellipse(topX, floorY - h * .39, 11 + light.drive * 4, 4, 0, 0, Math.PI * 2);
      conductorCtx.fill();
    });

    for (let tier = 0; tier < 3; tier++) {
      const y = floorY - 130 + tier * 63;
      const inset = w * (.075 - tier * .012);
      const riser = conductorCtx.createLinearGradient(0, y, 0, y + 23);
      riser.addColorStop(0, conductorColor(currentPalette.main, .08 + tier * .015));
      riser.addColorStop(1, 'rgba(3,5,11,.28)');
      conductorCtx.fillStyle = riser;
      conductorCtx.fillRect(inset, y, w - inset * 2, 22);
      conductorCtx.strokeStyle = conductorColor(currentPalette.hot, .11 + bassGlow * .06);
      conductorCtx.lineWidth = 1;
      conductorCtx.beginPath();
      conductorCtx.moveTo(inset, y);
      conductorCtx.lineTo(w - inset, y);
      conductorCtx.stroke();
    }
    conductorCtx.restore();
  }

  function drawTimpani(x, y, scale, index, energy) {
    const bassAccent = energy.bassAccent || 0;
    const beatPhase = conductorState.phase * 1.16 + index * 2.1;
    const rebound = Math.max(0, Math.sin(beatPhase));
    const strike = bassAccent * (1 - rebound * .24);

    conductorCtx.save();
    conductorCtx.translate(x, y);
    conductorCtx.scale(scale, scale);
    conductorCtx.shadowBlur = 10 + energy.bass * 24 + bassAccent * 28;
    conductorCtx.shadowColor = conductorColor(currentPalette.hot, .65);

    conductorCtx.fillStyle = 'rgba(7,10,18,.92)';
    conductorCtx.strokeStyle = conductorColor(currentPalette.main, .58 + energy.bass * .3);
    conductorCtx.lineWidth = 2.5;
    conductorCtx.beginPath();
    conductorCtx.moveTo(-35, 0);
    conductorCtx.quadraticCurveTo(-30, 42, 0, 51);
    conductorCtx.quadraticCurveTo(30, 42, 35, 0);
    conductorCtx.closePath();
    conductorCtx.fill();
    conductorCtx.stroke();

    conductorCtx.fillStyle = conductorColor(currentPalette.hot, .09 + energy.bass * .25 + bassAccent * .22);
    conductorCtx.strokeStyle = conductorColor(currentPalette.main, .74);
    conductorCtx.lineWidth = 3;
    conductorCtx.beginPath();
    conductorCtx.ellipse(0, 0, 38, 12, 0, 0, Math.PI * 2);
    conductorCtx.fill();
    conductorCtx.stroke();

    if (bassAccent > .08) {
      conductorCtx.shadowBlur = 0;
      for (let ring = 0; ring < 3; ring++) {
        const expansion = 1 + ring * .18 + bassAccent * .16;
        conductorCtx.strokeStyle = conductorColor(currentPalette.hot, Math.max(0, bassAccent * (.42 - ring * .1)));
        conductorCtx.lineWidth = 1.2;
        conductorCtx.beginPath();
        conductorCtx.ellipse(0, 0, 28 * expansion, 7.5 * expansion, 0, 0, Math.PI * 2);
        conductorCtx.stroke();
      }
    }

    conductorCtx.strokeStyle = 'rgba(245,247,255,.72)';
    conductorCtx.fillStyle = conductorColor(currentPalette.main, .82);
    conductorCtx.lineWidth = 2.2;
    const malletDrop = 19 * strike;
    for (const side of [-1, 1]) {
      const handX = side * 10;
      const headX = side * (25 - strike * 12);
      const headY = -38 - rebound * 15 + malletDrop;
      conductorCtx.beginPath();
      conductorCtx.moveTo(handX, -17);
      conductorCtx.lineTo(headX, headY);
      conductorCtx.stroke();
      conductorCtx.beginPath();
      conductorCtx.arc(headX, headY, 4.5, 0, Math.PI * 2);
      conductorCtx.fill();
    }

    conductorCtx.strokeStyle = 'rgba(255,255,255,.18)';
    conductorCtx.lineWidth = 2;
    conductorCtx.beginPath();
    conductorCtx.moveTo(-22, 42);
    conductorCtx.lineTo(-28, 59);
    conductorCtx.moveTo(22, 42);
    conductorCtx.lineTo(28, 59);
    conductorCtx.stroke();
    conductorCtx.restore();
  }

  function drawCymbal(x, y, scale, energy) {
    const crash = energy.bassAccent || 0;
    if (crash < .12 && energy.bass < .24) return;
    const wobble = Math.sin(conductorState.phase * 2.7) * crash * .22;
    conductorCtx.save();
    conductorCtx.translate(x, y);
    conductorCtx.scale(scale, scale);
    conductorCtx.rotate(wobble);
    conductorCtx.globalAlpha *= .32 + energy.bass * .4 + crash * .38;
    conductorCtx.strokeStyle = conductorColor(currentPalette.hot, .9);
    conductorCtx.fillStyle = conductorColor(currentPalette.hot, .12 + crash * .18);
    conductorCtx.lineWidth = 2;
    conductorCtx.shadowBlur = 9 + crash * 32;
    conductorCtx.shadowColor = conductorColor(currentPalette.hot, .95);
    conductorCtx.beginPath();
    conductorCtx.ellipse(0, 0, 31, 8, 0, 0, Math.PI * 2);
    conductorCtx.fill();
    conductorCtx.stroke();
    conductorCtx.beginPath();
    conductorCtx.moveTo(0, 4);
    conductorCtx.lineTo(0, 59);
    conductorCtx.moveTo(-13, 59);
    conductorCtx.lineTo(13, 59);
    conductorCtx.stroke();
    if (crash > .42) {
      conductorCtx.lineWidth = 1;
      for (let ray = 0; ray < 8; ray++) {
        const angle = ray / 8 * Math.PI * 2;
        conductorCtx.beginPath();
        conductorCtx.moveTo(Math.cos(angle) * 35, Math.sin(angle) * 10);
        conductorCtx.lineTo(Math.cos(angle) * (45 + crash * 15), Math.sin(angle) * (14 + crash * 5));
        conductorCtx.stroke();
      }
    }
    conductorCtx.restore();
  }

  function drawOrchestraBandLegend(floorY, energy) {
    if (conductorConfig.labels === 'hidden') return;
    let visibility = 1;
    if (conductorConfig.labels === 'auto') {
      const elapsed = (performance.now() - conductorState.legendStartedAt) / 1000;
      if (elapsed >= 5.5) return;
      if (elapsed > 4.1) visibility = Math.max(0, 1 - (elapsed - 4.1) / 1.4);
    }
    const labels = [
      { band: 'high', x: .18, text: '高频 · 小提琴 / 长笛 / 小号' },
      { band: 'mid', x: .5, text: '中频 · 中提琴 / 大提琴 / 木管 / 圆号' },
      { band: 'low', x: .82, text: '低频 · 低音弦乐 / 低音铜管 / 打击乐' }
    ];
    const width = Math.min(236, w * .28);
    const y = floorY - Math.min(h * .42, 300);
    conductorCtx.save();
    conductorCtx.globalAlpha *= visibility;
    conductorCtx.textAlign = 'center';
    conductorCtx.textBaseline = 'middle';
    conductorCtx.font = `${Math.max(8, Math.min(11, w / 108))}px "Microsoft YaHei", sans-serif`;
    labels.forEach(label => {
      const drive = orchestraBandDrive(energy, label.band);
      const accent = orchestraBandAccent(energy, label.band);
      const color = orchestraBandColor(label.band);
      const x = w * label.x;
      conductorCtx.fillStyle = 'rgba(5,8,16,.52)';
      conductorCtx.strokeStyle = conductorColor(color, .18 + drive * .58);
      conductorCtx.lineWidth = 1 + accent * 1.5;
      conductorCtx.beginPath();
      conductorCtx.roundRect(x - width * .5, y - 13, width, 26, 13);
      conductorCtx.fill();
      conductorCtx.stroke();
      conductorCtx.fillStyle = conductorColor(color, .56 + drive * .44);
      conductorCtx.shadowBlur = 5 + drive * 16;
      conductorCtx.shadowColor = conductorColor(color, .9);
      conductorCtx.fillText(w < 820 ? label.text.split('·')[0].trim() : label.text, x, y + .5, width - 14);
      conductorCtx.shadowBlur = 0;
      conductorCtx.fillStyle = conductorColor(color, .32 + drive * .48);
      conductorCtx.fillRect(x - width * .38, y + 17, width * .76 * drive, 2);
    });
    conductorCtx.restore();
  }

  function drawOrchestra(energy) {
    const floorY = h * .79;
    const size = Math.max(.58, Math.min(1.15, Math.min(w / 1050, h / 720)));

    conductorCtx.save();
    conductorCtx.globalCompositeOperation = 'screen';
    conductorCtx.globalAlpha = Math.min(1, (.72 + energy.overall * .22) * conductorConfig.orchestra);
    drawConcertShell(floorY, energy);
    conductorCtx.strokeStyle = conductorColor(currentPalette.main, .13);
    conductorCtx.lineWidth = 1;
    for (let row = 0; row < 4; row++) {
      const y = floorY + row * 18;
      conductorCtx.beginPath();
      conductorCtx.moveTo(w * (.06 + row * .025), y);
      conductorCtx.lineTo(w * (.94 - row * .025), y);
      conductorCtx.stroke();
    }

    drawOrchestraBandLegend(floorY, energy);

    // 最后方：打击乐与定音鼓（低频组）
    drawTimpani(w * .13, floorY - 185, size * .62, 0, energy);
    drawTimpani(w * .87, floorY - 185, size * .62, 1, energy);
    drawCymbal(w * .2, floorY - 222, size * .58, energy);
    drawCymbal(w * .8, floorY - 222, size * .58, energy);

    // 后排：圆号与小号居中，长号、大号靠右。
    const brass = [
      [.28, 'horn', 'mid'], [.34, 'horn', 'mid'], [.4, 'horn', 'mid'],
      [.46, 'trumpet', 'high'], [.52, 'trumpet', 'high'],
      [.64, 'trombone', 'low'], [.71, 'trombone', 'low'], [.78, 'tuba', 'low']
    ];
    brass.forEach((member, index) => drawOrchestraMember(w * member[0], floorY - 178 - (index % 2) * 5, size * .62, member[1], member[2], index, energy));

    // 中排：标准木管排列——长笛、双簧管、单簧管、大管。
    const woodwinds = [
      [.35, 'flute', 'high'], [.4, 'flute', 'high'],
      [.45, 'oboe', 'mid'], [.49, 'oboe', 'mid'],
      [.54, 'clarinet', 'mid'], [.58, 'clarinet', 'mid'],
      [.63, 'bassoon', 'low'], [.68, 'bassoon', 'low']
    ];
    woodwinds.forEach((member, index) => drawOrchestraMember(w * member[0], floorY - 117 + (index % 2) * 4, size * .67, member[1], member[2], index + 20, energy));

    // 前排扇形弦乐：第一、第二小提琴在左，中提琴与大提琴在右，低音提琴靠右后方。
    const strings = [
      [.1, -3, 'violin', 'high'], [.16, 4, 'violin', 'high'], [.22, 9, 'violin', 'high'],
      [.28, 5, 'violin', 'high'], [.34, 11, 'violin', 'high'], [.4, 15, 'violin', 'high'],
      [.64, 14, 'viola', 'mid'], [.7, 10, 'viola', 'mid'],
      [.76, 5, 'cello', 'mid'], [.82, 0, 'cello', 'mid'], [.87, -6, 'cello', 'mid'],
      [.91, -65, 'doubleBass', 'low'], [.96, -78, 'doubleBass', 'low']
    ];
    strings.forEach((member, index) => drawOrchestraMember(w * member[0], floorY - 43 + member[1], size * (member[2] === 'doubleBass' ? .72 : .82), member[2], member[3], index + 40, energy));
    conductorCtx.restore();
  }

  function drawSpark(x, y, radius, alpha) {
    conductorCtx.save();
    conductorCtx.translate(x, y);
    conductorCtx.strokeStyle = conductorColor(currentPalette.hot, alpha);
    conductorCtx.lineWidth = 1.4;
    conductorCtx.shadowBlur = 12;
    conductorCtx.shadowColor = conductorColor(currentPalette.hot, 1);
    for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI / 2 + frame * .012;
      conductorCtx.beginPath();
      conductorCtx.moveTo(Math.cos(angle) * radius * .25, Math.sin(angle) * radius * .25);
      conductorCtx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      conductorCtx.stroke();
    }
    conductorCtx.restore();
  }

  function drawConductorCatLegacy(energy) {
    const scale = Math.max(.62, Math.min(1.28, Math.min(w / 980, h / 690)));
    const bassBob = energy.bass * 18 + Math.sin(conductorState.phase * .5) * energy.overall * 5;
    const cx = w * .5;
    const baseY = h * .83 - bassBob;
    const leftAngle = -2.25 + Math.sin(conductorState.phase) * (.3 + energy.mid * .45);
    const rightAngle = -.92 + Math.cos(conductorState.phase * 1.22) * (.36 + energy.treble * .5);
    const leftPaw = { x: -42 + Math.cos(leftAngle) * 77, y: -145 + Math.sin(leftAngle) * 77 };
    const rightPaw = { x: 42 + Math.cos(rightAngle) * 86, y: -148 + Math.sin(rightAngle) * 86 };
    const batonTip = { x: rightPaw.x + Math.cos(rightAngle) * 118, y: rightPaw.y + Math.sin(rightAngle) * 118 };

    conductorCtx.save();
    conductorCtx.translate(cx, baseY);
    conductorCtx.scale(scale, scale);

    conductorCtx.fillStyle = 'rgba(5,7,13,.78)';
    conductorCtx.beginPath();
    conductorCtx.ellipse(0, 5, 91, 18, 0, 0, Math.PI * 2);
    conductorCtx.fill();
    conductorCtx.fillStyle = conductorColor(currentPalette.main, .25);
    conductorCtx.fillRect(-83, -1, 166, 12);

    conductorCtx.strokeStyle = 'rgba(82,94,121,.92)';
    conductorCtx.lineWidth = 25;
    conductorCtx.lineCap = 'round';
    conductorCtx.beginPath();
    conductorCtx.moveTo(43, -93);
    conductorCtx.bezierCurveTo(105, -91, 117 + Math.sin(conductorState.phase * .7) * 18, -35, 82, -12);
    conductorCtx.stroke();

    conductorCtx.fillStyle = 'rgba(34,39,55,.98)';
    conductorCtx.beginPath();
    conductorCtx.ellipse(0, -103, 63, 101, 0, 0, Math.PI * 2);
    conductorCtx.fill();
    conductorCtx.fillStyle = 'rgba(231,235,244,.96)';
    conductorCtx.beginPath();
    conductorCtx.ellipse(0, -101, 27, 77, 0, 0, Math.PI * 2);
    conductorCtx.fill();

    const drawArm = (shoulderX, shoulderY, paw, color) => {
      conductorCtx.strokeStyle = color;
      conductorCtx.lineWidth = 25;
      conductorCtx.beginPath();
      conductorCtx.moveTo(shoulderX, shoulderY);
      conductorCtx.lineTo(paw.x, paw.y);
      conductorCtx.stroke();
      conductorCtx.fillStyle = 'rgba(94,108,139,.98)';
      conductorCtx.beginPath();
      conductorCtx.arc(paw.x, paw.y, 14, 0, Math.PI * 2);
      conductorCtx.fill();
    };
    drawArm(-42, -145, leftPaw, 'rgba(71,82,108,.98)');
    drawArm(42, -148, rightPaw, 'rgba(71,82,108,.98)');

    conductorCtx.strokeStyle = 'rgba(248,244,220,.94)';
    conductorCtx.lineWidth = 4;
    conductorCtx.shadowBlur = 10 + energy.treble * 22;
    conductorCtx.shadowColor = conductorColor(currentPalette.hot, 1);
    conductorCtx.beginPath();
    conductorCtx.moveTo(rightPaw.x, rightPaw.y);
    conductorCtx.lineTo(batonTip.x, batonTip.y);
    conductorCtx.stroke();
    conductorCtx.shadowBlur = 0;

    conductorCtx.fillStyle = 'rgba(92,107,138,.99)';
    conductorCtx.beginPath();
    conductorCtx.ellipse(0, -220, 76, 69, 0, 0, Math.PI * 2);
    conductorCtx.fill();
    conductorCtx.beginPath();
    conductorCtx.moveTo(-62, -253);
    conductorCtx.lineTo(-42, -304 - energy.treble * 8);
    conductorCtx.lineTo(-10, -272);
    conductorCtx.closePath();
    conductorCtx.fill();
    conductorCtx.beginPath();
    conductorCtx.moveTo(62, -253);
    conductorCtx.lineTo(42, -304 + energy.treble * 5);
    conductorCtx.lineTo(10, -272);
    conductorCtx.closePath();
    conductorCtx.fill();
    conductorCtx.fillStyle = 'rgba(236,164,177,.72)';
    conductorCtx.beginPath();
    conductorCtx.moveTo(-51, -260);
    conductorCtx.lineTo(-41, -287);
    conductorCtx.lineTo(-23, -269);
    conductorCtx.closePath();
    conductorCtx.fill();
    conductorCtx.beginPath();
    conductorCtx.moveTo(51, -260);
    conductorCtx.lineTo(41, -287);
    conductorCtx.lineTo(23, -269);
    conductorCtx.closePath();
    conductorCtx.fill();

    const blink = Math.sin(frame * .018) > .985 ? .12 : 1;
    conductorCtx.fillStyle = 'rgba(211,238,111,.96)';
    conductorCtx.beginPath();
    conductorCtx.ellipse(-28, -229, 15, 19 * blink, -.1, 0, Math.PI * 2);
    conductorCtx.ellipse(28, -229, 15, 19 * blink, .1, 0, Math.PI * 2);
    conductorCtx.fill();
    conductorCtx.fillStyle = 'rgba(8,11,17,.95)';
    conductorCtx.beginPath();
    conductorCtx.ellipse(-27, -228, 4, 13 * blink, 0, 0, Math.PI * 2);
    conductorCtx.ellipse(27, -228, 4, 13 * blink, 0, 0, Math.PI * 2);
    conductorCtx.fill();

    conductorCtx.fillStyle = 'rgba(239,241,246,.98)';
    conductorCtx.beginPath();
    conductorCtx.ellipse(-18, -196, 28, 23, -.12, 0, Math.PI * 2);
    conductorCtx.ellipse(18, -196, 28, 23, .12, 0, Math.PI * 2);
    conductorCtx.fill();
    conductorCtx.fillStyle = 'rgba(53,34,44,.98)';
    conductorCtx.beginPath();
    conductorCtx.moveTo(-8, -211);
    conductorCtx.lineTo(8, -211);
    conductorCtx.lineTo(0, -201);
    conductorCtx.closePath();
    conductorCtx.fill();
    conductorCtx.strokeStyle = 'rgba(61,46,55,.86)';
    conductorCtx.lineWidth = 2;
    conductorCtx.beginPath();
    conductorCtx.arc(0, -191, 13 + energy.mid * 5, .12, Math.PI - .12);
    conductorCtx.stroke();

    conductorCtx.fillStyle = conductorColor(currentPalette.hot, .92);
    conductorCtx.beginPath();
    conductorCtx.moveTo(-27, -166);
    conductorCtx.lineTo(0, -148);
    conductorCtx.lineTo(27, -166);
    conductorCtx.lineTo(18, -137);
    conductorCtx.lineTo(0, -148);
    conductorCtx.lineTo(-18, -137);
    conductorCtx.closePath();
    conductorCtx.fill();

    if (energy.treble > .14) {
      const sparks = 2 + Math.floor(energy.treble * 5);
      for (let i = 0; i < sparks; i++) {
        const angle = frame * .035 + i * 2.4;
        const distance = 15 + i * 7 + energy.treble * 20;
        drawSpark(batonTip.x + Math.cos(angle) * distance, batonTip.y + Math.sin(angle) * distance, 5 + energy.treble * 7, .22 + energy.treble * .65);
      }
    }
    conductorCtx.restore();
  }

  function drawElegantGlove(x, y, angle, openHand) {
    conductorCtx.save();
    conductorCtx.translate(x, y);
    conductorCtx.rotate(angle);
    conductorCtx.fillStyle = 'rgba(232,225,255,.98)';
    conductorCtx.strokeStyle = 'rgba(25,27,40,.9)';
    conductorCtx.lineWidth = 2.2;
    conductorCtx.lineJoin = 'round';
    conductorCtx.beginPath();
    if (openHand) {
      conductorCtx.moveTo(-2, -12);
      conductorCtx.bezierCurveTo(12, -19, 27, -23, 43, -19);
      conductorCtx.bezierCurveTo(49, -17, 48, -11, 42, -9);
      conductorCtx.bezierCurveTo(54, -10, 59, -5, 55, 0);
      conductorCtx.bezierCurveTo(50, 4, 42, 2, 34, 3);
      conductorCtx.bezierCurveTo(46, 6, 49, 12, 43, 15);
      conductorCtx.bezierCurveTo(31, 19, 16, 15, 4, 10);
      conductorCtx.bezierCurveTo(-4, 7, -8, -4, -2, -12);
    } else {
      conductorCtx.moveTo(-3, -13);
      conductorCtx.bezierCurveTo(13, -18, 31, -14, 39, -7);
      conductorCtx.bezierCurveTo(45, -2, 41, 5, 34, 5);
      conductorCtx.bezierCurveTo(42, 10, 38, 17, 30, 16);
      conductorCtx.bezierCurveTo(17, 15, 5, 13, -2, 7);
      conductorCtx.bezierCurveTo(-8, 2, -8, -7, -3, -13);
    }
    conductorCtx.closePath();
    conductorCtx.fill();
    conductorCtx.stroke();
    conductorCtx.strokeStyle = 'rgba(98,91,137,.42)';
    conductorCtx.lineWidth = 1;
    for (let finger = 0; finger < 3; finger++) {
      conductorCtx.beginPath();
      conductorCtx.moveTo(18 + finger * 8, -9 + finger * 2);
      conductorCtx.quadraticCurveTo(29 + finger * 7, -3 + finger * 2, 34 + finger * 7, 1 + finger * 2);
      conductorCtx.stroke();
    }
    conductorCtx.restore();
  }

  function drawElegantArm(shoulder, elbow, wrist, handAngle, openHand) {
    conductorCtx.lineCap = 'round';
    conductorCtx.lineJoin = 'round';
    conductorCtx.strokeStyle = 'rgba(24,29,43,.96)';
    conductorCtx.lineWidth = 38;
    conductorCtx.beginPath();
    conductorCtx.moveTo(shoulder.x, shoulder.y);
    conductorCtx.quadraticCurveTo(elbow.x, elbow.y, wrist.x, wrist.y);
    conductorCtx.stroke();
    conductorCtx.strokeStyle = 'rgba(5,7,13,.99)';
    conductorCtx.lineWidth = 31;
    conductorCtx.stroke();
    conductorCtx.strokeStyle = conductorColor(currentPalette.main, .52);
    conductorCtx.lineWidth = 1.4;
    conductorCtx.beginPath();
    conductorCtx.moveTo(shoulder.x - 2, shoulder.y - 9);
    conductorCtx.quadraticCurveTo(elbow.x, elbow.y - 10, wrist.x - 2, wrist.y - 7);
    conductorCtx.stroke();

    conductorCtx.save();
    conductorCtx.translate(wrist.x, wrist.y);
    conductorCtx.rotate(handAngle);
    conductorCtx.fillStyle = 'rgba(240,238,248,.98)';
    conductorCtx.strokeStyle = 'rgba(25,27,40,.9)';
    conductorCtx.lineWidth = 2;
    conductorCtx.beginPath();
    conductorCtx.roundRect(-10, -17, 19, 34, 7);
    conductorCtx.fill();
    conductorCtx.stroke();
    conductorCtx.restore();
    drawElegantGlove(wrist.x + Math.cos(handAngle) * 7, wrist.y + Math.sin(handAngle) * 7, handAngle, openHand);
  }

  function drawConductorCatPrevious(energy) {
    const scale = Math.max(.42, Math.min(1.9, Math.min(w / 900, h / 620) * conductorConfig.size));
    const direction = conductorConfig.facing === 'right' ? -1 : conductorConfig.facing === 'left' ? 1 : conductorConfig.x < .5 ? -1 : 1;
    const cx = w * conductorConfig.x;
    const baseY = h * conductorConfig.y;
    const phrase = conductorState.phase;
    const sweep = (.35 + energy.mid * .9) * conductorConfig.gesture;
    const lift = (.28 + energy.treble * .85) * conductorConfig.gesture;
    const breath = energy.bass * 4;

    const upperShoulder = { x: -31, y: -165 };
    const upperElbow = { x: -92 + Math.sin(phrase * .72) * 10 * sweep, y: -205 - Math.cos(phrase * .72) * 9 * sweep };
    const upperWrist = { x: -158 + Math.sin(phrase) * 21 * sweep, y: -220 + Math.cos(phrase) * 25 * lift };
    const upperHandAngle = Math.atan2(upperWrist.y - upperElbow.y, upperWrist.x - upperElbow.x);
    const lowerShoulder = { x: -25, y: -137 };
    const lowerElbow = { x: -91 + Math.cos(phrase * .67) * 9 * sweep, y: -158 + Math.sin(phrase * .67) * 11 * sweep };
    const lowerWrist = { x: -154 + Math.cos(phrase * .88) * 15 * sweep, y: -174 + Math.sin(phrase * .88) * 19 * sweep };
    const lowerHandAngle = Math.atan2(lowerWrist.y - lowerElbow.y, lowerWrist.x - lowerElbow.x);
    const batonTip = {
      x: upperWrist.x - 125 - Math.cos(phrase * .58) * 18,
      y: upperWrist.y - 112 + Math.sin(phrase * .9) * 38 * lift
    };

    conductorCtx.save();
    conductorCtx.translate(cx, baseY);
    conductorCtx.scale(direction * scale, scale);
    conductorCtx.rotate(-.015 - energy.bass * .025);
    conductorCtx.translate(0, breath);

    conductorCtx.fillStyle = 'rgba(5,7,13,.76)';
    conductorCtx.beginPath();
    conductorCtx.moveTo(-84, 7);
    conductorCtx.quadraticCurveTo(0, -12, 98, 5);
    conductorCtx.lineTo(82, 19);
    conductorCtx.quadraticCurveTo(0, 8, -94, 20);
    conductorCtx.closePath();
    conductorCtx.fill();
    conductorCtx.strokeStyle = conductorColor(currentPalette.main, .35);
    conductorCtx.lineWidth = 2;
    conductorCtx.stroke();

    conductorCtx.strokeStyle = 'rgba(78,91,124,.95)';
    conductorCtx.lineWidth = 24;
    conductorCtx.lineCap = 'round';
    conductorCtx.beginPath();
    conductorCtx.moveTo(48, -70);
    conductorCtx.bezierCurveTo(112, -76, 127 + Math.sin(phrase * .45) * 14, -26, 91, 4);
    conductorCtx.stroke();
    conductorCtx.strokeStyle = conductorColor(currentPalette.main, .35);
    conductorCtx.lineWidth = 2;
    conductorCtx.stroke();

    conductorCtx.fillStyle = 'rgba(5,7,13,.99)';
    conductorCtx.strokeStyle = 'rgba(29,34,49,.98)';
    conductorCtx.lineWidth = 3;
    conductorCtx.beginPath();
    conductorCtx.moveTo(-35, -177);
    conductorCtx.bezierCurveTo(12, -190, 65, -158, 72, -102);
    conductorCtx.bezierCurveTo(82, -42, 73, -4, 51, 13);
    conductorCtx.lineTo(-32, 13);
    conductorCtx.bezierCurveTo(-52, -37, -61, -111, -35, -177);
    conductorCtx.closePath();
    conductorCtx.fill();
    conductorCtx.stroke();
    conductorCtx.strokeStyle = conductorColor(currentPalette.main, .48);
    conductorCtx.lineWidth = 1.4;
    conductorCtx.beginPath();
    conductorCtx.moveTo(6, -172);
    conductorCtx.bezierCurveTo(55, -142, 64, -82, 57, -30);
    conductorCtx.stroke();
    conductorCtx.beginPath();
    conductorCtx.moveTo(41, -74);
    conductorCtx.quadraticCurveTo(58, -66, 68, -48);
    conductorCtx.stroke();

    drawElegantArm(lowerShoulder, lowerElbow, lowerWrist, lowerHandAngle, true);
    drawElegantArm(upperShoulder, upperElbow, upperWrist, upperHandAngle, false);

    conductorCtx.strokeStyle = 'rgba(246,242,223,.97)';
    conductorCtx.lineWidth = 3.2;
    conductorCtx.shadowBlur = 8 + energy.treble * 18;
    conductorCtx.shadowColor = conductorColor(currentPalette.hot, .9);
    conductorCtx.beginPath();
    conductorCtx.moveTo(upperWrist.x + Math.cos(upperHandAngle) * 28, upperWrist.y + Math.sin(upperHandAngle) * 28);
    conductorCtx.quadraticCurveTo((upperWrist.x + batonTip.x) * .5 - 8, (upperWrist.y + batonTip.y) * .5, batonTip.x, batonTip.y);
    conductorCtx.stroke();
    conductorCtx.shadowBlur = 0;

    conductorCtx.fillStyle = 'rgba(86,103,143,.99)';
    conductorCtx.strokeStyle = 'rgba(20,25,39,.98)';
    conductorCtx.lineWidth = 3;
    conductorCtx.lineJoin = 'round';
    conductorCtx.beginPath();
    conductorCtx.moveTo(31, -257);
    conductorCtx.lineTo(72, -286);
    conductorCtx.lineTo(58, -244);
    conductorCtx.bezierCurveTo(62, -213, 39, -186, 4, -181);
    conductorCtx.bezierCurveTo(-27, -176, -59, -189, -72, -211);
    conductorCtx.bezierCurveTo(-79, -222, -88, -226, -94, -232);
    conductorCtx.bezierCurveTo(-82, -246, -76, -266, -57, -277);
    conductorCtx.bezierCurveTo(-39, -288, -20, -289, -5, -286);
    conductorCtx.lineTo(17, -322);
    conductorCtx.lineTo(31, -278);
    conductorCtx.bezierCurveTo(40, -272, 42, -265, 31, -257);
    conductorCtx.closePath();
    conductorCtx.fill();
    conductorCtx.stroke();

    conductorCtx.fillStyle = 'rgba(86,103,143,.99)';
    conductorCtx.strokeStyle = 'rgba(20,25,39,.96)';
    conductorCtx.lineWidth = 2.4;
    conductorCtx.beginPath();
    conductorCtx.moveTo(-42, -193);
    conductorCtx.lineTo(-54, -176);
    conductorCtx.lineTo(-31, -183);
    conductorCtx.lineTo(-34, -165);
    conductorCtx.lineTo(-12, -184);
    conductorCtx.closePath();
    conductorCtx.fill();
    conductorCtx.stroke();

    conductorCtx.fillStyle = 'rgba(20,25,39,.98)';
    conductorCtx.beginPath();
    conductorCtx.moveTo(-38, -284);
    conductorCtx.quadraticCurveTo(-26, -307, -11, -301);
    conductorCtx.lineTo(-16, -289);
    conductorCtx.quadraticCurveTo(-2, -302, 8, -291);
    conductorCtx.quadraticCurveTo(-11, -276, -38, -284);
    conductorCtx.closePath();
    conductorCtx.fill();

    conductorCtx.fillStyle = 'rgba(232,153,177,.72)';
    conductorCtx.beginPath();
    conductorCtx.moveTo(20, -282);
    conductorCtx.lineTo(19, -310);
    conductorCtx.lineTo(29, -279);
    conductorCtx.closePath();
    conductorCtx.fill();
    conductorCtx.beginPath();
    conductorCtx.moveTo(45, -264);
    conductorCtx.lineTo(65, -281);
    conductorCtx.lineTo(54, -253);
    conductorCtx.closePath();
    conductorCtx.fill();

    conductorCtx.fillStyle = 'rgba(233,227,250,.98)';
    conductorCtx.beginPath();
    conductorCtx.moveTo(-72, -238);
    conductorCtx.bezierCurveTo(-91, -233, -101, -217, -91, -204);
    conductorCtx.bezierCurveTo(-79, -188, -51, -188, -39, -205);
    conductorCtx.bezierCurveTo(-32, -217, -43, -239, -72, -238);
    conductorCtx.closePath();
    conductorCtx.fill();
    conductorCtx.stroke();

    const blink = Math.sin(frame * .018) > .986 ? .15 : 1;
    conductorCtx.fillStyle = 'rgba(210,236,112,.98)';
    conductorCtx.beginPath();
    conductorCtx.ellipse(-57, -253, 11, 16 * blink, -.28, 0, Math.PI * 2);
    conductorCtx.fill();
    conductorCtx.fillStyle = 'rgba(8,11,17,.98)';
    conductorCtx.beginPath();
    conductorCtx.ellipse(-60, -253, 3, 11 * blink, -.25, 0, Math.PI * 2);
    conductorCtx.fill();
    conductorCtx.strokeStyle = 'rgba(15,18,28,.94)';
    conductorCtx.lineWidth = 3;
    conductorCtx.beginPath();
    conductorCtx.moveTo(-73, -271);
    conductorCtx.quadraticCurveTo(-57, -278, -44, -268);
    conductorCtx.stroke();
    conductorCtx.strokeStyle = 'rgba(238,235,249,.9)';
    conductorCtx.lineWidth = 2;
    conductorCtx.beginPath();
    conductorCtx.moveTo(-70, -267);
    conductorCtx.quadraticCurveTo(-57, -273, -47, -265);
    conductorCtx.stroke();

    conductorCtx.fillStyle = 'rgba(42,27,38,.98)';
    conductorCtx.beginPath();
    conductorCtx.moveTo(-97, -229);
    conductorCtx.lineTo(-85, -235);
    conductorCtx.lineTo(-85, -223);
    conductorCtx.closePath();
    conductorCtx.fill();
    conductorCtx.strokeStyle = 'rgba(32,35,48,.88)';
    conductorCtx.lineWidth = 1.5;
    for (let whisker = 0; whisker < 3; whisker++) {
      conductorCtx.beginPath();
      conductorCtx.moveTo(-84, -215 + whisker * 6);
      conductorCtx.quadraticCurveTo(-112, -218 + whisker * 4, -130, -230 + whisker * 14);
      conductorCtx.stroke();
    }

    conductorCtx.fillStyle = 'rgba(241,240,247,.96)';
    conductorCtx.beginPath();
    conductorCtx.moveTo(-34, -187);
    conductorCtx.lineTo(-4, -175);
    conductorCtx.lineTo(22, -188);
    conductorCtx.lineTo(11, -164);
    conductorCtx.lineTo(-9, -174);
    conductorCtx.lineTo(-24, -159);
    conductorCtx.closePath();
    conductorCtx.fill();
    conductorCtx.strokeStyle = 'rgba(24,27,39,.9)';
    conductorCtx.stroke();

    if (energy.treble > .16) {
      const sparks = 1 + Math.floor(energy.treble * 4);
      for (let i = 0; i < sparks; i++) {
        const angle = phrase * .8 + i * 2.5;
        const distance = 13 + i * 8 + energy.treble * 15;
        drawSpark(batonTip.x + Math.cos(angle) * distance, batonTip.y + Math.sin(angle) * distance, 4 + energy.treble * 6, .18 + energy.treble * .55);
      }
    }
    conductorCtx.restore();
  }

  function catLerp(from, to, amount) {
    return from + (to - from) * amount;
  }

  function blendCatPoint(from, to, amount) {
    return { x: catLerp(from.x, to.x, amount), y: catLerp(from.y, to.y, amount) };
  }

  function blendCatArm(from, to, amount) {
    return {
      shoulder: blendCatPoint(from.shoulder, to.shoulder, amount),
      elbow: blendCatPoint(from.elbow, to.elbow, amount),
      wrist: blendCatPoint(from.wrist, to.wrist, amount),
      handAngle: catLerp(from.handAngle, to.handAngle, amount),
      open: amount < .5 ? from.open : to.open
    };
  }

  function blendCatPose(from, to, amount) {
    return {
      id: amount < .5 ? from.id : to.id,
      view: from.view,
      bodyLean: catLerp(from.bodyLean, to.bodyLean, amount),
      headTilt: catLerp(from.headTilt, to.headTilt, amount),
      left: blendCatArm(from.left, to.left, amount),
      right: blendCatArm(from.right, to.right, amount),
      batonHand: amount < .5 ? from.batonHand : to.batonHand,
      batonAngle: catLerp(from.batonAngle, to.batonAngle, amount),
      batonLength: catLerp(from.batonLength, to.batonLength, amount)
    };
  }

  function animateCatPose(pose, energy, phrase) {
    const beat = Math.sin(phrase * 1.8);
    const sweep = conductorConfig.gesture;
    const left = blendCatArm(pose.left, pose.left, 0);
    const right = blendCatArm(pose.right, pose.right, 0);
    const highLift = energy.treble * 12 * sweep + (energy.highAccent || 0) * 13;
    const middleSpread = energy.mid * 13 * sweep;
    const lowStrike = (energy.bassAccent || 0) * 22 * sweep;
    left.wrist.x -= middleSpread;
    right.wrist.x += middleSpread;
    left.wrist.y -= highLift * .65 + beat * energy.mid * 4;
    right.wrist.y -= highLift + beat * energy.treble * 5;
    const batonArm = pose.batonHand === 'left' ? left : right;
    batonArm.wrist.y += lowStrike;
    batonArm.elbow.y += lowStrike * .32;
    return {
      ...pose,
      left,
      right,
      bodyLean: pose.bodyLean - energy.bass * .035 + beat * energy.overall * .012,
      headTilt: pose.headTilt + Math.sin(phrase * .42) * energy.mid * .055,
      batonAngle: pose.batonAngle + Math.sin(phrase * 1.35) * (.08 + energy.treble * .16) * sweep + lowStrike * .006
    };
  }

  function drawCatGlove(wrist, angle, open) {
    conductorCtx.save();
    conductorCtx.translate(wrist.x, wrist.y);
    conductorCtx.rotate(angle);
    conductorCtx.fillStyle = 'rgba(247,245,247,.99)';
    conductorCtx.strokeStyle = 'rgba(24,29,42,.98)';
    conductorCtx.lineWidth = 2.2;
    conductorCtx.beginPath();
    conductorCtx.roundRect(-13, -11, 22, 23, 7);
    conductorCtx.fill();
    conductorCtx.stroke();
    conductorCtx.strokeStyle = 'rgba(247,245,247,.99)';
    conductorCtx.lineWidth = 7;
    conductorCtx.lineCap = 'round';
    const fingers = open ? [-.58, -.12, .34] : [-.24, .02, .26];
    fingers.forEach((offset, index) => {
      conductorCtx.beginPath();
      conductorCtx.moveTo(2, -5 + index * 4);
      conductorCtx.lineTo(21 + (open ? index * 2 : 0), -8 + offset * 14);
      conductorCtx.stroke();
    });
    conductorCtx.strokeStyle = 'rgba(24,29,42,.92)';
    conductorCtx.lineWidth = 1.4;
    conductorCtx.beginPath();
    conductorCtx.moveTo(0, 4);
    conductorCtx.quadraticCurveTo(9, 10, 15, 4);
    conductorCtx.stroke();
    conductorCtx.restore();
  }

  function drawCatArm(arm, energy) {
    conductorCtx.lineCap = 'round';
    conductorCtx.lineJoin = 'round';
    conductorCtx.strokeStyle = 'rgba(22,28,41,.98)';
    conductorCtx.lineWidth = 40;
    conductorCtx.beginPath();
    conductorCtx.moveTo(arm.shoulder.x, arm.shoulder.y);
    conductorCtx.lineTo(arm.elbow.x, arm.elbow.y);
    conductorCtx.lineTo(arm.wrist.x, arm.wrist.y);
    conductorCtx.stroke();
    conductorCtx.strokeStyle = 'rgba(4,6,11,.99)';
    conductorCtx.lineWidth = 33;
    conductorCtx.stroke();
    conductorCtx.strokeStyle = conductorColor(currentPalette.main, .28 + energy.mid * .28);
    conductorCtx.lineWidth = 1.5;
    conductorCtx.beginPath();
    conductorCtx.moveTo(arm.shoulder.x, arm.shoulder.y - 10);
    conductorCtx.lineTo(arm.elbow.x, arm.elbow.y - 9);
    conductorCtx.lineTo(arm.wrist.x, arm.wrist.y - 6);
    conductorCtx.stroke();
    conductorCtx.save();
    conductorCtx.translate(arm.wrist.x, arm.wrist.y);
    conductorCtx.rotate(arm.handAngle);
    conductorCtx.fillStyle = 'rgba(245,243,247,.98)';
    conductorCtx.strokeStyle = 'rgba(22,27,40,.96)';
    conductorCtx.lineWidth = 2;
    conductorCtx.beginPath();
    conductorCtx.roundRect(-18, -13, 18, 26, 6);
    conductorCtx.fill();
    conductorCtx.stroke();
    conductorCtx.restore();
    drawCatGlove(arm.wrist, arm.handAngle, arm.open);
  }

  function drawCatTail(energy, phrase) {
    conductorCtx.strokeStyle = 'rgba(68,88,125,.98)';
    conductorCtx.lineWidth = 27;
    conductorCtx.lineCap = 'round';
    conductorCtx.beginPath();
    conductorCtx.moveTo(45, -55);
    conductorCtx.bezierCurveTo(111, -72, 132 + Math.sin(phrase * .45) * 12, -22, 91, 9 + energy.bass * 4);
    conductorCtx.stroke();
    conductorCtx.strokeStyle = 'rgba(18,25,39,.96)';
    conductorCtx.lineWidth = 2.5;
    conductorCtx.stroke();
  }

  function drawCatBody(view, energy) {
    conductorCtx.fillStyle = 'rgba(3,5,10,.99)';
    conductorCtx.strokeStyle = 'rgba(27,34,48,.99)';
    conductorCtx.lineWidth = 3;
    conductorCtx.beginPath();
    conductorCtx.moveTo(-39, -181);
    conductorCtx.bezierCurveTo(-66, -146, -73, -63, -55, 12);
    conductorCtx.quadraticCurveTo(0, 24, 58, 10);
    conductorCtx.bezierCurveTo(78, -55, 66, -145, 39, -181);
    conductorCtx.quadraticCurveTo(0, -195, -39, -181);
    conductorCtx.closePath();
    conductorCtx.fill();
    conductorCtx.stroke();

    if (view === 'front') {
      conductorCtx.fillStyle = 'rgba(246,244,245,.99)';
      conductorCtx.beginPath();
      conductorCtx.moveTo(-22, -170);
      conductorCtx.quadraticCurveTo(0, -183, 22, -170);
      conductorCtx.lineTo(31, -31);
      conductorCtx.quadraticCurveTo(0, -10, -31, -31);
      conductorCtx.closePath();
      conductorCtx.fill();
      conductorCtx.strokeStyle = 'rgba(25,29,40,.85)';
      conductorCtx.stroke();
      conductorCtx.fillStyle = 'rgba(19,25,36,.99)';
      conductorCtx.beginPath();
      conductorCtx.moveTo(-40, -176);
      conductorCtx.lineTo(-8, -132);
      conductorCtx.lineTo(-31, -106);
      conductorCtx.closePath();
      conductorCtx.fill();
      conductorCtx.beginPath();
      conductorCtx.moveTo(40, -176);
      conductorCtx.lineTo(8, -132);
      conductorCtx.lineTo(31, -106);
      conductorCtx.closePath();
      conductorCtx.fill();
      conductorCtx.fillStyle = conductorColor(currentPalette.hot, .82);
      conductorCtx.beginPath();
      conductorCtx.arc(0, -29, 4, 0, Math.PI * 2);
      conductorCtx.fill();
    } else {
      conductorCtx.strokeStyle = conductorColor(currentPalette.main, .4 + energy.mid * .2);
      conductorCtx.lineWidth = 1.5;
      conductorCtx.beginPath();
      conductorCtx.moveTo(5, -176);
      conductorCtx.bezierCurveTo(47, -139, 55, -77, 49, -25);
      conductorCtx.stroke();
    }
  }

  function drawCatHead(view, tilt, energy) {
    conductorCtx.save();
    conductorCtx.translate(0, -238);
    conductorCtx.rotate(tilt);
    conductorCtx.fillStyle = 'rgba(67,88,127,.99)';
    conductorCtx.strokeStyle = 'rgba(18,24,38,.99)';
    conductorCtx.lineWidth = 3;
    conductorCtx.lineJoin = 'round';
    conductorCtx.beginPath();
    conductorCtx.moveTo(-58, -8);
    conductorCtx.lineTo(-79, -61);
    conductorCtx.lineTo(-33, -42);
    conductorCtx.quadraticCurveTo(0, -56, 35, -42);
    conductorCtx.lineTo(78, -62);
    conductorCtx.lineTo(61, -6);
    conductorCtx.lineTo(79, 10);
    conductorCtx.lineTo(58, 14);
    conductorCtx.lineTo(70, 31);
    conductorCtx.lineTo(43, 28);
    conductorCtx.quadraticCurveTo(0, 49, -43, 28);
    conductorCtx.lineTo(-69, 32);
    conductorCtx.lineTo(-58, 14);
    conductorCtx.lineTo(-78, 9);
    conductorCtx.closePath();
    conductorCtx.fill();
    conductorCtx.stroke();
    conductorCtx.fillStyle = 'rgba(225,132,157,.86)';
    conductorCtx.beginPath();
    conductorCtx.moveTo(-68, -51);
    conductorCtx.lineTo(-42, -38);
    conductorCtx.lineTo(-59, -13);
    conductorCtx.closePath();
    conductorCtx.fill();
    conductorCtx.beginPath();
    conductorCtx.moveTo(67, -52);
    conductorCtx.lineTo(42, -38);
    conductorCtx.lineTo(59, -14);
    conductorCtx.closePath();
    conductorCtx.fill();
    conductorCtx.fillStyle = 'rgba(15,21,33,.99)';
    conductorCtx.beginPath();
    conductorCtx.moveTo(-23, -40);
    conductorCtx.quadraticCurveTo(-7, -57, 2, -39);
    conductorCtx.quadraticCurveTo(16, -55, 27, -35);
    conductorCtx.quadraticCurveTo(3, -25, -23, -40);
    conductorCtx.fill();

    if (view === 'front') {
      const blink = Math.sin(frame * .018) > .986 ? .14 : 1;
      conductorCtx.fillStyle = 'rgba(220,224,207,.98)';
      conductorCtx.beginPath();
      conductorCtx.ellipse(-17, -12, 14, 22 * blink, -.12, 0, Math.PI * 2);
      conductorCtx.ellipse(17, -12, 14, 22 * blink, .12, 0, Math.PI * 2);
      conductorCtx.fill();
      conductorCtx.fillStyle = 'rgba(14,20,31,.98)';
      conductorCtx.beginPath();
      conductorCtx.ellipse(-13, -10, 4, 13 * blink, 0, 0, Math.PI * 2);
      conductorCtx.ellipse(13, -10, 4, 13 * blink, 0, 0, Math.PI * 2);
      conductorCtx.fill();
      conductorCtx.fillStyle = 'rgba(241,239,239,.99)';
      conductorCtx.beginPath();
      conductorCtx.ellipse(-19, 19, 26, 22, -.1, 0, Math.PI * 2);
      conductorCtx.ellipse(19, 19, 26, 22, .1, 0, Math.PI * 2);
      conductorCtx.fill();
      conductorCtx.strokeStyle = 'rgba(29,31,40,.9)';
      conductorCtx.stroke();
      conductorCtx.fillStyle = 'rgba(20,18,25,.99)';
      conductorCtx.beginPath();
      conductorCtx.ellipse(0, 8, 9, 7, 0, 0, Math.PI * 2);
      conductorCtx.fill();
      conductorCtx.strokeStyle = 'rgba(32,30,38,.94)';
      conductorCtx.lineWidth = 2;
      conductorCtx.beginPath();
      conductorCtx.moveTo(0, 15);
      conductorCtx.quadraticCurveTo(0, 29, -15, 31);
      conductorCtx.moveTo(0, 15);
      conductorCtx.quadraticCurveTo(2, 29, 17, 29);
      conductorCtx.stroke();
    } else {
      conductorCtx.fillStyle = 'rgba(242,239,242,.98)';
      conductorCtx.beginPath();
      conductorCtx.ellipse(-55, 14, 18, 24, -.28, 0, Math.PI * 2);
      conductorCtx.fill();
      conductorCtx.stroke();
      conductorCtx.fillStyle = 'rgba(28,22,30,.98)';
      conductorCtx.beginPath();
      conductorCtx.moveTo(-75, 6);
      conductorCtx.lineTo(-64, 1);
      conductorCtx.lineTo(-65, 13);
      conductorCtx.closePath();
      conductorCtx.fill();
      conductorCtx.strokeStyle = 'rgba(30,34,45,.84)';
      conductorCtx.lineWidth = 1.4;
      for (let whisker = 0; whisker < 3; whisker++) {
        conductorCtx.beginPath();
        conductorCtx.moveTo(-67, 18 + whisker * 5);
        conductorCtx.lineTo(-103, 9 + whisker * 12);
        conductorCtx.stroke();
      }
    }
    conductorCtx.restore();
  }

  function drawCatSkeletonPose(pose, energy, opacity = 1) {
    const scale = Math.max(.42, Math.min(1.9, Math.min(w / 900, h / 620) * conductorConfig.size));
    const direction = conductorConfig.facing === 'right' ? -1 : conductorConfig.facing === 'left' ? 1 : conductorConfig.x < .5 ? -1 : 1;
    const phrase = conductorState.phase;
    const cx = w * conductorConfig.x;
    const baseY = h * conductorConfig.y + Math.sin(phrase * .48) * energy.overall * 3 + energy.bass * 3;
    const animated = animateCatPose(pose, energy, phrase);
    const batonArm = animated.batonHand === 'left' ? animated.left : animated.right;
    const batonStart = {
      x: batonArm.wrist.x + Math.cos(animated.batonAngle) * 15,
      y: batonArm.wrist.y + Math.sin(animated.batonAngle) * 15
    };
    const batonTip = {
      x: batonStart.x + Math.cos(animated.batonAngle) * animated.batonLength,
      y: batonStart.y + Math.sin(animated.batonAngle) * animated.batonLength
    };

    conductorCtx.save();
    conductorCtx.globalAlpha *= opacity;
    conductorCtx.translate(cx, baseY);
    conductorCtx.scale(direction * scale, scale);
    conductorCtx.rotate(animated.bodyLean);
    drawCatTail(energy, phrase);
    drawCatBody(animated.view, energy);
    drawCatArm(animated.left, energy);
    drawCatArm(animated.right, energy);
    drawCatHead(animated.view, animated.headTilt, energy);

    conductorCtx.strokeStyle = 'rgba(247,242,220,.98)';
    conductorCtx.lineWidth = 3.1;
    conductorCtx.shadowBlur = 8 + energy.treble * 19;
    conductorCtx.shadowColor = conductorColor(currentPalette.hot, .9);
    conductorCtx.beginPath();
    conductorCtx.moveTo(batonStart.x, batonStart.y);
    conductorCtx.quadraticCurveTo((batonStart.x + batonTip.x) * .5, (batonStart.y + batonTip.y) * .5 - 3, batonTip.x, batonTip.y);
    conductorCtx.stroke();
    conductorCtx.shadowBlur = 0;
    if (energy.treble > .18) drawSpark(batonTip.x, batonTip.y, 7 + energy.treble * 8, .2 + energy.treble * .55);
    conductorCtx.restore();
  }

  function drawConductorCat(energy) {
    const poses = window.SmokeResonanceConductorPoses || [];
    if (!poses.length) return drawConductorCatPrevious(energy);
    const progress = (conductorState.phase * .22) % poses.length;
    const index = Math.floor(progress);
    const nextIndex = (index + 1) % poses.length;
    const raw = progress - index;
    const blend = raw * raw * (3 - 2 * raw);
    const current = poses[index];
    const next = poses[nextIndex];
    if (current.view === next.view) {
      drawCatSkeletonPose(blendCatPose(current, next, blend), energy, 1);
    } else {
      drawCatSkeletonPose(current, energy, 1 - blend);
      drawCatSkeletonPose(next, energy, blend);
    }
  }

  function drawConductorOverlay(energy) {
    conductorCtx.clearRect(0, 0, w, h);
    if (!conductorState.enabled) return;
    const bassRise = Math.max(0, energy.bass - conductorState.prevBass);
    const midRise = Math.max(0, energy.mid - conductorState.prevMid);
    const highRise = Math.max(0, energy.treble - conductorState.prevHigh);
    conductorState.bassAccent = Math.max(conductorState.bassAccent * .88, bassRise * 3.5, Math.max(0, energy.bass - .58) * 1.4);
    conductorState.midAccent = Math.max(conductorState.midAccent * .9, midRise * 2.8, Math.max(0, energy.mid - .56) * 1.35);
    conductorState.highAccent = Math.max(conductorState.highAccent * .91, highRise * 3.1, Math.max(0, energy.treble - .5) * 1.55);
    conductorState.prevBass = energy.bass;
    conductorState.prevMid = energy.mid;
    conductorState.prevHigh = energy.treble;
    conductorState.bass += (energy.bass - conductorState.bass) * .3;
    conductorState.mid += (energy.mid - conductorState.mid) * .22;
    conductorState.treble += (energy.treble - conductorState.treble) * .26;
    conductorState.overall += (energy.overall - conductorState.overall) * .2;
    conductorState.phase += (.035 + conductorState.mid * .17 + conductorState.bass * .08) * conductorConfig.speed;
    const reactive = {
      bass: conductorState.bass,
      mid: conductorState.mid,
      treble: conductorState.treble,
      overall: conductorState.overall,
      bassAccent: Math.min(1, conductorState.bassAccent),
      midAccent: Math.min(1, conductorState.midAccent),
      highAccent: Math.min(1, conductorState.highAccent)
    };

    const spotlight = conductorCtx.createRadialGradient(w * .5, h * .55, 10, w * .5, h * .55, Math.min(w, h) * .52);
    spotlight.addColorStop(0, conductorColor(currentPalette.main, .055 + reactive.overall * .08));
    spotlight.addColorStop(1, 'rgba(0,0,0,0)');
    conductorCtx.fillStyle = spotlight;
    conductorCtx.fillRect(0, 0, w, h);
    drawOrchestra(reactive);
    drawConductorCat(reactive);
  }

  async function ensureBeta() {
    if (betaState.visualizer && betaState.presets) return true;
    if (betaState.loadPromise) return betaState.loadPromise;
    betaState.loadPromise = (async () => {
      if (!window.butterchurn || !window.butterchurnPresets) {
        betaState.lastError = '本地 Butterchurn 脚本未加载';
        return false;
      }
      try {
        const engine = window.butterchurn.default || window.butterchurn;
        const presetLibrary = window.butterchurnPresets.default || window.butterchurnPresets;
        betaState.visualizer = engine.createVisualizer(audioState.context, betaCanvas, {
          width: Math.max(1, Math.round(w * dpr)),
          height: Math.max(1, Math.round(h * dpr)),
          pixelRatio: 1
        });
        betaState.presets = presetLibrary.getPresets();
        connectBetaAudio();
        return Object.keys(betaState.presets).length > 0;
      } catch (error) {
        betaState.lastError = /webgl/i.test(error?.message || '')
          ? 'WebGL 2 初始化失败，请检查浏览器硬件加速'
          : error?.message || 'Butterchurn 初始化失败';
        betaState.visualizer = null;
        betaState.presets = null;
        return false;
      }
    })();
    const result = await betaState.loadPromise;
    if (!result) betaState.loadPromise = null;
    return result;
  }

  function loadBetaPreset(name) {
    const candidates = [betaPresetNames[name], ...betaFallbackPresets].filter(Boolean);
    let lastError;
    for (const key of candidates) {
      if (!betaState.presets[key]) continue;
      try {
        betaState.visualizer.loadPreset(betaState.presets[key], activeEffect.startsWith('beta-') ? 1.2 : 0);
        betaState.currentPreset = key;
        betaState.renderFailures = 0;
        return key;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('没有可用的兼容预设');
  }

  function glitchFrequencyDensity(energy) {
    const bands = 48;
    const threshold = .075 + energy.overall * .14;
    let active = 0;
    for (let index = 0; index < bands; index++) {
      if (spectrumValue(index, bands) > threshold) active++;
    }
    return active / bands;
  }

  function spawnGlitchFragments(profile, strength) {
    const count = Math.max(1, Math.round(profile.burst * (.34 + strength * .9)));
    for (let index = 0; index < count; index++) {
      let x = 0;
      let y = Math.random() * h;
      let width = w;
      let height = 4 + Math.random() * (12 + strength * 42);
      let dx = (Math.random() * 2 - 1) * (12 + strength * w * .11);
      let dy = 0;

      if (profile.mode === 'chroma') {
        height = 8 + Math.random() * (30 + strength * 72);
        dx *= 1.35;
      } else if (profile.mode === 'tiles') {
        width = w * (.08 + Math.random() * .24);
        height = h * (.045 + Math.random() * .16);
        x = Math.random() * Math.max(1, w - width);
        y = Math.random() * Math.max(1, h - height);
        dx *= 1.8;
        dy = (Math.random() * 2 - 1) * (7 + strength * h * .08);
      } else if (profile.mode === 'scan') {
        width = 18 + Math.random() * (38 + strength * 82);
        height = h * (.18 + Math.random() * .52);
        x = Math.random() * Math.max(1, w - width);
        y = Math.random() * Math.max(1, h - height);
        dx *= .35;
        dy = (18 + Math.random() * 90) * (Math.random() > .5 ? 1 : -1) * (.3 + strength);
      } else if (profile.mode === 'datamosh') {
        width = w * (.28 + Math.random() * .62);
        height = 10 + Math.random() * (32 + strength * 74);
        x = Math.random() * Math.max(1, w - width);
        dx = (Math.random() > .5 ? 1 : -1) * (18 + strength * w * .15);
      } else if (profile.mode === 'rgb') {
        height = h * (.08 + Math.random() * .34);
        y = Math.random() * Math.max(1, h - height);
        dx *= 2.1;
      } else if (profile.mode === 'codec') {
        const cell = Math.max(12, Math.round(Math.min(w, h) / 28));
        width = cell * (2 + Math.floor(Math.random() * 8));
        height = cell * (1 + Math.floor(Math.random() * 5));
        x = Math.floor(Math.random() * Math.max(1, w - width) / cell) * cell;
        y = Math.floor(Math.random() * Math.max(1, h - height) / cell) * cell;
        dx = Math.round(dx / cell) * cell;
        dy = (Math.random() * 2 - 1) * cell * (1 + strength * 2);
      } else if (profile.mode === 'loss') {
        width = Math.random() > .45 ? w : 12 + Math.random() * w * .12;
        height = Math.random() > .45 ? 6 + Math.random() * h * .12 : h * (.25 + Math.random() * .6);
        x = width === w ? 0 : Math.random() * Math.max(1, w - width);
        y = height > h * .2 ? Math.random() * Math.max(1, h - height) : Math.random() * h;
        dx = (Math.random() * 2 - 1) * w * (.04 + strength * .08);
      }

      const life = profile.persistence
        ? 10 + Math.floor(Math.random() * 15 + strength * 14)
        : 4 + Math.floor(Math.random() * 8 + strength * 7);
      glitchState.fragments.push({
        x, y, width, height, dx, dy,
        hue: (Math.random() * 2 - 1) * profile.hue,
        life,
        maxLife: life
      });
    }
    if (glitchState.fragments.length > 90) glitchState.fragments.splice(0, glitchState.fragments.length - 90);
  }

  function clearGlitchPostFx() {
    stage.classList.remove('webgl-postfx-on');
    delete stage.dataset.glitchRenderer;
    if (glitchState.filter || betaCanvas.style.filter || canvas.style.filter || glitchCanvas.style.filter) {
      betaCanvas.style.filter = '';
      canvas.style.filter = '';
      glitchCanvas.style.filter = '';
      glitchState.filter = '';
    }
    if (glitchState.fragments.length) glitchState.fragments.length = 0;
    if (glitchState.noiseLines.length) glitchState.noiseLines.length = 0;
    glitchState.tension = 0;
    glitchState.slowEnvelope = 0;
    glitchState.fastEnvelope = 0;
    glitchState.transient = 0;
    glitchState.baseLayer = 0;
    glitchState.noiseLayer = 0;
    glitchState.burstLayer = 0;
    glitchState.burstFlash = 0;
    glitchState.lastFxAt = 0;
    glitchEngine?.reset(performance.now());
    glitchFeatureBus?.reset(performance.now());
    glitchWebglRenderer?.reset();
    glitchCtx.clearRect(0, 0, w, h);
  }

  function updateRhythmState(now) {
    const onset = Math.min(1, Math.max(audioState.features.onset || 0, audioState.accents.overall || 0));
    const threshold = Math.max(.095, mappingOutput?.onsetThreshold || .12);
    const gap = now - rhythmState.lastBeatAt;
    const fresh = audioState.playing
      && onset > threshold
      && onset > rhythmState.previousOnset * 1.025
      && gap > 155;
    if (fresh) {
      if (rhythmState.lastBeatAt && gap < 1800) {
        let folded = gap;
        while (folded < 280) folded *= 2;
        while (folded > 960) folded *= .5;
        const error = Math.abs(folded - rhythmState.interval) / Math.max(1, rhythmState.interval);
        const agreement = Math.max(0, 1 - error * 2.6);
        rhythmState.interval += (folded - rhythmState.interval) * (.12 + agreement * .18);
        rhythmState.confidence += (agreement - rhythmState.confidence) * .24;
        rhythmState.intervals.push(folded);
        if (rhythmState.intervals.length > 12) rhythmState.intervals.shift();
      }
      rhythmState.lastBeatAt = now;
      rhythmState.pulse = 1;
    } else {
      rhythmState.pulse *= .82;
      if (gap > rhythmState.interval * 2.4) rhythmState.confidence *= .992;
    }
    rhythmState.previousOnset = onset;
    rhythmState.phase = rhythmState.lastBeatAt
      ? ((now - rhythmState.lastBeatAt) / Math.max(220, rhythmState.interval)) % 1
      : 0;
  }

  function weightedSignal(values, weights) {
    let total = 0;
    let weightTotal = 0;
    for (let index = 0; index < values.length; index++) {
      const weight = Math.max(0, Number(weights[index]) || 0);
      total += Math.max(0, Math.min(1, values[index])) * weight;
      weightTotal += weight;
    }
    return weightTotal > 1e-5 ? Math.min(1, total / weightTotal) : 0;
  }

  function currentGlitchSignals() {
    fusionTimelineState.boundaryPulse *= .94;
    fusionTimelineState.chordPulse *= .9;
    const ensemble = Math.min(1, Math.max(0,
      (mappingOutput?.orchestration || audioState.features.orchestrationDensity || 0) * .74
      + (mappingOutput?.orchestrationSurge || 0) * .42
    ));
    const lowDrum = Math.min(1, Math.max(audioState.accents.bass || 0, audioState.features.onset * audioState.energy.bass * .82));
    const midDrum = Math.min(1, Math.max(audioState.accents.mid || 0, audioState.features.flux * audioState.energy.mid * .88));
    const highDrum = Math.min(1, Math.max(audioState.accents.treble || 0, audioState.features.onset * audioState.energy.treble, audioState.features.flux * .62));
    const drum = weightedSignal(
      [lowDrum, midDrum, highDrum],
      [glitchConfig.drumLow, glitchConfig.drumMid, glitchConfig.drumHigh]
    );
    const source = mappingOutput?.source || audioState.features;
    const dissonance = Math.min(1, Math.max(mappingOutput?.acid || 0, (source.roughness || 0) * .72 + (source.flatness || 0) * .28));
    const abrasionTransient = Math.min(1, Math.max((source.sharpness || 0) * (audioState.features.onset || 0), audioState.accents.treble || 0, (source.flux || 0) * .72));
    const abrasion = weightedSignal(
      [dissonance, source.roughness || 0, abrasionTransient, source.sweep || 0],
      [glitchConfig.abrasionDissonance, glitchConfig.abrasionRoughness, glitchConfig.abrasionTransient, glitchConfig.abrasionSweep]
    );
    const subdivision = Math.max(.5, Number(glitchConfig.rhythmSubdivision) || 1);
    const subPhase = (rhythmState.phase * subdivision) % 1;
    const distance = Math.min(subPhase, 1 - subPhase);
    const gridPulse = Math.exp(-Math.pow(distance / .115, 2)) * rhythmState.confidence;
    const rhythm = Math.min(1, Math.max(rhythmState.pulse, gridPulse));
    const sectionScores = mappingOutput?.sectionScores || {};
    const liveSection = Math.min(1, Math.max(
      (sectionScores.layering || 0) * .45,
      (sectionScores.full || 0) * .72,
      sectionScores.climax || 0,
      (sectionScores.drop || 0) * .95
    ));
    const section = Math.min(1, Math.max(
      liveSection,
      fusionTimelineState.connected ? fusionTimelineState.section : 0,
      fusionTimelineState.boundaryPulse
    ));
    const weightedEnsemble = ensemble * glitchConfig.ensembleWeight;
    const weightedDrum = drum * glitchConfig.drumWeight;
    const weightedAbrasion = abrasion * glitchConfig.abrasionWeight;
    const weightedSection = section * glitchConfig.sectionDrive;
    const drive = Math.min(1, (weightedEnsemble + weightedDrum + weightedAbrasion + weightedSection) / 3.05);
    // XLD offline timeline (internal) drives chord when connected; otherwise the
    // live chord engine (external monitoring) supplies it.
    const chordConfidence = fusionTimelineState.connected ? fusionTimelineState.chordConfidence : liveChordSignal.confidence;
    const chordChange = fusionTimelineState.connected ? Math.min(1, fusionTimelineState.chordPulse) : Math.min(1, liveChordSignal.change);
    const climaxState = fusionTimelineState.connected
      ? fusionTimelineState.climax
      : Math.min(1, Number(sectionScores.climax) || 0);
    const dropState = fusionTimelineState.connected
      ? fusionTimelineState.drop
      : Math.min(1, Number(sectionScores.drop) || 0);
    const buildState = fusionTimelineState.connected
      ? fusionTimelineState.build
      : Math.min(1, Math.max(Number(sectionScores.layering) || 0, Number(sectionScores.full) * .35 || 0));
    return {
      ensemble,
      beat: drum,
      acid: abrasion,
      rhythm,
      section,
      lowDrum,
      midDrum,
      highDrum,
      dissonance,
      abrasionTransient,
      weightedEnsemble,
      weightedBeat: weightedDrum,
      weightedAcid: weightedAbrasion,
      weightedSection,
      climax: climaxState,
      drop: dropState,
      build: buildState,
      boundaryPulse: fusionTimelineState.boundaryPulse,
      sectionSerial: fusionTimelineState.boundarySerial,
      chord: fusionTimelineState.connected ? fusionTimelineState.chord : liveChordSignal.chord,
      chordConfidence,
      chordChange,
      drive
    };
  }

  const chordHueRoots = Object.freeze({ C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 });
  let liveSectionKey = '';
  let liveSectionSerial = 0;

  function glitchChordHue(label) {
    const match = String(label || '').match(/^([A-G](?:#|b)?)/);
    return match && chordHueRoots[match[1]] !== undefined ? chordHueRoots[match[1]] / 12 : 0;
  }

  function buildGlitchFeatureFrame(energy, signals, now) {
    if (!glitchFeatureBus) return null;
    if (!fusionTimelineState.connected) {
      const nextKey = String(mappingOutput?.section || '');
      if (nextKey && liveSectionKey && nextKey !== liveSectionKey) liveSectionSerial++;
      if (nextKey) liveSectionKey = nextKey;
    }
    return glitchFeatureBus.update({
      playing: audioState.playing,
      loudness: Math.min(1, energy.overall * 1.18),
      bass: energy.bass,
      mid: energy.mid,
      treble: energy.treble,
      bassSmooth: energy.bass,
      midSmooth: energy.mid,
      trebleSmooth: energy.treble,
      ensemble: Math.min(1, signals.weightedEnsemble),
      acid: Math.min(1, signals.weightedAcid),
      build: signals.build,
      sectionDrive: Math.min(1, signals.weightedSection),
      climaxState: signals.climax,
      dropState: signals.drop,
      chordHue: glitchChordHue(signals.chord),
      chordConfidence: signals.chordConfidence,
      onset: Math.max(audioState.features.onset, audioState.accents.overall),
      bassPeak: Math.max(audioState.accents.bass, signals.lowDrum),
      boundaryPulse: signals.boundaryPulse,
      sectionSerial: fusionTimelineState.connected ? signals.sectionSerial : liveSectionSerial,
      chordChange: signals.chordChange
    }, now);
  }

  function drawUniversalGlitchPostFx(energy, now) {
    const sourceCanvas = activeEffect.startsWith('beta-') ? betaCanvas : canvas;
    const signals = currentGlitchSignals();
    const strength = Math.max(.4, glitchConfig.fxStrength);
    const elapsed = glitchState.lastFxAt ? Math.max(1 / 240, Math.min(.05, (now - glitchState.lastFxAt) / 1000)) : 1 / 60;
    glitchState.lastFxAt = now;
    const freePulse = Math.min(1, (signals.weightedBeat * .74 + signals.weightedAcid * .22 + (mappingOutput?.orchestrationSurge || 0) * .42 + signals.weightedSection * .28 + signals.chordChange * .3) * strength);
    const rhythmMix = glitchConfig.rhythmLock * Math.min(1, rhythmState.confidence * 1.35);
    const pulse = freePulse * (1 - rhythmMix) + Math.max(freePulse * .34, signals.rhythm) * rhythmMix;
    glitchState.beatPulse = Math.max(glitchState.beatPulse * .76, pulse);
    const richness = Math.min(1, Math.max(audioState.features.breadth, audioState.features.density, signals.ensemble * .88));
    const featureFrame = buildGlitchFeatureFrame(energy, signals, now);
    const climaxPulse = featureFrame?.events?.climaxEnter || 0;
    const dropPulse = featureFrame?.events?.dropEnter || 0;
    const layerState = glitchEngine?.update({
      playing: audioState.playing,
      loudness: energy.overall * 1.18,
      fast: Math.max(audioState.features.onset, audioState.accents.overall, signals.weightedBeat),
      ensemble: signals.weightedEnsemble,
      section: signals.weightedSection,
      acid: signals.weightedAcid,
      richness,
      flatness: audioState.features.flatness,
      treble: energy.treble,
      flux: audioState.features.flux,
      pulse,
      climax: climaxPulse,
      drop: dropPulse,
      chord: signals.chord,
      chordChange: signals.chordChange,
      chordConfidence: signals.chordConfidence
    }, now, glitchConfig) || {};
    glitchState.slowEnvelope = layerState.slowEnvelope || 0;
    glitchState.fastEnvelope = layerState.fastEnvelope || 0;
    glitchState.transient = layerState.transient || 0;
    glitchState.loudness = glitchState.slowEnvelope;
    glitchState.baseLayer = layerState.base || 0;
    glitchState.noiseLayer = layerState.noise || 0;
    glitchState.burstLayer = layerState.burst || 0;
    glitchState.burstFlash = layerState.flash || 0;
    glitchState.tension = layerState.tension || 0;
    const webglRendered = Boolean(
      featureFrame
      && glitchWebglRenderer?.get().available
      && glitchWebglRenderer.render({
        sourceCanvas,
        features: featureFrame,
        palette: currentPalette,
        time: now,
        strength
      })
    );
    if (webglRendered) {
      stage.classList.add('webgl-postfx-on');
      stage.dataset.glitchRenderer = 'webgl2';
      sourceCanvas.style.filter = '';
      glitchCanvas.style.filter = '';
      glitchState.filter = '';
      glitchCtx.clearRect(0, 0, w, h);
      webglFailureNotified = false;
      return;
    }
    stage.classList.remove('webgl-postfx-on');
    stage.dataset.glitchRenderer = 'canvas2d';
    if (!webglFailureNotified && glitchWebglRenderer && !glitchWebglRenderer.get().available) {
      webglFailureNotified = true;
      showToast('WebGL2 不可用，已自动使用 Canvas2D Glitch', 4200);
    }
    const drive = Math.min(1, glitchState.baseLayer * .55 + glitchState.noiseLayer * .28 + glitchState.burstLayer * .62);

    const chromaAmount = Math.min(1, (signals.weightedAcid * .68 + signals.weightedEnsemble * .12) * strength);
    const brightness = Math.min(1.68, .94 + glitchState.slowEnvelope * .92 + glitchState.burstFlash * .12);
    const contrast = Math.min(2.25, .96 + audioState.features.dynamicRange * .98 + glitchState.burstLayer * .28);
    const saturation = Math.min(2.8, .78 + richness * 1.42 + glitchState.noiseLayer * .34);
    const filter = `brightness(${brightness.toFixed(3)}) contrast(${contrast.toFixed(3)}) saturate(${saturation.toFixed(3)})`;
    sourceCanvas.style.filter = filter;
    glitchCanvas.style.filter = '';
    if (sourceCanvas === betaCanvas) canvas.style.filter = '';
    else betaCanvas.style.filter = '';
    glitchState.filter = filter;
    glitchCtx.clearRect(0, 0, w, h);
    if (drive < .008) {
      if (!audioState.playing) {
        glitchState.fragments.length = 0;
        glitchState.noiseLines.length = 0;
      }
      return;
    }

    const tearAmount = Math.min(1, (signals.weightedBeat * .62 + signals.weightedAcid * .38) * strength);
    const blockAmount = Math.min(1, (signals.weightedEnsemble * .5 + signals.weightedBeat * .3 + signals.weightedSection * .34) * strength);
    const macroRelease = layerState.release === 'macro';
    const microRelease = layerState.release === 'micro';
    const shouldSpawn = macroRelease || microRelease;
    if (shouldSpawn) {
      const releaseStrength = layerState.releaseStrength || 0;
      const fragmentLimit = currentQualityBudget().glitchFragments;
      const count = Math.min(fragmentLimit, macroRelease
        ? 3 + Math.round(releaseStrength * 5 + blockAmount * 2)
        : 1 + Number(releaseStrength > .52));
      for (let index = 0; index < count; index++) {
        const block = (blockAmount > tearAmount || macroRelease) && Math.random() < (.34 + blockAmount * .38);
        const width = block ? w * (.09 + Math.random() * (.24 + blockAmount * .16)) : w;
        const height = block ? h * (.045 + Math.random() * (.13 + blockAmount * .08)) : 3 + Math.random() * (12 + tearAmount * 64);
        const mode = dropPulse > .62 && index === 0
          ? 'dropout'
          : signals.weightedAcid > signals.weightedBeat * 1.08 && Math.random() < .48
            ? 'sort'
            : block ? 'block' : 'tear';
        glitchState.fragments.push({
          x: block ? Math.random() * Math.max(1, w - width) : 0,
          y: Math.random() * Math.max(1, h - height),
          width,
          height,
          dx: (Math.random() * 2 - 1) * (7 + w * (.025 + tearAmount * .1)),
          dy: block ? (Math.random() * 2 - 1) * h * .025 : 0,
          mode,
          slices: 2 + Math.floor(Math.random() * 4),
          life: macroRelease ? 7 + Math.floor(Math.random() * 7) : 3 + Math.floor(Math.random() * 4),
          maxLife: macroRelease ? 14 : 7
        });
      }
      if (glitchState.fragments.length > fragmentLimit) glitchState.fragments.splice(0, glitchState.fragments.length - fragmentLimit);
      glitchState.lastBurstAt = now;
    }

    const sourceScaleX = sourceCanvas.width / Math.max(1, w);
    const sourceScaleY = sourceCanvas.height / Math.max(1, h);
    glitchCtx.save();
    glitchCtx.imageSmoothingEnabled = false;
    glitchCtx.globalCompositeOperation = 'screen';
    for (let index = glitchState.fragments.length - 1; index >= 0; index--) {
      const fragment = glitchState.fragments[index];
      const life = Math.max(0, fragment.life / fragment.maxLife);
      glitchCtx.globalAlpha = life * (.24 + drive * .66);
      if (fragment.mode === 'dropout') {
        glitchCtx.globalCompositeOperation = 'source-over';
        glitchCtx.fillStyle = `rgba(2,3,8,${Math.min(.92, life * (.46 + dropPulse * .42))})`;
        glitchCtx.fillRect(fragment.x, fragment.y, fragment.width, fragment.height);
        glitchCtx.globalCompositeOperation = 'screen';
      } else if (fragment.mode === 'sort') {
        const sliceHeight = fragment.height / Math.max(1, fragment.slices);
        for (let slice = 0; slice < fragment.slices; slice++) {
          const offset = sliceHeight * slice;
          const stretch = 1 + (slice / Math.max(1, fragment.slices - 1) - .5) * chromaAmount * .34;
          try {
            glitchCtx.drawImage(
              sourceCanvas,
              fragment.x * sourceScaleX,
              (fragment.y + offset) * sourceScaleY,
              fragment.width * sourceScaleX,
              sliceHeight * sourceScaleY,
              fragment.x + fragment.dx * (1 + slice * .18),
              fragment.y + offset + fragment.dy,
              fragment.width * stretch,
              Math.max(1, sliceHeight)
            );
          } catch (_) {}
        }
      } else {
        try {
          glitchCtx.drawImage(
            sourceCanvas,
            fragment.x * sourceScaleX,
            fragment.y * sourceScaleY,
            fragment.width * sourceScaleX,
            fragment.height * sourceScaleY,
            fragment.x + fragment.dx,
            fragment.y + fragment.dy,
            fragment.width,
            fragment.height
          );
        } catch (_) {}
      }
      if (fragment.mode !== 'dropout' && chromaAmount > .035) {
        glitchCtx.globalAlpha = life * chromaAmount * .32;
        glitchCtx.filter = 'sepia(1) saturate(9) hue-rotate(285deg)';
        try {
          glitchCtx.drawImage(
            sourceCanvas,
            fragment.x * sourceScaleX,
            fragment.y * sourceScaleY,
            fragment.width * sourceScaleX,
            fragment.height * sourceScaleY,
            fragment.x - 3 - chromaAmount * 22,
            fragment.y,
            fragment.width,
            fragment.height
          );
        } catch (_) {}
        glitchCtx.filter = 'none';
      }
      fragment.life -= elapsed * 60;
      if (fragment.life <= 0) glitchState.fragments.splice(index, 1);
    }

    if (glitchState.burstLayer > .08 && pulse > .08 && chromaAmount > .08) {
      glitchCtx.globalCompositeOperation = 'screen';
      glitchCtx.globalAlpha = Math.min(.22, pulse * chromaAmount * glitchState.burstLayer * .24);
      glitchCtx.filter = 'sepia(1) saturate(11) hue-rotate(300deg)';
      try { glitchCtx.drawImage(sourceCanvas, -5 - chromaAmount * 14, 0, w, h); } catch (_) {}
      glitchCtx.filter = 'sepia(1) saturate(10) hue-rotate(145deg)';
      try { glitchCtx.drawImage(sourceCanvas, 5 + chromaAmount * 14, 0, w, h); } catch (_) {}
      glitchCtx.filter = 'none';
    }

    const dropVeil = dropPulse * Math.max(glitchState.burstLayer, glitchState.burstFlash);
    if (dropVeil > .08) {
      glitchCtx.globalCompositeOperation = 'source-over';
      glitchCtx.fillStyle = `rgba(2,3,8,${Math.min(.42, dropVeil * .34 * strength)})`;
      glitchCtx.fillRect(0, 0, w, h);
      glitchCtx.fillStyle = `rgba(${currentPalette.hot.join(',')},${Math.min(.7, dropVeil * .5)})`;
      glitchCtx.fillRect(0, h * .5 - 1, w, 2);
    }

    const scanAmount = glitchState.baseLayer * Math.min(.34, glitchState.noiseLayer * .18 + .045);
    if (scanAmount > .012) {
      glitchCtx.globalCompositeOperation = 'source-over';
      glitchCtx.fillStyle = `rgba(2,3,8,${Math.min(.18, scanAmount * .16)})`;
      const gap = Math.max(7, Math.round(18 - scanAmount * 9));
      for (let y = frame % gap; y < h; y += gap) glitchCtx.fillRect(0, y, w, 1);
    }
    const noiseAmount = glitchState.noiseLayer * Math.min(.48, signals.weightedAcid * .28 + energy.treble * .12 + .04);
    if (noiseAmount > .012) {
      const noiseInterval = Math.max(65, 220 - noiseAmount * 145 - audioState.accents.treble * 48);
      if (now - glitchState.lastNoiseAt >= noiseInterval) {
        glitchState.lastNoiseAt = now;
        const count = Math.min(currentQualityBudget().glitchNoiseLines, 1 + Math.round(noiseAmount * 18));
        glitchState.noiseLines = Array.from({ length: count }, () => ({
          x: Math.random(),
          y: Math.random(),
          width: .035 + Math.random() * (.12 + noiseAmount * .22),
          height: Math.random() > .84 ? 2 : .65
        }));
      }
      glitchCtx.globalCompositeOperation = 'screen';
      glitchCtx.fillStyle = `rgba(${currentPalette.hot.map(Math.round).join(',')},${Math.min(.16, noiseAmount * .18)})`;
      for (const line of glitchState.noiseLines) {
        const width = w * line.width;
        glitchCtx.fillRect(line.x * Math.max(1, w - width), line.y * h, width, line.height);
      }
    }
    if (glitchState.burstFlash > .025) {
      glitchCtx.globalCompositeOperation = 'screen';
      glitchCtx.fillStyle = `rgba(${currentPalette.hot.join(',')},${Math.min(.18, glitchState.burstFlash * (.045 + glitchState.slowEnvelope * .09))})`;
      glitchCtx.fillRect(0, 0, w, h);
    }
    glitchCtx.restore();
  }

  function drawBetaRhythmPostFx(energy) {
    const accent = Math.min(1, Math.max(
      audioState.accents.bass,
      audioState.accents.mid * .84,
      audioState.accents.treble * .72,
      audioState.accents.overall
    ));
    betaRhythmState.pulse = Math.max(betaRhythmState.pulse * .72, accent);
    betaRhythmState.loudness += (energy.overall - betaRhythmState.loudness) * .22;
    const brightness = .52 + betaRhythmState.loudness * 1.08 + betaRhythmState.pulse * .34;
    const contrast = 1.02 + betaRhythmState.loudness * .38 + betaRhythmState.pulse * .15;
    const saturation = .82 + energy.treble * .7 + betaRhythmState.pulse * .22;
    betaCanvas.style.filter = `brightness(${brightness.toFixed(2)}) contrast(${contrast.toFixed(2)}) saturate(${saturation.toFixed(2)})`;
    glitchCanvas.style.filter = '';
    glitchState.filter = '';
    if (glitchState.fragments.length) glitchState.fragments.length = 0;

    glitchCtx.clearRect(0, 0, w, h);
    const veil = Math.max(.045, Math.min(.34, .34 - betaRhythmState.loudness * .35 - betaRhythmState.pulse * .14));
    glitchCtx.fillStyle = `rgba(2,3,9,${veil})`;
    glitchCtx.fillRect(0, 0, w, h);
    if (betaRhythmState.pulse > .055) {
      const glow = glitchCtx.createRadialGradient(w * .5, h * .52, 0, w * .5, h * .52, Math.max(w, h) * .56);
      glow.addColorStop(0, `rgba(${currentPalette.hot.join(',')},${betaRhythmState.pulse * .075})`);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      glitchCtx.fillStyle = glow;
      glitchCtx.fillRect(0, 0, w, h);
    }
  }

  function drawGlitchPostFx(energy) {
    const profile = glitchProfiles[activeEffect] || glitchProfiles['beta-glitch-1'];
    const now = performance.now();
    const ensembleTarget = mappingOutput?.orchestration ?? audioState.features.richness;
    const acidTarget = mappingOutput?.acid ?? audioState.features.acid;
    glitchState.ensemble += (ensembleTarget - glitchState.ensemble) * (ensembleTarget > glitchState.ensemble ? .22 : .065);
    glitchState.acid += (acidTarget - glitchState.acid) * (acidTarget > glitchState.acid ? .31 : .09);
    glitchState.smoothBass += (energy.bass - glitchState.smoothBass) * .12;
    const bassRise = Math.max(0, energy.bass - glitchState.prevBass);
    const bassOnset = Math.max(0, energy.bass - glitchState.smoothBass);
    const beatStrength = Math.min(1, Math.max(
      bassRise * 6.2,
      bassOnset * 4.8,
      audioState.accents.bass,
      audioState.accents.mid * .82,
      audioState.accents.treble * .68,
      audioState.features.flux * .92,
      audioState.features.onset * glitchConfig.onset,
      Math.max(0, energy.bass - .5) * 1.8
    ));
    glitchState.beatPulse = Math.max(glitchState.beatPulse * .84, beatStrength);
    glitchState.prevBass = energy.bass;
    glitchState.loudness += (energy.overall - glitchState.loudness) * .16;
    const densityTarget = Math.max(
      glitchFrequencyDensity(energy),
      audioState.features.density,
      glitchState.ensemble * .82 * glitchConfig.ensemble
    );
    glitchState.density += (densityTarget - glitchState.density) * .13;
    const dynamicTarget = Math.min(1, Math.max(audioState.features.dynamicRange, audioState.accents.overall * .72 + Math.max(0, audioState.instant.overall - glitchState.loudness) * 2.8));
    glitchState.dynamicRange += (dynamicTarget - glitchState.dynamicRange) * (dynamicTarget > glitchState.dynamicRange ? .28 : .09);

    glitchState.rateAccumulator += .003
      + energy.bass * .02
      + glitchState.beatPulse * .19 * glitchConfig.onset
      + glitchState.ensemble * .012 * glitchConfig.ensemble
      + glitchState.acid * .06 * glitchConfig.acid;
    const onsetBurst = beatStrength > .085 && now - glitchState.lastBurstAt > 82;
    if (onsetBurst || glitchState.rateAccumulator >= 1) {
      const strength = Math.min(1,
        .13
        + glitchState.beatPulse * .72 * glitchConfig.onset
        + energy.bass * .24
        + glitchState.ensemble * .22 * glitchConfig.ensemble
        + glitchState.acid * .3 * glitchConfig.acid
      );
      spawnGlitchFragments(profile, strength);
      glitchState.lastBurstAt = now;
      glitchState.rateAccumulator = onsetBurst ? Math.min(.45, glitchState.rateAccumulator) : glitchState.rateAccumulator - 1;
    }

    const brightness = .52 + (glitchState.loudness * 1.5 + glitchState.beatPulse * .24) * glitchConfig.brightness;
    const contrast = .94 + glitchState.dynamicRange * 1.12 * glitchConfig.contrast;
    const saturation = .62 + (glitchState.density * 2.15 + glitchState.ensemble * .48 + glitchState.acid * .34) * glitchConfig.saturation;
    const filter = `brightness(${brightness.toFixed(2)}) contrast(${contrast.toFixed(2)}) saturate(${saturation.toFixed(2)})`;
    if (filter !== glitchState.filter) {
      betaCanvas.style.filter = filter;
      glitchCanvas.style.filter = `contrast(${(1 + glitchState.loudness * .36).toFixed(2)})`;
      glitchState.filter = filter;
    }

    if (profile.mode === 'datamosh') {
      glitchCtx.save();
      glitchCtx.globalCompositeOperation = 'destination-out';
      glitchCtx.fillStyle = `rgba(0,0,0,${Math.max(.08, 1 - profile.persistence).toFixed(2)})`;
      glitchCtx.fillRect(0, 0, w, h);
      glitchCtx.restore();
    } else {
      glitchCtx.clearRect(0, 0, w, h);
    }
    const sourceScaleX = betaCanvas.width / Math.max(1, w);
    const sourceScaleY = betaCanvas.height / Math.max(1, h);
    glitchCtx.save();
    glitchCtx.globalCompositeOperation = ['chroma', 'rgb'].includes(profile.mode) ? 'screen' : 'source-over';

    if ((profile.rgb || glitchState.acid * glitchConfig.acid > .26) && (audioState.features.flux > .025 || glitchState.beatPulse > .08 || glitchState.acid > .18)) {
      const split = 2 + audioState.features.flux * 22 + glitchState.beatPulse * 10 + glitchState.acid * 18 * glitchConfig.acid;
      glitchCtx.globalAlpha = .055 + audioState.features.flux * .13 + glitchState.acid * .075;
      glitchCtx.filter = 'sepia(1) saturate(8) hue-rotate(285deg)';
      glitchCtx.drawImage(betaCanvas, -split, 0, w, h);
      glitchCtx.filter = 'sepia(1) saturate(8) hue-rotate(90deg)';
      glitchCtx.drawImage(betaCanvas, split, 0, w, h);
      glitchCtx.filter = 'none';
    }

    for (let index = glitchState.fragments.length - 1; index >= 0; index--) {
      const fragment = glitchState.fragments[index];
      const life = fragment.life / fragment.maxLife;
      const motion = .3 + glitchState.beatPulse * .82 + glitchState.acid * .48 * glitchConfig.acid;
      glitchCtx.globalAlpha = life * (.3 + glitchState.loudness * .56 + glitchState.beatPulse * .12);
      const codecFilter = profile.quantize ? ` contrast(${(1.15 + glitchState.dynamicRange * 1.8).toFixed(2)})` : '';
      const lossFilter = profile.dropout && glitchState.beatPulse > .2 ? ' grayscale(1) invert(.08)' : '';
      glitchCtx.filter = `hue-rotate(${fragment.hue + glitchState.acid * 48 * glitchConfig.acid}deg) saturate(${(1 + glitchState.density * 1.9 + glitchState.acid * .8).toFixed(2)})${codecFilter}${lossFilter}`;
      try {
        glitchCtx.drawImage(
          betaCanvas,
          fragment.x * sourceScaleX,
          fragment.y * sourceScaleY,
          fragment.width * sourceScaleX,
          fragment.height * sourceScaleY,
          fragment.x + fragment.dx * motion,
          fragment.y + fragment.dy * motion,
          fragment.width,
          fragment.height
        );
      } catch (_) {}
      fragment.life--;
      if (fragment.life <= 0) glitchState.fragments.splice(index, 1);
    }
    glitchCtx.filter = 'none';
    if (profile.dropout && glitchState.beatPulse > .18) {
      const bars = 1 + Math.floor(glitchState.beatPulse * 5);
      glitchCtx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < bars; i++) {
        const y = Math.random() * h;
        const height = 2 + Math.random() * (6 + glitchState.beatPulse * 28);
        glitchCtx.globalAlpha = .12 + glitchState.beatPulse * .28;
        glitchCtx.fillStyle = i % 2 ? '#04050a' : conductorColor(currentPalette.hot, .34);
        glitchCtx.fillRect(0, y, w, height);
      }
    }
    if (glitchState.beatPulse > .08) {
      glitchCtx.globalCompositeOperation = 'screen';
      glitchCtx.globalAlpha = glitchState.beatPulse * (.035 + glitchState.loudness * .07);
      glitchCtx.fillStyle = conductorColor(currentPalette.hot, 1);
      glitchCtx.fillRect(0, 0, w, h);
    }
    glitchCtx.restore();
  }

  function resetLegacyMaterialState(id, reason) {
    const materialId = String(id || '');
    const resetReason = String(reason || 'manual');
    if (resetReason === 'material-change' ||
        resetReason === 'material-deactivate' ||
        resetReason === 'track-change' ||
        resetReason === 'seek') {
      spectrumLevels.length = 0;
      spectrumPeaks.length = 0;
      mirrorLevels.length = 0;
      ribbonSpectrumLevels.length = 0;
      ribbonFastLevels.length = 0;
      ribbonPreviousRaw.length = 0;
      ribbonTransientLevels.length = 0;
    }
    if (materialId === 'pulsar' &&
        resetReason !== 'pause' &&
        resetReason !== 'resume') {
      pulsarState.history.length = 0;
      pulsarState.lastCaptureAt = 0;
      pulsarState.lastDrawAt = 0;
    }
    if (materialId === 'original-glitch' &&
        resetReason !== 'material-deactivate') {
      originalGlitchRenderer?.reset();
    }
  }

  function renderButterchurnMaterial() {
    try {
      betaState.visualizer?.render();
      betaState.renderFailures = 0;
    } catch (error) {
      betaState.renderFailures++;
      if (betaState.renderFailures === 3) {
        betaState.lastError = error?.message || '渲染失败';
        setActiveEffectState('bloom', 'renderer-fallback');
        selectButton(activeEffect);
        showToast('MilkDrop 与当前显卡不兼容，已切换到棱镜花', 4200);
      }
    }
  }

  const legacyMaterialRenderers = Object.freeze({
    spectrum: frame => drawSpectrum(frame.musicFrame.energy),
    mirror: frame => drawMirrorSpectrum(frame.musicFrame.energy),
    waveform: frame => drawWaveform(frame.musicFrame.energy),
    radial: frame => drawRadialSpectrum(frame.musicFrame.energy),
    waterfall: () => drawWaterfall(),
    vu: frame => drawVu(frame.musicFrame.energy),
    ribbons: frame => drawRibbons(frame.musicFrame.energy),
    pulsar: frame => drawPulsar(
      frame.musicFrame.energy,
      frame.musicFrame.now
    ),
    tunnel: frame => drawTunnel(frame.musicFrame.energy),
    'pulse-grid': frame => drawPulseGrid(frame.musicFrame.energy),
    bloom: frame => drawBloom(frame.musicFrame.energy),
    'original-glitch': frame => {
      if (!frame.musicFrame.mapping) return;
      originalGlitchRenderer?.draw({
        ctx,
        canvas,
        width: w,
        height: h,
        palette: currentPalette,
        mapping: frame.musicFrame.mapping,
        energy: frame.musicFrame.energy,
        spectrumValue,
        frame: frame.clock.frameIndex,
        now: frame.musicFrame.now
      });
    }
  });

  function renderLegacyMaterialFrame(id, frame) {
    const materialId = String(id || '');
    if (materialId.startsWith('beta-')) {
      renderButterchurnMaterial();
      return {
        kind: 'canvas',
        source: betaCanvas,
        sourceKind: 'butterchurn-canvas'
      };
    }
    if (materialId !== 'pulsar') ctx.clearRect(0, 0, w, h);
    const renderer = legacyMaterialRenderers[materialId];
    if (typeof renderer !== 'function') {
      throw new Error(`LEGACY_MATERIAL_RENDERER_MISSING:${materialId}`);
    }
    renderer(frame);
    return {
      kind: 'canvas',
      source: canvas,
      sourceKind: 'base-canvas'
    };
  }

  function ensureMaterialRuntime() {
    if (materialRuntime || !materialApi || !materialRegistry) {
      return materialRuntime;
    }
    for (const id of availableEffects) {
      const beta = id.startsWith('beta-');
      const experimental = experimentalMaterialApi?.describe(id);
      if (experimental) {
        materialRegistry.register({
          id,
          label: effectNames[id] || experimental.label || id,
          category: experimental.category,
          sourceKind: experimental.sourceKind,
          experimental: true,
          create: () => experimentalMaterialApi.create(id, {
            createCanvas: (width, height) => {
              const surface = document.createElement('canvas');
              surface.width = width;
              surface.height = height;
              return surface;
            },
            createSurface: materialApi.createSurface,
            presentSurface: surface => {
              ctx.clearRect(0, 0, w, h);
              ctx.imageSmoothingEnabled = true;
              ctx.drawImage(surface.source, 0, 0, w, h);
            }
          })
        });
        continue;
      }
      materialRegistry.register({
        id,
        label: effectNames[id] || betaPresetNames[id] || id,
        category: beta ? 'legacy-butterchurn' : 'legacy-canvas',
        sourceKind: beta ? 'butterchurn-canvas' : 'base-canvas',
        create: () => materialApi.createLegacyAdapter({
          id,
          label: effectNames[id] || betaPresetNames[id] || id,
          sourceKind: beta ? 'butterchurn-canvas' : 'base-canvas',
          reset: reason => resetLegacyMaterialState(id, reason),
          update: frame => {
            if (id === 'waterfall') {
              updateWaterfallHistory(frame.clock.nowMs);
            }
          },
          render: frame => renderLegacyMaterialFrame(id, frame)
        })
      });
    }
    materialRuntime = materialApi.createRuntime({
      registry: materialRegistry,
      initialMaterialId: activeEffect
    });
    materialFrameOrchestrator = materialApi.createFrameOrchestrator({
      materialRuntime,
      splitTargets: snapshot => materialTargetRegistry?.split(
        snapshot?.values || {}
      ) || materialApi.splitTargets(snapshot)
    });
    return materialRuntime;
  }

  function currentMaterialTargetValues() {
    return Object.freeze({
      ...materialTargetDefaults,
      ...materialMappedTargets,
      ...materialTargetOverrides
    });
  }

  function acceptGeneratorMaterialMapping(frameIndex, report = null) {
    const expected = Number(frameIndex);
    const observed = Number(report?.clock?.frameIndex);
    if (
      !Number.isInteger(expected) ||
      !Number.isInteger(observed) ||
      expected !== observed
    ) {
      return Object.freeze({
        accepted: false,
        frameIndex: Number.isInteger(expected) ? expected : null,
        reportFrameIndex: Number.isInteger(observed) ? observed : null,
        values: currentMaterialTargetValues()
      });
    }
    const next = {};
    for (const [id, rawValue] of Object.entries(
      report?.targets?.values || {}
    )) {
      if (!id.startsWith('material.')) continue;
      const definition = materialTargetRegistry?.get(id);
      const value = Number(rawValue);
      if (!definition || !Number.isFinite(value)) continue;
      next[id] = Math.max(definition.min, Math.min(definition.max, value));
    }
    materialMappedTargets = Object.freeze(next);
    return Object.freeze({
      accepted: Object.keys(next).length > 0,
      frameIndex: expected,
      reportFrameIndex: observed,
      values: currentMaterialTargetValues()
    });
  }

  function setMaterialTargetOverrides(values = {}) {
    const next = {};
    for (const [id, rawValue] of Object.entries(values || {})) {
      const definition = materialTargetRegistry?.get(id);
      const value = Number(rawValue);
      if (!definition || !Number.isFinite(value)) continue;
      next[id] = Math.max(definition.min, Math.min(definition.max, value));
    }
    materialTargetOverrides = Object.freeze(next);
    return currentMaterialTargetValues();
  }

  function setActiveEffectState(name, reason = 'material-change') {
    activeEffect = name;
    stage.dataset.effect = name;
    const runtime = ensureMaterialRuntime();
    if (runtime?.status()?.activeMaterialId !== name) {
      runtime.activate(name, reason);
    }
    return activeEffect;
  }

  function selectButton(name) {
    document.querySelectorAll('.scene-button').forEach(button => {
      button.classList.toggle('is-active', button.dataset.effect === name);
    });
  }

  async function setEffect(name, source = 'user') {
    if (!availableEffects.has(name)) {
      showToast('未知视觉场景，已保留当前画面');
      return false;
    }
    if (source === 'user' && directorState.enabled) setDirectorEnabled(false);
    if (name === activeEffect) return;
    glitchWebglRenderer?.reset();
    glitchFeatureBus?.reset(performance.now());
    if (name === 'original-glitch' && (!mappingEngine || !originalGlitchRenderer)) {
      showToast('原创映射模块未加载，请重新打开应用');
      return;
    }
    if (name === 'original-glitch') {
      setCalibrationPanel(true);
      setMappingLabPanel(true);
    }
    const token = ++switchToken;
    selectButton(name);
    if (name.startsWith('beta-')) {
      if (!audioState.context) {
        showToast('请先连接电脑声音');
        selectButton(activeEffect);
        return;
      }
      showToast('正在初始化本地 Butterchurn / MilkDrop…', 8000);
      const ready = await ensureBeta();
      if (token !== switchToken) return;
      if (!ready) {
        showToast(`Beta 加载失败：${betaState.lastError || '未知错误'}`, 4200);
        setActiveEffectState('spectrum', 'renderer-fallback');
        selectButton(activeEffect);
        return;
      }
      try {
        const key = loadBetaPreset(name);
        setActiveEffectState(name, 'material-change');
        showToast(`Butterchurn · ${key}`, 3600);
      } catch (error) {
        betaState.lastError = error?.message || '预设着色器不兼容';
        showToast(`Beta 预设失败：${betaState.lastError}`, 4200);
        setActiveEffectState('spectrum', 'renderer-fallback');
        selectButton(activeEffect);
      }
      return;
    }

    setActiveEffectState(name, 'material-change');
    showToast(effectNames[name]);
  }

  function hexToRgb(hex) {
    const normalized = String(hex).replace('#', '').padEnd(6, '0').slice(0, 6);
    return [0, 2, 4].map(index => Number.parseInt(normalized.slice(index, index + 2), 16) || 0);
  }

  function rgbToHex(rgb) {
    return `#${rgb.map(value => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')).join('')}`;
  }

  function rgbToHsl(rgb) {
    const [r, g, b] = rgb.map(value => value / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lightness = (max + min) / 2;
    if (max === min) return [0, 0, lightness];
    const delta = max - min;
    const saturation = lightness > .5 ? delta / (2 - max - min) : delta / (max + min);
    let hue = max === r
      ? (g - b) / delta + (g < b ? 6 : 0)
      : max === g
        ? (b - r) / delta + 2
        : (r - g) / delta + 4;
    hue /= 6;
    return [hue, saturation, lightness];
  }

  function hslToRgb(hsl) {
    let [hue, saturation, lightness] = hsl;
    hue = ((hue % 1) + 1) % 1;
    if (!saturation) return [lightness * 255, lightness * 255, lightness * 255];
    const q = lightness < .5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
    const p = 2 * lightness - q;
    const channel = offset => {
      let t = hue + offset;
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return [channel(1 / 3) * 255, channel(0) * 255, channel(-1 / 3) * 255];
  }

  function transformPaletteColor(color, hueShift, lightnessScale) {
    const hsl = rgbToHsl(color);
    hsl[0] += hueShift;
    hsl[2] = Math.max(.025, Math.min(.9, hsl[2] * lightnessScale));
    return hslToRgb(hsl);
  }

  function formatColorFxValue(key, value) {
    if (Number(value) <= .001) return '关闭';
    if (key === 'cycle') return `${Number(value).toFixed(2)}×`;
    return `${Math.round(Number(value) * 100)}%`;
  }

  function syncColorFxControls() {
    document.querySelectorAll('[data-color-fx-key]').forEach(input => {
      input.value = colorFx[input.dataset.colorFxKey];
    });
    document.querySelectorAll('[data-color-fx-output]').forEach(output => {
      const key = output.dataset.colorFxOutput;
      output.textContent = formatColorFxValue(key, colorFx[key]);
    });
  }

  function applyColorFx(values, persist = true) {
    for (const key of Object.keys(colorFxDefaults)) {
      if (values[key] === undefined) continue;
      const high = key === 'cycle' ? 2 : 1;
      colorFx[key] = Math.max(0, Math.min(high, Number(values[key]) || 0));
    }
    syncColorFxControls();
    if (persist) {
      try { localStorage.setItem('xins-fusion-color-fx', JSON.stringify(colorFx)); } catch (_) {}
    }
    return { ...colorFx };
  }

  function updateColorEffects(now) {
    const motion = now / 1000;
    const hueShift = colorFx.cycle > .001 ? (motion * colorFx.cycle / 18) % 1 : 0;
    const breathWave = .5 + .5 * Math.sin(motion * (1.05 + audioState.features.richness * .42));
    const breathScale = 1 - colorFx.breath * .12 + breathWave * colorFx.breath * .25;
    currentPalette = {
      main: transformPaletteColor(basePalette.main, hueShift, breathScale),
      hot: transformPaletteColor(basePalette.hot, hueShift, breathScale),
      dark: transformPaletteColor(basePalette.dark, hueShift, .92 + (breathScale - 1) * .42)
    };

    const trigger = Math.max(audioState.features.onset, audioState.accents.overall, audioState.accents.treble * .85);
    if (colorFx.strobe > .001 && trigger > .13 && now - colorFxState.lastFlashAt > 105) {
      colorFxState.flash = Math.max(colorFxState.flash, Math.min(1, trigger * 1.18));
      colorFxState.lastFlashAt = now;
    }
    colorFxState.flash *= .76;
    const flashOpacity = colorFx.strobe * colorFxState.flash * .24;
    colorFlash.style.opacity = flashOpacity.toFixed(3);
    colorFlash.style.background = `rgb(${currentPalette.hot.map(Math.round).join(',')})`;
    stage.style.setProperty('--accent', rgbToHex(currentPalette.main));
    stage.style.setProperty('--accent-2', rgbToHex(currentPalette.hot));
    stage.style.setProperty('--accent-soft', `rgba(${currentPalette.main.map(Math.round).join(',')}, .22)`);
  }

  function syncCustomPalette() {
    palettes.custom = {
      main: hexToRgb(customColors.main),
      hot: hexToRgb(customColors.hot),
      dark: hexToRgb(customColors.dark)
    };
    stage.style.setProperty('--custom-main', customColors.main);
    stage.style.setProperty('--custom-hot', customColors.hot);
    stage.style.setProperty('--custom-dark', customColors.dark);
    document.querySelectorAll('[data-custom-color]').forEach(input => {
      input.value = customColors[input.dataset.customColor];
    });
  }

  function applyPalette(name, persist = true) {
    syncCustomPalette();
    if (!palettes[name]) name = 'aurora';
    activePaletteName = name;
    basePalette = palettes[name];
    currentPalette = { main: [...basePalette.main], hot: [...basePalette.hot], dark: [...basePalette.dark] };
    stage.dataset.palette = name;
    document.querySelectorAll('.swatch').forEach(button => {
      button.classList.toggle('is-active', button.dataset.palette === name);
    });
    if (persist) {
      try { localStorage.setItem('xins-fusion-palette', JSON.stringify({ name, custom: customColors })); } catch (_) {}
    }
    return name;
  }

  function setPalettePanel(open) {
    palettePanel.classList.toggle('is-open', open);
    palettePanel.setAttribute('aria-hidden', String(!open));
    paletteButton.setAttribute('aria-expanded', String(open));
  }

  function resizeGlitchCurve() {
    const rect = glitchCurveCanvas.getBoundingClientRect();
    const width = Math.max(280, Math.round(rect.width || 360));
    const height = Math.max(96, Math.round(rect.height || 122));
    const scale = Math.min(window.devicePixelRatio || 1, 1.5);
    glitchCurveCanvas.width = Math.round(width * scale);
    glitchCurveCanvas.height = Math.round(height * scale);
    glitchCurveCtx.setTransform(scale, 0, 0, scale, 0, 0);
    glitchCurveState.width = width;
    glitchCurveState.height = height;
    drawGlitchCurve();
  }

  function drawGlitchCurve() {
    const width = glitchCurveState.width;
    const height = glitchCurveState.height;
    if (!width || !height) return;
    glitchCurveCtx.clearRect(0, 0, width, height);
    glitchCurveCtx.fillStyle = 'rgba(4, 6, 14, .78)';
    glitchCurveCtx.fillRect(0, 0, width, height);
    glitchCurveCtx.strokeStyle = 'rgba(255,255,255,.065)';
    glitchCurveCtx.lineWidth = 1;
    for (let index = 1; index < 4; index++) {
      const y = height * index / 4;
      glitchCurveCtx.beginPath();
      glitchCurveCtx.moveTo(0, y);
      glitchCurveCtx.lineTo(width, y);
      glitchCurveCtx.stroke();
    }
    const history = glitchCurveState.history;
    if (history.length < 2) return;
    const traces = [
      ['ensemble', '#65a9ff', 1.35],
      ['beat', '#ff62b0', 1.35],
      ['acid', '#a8ff5a', 1.35],
      ['section', '#b98cff', 1.25],
      ['rhythm', '#ffc867', 1.15],
      ['tension', '#ff9e64', 1.2],
      ['burst', '#ff416d', 1.5],
      ['drive', '#ffffff', 2]
    ];
    for (const [key, color, lineWidth] of traces) {
      glitchCurveCtx.beginPath();
      for (let index = 0; index < history.length; index++) {
        const x = index * width / Math.max(1, history.length - 1);
        const y = height - 5 - Math.min(1, history[index][key]) * (height - 10);
        if (index === 0) glitchCurveCtx.moveTo(x, y);
        else glitchCurveCtx.lineTo(x, y);
      }
      glitchCurveCtx.strokeStyle = color;
      glitchCurveCtx.lineWidth = lineWidth;
      glitchCurveCtx.globalAlpha = key === 'drive' ? .92 : .72;
      glitchCurveCtx.stroke();
    }
    glitchCurveCtx.globalAlpha = 1;
  }

  function updateGlitchCurve(now) {
    const panelOpen = glitchPanel.classList.contains('is-open');
    if (now - glitchCurveState.lastSampleAt < (panelOpen ? 65 : 130)) return;
    glitchCurveState.lastSampleAt = now;
    const signals = currentGlitchSignals();
    glitchCurveState.history.push({
      ensemble: signals.ensemble,
      beat: signals.beat,
      acid: signals.acid,
      section: signals.section,
      rhythm: signals.rhythm,
      tension: glitchState.tension,
      burst: glitchState.burstLayer,
      drive: Math.min(1, glitchState.baseLayer * .55 + glitchState.noiseLayer * .28 + glitchState.burstLayer * .62)
    });
    if (glitchCurveState.history.length > 260) glitchCurveState.history.shift();
    if (panelOpen) drawGlitchCurve();
  }

  function syncGlitchRendererState() {
    if (!glitchRendererState) return;
    const webgl = glitchWebglRenderer?.get();
    const active = Boolean(webgl?.available);
    glitchRendererState.dataset.state = active ? 'webgl2' : 'fallback';
    bindUiText(
      glitchRendererState,
      active ? 'runtime.glitch.rendererWebgl' : 'runtime.glitch.rendererFallback',
      active ? `WEBGL2 FEEDBACK · ${webgl.width || 0}×${webgl.height || 0}` : 'CANVAS2D FALLBACK · WEBGL2 UNAVAILABLE',
      active ? { width: webgl.width || 0, height: webgl.height || 0 } : undefined
    );
  }

  function syncGlitchControls() {
    document.querySelectorAll('[data-glitch-key]').forEach(input => {
      const key = input.dataset.glitchKey;
      input.value = glitchConfig[key];
    });
    document.querySelectorAll('[data-glitch-output]').forEach(output => {
      const key = output.dataset.glitchOutput;
      const value = Number(glitchConfig[key]) || 0;
      output.textContent = key === 'rhythmSubdivision' ? `${value}×` : `${Math.round(value * 100)}%`;
    });
    document.querySelectorAll('[data-glitch-preset]').forEach(button => {
      button.classList.toggle('is-active', button.dataset.glitchPreset === activeGlitchPreset);
    });
    glitchRackToggle.setAttribute('aria-pressed', String(glitchConfig.enabled));
    glitchRackToggle.textContent = glitchConfig.enabled ? 'ON' : 'OFF';
    glitchPowerButton.setAttribute('aria-pressed', String(glitchConfig.enabled));
    glitchPowerButton.textContent = glitchConfig.enabled ? 'FX ON' : 'FX OFF';
    stage.classList.toggle('postfx-on', glitchConfig.enabled);
    syncGlitchRendererState();
  }

  function applyGlitchConfig(values, persist = true, preset = 'custom') {
    const next = { ...values };
    if (next.drumWeight === undefined && next.beatWeight !== undefined) next.drumWeight = next.beatWeight;
    if (next.abrasionWeight === undefined && next.acidWeight !== undefined) next.abrasionWeight = next.acidWeight;
    if (next.enabled !== undefined) glitchConfig.enabled = Boolean(next.enabled);
    const doubleRangeKeys = [
      'ensembleWeight', 'drumWeight', 'abrasionWeight', 'sectionDrive', 'fxStrength',
      'drumLow', 'drumMid', 'drumHigh',
      'abrasionDissonance', 'abrasionRoughness', 'abrasionTransient', 'abrasionSweep',
      'baseLayer', 'noiseLayer', 'burstLayer', 'tensionBuild', 'eventSpacing'
    ];
    for (const key of doubleRangeKeys) {
      if (next[key] === undefined) continue;
      glitchConfig[key] = Math.max(0, Math.min(2, Number(next[key]) || 0));
    }
    if (next.rhythmLock !== undefined) glitchConfig.rhythmLock = Math.max(0, Math.min(1, Number(next.rhythmLock) || 0));
    if (next.rhythmSubdivision !== undefined) {
      const value = Number(next.rhythmSubdivision);
      glitchConfig.rhythmSubdivision = [.5, 1, 2, 4].includes(value) ? value : 1;
    }
    activeGlitchPreset = preset;
    syncGlitchControls();
    if (!glitchConfig.enabled) clearGlitchPostFx();
    if (persist) {
      try { localStorage.setItem('xins-fusion-glitch-settings', JSON.stringify(glitchConfig)); } catch (_) {}
    }
    return { ...glitchConfig };
  }

  function applyGlitchPreset(name) {
    const preset = glitchPresets[name];
    if (!preset) return;
    applyGlitchConfig({ ...glitchDefaults, ...preset, enabled: true }, true, name);
    showToast(`Glitch 权重 · ${preset.label}`);
  }

  function persistGlitchUserPresets() {
    try { localStorage.setItem('xins-fusion-glitch-user-presets', JSON.stringify(glitchUserPresets)); } catch (_) {}
  }

  function renderGlitchUserPresets() {
    glitchPresetList.replaceChildren();
    if (!glitchUserPresets.length) {
      const empty = document.createElement('span');
      empty.className = 'postfx-preset-empty';
      bindUiText(empty, 'runtime.glitch.emptyPresets', '尚未记录个人口味');
      glitchPresetList.append(empty);
      return;
    }
    for (const preset of glitchUserPresets) {
      const item = document.createElement('span');
      item.className = 'postfx-user-chip';
      const load = document.createElement('button');
      load.type = 'button';
      load.dataset.glitchUserPreset = preset.id;
      load.textContent = preset.name;
      bindUiAttribute(load, 'title', 'runtime.glitch.loadPresetTitle', '载入预设');
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.dataset.glitchUserDelete = preset.id;
      remove.textContent = '×';
      bindUiAttribute(remove, 'aria-label', 'runtime.glitch.deletePresetAria', `删除 ${preset.name}`, { name: preset.name });
      item.append(load, remove);
      glitchPresetList.append(item);
    }
  }

  function saveGlitchUserPreset() {
    const name = glitchPresetName.value.trim();
    if (!name) {
      showToast(uiText('runtime.glitch.nameRequired', '先给这组口味起个名字'));
      glitchPresetName.focus();
      return;
    }
    const existing = glitchUserPresets.find(item => item.name.toLowerCase() === name.toLowerCase());
    const values = Object.fromEntries(
      Object.entries(glitchConfig).filter(([key]) => key !== 'enabled')
    );
    if (existing) Object.assign(existing, values, { name });
    else {
      glitchUserPresets.push({ id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, name, ...values });
      if (glitchUserPresets.length > 12) glitchUserPresets.shift();
    }
    persistGlitchUserPresets();
    renderGlitchUserPresets();
    glitchPresetName.value = '';
    showToast(existing
      ? uiText('runtime.glitch.overwritten', `已覆盖个人预设 · ${name}`, { name })
      : uiText('runtime.glitch.saved', `已记录个人预设 · ${name}`, { name }));
  }

  function setGlitchRackEnabled(enabled, persist = true) {
    applyGlitchConfig({ enabled: Boolean(enabled) }, persist, activeGlitchPreset);
    if (persist) showToast(glitchConfig.enabled
      ? uiText('runtime.glitch.enabled', '通用 Glitch 效果器已接入当前画面')
      : uiText('runtime.glitch.bypassed', '通用 Glitch 效果器已旁路'));
  }

  function setGlitchPanel(open) {
    glitchPanel.classList.toggle('is-open', open);
    glitchPanel.setAttribute('aria-hidden', String(!open));
    glitchSettingsButton.setAttribute('aria-expanded', String(open));
    if (open) {
      ensurePanelInViewport(glitchPanel);
      requestAnimationFrame(resizeGlitchCurve);
    }
  }

  function formatConductorValue(key, value) {
    if (key === 'speed') return `${Number(value).toFixed(2)}×`;
    if (['gesture', 'size', 'x', 'y', 'orchestra'].includes(key)) return `${Math.round(Number(value) * 100)}%`;
    return String(value);
  }

  function syncConductorControls(activePosition = 'custom') {
    document.querySelectorAll('[data-conductor-key]').forEach(input => {
      input.value = conductorConfig[input.dataset.conductorKey];
    });
    document.querySelectorAll('[data-conductor-output]').forEach(output => {
      const key = output.dataset.conductorOutput;
      output.textContent = formatConductorValue(key, conductorConfig[key]);
    });
    document.querySelectorAll('[data-conductor-position]').forEach(button => {
      button.classList.toggle('is-active', button.dataset.conductorPosition === activePosition);
    });
  }

  function applyConductorConfig(values, persist = true, activePosition = 'custom') {
    const next = { ...conductorConfig, ...values };
    next.speed = Math.max(.4, Math.min(2.2, Number(next.speed)));
    next.gesture = Math.max(.4, Math.min(1.8, Number(next.gesture)));
    next.size = Math.max(.55, Math.min(1.5, Number(next.size)));
    next.x = Math.max(.1, Math.min(.9, Number(next.x)));
    next.y = Math.max(.58, Math.min(.96, Number(next.y)));
    next.orchestra = Math.max(0, Math.min(1, Number(next.orchestra)));
    next.facing = ['auto', 'left', 'right'].includes(next.facing) ? next.facing : 'auto';
    next.labels = ['auto', 'always', 'hidden'].includes(next.labels) ? next.labels : 'auto';
    if (values.labels === 'auto') conductorState.legendStartedAt = performance.now();
    Object.assign(conductorConfig, next);
    syncConductorControls(activePosition);
    if (persist) {
      try { localStorage.setItem('xins-fusion-conductor-settings', JSON.stringify(conductorConfig)); } catch (_) {}
    }
    return { ...conductorConfig };
  }

  function setConductorPosition(name) {
    const positions = {
      left: { x: .27, y: .87, facing: 'auto' },
      center: { x: .57, y: .87, facing: 'auto' },
      right: { x: .78, y: .87, facing: 'auto' }
    };
    if (!positions[name]) return;
    applyConductorConfig(positions[name], true, name);
    const position = uiText(`position.${name}`, name === 'left' ? '左侧' : name === 'right' ? '右侧' : '中央');
    showToast(uiText('runtime.conductor.position', `指挥站位 · ${position}`, { position }));
  }

  function setConductorPanel(open) {
    conductorPanel.classList.toggle('is-open', open);
    conductorPanel.setAttribute('aria-hidden', String(!open));
    conductorSettingsButton.setAttribute('aria-expanded', String(open));
  }

  function setConductorEnabled(enabled, persist = true) {
    conductorState.enabled = Boolean(enabled);
    if (conductorState.enabled) conductorState.legendStartedAt = performance.now();
    stage.classList.toggle('conductor-on', conductorState.enabled);
    conductorToggle.setAttribute('aria-pressed', String(conductorState.enabled));
    bindUiText(
      conductorToggle,
      conductorState.enabled ? 'runtime.conductor.on' : 'runtime.conductor.off',
      conductorState.enabled ? '猫指挥中' : '猫指挥'
    );
    if (!conductorState.enabled) conductorCtx.clearRect(0, 0, w, h);
    if (persist) {
      try { localStorage.setItem('xins-fusion-conductor', String(conductorState.enabled)); } catch (_) {}
      showToast(conductorState.enabled
        ? uiText('runtime.conductor.enabled', '指挥猫登台：低频管鼓点，中频管挥棒，高频管火花')
        : uiText('runtime.conductor.disabled', '指挥猫退场'));
    }
  }

  function formatCalibrationValue(key, value) {
    if (key === 'minFreq' || key === 'maxFreq') return value >= 1000 ? `${Number((value / 1000).toFixed(1))} kHz` : `${Math.round(value)} Hz`;
    if (key === 'minDb' || key === 'maxDb') return `${Math.round(value)} dB`;
    if (key === 'tilt') return `${value >= 0 ? '+' : ''}${Number(value).toFixed(1)} dB/oct`;
    if (key === 'smoothing') return `${Math.round(value * 100)}%`;
    return String(value);
  }

  function syncCalibrationControls(activePreset = 'custom') {
    document.querySelectorAll('[data-calibration-key]').forEach(input => {
      const key = input.dataset.calibrationKey;
      if (input.type === 'checkbox') input.checked = Boolean(calibration[key]);
      else input.value = calibration[key];
    });
    document.querySelectorAll('[data-output-for]').forEach(output => {
      const key = output.dataset.outputFor;
      output.textContent = formatCalibrationValue(key, calibration[key]);
    });
    document.querySelectorAll('[data-calibration-preset]').forEach(button => {
      button.classList.toggle('is-active', button.dataset.calibrationPreset === activePreset);
    });
  }

  function applyCalibration(values, activePreset = 'custom', persist = true) {
    const next = { ...calibration, ...values };
    next.minFreq = Math.max(20, Math.min(1000, Number(next.minFreq)));
    next.maxFreq = Math.max(2000, next.minFreq + 100, Math.min(22000, Number(next.maxFreq)));
    next.minDb = Math.max(-120, Math.min(-45, Number(next.minDb)));
    next.maxDb = Math.max(next.minDb + 6, Math.max(-50, Math.min(0, Number(next.maxDb))));
    next.tilt = Math.max(-8, Math.min(12, Number(next.tilt)));
    next.smoothing = Math.max(0, Math.min(.95, Number(next.smoothing)));
    next.scale = ['linear', 'log', 'bark', 'mel'].includes(next.scale) ? next.scale : 'log';
    next.autoGain = Boolean(next.autoGain);
    Object.assign(calibration, next);
    if (audioState.analyser) audioState.analyser.smoothingTimeConstant = calibration.smoothing;
    bandCache.clear();
    spectrumLevels.length = 0;
    spectrumPeaks.length = 0;
    mirrorLevels.length = 0;
    ribbonSpectrumLevels.length = 0;
    ribbonFastLevels.length = 0;
    ribbonPreviousRaw.length = 0;
    ribbonTransientLevels.length = 0;
    syncCalibrationControls(activePreset);
    if (persist) {
      try { localStorage.setItem('xins-fusion-calibration', JSON.stringify(calibration)); } catch (_) {}
    }
    window.dispatchEvent(new CustomEvent('smoke-resonance:calibrationchange', { detail: { ...calibration } }));
    return { ...calibration };
  }

  function applyCalibrationPreset(name) {
    const preset = calibrationPresets[name];
    if (!preset) return null;
    const result = applyCalibration(preset, name);
    showToast(`频谱校准 · ${preset.label}`);
    return result;
  }

  function formatResponseValue(value) {
    const number = Number(value);
    return `${number >= 0 ? '+' : ''}${number.toFixed(1)} dB`;
  }

  function syncResponseControls(activePreset = frequencyResponse.preset || 'custom') {
    document.querySelectorAll('[data-response-key]').forEach(input => {
      input.value = frequencyResponse[input.dataset.responseKey];
    });
    document.querySelectorAll('[data-response-output]').forEach(output => {
      output.textContent = formatResponseValue(frequencyResponse[output.dataset.responseOutput]);
    });
    document.querySelectorAll('[data-response-preset]').forEach(button => {
      button.classList.toggle('is-active', button.dataset.responsePreset === activePreset);
    });
  }

  function applyFrequencyResponse(values, activePreset = 'custom', persist = true) {
    for (const key of ['lowGain', 'midGain', 'highGain']) {
      if (values[key] !== undefined) frequencyResponse[key] = Math.max(-12, Math.min(12, Number(values[key]) || 0));
    }
    if (values.weighting !== undefined) {
      frequencyResponse.weighting = ['flat', 'a', 'c', '468'].includes(values.weighting) ? values.weighting : 'flat';
    }
    frequencyResponse.preset = activePreset;
    bandCache.clear();
    spectrumLevels.length = 0;
    spectrumPeaks.length = 0;
    mirrorLevels.length = 0;
    ribbonSpectrumLevels.length = 0;
    ribbonFastLevels.length = 0;
    ribbonPreviousRaw.length = 0;
    ribbonTransientLevels.length = 0;
    syncResponseControls(activePreset);
    if (persist) {
      try { localStorage.setItem('xins-fusion-frequency-response', JSON.stringify(frequencyResponse)); } catch (_) {}
    }
    window.dispatchEvent(new CustomEvent('smoke-resonance:responsechange', { detail: { ...frequencyResponse } }));
    return { ...frequencyResponse };
  }

  function applyResponsePreset(name) {
    const preset = responsePresets[name];
    if (!preset) return null;
    const result = applyFrequencyResponse(preset, name);
    showToast(`视觉频响 · ${preset.label}（原始测量未改动）`);
    return result;
  }

  function setCalibrationPanel(open) {
    calibrationPanel.classList.toggle('is-open', open);
    calibrationPanel.setAttribute('aria-hidden', String(!open));
    calibrationButton.setAttribute('aria-expanded', String(open));
  }

  function setMappingLabPanel(open) {
    mappingLab?.setOpen(Boolean(open));
  }

  function setPanelPosition(panel, left, top) {
    const width = Math.max(1, panel.offsetWidth);
    const height = Math.max(1, panel.offsetHeight);
    const maxLeft = Math.max(8, window.innerWidth - width - 8);
    const maxTop = Math.max(
      8,
      window.innerHeight - Math.min(height, window.innerHeight - 16) - 8
    );
    panel.style.left = `${Math.round(Math.min(Math.max(8, left), maxLeft))}px`;
    panel.style.top = `${Math.round(Math.min(Math.max(8, top), maxTop))}px`;
    panel.style.right = 'auto';
  }

  function ensurePanelInViewport(panel) {
    if (!panel?.style.left && !panel?.style.top) return;
    const rect = panel.getBoundingClientRect();
    const left = Number.isFinite(parseFloat(panel.style.left))
      ? parseFloat(panel.style.left)
      : rect.left;
    const top = Number.isFinite(parseFloat(panel.style.top))
      ? parseFloat(panel.style.top)
      : rect.top;
    setPanelPosition(panel, left, top);
  }

  // Floating panels are freely draggable by their header so several can stay open
  // at once and be arranged anywhere without overlapping. Positions persist.
  function enablePanelDragging() {
    document.querySelectorAll('.calibration-head').forEach(head => {
      const panel = head.closest('aside');
      if (!panel || panel.dataset.dragReady) return;
      panel.dataset.dragReady = '1';
      const key = `xml:panelPos:${panel.id || panel.className.split(' ')[0]}`;
      try {
        const saved = JSON.parse(localStorage.getItem(key));
        if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
          setPanelPosition(panel, saved.left, saved.top);
        }
      } catch (_) {}
      head.style.cursor = 'move';
      head.style.touchAction = 'none';
      head.addEventListener('pointerdown', event => {
        if (event.target.closest('button, input, select, a, textarea')) return;
        event.preventDefault();
        const rect = panel.getBoundingClientRect();
        const offsetX = event.clientX - rect.left;
        const offsetY = event.clientY - rect.top;
        head.setPointerCapture(event.pointerId);
        const move = ev => {
          setPanelPosition(panel, ev.clientX - offsetX, ev.clientY - offsetY);
        };
        const up = () => {
          head.removeEventListener('pointermove', move);
          head.removeEventListener('pointerup', up);
          try { head.releasePointerCapture(event.pointerId); } catch (_) {}
          try { localStorage.setItem(key, JSON.stringify({ left: parseFloat(panel.style.left) || 0, top: parseFloat(panel.style.top) || 0 })); } catch (_) {}
        };
        head.addEventListener('pointermove', move);
        head.addEventListener('pointerup', up);
      });
    });
  }
  enablePanelDragging();

  window.SmokeResonanceAudioSource = Object.freeze({
    get: () => ({ kind: audioState.sourceKind, playing: audioState.playing, started: audioState.started }),
    attachMediaElement: element => attachInternalMedia(element),
    detachMediaElement: () => detachInternalMedia(),
    setMediaPlaying: value => setInternalPlaying(value),
    startExternal: () => startCapture(),
    stopExternal: () => {
      if (audioState.sourceKind === 'external') stopCapture(false);
      return { kind: audioState.sourceKind, playing: audioState.playing };
    }
  });

  window.SmokeResonanceCalibration = Object.freeze({
    get: () => ({ ...calibration }),
    set: values => applyCalibration(values),
    applyPreset: applyCalibrationPreset,
    presets: () => Object.fromEntries(Object.entries(calibrationPresets).map(([key, value]) => [key, { ...value }]))
  });
  window.SmokeResonanceResponse = Object.freeze({
    get: () => ({ ...frequencyResponse }),
    set: values => applyFrequencyResponse(values),
    applyPreset: applyResponsePreset,
    presets: () => Object.fromEntries(Object.entries(responsePresets).map(([key, value]) => [key, { ...value }]))
  });
  window.SmokeResonanceColor = Object.freeze({
    get: () => ({ palette: activePaletteName, effects: { ...colorFx } }),
    palette: name => applyPalette(name),
    effects: values => applyColorFx(values)
  });
  window.SmokeResonanceConductor = Object.freeze({
    get: () => ({ ...conductorConfig }),
    set: values => applyConductorConfig(values),
    position: setConductorPosition,
    poses: () => (window.SmokeResonanceConductorPoses || []).map(pose => ({ ...pose }))
  });
  window.SmokeResonanceGlitch = Object.freeze({
    get: () => ({ ...glitchConfig }),
    set: values => applyGlitchConfig(values),
    state: () => ({
      ...glitchEngine?.get(),
      fragments: glitchState.fragments.length,
      renderer: stage.dataset.glitchRenderer || 'bypass',
      webgl: glitchWebglRenderer?.get() || null,
      features: glitchFeatureBus?.get() || null
    })
  });
  window.SmokeResonanceRealtimeFrame = Object.freeze({
    get: () => realtimeProviderAdapter?.get() || null
  });
  window.SmokeResonanceFrameClock = Object.freeze({
    get: () => ({ ...engineClockFrame }),
    subscribe: (callback, options = {}) => {
      if (typeof callback !== 'function') return () => {};
      const subscribers = options?.phase === 'pre-material'
        ? engineFrameSubscribers.preMaterial
        : engineFrameSubscribers.postMaterial;
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    }
  });
  window.SmokeResonanceTimeline = Object.freeze({
    get: () => ({ ...fusionTimelineState }),
    set: values => {
      if (!values || typeof values !== 'object') return { ...fusionTimelineState };
      if (values.connected !== undefined) fusionTimelineState.connected = Boolean(values.connected);
      if (values.section !== undefined) fusionTimelineState.section = Math.max(0, Math.min(1, Number(values.section) || 0));
      if (values.climax !== undefined) fusionTimelineState.climax = Math.max(0, Math.min(1, Number(values.climax) || 0));
      if (values.drop !== undefined) fusionTimelineState.drop = Math.max(0, Math.min(1, Number(values.drop) || 0));
      if (values.build !== undefined) fusionTimelineState.build = Math.max(0, Math.min(1, Number(values.build) || 0));
      if (values.sectionLabel !== undefined) fusionTimelineState.sectionLabel = String(values.sectionLabel || '—').slice(0, 48);
      if (values.chord !== undefined) fusionTimelineState.chord = String(values.chord || '—').slice(0, 24);
      if (values.chordConfidence !== undefined) fusionTimelineState.chordConfidence = Math.max(0, Math.min(1, Number(values.chordConfidence) || 0));
      return { ...fusionTimelineState };
    },
    pulse: strength => {
      fusionTimelineState.boundaryPulse = Math.max(
        fusionTimelineState.boundaryPulse,
        Math.max(0, Math.min(1, Number(strength) || 0))
      );
      fusionTimelineState.boundarySerial++;
      return { ...fusionTimelineState };
    },
    chordPulse: strength => {
      fusionTimelineState.chordPulse = Math.max(
        fusionTimelineState.chordPulse,
        Math.max(0, Math.min(1, Number(strength) || 0))
      );
      return { ...fusionTimelineState };
    },
    reset: () => {
      Object.assign(fusionTimelineState, {
        connected: false,
        section: 0,
        climax: 0,
        drop: 0,
        build: 0,
        boundaryPulse: 0,
        boundarySerial: 0,
        sectionLabel: '—',
        chord: '—',
        chordConfidence: 0,
        chordPulse: 0
      });
      return { ...fusionTimelineState };
    }
  });
  window.SmokeResonancePulsar = Object.freeze({
    get: () => ({ layout: pulsarState.layout, mode: pulsarState.mode, stereoAvailable: pulsarState.stereoAvailable }),
    layout: value => setPulsarLayout(value),
    mode: value => setPulsarMode(value)
  });
  window.SmokeResonanceFeatures = Object.freeze({
    get: () => ({ ...audioState.features, energy: { ...audioState.energy }, accents: { ...audioState.accents } })
  });
  window.SmokeResonanceDirector = Object.freeze({
    get: () => ({ enabled: directorState.enabled, beatCount: directorState.beatCount, history: [...directorState.history] }),
    set: enabled => setDirectorEnabled(enabled)
  });
  window.SmokeResonanceMapping = Object.freeze({
    get: () => mappingEngine?.get() || null,
    config: values => values ? mappingEngine?.setConfig(values) : mappingEngine?.getConfig(),
    reset: () => mappingEngine?.reset(performance.now())
  });
  window.SmokeResonanceSections = Object.freeze({
    get: () => sectionEngineSuite?.get() || null,
    input: () => sectionFeatureExtractor?.get() || null,
    config: values => values ? sectionEngineSuite?.setConfig(values) : sectionEngineSuite?.getConfig(),
    harmony: () => {
      const frame = sectionFeatureExtractor?.get();
      return frame ? {
        chord: frame.chord, confidence: frame.chordConfidence, change: frame.chordChange,
        tension: frame.harmonicTension, chroma: [...(frame.chroma || [])]
      } : null;
    },
    enable: (name, enabled) => sectionEngineSuite?.setEnabled(name, enabled),
    reset: () => {
      sectionFeatureExtractor?.reset();
      if (mappingEngine) mappingOutput = mappingEngine.reset(performance.now());
      if (sectionEngineSuite) sectionOutput = sectionEngineSuite.reset(performance.now());
      return sectionOutput;
    },
    references: () => window.SmokeResonanceSectionEngines?.references() || {}
  });

  function qualityLabel(mode) {
    return mode === 'high' ? '画质 High' : mode === 'eco' ? '画质 Eco' : '画质 Auto';
  }

  function currentQualityLevel() {
    if (qualityState.mode === 'high') return qualityBudgets.length - 1;
    if (qualityState.mode === 'eco') return 0;
    return Math.max(0, Math.min(qualityBudgets.length - 1, qualityState.complexityLevel));
  }

  function currentQualityBudget() {
    return qualityBudgets[currentQualityLevel()];
  }

  function resetPerformanceWindow(now = performance.now()) {
    qualityState.sampleStartedAt = now;
    qualityState.sampleFrames = 0;
    qualityState.longFrames = 0;
    qualityState.lastFrameAt = now;
  }

  function setQualityMode(mode, persist = true, notify = true) {
    qualityState.mode = ['auto', 'high', 'eco'].includes(mode) ? mode : 'auto';
    if (qualityState.mode === 'auto') {
      qualityState.adaptiveDpr = Math.min(window.devicePixelRatio || 1, 1.35);
      qualityState.complexityLevel = 2;
    }
    qualityState.stableSamples = 0;
    qualityState.lastAdjustmentAt = performance.now();
    resetPerformanceWindow();
    bindUiText(
      qualityButton,
      `runtime.quality.${qualityState.mode}`,
      qualityLabel(qualityState.mode)
    );
    qualityButton.dataset.mode = qualityState.mode;
    if (persist) {
      try { localStorage.setItem('xins-fusion-quality', qualityState.mode); } catch (_) {}
    }
    resize();
    if (notify) showToast(qualityState.mode === 'high'
      ? uiText('runtime.quality.highToast', '高画质：提高像素密度')
      : qualityState.mode === 'eco'
        ? uiText('runtime.quality.ecoToast', '省电画质：降低显卡负载')
        : uiText('runtime.quality.autoToast', '自动画质：根据帧率动态调整'));
  }

  function cycleQualityMode() {
    const order = ['auto', 'high', 'eco'];
    setQualityMode(order[(order.indexOf(qualityState.mode) + 1) % order.length]);
  }

  function updatePerformance(now) {
    const frameTime = qualityState.lastFrameAt ? now - qualityState.lastFrameAt : 16.7;
    qualityState.lastFrameAt = now;
    if (frameTime > 0 && frameTime < 250) {
      qualityState.frameTimeEma += (frameTime - qualityState.frameTimeEma) * .08;
      if (frameTime > 25) qualityState.longFrames++;
    }
    qualityState.sampleFrames++;
    const elapsed = now - qualityState.sampleStartedAt;
    if (elapsed < 1800) return;
    qualityState.fps = qualityState.sampleFrames * 1000 / Math.max(1, elapsed);
    qualityState.longFrameRatio = qualityState.longFrames / Math.max(1, qualityState.sampleFrames);
    qualityState.sampleFrames = 0;
    qualityState.longFrames = 0;
    qualityState.sampleStartedAt = now;
    if (qualityState.mode !== 'auto') return;
    if (now - qualityState.lastAdjustmentAt < 2400) return;
    const overloaded = qualityState.fps < 52
      || qualityState.frameTimeEma > 19.2
      || qualityState.longFrameRatio > .12;
    const healthy = qualityState.fps > 58
      && qualityState.frameTimeEma < 17.6
      && qualityState.longFrameRatio < .035;
    let resizeNeeded = false;
    if (overloaded) {
      qualityState.stableSamples = 0;
      if (qualityState.complexityLevel > 0) {
        qualityState.complexityLevel--;
        resizeNeeded = true;
      } else {
        const nextDpr = Math.max(.72, qualityState.adaptiveDpr - .12);
        resizeNeeded = Math.abs(nextDpr - qualityState.adaptiveDpr) > .04;
        qualityState.adaptiveDpr = nextDpr;
      }
      qualityState.lastAdjustmentAt = now;
    } else if (healthy) {
      qualityState.stableSamples++;
      if (qualityState.stableSamples >= 3) {
        const targetDpr = Math.min(window.devicePixelRatio || 1, 1.45);
        if (qualityState.adaptiveDpr < targetDpr - .04) {
          qualityState.adaptiveDpr = Math.min(targetDpr, qualityState.adaptiveDpr + .08);
          resizeNeeded = true;
        } else if (qualityState.complexityLevel < qualityBudgets.length - 1) {
          qualityState.complexityLevel++;
          resizeNeeded = true;
        }
        qualityState.stableSamples = 0;
        qualityState.lastAdjustmentAt = now;
      }
    } else {
      qualityState.stableSamples = 0;
    }
    if (resizeNeeded) resize();
  }

  function chooseDirectorScene(energy) {
    const features = audioState.features;
    const sectionScale = mappingOutput?.orchestration || features.orchestrationDensity || 0;
    const targetEnergy = Math.min(1, energy.overall * .78 + sectionScale * .46 + features.onset * .12);
    const targetTexture = Math.min(1, features.density * .42 + features.flatness * .28 + features.acid * .3);
    const recent = new Set(directorState.history.slice(-3));
    let best = null;
    let bestScore = -Infinity;
    for (const scene of directorScenes) {
      if (scene.id === activeEffect || recent.has(scene.id)) continue;
      let score = 2.4
        - Math.abs(scene.energy - targetEnergy) * 2.15
        - Math.abs(scene.centroid - features.centroid) * 1.15
        - Math.abs(scene.texture - targetTexture) * .9;
      if (scene.glitch) {
        score += features.onset * .65 + features.dynamicRange * .45 - .42;
        if (targetEnergy < .34) score -= 1.2;
      }
      if (scene.id.startsWith('beta-') && qualityState.fps < 42) score -= .9;
      score += Math.random() * .34;
      if (score > bestScore) {
        bestScore = score;
        best = scene.id;
      }
    }
    return best || 'beta-1';
  }

  function updateDirector(energy, now) {
    if (!directorState.enabled || !audioState.playing) return;
    const onset = audioState.features.onset;
    const freshBeat = onset > .13 && now - directorState.lastBeatAt > 190 && onset > directorState.previousOnset * 1.04;
    if (freshBeat) {
      directorState.lastBeatAt = now;
      directorState.beatCount++;
    }
    directorState.previousOnset = onset;
    const dwell = now - directorState.lastSwitchAt;
    const currentSection = mappingOutput?.section || 'SPARSE';
    if (currentSection !== directorState.lastSection) {
      directorState.lastSection = currentSection;
      directorState.sectionChangedAt = now;
    }
    const structuralShift = now - directorState.sectionChangedAt < 1200
      && ['LAYERING', 'FULL', 'CLIMAX', 'DROP', 'AFTERGLOW'].includes(currentSection);
    const sectionShift = structuralShift || Math.abs(energy.overall - directorState.energyAnchor) > .19 && directorState.beatCount >= 4;
    const phraseBoundary = directorState.beatCount >= 12;
    const ambientBoundary = dwell > 19000;
    if (dwell > (structuralShift ? 3200 : 6200) && (phraseBoundary || sectionShift || ambientBoundary)) {
      const next = chooseDirectorScene(energy);
      directorState.beatCount = 0;
      directorState.lastSwitchAt = now;
      directorState.energyAnchor = energy.overall;
      directorState.history.push(next);
      if (directorState.history.length > 8) directorState.history.shift();
      setEffect(next, 'director');
      showToast(`演出导演 · ${effectNames[next] || (next.startsWith('beta-glitch-') ? 'Glitch 场景' : 'MilkDrop 场景')}`);
    }
  }

  function setDirectorEnabled(enabled, persist = true) {
    directorState.enabled = Boolean(enabled);
    directorState.beatCount = 0;
    directorState.previousOnset = 0;
    directorState.lastBeatAt = 0;
    directorState.lastSwitchAt = performance.now() - 4200;
    directorState.energyAnchor = audioState.energy.overall;
    directorState.lastSection = mappingOutput?.section || 'SPARSE';
    directorState.sectionChangedAt = 0;
    directorToggle.setAttribute('aria-pressed', String(directorState.enabled));
    bindUiText(
      directorToggle,
      directorState.enabled ? 'runtime.director.on' : 'runtime.director.off',
      directorState.enabled ? '导演中' : '导演'
    );
    if (persist) {
      try { localStorage.setItem('xins-fusion-director', String(directorState.enabled)); } catch (_) {}
      showToast(directorState.enabled
        ? uiText('runtime.director.enabled', '演出导演已接管：按编制加层、全奏、高潮与抽空换场')
        : uiText('runtime.director.disabled', '演出导演已关闭'));
    }
  }

  async function captureSnapshot() {
    const scale = Math.max(1, Math.min(2, dpr));
    const shot = document.createElement('canvas');
    shot.width = Math.round(w * scale);
    shot.height = Math.round(h * scale);
    const shotCtx = shot.getContext('2d');
    shotCtx.setTransform(scale, 0, 0, scale, 0, 0);
    const background = shotCtx.createRadialGradient(w * .48, h * .46, 0, w * .48, h * .46, Math.max(w, h) * .8);
    background.addColorStop(0, `rgb(${currentPalette.dark.map(value => Math.min(255, value + 8)).join(',')})`);
    background.addColorStop(1, '#03040a');
    shotCtx.fillStyle = background;
    shotCtx.fillRect(0, 0, w, h);
    try {
      const generatorSnapshot =
        window.SmokeResonanceGeneratorOutput?.snapshotCanvas?.() || null;
      if (
        stage.classList.contains('generator-renderer-on') &&
        generatorSnapshot === generatorCanvas
      ) {
        shotCtx.drawImage(generatorCanvas, 0, 0, w, h);
      } else if (stage.classList.contains('webgl-postfx-on') && glitchWebglRenderer?.present()) {
        shotCtx.drawImage(glitchWebglCanvas, 0, 0, w, h);
      } else {
        const snapshotSource = activeEffect.startsWith('beta-') ? betaCanvas : canvas;
        shotCtx.filter = snapshotSource.style.filter || 'none';
        shotCtx.drawImage(snapshotSource, 0, 0, w, h);
        shotCtx.filter = 'none';
        shotCtx.drawImage(glitchCanvas, 0, 0, w, h);
      }
      if (conductorState.enabled) shotCtx.drawImage(conductorCanvas, 0, 0, w, h);
    } catch (_) {}
    shotCtx.fillStyle = 'rgba(255,255,255,.38)';
    shotCtx.font = '10px sans-serif';
    shotCtx.textAlign = 'right';
    shotCtx.fillText('Designed by Xin', w - 18, h - 16);
    const dataUrl = shot.toDataURL('image/png');
    if (window.SmokeResonanceDesktop?.saveSnapshot) {
      const result = await window.SmokeResonanceDesktop.saveSnapshot(dataUrl);
      showToast(result?.saved
        ? uiText('runtime.snapshot.saved', '快照已保存')
        : uiText('runtime.snapshot.cancelled', '已取消保存'));
    } else {
      const link = document.createElement('a');
      link.download = `Xins-Music-Lab-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
      link.href = dataUrl;
      link.click();
      showToast(uiText('runtime.snapshot.downloaded', '快照已下载'));
    }
  }

  async function toggleAlwaysOnTop() {
    if (!window.SmokeResonanceDesktop?.toggleAlwaysOnTop) return;
    const pinned = await window.SmokeResonanceDesktop.toggleAlwaysOnTop();
    pinButton.setAttribute('aria-pressed', String(pinned));
    bindUiText(pinButton, pinned ? 'runtime.pin.on' : 'runtime.pin.off', pinned ? '已置顶' : '置顶');
    showToast(pinned
      ? uiText('runtime.pin.enabled', '窗口已保持在最前')
      : uiText('runtime.pin.disabled', '窗口置顶已关闭'));
  }

  async function controlSystemMedia(action) {
    if (!window.SmokeResonanceDesktop?.mediaControl) {
      showToast(uiText('runtime.media.desktopOnly', '系统媒体控制仅在桌面版可用'));
      return;
    }
    const result = await window.SmokeResonanceDesktop.mediaControl(action);
    const labels = { previous: '上一曲', 'play-pause': '播放 / 暂停', next: '下一曲' };
    const actionLabel = labels[action];
    showToast(result?.ok
      ? uiText('runtime.media.result', `系统媒体 · ${actionLabel}`, { action: actionLabel })
      : uiText('runtime.media.failed', '系统媒体控制失败'));
  }

  function resize() {
    const nativeDpr = window.devicePixelRatio || 1;
    const nextDpr = qualityState.mode === 'high'
      ? Math.min(nativeDpr, 2)
      : qualityState.mode === 'eco'
        ? Math.min(nativeDpr, .85)
        : Math.min(nativeDpr, qualityState.adaptiveDpr);
    const nextWidth = Math.max(1, innerWidth);
    const nextHeight = Math.max(1, innerHeight);
    const webglScale = currentQualityBudget().webglScale;
    if (w === nextWidth && h === nextHeight && Math.abs(dpr - nextDpr) < .001) {
      glitchWebglRenderer?.resize(w, h, dpr, webglScale);
      syncGlitchRendererState();
      return;
    }
    dpr = nextDpr;
    w = nextWidth;
    h = nextHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    glitchCanvas.width = Math.round(w * dpr);
    glitchCanvas.height = Math.round(h * dpr);
    glitchCanvas.style.width = `${w}px`;
    glitchCanvas.style.height = `${h}px`;
    glitchCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    conductorCanvas.width = Math.round(w * dpr);
    conductorCanvas.height = Math.round(h * dpr);
    conductorCanvas.style.width = `${w}px`;
    conductorCanvas.style.height = `${h}px`;
    conductorCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const waterfallCopy = waterfallCanvas.width && waterfallCanvas.height ? document.createElement('canvas') : null;
    if (waterfallCopy) {
      waterfallCopy.width = waterfallCanvas.width;
      waterfallCopy.height = waterfallCanvas.height;
      waterfallCopy.getContext('2d').drawImage(waterfallCanvas, 0, 0);
    }
    waterfallCanvas.width = w < 760 ? 320 : 520;
    waterfallCanvas.height = w < 760 ? 180 : 260;
    waterfallCtx.fillStyle = '#03040a';
    waterfallCtx.fillRect(0, 0, waterfallCanvas.width, waterfallCanvas.height);
    if (waterfallCopy && waterfallState.primed) {
      waterfallCtx.drawImage(waterfallCopy, 0, 0, waterfallCopy.width, waterfallCopy.height, 0, 0, waterfallCanvas.width, waterfallCanvas.height);
    }
    originalGlitchRenderer?.resize(w, h);
    glitchWebglRenderer?.resize(w, h, dpr, webglScale);
    syncGlitchRendererState();
    try { betaState.visualizer?.setRendererSize(Math.round(w * dpr), Math.round(h * dpr)); } catch (_) {}
    resizeGlitchCurve();
    materialRuntime?.reset('resize');
  }

  function scheduleResize() {
    if (resizeRequest) return;
    resizeRequest = requestAnimationFrame(() => {
      resizeRequest = 0;
      resize();
    });
  }

  async function enterImmersive() {
    stage.classList.add('ui-hidden', 'is-immersive');
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    } catch (_) { showToast('界面已隐藏；浏览器没有允许全屏'); }
  }

  async function exitImmersive() {
    stage.classList.remove('ui-hidden', 'is-immersive');
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch (_) {}
  }

  function animate() {
    const now = performance.now();
    if (document.hidden) {
      resetPerformanceWindow(now);
      requestAnimationFrame(animate);
      return;
    }
    frame++;
    const energy = getEnergy();
    updateRealtimeProviderFrame(energy, now);
    const materialClock = Object.freeze({
      frameIndex: frame,
      nowMs: now,
      deltaMs: realtimeProviderFrame?.clock?.deltaMs || 0
    });
    const sectionFrame = updateRawSectionFrame(now);
    if (sectionFrame && mappingEngine) {
      mappingOutput = mappingEngine.update({ ...sectionFrame, playing: audioState.playing }, now);
      sectionOutput = sectionEngineSuite?.update(sectionFrame, now, mappingOutput) || null;
      mappingLab?.update(mappingOutput, sectionOutput, now);
    }
    updateLiveHarmony(now);
    updateColorEffects(now);
    updateDirector(energy, now);
    const runtime = ensureMaterialRuntime();
    if (runtime?.status()?.activeMaterialId !== activeEffect) {
      runtime.activate(activeEffect, 'material-change');
    }
    const materialSpectrum = new Float32Array(96);
    for (let index = 0; index < materialSpectrum.length; index++) {
      materialSpectrum[index] = spectrumValue(index, materialSpectrum.length);
    }
    const materialMusicFrame = Object.freeze({
      contract: 'xin.material-music-frame/1',
      frameIndex: frame,
      now,
      playing: audioState.playing,
      energy,
      spectrum: materialSpectrum,
      palette: Object.freeze({
        main: Object.freeze([...currentPalette.main]),
        hot: Object.freeze([...currentPalette.hot]),
        dark: Object.freeze([...currentPalette.dark])
      }),
      section: sectionFrame,
      mapping: mappingOutput
    });
    engineClockFrame = materialClock;
    for (const subscriber of [...engineFrameSubscribers.preMaterial]) {
      try {
        subscriber({ ...engineClockFrame });
      } catch (error) {
        console.error('Pre-material frame subscriber failed', error);
      }
    }
    const materialFrame = {
      musicFrame: materialMusicFrame,
      clock: materialClock,
      mappingSnapshot: Object.freeze({
        contract: 'xin.material-mapping-snapshot/1',
        frameIndex: frame,
        source: 'generator-shared-mapping',
        values: currentMaterialTargetValues(),
        legacy: mappingOutput
      }),
      target: Object.freeze({
        width: w,
        height: h,
        pixelRatio: dpr
      })
    };
    try {
      if (!materialFrameOrchestrator) {
        throw new Error('MATERIAL_FRAME_ORCHESTRATOR_UNAVAILABLE');
      }
      materialFrameOrchestrator.run(materialFrame);
      materialRuntimeFailureNotified = false;
    } catch (error) {
      if (!materialRuntimeFailureNotified) {
        materialRuntimeFailureNotified = true;
        console.error('Material runtime failed; using direct legacy fallback', error);
      }
      renderLegacyMaterialFrame(activeEffect, materialFrame);
    }
    updateRhythmState(now);
    updateGlitchCurve(now);
    if (glitchConfig.enabled) drawUniversalGlitchPostFx(energy, now);
    else if (activeEffect.startsWith('beta-')) drawBetaRhythmPostFx(energy);
    else clearGlitchPostFx();
    if (conductorState.enabled) drawConductorOverlay(energy);

    if (now - qualityState.lastUiAt >= 100) {
      qualityState.lastUiAt = now;
      const level = energy.overall;
      const sectionLabels = {
        SPARSE: uiText('runtime.energy.sparse', '稀疏编制'),
        LAYERING: uiText('runtime.energy.layering', '正在加层'),
        FULL: uiText('runtime.energy.full', '全奏段落'),
        CLIMAX: uiText('runtime.energy.climax', '编制高潮'),
        DROP: uiText('runtime.energy.drop', '突然抽空'),
        AFTERGLOW: uiText('runtime.energy.afterglow', '余波')
      };
      const energyText = audioState.playing && mappingOutput
        ? uiText(
          'runtime.energy.parts',
          `${sectionLabels[mappingOutput.section] || mappingOutput.section} · ${mappingOutput.effectiveParts.toFixed(1)} 声部`,
          { section: sectionLabels[mappingOutput.section] || mappingOutput.section, parts: mappingOutput.effectiveParts.toFixed(1) }
        )
        : level > .38
          ? uiText('runtime.energy.surging', '汹涌')
          : level > .22
            ? uiText('runtime.energy.flowing', '流动')
            : level > .1
              ? uiText('runtime.energy.rippling', '轻漾')
              : audioState.playing
                ? uiText('runtime.energy.waitingMusic', '等待音乐')
                : uiText('runtime.energy.paused', '暂停监听');
      energyLabel.textContent = energyText;
      timelineFill.style.width = audioState.started ? `${Math.min(100, 6 + level * 175)}%` : '0%';
    }
    updatePerformance(now);
    for (const subscriber of [...engineFrameSubscribers.postMaterial]) {
      try {
        subscriber({ ...engineClockFrame });
      } catch (error) {
        console.error('Post-material frame subscriber failed', error);
      }
    }
    requestAnimationFrame(animate);
  }

  enterButton.addEventListener('click', startCapture);
  playButton.addEventListener('click', toggleListening);
  mediaPrevious?.addEventListener('click', () => controlSystemMedia('previous'));
  mediaPlayPause?.addEventListener('click', () => controlSystemMedia('play-pause'));
  mediaNext?.addEventListener('click', () => controlSystemMedia('next'));
  captureButton.addEventListener('click', startCapture);
  intensityInput.addEventListener('input', event => { intensity = Number(event.target.value); });
  calibrationButton.addEventListener('click', () => setCalibrationPanel(!calibrationPanel.classList.contains('is-open')));
  calibrationClose.addEventListener('click', () => setCalibrationPanel(false));
  calibrationReset.addEventListener('click', () => applyCalibrationPreset('open-flat'));
  paletteButton.addEventListener('click', () => setPalettePanel(!palettePanel.classList.contains('is-open')));
  paletteClose.addEventListener('click', () => setPalettePanel(false));
  glitchPowerButton.addEventListener('click', () => setGlitchRackEnabled(!glitchConfig.enabled));
  glitchSettingsButton.addEventListener('click', () => setGlitchPanel(!glitchPanel.classList.contains('is-open')));
  glitchClose.addEventListener('click', () => setGlitchPanel(false));
  glitchReset.addEventListener('click', () => {
    applyGlitchConfig(glitchDefaults, true, 'balanced');
    showToast(uiText('runtime.glitch.reset', '通用 Glitch 效果器已恢复默认并旁路'));
  });
  glitchPanel.addEventListener('input', event => {
    const input = event.target.closest('[data-glitch-key]');
    if (input) {
      applyGlitchConfig({ [input.dataset.glitchKey]: Number(input.value) });
    }
  });
  glitchPanel.addEventListener('click', event => {
    const presetButton = event.target.closest('[data-glitch-preset]');
    if (presetButton) {
      applyGlitchPreset(presetButton.dataset.glitchPreset);
      return;
    }
    const deleteButton = event.target.closest('[data-glitch-user-delete]');
    if (deleteButton) {
      const deleted = glitchUserPresets.find(item => item.id === deleteButton.dataset.glitchUserDelete);
      glitchUserPresets = glitchUserPresets.filter(item => item.id !== deleteButton.dataset.glitchUserDelete);
      persistGlitchUserPresets();
      renderGlitchUserPresets();
      if (deleted) showToast(uiText('runtime.glitch.deleted', `已删除个人预设 · ${deleted.name}`, { name: deleted.name }));
      return;
    }
    const userButton = event.target.closest('[data-glitch-user-preset]');
    if (userButton) {
      const preset = glitchUserPresets.find(item => item.id === userButton.dataset.glitchUserPreset);
      if (!preset) return;
      glitchPresetName.value = preset.name;
      applyGlitchConfig({ ...preset, enabled: true }, true, 'custom');
      showToast(uiText('runtime.glitch.loaded', `已载入个人预设 · ${preset.name}`, { name: preset.name }));
    }
  });
  glitchPresetSave.addEventListener('click', saveGlitchUserPreset);
  glitchPresetName.addEventListener('keydown', event => {
    if (event.key === 'Enter') saveGlitchUserPreset();
  });
  glitchRackToggle.addEventListener('click', () => setGlitchRackEnabled(!glitchConfig.enabled));
  directorToggle.addEventListener('click', () => setDirectorEnabled(!directorState.enabled));
  mappingLabButton.addEventListener('click', () => setMappingLabPanel(!mappingLab?.isOpen()));
  qualityButton.addEventListener('click', cycleQualityMode);
  // UI font scale — chrome only (canvas is sized in JS and untouched). A-/A+.
  const UI_SCALES = [1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 2.0];
  const uiScaleLabel = $('#uiScaleLabel');
  let uiScale = 1.4;
  const applyUiScale = value => {
    uiScale = UI_SCALES.reduce((best, v) => Math.abs(v - value) < Math.abs(best - value) ? v : best, 1.4);
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
    if (uiScaleLabel) uiScaleLabel.textContent = `${Math.round(uiScale * 100)}%`;
    try { localStorage.setItem('xml:uiScale', String(uiScale)); } catch (_) {}
  };
  applyUiScale(Number(localStorage.getItem('xml:uiScale')) || 1.4);
  $('#uiScaleDown')?.addEventListener('click', () => applyUiScale(UI_SCALES[Math.max(0, UI_SCALES.indexOf(uiScale) - 1)]));
  $('#uiScaleUp')?.addEventListener('click', () => applyUiScale(UI_SCALES[Math.min(UI_SCALES.length - 1, UI_SCALES.indexOf(uiScale) + 1)]));
  pulsarLayoutButton.addEventListener('click', () => {
    const layouts = ['folded', 'sweep', 'stereo'];
    setPulsarLayout(layouts[(layouts.indexOf(pulsarState.layout) + 1) % layouts.length]);
  });
  pulsarStyleButton.addEventListener('click', () => setPulsarMode(pulsarState.mode === 'mono' ? 'neon' : 'mono'));
  snapshotButton.addEventListener('click', captureSnapshot);
  pinButton.addEventListener('click', toggleAlwaysOnTop);
  conductorToggle.addEventListener('click', () => setConductorEnabled(!conductorState.enabled));
  conductorSettingsButton.addEventListener('click', () => {
    if (!conductorState.enabled) setConductorEnabled(true);
    setConductorPanel(!conductorPanel.classList.contains('is-open'));
  });
  conductorClose.addEventListener('click', () => setConductorPanel(false));
  conductorReset.addEventListener('click', () => {
    applyConductorConfig(conductorDefaults, true, 'center');
    showToast(uiText('runtime.conductor.reset', '指挥动作已恢复默认'));
  });
  conductorPanel.addEventListener('input', event => {
    const input = event.target.closest('[data-conductor-key]');
    if (!input) return;
    const value = input.tagName === 'SELECT' ? input.value : Number(input.value);
    applyConductorConfig({ [input.dataset.conductorKey]: value });
  });
  conductorPanel.addEventListener('click', event => {
    const button = event.target.closest('[data-conductor-position]');
    if (button) setConductorPosition(button.dataset.conductorPosition);
  });
  palettePanel.addEventListener('input', event => {
    const fxInput = event.target.closest('[data-color-fx-key]');
    if (fxInput) {
      applyColorFx({ [fxInput.dataset.colorFxKey]: Number(fxInput.value) });
      return;
    }
    const input = event.target.closest('[data-custom-color]');
    if (!input) return;
    customColors[input.dataset.customColor] = input.value;
    applyPalette('custom');
  });
  palettePanel.addEventListener('click', event => {
    const button = event.target.closest('[data-palette-preset]');
    if (!button) return;
    const source = palettes[button.dataset.palettePreset];
    if (!source) return;
    customColors.main = rgbToHex(source.main);
    customColors.hot = rgbToHex(source.hot);
    customColors.dark = rgbToHex(source.dark);
    applyPalette('custom');
    showToast(`已载入 ${button.textContent.trim()} 底稿`);
  });
  calibrationPanel.addEventListener('input', event => {
    const responseInput = event.target.closest('[data-response-key]');
    if (responseInput) {
      applyFrequencyResponse({ [responseInput.dataset.responseKey]: Number(responseInput.value) });
      return;
    }
    const input = event.target.closest('[data-calibration-key]');
    if (!input) return;
    const key = input.dataset.calibrationKey;
    const value = input.type === 'checkbox' ? input.checked : input.tagName === 'SELECT' ? input.value : Number(input.value);
    applyCalibration({ [key]: value });
  });
  calibrationPanel.addEventListener('click', event => {
    const responseButton = event.target.closest('[data-response-preset]');
    if (responseButton) {
      applyResponsePreset(responseButton.dataset.responsePreset);
      return;
    }
    const button = event.target.closest('[data-calibration-preset]');
    if (button) applyCalibrationPreset(button.dataset.calibrationPreset);
  });
  $('.swatches').addEventListener('click', event => {
    const button = event.target.closest('.swatch');
    if (!button) return;
    applyPalette(button.dataset.palette);
    if (button.dataset.palette === 'custom') setPalettePanel(true);
  });
  $('.visual-catalog').addEventListener('click', event => {
    const button = event.target.closest('.scene-button');
    if (button) {
      setEffect(button.dataset.effect);
      const archive = button.closest('.catalog-archive');
      if (archive) archive.open = false;
    }
  });
  immersiveButton.addEventListener('click', enterImmersive);
  immersiveExit.addEventListener('click', exitImmersive);
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && stage.classList.contains('is-immersive')) {
      stage.classList.remove('ui-hidden', 'is-immersive');
    }
  });
  window.addEventListener('resize', scheduleResize);
  document.addEventListener('visibilitychange', () => resetPerformanceWindow(performance.now()));
  window.addEventListener('keydown', event => {
    const editing = ['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName);
    if (event.code === 'Space' && !editing) {
      event.preventDefault();
      toggleListening();
    }
    if (!editing && event.key.toLowerCase() === 'h') {
      if (stage.classList.contains('ui-hidden')) exitImmersive();
      else stage.classList.add('ui-hidden');
    }
    if (!editing && event.key.toLowerCase() === 'd') setDirectorEnabled(!directorState.enabled);
    if (!editing && event.key.toLowerCase() === 'g') setGlitchRackEnabled(!glitchConfig.enabled);
    if (!editing && event.key.toLowerCase() === 's') captureSnapshot();
    if (!editing && event.key === 'F10') {
      event.preventDefault();
      toggleAlwaysOnTop();
    }
    if (event.key === 'Escape') {
      if (calibrationPanel.classList.contains('is-open')) setCalibrationPanel(false);
      if (palettePanel.classList.contains('is-open')) setPalettePanel(false);
      if (conductorPanel.classList.contains('is-open')) setConductorPanel(false);
      if (glitchPanel.classList.contains('is-open')) setGlitchPanel(false);
      if (mappingLab?.isOpen()) setMappingLabPanel(false);
    }
  });
  window.addEventListener('beforeunload', () => {
    stopCapture(false);
    glitchWebglRenderer?.dispose();
  });

  try {
    const savedCalibration = JSON.parse(localStorage.getItem('xins-fusion-calibration'));
    if (savedCalibration && typeof savedCalibration === 'object') applyCalibration(savedCalibration, 'custom', false);
    else syncCalibrationControls('open-flat');
  } catch (_) {
    syncCalibrationControls('open-flat');
  }
  try {
    const savedResponse = JSON.parse(localStorage.getItem('xins-fusion-frequency-response'));
    if (savedResponse && typeof savedResponse === 'object') {
      applyFrequencyResponse(savedResponse, savedResponse.preset || 'custom', false);
    } else {
      syncResponseControls('flat');
    }
  } catch (_) {
    syncResponseControls('flat');
  }
  try {
    const savedPalette = JSON.parse(localStorage.getItem('xins-fusion-palette'));
    if (savedPalette?.custom) {
      for (const key of ['main', 'hot', 'dark']) {
        if (/^#[0-9a-f]{6}$/i.test(savedPalette.custom[key] || '')) customColors[key] = savedPalette.custom[key];
      }
    }
    applyPalette(savedPalette?.name || 'aurora', false);
  } catch (_) {
    applyPalette('aurora', false);
  }
  try {
    const savedColorFx = JSON.parse(localStorage.getItem('xins-fusion-color-fx'));
    if (savedColorFx && typeof savedColorFx === 'object') applyColorFx(savedColorFx, false);
    else syncColorFxControls();
  } catch (_) {
    syncColorFxControls();
  }
  try {
    const savedConductorSettings = JSON.parse(localStorage.getItem('xins-fusion-conductor-settings'));
    if (savedConductorSettings && typeof savedConductorSettings === 'object') applyConductorConfig(savedConductorSettings, false);
    else syncConductorControls('center');
  } catch (_) {
    syncConductorControls('center');
  }
  try {
    const savedGlitchUserPresets = JSON.parse(localStorage.getItem('xins-fusion-glitch-user-presets'));
    glitchUserPresets = Array.isArray(savedGlitchUserPresets)
      ? savedGlitchUserPresets.filter(item => item && item.id && item.name).slice(-12)
      : [];
  } catch (_) {
    glitchUserPresets = [];
  }
  renderGlitchUserPresets();
  try {
    const savedGlitchSettings = JSON.parse(localStorage.getItem('xins-fusion-glitch-settings'));
    if (savedGlitchSettings && typeof savedGlitchSettings === 'object') applyGlitchConfig(savedGlitchSettings, false);
    else syncGlitchControls();
  } catch (_) {
    syncGlitchControls();
  }
  try {
    setConductorEnabled(localStorage.getItem('xins-fusion-conductor') === 'true', false);
  } catch (_) {
    setConductorEnabled(false, false);
  }
  try {
    setQualityMode(localStorage.getItem('xins-fusion-quality') || 'auto', false, false);
  } catch (_) {
    setQualityMode('auto', false, false);
  }
  try {
    pulsarState.mode = localStorage.getItem('xins-fusion-pulsar-mode') === 'neon' ? 'neon' : 'mono';
    const savedLayout = localStorage.getItem('xins-fusion-pulsar-layout');
    pulsarState.layout = ['folded', 'sweep', 'stereo'].includes(savedLayout) ? savedLayout : 'folded';
  } catch (_) {
    pulsarState.mode = 'mono';
    pulsarState.layout = 'folded';
  }
  setPulsarLayout(pulsarState.layout, false, false);
  setPulsarMode(pulsarState.mode, false, false);
  try {
    setDirectorEnabled(localStorage.getItem('xins-fusion-director') === 'true', false);
  } catch (_) {
    setDirectorEnabled(false, false);
  }
  bindUiText(pinButton, 'runtime.pin.off', '置顶');
  bindUiText(captureButton.querySelector('span'), 'runtime.capture.connect', '连接声音');
  bindUiText(sourceLabel, 'runtime.audio.system', '系统音频');
  bindUiText(trackTitle, 'runtime.waiting.title', '等待电脑里的声音');
  bindUiText(trackMeta, 'runtime.waiting.meta', '连接系统音频后，任何播放器都能驱动这片雾');
  updatePlayButton();
  if (window.SmokeResonanceDesktop) stage.classList.add('is-desktop');
  resize();
  ensureMaterialRuntime();
  window.SmokeResonanceMaterialView = Object.freeze({
    outputs: () => materialRuntime?.outputs() || null,
    status: () => materialFrameOrchestrator?.status() ||
      materialRuntime?.status() || null,
    registry: () => materialRegistry?.list() || Object.freeze([]),
    targets: () => materialTargetRegistry?.list() || Object.freeze([]),
    parameters: () => currentMaterialTargetValues(),
    setTargets: values => setMaterialTargetOverrides(values),
    clearTargets: () => setMaterialTargetOverrides({}),
    acceptGeneratorMapping: (frameIndex, report) =>
      acceptGeneratorMaterialMapping(frameIndex, report),
    activate: (id, reason = 'material-change') =>
      materialRuntime?.activate(id, reason) || null,
    reset: (reason = 'manual') =>
      materialRuntime?.reset(reason) || null,
    observeGlitch: (frameIndex, report) =>
      materialFrameOrchestrator?.observeGlitch(frameIndex, report) || null
  });
  requestAnimationFrame(animate);
})();
