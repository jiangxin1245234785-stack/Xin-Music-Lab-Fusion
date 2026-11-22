'use strict';
// The export window's only door to the main process: fetch the job, hand back bytes and progress.
const {contextBridge, ipcRenderer} = require('electron');

let cancelHandler = null;
ipcRenderer.on('xin-score-export:cancel', () => { if (cancelHandler) cancelHandler(); });

contextBridge.exposeInMainWorld('xinExportHost', {
  job: () => ipcRenderer.invoke('xin-score-export:job'),
  write: (bytes, position) => ipcRenderer.invoke('xin-score-export:write', bytes, position),
  progress: step => ipcRenderer.send('xin-score-export:progress', step),
  done: summary => ipcRenderer.send('xin-score-export:done', summary),
  fail: problem => ipcRenderer.send('xin-score-export:fail', problem),
  onCancel: handler => { cancelHandler = handler; }
});
