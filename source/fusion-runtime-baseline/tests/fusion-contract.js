'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const app = read('app.js');
const fusion = read('fusion.js');
const shadow = read('resolver-legacy-shadow.js');
const generatorShadow = read('generator-runtime-shadow.js');
const generatorPresetSelector = read('generator-preset-selector.js');
const generatorPresetFiles = read('generator-preset-file-control.js');
const generatorPresetRepository = read('generator-preset-repository-control.js');
const productControlDock = read('product-control-dock.js');
const presetRepositoryCore = read('desktop/glitch-preset-repository.cjs');
const generatorSource = read('generator-source-adapter.js');
const targetInspector = read('target-inspector.js');
const stabilityMonitor = read('shadow-stability-monitor.js');
const frameOwnership = read('frame-ownership-monitor.js');
const outputController = read('generator-output-controller.js');
const main = read('desktop/main.cjs');
const preload = read('desktop/preload.cjs');
const buildDesktop = read('scripts/build-desktop.cjs');
const pkg = JSON.parse(read('package.json'));

for (const id of [
  'fusionButton', 'fusionPanel', 'fusionLoad', 'fusionAudio', 'fusionMaster',
  'fusionProof', 'fusionSection', 'fusionChord', 'fusionVotes', 'fusionHud',
  'fusionModeInternal', 'fusionModeExternal', 'fusionLibraryList', 'fusionLibrarySearch',
  'fusionExternalToggle', 'fusionPrevious', 'fusionNext', 'fusionAnalysisCard',
  'fusionAnalysisEngine', 'fusionAnalysisRun', 'fusionAnalysisCancel', 'fusionAnalysisProgress',
  'glitchWebglCanvas', 'generatorCanvas', 'generatorPresetControl',
  'generatorPresetFiles', 'generatorPresetRepository', 'productControlDock'
]) assert(html.includes(`id="${id}"`), `missing Fusion DOM id: ${id}`);

