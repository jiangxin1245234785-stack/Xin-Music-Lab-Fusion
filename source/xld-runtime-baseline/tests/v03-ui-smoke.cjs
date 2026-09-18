'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { app, BrowserWindow } = require('electron');

const failures = [];
process.env.XLD_TEST = '1';
app.commandLine.appendSwitch('disable-gpu');
app.disableHardwareAcceleration();
app.setPath('userData', process.env.XLD_TEST_USERDATA || path.join(os.tmpdir(), `xld-v03-${process.pid}`));
process.on('uncaughtException', error => failures.push(error.stack || error.message));
process.on('unhandledRejection', error => failures.push(error?.stack || String(error)));
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
    if (!win) throw new Error('window missing');
    await sleep(1400);
    const result = await win.webContents.executeJavaScript(`(async () => {
      const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
      for (let i = 0; i < 100 && !document.querySelector('.track-row'); i++) await wait(100);
      document.querySelector('.track-row')?.click();
      await wait(250);
      const before = document.querySelector('#fontScaleLabel')?.textContent;
      document.querySelector('#fontIncreaseButton')?.click();
      await wait(100);
      return {
        engines: document.querySelectorAll('.engine-card').length,
        engineNames: [...document.querySelectorAll('.engine-card')].map(node => node.textContent),
        batchEnabled: !document.querySelector('#analyzeAllButton')?.disabled,
        selectedTrack: document.querySelector('#analysisTargetTitle')?.textContent,
        fontBefore: before,
        fontAfter: document.querySelector('#fontScaleLabel')?.textContent,
        transportSvgs: document.querySelectorAll('.transport-buttons svg').length,
        aiVisible: /All-In-One|LinkSeg|QM Segmenter/.test(document.body.innerText)
      };
    })()`);
    const target = process.env.XLD_SCREENSHOT;
    if (target) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      win.showInactive();
      await sleep(250);
      fs.writeFileSync(target, (await win.webContents.capturePage()).toPNG());
    }
    const assertions = {
      fourMsafEngines: result.engines === 4,
      batchReady: result.batchEnabled,
      selectedTrack: Boolean(result.selectedTrack),
      fontControl: result.fontBefore !== result.fontAfter,
      transportIcons: result.transportSvgs === 5,
      aiRemoved: !result.aiVisible,
      noRuntimeErrors: failures.length === 0
    };
    console.log(JSON.stringify({ result, assertions, failures }, null, 2));
    if (Object.values(assertions).some(value => !value)) process.exitCode = 1;
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (win && !win.isDestroyed()) win.destroy();
    app.exit(process.exitCode || 0);
  }
});
