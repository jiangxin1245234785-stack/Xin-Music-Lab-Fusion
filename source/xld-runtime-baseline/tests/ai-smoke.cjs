'use strict';

// Headless Electron smoke for the AI engine wiring: boots the beta app and
// verifies detectEngines() merges the MSAF venv (4 engines) with the AI venv
// (SongFormer), and that the renderer shows a READY SongFormer engine card.
// Does NOT run inference here — that is proven separately by the Python worker.

const path = require('path');
const fs = require('fs');
const os = require('os');
const { app, BrowserWindow } = require('electron');

const failures = [];
process.env.XLD_TEST = '1';
app.commandLine.appendSwitch('disable-gpu');
app.disableHardwareAcceleration();
app.setPath('userData', process.env.XLD_TEST_USERDATA || path.join(os.tmpdir(), `xld-ai-${process.pid}`));

process.on('uncaughtException', error => failures.push(error.stack || error.message));
process.on('unhandledRejection', error => failures.push(error?.stack || String(error)));

require('../desktop/main.cjs');

async function waitForWindow() {
  for (let index = 0; index < 100; index += 1) {
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.webContents.isLoading()) return win;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('XLD window did not become ready');
}

app.whenReady().then(async () => {
  let win;
  try {
    win = await waitForWindow();
    win.webContents.on('console-message', event => {
      if (event.level === 'error' || event.level === 3) failures.push(`renderer: ${event.message}`);
    });
    await new Promise(resolve => setTimeout(resolve, 1500));
    const result = await win.webContents.executeJavaScript(`(async () => {
      const waitUntil = async (predicate, attempts = 150) => {
        for (let i = 0; i < attempts; i += 1) {
          if (predicate()) return true;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        return false;
      };
      await waitUntil(() => document.querySelectorAll('.engine-card').length > 0);
      // engines come straight from IPC detectEngines (MSAF venv + AI venv merged)
      const engines = await window.XLD.getAnalysisEngines();
      const ai = engines.find(e => e.id === 'songformer');
      await waitUntil(() => [...document.querySelectorAll('.engine-card')].some(c => c.textContent.includes('SongFormer')));
      const aiCard = [...document.querySelectorAll('.engine-card')].find(c => c.textContent.includes('SongFormer'));
      return {
        engineCount: engines.length,
        engineIds: engines.map(e => e.id),
        aiPresent: Boolean(ai),
        aiAvailable: Boolean(ai && ai.available),
        aiFamily: ai && ai.family,
        aiStatus: ai && ai.status,
        aiCardText: aiCard ? aiCard.textContent.replace(/\\s+/g, ' ').trim() : null,
        aiCardReady: aiCard ? (aiCard.textContent.includes('READY') || aiCard.textContent.includes('CACHED')) : false
      };
    })()`);
    const assertions = {
      apiReady: true,
      fiveEngines: result.engineCount >= 5,
      msafFour: result.engineIds.filter(id => id.startsWith('msaf')).length === 4,
      aiPresent: result.aiPresent,
      aiAvailable: result.aiAvailable,
      aiFamily: result.aiFamily === 'ai',
      aiCardRendered: Boolean(result.aiCardText),
      aiCardReady: result.aiCardReady,
      noRuntimeErrors: failures.length === 0
    };
    const target = process.env.XLD_SCREENSHOT;
    if (target) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      await new Promise(resolve => setTimeout(resolve, 400));
      fs.writeFileSync(target, (await win.webContents.capturePage()).toPNG());
    }
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
