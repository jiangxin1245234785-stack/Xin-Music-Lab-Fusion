(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const dynamicI18n = window.XinMusicLabDynamicUi;
  const uiText = (key, fallback, params) => dynamicI18n?.t(key, params, fallback) || fallback;
  const bindUiText = (element, key, fallback, params) => dynamicI18n?.bindText(element, key, params, fallback)
    || (element ? (element.textContent = uiText(key, fallback, params)) : fallback);
  const clearUiBinding = element => dynamicI18n?.unbind(element);
  const bridge = window.XinsMusicLabFusion;
  const visualAudio = window.SmokeResonanceAudioSource;
  const visualGlitch = window.SmokeResonanceGlitch;
  const visualTimeline = window.SmokeResonanceTimeline;
  const visualColor = window.SmokeResonanceColor;
  const visualFrameClock = window.SmokeResonanceFrameClock;
  const xldTimelineProvider =
    window.SmokeResonanceXldTimelineProvider?.create() || null;
  const musicFeatureResolver =
    window.SmokeResonanceMusicFeatureResolver?.create() || null;
  const generatorSourceAdapter =
    window.SmokeResonanceGeneratorSourceAdapter?.create({
      stage: $('.stage'),
      baseCanvas: $('#visualizer'),
      betaCanvas: $('#betaCanvas'),
      materialProvider: () =>
        window.SmokeResonanceMaterialView?.outputs() || null,
      rendererEnabled: true
    }) || null;
  const generatorRuntimeShadow =
    window.SmokeResonanceGeneratorRuntimeShadow?.create({
      enabled: true,
      formalPipeline: 'generator',
      initialPresetId: 'balanced',
      entryUrl:
        './vendor/glitch-generator/6.6.1-integration-v.3/browser/index.js',
      sessionSeed: 0,
      rendererEnabled: true,
      renderCanvas: $('#generatorCanvas'),
      sourceProvider: () => generatorSourceAdapter?.get() || null,
      qualityProvider: () => ({
        mode: $('#qualityButton')?.dataset.mode || 'auto'
      })
    }) || null;
  const generatorPresetSelector =
    window.SmokeResonanceGeneratorPresetSelector?.create({
      root: $('#generatorPresetControl'),
      presetsProvider: () => generatorRuntimeShadow?.presets() || [],
      activeProvider: () =>
        generatorRuntimeShadow?.status()?.runtime?.preset || null,
      applyPreset: id => generatorRuntimeShadow?.setBuiltInPreset(id),
      storage: window.localStorage,
      translate: uiText,
      subscribeLocale: listener => dynamicI18n?.subscribe(listener) || (() => {})
    }) || null;
  const generatorPresetFilesUi =
    window.SmokeResonanceGeneratorPresetFilesUi?.create({
      root: $('#generatorPresetFiles'),
      exportProvider: () => generatorRuntimeShadow?.exportPresetJson(),
      stageProvider: json => generatorRuntimeShadow?.stagePresetJson(json),
      importProvider: json => {
        const result = generatorRuntimeShadow?.importPresetJson(json) || null;
        if (result?.applied) generatorPresetSelector?.sync();
        return result;
      },
      desktopBridge: bridge,
      translate: uiText,
      subscribeLocale: listener => dynamicI18n?.subscribe(listener) || (() => {})
    }) || null;
  const generatorPresetRepositoryUi =
    window.SmokeResonanceGeneratorPresetRepositoryUi?.create({
      root: $('#generatorPresetRepository'),
      builtInProvider: () => generatorRuntimeShadow?.presets() || [],
      exportProvider: () => generatorRuntimeShadow?.exportPresetJson(),
      importProvider: json => {
        const result = generatorRuntimeShadow?.importPresetJson(json) || null;
        if (result?.applied) generatorPresetSelector?.sync();
        return result;
      },
      selectBuiltIn: id => {
        const result = generatorRuntimeShadow?.setBuiltInPreset(id) || null;
        if (result) generatorPresetSelector?.sync();
        return result;
      },
      repositoryBridge: bridge,
      translate: uiText,
      subscribeLocale: listener => dynamicI18n?.subscribe(listener) || (() => {})
    }) || null;
  const frameOwnershipMonitor =
    window.SmokeResonanceFrameOwnership?.create({
      owner: 'legacy.animate',
      subscriber: 'generator-runtime-shadow',
      maxSamples: 512,
      formalPipeline: 'generator'
    }) || null;
  const generatorOutputController =
    window.SmokeResonanceGeneratorOutputController?.create({
      stage: $('.stage'),
      canvas: $('#generatorCanvas'),
      requiredBindingCount: 21,
      enabled: true
    }) || null;
  let xldProviderFrame = xldTimelineProvider?.get() || null;
  let unifiedMusicFrame = musicFeatureResolver?.get() || null;
  const dom = {
    stage: $('.stage'), panel: $('#fusionPanel'), button: $('#fusionButton'), close: $('#fusionClose'),
    load: $('#fusionLoad'), welcomeLoad: $('#fusionWelcomeButton'), reveal: $('#fusionReveal'),
    linkCard: $('#fusionLinkCard'), status: $('#fusionStatus'), album: $('#fusionAlbum'),
    track: $('#fusionTrack'), artist: $('#fusionArtist'), cover: $('#fusionCover'),
    play: $('#fusionPlay'), previous: $('#fusionPrevious'), next: $('#fusionNext'),
    seek: $('#fusionSeek'), time: $('#fusionTime'), duration: $('#fusionDuration'),
    autoColor: $('#fusionAutoColor'), audio: $('#fusionAudio'),
    welcome: $('#welcome'), libraryView: $('#fusionLibraryView'),
    libraryMeta: $('#fusionLibraryMeta'), libraryRoot: $('#fusionLibraryRoot'),
    librarySearch: $('#fusionLibrarySearch'), libraryList: $('#fusionLibraryList'), refresh: $('#fusionRefresh'),
    libraryAnalyzed: $('#fusionLibraryAnalyzed'), locateTrack: $('#fusionLocateTrack'),
    sectionEngineSelect: $('#fusionSectionEngine'), chordEngineSelect: $('#fusionChordEngine'),
    analysisCard: $('#fusionAnalysisCard'), analysisTitle: $('#fusionAnalysisTitle'),
    analysisEngine: $('#fusionAnalysisEngine'), analysisRun: $('#fusionAnalysisRun'),
    analysisCancel: $('#fusionAnalysisCancel'), analysisStatus: $('#fusionAnalysisStatus'),
    analysisProgress: $('#fusionAnalysisProgress'), analysisPercent: $('#fusionAnalysisPercent'),
    resultsRefresh: $('#fusionResultsRefresh'), analysisOptions: $('#fusionAnalysisOptions'),
    openXldLab: $('#fusionOpenXldLab')
  };

  const state = {
    payload: null,
    manifest: null,
    bridgePath: '',
    library: [],
    albums: [],
    expandedAlbumId: '',
    analyzedOnly: false,
    libraryInfo: null,
    selectedTrackId: '',
    sectionKey: '',
    chordKey: '',
    consensus: null,
    lastStableRoot: '',
    lastPaletteRoot: '',
    lastPaletteAt: 0,
    master: 1.25,
    scanning: false,
    loadingTrack: false,
    loadSequence: 0,
    analysisEngines: [],
    analysisTask: null,
    analysisUnsubscribe: null,
    resolverUnsubscribe: null,
    generatorRenderUnsubscribe: null,
    localeUnsubscribe: null,
    updateTimer: 0,
    transportSerial: 0,
    pendingTransition: { type: 'init', serial: 0, priority: 0 },
    seekActive: false,
    xldValidationError: '',
    sectionEngine: localStorage.getItem('xins-fusion-section-engine') || 'auto',
    chordEngine: localStorage.getItem('xins-fusion-chord-engine') || 'consensus'
  };
  let refreshingResults=false, resultsRefreshPending=false;
  const RESUME_KEY='xins-fusion-resume';
  let resumeRecord=null,resumeHydrated=false,resumeSavedAt=0,removeResumeMetadata=null;
  function validResume(value){return value?.schemaVersion===1&&typeof value.trackId==='string'&&Number.isFinite(value.time)&&value.time>=0&&value.time<=86400?{...value,updatedAt:Number(value.updatedAt)||0}:null;}
  async function hydrateResume(){
    if(resumeHydrated)return;resumeHydrated=true;
    try{resumeRecord=validResume(JSON.parse(localStorage.getItem(RESUME_KEY)));}catch(_){}
    try{const result=await bridge?.loadListeningState?.(),disk=validResume(result?.value);if(disk&&(!resumeRecord||disk.updatedAt>=resumeRecord.updatedAt))resumeRecord=disk;}catch(_){}
  }
  function rememberPosition(force=false){
    if(state.loadingTrack||removeResumeMetadata||!trackById(state.selectedTrackId)||dom.audio.readyState<1||!Number.isFinite(dom.audio.currentTime)||dom.audio.currentTime<0)return;
    if(!force&&(dom.audio.paused||Date.now()-resumeSavedAt<5000))return;
    const time=dom.audio.ended||dom.audio.duration-dom.audio.currentTime<1?0:Math.min(86400,dom.audio.currentTime);
    const value={schemaVersion:1,trackId:state.selectedTrackId,time:Math.round(time*100)/100,updatedAt:Date.now()};resumeRecord=value;resumeSavedAt=Date.now();
    try{localStorage.setItem(RESUME_KEY,JSON.stringify(value));}catch(_){}
    Promise.resolve(bridge?.saveListeningState?.(value)).then(result=>{if(result?.ok&&resumeRecord===value)resumeRecord=validResume(result.value)||value;}).catch(()=>{});
  }
  const stemControls = window.XldStemControls?.create({
    bridge, audio: dom.audio, getTrack: () => trackById(state.selectedTrackId),
    getOriginalUrl: () => state.payload?.audioUrl,
    isBusy: () => ['starting', 'running', 'cancelling'].includes(state.analysisTask?.status),
    onTask: renderAnalysisTask, onSwitch: () => markTransportTransition('seek')
  }) || null;
  // The listening score (score-scene.js). It is told which track is loaded and nothing else.
  const scoreScene = window.XinScoreScene?.create({
    bridge, audio: dom.audio, stage: dom.stage, canvas: document.getElementById('scoreCanvas')
  }) || null;
  window.XinScoreSceneView = Object.freeze({
    status: () => scoreScene?.status() || null,
    refresh: () => scoreScene?.load(state.selectedTrackId),
    setLatency: milliseconds => scoreScene?.setLatency(milliseconds),
    makeLayers: () => scoreScene?.makeLayers(),
    hold: flag => scoreScene?.hold(flag)
  });
  const productControlDock =
    window.SmokeResonanceProductControlDock?.create({
      root: $('#productControlDock'),
      getMaster: () => Math.round(state.master * 100),
      setMaster: applyMaster,
      qualitySource: $('#qualityButton'),
      openXld: () => bridge?.analyzeInXld?.(state.selectedTrackId || '', document.documentElement.lang) ||
        Promise.resolve({ ok: false, error: 'desktop-bridge-unavailable' }),
      openGenerator: () => bridge?.openGeneratorEditor?.(document.documentElement.lang) ||
        Promise.resolve({ ok: false, error: 'desktop-bridge-unavailable' }),
      translate: uiText,
      subscribeLocale: listener => dynamicI18n?.subscribe(listener) || (() => {})
    }) || null;

  const rootPalettes = Object.freeze({
    C: 'solar', 'C#': 'ember', D: 'synthwave', 'D#': 'ultraviolet', E: 'toxic', F: 'moon',
    'F#': 'aurora', G: 'toxic', 'G#': 'ultraviolet', A: 'ember', 'A#': 'solar', B: 'moon'
  });
  const engineNames = Object.freeze({ 'chord-cqt': 'CQT', 'chord-cens': 'CENS', 'chord-hybrid': 'HYBRID', 'chord-btc': 'BTC', 'chord-chordmini': 'CHORDMINI', 'chord-consonance': 'ACE' });
  // Consensus vote weight per engine. ChordMini (BTC-CL student, same 170-class
  // vocabulary) is the primary chord engine since chords.2 and carries the highest
  // prior; BTC keeps its previous weight as the alternative; consonance-ACE reports a
  // root-softmax confidence that is not comparable, so it votes at 1 like the Librosa
  // template engines. A confident ChordMini leads unless the others strongly agree
  // on a different root. Must stay identical to HARMONY_PRIOR in xld-timeline-provider-adapter.js.
  const CHORD_ENGINE_PRIOR = Object.freeze({ 'chord-chordmini': 1.5, 'chord-btc': 1.35, 'chord-consonance': 1.0, 'chord-hybrid': 1.0, 'chord-cqt': 1.0, 'chord-cens': 1.0 });

  function formatClock(seconds) {
    const value = Number.isFinite(Number(seconds)) ? Math.max(0, Number(seconds)) : 0;
    return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
  }

  function engineId(result) {
    return String(result?.engine?.id || result?.engine || 'unknown');
  }

  function loadXldProvider(manifest, payload = {}, expectedTrack = null) {
    if (!xldTimelineProvider) return { ok: false, error: 'XLD_NOT_LOADED' };
    const identity = payload.identity || {};
    const result = xldTimelineProvider.load(manifest, {
      trackId: identity.trackId || expectedTrack?.id || manifest?.track?.id,
      sourcePath: identity.sourcePath ||
        payload.sourcePath ||
        manifest?.track?.source
    });
    state.xldValidationError = result.ok ? '' : result.error || '';
    xldProviderFrame = xldTimelineProvider.get();
    return result;
  }

  const transitionPriority = Object.freeze({
    init: 0,
    play: 1,
    resume: 1,
    pause: 1,
    stop: 1,
    seek: 2,
    loop: 2,
    'track-change': 4
  });

  function markTransportTransition(type) {
    const priority = transitionPriority[type] ?? 0;
    const transition = {
      type,
      serial: ++state.transportSerial,
      priority
    };
    if (
      !state.pendingTransition ||
      priority >= state.pendingTransition.priority
    ) {
      state.pendingTransition = transition;
    }
    return transition;
  }

  function consumeTransportTransition() {
    const transition = state.pendingTransition;
    state.pendingTransition = null;
    return transition
      ? { type: transition.type, serial: transition.serial }
      : null;
  }

  function updateXldProviderFrame(
    timeSeconds,
    durationSeconds,
    clock = {}
  ) {
    if (!xldTimelineProvider) return null;
    const actualDurationMs =
      Number.isFinite(Number(durationSeconds)) && Number(durationSeconds) > 0
        ? Number(durationSeconds) * 1000
        : null;
    if (actualDurationMs !== null) {
      xldTimelineProvider.setPlaybackDuration(actualDurationMs);
    }
    xldProviderFrame = xldTimelineProvider.frameAt(
      Number.isFinite(Number(timeSeconds))
        ? Math.max(0, Number(timeSeconds)) * 1000
        : null,
      {
        active: Boolean(state.manifest),
        clock,
        transport: {
          mode: 'internal',
          state: dom.audio.paused ? 'paused' : 'playing',
          trackId: state.selectedTrackId || null,
          durationMs: actualDurationMs,
          epoch: 0
        },
        structureEngineId: state.sectionEngine,
        harmonyEngineId: state.chordEngine
      }
    );
    return xldProviderFrame;
  }

  function heuristicMeta(confidence, engineId) {
    return {
      sourceProvider: 'realtime.heuristic',
      providerDetail: {
        engineId,
        providerVersion: '2.3.0-shadow'
      },
      confidence: Math.max(
        0,
        Math.min(.55, Number(confidence) || 0)
      ),
      available: true,
      ageMs: 0,
      fallbackReason: null
    };
  }

  // Raw acoustic fields only. Section labels, states and chords come from XLD, never from here.
  function buildRealtimeHeuristicFrame(clock, transport) {
    const frame = {
      contract: 'xin.music-frame/1',
      contractVersion: 1,
      clock,
      transport,
      continuous: {},
      states: {},
      events: {},
      labels: {},
      meta: {}
    };
    if (transport.state !== 'playing') return frame;
    const acoustic = window.SmokeResonanceFeatures?.get() || {};
    const unit = value => Math.max(0, Math.min(1, Number(value) || 0));
    frame.continuous = {
      dynamicRange: unit(acoustic.dynamicRange),
      spectralDensity: unit(acoustic.density),
      flatness: unit(acoustic.flatness),
      sharpness: unit(acoustic.sharpness)
    };
    for (const featureId of Object.keys(frame.continuous)) {
      frame.meta[featureId] = heuristicMeta(.45, 'xml-realtime-features');
    }
    // The Generator reads sectionDrive and buildEnergy, which the XLD adapter does not
    // supply. They follow the XLD section under the playhead; with no section they are
    // left out and resolve to 0.
    const structure = structureAt(Number(dom.audio.currentTime) || 0);
    if (structure) {
      const section = sectionSignals(structure.segment);
      frame.continuous.sectionDrive = unit(section.drive);
      frame.continuous.buildEnergy = unit(section.build);
      frame.meta.sectionDrive = heuristicMeta(.5, 'xld-section-signals');
      frame.meta.buildEnergy = heuristicMeta(.5, 'xld-section-signals');
    }
    return frame;
  }

  function updateResolverShadow(clock = {}) {
    if (!musicFeatureResolver) return null;
    const timeSeconds = Number.isFinite(dom.audio.currentTime)
      ? Math.max(0, Number(dom.audio.currentTime))
      : null;
    const durationSeconds = Number.isFinite(dom.audio.duration) &&
      dom.audio.duration > 0
      ? Number(dom.audio.duration)
      : null;
    updateXldProviderFrame(timeSeconds, durationSeconds, clock);
    const transport = {
      mode: 'internal',
      state: dom.audio.seeking
        ? 'seeking'
        : dom.audio.paused
          ? 'paused'
          : 'playing',
      trackId: state.selectedTrackId || null,
      mediaTimeMs: timeSeconds === null
        ? null
        : timeSeconds * 1000,
      durationMs: durationSeconds === null
        ? null
        : durationSeconds * 1000
    };
    const xldCursor = timeSeconds !== null
      ? xldTimelineProvider?.cursorAt(
          timeSeconds * 1000,
          {
            structureEngineId: state.sectionEngine,
            harmonyEngineId: state.chordEngine
          }
        )
      : null;
    const realtimeFrame =
      window.SmokeResonanceRealtimeFrame?.get() || null;
    const transportTransition = consumeTransportTransition();
    unifiedMusicFrame = musicFeatureResolver.resolve({
      clock,
      transport,
      transition: transportTransition,
      realtimeFrame: realtimeFrame,
      xldFrame: xldProviderFrame,
      xldCursor,
      heuristicFrame: buildRealtimeHeuristicFrame(clock, transport)
    });
    const generatorReport =
      generatorRuntimeShadow?.evaluate(
        unifiedMusicFrame,
        clock,
        { render: false }
      ) || null;
    window.SmokeResonanceMaterialView?.acceptGeneratorMapping(
      clock.frameIndex,
      generatorReport
    );
    if (transportTransition) {
      const resetReason = transportTransition.type;
      window.SmokeResonanceMaterialView?.reset(resetReason);
    }
    return unifiedMusicFrame;
  }

  function renderGeneratorFrame(clock) {
    generatorRuntimeShadow?.renderCurrentSource();
    const generatorReport = generatorRuntimeShadow?.get() || null;
    const generatorRuntimeStatus =
      generatorRuntimeShadow?.status() || null;
    window.SmokeResonanceMaterialView?.observeGlitch(
      clock.frameIndex,
      generatorReport
    );
    frameOwnershipMonitor?.observe(clock, generatorRuntimeStatus);
    generatorOutputController?.update(
      clock,
      generatorRuntimeStatus,
      generatorSourceAdapter?.status() || null,
      frameOwnershipMonitor?.get() || null,
      visualGlitch?.get()?.enabled !== false
    );
  }

  function segmentAt(segments, time) {
    if (!Array.isArray(segments)) return null;
    return segments.find(segment => time >= Number(segment.start || 0) && time < Number(segment.end || 0))
      || (segments.length && time >= Number(segments.at(-1).start || 0) ? segments.at(-1) : null);
  }

  function parseRoot(label) {
    const match = String(label || '').match(/^([A-G])([#b]?)/);
    if (!match) return '';
    const root = `${match[1]}${match[2] || ''}`;
    return ({ Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#' })[root] || root;
  }

  // --- section signals (start) ---
  // The section under the playhead drives sectionDrive / buildEnergy. A section is looked up by its name: the
  // bridge manifest's segments carry `name`, made by XLD's core/sections.cjs (XML's main process fills it in for
  // manifests written before the field existed), so a mid-song intro reads as the interlude it is shown as.
  // Manual tags and segments without a name are looked up by their label. Whole words only, a trailing number
  // ignored (主歌 2 -> 主歌). 间奏 / Interlude stays on the default row, where SongFormer's `inst` has always been.
  const SECTION_SIGNALS = {
    drop: { drive: .18, climax: 0, drop: 1, build: 0 },
    climax: { drive: 1, climax: 1, drop: 0, build: .2 },
    build: { drive: .72, climax: .16, drop: 0, build: 1 },
    plain: { drive: .5, climax: 0, drop: 0, build: .22 },
    quiet: { drive: .22, climax: 0, drop: .28, build: 0 },
    other: { drive: .36, climax: 0, drop: 0, build: .12 }
  };
  const SECTION_WORDS = {
    drop: ['抽空', '留白', 'breakdown', 'silence', 'sparse', 'empty'],
    climax: ['副歌', 'chorus', '高潮', '全奏', 'climax', 'tutti'],
    build: ['导歌', 'pre-chorus', 'prechorus', '桥段', 'bridge', 'solo', 'instrumental', '发展', '推进', 'build'],
    plain: ['主歌', 'verse', '一般', '主体', 'full'],
    quiet: ['引子', 'intro', '尾奏', 'outro', 'end', '安静', '稀疏']
  };
  const SECTION_KIND = new Map(Object.entries(SECTION_WORDS).flatMap(([kind, words]) => words.map(word => [word, kind])));

  function sectionSignals(segment) {
    const text = typeof segment === 'string' ? segment : (segment?.name || segment?.label || '');
    const key = String(text).trim().toLowerCase().replace(/\s+\d+$/, '');
    return SECTION_SIGNALS[SECTION_KIND.get(key) || 'other'];
  }
  // --- section signals (end) ---

  function structureAt(time) {
    if (!state.manifest) return null;
    const manual = segmentAt(state.manifest.manualTags, time);
    if (manual) return { segment: manual, key: `manual:${manual.id || manual.start}` };
    const all = Array.isArray(state.manifest.analyses) ? state.manifest.analyses : [];
    let analyses;
    if (state.sectionEngine && state.sectionEngine !== 'auto' && all.some(a => engineId(a) === state.sectionEngine)) {
      analyses = all.filter(a => engineId(a) === state.sectionEngine);
    } else {
      const priority = ['songformer', 'msaf', 'msaf-cnmf', 'msaf-sf', 'msaf-foote'];
      const rank = value => {
        const index = priority.indexOf(engineId(value));
        return index < 0 ? priority.length : index;
      };
      analyses = [...all].sort((a, b) => rank(a) - rank(b));
    }
    for (const analysis of analyses) {
      const segment = segmentAt(analysis.segments, time);
      if (segment) return { segment, key: `${engineId(analysis)}:${segment.start}:${segment.label}` };
    }
    return null;
  }

  function harmonyAt(time) {
    const harmony = Array.isArray(state.manifest?.harmony) ? state.manifest.harmony : [];
    const entries = harmony.map(result => {
      const id = engineId(result);
      const segment = segmentAt(result.segments, time);
      return {
        id,
        label: segment?.label || '—',
        root: parseRoot(segment?.label),
        confidence: Number(segment?.confidence) || 0
      };
    });
    if (state.chordEngine && state.chordEngine !== 'consensus') {
      const picked = entries.find(entry => entry.id === state.chordEngine);
      if (picked) {
        if (picked.root) state.lastStableRoot = picked.root;
        return { label: picked.label, root: picked.root, confidence: picked.confidence };
      }
    }
    let label = '—';
    let root = '';
    let confidence = 0;
    // Confidence-weighted reconciliation across ALL engines (incl. BTC). Each
    // engine votes its root weighted by confidence × prior; the winning root's
    // strongest engine supplies the label. BTC's high prior + real posterior
    // let it lead, while agreement from the Librosa engines lifts confidence.
    const weightOf = entry => entry.confidence * (CHORD_ENGINE_PRIOR[entry.id] || 1);
    const candidates = entries.filter(entry => entry.root);
    if (candidates.length) {
      const tally = new Map();
      for (const entry of candidates) {
        const bucket = tally.get(entry.root) || { sum: 0, members: [] };
        bucket.sum += weightOf(entry);
        bucket.members.push(entry);
        tally.set(entry.root, bucket);
      }
      let bestRoot = null;
      let best = null;
      let total = 0;
      for (const [candidateRoot, bucket] of tally) {
        total += bucket.sum;
        if (!best || bucket.sum > best.sum) { best = bucket; bestRoot = candidateRoot; }
      }
      const lead = best.members.slice().sort((a, b) => weightOf(b) - weightOf(a))[0];
      const agree = best.members.length;
      const dominance = total > 0 ? best.sum / total : 0;
      root = bestRoot;
      label = lead.label && lead.root ? lead.label : bestRoot;
      confidence = Math.min(0.98, lead.confidence * (0.72 + 0.28 * dominance) + 0.12 * (1 - 1 / Math.max(1, agree)));
      state.lastStableRoot = root;
    } else if (state.lastStableRoot && entries.length) {
      root = state.lastStableRoot;
      label = `${root} · HOLD`;
      confidence = .22;
    }
    return { label, root, confidence };
  }

  function setOpen(open) {
    if (open) {
      ['#glitchRackClose']
        .map(selector => document.querySelector(selector))
        .filter(Boolean)
        .forEach(button => button.click());
    }
    dom.panel.classList.toggle('is-open', open);
    dom.panel.setAttribute('aria-hidden', String(!open));
    dom.button.setAttribute('aria-expanded', String(open));
  }

  // FX master, 0-200 %. The slider that shows it lives in the settings drawer (product-control-dock.js).
  // Moving the slider switches FX on above 0 and off at 0. At start-up the saved strength is put
  // back without touching on / off: app.js has already restored that from the FX settings.
  function applyMaster(value, restoring = false) {
    const percent = Math.max(0, Math.min(200, Number(value) || 0));
    state.master = percent / 100;
    if (restoring) {
      visualGlitch?.set({ fxStrength: state.master });
      return;
    }
    localStorage.setItem('xins-fusion-master', String(percent));
    visualGlitch?.set({ enabled: percent > 0, fxStrength: state.master });
  }

  // A saved 0 is 0; only a profile that never saved a strength starts at 125 %.
  function savedMasterPercent(raw) {
    if (raw === null || raw === undefined || String(raw).trim() === '') return 125;
    const value = Number(raw);
    return Number.isFinite(value) ? Math.max(0, Math.min(200, value)) : 125;
  }

  function applyChordColor(consensus) {
    if (!dom.autoColor.checked || !consensus?.root || consensus.confidence < .32) return;
    const now = performance.now();
    if (state.lastPaletteRoot === consensus.root || now - state.lastPaletteAt < 1200) return;
    const palette = rootPalettes[consensus.root];
    if (!palette) return;
    visualColor?.palette(palette);
    state.lastPaletteRoot = consensus.root;
    state.lastPaletteAt = now;
  }

  function populateEngineSelectors() {
    const analyses = Array.isArray(state.manifest?.analyses) ? state.manifest.analyses : [];
    const harmony = Array.isArray(state.manifest?.harmony) ? state.manifest.harmony : [];
    if (dom.sectionEngineSelect) {
      const options = [`<option value="auto">${uiText('fusion.engine.autoPriority', '自动 · 优先级')}</option>`].concat(
        analyses.map(a => `<option value="${engineId(a)}">${a.engine?.name || engineId(a)}</option>`));
      dom.sectionEngineSelect.innerHTML = options.join('');
      if (!analyses.some(a => engineId(a) === state.sectionEngine)) state.sectionEngine = 'auto';
      dom.sectionEngineSelect.value = state.sectionEngine;
    }
    if (dom.chordEngineSelect) {
      const options = [`<option value="consensus">${uiText('fusion.engine.weightedConsensus', '加权共识 · ChordMini+BTC+ACE+CQT+CENS+Hybrid')}</option>`].concat(
        harmony.map(h => {
          const id = engineId(h);
          return `<option value="${id}">${h.engine?.name || engineNames[id] || id.toUpperCase()}</option>`;
        }));
      dom.chordEngineSelect.innerHTML = options.join('');
      if (!harmony.some(h => engineId(h) === state.chordEngine)) state.chordEngine = 'consensus';
      dom.chordEngineSelect.value = state.chordEngine;
    }
  }

  function updateAnalysisControls() {
    if (!dom.analysisCard) return;
    const task = state.analysisTask;
    const busy = Boolean(task && ['starting', 'running', 'cancelling'].includes(task.status));
    const selected = trackById(state.selectedTrackId);
    if (busy || selected?.title) {
      clearUiBinding(dom.analysisTitle);
      dom.analysisTitle.textContent = busy ? `${task.trackTitle} · ${task.engineName}` : selected.title;
    } else bindUiText(dom.analysisTitle, 'fusion.runtime.noTrackAnalysis', '选择曲目后读取分析结果');
    dom.analysisRun.disabled = busy || !selected || !dom.analysisEngine.value;
    dom.analysisCancel.disabled = !busy || !task?.cancellable;
    dom.openXldLab.disabled = !selected || busy;
    dom.resultsRefresh.disabled = !selected || busy || refreshingResults;
    stemControls?.sync();
  }

  function renderAnalysisTask(task) {
    state.analysisTask = task || null;
    const status = task?.status || 'idle';
    const progress = Math.round(Math.max(0, Math.min(1, Number(task?.progress) || 0)) * 100);
    dom.analysisCard.dataset.state = status;
    if(['starting','running','cancelling'].includes(status))dom.analysisOptions.open=true;
    dom.analysisProgress.style.width = `${progress}%`;
    dom.analysisCard.querySelector('.fusion-analysis-card__progress')?.setAttribute('aria-valuenow', String(progress));
    dom.analysisPercent.textContent = task ? `${progress}%` : '—';
    const statusKeys = {
      starting: 'fusion.runtime.analysisStarting',
      running: 'fusion.runtime.analysisRunning',
      cancelling: 'fusion.runtime.analysisCancelling',
      complete: 'fusion.runtime.analysisComplete',
      completed: 'fusion.runtime.analysisComplete',
      failed: 'fusion.runtime.analysisFailed',
      cancelled: 'fusion.runtime.analysisCancelled'
    };
    const statusKey = statusKeys[status];
    dom.analysisStatus.title = task?.message || ''; 
    if (status === 'failed' && task?.message) { clearUiBinding(dom.analysisStatus); dom.analysisStatus.textContent = task.message; }
    else if (status === 'complete' || status === 'completed') {
      const engine = task?.engineName || task?.engine || '';
      if (['demucs-6s','bs-roformer-sw'].includes(task?.engine)) bindUiText(dom.analysisStatus, 'stems.complete', '分轨完成');
      else if (['basic-pitch','guitar-gaps','piano-highres','bass-highres','yourmt3-plus','drums-adtof','muscriptor-medium','muscriptor-large','strings-muscriptor-medium','strings-muscriptor-large','drums-muscriptor-medium','drums-muscriptor-large'].includes(task?.engine)) bindUiText(dom.analysisStatus, 'midi.complete', `${engine} 转谱完成`, { engine });
      else if (engine) bindUiText(dom.analysisStatus, 'fusion.runtime.engineComplete', `${engine} 分析完成`, { engine });
      else bindUiText(dom.analysisStatus, 'fusion.runtime.analysisComplete', '分析完成');
    }
    else if (statusKey) bindUiText(dom.analysisStatus, statusKey, task?.message || '分析由 XLD 提供，返回时自动更新结果', { progress });
    else bindUiText(dom.analysisStatus, 'fusion.runtime.analysisIdle', '分析由 XLD 提供，返回时自动更新结果');
    updateAnalysisControls();
  }

  async function loadAnalysisEngines() {
    if (!bridge?.analysisEngines) return;
    dom.analysisEngine.disabled = true;
    dom.analysisEngine.innerHTML = `<option value="">${uiText('fusion.runtime.probing', '正在探测分析器…')}</option>`;
    let engines = [];
    try { engines = await bridge.analysisEngines(); } catch (_) {}
    state.analysisEngines = Array.isArray(engines) ? engines : [];
    dom.analysisEngine.replaceChildren();
    const families = [
      ['msaf', 'STRUCTURE · CPU'],
      ['ai', 'STRUCTURE · AI'],
      ['harmony', 'HARMONY']
    ];
    for (const [family, label] of families) {
      const items = state.analysisEngines.filter(engine => engine.family === family || (family === 'msaf' && String(engine.id).startsWith('msaf')));
      if (!items.length) continue;
      const group = document.createElement('optgroup');
      group.label = label;
      for (const engine of items) {
        const option = document.createElement('option');
        option.value = engine.id;
        option.textContent = `${engine.name || engine.id}${engine.resource ? ` · ${engine.resource}` : ''}`;
        option.disabled = engine.available === false;
        group.append(option);
      }
      dom.analysisEngine.append(group);
    }
    const available = state.analysisEngines.filter(engine => engine.available !== false);
    const saved = localStorage.getItem('xins-fusion-analysis-engine');
    const preferred = available.find(engine => engine.id === saved)
      || available.find(engine => engine.id === 'msaf-sf')
      || available[0];
    dom.analysisEngine.disabled = !preferred;
    if (preferred) dom.analysisEngine.value = preferred.id;
    else dom.analysisEngine.innerHTML = `<option value="">${uiText('fusion.runtime.noAnalyzer', '没有可用的分析运行时')}</option>`;
    updateAnalysisControls();
  }

  async function runSelectedAnalysis() {
    const track = trackById(state.selectedTrackId);
    const engine = dom.analysisEngine.value;
    if (!track || !engine || !bridge?.runAnalysis || ['starting', 'running', 'cancelling'].includes(state.analysisTask?.status)) return;
    const engineInfo = state.analysisEngines.find(item => item.id === engine);
    renderAnalysisTask({
      trackId: track.id,
      trackTitle: track.title,
      engine,
      engineName: engineInfo?.name || engine,
      status: 'starting',
      progress: 0,
      message: uiText('fusion.runtime.starting', '正在启动分析器'),
      cancellable: true
    });
    let result;
    try {
      result = await bridge.runAnalysis(track.id, engine, {
        engineName: engineInfo?.name || engine,
        auto: engine === 'songformer'
      });
    } catch (_) {
      result = { ok: false, error: 'ipc-failed' };
    }
    if (result?.ok) {
      if (state.selectedTrackId === track.id) {
        state.manifest = result.manifest;
        state.bridgePath = result.manifestPath || state.bridgePath;
        if (state.payload) {
          state.payload.manifest = result.manifest;
          state.payload.filePath = state.bridgePath;
        }
        loadXldProvider(result.manifest, state.payload || {}, track);
        dom.reveal.disabled = false;
        dom.linkCard.dataset.state = 'linked';
        bindUiText(dom.status, 'fusion.runtime.timelineUpdated', `${engineInfo?.name || engine} 分析完成 · 时间线已热更新`, { engine: engineInfo?.name || engine });
        populateEngineSelectors();
        updateTimeline();
      }
      await scanLibrary({ restore: false });
      renderAnalysisTask(result.task);
      return;
    }
    const errors = {
      'analysis-busy': '已有其他曲目正在分析',
      'runtime-missing': '分析运行时未安装',
      'analysis-cancelled': '分析已取消',
      'track-missing': '曲目文件已移动',
      'engine-unavailable': '当前分析器不可用'
    };
    renderAnalysisTask(result?.task || {
      trackId: track.id,
      trackTitle: track.title,
      engine,
      engineName: engineInfo?.name || engine,
      status: result?.error === 'analysis-cancelled' ? 'cancelled' : 'failed',
      progress: 0,
      message: errors[result?.error] || result?.detail || '分析失败',
      cancellable: false
    });
  }

  async function refreshCurrentResults(manual=false) {
    if(refreshingResults){resultsRefreshPending=true;return false;}
    const track=trackById(state.selectedTrackId);
    if(!track || !state.payload || state.loadingTrack || !bridge?.refreshTrack ||
        ['starting','running','cancelling'].includes(state.analysisTask?.status))return false;
    const revision=state.loadSequence;
    refreshingResults=true;updateAnalysisControls();
    try {
      const payload=await bridge.refreshTrack(track.id);
      if(revision!==state.loadSequence || track.id!==state.selectedTrackId)return false;
      if(!payload?.ok){
        if(manual)bindUiText(dom.analysisStatus,'fusion.resultsFailed','未能更新，当前结果已保留');
        return false;
      }
      const changed=JSON.stringify(payload.manifest)!==JSON.stringify(state.manifest);
      if(changed){
        if(!loadXldProvider(payload.manifest,payload,track).ok)return false;
        state.manifest=payload.manifest;
        state.sectionKey='';state.chordKey='';
        const analyses=payload.manifest.analyses || [],harmony=payload.manifest.harmony || [];
        Object.assign(track,{hasStructure:analyses.some(value=>value.segments?.length),hasHarmony:harmony.some(value=>value.segments?.length),
          structureEngines:analyses.map(engineId),harmonyEngines:harmony.map(engineId),duration:Number(payload.manifest.timing?.duration)||0});
        for(const album of state.albums){
          const item=album.tracks.find(item=>item.id===track.id);if(item)Object.assign(item,track);
          album.analyzedCount=album.tracks.filter(item=>item.hasStructure || item.hasHarmony).length;
        }
        if(state.libraryInfo){
          const info=state.libraryInfo;info.analyzedCount=state.library.filter(item=>item.hasStructure || item.hasHarmony).length;
          bindUiText(dom.libraryMeta,'fusion.runtime.libraryMeta',`${info.albumCount} 张专辑 · ${info.trackCount} 首 · ${info.analyzedCount} 首已有分析`,{albums:info.albumCount,tracks:info.trackCount,analyzed:info.analyzedCount});
        }
        renderLibrary();
        populateEngineSelectors();updateTimeline();
      }
      state.payload={...state.payload,...payload};state.bridgePath=payload.filePath || payload.sourcePath || '';
      await stemControls?.refresh();
      if(changed || manual)scoreScene?.load(track.id);
      if(revision!==state.loadSequence || track.id!==state.selectedTrackId)return false;
      if(changed || manual)bindUiText(dom.analysisStatus,'fusion.resultsUpdated','已更新 XLD 结果');
      return true;
    } catch(_){if(manual && track.id===state.selectedTrackId)bindUiText(dom.analysisStatus,'fusion.resultsFailed','未能更新，当前结果已保留');return false;}
    finally{refreshingResults=false;updateAnalysisControls();if(resultsRefreshPending){resultsRefreshPending=false;queueMicrotask(()=>refreshCurrentResults());}}
  }

  async function openCurrentInXld() {
    const track = trackById(state.selectedTrackId);
    if (!track || !bridge?.analyzeInXld) return;
    dom.openXldLab.disabled = true;
    const result = await bridge.analyzeInXld(track.id, document.documentElement.lang).catch(() => ({ ok: false }));
    bindUiText(
      dom.analysisStatus,
      result?.ok ? 'fusion.runtime.openedLab' : 'fusion.runtime.openLabFailed',
      result?.ok ? `已在 XLD 中打开《${track.title}》` : '无法打开 XLD',
      result?.ok ? { track: track.title } : undefined
    );
    updateAnalysisControls();
  }

  function updateTimeline() {
    rememberPosition();
    if (!state.manifest) return;
    const time = Number(dom.audio.currentTime) || 0;
    const audioDuration = Number(dom.audio.duration);
    const duration = audioDuration || Number(state.manifest.timing?.duration) || 0;
    const structure = structureAt(time);
    const consensus = harmonyAt(time);
    state.consensus = consensus;
    if (structure?.key && structure.key !== state.sectionKey) {
      state.sectionKey = structure.key;
      visualTimeline?.pulse(1);
    }
    const chordKey = consensus.root ? `${consensus.root}:${consensus.label}` : '';
    if (chordKey && chordKey !== state.chordKey) {
      if (state.chordKey) visualTimeline?.chordPulse(Math.max(.4, consensus.confidence));
      state.chordKey = chordKey;
    }
    const sectionLabel = structure?.segment?.name || structure?.segment?.label || '—';
    const section = structure ? sectionSignals(structure.segment) : { drive: 0, climax: 0, drop: 0, build: 0 };
    visualTimeline?.set({
      connected: true,
      section: section.drive,
      climax: section.climax,
      drop: section.drop,
      build: section.build,
      sectionLabel,
      chord: consensus.label,
      chordConfidence: consensus.confidence
    });
    applyChordColor(consensus);
    dom.time.textContent = formatClock(time);
    dom.duration.textContent = formatClock(duration);
    dom.seek.max = String(Math.max(.01, duration));
    if (!dom.seek.matches(':active')) dom.seek.value = String(Math.min(duration, time));
  }

  function trackById(id) {
    return state.library.find(track => track.id === id) || null;
  }

  function setHome(open){
    if(open){rememberPosition(true);setOpen(false);window.XinShell?.setSettings(false);for(const id of ['paletteClose','glitchClose'])document.getElementById(id)?.click();renderHome();}
    const focused=dom.welcome.contains(document.activeElement);dom.welcome.classList.toggle('is-gone',!open);dom.welcome.inert=!open;
    document.getElementById('xlHome')?.setAttribute('aria-expanded',String(open));
    if(!open&&focused)document.getElementById('xlHome')?.focus();
  }
  function renderHome(){
    const resume=document.getElementById('homeResume'),list=document.getElementById('homeAnalyzed');if(!resume||!list)return;
    resume.replaceChildren();list.replaceChildren();
    const current=trackById(state.selectedTrackId),saved=trackById(resumeRecord?.trackId),hasCurrent=current&&dom.audio.readyState>0&&dom.audio.currentTime>0;
    const target=hasCurrent?current:saved,time=hasCurrent?dom.audio.currentTime:resumeRecord?.time||0;
    const card=(track,detail,action)=>{const button=document.createElement('button');button.type='button';button.className='home-track';button.dataset.homeTrackId=track.id;const title=document.createElement('strong'),meta=document.createElement('span');title.textContent=track.title;meta.textContent=detail;button.append(title,meta);button.addEventListener('click',action);return button;};
    if(target)resume.append(card(target,`${target.artist} · ${uiText('home.at','从 {time} 继续',{time:formatClock(time)})}`,async()=>{if(state.selectedTrackId===target.id&&dom.audio.readyState>0){setHome(false);if(dom.audio.paused)await togglePlayback();}else await loadTrack(target.id,{autoplay:true,restorePosition:true});}));
    else{const p=document.createElement('p');p.className='home-note';p.textContent=uiText('home.noResume','还没有续听位置，从曲库选一首开始。');resume.append(p);}
    const analyzed=state.library.filter(t=>t.hasStructure||t.hasHarmony).slice(0,4);
    for(const track of analyzed)list.append(card(track,`${track.artist} · ${track.album}`,()=>loadTrack(track.id,{autoplay:true})));
    if(!analyzed.length){const p=document.createElement('p');p.className='home-note';p.textContent=uiText('home.noAnalysis','暂时没有段落或和弦结果，也可以先从曲库听歌。');list.append(p);}
    const intro=document.getElementById('homeIntro');intro.textContent=state.scanning?uiText('home.scanning','正在读曲库…'):!state.library.length?uiText('home.empty','先选一个音乐文件夹。没有分析结果也能播放和看频谱。'):uiText('welcome.body','音符、和弦、段落跟着音乐走。');
    const choose=document.getElementById('homeChooseLibrary');choose.disabled=state.scanning;choose.classList.toggle('home-primary',!state.library.length);
    dom.welcomeLoad.disabled=state.scanning;dom.welcomeLoad.classList.toggle('home-primary',!!state.library.length);dom.welcomeLoad.textContent=uiText('home.openLibrary','打开曲库');
  }

  function trackMatchesQuery(track, query) {
    return !query || `${track.title} ${track.artist} ${track.album}`.toLowerCase().includes(query);
  }

  function renderTrackRow(track) {
    const row = document.createElement('div');
    row.className = `fusion-library-track${track.id === state.selectedTrackId ? ' is-active' : ''}`;
    row.dataset.trackId = track.id;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'fusion-library-track__main';
    button.title=uiText('fusion.runtime.selectPlayTitle','单击选择 · 双击播放');
    const number = document.createElement('i');
    number.textContent = String(track.number || 0).padStart(2, '0');
    const copy = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = track.title;
    const meta = document.createElement('small');
    meta.textContent = `${track.artist}`;
    copy.append(title, meta);
    const details = document.createElement('span');
    details.className = 'fusion-library-track__details';
    const analysis = document.createElement('span');
    analysis.className = 'fusion-library-track__state';
    const kind = track.hasStructure ? (track.hasHarmony ? 'both' : 'sections') : (track.hasHarmony ? 'chords' : 'none');
    analysis.dataset.analysisState = kind;
    const states = {both: ['library.both', '段落 · 和弦'], sections: ['library.sections', '有段落'], chords: ['library.chords', '有和弦'], none: ['library.none', '暂无段落/和弦']};
    analysis.textContent = uiText(...states[kind]);
    const playing = document.createElement('span');
    playing.className = 'fusion-library-track__play-state';
    playing.hidden = track.id !== state.selectedTrackId;
    playing.textContent = uiText(!dom.audio.paused ? 'library.playing' : 'library.selected', !dom.audio.paused ? '正在播放' : '已选择');
    details.append(analysis, playing);copy.append(details);
    button.append(number, copy);
    button.addEventListener('click', () => loadTrack(track.id));
    button.addEventListener('dblclick', async () => { await loadTrack(track.id); await togglePlayback(); });
    row.append(button);
    if (bridge?.analyzeInXld) {
      const analyze = document.createElement('button');
      analyze.type = 'button';
      analyze.className = 'fusion-library-track__analyze';
      analyze.title=uiText('fusion.runtime.analyzeTitle','在 XLD 中分析此曲');
      bindUiText(
        analyze,
        'library.analyze',
        '在 XLD 分析 ↗'
      );
      analyze.addEventListener('click', async event => {
        event.stopPropagation();
        await loadTrack(track.id);
        await openCurrentInXld();
      });
      row.append(analyze);
    }
    return row;
  }

  // Update only the active-track highlight, without rebuilding the list — so
  // selecting a track never resets the scroll position.
  function updateLibraryActive() {
    dom.libraryList.querySelectorAll('.fusion-library-track').forEach(row => {
      const selected = row.dataset.trackId === state.selectedTrackId;
      row.classList.toggle('is-active', selected);
      const label = row.querySelector('.fusion-library-track__play-state');
      if(label){label.hidden=!selected;label.textContent=uiText(!dom.audio.paused?'library.playing':'library.selected',!dom.audio.paused?'正在播放':'已选择');}
    });
  }

  function renderLibrary() {
    const prevScroll = dom.libraryList.scrollTop; // preserve scroll across rebuilds (expand/search/filter)
    const query = dom.librarySearch.value.trim().toLowerCase();
    // Locale bindings otherwise retain removed album/track rows and their listeners.
    for(const node of dom.libraryList.querySelectorAll('*'))dynamicI18n?.unbind?.(node);
    dom.libraryList.replaceChildren();
    const albums = Array.isArray(state.albums) ? state.albums : [];
    // Fallback to the legacy flat list if the backend didn't return albums.
    if (!albums.length) {
      const flat = state.library.filter(track => trackMatchesQuery(track, query) && (!state.analyzedOnly || track.hasStructure || track.hasHarmony));
      if (!flat.length) {
        const empty = document.createElement('p');
        empty.className = 'fusion-library-empty';
        bindUiText(
          empty,
          state.library.length ? 'fusion.runtime.noMatches' : 'fusion.runtime.noAudio',
          state.library.length ? '没有匹配的曲目' : '未发现可播放音频'
        );
        dom.libraryList.append(empty);
        return;
      }
      const fragment = document.createDocumentFragment();
      flat.forEach(track => fragment.append(renderTrackRow(track)));
      dom.libraryList.append(fragment);
      dom.libraryList.scrollTop = prevScroll;
      return;
    }

    const fragment = document.createDocumentFragment();
    let shown = 0;
    for (const album of albums) {
      const albumMatches = !query || `${album.title} ${album.artist}`.toLowerCase().includes(query);
      const visibleTracks = album.tracks.filter(track =>
        (albumMatches || trackMatchesQuery(track, query)) && (!state.analyzedOnly || track.hasStructure || track.hasHarmony));
      if (!visibleTracks.length) continue;
      shown += visibleTracks.length;
      const containsSelected = album.tracks.some(track => track.id === state.selectedTrackId);
      // Expand only when the user opened it or when searching. We deliberately
      // do NOT force-expand the playing album, so clicking around other albums
      // never snaps the view back. Use 「定位」 to jump to the playing track.
      const expanded = state.expandedAlbumId === album.id || Boolean(query);

      const group = document.createElement('div');
      group.className = `fusion-library-album${expanded ? ' is-open' : ''}${containsSelected ? ' has-active' : ''}`;
      const header = document.createElement('button');
      header.type = 'button';
      header.className = 'fusion-library-album__head';
      header.innerHTML = `<span class="fusion-library-album__caret">${expanded ? '▾' : '▸'}</span>`;
      const cover = document.createElement('span');
      cover.className = 'fusion-library-album__cover';
      if (album.coverUrl) cover.style.backgroundImage = `url("${album.coverUrl}")`;
      else cover.textContent = '♪';
      const copy = document.createElement('span');
      copy.className = 'fusion-library-album__copy';
      const albumTitle = document.createElement('strong');
      albumTitle.textContent = album.title;
      const albumMeta = document.createElement('small');
      const analyzed = album.analyzedCount
        ? uiText('fusion.runtime.analyzedSuffix', ` · ${album.analyzedCount} 已分析`, { count: album.analyzedCount })
        : '';
      bindUiText(
        albumMeta,
        'fusion.runtime.albumMeta',
        `${album.artist} · ${album.trackCount} 首${analyzed}`,
        { artist: album.artist, tracks: album.trackCount, analyzed }
      );
      copy.append(albumTitle, albumMeta);
      header.append(cover, copy);
      header.addEventListener('click', () => {
        state.expandedAlbumId = state.expandedAlbumId === album.id ? '' : album.id;
        renderLibrary();
      });
      group.append(header);
      if (expanded) {
        const list = document.createElement('div');
        list.className = 'fusion-library-album__tracks';
        visibleTracks.forEach(track => list.append(renderTrackRow(track)));
        group.append(list);
      }
      fragment.append(group);
    }
    if (!shown) {
      const empty = document.createElement('p');
      empty.className = 'fusion-library-empty';
      bindUiText(
        empty,
        state.library.length ? 'fusion.runtime.noMatches' : 'fusion.runtime.noAudio',
        state.library.length ? '没有匹配的曲目' : '未发现可播放音频'
      );
      dom.libraryList.append(empty);
      return;
    }
    dom.libraryList.append(fragment);
    dom.libraryList.scrollTop = prevScroll;
  }

  // Explicit "jump to the track that's playing" — the only path that auto-expands
  // + scrolls. Bound to the 「定位」 button so normal browsing never snaps back.
  function locateCurrentTrack() {
    if (!state.selectedTrackId) return;
    const album = (state.albums || []).find(item => item.tracks.some(track => track.id === state.selectedTrackId));
    if (album) state.expandedAlbumId = album.id;
    renderLibrary();
    requestAnimationFrame(() => dom.libraryList.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' }));
  }

  async function scanLibrary({ restore = true } = {}) {
    if (!bridge?.scanLibrary || state.scanning) return false;
    state.scanning = true;
    renderHome();
    dom.refresh.disabled = true;
    bindUiText(dom.libraryMeta, 'fusion.runtime.libraryScanning', '正在扫描本地唱片…');
    let result;
    try { result = await bridge.scanLibrary(); } catch (_) { result = { ok: false, error: 'ipc-failed' }; }
    state.scanning = false;
    dom.refresh.disabled = false;
    if (!result?.ok) {
      state.library = [];
      state.albums = [];
      bindUiText(
        dom.libraryMeta,
        result?.error === 'library-not-found' ? 'fusion.runtime.libraryNotFound' : 'fusion.runtime.libraryReadFailed',
        result?.error === 'library-not-found' ? `未找到 ${result?.root || 'XLD 曲库目录'}` : '本地曲库读取失败',
        result?.error === 'library-not-found' ? { root: result?.root || 'XLD 曲库目录' } : undefined
      );
      bindUiText(dom.status, 'fusion.runtime.importStillAvailable', '仍可手动导入 JSON');
      renderLibrary();
      renderHome();
      return false;
    }
    state.libraryInfo = result;
    state.library = Array.isArray(result.tracks) ? result.tracks : [];
    state.albums = Array.isArray(result.albums) ? result.albums : [];
    dom.libraryRoot.textContent = result.root;
    bindUiText(
      dom.libraryMeta,
      'fusion.runtime.libraryMeta',
      `${result.albumCount} 张专辑 · ${result.trackCount} 首 · ${result.analyzedCount} 首已有分析`,
      { albums: result.albumCount, tracks: result.trackCount, analyzed: result.analyzedCount }
    );
    renderLibrary();
    renderHome();
    if (restore && state.library.length && !state.payload) {
      const saved = localStorage.getItem('xins-fusion-last-track');
      const target = trackById(saved) || trackById(resumeRecord?.trackId) || state.library[0];
      // Open the restored track's album once on first load (not a "snap" — the
      // initial state); afterwards expansion is purely user-controlled.
      const album = (state.albums || []).find(item => item.tracks.some(track => track.id === target.id));
      if (album && !state.expandedAlbumId) { state.expandedAlbumId = album.id; renderLibrary(); }
      await loadTrack(target.id, { openPanel: false, restorePosition:target.id===resumeRecord?.trackId });
    }
    return true;
  }

  async function acceptPayload(payload, options = {}) {
    if (!payload?.ok) return false;
    state.payload = payload;
    state.manifest = payload.manifest;
    state.bridgePath = payload.filePath || payload.sourcePath || '';
    state.sectionKey = '';
    state.chordKey = '';
    state.lastStableRoot = '';
    state.lastPaletteRoot = '';
    dom.audio.pause();
    removeResumeMetadata?.();
    const restore=()=>{removeResumeMetadata?.();if(state.payload!==payload)return;const r=options.restorePosition&&resumeRecord?.trackId===payload.manifest?.track?.id?resumeRecord:null;if(r&&r.time<dom.audio.duration-1)dom.audio.currentTime=Math.max(0,r.time);};
    dom.audio.addEventListener('loadedmetadata',restore,{once:true});removeResumeMetadata=()=>{dom.audio.removeEventListener('loadedmetadata',restore);removeResumeMetadata=null;};
    visualAudio?.setMediaPlaying(false);
    dom.audio.src = payload.audioUrl;
    dom.audio.load();
    const track = state.manifest.track || {};
    state.selectedTrackId = track.id || state.selectedTrackId;
    markTransportTransition('track-change');
    if (state.selectedTrackId) localStorage.setItem('xins-fusion-last-track', state.selectedTrackId);
    const libraryTrack = trackById(state.selectedTrackId);
    loadXldProvider(state.manifest, payload, libraryTrack || track);
    dom.album.textContent = track.album || uiText('fusion.runtime.localLibraryFallback', 'LOCAL LIBRARY');
    dom.track.textContent = track.title || uiText('fusion.runtime.untitled', 'Untitled');
    dom.artist.textContent = track.artist || uiText('fusion.runtime.unknownArtist', 'Unknown artist');
    const coverUrl = payload.coverUrl || libraryTrack?.coverUrl || '';
    if (coverUrl) dom.cover.src = coverUrl;
    else dom.cover.removeAttribute('src');
    const hasStructure = Array.isArray(state.manifest.analyses) && state.manifest.analyses.some(result => result?.segments?.length);
    const hasHarmony = Array.isArray(state.manifest.harmony) && state.manifest.harmony.some(result => result?.segments?.length);
    bindUiText(
      dom.status,
      hasStructure || hasHarmony ? 'fusion.runtime.trackReadyAnalyzed' : 'fusion.runtime.trackReady',
      hasStructure || hasHarmony ? '本地曲目与 XLD 分析已自动接入' : '本地曲目已就绪 · 暂无离线分析'
    );
    dom.linkCard.dataset.state = 'linked';
    dom.play.disabled = false;
    dom.previous.disabled = state.library.length < 2;
    dom.next.disabled = state.library.length < 2;
    dom.seek.disabled = false;
    dom.reveal.disabled = !state.bridgePath;
    updateLibraryActive(); // only move the highlight — never rebuild/scroll on select
    setHome(false);
    populateEngineSelectors();
    updateAnalysisControls();
    await stemControls?.refresh();
    scoreScene?.load(state.selectedTrackId);
    // The library drawer is opened by the person, not by a track change: skipping to the next song must not pop it open.
    if (options.openPanel === true) setOpen(true);
    updateTimeline();
    return true;
  }

  async function loadTrack(trackId, options = {}) {
    if (!bridge?.loadTrack) return false;
    rememberPosition(true);
    stemControls?.reset();
    scoreScene?.reset();
    const request = ++state.loadSequence;
    state.loadingTrack = true;
    const wasPlaying = !dom.audio.paused;
    let payload;
    try { payload = await bridge.loadTrack(trackId); } catch (_) { payload = { ok: false, error: 'ipc-failed' }; }
    if (request !== state.loadSequence) return false;
    state.loadingTrack = false;
    if (!payload?.ok) {
      state.xldValidationError = String(payload?.error || '');
      if(payload?.error==='track-missing')bindUiText(dom.status, 'fusion.runtime.fileMoved', '曲目文件已移动，请刷新曲库');
      else bindUiText(dom.status,'fusion.resultsUnavailable','分析结果暂不可用，请在 XLD 中检查');
      return false;
    }
    await acceptPayload(payload, options);
    if (options.autoplay || wasPlaying) await togglePlayback();
    return true;
  }

  async function loadAdjacent(direction, autoplay = !dom.audio.paused) {
    if (!state.library.length) return;
    const index = Math.max(0, state.library.findIndex(track => track.id === state.selectedTrackId));
    const next = (index + direction + state.library.length) % state.library.length;
    await loadTrack(state.library[next].id, { autoplay });
  }

  async function loadBridge() {
    if (!bridge?.openBridge) return;
    dom.load.disabled = true;
    bindUiText(dom.status, 'fusion.runtime.readingJson', '正在读取单曲分析文件…');
    let payload;
    try { payload = await bridge.openBridge(); } catch (_) { payload = { ok: false, error: 'ipc-failed' }; }
    dom.load.disabled = false;
    if (!payload?.ok) {
      state.xldValidationError = String(payload?.error || '');
      if (!payload?.canceled) dom.status.textContent = ({
        XLD_CONTRACT_UNSUPPORTED: '需要 xld.music-lab/2',
        XLD_SCHEMA_VERSION_UNSUPPORTED: 'XLD schemaVersion 不兼容',
        XLD_TRACK_ID_MISMATCH: 'XLD 曲目身份不匹配',
        XLD_TRACK_SOURCE_MISMATCH: 'XLD 音频路径不匹配',
        XLD_DURATION_MISMATCH: 'XLD 时间线与音频时长不匹配',
        'unsupported-contract': '需要 xld.music-lab/2', 'audio-missing': '原始音频文件已移动',
        'invalid-file': '请选择 music-lab.json'
      })[payload?.error] || '未能读取分析文件';
      return;
    }
    await acceptPayload(payload);
  }

  async function enterLocalMode({ openPanel = false } = {}) {
    await hydrateResume();
    if (!state.library.length) await scanLibrary();
    if (!state.payload && state.library.length) await loadTrack(state.library[0].id, { openPanel: false });
    setHome(!state.payload);
    if (openPanel) setOpen(true);
  }

  async function togglePlayback() {
    if (!state.manifest) return;
    if (dom.audio.paused) {
      const attached = await visualAudio?.attachMediaElement(dom.audio);
      if (attached && attached.ok === false) {
        bindUiText(dom.status, 'fusion.runtime.localPcmFailed', '本地 PCM 无法接入视觉引擎');
        return;
      }
      try { await dom.audio.play(); } catch (_) { bindUiText(dom.status, 'fusion.runtime.audioPlayFailed', '音频无法播放，请检查源文件'); }
    } else dom.audio.pause();
  }

  function syncPlaybackButton() {
    visualAudio?.setMediaPlaying(!dom.audio.paused);
    markTransportTransition(dom.audio.paused ? 'pause' : 'resume');
    dom.play.textContent = dom.audio.paused ? '▶' : '❚❚';
    updateLibraryActive();
    if(dom.audio.paused)rememberPosition(true);
    updateTimeline();
  }

  dom.button.addEventListener('click', () => setOpen(!dom.panel.classList.contains('is-open')));
  dom.close.addEventListener('click', () => setOpen(false));
  dom.load.addEventListener('click', loadBridge);
  dom.welcomeLoad.addEventListener('click', () => {setHome(false);setOpen(true);});
  document.getElementById('xlHome')?.addEventListener('click',()=>setHome(dom.welcome.classList.contains('is-gone')));
  document.getElementById('homeClose')?.addEventListener('click',()=>setHome(false));
  document.getElementById('homeChooseLibrary')?.addEventListener('click',()=>document.getElementById('xlChooseLibrary')?.click());
  document.querySelectorAll('.scene-button').forEach(button=>button.addEventListener('click',()=>setHome(false)));
  dom.refresh.addEventListener('click', () => scanLibrary({ restore: false }));
  dom.librarySearch.addEventListener('input', renderLibrary);
  dom.libraryAnalyzed?.addEventListener('change', () => {
    state.analyzedOnly = Boolean(dom.libraryAnalyzed.checked);
    renderLibrary();
  });
  dom.locateTrack?.addEventListener('click', locateCurrentTrack);
  dom.reveal.addEventListener('click', () => bridge?.revealBridge(state.bridgePath));
  dom.analysisEngine?.addEventListener('change', () => {
    localStorage.setItem('xins-fusion-analysis-engine', dom.analysisEngine.value);
    updateAnalysisControls();
  });
  dom.analysisRun?.addEventListener('click', runSelectedAnalysis);
  dom.analysisCancel?.addEventListener('click', async () => {
    const result = await bridge?.cancelAnalysis?.();
    if (result?.task) renderAnalysisTask(result.task);
  });
  dom.openXldLab?.addEventListener('click', openCurrentInXld);
  dom.resultsRefresh?.addEventListener('click',()=>refreshCurrentResults(true));
  window.addEventListener('focus',()=>refreshCurrentResults());
  dom.play.addEventListener('click', togglePlayback);
  dom.previous.addEventListener('click', () => loadAdjacent(-1));
  dom.next.addEventListener('click', () => loadAdjacent(1));
  dom.audio.addEventListener('play', syncPlaybackButton);
  dom.audio.addEventListener('pause', syncPlaybackButton);
  dom.audio.addEventListener('seeking', () => {
    if (state.seekActive) return;
    state.seekActive = true;
    markTransportTransition('seek');
  });
  dom.audio.addEventListener('seeked', () => {
    state.seekActive = false;
    rememberPosition(true);
  });
  dom.audio.addEventListener('loadedmetadata', updateTimeline);
  dom.audio.addEventListener('ended', () => loadAdjacent(1, true));
  dom.seek.addEventListener('input', () => {
    if (Number.isFinite(dom.audio.duration)) dom.audio.currentTime = Number(dom.seek.value) || 0;
    updateTimeline();
  });
  try { const saved=localStorage.getItem('xins-fusion-auto-color');if(saved!==null)dom.autoColor.checked=saved==='true'; } catch (_) {}
  dom.autoColor.addEventListener('change', () => {
    try { localStorage.setItem('xins-fusion-auto-color',String(dom.autoColor.checked)); } catch (_) {}
    if(dom.autoColor.checked)applyChordColor(state.consensus);
  });
  dom.sectionEngineSelect?.addEventListener('change', () => {
    state.sectionEngine = dom.sectionEngineSelect.value || 'auto';
    localStorage.setItem('xins-fusion-section-engine', state.sectionEngine);
    state.sectionKey = '';
    updateTimeline();
  });
  dom.chordEngineSelect?.addEventListener('change', () => {
    state.chordEngine = dom.chordEngineSelect.value || 'consensus';
    localStorage.setItem('xins-fusion-chord-engine', state.chordEngine);
    state.lastStableRoot = '';
    updateTimeline();
  });
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && dom.panel.classList.contains('is-open')) setOpen(false);
    // Space plays or pauses the local track.
    if(event.key==='Escape'&&!dom.welcome.classList.contains('is-gone'))setHome(false);
    if (event.code === 'Space' && !event.repeat && !event.target.isContentEditable && !event.target.closest('input,select,textarea,button,a,summary')) {
      event.preventDefault();
      togglePlayback();
    }
  });
  window.addEventListener('beforeunload', () => {
    rememberPosition(true);removeResumeMetadata?.();
    state.analysisUnsubscribe?.();
    state.resolverUnsubscribe?.();
    state.generatorRenderUnsubscribe?.();
    state.localeUnsubscribe?.();
    window.clearInterval(state.updateTimer);
    generatorOutputController?.dispose();
    productControlDock?.dispose();
    generatorPresetRepositoryUi?.dispose();
    generatorPresetFilesUi?.dispose();
    generatorPresetSelector?.dispose();
    generatorRuntimeShadow?.dispose();
    dom.audio.pause();
    visualAudio?.detachMediaElement();
    visualTimeline?.reset();
  });

  window.SmokeResonanceXldFrame = Object.freeze({
    get: () => xldTimelineProvider?.get() || null,
    status: () => xldTimelineProvider?.status() || {
      loaded: false,
      error: 'XLD_NOT_LOADED'
    }
  });
  window.SmokeResonanceUnifiedMusicFrame = Object.freeze({
    get: () => musicFeatureResolver?.get() || null,
    status: () => musicFeatureResolver?.status() || {
      epoch: 0,
      transition: 'unavailable',
      transport: null
    }
  });
  window.SmokeResonanceGeneratorRuntimeShadowView = Object.freeze({
    get: () => generatorRuntimeShadow?.get() || null,
    status: () => generatorRuntimeShadow?.status() || {
      version: 'unavailable',
      enabled: false,
      loadState: 'unavailable',
      entryUrl: '',
      packageVersion: '',
      browserApiVersion: 0,
      initialPresetId: 'balanced',
      builtInPresets: [],
      evaluateCalls: 0,
      error: 'GENERATOR_RUNTIME_SHADOW_UNAVAILABLE',
      rendererEnabled: true,
      formalPipeline: 'generator',
      runtime: null
    }
  });
  window.SmokeResonanceGeneratorPresets = Object.freeze({
    list: () => generatorRuntimeShadow?.presets() || [],
    active: () =>
      generatorRuntimeShadow?.status()?.runtime?.preset || null,
    applyBuiltIn: id => {
      const applied = generatorRuntimeShadow?.setBuiltInPreset(id) || null;
      generatorPresetSelector?.sync();
      return applied;
    }
  });
  window.SmokeResonanceGeneratorPresetControl = Object.freeze({
    status: () => generatorPresetSelector?.status() || {
      contract: 'xin.xml-generator-preset-selector/1',
      version: 'unavailable',
      state: 'unavailable',
      activeId: '',
      revision: 0,
      appliedCount: 0,
      presetCount: 0,
      presets: [],
      lastError: 'GENERATOR_PRESET_SELECTOR_UNAVAILABLE'
    },
    select: id => generatorPresetSelector?.select(id, 'api') || null,
    refresh: () => generatorPresetSelector?.sync() || null
  });
  window.SmokeResonanceGeneratorPresetFiles = Object.freeze({
    exportJson: () => generatorRuntimeShadow?.exportPresetJson() || null,
    stageJson: json => generatorRuntimeShadow?.stagePresetJson(json) || null,
    importJson: json =>
      generatorPresetFilesUi?.importText(json, 'api.json') || null,
    status: () => generatorPresetFilesUi?.status() || {
      contract: 'xin.xml-generator-preset-files-ui/1',
      version: 'unavailable',
      state: 'unavailable',
      lastCode: '',
      lastError: 'GENERATOR_PRESET_FILES_UNAVAILABLE',
      lastFile: '',
      imports: 0,
      exports: 0,
      maxJsonBytes: 0,
      desktopFiles: false
    }
  });
  window.SmokeResonanceGeneratorPresetRepository = Object.freeze({
    status: () => generatorPresetRepositoryUi?.status() || {
      contract: 'xin.xml-generator-preset-repository-ui/1',
      version: 'unavailable',
      state: 'unavailable',
      root: '',
      counts: { builtIn: 0, user: 0, recovered: 0 },
      warnings: [],
      lastAction: '',
      lastError: 'GENERATOR_PRESET_REPOSITORY_UNAVAILABLE',
      desktopRepository: false
    },
    refresh: () => generatorPresetRepositoryUi?.refresh() || null,
    saveCurrent: () => generatorPresetRepositoryUi?.saveCurrent() || null,
    load: (category, key) =>
      generatorPresetRepositoryUi?.load(category, key) || null,
    remove: (category, key) =>
      generatorPresetRepositoryUi?.remove(category, key) || null
  });
  window.SmokeResonanceProductControls = Object.freeze({
    status: () => productControlDock?.status() || {
      contract: 'xin.xml-product-control-dock/1',
      version: 'unavailable',
      masterPercent: 0,
      qualityMode: 'auto',
      lastTool: '',
      lastError: 'PRODUCT_CONTROLS_UNAVAILABLE',
      desktopTools: false
    },
    openXld: () => productControlDock?.launch('xld') || null,
    openGenerator: () => productControlDock?.launch('generator') || null,
    sync: () => ({
      masterPercent: productControlDock?.syncMaster() || 0,
      qualityMode: productControlDock?.syncQuality() || 'auto'
    })
  });
  window.SmokeResonanceGeneratorSourceView = Object.freeze({
    get: () => generatorSourceAdapter?.get() || null,
    status: () => generatorSourceAdapter?.status() || {
      contract: 'xin.xml-visual-source/1',
      version: 'unavailable',
      available: false,
      sourceKind: 'unavailable',
      formalPipeline: 'legacy',
      rendererEnabled: true
    }
  });
  window.SmokeResonanceFrameOwnershipGate = Object.freeze({
    get: () => frameOwnershipMonitor?.get() || null,
    status: () => frameOwnershipMonitor?.status() || {
      contract: 'xin.xml-generator-frame-ownership/1',
      version: 'unavailable',
      formalPipeline: 'generator',
      owner: 'legacy.animate',
      continuousRafOwners: 1,
      subscriber: 'generator-runtime-shadow',
      subscriberMode: 'synchronous-engine-clock',
      observedFrames: 0,
      readyFrames: 0,
      rafRequestsPeak: 0,
      violationCount: 0,
      pass: false,
      samples: []
    }
  });
  window.SmokeResonanceGeneratorOutput = Object.freeze({
    get: () => generatorOutputController?.get() || null,
    status: () => generatorOutputController?.status() || {
      contract: 'xin.xml-generator-output/1',
      version: 'unavailable',
      configuredPipeline: 'generator',
      activePipeline: 'legacy-fallback',
      visible: false,
      fallbackActive: true,
      reasons: ['GENERATOR_OUTPUT_CONTROLLER_UNAVAILABLE']
    },
    snapshotCanvas: () =>
      generatorOutputController?.snapshotCanvas() || null
  });

  let savedMaster = 125;
  try { savedMaster = savedMasterPercent(localStorage.getItem('xins-fusion-master')); } catch (_) {}
  dom.libraryView.hidden = false;
  applyMaster(savedMaster, true);
  productControlDock?.syncMaster();
  productControlDock?.syncQuality();
  Promise.resolve(generatorRuntimeShadow?.load()).then(async () => {
    const status = generatorRuntimeShadow?.status() || null;
    if (status?.loadState === 'ready') {
      generatorPresetSelector?.ready();
      generatorPresetFilesUi?.ready();
      await generatorPresetRepositoryUi?.ready();
    } else {
      const error = status?.error || 'GENERATOR_RUNTIME_UNAVAILABLE';
      generatorPresetSelector?.fail(error);
      generatorPresetFilesUi?.fail(error);
      generatorPresetRepositoryUi?.fail(error);
    }
  });
  state.resolverUnsubscribe =
    visualFrameClock?.subscribe(
      updateResolverShadow,
      { phase: 'pre-material' }
    ) || null;
  state.generatorRenderUnsubscribe =
    visualFrameClock?.subscribe(
      renderGeneratorFrame,
      { phase: 'post-material' }
    ) || null;
  state.localeUnsubscribe = dynamicI18n?.subscribe(() => {
    renderLibrary();
    renderHome();
    populateEngineSelectors();
    updateAnalysisControls();
  }) || null;
  state.updateTimer = window.setInterval(updateTimeline, 100);
  if (!bridge) {
    bindUiText(dom.status, 'fusion.runtime.desktopOnly', 'Fusion 曲库仅桌面版可用');
    dom.load.disabled = true;
    dom.welcomeLoad.disabled = true;
    dom.refresh.disabled = true;
  } else {
    state.analysisUnsubscribe = bridge.onAnalysisTask?.(renderAnalysisTask) || null;
    Promise.resolve(bridge.analysisTask?.()).then(renderAnalysisTask).catch(() => {});
    loadAnalysisEngines();
    enterLocalMode(); // auto-enter local mode (welcome doubles as a brief loading splash), panel stays closed
  }
})();
