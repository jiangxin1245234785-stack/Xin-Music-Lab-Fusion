'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('SmokeResonanceDesktop', Object.freeze({
  getLocale: () => ipcRenderer.invoke('app:locale-get'),
  setLocale: locale => ipcRenderer.invoke('app:locale-set', { locale }),
  toggleAlwaysOnTop: () => ipcRenderer.invoke('app:toggle-always-on-top'),
  isAlwaysOnTop: () => ipcRenderer.invoke('app:is-always-on-top'),
  saveSnapshot: dataUrl => ipcRenderer.invoke('app:save-snapshot', dataUrl)
}));

contextBridge.exposeInMainWorld('XinsMusicLabFusion', Object.freeze({
  scanLibrary: () => ipcRenderer.invoke('fusion:scan-library'),
  refreshTrack: trackId => ipcRenderer.invoke('fusion:refresh-track', trackId),
  loadTrack: trackId => ipcRenderer.invoke('fusion:load-track', trackId),
  loadListeningState: () => ipcRenderer.invoke('fusion:listening-read'),
  saveListeningState: value => ipcRenderer.invoke('fusion:listening-save', value),
  settings: () => ipcRenderer.invoke('fusion:settings'),
  chooseFolder: kind => ipcRenderer.invoke('fusion:choose-folder', { kind }),
  analysisTask: () => ipcRenderer.invoke('fusion:analysis-task'),
  runAnalysis: (trackId, engine, options = {}) => ipcRenderer.invoke('fusion:analysis-run', { trackId, engine, options }),
  readMidi: (trackId, stem) => ipcRenderer.invoke('fusion:midi-read', { trackId, stem }),
  scoreModel: (trackId,useDynamics=false,lang) => ipcRenderer.invoke('fusion:score-model', { trackId,useDynamics,lang }),
  scoreLayersState: trackIds => ipcRenderer.invoke('fusion:score-layers-state', { trackIds }),
  lyrics: (trackId, duration) => ipcRenderer.invoke('fusion:lyrics', { trackId, duration }),
  lyricsNudge: (trackId, delta) => ipcRenderer.invoke('fusion:lyrics-nudge', { trackId, delta }),
  scoreDynamics: payload => ipcRenderer.invoke('fusion:score-dynamics',payload),
  scoreExport: payload => ipcRenderer.invoke('fusion:score-export', payload),
  cancelScoreExport: () => ipcRenderer.invoke('fusion:score-export-cancel'),
  revealScoreExport: file => ipcRenderer.invoke('fusion:score-export-reveal', { file }),
  onScoreExportProgress: callback => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, step) => callback(step);
    ipcRenderer.on('fusion:score-export-progress', listener);
    return () => ipcRenderer.removeListener('fusion:score-export-progress', listener);
  },
  onScoreDynamicsTask: callback => {
    if(typeof callback!=='function')return ()=>{};
    const listener=(_event,task)=>callback(task);ipcRenderer.on('fusion:score-dynamics-task',listener);
    return ()=>ipcRenderer.removeListener('fusion:score-dynamics-task',listener);
  },
  scoreNotes: trackId => ipcRenderer.invoke('fusion:score-notes',{action:'list',trackId}),
  saveScoreNote: (trackId,note) => ipcRenderer.invoke('fusion:score-notes',{action:'save',trackId,note}),
  removeScoreNote: (trackId,id) => ipcRenderer.invoke('fusion:score-notes',{action:'remove',trackId,id}),
  revealMidi: (trackId, stem) => ipcRenderer.invoke('fusion:midi-reveal', { trackId, stem }),
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