assert(html.includes('<script src="./fusion.js"></script>'), 'fusion.js must load after the visual engine');
assert(html.includes('<script src="./music-feature-resolver.js"></script>'), 'MusicFeatureResolver must load before app/fusion runtime');
assert(html.includes('<script src="./source-inspector.js"></script>'), 'Source Inspector module must be loaded');
assert(html.includes('<script src="./resolver-legacy-shadow.js"></script>'), 'Resolver/Legacy Shadow comparator must be loaded');
assert(html.includes('<script src="./generator-runtime-shadow.js"></script>'), 'Generator Runtime Shadow loader must be loaded');
assert(html.includes('<script src="./generator-preset-selector.js"></script>'), 'Generator product preset selector must be loaded');
assert(html.includes('<script src="./generator-preset-file-control.js"></script>'), 'Generator product preset files UI must be loaded');
assert(html.includes('<script src="./generator-preset-repository-control.js"></script>'), 'Generator file repository UI must be loaded');
assert(html.includes('<script src="./product-control-dock.js"></script>'), 'Product control dock must be loaded');
assert(html.includes('<script src="./generator-source-adapter.js"></script>'), 'Generator Source Adapter must be loaded');
assert(html.includes('<script src="./target-inspector.js"></script>'), 'Target Inspector module must be loaded');
assert(html.includes('<script src="./frame-ownership-monitor.js"></script>'), 'Frame Ownership monitor must be loaded');
assert(html.includes('<script src="./shadow-stability-monitor.js"></script>'), 'Shadow Stability monitor must be loaded');
assert(html.includes('<script src="./generator-output-controller.js"></script>'), 'Generator Output controller must be loaded');
assert(
  html.indexOf('./music-feature-resolver.js') < html.indexOf('./app.js'),
  'MusicFeatureResolver must load before app.js'
);
assert(
  html.indexOf('./source-inspector.js') < html.indexOf('./app.js'),
  'Source Inspector must load before app.js'
);
assert(
  html.indexOf('./resolver-legacy-shadow.js') < html.indexOf('./app.js'),
  'Resolver/Legacy Shadow comparator must load before app.js'
);
assert(
  html.indexOf('./generator-runtime-shadow.js') < html.indexOf('./app.js'),
  'Generator Runtime Shadow loader must load before app.js'
);
assert(
  html.indexOf('./generator-preset-selector.js') < html.indexOf('./fusion.js'),
  'Generator product preset selector must load before fusion runtime'
);
assert(
  html.indexOf('./generator-preset-file-control.js') < html.indexOf('./fusion.js'),
  'Generator product preset files UI must load before fusion runtime'
);
assert(
  html.indexOf('./generator-preset-repository-control.js') < html.indexOf('./fusion.js'),
  'Generator preset repository UI must load before fusion runtime'
);
assert(
  html.indexOf('./product-control-dock.js') < html.indexOf('./fusion.js'),
  'Product control dock must load before fusion runtime'
);
assert(
  html.indexOf('./generator-source-adapter.js') < html.indexOf('./fusion.js'),
  'Generator Source Adapter must load before Fusion runtime'
);
assert(
  html.indexOf('./target-inspector.js') < html.indexOf('./fusion.js'),
  'Target Inspector must load before fusion runtime'
);
assert(
  html.indexOf('./shadow-stability-monitor.js') < html.indexOf('./fusion.js'),
  'Shadow Stability monitor must load before fusion runtime'
);
assert(
  html.indexOf('./generator-output-controller.js') < html.indexOf('./fusion.js'),
  'Generator Output controller must load before fusion runtime'
);
assert(app.includes('window.SmokeResonanceTimeline'), 'visual engine must expose the offline timeline bridge');
assert(app.includes('window.SmokeResonanceFrameClock'), 'visual engine must expose its single RAF clock');
assert(app.includes('engineFrameSubscribers'), 'Resolver must subscribe to the existing RAF rather than create another RAF');
assert(app.includes('window.SmokeResonanceAudioSource'), 'visual engine must expose direct internal and external source routing');
assert(app.includes('fusionTimelineState.boundaryPulse'), 'offline boundaries must feed the post-FX event path');
assert(app.includes('fusionTimelineState.climax') && app.includes('fusionTimelineState.drop'), 'offline climax and drop must remain distinct visual signals');
assert(app.includes('glitchWebglRenderer.render'), 'the visual source must feed the WebGL2 glitch renderer');
assert(app.includes('boundarySerial'), 'offline section boundaries must become discrete events');
assert(!app.includes("localStorage.setItem('smoke-resonance-"), 'Fusion must not overwrite original XML settings');
assert(!fusion.includes('validateManifest(state.manifest'), 'manifest validation belongs in the privileged main process and shared adapter');
assert(fusion.includes("'chord-btc': 1.35"), 'BTC-weighted harmony consensus policy is missing');
assert(fusion.includes('sectionSignals') && fusion.includes('climax: section.climax'), 'typed offline section mapping is missing');
assert(fusion.includes('8s PROOF'), 'proof mode is missing');
assert(main.includes('xldTimelineProvider.validateManifest'), 'main process must validate XLD manifests through the shared adapter');
assert(main.includes("ipcMain.handle('fusion:open-bridge'"), 'bridge file picker IPC is missing');
assert(main.includes("ipcMain.handle('fusion:scan-library'"), 'automatic local library scan IPC is missing');
assert(main.includes("ipcMain.handle('fusion:load-track'"), 'automatic track loading IPC is missing');
assert(main.includes("ipcMain.handle('fusion:analysis-run'"), 'embedded XLD analysis IPC is missing');
assert(main.includes('createXldAnalysisService'), 'Fusion must call the XLD analysis core directly');
assert(main.includes('DEFAULT_LIBRARY_ROOT'), 'Fusion must own a local library root without launching XLD');
assert(preload.includes("contextBridge.exposeInMainWorld('XinsMusicLabFusion'"), 'preload bridge is missing');
assert(preload.includes('onAnalysisTask') && preload.includes('runAnalysis'), 'analysis progress bridge is missing');
assert(fusion.includes('scanLibrary()'), 'Fusion renderer must scan the library automatically');
assert(fusion.includes("setSourceMode('external')"), 'Fusion renderer must distinguish external listening');
assert(fusion.includes('attachMediaElement(dom.audio)'), 'internal playback must use a direct PCM analysis route');
assert(fusion.includes('musicFeatureResolver.resolve({'), 'Fusion must resolve Realtime and XLD provider frames');
assert(fusion.includes('window.SmokeResonanceUnifiedMusicFrame'), 'Fusion must expose the resolved Shadow frame');
assert(fusion.includes('window.SmokeResonanceSourceInspectorView'), 'Fusion must expose read-only Inspector diagnostics');
assert(fusion.includes('window.SmokeResonancePhaseIIGate'), 'Fusion must expose the read-only Phase II Gate report');
assert(fusion.includes('window.SmokeResonanceGeneratorRuntimeShadowView'), 'Fusion must expose the read-only Generator Runtime Shadow report');
assert(fusion.includes('window.SmokeResonanceGeneratorSourceView'), 'Fusion must expose the read-only Generator source status');
assert(fusion.includes('window.SmokeResonanceTargetInspectorView'), 'Fusion must expose the read-only Target Inspector report');
assert(fusion.includes('window.SmokeResonanceShadowStabilityGate'), 'Fusion must expose the read-only Shadow Stability Gate report');
assert(fusion.includes('window.SmokeResonanceFrameOwnershipGate'), 'Fusion must expose the read-only Frame Ownership Gate report');
assert(fusion.includes('window.SmokeResonanceGeneratorOutput'), 'Fusion must expose the formal Generator output report');
assert(fusion.includes('window.SmokeResonanceGeneratorPresets'), 'Fusion must expose the Phase V product preset bridge');
assert(fusion.includes('window.SmokeResonanceGeneratorPresetControl'), 'Fusion must expose the Phase V-2 visible preset control');
assert(fusion.includes('window.SmokeResonanceGeneratorPresetFiles'), 'Fusion must expose the Phase V-3 JSON preset bridge');
assert(fusion.includes('window.SmokeResonanceGeneratorPresetRepository'), 'Fusion must expose the Phase V-4 file repository bridge');
assert(fusion.includes('window.SmokeResonanceProductControls'), 'Fusion must expose the Phase V-5 product controls bridge');
assert(fusion.includes('sourceInspector?.update(clock.nowMs, unifiedMusicFrame'), 'Inspector must consume only the resolved Shadow frame');
assert(fusion.includes('resolverLegacyShadow?.update('), 'Resolver/Legacy comparison must run in Shadow');
assert(
  /generatorRuntimeShadow\?\.evaluate\(\s*unifiedMusicFrame,\s*clock,\s*\{ render: false \}\s*\)/.test(fusion),
  'XML must evaluate Generator mappings before material rendering on the resolved frame and Engine Clock'
);
assert(
  fusion.includes('generatorRuntimeShadow?.renderCurrentSource()'),
  'XML must render the current material source after material generation'
);
assert(fusion.includes('targetInspector?.update('), 'Target Inspector must consume Legacy snapshot plus Generator Runtime report');
assert(fusion.includes('shadowStabilityMonitor?.observe('), 'Shadow Stability Gate must observe Generator Runtime reports');
assert(fusion.includes('bridge.shadowTelemetry()'), 'Shadow Stability Gate must request isolated process telemetry');
assert(fusion.includes('generatorRuntimeShadow?.load()'), 'XML must load the versioned Generator browser artifact');
assert(fusion.includes('generatorRuntimeShadow?.dispose()'), 'XML must dispose the Generator runtime lifecycle');
assert(fusion.includes('6.6.1-integration-v.3/browser/index.js'), 'XML must use the Phase V-3 Generator browser entry');
assert(fusion.includes("initialPresetId: 'balanced'"), 'XML must select the balanced product preset explicitly');
assert(generatorShadow.includes("const VERSION = '5.3.0-product-json-loader'"), 'XML must expose the Phase V-3 product JSON loader version');
assert(generatorShadow.includes("const EXPECTED_PACKAGE_VERSION = '6.6.1-integration-v.3'"), 'XML must pin the Phase V-3 Generator artifact');
assert(generatorShadow.includes('listProductBuiltInPresets'), 'XML loader must discover product presets from the Generator artifact');
assert(generatorShadow.includes('getProductBuiltInPreset'), 'XML loader must resolve product presets from Generator data');
assert(generatorShadow.includes('this.runtime.setPreset(preset, reason)'), 'XML loader must switch presets through the atomic RuntimeFacade API');
assert(fusion.includes("root: $('#generatorPresetControl')"), 'Preset selector must bind to the FX Rack control');
assert(fusion.includes('generatorPresetSelector?.ready()'), 'Preset selector must enter ready state only after Generator load');
assert(fusion.includes('generatorPresetSelector?.dispose()'), 'Preset selector lifecycle cleanup is missing');
assert(generatorPresetSelector.includes("const VERSION = '5.2.0-product-preset-selector'"), 'Preset selector version is missing');
assert(generatorPresetSelector.includes('this.applyPreset(nextId, source)'), 'Visible selector must use the existing atomic preset bridge');
assert(generatorPresetSelector.includes('readStoredPresetId('), 'Visible selector must restore a validated local choice');
assert(generatorShadow.includes('exportProductPresetJson'), 'XML loader must export through Generator validation');
assert(generatorShadow.includes('stageProductPresetJson'), 'XML loader must stage imports before applying');
assert(generatorShadow.includes("'product-json-import'"), 'XML loader must identify atomic JSON imports');
assert(fusion.includes("root: $('#generatorPresetFiles')"), 'JSON file UI must bind inside FX Rack');
assert(fusion.includes('generatorPresetFilesUi?.ready()'), 'JSON file UI must wait for Generator load');
assert(fusion.includes('generatorPresetFilesUi?.dispose()'), 'JSON file UI lifecycle cleanup is missing');
assert(generatorPresetFiles.includes("const VERSION = '5.3.0-product-json-files'"), 'JSON file UI version is missing');
assert(!generatorPresetFiles.includes('requestAnimationFrame'), 'JSON file UI must not create another RAF');
assert(!generatorPresetFiles.includes('getContext('), 'JSON file UI must not create a GPU context');
assert(main.includes("ipcMain.handle('fusion:export-glitch-preset'"), 'Desktop JSON export IPC is missing');
assert(main.includes("ipcMain.handle('fusion:import-glitch-preset'"), 'Desktop JSON import IPC is missing');
assert(main.includes("await fs.rename(temporary, target)"), 'Preset export must commit through a same-directory atomic rename');
assert(preload.includes('exportGlitchPreset') && preload.includes('importGlitchPreset'), 'Preset file IPC must be exposed through context isolation');
assert(fusion.includes("root: $('#generatorPresetRepository')"), 'Preset repository UI must bind inside FX Rack');
assert(fusion.includes('generatorPresetRepositoryUi?.ready()'), 'Preset repository must wait for Generator load');
assert(fusion.includes('generatorPresetRepositoryUi?.dispose()'), 'Preset repository lifecycle cleanup is missing');
assert(generatorPresetRepository.includes("const VERSION = '5.4.0-file-repository-ui'"), 'Preset repository UI version is missing');
assert(presetRepositoryCore.includes("const VERSION = '5.4.0-file-repository'"), 'Preset repository core version is missing');
assert(presetRepositoryCore.includes("['builtIn', 'user', 'recovered']"), 'Preset repository categories must be explicit');
assert(presetRepositoryCore.includes('await fs.rename(temporary, target)'), 'Preset repository must commit through same-directory atomic rename');
assert(main.includes("ipcMain.handle('fusion:preset-repository-list'"), 'Preset repository list IPC is missing');
assert(main.includes("ipcMain.handle('fusion:preset-repository-save'"), 'Preset repository save IPC is missing');
assert(main.includes("ipcMain.handle('fusion:preset-repository-read'"), 'Preset repository read IPC is missing');
assert(main.includes("ipcMain.handle('fusion:preset-repository-remove'"), 'Preset repository remove IPC is missing');
assert(preload.includes('presetRepositoryList') && preload.includes('presetRepositorySave'), 'Preset repository IPC must be exposed through context isolation');
assert(!generatorPresetRepository.includes('requestAnimationFrame'), 'Preset repository UI must not create another RAF');
assert(!generatorPresetRepository.includes('getContext('), 'Preset repository UI must not create a GPU context');
assert(!presetRepositoryCore.includes('Math.random('), 'Preset repository core must not own unseeded randomness');
assert(!presetRepositoryCore.includes("sourceId: 'audio."), 'Preset repository core must not hard-code audio mappings');
assert(fusion.includes("root: $('#productControlDock')"), 'Product control dock must bind to the persistent top UI');
assert(fusion.includes('masterSource: dom.master'), 'Product FX Master must delegate to the existing master owner');
assert(fusion.includes("qualitySource: $('#qualityButton')"), 'Product quality must delegate to the existing quality owner');
assert(fusion.includes('productControlDock?.update(clock.nowMs, unifiedMusicFrame'), 'Product source summary must use the unified Engine Clock frame');
assert(fusion.includes('productControlDock?.dispose()'), 'Product control dock lifecycle cleanup is missing');
assert(productControlDock.includes("const VERSION = '5.5.0-productization'"), 'Product control dock version is missing');
assert(!productControlDock.includes('requestAnimationFrame'), 'Product control dock must not create another RAF');
assert(!productControlDock.includes('getContext('), 'Product control dock must not create a GPU context');
assert(!productControlDock.includes('performance.now(') && !productControlDock.includes('Date.now('), 'Product dock must use injected Engine Clock time');
assert(!productControlDock.includes("sourceId: 'audio.") && !productControlDock.includes('targetId:'), 'Product dock must not own mapping data');
assert(main.includes("ipcMain.handle('fusion:open-generator-editor'"), 'Advanced Generator editor IPC is missing');
assert(main.includes("'tools',") && main.includes("'glitch-generator',"), 'Advanced Generator editor must load the packaged build product');
assert(main.includes("const ADVANCED_GENERATOR_VERSION = '6.6.1-integration-v.3'"), 'Advanced Generator artifact version must be pinned');
assert(preload.includes('openGeneratorEditor'), 'Advanced Generator editor IPC must cross context isolation');
assert(fusion.includes("bridge?.analyzeInXld?.(state.selectedTrackId || '', document.documentElement.lang)"), 'Persistent XLD Lab entry must pass the optional track and current locale');
assert(fusion.includes('bridge?.openGeneratorEditor?.(document.documentElement.lang)'), 'Persistent Generator editor entry must pass the current locale through the desktop bridge');
assert(buildDesktop.includes("const directories = ['assets', 'vendor', 'desktop', 'tools']"), 'Desktop packaging must include advanced tool build products');
assert(buildDesktop.includes("entry.name.endsWith('.js')"), 'Desktop packaging must include all root runtime modules');
assert(buildDesktop.includes('electronDistCandidates'), 'Desktop packaging must resolve an installed Electron distribution explicitly');
assert(buildDesktop.includes('dependencies: {}'), 'Desktop packaging must declare its empty runtime dependency tree');
assert(buildDesktop.includes("path.join(stagingBin, 'npm.cmd')"), 'Desktop packaging must provide a deterministic empty dependency collector');
assert(buildDesktop.includes('fs.writeFileSync(builderPackagePath, builderPackageSource)'), 'Desktop packaging must restore its machine-independent builder template');
assert(fs.existsSync(path.join(root, 'tools', 'glitch-generator', '6.6.1-integration-v.3', 'demo', 'index.html')), 'Packaged Generator demo entry is missing');
assert(fs.existsSync(path.join(root, 'tools', 'glitch-generator', '6.6.1-integration-v.3', 'dist', 'ui-debug', 'phase1-demo.js')), 'Packaged Generator editor runtime is missing');
assert(!fs.existsSync(path.join(root, 'tools', 'glitch-generator', '6.6.1-integration-v.3', 'src')), 'Fusion must not package a second Generator source tree');
assert(!generatorPresetSelector.includes('requestAnimationFrame'), 'Preset selector must not create another RAF');
assert(!generatorPresetSelector.includes('getContext('), 'Preset selector must not create a GPU context');
assert(!generatorPresetSelector.includes("sourceId: 'audio."), 'Preset selector must not hard-code audio mappings');
assert(fusion.includes('rendererEnabled: true'), 'Generator formal renderer must remain enabled in IV-5');
assert(fusion.includes('rendererExpected: true'), 'Stability gate must validate the formal renderer in IV-5');
assert(fusion.includes('qualityProvider: () => ({'), 'Generator must consume the existing XML quality control');
assert(fusion.includes("mode: $('#qualityButton')?.dataset.mode || 'auto'"), 'Quality provider must preserve Auto fallback');
assert(fusion.includes('generatorRuntimeShadow?.status() || null'), 'Stability monitor must observe renderer quality and context lifecycle status');
assert(fusion.includes('frameOwnershipMonitor?.observe(clock, generatorRuntimeStatus)'), 'Frame Ownership must reconcile the same Engine Clock and Generator status');
assert(fusion.includes("owner: 'legacy.animate'"), 'Legacy animate must remain the sole continuous RAF owner after the IV-5 visual switch');
assert(fusion.includes("subscriber: 'generator-runtime-shadow'"), 'Generator must remain a synchronous Engine Clock subscriber');
assert(fusion.includes("renderCanvas: $('#generatorCanvas')"), 'Generator output canvas route is missing');
assert(fusion.includes("formalPipeline: 'generator'"), 'Generator must be configured as the formal visual pipeline');
assert(fusion.includes('generatorOutputController?.update('), 'Formal output switch must be reconciled on the Engine Clock');
assert(fusion.includes('visualGlitch?.get()?.enabled !== false'), 'FX OFF must explicitly bypass Generator output');
assert(fusion.includes('generatorOutputController?.dispose()'), 'Formal output controller lifecycle cleanup is missing');
assert(fusion.includes('sourceProvider: () => generatorSourceAdapter?.get() || null'), 'Generator source provider route is missing');
assert(generatorShadow.includes('createSourceAwareWebglRenderPort'), 'Loader must support the source-aware render port behind its flag');
assert(generatorShadow.includes('this.runtime.render(sourceFrame, this.report)'), 'Source-aware loader must render the selected XML source plus material fields when enabled');
assert(fusion.includes('visualGlitch?.state()?.features || null'), 'Shadow comparison must read the existing Legacy snapshot');
assert(
  /visualFrameClock\?\.subscribe\(\s*updateResolverShadow,\s*\{ phase: 'pre-material' \}\s*\)/.test(fusion),
  'Resolver must use the pre-material XML engine frame phase'
);
assert(!fusion.includes('visualTimeline?.set(unifiedMusicFrame'), 'Resolved Shadow frame must not drive the Legacy timeline');
assert(!fusion.includes('visualGlitch?.set(unifiedMusicFrame'), 'Resolved Shadow frame must not drive the FX renderer');
assert(!shadow.includes('glitchFeatureBus.update'), 'Shadow comparator must not write to the Legacy bus');
assert(!shadow.includes('visualGlitch.set'), 'Shadow comparator must not write to the FX renderer');
assert(!shadow.includes('visualTimeline.set'), 'Shadow comparator must not write to the Legacy timeline');
assert(!generatorShadow.includes('requestAnimationFrame'), 'XML Runtime Shadow must not create a second RAF');
assert(!generatorShadow.includes('getContext('), 'XML Runtime Shadow must not create a GPU context');
assert(!generatorSource.includes('requestAnimationFrame'), 'Generator Source Adapter must not create a second RAF');
assert(!generatorSource.includes('getContext('), 'Generator Source Adapter must not create a GPU context');
assert(generatorSource.includes("effect.startsWith('beta-')"), 'Generator Source Adapter must select Butterchurn canvas explicitly');
assert(!targetInspector.includes('requestAnimationFrame'), 'Target Inspector must not create a second RAF');
assert(!targetInspector.includes('getContext('), 'Target Inspector must not create a GPU context');
assert(!targetInspector.includes('Math.random'), 'Target Inspector must not create nondeterministic output');
assert(!stabilityMonitor.includes('requestAnimationFrame'), 'Shadow Stability monitor must not create a second RAF');
assert(!stabilityMonitor.includes('getContext('), 'Shadow Stability monitor must not create a GPU context');
assert(!stabilityMonitor.includes('Math.random'), 'Shadow Stability monitor must not create nondeterministic output');
assert(!frameOwnership.includes('requestAnimationFrame'), 'Frame Ownership monitor must not create a second RAF');
assert(!frameOwnership.includes('getContext('), 'Frame Ownership monitor must not touch GPU state');
assert(!frameOwnership.includes('performance.now'), 'Frame Ownership monitor must use only injected Engine Clock');
assert(!frameOwnership.includes('Date.now'), 'Frame Ownership monitor must use only injected Engine Clock');
assert(!frameOwnership.includes('Math.random'), 'Frame Ownership monitor must remain deterministic');
assert(!outputController.includes('requestAnimationFrame'), 'Generator Output controller must not create a second RAF');
assert(!outputController.includes('getContext('), 'Generator Output controller must not touch GPU state');
assert(!outputController.includes('performance.now'), 'Generator Output controller must use only Engine Clock input');
assert(!outputController.includes('Date.now'), 'Generator Output controller must use only Engine Clock input');
assert(!outputController.includes('Math.random'), 'Generator Output controller must remain deterministic');
assert(outputController.includes("activePipeline === 'generator'"), 'Formal output controller must expose Generator promotion state');
assert(outputController.includes("'legacy-bypass'"), 'Formal output controller must preserve explicit FX bypass');
assert(outputController.includes("'legacy-fallback'"), 'Formal output controller must preserve automatic Legacy fallback');
assert(app.includes('window.SmokeResonanceFrameClock = Object.freeze({'), 'App must expose the existing Engine Clock broker');
assert(
  app.includes('engineFrameSubscribers.preMaterial') &&
  app.includes('engineFrameSubscribers.postMaterial') &&
  app.includes('subscribers.add(callback)'),
  'Generator integration must use the phased subscriber broker'
);
assert(app.includes('requestAnimationFrame(animate);'), 'Legacy animate must remain the continuous Engine Clock owner in IV-5');
assert(app.includes('window.SmokeResonanceGeneratorOutput?.snapshotCanvas?.()'), 'Snapshots must capture the formal Generator canvas when active');
assert(main.includes("ipcMain.handle('fusion:shadow-telemetry'"), 'Main process must expose isolated shadow telemetry');
assert(preload.includes('shadowTelemetry'), 'Preload must expose shadow telemetry only through IPC');
assert(main.includes('process.getCPUUsage?.()'), 'Telemetry must use scalar main-process CPU diagnostics');
assert(main.includes('Promise.race(['), 'Telemetry must time out rather than block the Shadow gate');
assert(main.includes('JSON.stringify({'), 'Telemetry must cross IPC as a clone-safe JSON scalar payload');
assert(preload.includes('JSON.parse(payload)'), 'Preload must deserialize the diagnostics payload before UI observation');
assert(html.includes('<script src="./glitch-feature-bus.js"></script>'), 'feature bus must load before app.js');
assert(html.includes('<script src="./glitch-webgl.js"></script>'), 'WebGL2 renderer must load before app.js');

console.log('fusion-contract: ok');
