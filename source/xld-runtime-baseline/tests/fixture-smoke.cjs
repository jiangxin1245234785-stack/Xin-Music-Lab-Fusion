'use strict';

const path = require('path');
const fs = require('fs');
const { app, BrowserWindow } = require('electron');

process.env.XLD_TEST = '1';
app.commandLine.appendSwitch('disable-gpu');
app.disableHardwareAcceleration();
app.setPath('userData', process.env.XLD_TEST_USERDATA);
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
    await sleep(1600);
    const result = await win.webContents.executeJavaScript(`(async () => {
      const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
      for (let i = 0; i < 100 && document.querySelectorAll('.album-card').length < 4; i++) await wait(100);
      const album = [...document.querySelectorAll('.album-card')].find(card => card.textContent.includes('The Lie Lay Land'));
      album?.click();
      await wait(250);
      const row = [...document.querySelectorAll('.track-row')].find(item => item.textContent.includes('song cemetery'));
      row?.click();
      for (let i = 0; i < 100 && document.querySelectorAll('.comparison-row').length < 2; i++) await wait(100);
      const selectedWithoutPlayback = document.querySelector('#nowTitle')?.textContent === '尚未播放';
      document.querySelector('.segment-block')?.click();
      for (let i = 0; i < 200 && document.querySelector('#nowTitle')?.textContent !== 'song cemetery'; i++) await wait(100);
      for (let i = 0; i < 200 && !document.querySelector('.timeline-playhead.visible'); i++) await wait(100);
      return {
        rows: document.querySelectorAll('.comparison-row').length,
        blocks: document.querySelectorAll('.segment-block').length,
        badges: [...document.querySelectorAll('.track-analysis-badge')].map(item => item.textContent),
        selected: document.querySelector('#analysisTargetTitle')?.textContent,
        selectedWithoutPlayback,
        nowPlaying: document.querySelector('#nowTitle')?.textContent,
        cursorVisible: Boolean(document.querySelector('.timeline-playhead.visible'))
      };
    })()`);
    const target = process.env.XLD_SCREENSHOT;
    if (target) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      win.showInactive();
      await sleep(350);
      fs.writeFileSync(target, (await win.webContents.capturePage()).toPNG());
    }
    console.log(JSON.stringify(result, null, 2));
    if (result.rows < 2 || result.blocks < 10 || !result.selectedWithoutPlayback || result.nowPlaying !== 'song cemetery' || !result.cursorVisible) process.exitCode = 1;
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (win && !win.isDestroyed()) win.destroy();
    app.exit(process.exitCode || 0);
  }
});
