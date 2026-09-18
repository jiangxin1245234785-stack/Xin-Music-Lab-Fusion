'use strict';

const path = require('path');
const os = require('os');
const { app, BrowserWindow } = require('electron');

process.env.XLD_TEST = '1';
app.commandLine.appendSwitch('disable-gpu');
app.disableHardwareAcceleration();
app.setPath('userData', path.join(os.tmpdir(), `xld-cancel-${process.pid}`));
require('../desktop/main.cjs');

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

app.whenReady().then(async () => {
  let win;
  try {
    for (let index = 0; index < 100; index += 1) {
      win = BrowserWindow.getAllWindows()[0];
      if (win && !win.webContents.isLoading()) break;
      await sleep(100);
    }
    await sleep(1600);
    const result = await win.webContents.executeJavaScript(`(async () => {
      const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
      for (let i = 0; i < 100 && document.querySelectorAll('.album-card').length < 4; i++) await wait(100);
      const album = [...document.querySelectorAll('.album-card')].find(card => card.textContent.includes('The Lie Lay Land'));
      album?.click();
      await wait(250);
      const row = [...document.querySelectorAll('.track-row')].find(item => item.textContent.includes('song cemetery'));
      row?.click();
      for (let i = 0; i < 100 && document.querySelector('#analysisTargetTitle')?.textContent !== 'song cemetery'; i++) await wait(100);
      const engine = [...document.querySelectorAll('.engine-card')].find(card => card.textContent.includes('MSAF · Spectral'));
      engine?.click();
      document.querySelector('#analyzeButton')?.click();
      let task = null;
      for (let i = 0; i < 100 && !task; i++) { task = await window.XLD.getAnalysisTask(); if (!task) await wait(100); }
      const cancelled = task ? await window.XLD.cancelAnalysis(task.taskId) : { ok: false };
      for (let i = 0; i < 200 && await window.XLD.getAnalysisTask(); i++) await wait(100);
      await wait(350);
      return {
        taskStarted: Boolean(task?.taskId),
        cancelAccepted: cancelled.ok,
        lockReleased: !(await window.XLD.getAnalysisTask()),
        taskLabel: document.querySelector('#taskKicker')?.textContent,
        failureBadge: [...document.querySelectorAll('.track-analysis-badge')].some(badge => badge.textContent.includes('SC') && badge.textContent.includes('×'))
      };
    })()`);
    console.log(JSON.stringify(result, null, 2));
    if (!result.taskStarted || !result.cancelAccepted || !result.lockReleased) process.exitCode = 1;
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (win && !win.isDestroyed()) win.destroy();
    app.exit(process.exitCode || 0);
  }
});
