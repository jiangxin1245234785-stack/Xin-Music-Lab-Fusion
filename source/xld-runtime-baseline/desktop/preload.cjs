'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('XLD', Object.freeze({
  storageScan: () => ipcRenderer.invoke('storage:scan'),
  storageKeep: payload => ipcRenderer.invoke('storage:keep',payload),
  storageClear: payload => ipcRenderer.invoke('storage:clear',payload),
  storageReveal: payload => ipcRenderer.invoke('storage:reveal',payload),
  refinementEngines: () => ipcRenderer.invoke('refinement:engines'),
  readRefinement: payload => ipcRenderer.invoke('refinement:read',payload),
  runRefinement: payload => ipcRenderer.invoke('refinement:run',payload),
  keepRefinement: payload => ipcRenderer.invoke('refinement:keep',payload),
  revealRefinement: payload => ipcRenderer.invoke('refinement:reveal',payload),
  mergeMidi: trackId => ipcRenderer.invoke('assets:merge-midi', {trackId}),
  openMergedMidi: (trackId, folder = false) => ipcRenderer.invoke('assets:open-merged-midi', {trackId, folder}),
  runDerived: (trackId, kind, stem = null, force = false, engine = null) => ipcRenderer.invoke('assets:run', {trackId, kind, stem, force, engine}),
  separationEngines: () => ipcRenderer.invoke('assets:separation-engines'),
  midiEngines: () => ipcRenderer.invoke('assets:midi-engines'),
  selectStringsSource: (trackId, selection) => ipcRenderer.invoke('assets:strings-source', {trackId,selection}),
  deleteMidi: payload => ipcRenderer.invoke('assets:delete-midi',payload),
  readDerived: trackId => ipcRenderer.invoke('assets:read', { trackId }),
  revealDerived: (trackId, kind, stem = null, engine = null) => ipcRenderer.invoke('assets:reveal', { trackId, kind, stem, engine }),
  scanLibrary: () => ipcRenderer.invoke('library:scan'),
  getHostLocale: () => ipcRenderer.invoke('locale:get-host'),
  setRendererLocale: locale => ipcRenderer.invoke('locale:set-renderer', { locale }),
  clearHostLocale: () => ipcRenderer.invoke('locale:clear-host'),
  onHostLocale: callback => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('locale:host', handler);
    return () => ipcRenderer.removeListener('locale:host', handler);
  },
  chooseLibrary: () => ipcRenderer.invoke('library:choose'),
  revealTrack: trackId => ipcRenderer.invoke('library:reveal-track', trackId),
  onOpenRequest: callback => {
    const handler=()=>callback();ipcRenderer.on('integration:open-request',handler);
    return ()=>ipcRenderer.removeListener('integration:open-request',handler);
  },
  consumeOpenRequest: () => ipcRenderer.invoke('library:consume-open-request'),
  getAnalysisEngines: () => ipcRenderer.invoke('analysis:engines'),
  getSeparationModes: () => ipcRenderer.invoke('analysis:separation-modes'),
  runAnalysis: (trackId, engine, range = null, auto = false, separation = 'none') => ipcRenderer.invoke('analysis:run', { trackId, engine, range, auto, separation }),
  loadAnalysis: (trackId, engine = null) => ipcRenderer.invoke('analysis:load', { trackId, engine }),
  getAnalysisSummary: () => ipcRenderer.invoke('analysis:summary'),
  deleteAnalysisResult: (trackId, engine) => ipcRenderer.invoke('analysis:delete-result', { trackId, engine }),
  getAnalysisTask: () => ipcRenderer.invoke('analysis:task:get'),
  cancelAnalysis: taskId => ipcRenderer.invoke('analysis:cancel', { taskId }),
  getAnalysisSettings: () => ipcRenderer.invoke('analysis:settings'),
  chooseAnalysisRoot: () => ipcRenderer.invoke('analysis:choose-root'),
  openAnalysisRoot: () => ipcRenderer.invoke('analysis:open-root'),
  loadAnnotations: trackId => ipcRenderer.invoke('annotations:load', { trackId }),
  saveAnnotation: (trackId, tag) => ipcRenderer.invoke('annotations:upsert', { trackId, tag }),
  deleteAnnotation: (trackId, tagId) => ipcRenderer.invoke('annotations:delete', { trackId, tagId }),
  getMusicLabManifest: trackId => ipcRenderer.invoke('integration:manifest', { trackId }),
  exportMusicLabManifest: trackId => ipcRenderer.invoke('integration:export', { trackId }),
  onAnalysisTask: callback => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('analysis:task', handler);
    return () => ipcRenderer.removeListener('analysis:task', handler);
  }
}));
