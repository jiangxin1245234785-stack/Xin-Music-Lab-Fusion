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
  const scoreClockFrame = { ...engineClockFrame };
  let scoreDriver = null;
  let shellRequest = 0;
  const glitchWebglRenderer = window.SmokeResonanceGlitchWebGL?.create(glitchWebglCanvas, { maxDimension: 2560 }) || null;
  let webglFailureNotified = false;
  const intensityInput = $('#intensity');
  const paletteButton = $('#paletteButton');
  const palettePanel = $('#palettePanel');
  const paletteClose = $('#paletteClose');
  const glitchPowerButton = $('#glitchPowerButton');
  const glitchSettingsButton = $('#glitchSettingsButton');
  const glitchPanel = $('#glitchPanel');
  let glitchPanelOpen = glitchPanel.classList.contains('is-open');
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
  const colorFlash = $('#colorFlash');
  const toast = $('#toast');

  // The 配色 sets (B5, 2026-11-15; chosen in work/xml-palette-20261114): 跟封面 (cover) first and the default, then
  // five hand-tuned sets, then custom. The seven old sets (three EVA, synthwave, toxic, ultraviolet, solar) are gone;
  // a profile that still names one lands on 跟封面. `cover` is worked out from the song's cover when the song
  // changes (PaletteCore.coverPalette); with no cover, or a grey one, it is the 黑白 set.
  const palettes = {
    cover: { main: [198, 196, 190], hot: [243, 242, 239], dark: [21, 20, 18] },
    dusk: { main: [161, 125, 212], hot: [231, 194, 237], dark: [26, 22, 34] },
    moss: { main: [104, 148, 88], hot: [185, 220, 185], dark: [17, 24, 16] },
    wine: { main: [182, 82, 99], hot: [239, 187, 188], dark: [32, 17, 18] },
    tide: { main: [66, 148, 157], hot: [188, 232, 234], dark: [12, 24, 27] },
    ink: { main: [198, 196, 190], hot: [243, 242, 239], dark: [21, 20, 18] }
  };
  const PALETTE_DEFAULT = 'cover';
  const paletteName = name => (name === 'custom' || Object.prototype.hasOwnProperty.call(palettes, name) ? name : PALETTE_DEFAULT);
  const customColors = { main: '#a17dd4', hot: '#e7c2ed', dark: '#1a1622' };
  // Scenes the 配色 does not reach, and the one line said under the greyed swatches there.
  const paletteMuted = (effect, pulsarMode) => (effect === 'score' ? 'score'
    : String(effect).startsWith('beta-') ? 'own'
      : effect === 'pulsar' && pulsarMode !== 'neon' ? 'pulsarMono' : '');

  const effectNames = {
    spectrum: '经典 LED 频谱',
    ribbons: '现代 · 霓虹丝带',
    pulsar: '现代 · 层叠脉冲星',
    score: '听歌 · 谱面'
  };

  // How the spectrum is read, fixed since the 频谱校准 panel was removed (2026-11-13): its old
  // default (log axis, flat visual response, no auto gain). LED spectrum, pulsar and the audio
  // features all map through this.
  const spectrumMapping = Object.freeze({ minFreq: 20, maxFreq: 20000, minDb: -92, maxDb: -18, tilt: 2, smoothing: .68 });
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
    'beta-glitch-4': 'flexi - what is the matrix'
  };
  const betaFallbackPresets = [
    'Aderrasi - Potion of Spirits',
    'Krash + Illusion - Spiral Movement',
    'Unchained - Unified Drag 2'
  ];
  const availableEffects = new Set([...Object.keys(effectNames), ...Object.keys(betaPresetNames)]);

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
    { id: 'beta-glitch-4', energy: .65, centroid: .72, texture: .82, glitch: true }
  ];

  let currentPalette = palettes.cover;
  let basePalette = { main: [...palettes.cover.main], hot: [...palettes.cover.hot], dark: [...palettes.cover.dark] };
  let targetPalette = palettes.cover;
  let paletteEasedAt = 0;
  let activePaletteName = PALETTE_DEFAULT;
  const coverState = { url: null, source: 'none', notes: [], cache: new Map() };
  let activeEffect = 'spectrum';
  let intensity = 1;
  let w = 0;
  let h = 0;
  let dpr = 1;
  let frame = 0;
  let switchToken = 0;
  let resizeRequest = 0;
  let toastTimer;

  const spectrumLevels = [];
  const spectrumPeaks = [];
  const ribbonSpectrumLevels = [];
  const ribbonFastLevels = [];
  const ribbonPreviousRaw = [];
  const ribbonTransientLevels = [];
  const bandCache = new Map();
  const pulsarState = {
    history: [],
    lastCaptureAt: 0,
    lastDrawAt: 0,
    captureInterval: 150,
    mode: 'mono',
    layout: 'folded',
    stereoAvailable: false
  };
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
  let glitchPostFxDirty = false;
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
    lastAdjustmentAt: 0
  };
  const directorState = {
    enabled: false,
    beatCount: 0,
    previousOnset: 0,
    lastBeatAt: 0,
    lastSwitchAt: 0,
    energyAnchor: 0,
    history: []
  };

  const audioState = {
    context: null,
    analyser: null,
    data: null,
    floatData: null,
    waveData: null,
    source: null,
    sourceKind: 'none',
    mediaElement: null,
    mediaSource: null,
    originalGain: null,
    stemLevel: null,
    mediaMix: null,
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
  const glitchEngine = window.SmokeResonanceGlitchEngine?.create();

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
    analyser.smoothingTimeConstant = spectrumMapping.smoothing;
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
    audioState.data = new Uint8Array(audioState.analyser.frequencyBinCount);
    audioState.floatData = new Float32Array(audioState.analyser.frequencyBinCount);
    audioState.waveData = new Uint8Array(audioState.analyser.fftSize);
  }

  function connectBetaAudio() {
    if (!betaState.visualizer || !audioState.source) return;
    try { betaState.visualizer.connectAudio(audioState.source); } catch (_) {}
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
  }

  // The original element owns the playhead. Each decoded stem feeds the same output
  // and analysis bus through its own initially silent gain. A switch changes which
  // input reaches that bus without opening the stem a second time.
  const stemNodes = new WeakMap();
  const stemInputs = new Set();
  let activeStemInput = null;
  let renderedStemInput = null;
  const scheduledInputs = [];

  function renderedInput() {
    const now = audioState.context?.currentTime || 0;
    while (scheduledInputs.length && scheduledInputs[0].when <= now) {
      renderedStemInput = scheduledInputs.shift().input;
    }
    return renderedStemInput;
  }

  function syncStemLevel() {
    const master = audioState.mediaElement;
    const level = master.paused || master.muted || master.ended || !master.readyState ? 0 : master.volume;
    audioState.stemLevel.gain.setValueAtTime(level, audioState.context.currentTime);
  }

  function selectMediaInput(input, immediate = false) {
    const context = audioState.context;
    const now = context.currentTime;
    const quantum = (context.renderQuantumSize || 128) / context.sampleRate;
    renderedInput();
    if (immediate || context.state !== 'running' || !audioState.mediaConnected || audioState.mediaElement.paused) {
      scheduledInputs.length = 0;
      for (const stem of stemInputs) {
        stem.gain.gain.cancelScheduledValues(now);
        stem.gain.gain.setValueAtTime(stem === input ? stem.playbackGain : 0, now);
        stem.silentAt = now;
      }
      audioState.originalGain.gain.cancelScheduledValues(now);
      audioState.originalGain.gain.setValueAtTime(input ? 0 : 1, now);
      activeStemInput = renderedStemInput = input;
      return;
    }
    if (input === activeStemInput) return;
    // Chromium renders on another thread. Give both AudioParams several quanta to
    // receive their commands, with the identical sample boundary for both steps.
    const lead = Math.max(0.032, 4 * quantum);
    const last = scheduledInputs.at(-1);
    const replace = last && last.when - now >= lead / 2;
    const when = replace ? last.when : Math.ceil((now + lead) / quantum) * quantum;
    if (activeStemInput) {
      activeStemInput.gain.gain.setValueAtTime(0, when);
      activeStemInput.silentAt = when + quantum;
    }
    audioState.originalGain.gain.setValueAtTime(input ? 0 : 1, when);
    if (input) input.gain.gain.setValueAtTime(input.playbackGain, when);
    activeStemInput = input;
    if (replace) last.input = input;
    else scheduledInputs.push({when, input});
  }

  function connectMediaGraph(element) {
    if (audioState.mediaElement && audioState.mediaElement !== element) throw Error('media-element-conflict');
    if (!audioState.mediaSource) {
      audioState.mediaSource = audioState.context.createMediaElementSource(element);
      audioState.mediaElement = element;
      audioState.originalGain = audioState.context.createGain();
      audioState.stemLevel = audioState.context.createGain();
      audioState.mediaMix = audioState.context.createGain();
      audioState.mediaSource.connect(audioState.originalGain);
      audioState.originalGain.connect(audioState.mediaMix);
      audioState.stemLevel.connect(audioState.mediaMix);
      syncStemLevel();
      for (const event of ['volumechange', 'play', 'playing', 'pause', 'ended', 'emptied']) {
        element.addEventListener(event, syncStemLevel);
      }
    }
    if (!audioState.mediaConnected) {
      audioState.mediaMix.connect(audioState.analyser);
      audioState.mediaMix.connect(audioState.context.destination);
      audioState.mediaConnected = true;
    }
  }

  function prepareStemOutput(element, playbackGain = 1) {
    if (!(element instanceof HTMLMediaElement)) throw Error('invalid-media-element');
    if (playbackGain !== 1 && playbackGain !== 2) throw Error('invalid-stem-gain');
    const master = audioState.mediaElement || document.getElementById('fusionAudio');
    if (!master || element === master) throw Error('invalid-stem-element');
    initAudio();
    connectMediaGraph(master);
    const context = audioState.context;
    let source = stemNodes.get(element);
    if (!source) {
      source = context.createMediaElementSource(element);
      stemNodes.set(element, source);
    }
    for (const input of stemInputs) if (!input.released && input.element === element) {
      if (input.playbackGain !== playbackGain) throw Error('stem-gain-changed');
      return input.handle;
    }
    const gain = context.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(audioState.stemLevel);
    element.volume = 1;
    const input = {element, gain, playbackGain, silentAt: 0, released: false, retirement: null, handle: null};
    function disconnect() {
      renderedInput();
      stemInputs.delete(input);
      source.disconnect(gain);
      gain.disconnect();
    }
    input.handle = {
      activate() {
        if (input.released) return false;
        selectMediaInput(input);
        return true;
      },
      release() {
        if (input.released) return input.retirement;
        input.released = true;
        if (activeStemInput === input) selectMediaInput(null);
        if (context.state !== 'running' || context.currentTime >= input.silentAt) {
          disconnect();
          return;
        }
        // Dispose the media element only once the audio thread no longer needs it.
        input.retirement = new Promise(resolve => {
          function finish() {
            if (context.state === 'running' && context.currentTime < input.silentAt) {
              setTimeout(finish, Math.max(2, Math.ceil((input.silentAt - context.currentTime) * 1000)));
              return;
            }
            disconnect();
            resolve();
          }
          finish();
        });
        return input.retirement;
      }
    };
    stemInputs.add(input);
    return input.handle;
  }

  const stemOutput = Object.freeze({
    prepare: prepareStemOutput,
    original() { if (activeStemInput) selectMediaInput(null); },
    current() {
      const input = renderedInput();
      return input ? {kind: 'stem', element: input.element}
        : {kind: 'original', element: audioState.mediaElement || document.getElementById('fusionAudio')};
    }
  });

  async function attachInternalMedia(element) {
    if (!(element instanceof HTMLMediaElement)) return { ok: false, error: 'invalid-media-element' };
    initAudio();
    try { await audioState.context.resume(); } catch (_) {}
    if (audioState.mediaElement && audioState.mediaElement !== element) return { ok: false, error: 'media-element-conflict' };
    try { connectMediaGraph(element); }
    catch (_) { return { ok: false, error: audioState.mediaSource ? 'media-connect-failed' : 'media-source-failed' }; }
    audioState.source = audioState.mediaMix;
    audioState.sourceKind = 'internal';
    audioState.started = true;
    audioState.playing = !element.paused;
    setStereoAnalysisEnabled(pulsarState.layout === 'stereo');
    connectBetaAudio();
    resetAudioAnalysis();
    return { ok: true, kind: 'internal' };
  }

  function detachInternalMedia() {
    if (audioState.mediaSource) selectMediaInput(null, true);
    for (const input of stemInputs) input.handle.release();
    if (!audioState.mediaConnected) return { ok: true, kind: audioState.sourceKind };
    try { audioState.mediaMix.disconnect(); } catch (_) {}
    audioState.mediaConnected = false;
    audioState.source = null;
    audioState.sourceKind = 'none';
    audioState.started = false;
    audioState.playing = false;
    if (audioState.stereoSource === audioState.mediaMix) audioState.stereoSource = null;
    resetAudioAnalysis();
    return { ok: true, kind: 'none' };
  }

  function setInternalPlaying(playing) {
    if (audioState.sourceKind !== 'internal') return false;
    audioState.playing = Boolean(playing);
    return audioState.playing;
  }

  function frequencyAt(position) {
    const t = Math.max(0, Math.min(1, position));
    return spectrumMapping.minFreq * Math.pow(spectrumMapping.maxFreq / spectrumMapping.minFreq, t);
  }

  function frequencyPosition(frequency) {
    return Math.log(frequency / spectrumMapping.minFreq) / Math.log(spectrumMapping.maxFreq / spectrumMapping.minFreq);
  }

  function averageBandDb(fromHz, toHz) {
    const data = audioState.floatData;
    if (!data?.length || !audioState.context) return spectrumMapping.minDb;
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

  function mappedValue(db, centerHz) {
    const tilt = spectrumMapping.tilt * Math.log2(Math.max(20, centerHz) / 1000);
    return Math.max(0, Math.min(1, (db + tilt - spectrumMapping.minDb) / (spectrumMapping.maxDb - spectrumMapping.minDb)));
  }

  function averageHz(fromHz, toHz) {
    const center = Math.sqrt(Math.max(1, fromHz) * Math.max(1, toHz));
    return mappedValue(averageBandDb(fromHz, toHz), center);
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
      const magnitude = Math.max(1e-5, mappedValue(db, frequency));
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

  function getEnergy() {
    if (!audioState.analyser || !audioState.playing) {
      const idle = .025 + Math.sin(frame * .017) * .006;
      Object.keys(audioState.accents).forEach(key => { audioState.accents[key] *= .72; });
      return { bass: idle, mid: idle, treble: idle * .7, overall: idle };
    }
    audioState.analyser.getFloatFrequencyData(audioState.floatData);
    audioState.analyser.getByteFrequencyData(audioState.data);
    bandCache.clear();

    // The flat visual response adds nothing, so the raw and the mapped band levels are one value.
    const target = {
      bass: averageHz(25, 220),
      mid: averageHz(220, 2400),
      treble: averageHz(2400, 12000),
      overall: averageHz(30, 14000)
    };
    const rawTarget = { ...target };
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
    const media = audioState.sourceKind === 'internal' ? audioState.mediaElement : null;
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
        mode: 'internal',
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
        const center = Math.sqrt(from * to);
        values[i] = mappedValue(averageBandDb(from, to), center);
      }
      bandCache.set(total, values);
    }
    return bandCache.get(total)[index] || 0;
  }

  function formatFrequency(value) {
    if (value >= 1000) return `${Number((value / 1000).toFixed(value < 10000 ? 1 : 0))}k`;
    return String(Math.round(value));
  }

  function drawSpectrumScale(pad, baseY, maxHeight) {
    const top = baseY - maxHeight;
    const frequencyTicks = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
    const dbTicks = [spectrumMapping.minDb, (spectrumMapping.minDb + spectrumMapping.maxDb) * .5, spectrumMapping.maxDb];
    ctx.save();
    ctx.lineWidth = 1;
    ctx.font = '8px "Segoe UI", sans-serif';
    ctx.textBaseline = 'top';
    for (const frequency of frequencyTicks) {
      if (frequency < spectrumMapping.minFreq || frequency > spectrumMapping.maxFreq) continue;
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
      const position = (db - spectrumMapping.minDb) / (spectrumMapping.maxDb - spectrumMapping.minDb);
      const y = baseY - position * maxHeight;
      ctx.strokeStyle = `rgba(${currentPalette.hot.join(',')},${db === spectrumMapping.maxDb ? .12 : .07})`;
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
      const response = target > (spectrumLevels[i] || 0) ? .58 - spectrumMapping.smoothing * .18 : .22 - spectrumMapping.smoothing * .12;
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

  function mixColor(a, b, amount) {
    return a.map((value, index) => Math.round(value + (b[index] - value) * amount));
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
    const center = Math.sqrt(from * to);
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
    syncPaletteReach();
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

  function paletteRgba(rgb, alpha = 1) {
    return `rgba(${rgb.join(',')},${alpha})`;
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

  function clearGlitchPostFx() {
    if (!glitchPostFxDirty) return;
    glitchPostFxDirty = false;
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
    const threshold = .12;
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
    const ensemble = Math.min(1, Math.max(0, (audioState.features.orchestrationDensity || 0) * .74));
    const lowDrum = Math.min(1, Math.max(audioState.accents.bass || 0, audioState.features.onset * audioState.energy.bass * .82));
    const midDrum = Math.min(1, Math.max(audioState.accents.mid || 0, audioState.features.flux * audioState.energy.mid * .88));
    const highDrum = Math.min(1, Math.max(audioState.accents.treble || 0, audioState.features.onset * audioState.energy.treble, audioState.features.flux * .62));
    const drum = weightedSignal(
      [lowDrum, midDrum, highDrum],
      [glitchConfig.drumLow, glitchConfig.drumMid, glitchConfig.drumHigh]
    );
    const source = audioState.features;
    const dissonance = Math.min(1, Math.max(source.acid || 0, (source.roughness || 0) * .72 + (source.flatness || 0) * .28));
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
    // Section, climax, drop, build and chord come from the XLD timeline; without it they are neutral.
    const section = Math.min(1, Math.max(
      fusionTimelineState.connected ? fusionTimelineState.section : 0,
      fusionTimelineState.boundaryPulse
    ));
    const weightedEnsemble = ensemble * glitchConfig.ensembleWeight;
    const weightedDrum = drum * glitchConfig.drumWeight;
    const weightedAbrasion = abrasion * glitchConfig.abrasionWeight;
    const weightedSection = section * glitchConfig.sectionDrive;
    const drive = Math.min(1, (weightedEnsemble + weightedDrum + weightedAbrasion + weightedSection) / 3.05);
    const chordConfidence = fusionTimelineState.connected ? fusionTimelineState.chordConfidence : 0;
    const chordChange = fusionTimelineState.connected ? Math.min(1, fusionTimelineState.chordPulse) : 0;
    const climaxState = fusionTimelineState.connected ? fusionTimelineState.climax : 0;
    const dropState = fusionTimelineState.connected ? fusionTimelineState.drop : 0;
    const buildState = fusionTimelineState.connected ? fusionTimelineState.build : 0;
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
      chord: fusionTimelineState.connected ? fusionTimelineState.chord : '—',
      chordConfidence,
      chordChange,
      drive
    };
  }

  const chordHueRoots = Object.freeze({ C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 });

  function glitchChordHue(label) {
    const match = String(label || '').match(/^([A-G](?:#|b)?)/);
    return match && chordHueRoots[match[1]] !== undefined ? chordHueRoots[match[1]] / 12 : 0;
  }

  function buildGlitchFeatureFrame(energy, signals, now) {
    if (!glitchFeatureBus) return null;
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
      sectionSerial: fusionTimelineState.connected ? signals.sectionSerial : 0,
      chordChange: signals.chordChange
    }, now);
  }

  function drawUniversalGlitchPostFx(energy, now) {
    glitchPostFxDirty = true;
    const sourceCanvas = activeEffect.startsWith('beta-') ? betaCanvas : canvas;
    const signals = currentGlitchSignals();
    const strength = Math.max(.4, glitchConfig.fxStrength);
    const elapsed = glitchState.lastFxAt ? Math.max(1 / 240, Math.min(.05, (now - glitchState.lastFxAt) / 1000)) : 1 / 60;
    glitchState.lastFxAt = now;
    const freePulse = Math.min(1, (signals.weightedBeat * .74 + signals.weightedAcid * .22 + signals.weightedSection * .28 + signals.chordChange * .3) * strength);
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
    glitchPostFxDirty = true;
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

  function resetLegacyMaterialState(id, reason) {
    const materialId = String(id || '');
    const resetReason = String(reason || 'manual');
    if (resetReason === 'material-change' ||
        resetReason === 'material-deactivate' ||
        resetReason === 'track-change' ||
        resetReason === 'seek') {
      spectrumLevels.length = 0;
      spectrumPeaks.length = 0;
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
  }

  function renderButterchurnMaterial() {
    try {
      betaState.visualizer?.render();
      betaState.renderFailures = 0;
    } catch (error) {
      betaState.renderFailures++;
      if (betaState.renderFailures === 3) {
        betaState.lastError = error?.message || '渲染失败';
        setActiveEffectState('spectrum', 'renderer-fallback');
        selectButton(activeEffect);
        showToast('MilkDrop 与当前显卡不兼容，已切换到 LED 频谱', 4200);
      }
    }
  }

  const legacyMaterialRenderers = Object.freeze({
    spectrum: frame => drawSpectrum(frame.musicFrame.energy),
    ribbons: frame => drawRibbons(frame.musicFrame.energy),
    pulsar: frame => drawPulsar(
      frame.musicFrame.energy,
      frame.musicFrame.now
    ),
    // The listening score draws on its own canvas (score-scene.js); here the base canvas is only left clear.
    score: () => {}
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
    const wasScore = activeEffect === 'score';
    activeEffect = name;
    stage.dataset.effect = name;
    syncPaletteReach();
    if (wasScore !== (name === 'score')) {
      if (name === 'score') {
        clearGlitchPostFx();
        colorFlash.style.opacity = '0';
      }
      realtimeProviderLastAt = 0;
      resetPerformanceWindow();
      resize(true);
      stage.dispatchEvent(new Event('scorevisibilitychange'));
      scheduleShell();
    }
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
    const token = ++switchToken;
    selectButton(name);
    if (name.startsWith('beta-')) {
      if (!audioState.context) {
        showToast('请先播放一首歌');
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

  function rgbToHexSet(set) {
    return { main: rgbToHex(set.main), hot: rgbToHex(set.hot), dark: rgbToHex(set.dark) };
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
    // A new set (a swatch, or the next song's cover) is eased into over about half a second, not cut to.
    const step = paletteEasedAt ? Math.min(1, 1 - Math.exp(-(now - paletteEasedAt) / 160)) : 1;
    paletteEasedAt = now;
    for (const role of ['main', 'hot', 'dark']) {
      basePalette[role] = basePalette[role].map((value, index) => value + (targetPalette[role][index] - value) * step);
    }
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
    // The strobe flashes over every canvas; over the score it would flash the notes, so there it stays out (B5 C).
    const strobe = stage.dataset.effect === 'score' ? 0 : colorFx.strobe;
    if (strobe > .001 && trigger > .13 && now - colorFxState.lastFlashAt > 105) {
      colorFxState.flash = Math.max(colorFxState.flash, Math.min(1, trigger * 1.18));
      colorFxState.lastFlashAt = now;
    }
    colorFxState.flash *= .76;
    const flashOpacity = strobe * colorFxState.flash * .24;
    colorFlash.style.opacity = flashOpacity.toFixed(3);
    colorFlash.style.background = `rgb(${currentPalette.hot.map(Math.round).join(',')})`;
    stage.style.setProperty('--accent', rgbToHex(currentPalette.main));
    stage.style.setProperty('--accent-2', rgbToHex(currentPalette.hot));
    stage.style.setProperty('--accent-soft', `rgba(${currentPalette.main.map(Math.round).join(',')}, .22)`);
    stage.style.setProperty('--pal-dark', rgbToHex(currentPalette.dark));
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
    name = paletteName(name);
    activePaletteName = name;
    targetPalette = palettes[name];
    if (!persist) {
      // At start-up: no easing from the default.
      for (const role of ['main', 'hot', 'dark']) basePalette[role] = [...targetPalette[role]];
      currentPalette = { main: [...basePalette.main], hot: [...basePalette.hot], dark: [...basePalette.dark] };
    }
    stage.dataset.palette = name;
    document.querySelectorAll('.swatch').forEach(button => {
      button.classList.toggle('is-active', button.dataset.palette === name);
    });
    if (persist) {
      try { localStorage.setItem('xins-fusion-palette', JSON.stringify({ name, custom: customColors })); } catch (_) {}
    }
    return name;
  }

  // Greys the 配色 row in a scene it does not reach, with one plain line saying why (B5 B1: nothing may be
  // clickable and change nothing). The 跟和弦变色 switch stays greyed: the old sets it switched between are gone.
  function syncPaletteReach() {
    const muted = paletteMuted(activeEffect, pulsarState.mode);
    const row = document.querySelector('[data-palette-row]');
    if (!row) return muted;
    row.classList.toggle('is-muted', Boolean(muted));
    row.querySelectorAll('.swatch, #paletteButton').forEach(button => { button.disabled = Boolean(muted); });
    document.querySelectorAll('[data-palette-muted]').forEach(note => { note.hidden = note.dataset.paletteMuted !== muted; });
    if (muted && palettePanel.classList.contains('is-open')) setPalettePanel(false);
    return muted;
  }

  // 跟封面: the song's cover, read small (48 x 48) and turned into a set by PaletteCore.coverPalette. No cover, a cover
  // that cannot be read, or a grey one: the 黑白 set. Kept per cover address; the cover file is only read.
  const coverFallback = Object.freeze({ name: '黑白', main: '#c6c4be', hot: '#f3f2ef', dark: '#151412' });
  function readCoverPixels(url) {
    return new Promise(resolve => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        try {
          const small = document.createElement('canvas');
          small.width = 48;
          small.height = 48;
          const context = small.getContext('2d', { willReadFrequently: true });
          context.drawImage(image, 0, 0, 48, 48);
          resolve(context.getImageData(0, 0, 48, 48).data);
        } catch (error) {
          resolve({ error: error?.name || 'unreadable' });
        }
      };
      image.onerror = () => resolve({ error: 'load-failed' });
      image.src = url;
    });
  }
  function useCoverSet(set) {
    palettes.cover = { main: hexToRgb(set.main), hot: hexToRgb(set.hot), dark: hexToRgb(set.dark) };
    coverState.source = set.source;
    coverState.notes = set.notes || [];
    stage.style.setProperty('--cover-main', set.main);
    stage.style.setProperty('--cover-hot', set.hot);
    stage.style.setProperty('--cover-dark', set.dark);
    if (activePaletteName === 'cover') targetPalette = palettes.cover;
  }
  async function setCoverPalette(url) {
    url = url ? String(url) : '';
    if (url === coverState.url) return coverState.source;
    coverState.url = url;
    let set = coverState.cache.get(url);
    if (!set) {
      const core = window.PaletteCore;
      if (!url || !core) set = { ...coverFallback, source: url ? 'no-core' : 'no-cover', notes: [] };
      else {
        const pixels = await readCoverPixels(url);
        set = pixels.error ? { ...coverFallback, source: `unreadable:${pixels.error}`, notes: [] } : core.coverPalette(pixels, coverFallback);
      }
      coverState.cache.set(url, set);
    }
    if (coverState.url !== url) return coverState.source;   // the song changed again while the cover was read
    useCoverSet(set);
    return set.source;
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
    // The switch's pill says on or off; its words name the setting only (SPEC-B3 follow-up).
    bindUiText(glitchPowerButton, 'shell.fx', '画面特效');
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
    glitchPanelOpen = open;
    glitchPanel.classList.toggle('is-open', open);
    glitchPanel.setAttribute('aria-hidden', String(!open));
    glitchSettingsButton.setAttribute('aria-expanded', String(open));
    if (open) {
      ensurePanelInViewport(glitchPanel);
      requestAnimationFrame(resizeGlitchCurve);
    }
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
    stemOutput,
    attachMediaElement: element => attachInternalMedia(element),
    detachMediaElement: () => detachInternalMedia(),
    setMediaPlaying: value => setInternalPlaying(value)
  });

  window.SmokeResonanceColor = Object.freeze({
    get: () => ({ palette: activePaletteName, effects: { ...colorFx }, muted: paletteMuted(activeEffect, pulsarState.mode),
      cover: { url: coverState.url, source: coverState.source, notes: [...coverState.notes], set: palettes.cover ? rgbToHexSet(palettes.cover) : null },
      target: rgbToHexSet(targetPalette), shown: rgbToHexSet(basePalette) }),
    palette: name => applyPalette(name),
    cover: url => setCoverPalette(url),
    effects: values => applyColorFx(values)
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
    attachScoreDriver() {
      const driver = {
        tick(timestamp) {
          if (scoreDriver === driver && activeEffect === 'score' && !document.hidden) advanceScoreFrame(timestamp);
        },
        detach() {
          if (scoreDriver !== driver) return;
          scoreDriver = null;
          scheduleShell();
        }
      };
      scoreDriver = driver;
      scheduleShell();
      return driver;
    },
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
  function qualityLabel(mode) {
    return mode === 'high' ? '画质 高' : mode === 'eco' ? '画质 省电' : '画质 自动';
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
    const sectionScale = features.orchestrationDensity || 0;
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
    const sectionShift = Math.abs(energy.overall - directorState.energyAnchor) > .19 && directorState.beatCount >= 4;
    const phraseBoundary = directorState.beatCount >= 12;
    const ambientBoundary = dwell > 19000;
    if (dwell > 6200 && (phraseBoundary || sectionShift || ambientBoundary)) {
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
    directorToggle.setAttribute('aria-pressed', String(directorState.enabled));
    bindUiText(directorToggle, 'runtime.director.off', '自动换画面');
    if (persist) {
      try { localStorage.setItem('xins-fusion-director', String(directorState.enabled)); } catch (_) {}
      showToast(directorState.enabled
        ? uiText('runtime.director.enabled', '演出导演已接管：按编制加层、全奏、高潮与抽空换场')
        : uiText('runtime.director.disabled', '演出导演已关闭'));
    }
  }

  async function captureSnapshot() {
    const score = activeEffect === 'score' ? $('#scoreCanvas') : null;
    const scoreBox = score?.getBoundingClientRect();
    const scale = scoreBox?.width > 0 ? score.width / scoreBox.width : Math.max(1, Math.min(2, dpr));
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
      if (score && scoreBox.width > 0 && scoreBox.height > 0) {
        const stageBox = stage.getBoundingClientRect();
        shotCtx.drawImage(score, scoreBox.left - stageBox.left, scoreBox.top - stageBox.top, scoreBox.width, scoreBox.height);
      } else if (
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
    bindUiText(pinButton, 'runtime.pin.off', '窗口置顶');
    showToast(pinned
      ? uiText('runtime.pin.enabled', '窗口已保持在最前')
      : uiText('runtime.pin.disabled', '窗口置顶已关闭'));
  }

  function resize(restoreBuffers = false) {
    const nativeDpr = window.devicePixelRatio || 1;
    const nextDpr = qualityState.mode === 'high'
      ? Math.min(nativeDpr, 2)
      : qualityState.mode === 'eco'
        ? Math.min(nativeDpr, .85)
        : Math.min(nativeDpr, qualityState.adaptiveDpr);
    const nextWidth = Math.max(1, innerWidth);
    const nextHeight = Math.max(1, innerHeight);
    const webglScale = currentQualityBudget().webglScale;
    if (activeEffect === 'score') {
      w = nextWidth;
      h = nextHeight;
      dpr = nextDpr;
      // The score and lyrics have their own canvases and media clock. Keep full CSS layout
      // dimensions for controls, but release the hidden drawing buffers and GL feedback.
      if (restoreBuffers) {
        canvas.width = canvas.height = 1;
        glitchCanvas.width = glitchCanvas.height = 1;
        try { betaState.visualizer?.setRendererSize(2, 2); } catch (_) {}
        betaCanvas.width = betaCanvas.height = 2;
        glitchWebglRenderer?.resize(1, 1, 1, 1);
      }
      resizeGlitchCurve();
      return;
    }
    if (!restoreBuffers && w === nextWidth && h === nextHeight && Math.abs(dpr - nextDpr) < .001) {
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

  function publishScoreClock(now) {
    scoreClockFrame.deltaMs = engineClockFrame.nowMs ? Math.max(0, now - engineClockFrame.nowMs) : 0;
    scoreClockFrame.frameIndex = frame;
    scoreClockFrame.nowMs = now;
    engineClockFrame = scoreClockFrame;
    if (!engineFrameSubscribers.preMaterial.size && !engineFrameSubscribers.postMaterial.size) return;
    for (const phase of [engineFrameSubscribers.preMaterial, engineFrameSubscribers.postMaterial]) {
      for (const subscriber of [...phase]) {
        try { subscriber({ ...engineClockFrame }); }
        catch (error) { console.error('Score frame subscriber failed', error); }
      }
    }
  }

  function scheduleShell() {
    // The visible score already has one callback per display frame, including when
    // it shows an empty/loading state. Keep the independent loop as a hostless fallback.
    if (activeEffect === 'score' && scoreDriver) {
      if (shellRequest) cancelAnimationFrame(shellRequest);
      shellRequest = 0;
    } else if (!shellRequest) shellRequest = requestAnimationFrame(animate);
  }

  function advanceScoreFrame(now) {
    frame++;
    if ((directorState.enabled && audioState.playing) || glitchPanelOpen) {
      const energy = getEnergy();
      if (directorState.enabled) updateDirector(energy, now);
      if (glitchPanelOpen) {
        updateRhythmState(now);
        updateGlitchCurve(now);
      }
    }
    publishScoreClock(now);
  }

  function animate() {
    shellRequest = 0;
    const now = performance.now();
    if (document.hidden) {
      resetPerformanceWindow(now);
      scheduleShell();
      return;
    }
    if (activeEffect === 'score') {
      if (!scoreDriver) advanceScoreFrame(now);
      scheduleShell();
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
      })
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
        values: currentMaterialTargetValues()
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
    updatePerformance(now);
    for (const subscriber of [...engineFrameSubscribers.postMaterial]) {
      try {
        subscriber({ ...engineClockFrame });
      } catch (error) {
        console.error('Post-material frame subscriber failed', error);
      }
    }
    scheduleShell();
  }

  intensityInput.addEventListener('input', event => { intensity = Number(event.target.value); });
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
      if (palettePanel.classList.contains('is-open')) setPalettePanel(false);
      if (glitchPanel.classList.contains('is-open')) setGlitchPanel(false);
    }
  });
  window.addEventListener('beforeunload', () => {
    glitchWebglRenderer?.dispose();
  });

  try {
    const savedPalette = JSON.parse(localStorage.getItem('xins-fusion-palette'));
    if (savedPalette?.custom) {
      for (const key of ['main', 'hot', 'dark']) {
        if (/^#[0-9a-f]{6}$/i.test(savedPalette.custom[key] || '')) customColors[key] = savedPalette.custom[key];
      }
    }
    applyPalette(savedPalette?.name || PALETTE_DEFAULT, false);
  } catch (_) {
    applyPalette(PALETTE_DEFAULT, false);
  }
  syncPaletteReach();
  try {
    const savedColorFx = JSON.parse(localStorage.getItem('xins-fusion-color-fx'));
    if (savedColorFx && typeof savedColorFx === 'object') applyColorFx(savedColorFx, false);
    else syncColorFxControls();
  } catch (_) {
    syncColorFxControls();
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
  bindUiText(pinButton, 'runtime.pin.off', '窗口置顶');
  // B3 acceptance L3: after a reload the switch shows whether the window really is on top.
  Promise.resolve(window.SmokeResonanceDesktop?.isAlwaysOnTop?.())
    .then(pinned => { if (typeof pinned === 'boolean') pinButton.setAttribute('aria-pressed', String(pinned)); })
    .catch(() => {});
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
  scheduleShell();
})();
