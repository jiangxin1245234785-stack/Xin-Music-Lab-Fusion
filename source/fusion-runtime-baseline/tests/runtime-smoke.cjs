'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
const { app, BrowserWindow, ipcMain } = require('electron');

const failures = [];
let runtimeNativeLocale = 'zh-CN';
const runtimeNativeLocaleCalls = [];
const runtimeGeneratorOpenLocales = [];

process.on('uncaughtException', error => {
  failures.push(`main: ${error.stack || error.message}`);
});
process.on('unhandledRejection', error => {
  failures.push(`main rejection: ${error?.stack || error}`);
});

app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('no-sandbox');
if (process.env.SMOKE_DISABLE_GPU === '1') {
  app.commandLine.appendSwitch('disable-gpu');
  app.disableHardwareAcceleration();
}
app.setPath('userData', path.join(os.tmpdir(), `xins-music-lab-runtime-${process.pid}`));

// Exercise the actual preload → Fusion → monitor IPC path with a clone-safe
// deterministic desktop fixture. Production handler behavior is guarded by
// the source contract; this fixture avoids starting the full desktop shell.
ipcMain.handle('fusion:shadow-telemetry', () => JSON.stringify({
  available: true,
  cpuPercent: 12,
  memoryKb: 256_000,
  processCount: 1,
  scope: 'runtime-smoke-fixture'
}));
ipcMain.handle('fusion:export-glitch-preset', (_event, payload) => ({
  ok: Boolean(
    typeof payload?.json === 'string' &&
    payload.json.includes('"schemaVersion": 16') &&
    String(payload?.filename || '').endsWith('.json')
  ),
  path: 'runtime-smoke-export.json'
}));
ipcMain.handle('fusion:import-glitch-preset', () => ({
  ok: true,
  path: 'runtime-smoke-import.json',
  name: 'runtime-smoke-import.json',
  json: JSON.stringify({
    schemaVersion: 16,
    id: 'ipc-import',
    name: 'IPC Import',
    mappings: []
  })
}));
ipcMain.handle('fusion:analyze-in-xld', (_event, payload) => ({
  ok: true,
  trackId: String(payload?.trackId || ''),
  fixture: 'xld-advanced-lab'
}));
ipcMain.handle('app:locale-get', () => ({ ok: true, locale: runtimeNativeLocale, source: 'renderer' }));
ipcMain.handle('app:locale-set', (_event, payload) => {
  if (!['zh-CN', 'en-US'].includes(payload?.locale)) return { ok: false, error: 'invalid-locale' };
  runtimeNativeLocale = payload.locale;
  runtimeNativeLocaleCalls.push(payload.locale);
  return { ok: true, locale: runtimeNativeLocale, source: 'renderer', generator: { ok: false, error: 'generator-editor-not-open' } };
});
ipcMain.handle('fusion:open-generator-editor', (_event, payload) => {
  runtimeGeneratorOpenLocales.push(payload?.locale || null);
  return {
  ok: true,
  version: '6.6.1-integration-v.3',
  fixture: 'generator-advanced-editor',
  locale: payload?.locale || null
  };
});
const runtimePresetRepository = new Map();
const runtimePresetEntry = (key, json) => {
  const parsed = JSON.parse(json);
  return {
    category: 'user',
    key,
    id: parsed.id,
    name: parsed.name,
    schemaVersion: parsed.schemaVersion,
    bytes: Buffer.byteLength(json, 'utf8'),
    readOnly: false
  };
};
ipcMain.handle('fusion:preset-repository-list', () => ({
  ok: true,
  repository: {
    contract: 'xin.glitch-preset-repository/1',
    version: '5.4.0-file-repository',
    root: 'runtime-smoke://Glitch Presets',
    categories: {
      builtIn: [],
      user: [...runtimePresetRepository]
        .map(([key, json]) => runtimePresetEntry(key, json)),
      recovered: []
    },
    warnings: []
  }
}));
ipcMain.handle('fusion:preset-repository-save', (_event, payload) => {
  if (payload?.category !== 'user') {
    return { ok: false, error: 'PRESET_REPOSITORY_CATEGORY_READ_ONLY' };
  }
  JSON.parse(payload.json);
  runtimePresetRepository.set(payload.filename, payload.json);
  return {
    ok: true,
    entry: runtimePresetEntry(payload.filename, payload.json)
  };
});
ipcMain.handle('fusion:preset-repository-read', (_event, payload) => {
  const json = payload?.category === 'user'
    ? runtimePresetRepository.get(payload.key)
    : null;
  return json
    ? { ok: true, entry: runtimePresetEntry(payload.key, json), json }
    : { ok: false, error: 'PRESET_REPOSITORY_ENTRY_NOT_FOUND' };
});
ipcMain.handle('fusion:preset-repository-remove', (_event, payload) => ({
  ok: payload?.category === 'user' && runtimePresetRepository.delete(payload.key),
  category: payload?.category,
  key: payload?.key
}));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 760,
    show: process.env.SMOKE_VISIBLE === '1',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.resolve(__dirname, '..', 'desktop', 'preload.cjs'),
      offscreen: Boolean(process.env.SMOKE_SCREENSHOT)
    }
  });

  win.webContents.on('console-message', event => {
    const details = event || {};
    if (details.level === 'error' || details.level === 3) failures.push(`renderer: ${details.message || 'console error'}`);
  });
  win.webContents.on('render-process-gone', (_event, details) => failures.push(`renderer gone: ${details.reason}`));

  try {
    await win.loadFile(path.resolve(__dirname, '..', 'index.html'));
    if (process.env.SMOKE_VISIBLE === '1') {
      win.show();
      if (win.isMinimized()) win.restore();
      win.focus();
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    // Production intentionally pauses canvas work when its window is hidden.
    // SMOKE_VISIBLE creates the test window visibly from the outset so the
    // existing engine clock can advance; it never changes app source code.
    const testVisibility = JSON.parse(await win.webContents.executeJavaScript(
      `JSON.stringify({ hidden: document.hidden, visibilityState: document.visibilityState })`
    ));
    const configuredStabilityMs = Math.max(
      0,
      Number(process.env.SMOKE_STABILITY_MS) || 0
    );
    const initialWaitMs = Math.max(
      process.env.SMOKE_VISIBLE === '1' ? 3200 : 1400,
      configuredStabilityMs
    );
    await new Promise(resolve => setTimeout(resolve, initialWaitMs));
    let visibilityLifecycle = {
      tested: false,
      pausedWhileHidden: false,
      resumedAfterShow: false,
      before: null,
      hiddenStart: null,
      hiddenEnd: null,
      resumed: null
    };
    if (process.env.SMOKE_VISIBLE === '1') {
      const readGeneratorCounts = () => win.webContents.executeJavaScript(`(() => {
        const status = window.SmokeResonanceGeneratorRuntimeShadowView?.status();
        return {
          hidden: document.hidden,
          evaluateCalls: status?.evaluateCalls || 0,
          renderRequests: status?.renderRequests || 0
        };
      })()`);
      const before = await readGeneratorCounts();
      win.hide();
      await new Promise(resolve => setTimeout(resolve, 150));
      const hiddenStart = await readGeneratorCounts();
      await new Promise(resolve => setTimeout(resolve, 550));
      const hiddenEnd = await readGeneratorCounts();
      win.show();
      if (win.isMinimized()) win.restore();
      win.focus();
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const hidden = await win.webContents.executeJavaScript('document.hidden');
        if (!hidden) break;
        win.show();
        win.focus();
        await new Promise(resolve => setTimeout(resolve, 125));
      }
      await new Promise(resolve => setTimeout(resolve, 700));
      const resumed = await readGeneratorCounts();
      visibilityLifecycle = {
        tested: true,
        pausedWhileHidden:
          hiddenStart.hidden === true &&
          hiddenEnd.hidden === true &&
          hiddenEnd.evaluateCalls === hiddenStart.evaluateCalls &&
          hiddenEnd.renderRequests === hiddenStart.renderRequests,
        resumedAfterShow:
          resumed.hidden === false &&
          resumed.evaluateCalls > hiddenEnd.evaluateCalls &&
          resumed.renderRequests > hiddenEnd.renderRequests,
        before,
        hiddenStart,
        hiddenEnd,
        resumed
      };
    }
    const result = await win.webContents.executeJavaScript(`(async () => {
      const requiredApis = [
        'SmokeResonanceCalibration',
        'SmokeResonanceResponse',
        'SmokeResonanceColor',
        'SmokeResonanceGlitch',
        'SmokeResonancePulsar',
        'SmokeResonanceDirector',
        'SmokeResonanceMapping',
        'SmokeResonanceSections',
        'SmokeResonanceRealtimeFrame',
        'SmokeResonanceXldFrame',
        'SmokeResonanceFrameClock',
        'SmokeResonanceUnifiedMusicFrame',
        'SmokeResonanceMaterialView',
        'SmokeResonanceExperimentalMaterials',
        'SmokeResonanceSourceInspectorView',
        'SmokeResonancePhaseIIGate',
        'SmokeResonanceGeneratorSourceView',
        'SmokeResonanceGeneratorRuntimeShadowView',
        'SmokeResonanceTargetInspectorView',
        'SmokeResonanceShadowStabilityGate',
        'SmokeResonanceFrameOwnershipGate',
        'SmokeResonanceGeneratorOutput',
        'SmokeResonanceGeneratorPresets',
        'SmokeResonanceGeneratorPresetControl',
        'SmokeResonanceGeneratorPresetFiles',
        'SmokeResonanceGeneratorPresetRepository',
        'SmokeResonanceProductControls'
      ];
      const apisReady = requiredApis.every(name => Boolean(window[name]));
      const realtimeFrame = window.SmokeResonanceRealtimeFrame?.get();
      const realtimeProviderReady = Boolean(
        realtimeFrame?.contract === 'xin.music-frame/1'
        && realtimeFrame?.contractVersion === 1
        && realtimeFrame?.meta?.loudness?.sourceProvider === 'realtime.core'
        && realtimeFrame?.meta?.loudness?.available === false
        && realtimeFrame?.meta?.loudness?.fallbackReason === 'PROVIDER_UNAVAILABLE'
        && Number.isFinite(realtimeFrame?.clock?.nowMs)
      );
      const xldFrame = window.SmokeResonanceXldFrame?.get();
      const xldStatus = window.SmokeResonanceXldFrame?.status();
      const xldProviderReady = Boolean(
        xldFrame?.contract === 'xin.music-frame/1'
        && xldFrame?.contractVersion === 1
        && xldStatus
        && typeof xldStatus.loaded === 'boolean'
        && xldStatus.cache?.builds >= 0
      );
      const unifiedFrame = window.SmokeResonanceUnifiedMusicFrame?.get();
      const resolverStatus = window.SmokeResonanceUnifiedMusicFrame?.status();
      const unifiedFeatureIds = [
        'loudness', 'bass', 'mid', 'treble', 'dynamicRange',
        'spectralDensity', 'flux', 'flatness', 'sharpness',
        'buildEnergy', 'sectionDrive', 'rhythmPhase',
        'chordConfidence', 'silence', 'inBuild', 'inDrop',
        'inClimax', 'onset', 'bassPeak', 'sectionBoundary',
        'dropEnter', 'climaxEnter', 'chordChange', 'sectionId',
        'sectionLabel', 'chord'
      ];
      const unifiedFrameReady = Boolean(
        unifiedFrame?.contract === 'xin.music-frame/1'
        && unifiedFrame?.contractVersion === 1
        && Number.isFinite(unifiedFrame?.clock?.nowMs)
        && Number.isInteger(unifiedFrame?.transport?.epoch)
        && unifiedFeatureIds.every(featureId => unifiedFrame?.meta?.[featureId])
        && resolverStatus?.config?.realtimeTtlMs > 0
      );
      const inspectorStatus = window.SmokeResonanceSourceInspectorView?.status();
      const inspectorRows = [
        ...document.querySelectorAll(
          '#sourceInspector [data-inspector-feature]'
        )
      ];
      const sourceInspectorReady = Boolean(
        inspectorStatus
        && inspectorStatus.rateHz >= 5
        && inspectorStatus.rateHz <= 10
        && inspectorStatus.sampleCount > 0
        && inspectorRows.length === 26
        && !document.querySelector(
          '#sourceInspector input, #sourceInspector button, #sourceInspector select, #sourceInspector textarea'
        )
        && inspectorRows
          .filter(row => row.dataset.available === 'false')
          .every(row =>
            row.querySelector('[data-inspector-field="value"]')
              ?.textContent === 'UNKNOWN'
          )
      );
      const phaseIIGateReport = window.SmokeResonancePhaseIIGate?.get();
      const phaseIIGateStatus = window.SmokeResonancePhaseIIGate?.status();
      const phaseIIGateReady = Boolean(
        phaseIIGateReport
        && phaseIIGateStatus?.rateHz >= 5
        && phaseIIGateStatus?.rateHz <= 10
        && phaseIIGateStatus?.sampleCount > 0
        && phaseIIGateStatus?.formalPipeline === 'legacy'
        && phaseIIGateStatus?.comparatorMode === 'read-only'
        && phaseIIGateStatus?.legacyFrozenShape === true
        && phaseIIGateReport?.isolation?.readsLegacySnapshotOnly === true
        && phaseIIGateReport?.isolation?.writesLegacyBus === false
        && phaseIIGateReport?.isolation?.writesRenderer === false
        && phaseIIGateReport?.isolation?.writesTimeline === false
        && Object.keys(phaseIIGateReport?.comparisons || {}).length === 15
        && phaseIIGateReport?.resolverOnly?.length === 11
      );
      const generatorCanvas = document.querySelector('#generatorCanvas');
      const qualityButton = document.querySelector('#qualityButton');
      const initialQualityMode = qualityButton?.dataset.mode;
      qualityButton?.click();
      await new Promise(resolve => setTimeout(resolve, 90));
      const highQualityStatus =
        window.SmokeResonanceGeneratorRuntimeShadowView?.status();
      qualityButton?.click();
      await new Promise(resolve => setTimeout(resolve, 90));
      const ecoQualityStatus =
        window.SmokeResonanceGeneratorRuntimeShadowView?.status();
      qualityButton?.click();
      await new Promise(resolve => setTimeout(resolve, 90));
      const autoQualityStatus =
        window.SmokeResonanceGeneratorRuntimeShadowView?.status();
      const generatorQualityCycleReady = Boolean(
        initialQualityMode === 'auto'
        && highQualityStatus?.qualityMode === 'high'
        && highQualityStatus?.renderPort?.quality?.mode === 'high'
        && ecoQualityStatus?.qualityMode === 'eco'
        && ecoQualityStatus?.renderPort?.quality?.mode === 'eco'
        && autoQualityStatus?.qualityMode === 'auto'
        && autoQualityStatus?.renderPort?.quality?.mode === 'auto'
      );
      let generatorContextRecoveryReady = false;
      const generatorGl = generatorCanvas?.getContext('webgl2');
      const contextExtension = generatorGl?.getExtension('WEBGL_lose_context');
      if (contextExtension) {
        const waitFor = type => new Promise((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error('Timed out waiting for ' + type)),
            3000
          );
          generatorCanvas.addEventListener(type, event => {
            clearTimeout(timeout);
            resolve(event);
          }, { once: true });
        });
        const lostEvent = waitFor('webglcontextlost');
        contextExtension.loseContext();
        await lostEvent;
        await new Promise(resolve => setTimeout(resolve, 90));
        const lostStatus =
          window.SmokeResonanceGeneratorRuntimeShadowView?.status();
        await new Promise(resolve => setTimeout(resolve, 120));
        const restoredEvent = waitFor('webglcontextrestored');
        contextExtension.restoreContext();
        await restoredEvent;
        await new Promise(resolve => setTimeout(resolve, 300));
        const restoredStatus =
          window.SmokeResonanceGeneratorRuntimeShadowView?.status();
        generatorContextRecoveryReady = Boolean(
          lostStatus?.renderPort?.context?.state === 'lost'
          && restoredStatus?.renderPort?.context?.state === 'ready'
          && restoredStatus?.renderPort?.context?.contextLosses === 1
          && restoredStatus?.renderPort?.context?.contextRestores === 1
          && restoredStatus?.runtime?.profile?.gpuContextsCreated === 2
          && restoredStatus?.runtime?.profile?.rafRequests === 0
        );
      }
      const generatorRuntimeReport =
        window.SmokeResonanceGeneratorRuntimeShadowView?.get();
      const generatorRuntimeStatus =
        window.SmokeResonanceGeneratorRuntimeShadowView?.status();
      const generatorSourceStatus =
        window.SmokeResonanceGeneratorSourceView?.status();
      const materialRuntimeStatus =
        window.SmokeResonanceMaterialView?.status();
      const materialOutput =
        window.SmokeResonanceMaterialView?.outputs();
      const materialRegistry =
        window.SmokeResonanceMaterialView?.registry() || [];
      const materialTargets =
        window.SmokeResonanceMaterialView?.targets() || [];
      const materialRuntimeReady = Boolean(
        materialRuntimeStatus?.contract ===
          'xin.material-frame-orchestrator/1'
        && materialRuntimeStatus?.runtime?.contract ===
          'xin.material-runtime/1'
        && materialRuntimeStatus?.runtime?.activeMaterialId
        && materialRuntimeStatus?.sameFramePass === true
        && materialRuntimeStatus?.frameMismatchCount === 0
        && materialRegistry.length >= 12
        && materialTargets.length === 4
        && materialOutput?.contract === 'xin.material-output/1'
        && materialOutput?.color?.contract === 'xin.material-surface/1'
      );
      const materialSourceFrameAligned = Boolean(
        generatorSourceStatus?.extensionContract ===
          'xin.xml-material-source/1'
        && generatorSourceStatus?.materialAvailable === true
        && Number.isInteger(generatorSourceStatus?.materialFrameIndex)
        && generatorSourceStatus.materialFrameIndex ===
          materialRuntimeStatus?.frameIndex
        && generatorSourceStatus.materialFrameIndex ===
          materialOutput?.frameIndex
      );
      const generatorSourceReady = Boolean(
        generatorSourceStatus?.contract === 'xin.xml-visual-source/1'
        && generatorSourceStatus?.available === true
        && generatorSourceStatus?.sourceKind === 'base-canvas'
        && generatorSourceStatus?.formalPipeline === 'legacy'
        && generatorSourceStatus?.rendererEnabled === true
        && generatorCanvas
      );
      const generatorRuntimeShadowReady = Boolean(
        generatorRuntimeStatus?.enabled === true
        && generatorRuntimeStatus?.loadState === 'ready'
        && generatorRuntimeStatus?.packageVersion ===
          '6.6.1-integration-v.3'
        && generatorRuntimeStatus?.browserApiVersion === 1
        && generatorRuntimeStatus?.evaluateCalls > 0
        && generatorRuntimeStatus?.rendererEnabled === true
        && generatorRuntimeStatus?.formalPipeline === 'generator'
        && generatorRuntimeStatus?.version ===
          '5.3.0-product-json-loader'
        && generatorRuntimeStatus?.initialPresetId === 'balanced'
        && generatorRuntimeStatus?.runtime?.preset?.contract ===
          '5.1.0-product-preset'
        && generatorRuntimeStatus?.runtime?.preset?.id === 'balanced'
        && generatorRuntimeStatus?.runtime?.preset?.schemaVersion === 16
        && generatorRuntimeStatus?.runtime?.preset?.revision === 0
        && generatorRuntimeStatus?.runtime?.profile?.zeroGpu === false
        && generatorRuntimeStatus?.runtime?.profile?.renderCalls > 0
        && generatorRuntimeStatus?.runtime?.profile?.gpuContextsCreated === 2
        && generatorRuntimeStatus?.runtime?.profile?.canvasTouches > 0
        && generatorRuntimeStatus?.runtime?.profile?.rafRequests === 0
        && generatorRuntimeStatus?.renderReport?.status === 'rendered'
        && generatorRuntimeStatus?.renderReport?.output?.contract ===
          'xin.generator-source-render/1'
        && generatorRuntimeStatus?.renderReport?.output
          ?.targetBindingContract ===
          'xin.generator-target-uniform-bindings/1'
        && generatorRuntimeStatus?.renderReport?.output
          ?.targetBindingCount === 21
        && generatorRuntimeStatus?.renderReport?.output
          ?.targetBindings?.length === 21
        && generatorRuntimeStatus?.renderReport?.output
          ?.targetBindings?.every(binding =>
            typeof binding?.targetId === 'string'
            && typeof binding?.uniformName === 'string'
            && Number.isFinite(binding?.value)
          )
        && generatorRuntimeStatus?.qualityMode === 'auto'
        && generatorRuntimeStatus?.renderRequests >=
          generatorRuntimeStatus?.renderCalls
        && generatorRuntimeStatus?.renderPort?.quality?.mode === 'auto'
        && generatorRuntimeStatus?.renderPort?.context?.state === 'ready'
        && generatorRuntimeStatus?.renderPort?.context?.contextLosses === 1
        && generatorRuntimeStatus?.renderPort?.context?.contextRestores === 1
        && generatorRuntimeStatus?.renderReport?.output?.quality?.mode === 'auto'
        && generatorRuntimeStatus?.renderReport?.output?.context?.state === 'ready'
        && generatorRuntimeReport?.contract ===
          'xin.glitch-runtime-frame/1'
        && generatorRuntimeReport?.runtimeVersion ===
          '3.5.0-visual-clock'
        && generatorRuntimeReport?.sources?.contract ===
          'xin.glitch-source-frame/1'
        && generatorRuntimeReport?.sources?.registryVersion ===
          '3.3.0-shadow'
        && generatorRuntimeReport?.sources?.sourceCount === 27
        && generatorRuntimeReport?.sources?.excludedLabels?.join('|') ===
          'sectionId|sectionLabel|chord'
        && [
          'confidence.sectionBoundary',
          'confidence.chord',
          'confidence.climax',
          'harmony.chordHue'
        ].every(sourceId =>
          Object.prototype.hasOwnProperty.call(
            generatorRuntimeReport?.sources?.values || {},
            sourceId
          )
        )
        && generatorRuntimeReport?.sources?.meta?.['harmony.chordHue']
          ?.adapter === 'harmony-chord-hue'
        && generatorRuntimeReport?.visualIntent?.contract ===
          'xin.generator-target-intent/1'
        && Object.values(generatorRuntimeReport?.targets?.values || {})
          .every(Number.isFinite)
      );
      const productPresetList =
        window.SmokeResonanceGeneratorPresets?.list() || [];
      const productPresetsReady = Boolean(
        productPresetList.map(preset => preset.id).join('|') ===
          'balanced|temporal-excavation|raster-deflection|bitplane-drift|quantized-memory'
        && productPresetList.every(preset =>
          preset.schemaVersion === 16
          && preset.readOnly === true
          && preset.category === 'built-in'
        )
        && window.SmokeResonanceGeneratorPresets?.active()?.id === 'balanced'
      );
      let productPresetSwitchReady = false;
      try {
        window.SmokeResonanceGeneratorPresets.applyBuiltIn('temporal-excavation');
        await new Promise(resolve => setTimeout(resolve, 180));
        const temporalStatus =
          window.SmokeResonanceGeneratorRuntimeShadowView?.status();
        window.SmokeResonanceGeneratorPresets.applyBuiltIn('balanced');
        await new Promise(resolve => setTimeout(resolve, 180));
        const balancedStatus =
          window.SmokeResonanceGeneratorRuntimeShadowView?.status();
        productPresetSwitchReady = Boolean(
          temporalStatus?.runtime?.preset?.id === 'temporal-excavation'
          && temporalStatus?.runtime?.preset?.revision === 1
          && balancedStatus?.runtime?.preset?.id === 'balanced'
          && balancedStatus?.runtime?.preset?.revision === 2
          && balancedStatus?.renderReport?.status === 'rendered'
          && balancedStatus?.renderReport?.output?.targetBindings?.every(
            binding => Number.isFinite(binding?.value)
          )
        );
      } catch (error) {
        productPresetSwitchReady = false;
      }
      const productPresetRoot = document.querySelector('#generatorPresetControl');
      const productPresetButtons = [
        ...document.querySelectorAll('[data-product-preset-id]')
      ];
      const selectorBefore =
        window.SmokeResonanceGeneratorPresetControl?.status();
      let productPresetUiReady = false;
      try {
        document.querySelector('[data-product-preset-id="temporal-excavation"]')?.click();
        await new Promise(resolve => setTimeout(resolve, 180));
        const temporalUiStatus =
          window.SmokeResonanceGeneratorPresetControl?.status();
        const temporalRuntimeStatus =
          window.SmokeResonanceGeneratorRuntimeShadowView?.status();
        document.querySelector('[data-product-preset-id="raster-deflection"]')?.click();
        await new Promise(resolve => setTimeout(resolve, 180));
        const rasterUiStatus =
          window.SmokeResonanceGeneratorPresetControl?.status();
        document.querySelector('[data-product-preset-id="balanced"]')?.click();
        await new Promise(resolve => setTimeout(resolve, 180));
        const balancedUiStatus =
          window.SmokeResonanceGeneratorPresetControl?.status();
        const balancedRuntimeStatus =
          window.SmokeResonanceGeneratorRuntimeShadowView?.status();
        productPresetUiReady = Boolean(
          selectorBefore?.contract === 'xin.xml-generator-preset-selector/1'
          && selectorBefore?.version === '5.2.0-product-preset-selector'
          && selectorBefore?.state === 'ready'
          && selectorBefore?.activeId === 'balanced'
          && selectorBefore?.presetCount === 5
          && productPresetButtons.length === 5
          && productPresetButtons.every(button =>
            button.querySelector('strong')?.textContent?.trim()
            && button.querySelector('small')?.textContent?.trim()
          )
          && temporalUiStatus?.activeId === 'temporal-excavation'
          && temporalRuntimeStatus?.runtime?.preset?.id === 'temporal-excavation'
          && rasterUiStatus?.activeId === 'raster-deflection'
          && balancedUiStatus?.activeId === 'balanced'
          && balancedUiStatus?.state === 'ready'
          && balancedUiStatus?.revision === selectorBefore.revision + 3
          && balancedRuntimeStatus?.runtime?.preset?.id === 'balanced'
          && balancedRuntimeStatus?.renderReport?.status === 'rendered'
          && localStorage.getItem('xins-generator-product-preset-id') ===
            'balanced'
          && productPresetRoot?.dataset.state === 'ready'
          && productPresetRoot?.getAttribute('aria-busy') === 'false'
          && document.querySelectorAll(
            '[data-product-preset-id][aria-pressed="true"]'
          ).length === 1
          && document.querySelector(
            '[data-product-preset-id="balanced"]'
          )?.getAttribute('aria-pressed') === 'true'
        );
      } catch (error) {
        productPresetUiReady = false;
      }
      let productPresetJsonReady = false;
      try {
        const exportPayload =
          window.SmokeResonanceGeneratorPresetFiles.exportJson();
        const parsedExport = JSON.parse(exportPayload.json);
        const revisionBeforeReject =
          window.SmokeResonanceGeneratorRuntimeShadowView.status()
            .runtime.preset.revision;
        const invalidStage =
          window.SmokeResonanceGeneratorPresetFiles.stageJson('{broken');
        const invalidImport =
          window.SmokeResonanceGeneratorPresetFiles.importJson('{broken');
        const revisionAfterReject =
          window.SmokeResonanceGeneratorRuntimeShadowView.status()
            .runtime.preset.revision;

        const importedPreset = {
          ...parsedExport,
          id: 'runtime-import',
          name: 'Runtime Import'
        };
        const imported = window.SmokeResonanceGeneratorPresetFiles.importJson(
          JSON.stringify(importedPreset)
        );
        await new Promise(resolve => setTimeout(resolve, 180));
        const importedRuntime =
          window.SmokeResonanceGeneratorRuntimeShadowView.status();
        const customShader = {
          ...parsedExport,
          shaderPipeline: {
            passOrder: ['builtin-feedback', 'custom-glsl'],
            customPass: {
              enabled: true,
              label: 'Unsafe import',
              source: 'void main(){ fragColor = vec4(1.0); }'
            },
            uniformRegistry: []
          }
        };
        const shaderStage =
          window.SmokeResonanceGeneratorPresetFiles.stageJson(
            JSON.stringify(customShader)
          );

        document.querySelector('[data-product-preset-export]')?.click();
        await new Promise(resolve => setTimeout(resolve, 180));
        const exportedUi =
          window.SmokeResonanceGeneratorPresetFiles.status();
        document.querySelector('[data-product-preset-import]')?.click();
        await new Promise(resolve => setTimeout(resolve, 220));
        const importedUi =
          window.SmokeResonanceGeneratorPresetFiles.status();
        const ipcRuntime =
          window.SmokeResonanceGeneratorRuntimeShadowView.status();
        window.SmokeResonanceGeneratorPresetControl.select('balanced');
        await new Promise(resolve => setTimeout(resolve, 180));
        const restoredRuntime =
          window.SmokeResonanceGeneratorRuntimeShadowView.status();

        productPresetJsonReady = Boolean(
          exportPayload?.contract === 'xin.xml-generator-preset-file/1'
          && exportPayload?.filename === 'Xin-Glitch-balanced-schema16.json'
          && parsedExport.schemaVersion === 16
          && parsedExport.engineVersion === '6.6.1-integration-v.3'
          && Array.isArray(parsedExport.mappings)
          && parsedExport.mappings.length > 0
          && invalidStage?.code === 'PRESET_JSON_PARSE_FAILED'
          && invalidImport === null
          && revisionAfterReject === revisionBeforeReject
          && imported?.applied === true
          && imported?.appliedPreset?.id === 'runtime-import'
          && importedRuntime?.runtime?.preset?.id === 'runtime-import'
          && shaderStage?.valid === false
          && shaderStage?.code === 'PRESET_SHADER_PIPELINE_REQUIRES_EDITOR'
          && exportedUi?.exports === 1
          && exportedUi?.desktopFiles === true
          && importedUi?.imports === 2
          && ipcRuntime?.runtime?.preset?.id === 'ipc-import'
          && restoredRuntime?.runtime?.preset?.id === 'balanced'
          && restoredRuntime?.renderReport?.status === 'rendered'
          && restoredRuntime?.renderReport?.output?.targetBindings?.every(
            binding => Number.isFinite(binding?.value)
          )
          && localStorage.getItem('xins-generator-product-preset-id') ===
            'balanced'
        );
      } catch (error) {
        productPresetJsonReady = false;
      }
      let productPresetRepositoryReady = false;
      try {
        const repositoryApi =
          window.SmokeResonanceGeneratorPresetRepository;
        const initialRepository = repositoryApi.status();
        const balancedSaved = await repositoryApi.saveCurrent();
        const baseExport =
          window.SmokeResonanceGeneratorPresetFiles.exportJson();
        const customPreset = {
          ...JSON.parse(baseExport.json),
          id: 'repository-runtime',
          name: 'Repository Runtime'
        };
        const customImported =
          window.SmokeResonanceGeneratorPresetFiles.importJson(
            JSON.stringify(customPreset)
          );
        const customSaved = await repositoryApi.saveCurrent();
        window.SmokeResonanceGeneratorPresetControl.select('balanced');
        await new Promise(resolve => setTimeout(resolve, 120));
        const userLoaded = await repositoryApi.load(
          'user',
          customSaved?.entry?.key
        );
        await new Promise(resolve => setTimeout(resolve, 120));
        const loadedRuntime =
          window.SmokeResonanceGeneratorRuntimeShadowView.status();
        const recoveredDeleteRejected = await repositoryApi.remove(
          'recovered',
          'missing.json'
        );
        const customRemoved = await repositoryApi.remove(
          'user',
          customSaved?.entry?.key
        );
        await repositoryApi.load('builtIn', 'balanced');
        await new Promise(resolve => setTimeout(resolve, 120));
        const finalRepository = repositoryApi.status();
        const finalRuntime =
          window.SmokeResonanceGeneratorRuntimeShadowView.status();
        const repositoryRoot =
          document.querySelector('#generatorPresetRepository');
        const builtInItems = document.querySelectorAll(
          '[data-preset-repository-category="builtIn"] .preset-repository-item'
        );
        const userItems = document.querySelectorAll(
          '[data-preset-repository-category="user"] .preset-repository-item'
        );
        productPresetRepositoryReady = Boolean(
          initialRepository?.contract ===
            'xin.xml-generator-preset-repository-ui/1'
          && initialRepository?.version ===
            '5.4.0-file-repository-ui'
          && initialRepository?.state === 'ready'
          && initialRepository?.root ===
            'runtime-smoke://Glitch Presets'
          && initialRepository?.counts?.builtIn === 5
          && initialRepository?.counts?.user === 0
          && initialRepository?.counts?.recovered === 0
          && initialRepository?.desktopRepository === true
          && balancedSaved?.ok === true
          && customImported?.applied === true
          && customSaved?.ok === true
          && userLoaded?.applied === true
          && loadedRuntime?.runtime?.preset?.id === 'repository-runtime'
          && recoveredDeleteRejected === null
          && customRemoved?.ok === true
          && finalRepository?.counts?.builtIn === 5
          && finalRepository?.counts?.user === 1
          && finalRepository?.counts?.recovered === 0
          && finalRuntime?.runtime?.preset?.id === 'balanced'
          && builtInItems.length === 5
          && userItems.length === 1
          && document.querySelectorAll(
            '[data-preset-repository-remove]'
          ).length === 1
          && !document.querySelector(
            '[data-preset-repository-category="builtIn"] [data-preset-repository-remove]'
          )
          && !document.querySelector(
            '[data-preset-repository-category="recovered"] [data-preset-repository-remove]'
          )
          && repositoryRoot?.dataset.state === 'ready'
          && repositoryRoot?.getAttribute('aria-busy') === 'false'
        );
      } catch (error) {
        productPresetRepositoryReady = false;
      }
      let productControlDockReady = false;
      let productControlDiagnostics = null;
      try {
        const productApi = window.SmokeResonanceProductControls;
        const productRoot = document.querySelector('#productControlDock');
        const dockMaster = document.querySelector('[data-product-fx-master]');
        const ownerMaster = document.querySelector('#fusionMaster');
        const dockQuality = document.querySelector('[data-product-quality]');
        const ownerQuality = document.querySelector('#qualityButton');
        const initialProduct = productApi.status();

        dockMaster.value = '165';
        dockMaster.dispatchEvent(new Event('input', { bubbles: true }));
        const delegatedMaster = productApi.status();
        ownerMaster.value = '125';
        ownerMaster.dispatchEvent(new Event('input', { bubbles: true }));

        dockQuality.click();
        await Promise.resolve();
        const highQuality = productApi.status();
        dockQuality.click();
        await Promise.resolve();
        dockQuality.click();
        await Promise.resolve();
        const restoredQuality = productApi.status();

        const xldOpened = await productApi.openXld();
        const generatorOpened = await productApi.openGenerator();
        const finalProduct = productApi.status();
        const productStyle = getComputedStyle(productRoot);
        productControlDiagnostics = {
          root: productRoot?.getBoundingClientRect()?.toJSON?.() || null,
          controls: [
            '[data-product-fx-master]',
            '[data-product-quality]',
            '[data-product-source]',
            '[data-product-open-xld]',
            '[data-product-open-generator]'
          ].map(selector => {
            const element = document.querySelector(selector);
            return {
              selector,
              display: element ? getComputedStyle(element).display : '',
              rect: element?.getBoundingClientRect()?.toJSON?.() || null
            };
          })
        };
        productControlDockReady = Boolean(
          initialProduct?.contract === 'xin.xml-product-control-dock/1'
          && initialProduct?.version === '5.5.0-productization'
          && initialProduct?.masterPercent === 125
          && initialProduct?.qualityMode === 'auto'
          && initialProduct?.desktopTools === true
          && delegatedMaster?.masterPercent === 165
          && ownerMaster.value === '125'
          && document.querySelector('[data-product-fx-master-output]')
            ?.textContent === '125%'
          && highQuality?.qualityMode === 'high'
          && ownerQuality?.dataset.mode === 'auto'
          && restoredQuality?.qualityMode === 'auto'
          && xldOpened?.ok === true
          && generatorOpened?.ok === true
          && generatorOpened?.version === '6.6.1-integration-v.3'
          && finalProduct?.lastTool === 'generator'
          && finalProduct?.lastError === null
          && finalProduct?.source?.label
          && finalProduct?.updateIntervalMs === 250
          && productRoot?.querySelector('[data-product-source]')
          && productRoot?.querySelector('[data-product-open-xld]')
          && productRoot?.querySelector('[data-product-open-generator]')
          && productStyle?.display !== 'none'
        );
      } catch (error) {
        productControlDockReady = false;
      }
      const targetInspectorReport =
        window.SmokeResonanceTargetInspectorView?.get();
      const targetInspectorStatus =
        window.SmokeResonanceTargetInspectorView?.status();
      const targetInspectorRows = [
        ...document.querySelectorAll(
          '#targetInspector [data-target-intent]'
        )
      ];
      const targetInspectorReady = Boolean(
        targetInspectorStatus?.rateHz >= 5
        && targetInspectorStatus?.rateHz <= 10
        && targetInspectorStatus?.sampleCount > 0
        && targetInspectorStatus?.formalPipeline === 'generator'
        && targetInspectorStatus?.comparatorMode === 'visual-intent-only'
        && targetInspectorReport?.formalPipeline === 'generator'
        && targetInspectorReport?.comparatorMode === 'visual-intent-only'
        && targetInspectorReport?.comparison?.length === 5
        && targetInspectorReport?.timeline?.length > 0
        && targetInspectorReport?.safety?.physicalCapActive === true
        && targetInspectorRows.length === 5
        && !document.querySelector(
          '#targetInspector input, #targetInspector button, #targetInspector select, #targetInspector textarea'
        )
      );
      const shadowStabilityReport =
        window.SmokeResonanceShadowStabilityGate?.get();
      const shadowStabilityStatus =
        window.SmokeResonanceShadowStabilityGate?.status();
      const frameOwnershipReport =
        window.SmokeResonanceFrameOwnershipGate?.get();
      const frameOwnershipStatus =
        window.SmokeResonanceFrameOwnershipGate?.status();
      const frameOwnershipReady = Boolean(
        frameOwnershipReport?.contract ===
          'xin.xml-generator-frame-ownership/1'
        && frameOwnershipReport?.version ===
          '4.5.0-single-raf-formal-gate'
        && frameOwnershipReport?.formalPipeline === 'generator'
        && frameOwnershipReport?.owner === 'legacy.animate'
        && frameOwnershipReport?.continuousRafOwners === 1
        && frameOwnershipReport?.subscriber === 'generator-runtime-shadow'
        && frameOwnershipReport?.subscriberMode ===
          'synchronous-engine-clock'
        && frameOwnershipReport?.observedFrames > 20
        && frameOwnershipReport?.readyFrames > 20
        && frameOwnershipReport?.rafRequestsPeak === 0
        && frameOwnershipReport?.violationCount === 0
        && frameOwnershipReport?.pass === true
        && frameOwnershipStatus?.pass === true
      );
      const shadowTelemetryBridgeAvailable =
        typeof window.XinsMusicLabFusion?.shadowTelemetry === 'function';
      const visibleClockRequired = ${process.env.SMOKE_VISIBLE === '1'};
      const shadowStabilityReady = Boolean(
        shadowStabilityStatus?.rateHz >= 5
        && shadowStabilityStatus?.rateHz <= 10
        && shadowStabilityStatus?.sampleCount > 0
        && shadowStabilityStatus?.formalPipeline === 'generator'
        && shadowStabilityStatus?.rendererEnabled === true
        && shadowStabilityReport?.formalPipeline === 'generator'
        && shadowStabilityReport?.rendererEnabled === true
        && shadowStabilityReport?.runtimeReady === true
        && shadowStabilityReport?.targets?.finite === true
        && shadowStabilityReport?.renderer?.zeroGpu === false
        && shadowStabilityReport?.renderer?.renderCalls > 0
        && shadowStabilityReport?.renderer?.gpuContextsCreated === 2
        && shadowStabilityReport?.renderer?.canvasTouches > 0
        && shadowStabilityReport?.renderer?.rafRequests === 0
        && shadowStabilityReport?.renderer?.context?.state === 'ready'
        && shadowStabilityReport?.renderer?.context?.contextLosses === 1
        && shadowStabilityReport?.renderer?.context?.contextRestores === 1
        && shadowStabilityReport?.renderer?.quality?.mode === 'auto'
        && shadowStabilityReport?.eventVoices?.bounded === true
        && shadowTelemetryBridgeAvailable
        && shadowStabilityReport?.telemetry?.samples > 0
        && (!visibleClockRequired ||
          shadowStabilityStatus?.sampleCount >= 20)
        && shadowStabilityReport?.gate?.status ===
          (${configuredStabilityMs} >= 30000 ? 'PASS' : 'PROVISIONAL')
        && !shadowStabilityReport?.gate?.reasons?.includes('RENDERER_NOT_ACTIVE')
        && !shadowStabilityReport?.gate?.reasons?.includes('RENDERER_CONTEXT_COUNT')
        && !shadowStabilityReport?.gate?.reasons?.includes('SECOND_RAF_DETECTED')
        && !document.querySelector(
          '#shadowStabilityGate input, #shadowStabilityGate button, #shadowStabilityGate select, #shadowStabilityGate textarea'
        )
      );
      const stage = document.querySelector('main.stage');
      const nativeEffects = [...document.querySelectorAll('[data-effect]')]
        .map(button => button.dataset.effect)
        .filter(effect => effect && !effect.startsWith('beta-'));
      const failedNativeEffects = [];
      const phase2MaterialReports = {};
      const phase2SharedMappingReports = {};
      const phase2PresetIds = [
        'balanced',
        'temporal-excavation',
        'raster-deflection'
      ];
      for (const effect of nativeEffects) {
        document.querySelector('[data-effect="' + effect + '"]')?.click();
        await new Promise(resolve => setTimeout(resolve, 55));
        if (stage?.dataset.effect !== effect) failedNativeEffects.push(effect);
        if (effect === 'spectral-fabric' || effect === 'temporal-strata') {
          window.SmokeResonanceMaterialView?.clearTargets();
          await new Promise(resolve => setTimeout(resolve, 180));
          const sharedGeneratorReport =
            window.SmokeResonanceGeneratorRuntimeShadowView?.get();
          const sharedGeneratorStatus =
            window.SmokeResonanceGeneratorRuntimeShadowView?.status();
          const sharedMaterialStatus =
            window.SmokeResonanceMaterialView?.status();
          const sharedMaterialOutput =
            window.SmokeResonanceMaterialView?.outputs();
          const sharedParameters =
            window.SmokeResonanceMaterialView?.parameters() || {};
          const sharedTargetValues =
            sharedGeneratorReport?.targets?.values || {};
          phase2SharedMappingReports[effect] = {
            materialId: sharedMaterialOutput?.materialId || null,
            materialFrameIndex: sharedMaterialOutput?.frameIndex ?? null,
            generatorFrameIndex:
              sharedGeneratorStatus?.renderReport?.output?.frameIndex ?? null,
            materialStatusFrameIndex:
              sharedMaterialStatus?.frameIndex ?? null,
            mappingExtension:
              sharedGeneratorStatus?.mappingExtension || null,
            targetBindingCount:
              sharedGeneratorStatus?.renderReport?.output
                ?.targetBindingCount ?? null,
            availableFieldIds:
              sharedGeneratorStatus?.renderReport?.output
                ?.materialFields?.availableIds || [],
            materialFieldContract:
              sharedGeneratorStatus?.renderReport?.output
                ?.materialFields?.contract || null,
            mappedValues: Object.fromEntries(
              Object.entries(sharedTargetValues)
                .filter(([id]) => id.startsWith('material.'))
            ),
            parameters: Object.fromEntries(
              Object.entries(sharedParameters)
                .filter(([id]) => id.startsWith('material.'))
            )
          };
          window.SmokeResonanceMaterialView?.setTargets({
            'material.coverage': .82,
            'material.continuity': .68,
            'material.refreshRate': effect === 'temporal-strata' ? 0 : 1,
            'material.density': .64
          });
          const presetReports = [];
          for (const presetId of phase2PresetIds) {
            window.SmokeResonanceGeneratorPresetControl?.select(presetId);
            await new Promise(resolve => setTimeout(resolve, 120));
            const output = window.SmokeResonanceMaterialView?.outputs();
            const status = window.SmokeResonanceMaterialView?.status();
            const source = window.SmokeResonanceGeneratorSourceView?.status();
            const generator =
              window.SmokeResonanceGeneratorRuntimeShadowView?.status();
            presetReports.push({
              presetId,
              outputContract: output?.contract || null,
              materialId: output?.materialId || null,
              fieldIds: Object.keys(output?.fields || {}).sort(),
              frameIndex: output?.frameIndex ?? null,
              runtimeFrameIndex: status?.frameIndex ?? null,
              sourceFrameIndex: source?.materialFrameIndex ?? null,
              sourceKind: source?.sourceKind || null,
              generatorRenderStatus: generator?.renderReport?.status || null,
              metrics: status?.runtime?.material?.metrics || null,
              refreshIntervalMs:
                status?.runtime?.material?.refreshIntervalMs ?? null
            });
          }
          phase2MaterialReports[effect] = presetReports;
        }
      }
      window.SmokeResonanceGeneratorPresetControl?.select('balanced');
      window.SmokeResonanceMaterialView?.clearTargets();
      const phase2MaterialsReady = Boolean(
        ['spectral-fabric', 'temporal-strata'].every(effect => {
          const expectedFields = effect === 'temporal-strata'
            ? 'age|density'
            : 'density';
          const reports = phase2MaterialReports[effect] || [];
          return reports.length === phase2PresetIds.length
            && reports.every(report =>
              report.outputContract === 'xin.material-output/1'
              && report.materialId === effect
              && report.fieldIds.join('|') === expectedFields
              && Number.isInteger(report.frameIndex)
              && report.frameIndex === report.runtimeFrameIndex
              && report.frameIndex === report.sourceFrameIndex
              && report.sourceKind === 'material-canvas'
              && report.generatorRenderStatus === 'rendered'
              && Number.isFinite(report.metrics?.coverage)
              && Number.isFinite(report.metrics?.meanFrameDifference)
              && Number.isFinite(report.metrics?.actualRefreshRate)
              && (
                effect !== 'temporal-strata'
                || report.refreshIntervalMs >= 1450
              )
            );
        })
      );
      const phase2SharedMappingReady = Boolean(
        ['spectral-fabric', 'temporal-strata'].every(effect => {
          const expectedFields = effect === 'temporal-strata'
            ? 'age|density'
            : 'density';
          const report = phase2SharedMappingReports[effect];
          const mappedIds = Object.keys(report?.mappedValues || {}).sort();
          return report?.materialId === effect
            && Number.isInteger(report.materialFrameIndex)
            && report.materialFrameIndex === report.generatorFrameIndex
            && report.materialFrameIndex === report.materialStatusFrameIndex
            && report.mappingExtension?.targetCount === 4
            && report.mappingExtension?.mappingCount === 4
            && report.targetBindingCount === 21
            && report.availableFieldIds.slice().sort().join('|') ===
              expectedFields
            && report.materialFieldContract ===
              'xin.generator-material-fields/1'
            && mappedIds.join('|') === [
              'material.continuity',
              'material.coverage',
              'material.density',
              'material.refreshRate'
            ].join('|')
            && mappedIds.every(id =>
              Number.isFinite(report.mappedValues[id])
              && report.parameters[id] === report.mappedValues[id]
            );
        })
      );
      document.querySelector('[data-effect="temporal-strata"]')?.click();
      await new Promise(resolve => setTimeout(resolve, 80));
      const phase2LifecycleReports = [];
      for (const reason of ['pause', 'seek', 'track-change']) {
        window.SmokeResonanceMaterialView?.reset(reason);
        await new Promise(resolve => setTimeout(resolve, 80));
        const status = window.SmokeResonanceMaterialView?.status();
        const generator =
          window.SmokeResonanceGeneratorRuntimeShadowView?.status();
        phase2LifecycleReports.push({
          reason,
          lastResetReason:
            status?.runtime?.material?.lastResetReason || null,
          materialFrameIndex: status?.frameIndex ?? null,
          generatorFrameIndex:
            generator?.renderReport?.output?.frameIndex ?? null,
          sameFramePass: status?.sameFramePass === true
        });
      }
      const phase2LifecycleReady = phase2LifecycleReports.every(report =>
        report.lastResetReason === report.reason
        && Number.isInteger(report.materialFrameIndex)
        && report.materialFrameIndex === report.generatorFrameIndex
        && report.sameFramePass
      );
      document.querySelector('#calibrationButton')?.click();
      const fxPanel = document.querySelector('#glitchPanel');
      fxPanel.style.transition = 'none';
      fxPanel.style.left = '9999px';
      fxPanel.style.top = '9999px';
      fxPanel.style.right = 'auto';
      document.querySelector('#glitchSettingsButton')?.click();
      await new Promise(resolve => setTimeout(resolve, 700));
      const fxPanelStyle = fxPanel ? getComputedStyle(fxPanel) : null;
      const fxPanelRect = fxPanel?.getBoundingClientRect();
      const fxPanelActuallyVisible = Boolean(
        fxPanel?.classList.contains('is-open')
        && fxPanelStyle?.display !== 'none'
        && fxPanelStyle?.visibility === 'visible'
        && Number(fxPanelStyle?.opacity) > .9
        && fxPanelRect?.width > 280
        && fxPanelRect?.height > 120
        && fxPanelRect?.right > 0
        && fxPanelRect?.left < window.innerWidth
        && fxPanelRect?.top >= 0
        && fxPanelRect?.bottom <= window.innerHeight
      );
      const calibrationAndFxCoexist = document.querySelector('#calibrationPanel')?.classList.contains('is-open')
        && fxPanelActuallyVisible;
      const topFxPower = document.querySelector('#glitchPowerButton');
      window.SmokeResonanceGlitch.set({ enabled: true });
      await new Promise(resolve => setTimeout(resolve, 320));
      const topFxPowerShowsOn = topFxPower?.getAttribute('aria-pressed') === 'true'
        && topFxPower?.textContent.trim() === 'FX ON';
      const generatorOutputActiveStatus =
        window.SmokeResonanceGeneratorOutput?.status();
      const generatorOutputActive = Boolean(
        generatorOutputActiveStatus?.contract ===
          'xin.xml-generator-output/1'
        && generatorOutputActiveStatus?.version ===
          '4.5.0-formal-output-switch'
        && generatorOutputActiveStatus?.configuredPipeline === 'generator'
        && generatorOutputActiveStatus?.activePipeline === 'generator'
        && generatorOutputActiveStatus?.visible === true
        && generatorOutputActiveStatus?.ownershipPass === true
        && generatorOutputActiveStatus?.contextState === 'ready'
        && generatorOutputActiveStatus?.requiredBindingCount === 21
        && stage?.classList.contains('generator-renderer-on')
        && stage?.dataset.generatorOutput === 'generator'
        && Number(getComputedStyle(generatorCanvas).opacity) > .75
        && window.SmokeResonanceGeneratorOutput?.snapshotCanvas() ===
          generatorCanvas
      );
      topFxPower?.click();
      await new Promise(resolve => setTimeout(resolve, 260));
      const topFxPowerBypasses = window.SmokeResonanceGlitch.get().enabled === false
        && topFxPower?.getAttribute('aria-pressed') === 'false'
        && topFxPower?.textContent.trim() === 'FX OFF';
      const generatorOutputBypassStatus =
        window.SmokeResonanceGeneratorOutput?.status();
      const generatorOutputBypasses = Boolean(
        generatorOutputBypassStatus?.activePipeline === 'legacy-bypass'
        && generatorOutputBypassStatus?.fxBypassed === true
        && generatorOutputBypassStatus?.visible === false
        && generatorOutputBypassStatus?.reasons?.includes('FX_BYPASS')
        && !stage?.classList.contains('generator-renderer-on')
        && stage?.dataset.generatorOutput === 'legacy-bypass'
        && Number(getComputedStyle(generatorCanvas).opacity) < .25
        && window.SmokeResonanceGeneratorOutput?.snapshotCanvas() === null
      );
      topFxPower?.click();
      await new Promise(resolve => setTimeout(resolve, 320));
      const generatorOutputReactivatedStatus =
        window.SmokeResonanceGeneratorOutput?.status();
      const generatorOutputReactivates = Boolean(
        generatorOutputReactivatedStatus?.activePipeline === 'generator'
        && generatorOutputReactivatedStatus?.visible === true
        && generatorOutputReactivatedStatus?.promotions >= 2
        && generatorOutputReactivatedStatus?.bypasses >= 1
        && stage?.classList.contains('generator-renderer-on')
      );
      document.querySelector('#mappingLabButton')?.click();
      const mappingAndFxCoexist = document.querySelector('#mappingLabPanel')?.classList.contains('is-open')
        && document.querySelector('#glitchPanel')?.classList.contains('is-open');
      const sectionState = window.SmokeResonanceSections.get();
      const sectionEnginesReady = ['our', 'fused', 'foote', 'recurrence'].every(id => Boolean(sectionState?.engines?.[id]));
      window.SmokeResonanceSections.enable('foote', false);
      const sectionToggleWorks = window.SmokeResonanceSections.get().enabled.foote === false;
      window.SmokeResonanceSections.enable('foote', true);
      const sectionCardsPresent = document.querySelectorAll('[data-section-engine-toggle]').length === 4;
      const fusionConfigWorks = window.SmokeResonanceSections.config({ confirmMs: 2600 }).confirmMs === 2600;
      const harmonyApiReady = Boolean(window.SmokeResonanceSections.harmony()) && document.querySelectorAll('[data-section-chord]').length === 1;
      const pulsarLayouts = ['folded', 'sweep', 'stereo'];
      const failedPulsarLayouts = pulsarLayouts.filter(layout => {
        window.SmokeResonancePulsar.layout(layout);
        return window.SmokeResonancePulsar.get().layout !== layout;
      });
      window.SmokeResonanceGlitch.set({ enabled: true, baseLayer: 1, noiseLayer: .8, burstLayer: 1.2 });
      await new Promise(resolve => setTimeout(resolve, 1200));
      const glitchState = window.SmokeResonanceGlitch.state();
      const glitchStateFinite = ['base', 'noise', 'burst', 'tension'].every(key => Number.isFinite(glitchState[key]));
      window.SmokeResonanceGlitch.set({ enabled: false });
      window.SmokeResonanceDirector.set(true);
      document.querySelector('[data-effect="pulsar"]')?.click();
      const manualSelectionReleasesDirector = window.SmokeResonanceDirector.get().enabled === false;
      const localeControl = document.querySelector('#localeControl');
      const readLocaleDomainState = () => ({
        effect: stage?.dataset.effect || '',
        canvasCount: document.querySelectorAll('canvas').length,
        fxPower: document.querySelector('#glitchPowerButton')?.getAttribute('aria-pressed') || '',
        sourceInternal: document.querySelector('#topModeInternal')?.getAttribute('aria-pressed') || '',
        mappingOpen: document.querySelector('#mappingLabPanel')?.classList.contains('is-open') || false
      });
      const readDynamicLocaleState = locale => {
        const messages = window.XinMusicLabI18nCatalogs?.MESSAGE_CATALOGS?.[locale] || {};
        const values = {
          fusion: document.querySelector('#fusionPanel > .calibration-head h2')?.textContent || '',
          mapping: document.querySelector('#mappingLabPanel .calibration-head h2')?.textContent || '',
          glitch: document.querySelector('#glitchPanel > .calibration-head h2')?.textContent || '',
          quality: document.querySelector('#qualityButton')?.textContent || '',
          director: document.querySelector('#directorToggle')?.textContent || '',
          conductor: document.querySelector('#conductorToggle')?.textContent || '',
          pin: document.querySelector('#pinButton')?.textContent || ''
        };
        return {
          values,
          matchesCatalog:
            values.fusion === messages['fusion.title']
            && values.mapping === messages['mapping.title']
            && values.glitch === messages['glitch.title']
            && values.quality === messages['runtime.quality.auto']
            && values.director === messages['runtime.director.off']
            && values.conductor === messages['runtime.conductor.off']
            && values.pin === messages['runtime.pin.off']
        };
      };
      const localeDomainBefore = readLocaleDomainState();
      document.querySelector('[data-locale="en-US"]')?.click();
      await new Promise(resolve => setTimeout(resolve, 30));
      const englishLocaleState = { ...window.xinMusicLabLocale.getState() };
      const englishDesktopLocale = await window.SmokeResonanceDesktop?.getLocale?.();
      const englishLocaleActive = document.querySelector('[data-locale="en-US"]')?.classList.contains('is-active') || false;
      const englishStaticShell = {
        source: document.querySelector('[data-i18n="engine.localLibrary"]')?.textContent || '',
        calibration: document.querySelector('[data-i18n="engine.calibration"]')?.textContent || '',
        catalog: document.querySelector('[data-i18n="catalog.classic"]')?.textContent || '',
        welcome: document.querySelector('[data-i18n="welcome.connect"]')?.textContent || '',
        canvasAria: document.querySelector('#visualizer')?.getAttribute('aria-label') || ''
      };
      const englishDynamicShell = readDynamicLocaleState('en-US');
      document.querySelector('[data-locale="zh-CN"]')?.click();
      await new Promise(resolve => setTimeout(resolve, 30));
      const chineseLocaleState = { ...window.xinMusicLabLocale.getState() };
      const chineseDesktopLocale = await window.SmokeResonanceDesktop?.getLocale?.();
      const chineseStaticShell = {
        source: document.querySelector('[data-i18n="engine.localLibrary"]')?.textContent || '',
        calibration: document.querySelector('[data-i18n="engine.calibration"]')?.textContent || '',
        catalog: document.querySelector('[data-i18n="catalog.classic"]')?.textContent || '',
        welcome: document.querySelector('[data-i18n="welcome.connect"]')?.textContent || '',
        canvasAria: document.querySelector('#visualizer')?.getAttribute('aria-label') || ''
      };
      const chineseDynamicShell = readDynamicLocaleState('zh-CN');
      const localeDomainAfter = readLocaleDomainState();
      const localeUiReady = Boolean(window.__xinMusicLabLocaleUi && localeControl);
      const localeControlVisible = Boolean(localeControl && getComputedStyle(localeControl).display !== 'none');
      const localeStateStable = JSON.stringify(localeDomainBefore) === JSON.stringify(localeDomainAfter);
      return {
        title: document.title,
        apisReady,
        realtimeProviderReady,
        xldProviderReady,
        unifiedFrameReady,
        resolverStatus,
        sourceInspectorReady,
        inspectorStatus,
        phaseIIGateReady,
        phaseIIGateStatus,
        phaseIIGateReport,
        generatorRuntimeShadowReady,
        generatorQualityCycleReady,
        generatorContextRecoveryReady,
        materialRuntimeReady,
        materialSourceFrameAligned,
        materialRuntimeStatus,
        materialOutput,
        materialRegistry,
        materialTargets,
        generatorSourceReady,
        generatorSourceStatus,
        generatorRuntimeStatus,
        generatorRuntimeReport,
        productPresetsReady,
        productPresetSwitchReady,
        productPresetUiReady,
        productPresetJsonReady,
        productPresetRepositoryReady,
        productControlDockReady,
        productControlDiagnostics,
        targetInspectorReady,
        targetInspectorStatus,
        targetInspectorReport,
        shadowStabilityReady,
        frameOwnershipReady,
        frameOwnershipStatus,
        frameOwnershipReport,
        shadowStabilityStatus,
        shadowStabilityReport,
        shadowTelemetryBridgeAvailable,
        failedNativeEffects,
        phase2MaterialsReady,
        phase2MaterialReports,
        phase2SharedMappingReady,
        phase2SharedMappingReports,
        phase2LifecycleReady,
        phase2LifecycleReports,
        calibrationAndFxCoexist,
        fxPanelActuallyVisible,
        fxPanelDiagnostics: {
          inlineLeft: fxPanel?.style.left || '',
          inlineTop: fxPanel?.style.top || '',
          display: fxPanelStyle?.display || '',
          visibility: fxPanelStyle?.visibility || '',
          opacity: fxPanelStyle?.opacity || '',
          rect: fxPanelRect ? {
            left: fxPanelRect.left,
            top: fxPanelRect.top,
            right: fxPanelRect.right,
            bottom: fxPanelRect.bottom,
            width: fxPanelRect.width,
            height: fxPanelRect.height
          } : null,
          viewport: { width: window.innerWidth, height: window.innerHeight }
        },
        topFxPowerShowsOn,
        topFxPowerBypasses,
        generatorOutputActive,
        generatorOutputBypasses,
        generatorOutputReactivates,
        generatorOutputActiveStatus,
        generatorOutputBypassStatus,
        generatorOutputReactivatedStatus,
        mappingAndFxCoexist,
        sectionEnginesReady,
        sectionToggleWorks,
        sectionCardsPresent,
        fusionConfigWorks,
        harmonyApiReady,
        failedPulsarLayouts,
        glitchStateFinite,
        manualSelectionReleasesDirector,
        localeUiReady,
        localeControlVisible,
        localeStateStable,
        englishLocaleState,
        englishDesktopLocale,
        englishLocaleActive,
        englishStaticShell,
        englishDynamicShell,
        chineseLocaleState,
        chineseDesktopLocale,
        chineseStaticShell,
        chineseDynamicShell,
        canvases: document.querySelectorAll('canvas').length,
        activeEffect: stage?.dataset.effect || ''
      };
    })()`);
    result.testVisibility = testVisibility;
    result.visibilityLifecycle = visibilityLifecycle;
    result.configuredStabilityMs = configuredStabilityMs;
    result.runtimeNativeLocaleCalls = [...runtimeNativeLocaleCalls];
    result.runtimeGeneratorOpenLocales = [...runtimeGeneratorOpenLocales];
    const assertions = {
      title: result.title.includes('Xin'),
      apisReady: result.apisReady,
      realtimeProviderReady: result.realtimeProviderReady,
      xldProviderReady: result.xldProviderReady,
      unifiedFrameReady: result.unifiedFrameReady,
      sourceInspectorReady: result.sourceInspectorReady,
      phaseIIGateReady: result.phaseIIGateReady,
      generatorRuntimeShadowReady: result.generatorRuntimeShadowReady,
      productPresetsReady: result.productPresetsReady,
      productPresetSwitchReady: result.productPresetSwitchReady,
      productPresetUiReady: result.productPresetUiReady,
      productPresetJsonReady: result.productPresetJsonReady,
      productPresetRepositoryReady: result.productPresetRepositoryReady,
      productControlDockReady: result.productControlDockReady,
      generatorQualityCycleReady: result.generatorQualityCycleReady,
      generatorContextRecoveryReady: result.generatorContextRecoveryReady,
      materialRuntimeReady: result.materialRuntimeReady,
      materialSourceFrameAligned: result.materialSourceFrameAligned,
      generatorSourceReady: result.generatorSourceReady,
      targetInspectorReady: result.targetInspectorReady,
      shadowStabilityReady: result.shadowStabilityReady,
      frameOwnershipReady: result.frameOwnershipReady,
      visibilityPauseResume:
        visibilityLifecycle.tested &&
        visibilityLifecycle.pausedWhileHidden &&
        visibilityLifecycle.resumedAfterShow,
      nativeEffects: result.failedNativeEffects.length === 0,
      phase2MaterialsReady: result.phase2MaterialsReady,
      phase2SharedMappingReady: result.phase2SharedMappingReady,
      phase2LifecycleReady: result.phase2LifecycleReady,
      calibrationAndFxCoexist: result.calibrationAndFxCoexist,
      fxPanelActuallyVisible: result.fxPanelActuallyVisible,
      topFxPowerShowsOn: result.topFxPowerShowsOn,
      topFxPowerBypasses: result.topFxPowerBypasses,
      generatorOutputActive: result.generatorOutputActive,
      generatorOutputBypasses: result.generatorOutputBypasses,
      generatorOutputReactivates: result.generatorOutputReactivates,
      mappingAndFxCoexist: result.mappingAndFxCoexist,
      sectionEnginesReady: result.sectionEnginesReady,
      sectionToggleWorks: result.sectionToggleWorks,
      sectionCardsPresent: result.sectionCardsPresent,
      fusionConfigWorks: result.fusionConfigWorks,
      harmonyApiReady: result.harmonyApiReady,
      pulsarLayouts: result.failedPulsarLayouts.length === 0,
      glitchStateFinite: result.glitchStateFinite,
      manualSelectionReleasesDirector: result.manualSelectionReleasesDirector,
      localeUiReady: result.localeUiReady,
      localeControlVisible: result.localeControlVisible,
      localeStateStable: result.localeStateStable,
      englishLocaleSwitch: result.englishLocaleState?.locale === 'en-US' && result.englishLocaleState?.source === 'local' && result.englishLocaleActive,
      chineseLocaleSwitch: result.chineseLocaleState?.locale === 'zh-CN' && result.chineseLocaleState?.source === 'local',
      desktopLocaleBridge:
        result.englishDesktopLocale?.locale === 'en-US'
        && result.chineseDesktopLocale?.locale === 'zh-CN'
        && result.runtimeNativeLocaleCalls.includes('en-US')
        && result.runtimeNativeLocaleCalls.at(-1) === 'zh-CN',
      generatorOpenLocale: result.runtimeGeneratorOpenLocales.includes('zh-CN'),
      englishStaticShell:
        result.englishStaticShell?.source === 'Local Library' &&
        result.englishStaticShell?.calibration === 'Frequency Calibration' &&
        result.englishStaticShell?.catalog === 'CLASSIC' &&
        result.englishStaticShell?.welcome === 'Connect computer audio' &&
        result.englishStaticShell?.canvasAria === 'Classic audio-reactive spectrum animation',
      chineseStaticShell:
        result.chineseStaticShell?.source === '本地曲库' &&
        result.chineseStaticShell?.calibration === '频响校准' &&
        result.chineseStaticShell?.catalog === '经典款' &&
        result.chineseStaticShell?.welcome === '连接电脑声音' &&
        result.chineseStaticShell?.canvasAria === '随音乐变化的经典频谱动画',
      englishDynamicShell: result.englishDynamicShell?.matchesCatalog === true,
      chineseDynamicShell: result.chineseDynamicShell?.matchesCatalog === true,
      canvases: result.canvases >= 4,
      effectChanged: result.activeEffect === 'pulsar',
      noRuntimeErrors: failures.length === 0
    };
    if (process.env.SMOKE_SCREENSHOT) {
      await win.webContents.executeJavaScript(`(() => {
        const screenshotMaterial = ${JSON.stringify(process.env.SMOKE_MATERIAL || '')};
        if (screenshotMaterial) {
          document.querySelector(
            '[data-effect="' + screenshotMaterial + '"]'
          )?.click();
        }
        window.SmokeResonanceGeneratorPresetControl?.select(${JSON.stringify(process.env.SMOKE_PRESET || 'balanced')});
        const welcome = document.querySelector('#welcome');
        welcome?.remove();
        document.querySelector('#calibrationPanel')?.classList.remove('is-open');
        document.querySelector('#mappingLabPanel')?.classList.toggle(
          'is-open',
          ${JSON.stringify(process.env.SMOKE_VIEW === 'sections')}
        );
        document.querySelector('#glitchPanel')?.classList.toggle(
          'is-open',
          ${JSON.stringify(process.env.SMOKE_VIEW !== 'sections' && !process.env.SMOKE_MATERIAL)}
        );
        if (!screenshotMaterial) {
          document.querySelector('#sourceInspector')?.setAttribute('open', '');
        }
        window.SmokeResonancePulsar.layout('stereo');
        window.SmokeResonancePulsar.mode('neon');
        window.SmokeResonanceGlitch.set({
          enabled: ${JSON.stringify(process.env.SMOKE_FX !== '0')},
          baseLayer: 1,
          noiseLayer: .8,
          burstLayer: 1.2
        });
      })()`);
      win.webContents.invalidate();
      await new Promise(resolve => setTimeout(resolve, 520));
      fs.writeFileSync(process.env.SMOKE_SCREENSHOT, (await win.webContents.capturePage()).toPNG());
    }
    const report = { result, failures, assertions };
    console.log(JSON.stringify(report, null, 2));
    if (process.env.SMOKE_RESULT) {
      fs.writeFileSync(process.env.SMOKE_RESULT, JSON.stringify(report, null, 2));
    }
    if (Object.values(assertions).some(value => !value)) process.exitCode = 1;
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (!win.isDestroyed()) win.destroy();
    app.exit(process.exitCode || 0);
  }
});
