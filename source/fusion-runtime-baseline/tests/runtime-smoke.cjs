'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
const { app, BrowserWindow, ipcMain } = require('electron');

const failures = [];
// Canvas and visibility assertions need an active window. Explicit 0 keeps the
// hidden diagnostic mode, whose low-frequency animation cannot validate them.
const smokeVisible = process.env.SMOKE_VISIBLE !== '0';
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
    show: smokeVisible,
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
    if (smokeVisible) {
      win.show();
      if (win.isMinimized()) win.restore();
      win.focus();
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    // Production intentionally pauses canvas work when its window is hidden.
    // The default creates the test window visibly from the outset so the
    // existing engine clock can advance; it never changes app source code.
    const testVisibility = JSON.parse(await win.webContents.executeJavaScript(
      `JSON.stringify({ hidden: document.hidden, visibilityState: document.visibilityState })`
    ));
    const initialWaitMs = smokeVisible ? 3200 : 1400;
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
    if (smokeVisible) {
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
        'SmokeResonanceColor',
        'SmokeResonanceGlitch',
        'SmokeResonancePulsar',
        'SmokeResonanceDirector',
        'SmokeResonanceRealtimeFrame',
        'SmokeResonanceXldFrame',
        'SmokeResonanceFrameClock',
        'SmokeResonanceUnifiedMusicFrame',
        'SmokeResonanceMaterialView',
        'SmokeResonanceGeneratorSourceView',
        'SmokeResonanceGeneratorRuntimeShadowView',
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
        const dockQuality = document.querySelector('[data-product-quality]');
        const ownerQuality = document.querySelector('#qualityButton');
        const initialProduct = productApi.status();

        dockMaster.value = '165';
        dockMaster.dispatchEvent(new Event('input', { bubbles: true }));
        const delegatedMaster = productApi.status();
        const persistedMaster = localStorage.getItem('xins-fusion-master');
        dockMaster.value = '125';
        dockMaster.dispatchEvent(new Event('input', { bubbles: true }));

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
          && persistedMaster === '165'
          && !document.querySelector('#fusionMaster')
          && localStorage.getItem('xins-fusion-master') === '125'
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
          && !productRoot?.querySelector('[data-product-source]')
          && productRoot?.querySelector('[data-product-open-xld]')
          && productRoot?.querySelector('[data-product-open-generator]')
          && productStyle?.display !== 'none'
        );
      } catch (error) {
        productControlDockReady = false;
      }
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
      const stage = document.querySelector('main.stage');
      const nativeEffects = [...document.querySelectorAll('[data-effect]')]
        .map(button => button.dataset.effect)
        .filter(effect => effect && !effect.startsWith('beta-'));
      const failedNativeEffects = [];
      const materialFrameWaits = [];
      // Timers can expire before the next visible frame on a busy machine. Wait for
      // the material and generator to publish the same new frame, then keep all of
      // the existing output, field, mapping and metric assertions below.
      const waitMaterialFrame = async (effect, after) => {
        const began = performance.now();
        while (performance.now() - began < 8000) {
          const output = window.SmokeResonanceMaterialView?.outputs();
          const material = window.SmokeResonanceMaterialView?.status();
          const source = window.SmokeResonanceGeneratorSourceView?.status();
          const generator = window.SmokeResonanceGeneratorRuntimeShadowView?.status();
          if (stage?.dataset.effect === effect && output?.materialId === effect
              && Number.isInteger(output.frameIndex) && output.frameIndex > after
              && output.frameIndex === material?.frameIndex
              && output.frameIndex === source?.materialFrameIndex
              && output.frameIndex === generator?.renderReport?.output?.frameIndex
              && generator?.renderReport?.status === 'rendered') {
            materialFrameWaits.push({effect, after, frame: output.frameIndex, waitedMs: Math.round(performance.now() - began)});
            return;
          }
          await new Promise(resolve => setTimeout(resolve, 16));
        }
        throw new Error('No synchronized material frame: ' + effect + ', after ' + after);
      };
      for (const effect of nativeEffects) {
        document.querySelector('[data-effect="' + effect + '"]')?.click();
        await new Promise(resolve => setTimeout(resolve, 55));
        if (stage?.dataset.effect !== effect) failedNativeEffects.push(effect);
        // Every kept scene is still registered and rendered through the material runtime:
        // the runtime, the generator source and the generator render agree on one new frame.
        await waitMaterialFrame(effect, window.SmokeResonanceMaterialView?.status()?.frameIndex ?? -1);
      }
      // Not pulsar: main.stage carries data-effect too, and the director check below clicks pulsar.
      document.querySelector('.scene-button[data-effect="ribbons"]')?.click();
      await new Promise(resolve => setTimeout(resolve, 80));
      const materialLifecycleReports = [];
      for (const reason of ['pause', 'seek', 'track-change']) {
        window.SmokeResonanceMaterialView?.reset(reason);
        await new Promise(resolve => setTimeout(resolve, 80));
        const status = window.SmokeResonanceMaterialView?.status();
        const generator =
          window.SmokeResonanceGeneratorRuntimeShadowView?.status();
        materialLifecycleReports.push({
          reason,
          lastResetReason:
            status?.runtime?.material?.lastResetReason || null,
          materialFrameIndex: status?.frameIndex ?? null,
          generatorFrameIndex:
            generator?.renderReport?.output?.frameIndex ?? null,
          sameFramePass: status?.sameFramePass === true
        });
      }
      const materialLifecycleReady = materialLifecycleReports.every(report =>
        report.lastResetReason === report.reason
        && Number.isInteger(report.materialFrameIndex)
        && report.materialFrameIndex === report.generatorFrameIndex
        && report.sameFramePass
      );
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
      // The spectrum calibration panel and its button were removed on 2026-11-13.
      const calibrationPanelAbsent = !document.querySelector('#calibrationPanel')
        && !document.querySelector('#calibrationButton')
        && !document.querySelector('[data-calibration-key], [data-response-key], [data-calibration-preset], [data-response-preset]')
        && !('SmokeResonanceCalibration' in window) && !('SmokeResonanceResponse' in window);
      const topFxPower = document.querySelector('#glitchPowerButton');
      window.SmokeResonanceGlitch.set({ enabled: true });
      await new Promise(resolve => setTimeout(resolve, 320));
      const topFxPowerShowsOn = topFxPower?.getAttribute('aria-pressed') === 'true'
        && topFxPower?.getAttribute('aria-pressed') === 'true';
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
        && topFxPower?.getAttribute('aria-checked') === 'false'
        && topFxPower?.textContent.trim() === '画面特效';
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
      // Built-in recognition, external listening and the debug diagnostics are removed:
      // none of their globals, controls or bridges may exist.
      const removedSurfacesAbsent = [
        'SmokeResonanceSections', 'SmokeResonanceMapping', 'SmokeResonanceMappingLab',
        'SmokeResonanceLiveHarmony', 'SmokeResonanceSourceInspectorView', 'SmokeResonancePhaseIIGate',
        'SmokeResonanceTargetInspectorView', 'SmokeResonanceShadowStabilityGate'
      ].every(name => !(name in window))
        && !document.querySelector([
          '#mappingLabButton', '#mappingLabPanel', '[data-section-engine-toggle]', '[data-effect="original-glitch"]',
          '#playButton', '#captureButton', '#enterButton', '#mediaPlayPause', '#topModeExternal',
          '#fusionModeExternal', '#fusionExternalView', '#sourceInspector', '#targetInspector',
          '#shadowStabilityGate', '#fusionProof', '[data-product-source]'
        ].join(', '))
        && typeof window.SmokeResonanceAudioSource?.startExternal === 'undefined'
        && typeof window.SmokeResonanceDesktop?.mediaControl === 'undefined'
        && typeof window.XinsMusicLabFusion?.shadowTelemetry === 'undefined'
        && !('fusionSource' in (stage?.dataset || {}));
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
        fxPower: document.querySelector('#glitchPowerButton')?.getAttribute('aria-pressed') || ''
      });
      const readDynamicLocaleState = locale => {
        const messages = window.XinMusicLabI18nCatalogs?.MESSAGE_CATALOGS?.[locale] || {};
        const values = {
          fusion: document.querySelector('#fusionPanel .xl-drawer__head h2')?.textContent || '',
          glitch: document.querySelector('#glitchPanel > .calibration-head h2')?.textContent || '',
          quality: document.querySelector('#qualityButton')?.textContent || '',
          director: document.querySelector('#directorToggle')?.textContent || '',
          pin: document.querySelector('#pinButton')?.textContent || ''
        };
        return {
          values,
          matchesCatalog:
            values.fusion === messages['shell.library']
            && values.glitch === messages['glitch.title']
            && values.quality === messages['runtime.quality.auto']
            && values.director === messages['runtime.director.off']
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
        library: document.querySelector('[data-i18n="engine.fusion"]')?.textContent || '',
        catalog: document.querySelector('[data-i18n="catalog.spectrum"]')?.textContent || '',
        welcome: document.querySelector('[data-i18n="welcome.note"]')?.textContent || '',
        canvasAria: document.querySelector('#visualizer')?.getAttribute('aria-label') || ''
      };
      const englishDynamicShell = readDynamicLocaleState('en-US');
      document.querySelector('[data-locale="zh-CN"]')?.click();
      await new Promise(resolve => setTimeout(resolve, 30));
      const chineseLocaleState = { ...window.xinMusicLabLocale.getState() };
      const chineseDesktopLocale = await window.SmokeResonanceDesktop?.getLocale?.();
      const chineseStaticShell = {
        library: document.querySelector('[data-i18n="engine.fusion"]')?.textContent || '',
        catalog: document.querySelector('[data-i18n="catalog.spectrum"]')?.textContent || '',
        welcome: document.querySelector('[data-i18n="welcome.note"]')?.textContent || '',
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
        frameOwnershipReady,
        frameOwnershipStatus,
        frameOwnershipReport,
        failedNativeEffects,
        nativeEffectCount: nativeEffects.length,
        materialFrameWaits,
        materialLifecycleReady,
        materialLifecycleReports,
        calibrationPanelAbsent,
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
        removedSurfacesAbsent,
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
    result.runtimeNativeLocaleCalls = [...runtimeNativeLocaleCalls];
    result.runtimeGeneratorOpenLocales = [...runtimeGeneratorOpenLocales];
    const assertions = {
      title: result.title.includes('Xin'),
      apisReady: result.apisReady,
      realtimeProviderReady: result.realtimeProviderReady,
      xldProviderReady: result.xldProviderReady,
      unifiedFrameReady: result.unifiedFrameReady,
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
      frameOwnershipReady: result.frameOwnershipReady,
      visibilityPauseResume:
        visibilityLifecycle.tested &&
        visibilityLifecycle.pausedWhileHidden &&
        visibilityLifecycle.resumedAfterShow,
      nativeEffects: result.failedNativeEffects.length === 0
        && result.materialFrameWaits.length === result.nativeEffectCount,
      materialLifecycleReady: result.materialLifecycleReady,
      calibrationPanelAbsent: result.calibrationPanelAbsent,
      fxPanelActuallyVisible: result.fxPanelActuallyVisible,
      topFxPowerShowsOn: result.topFxPowerShowsOn,
      topFxPowerBypasses: result.topFxPowerBypasses,
      generatorOutputActive: result.generatorOutputActive,
      generatorOutputBypasses: result.generatorOutputBypasses,
      generatorOutputReactivates: result.generatorOutputReactivates,
      removedSurfacesAbsent: result.removedSurfacesAbsent,
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
        result.englishStaticShell?.library === 'Library' &&
        result.englishStaticShell?.catalog === 'LED Spectrum' &&
        result.englishStaticShell?.welcome === 'The library and the analysis results are the ones XLD is set to.' &&
        result.englishStaticShell?.canvasAria === 'Classic audio-reactive spectrum animation',
      chineseStaticShell:
        result.chineseStaticShell?.library === '曲库' &&
        result.chineseStaticShell?.catalog === 'LED 频谱' &&
        result.chineseStaticShell?.welcome === '曲库和分析结果的位置跟 XLD 用同一份设置。' &&
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
        document.querySelector('#glitchPanel')?.classList.toggle(
          'is-open',
          ${JSON.stringify(!process.env.SMOKE_MATERIAL)}
        );
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
