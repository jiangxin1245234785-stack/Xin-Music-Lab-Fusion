'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('SmokeResonanceDesktop', Object.freeze({
  getLocale: () => ipcRenderer.invoke('app:locale-get'),
  setLocale: locale => ipcRenderer.invoke('app:locale-set', { locale }),
  mediaControl: action => ipcRenderer.invoke('app:media-control', action),
  toggleAlwaysOnTop: () => ipcRenderer.invoke('app:toggle-always-on-top'),
  saveSnapshot: dataUrl => ipcRenderer.invoke('app:save-snapshot', dataUrl)
}));

contextBridge.exposeInMainWorld('XinsMusicLabFusion', Object.freeze({
  scanLibrary: () => ipcRenderer.invoke('fusion:scan-library'),
  refreshTrack: trackId => ipcRenderer.invoke('fusion:refresh-track', trackId),
  loadTrack: trackId => ipcRenderer.invoke('fusion:load-track', trackId),
  settings: () => ipcRenderer.invoke('fusion:settings'),
  analysisEngines: () => ipcRenderer.invoke('fusion:analysis-engines'),
  analysisTask: () => ipcRenderer.invoke('fusion:analysis-task'),
  shadowTelemetry: async () => {
    const payload = await ipcRenderer.invoke('fusion:shadow-telemetry');
    try {
      return typeof payload === 'string' ? JSON.parse(payload) : null;
    } catch (_) {
      return null;
    }
  },
  runAnalysis: (trackId, engine, options = {}) => ipcRenderer.invoke('fusion:analysis-run', { trackId, engine, options }),
  runMidi: (trackId, stem, force = false) => ipcRenderer.invoke('fusion:midi-run', { trackId, stem, force }),
  readMidi: (trackId, stem) => ipcRenderer.invoke('fusion:midi-read', { trackId, stem }),
  revealMidi: (trackId, stem) => ipcRenderer.invoke('fusion:midi-reveal', { trackId, stem }),
  runSeparation: (trackId, force = false) => ipcRenderer.invoke('fusion:stems-run', { trackId, force }),
  readStems: trackId => ipcRenderer.invoke('fusion:stems-read', { trackId }),
  revealStems: trackId => ipcRenderer.invoke('fusion:stems-reveal', { trackId }),
  cancelAnalysis: () => ipcRenderer.invoke('fusion:analysis-cancel'),
  onAnalysisTask: callback => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, task) => callback(task);
    ipcRenderer.on('fusion:analysis-task', listener);
    return () => ipcRenderer.removeListener('fusion:analysis-task', listener);
  },
  openBridge: () => ipcRenderer.invoke('fusion:open-bridge'),
  exportGlitchPreset: payload => ipcRenderer.invoke('fusion:export-glitch-preset', payload),
  importGlitchPreset: () => ipcRenderer.invoke('fusion:import-glitch-preset'),
  presetRepositoryList: () => ipcRenderer.invoke('fusion:preset-repository-list'),
  presetRepositorySave: payload => ipcRenderer.invoke('fusion:preset-repository-save', payload),
  presetRepositoryRead: (category, key) => ipcRenderer.invoke('fusion:preset-repository-read', { category, key }),
  presetRepositoryRemove: (category, key) => ipcRenderer.invoke('fusion:preset-repository-remove', { category, key }),
  openGeneratorEditor: (locale = null) => ipcRenderer.invoke('fusion:open-generator-editor', { locale }),
  revealBridge: filePath => ipcRenderer.invoke('fusion:reveal-bridge', filePath),
  analyzeInXld: (trackId, locale = null) => ipcRenderer.invoke('fusion:analyze-in-xld', { trackId, locale })
}));
