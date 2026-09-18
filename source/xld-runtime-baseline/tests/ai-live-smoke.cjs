'use strict';

// Full end-to-end AI flow in headless Electron: select a track, click the
// SongFormer engine card, run analysis, and confirm a comparison lane appears
// with functional segment labels. SLOW (~30-60s: model load + inference), so
// it is not part of `npm test`. Run explicitly:
//   ..\smoke-resonance\node_modules\electron\dist\electron.exe tests\ai-live-smoke.cjs

const path = require('path');
const fs = require('fs');
const os = require('os');
const { app, BrowserWindow } = require('electron');

const failures = [];
process.env.XLD_TEST = '1';
app.commandLine.appendSwitch('disable-gpu');
app.disableHardwareAcceleration();
app.setPath('userData', process.env.XLD_TEST_USERDATA || path.join(os.tmpdir(), `xld-ai-live-${process.pid}`));

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
      if (event.message.startsWith('[XLDTEST]')) console.log(event.message);
    });
    await new Promise(resolve => setTimeout(resolve, 1500));
    const result = await win.webContents.executeJavaScript(`(async () => {
      const waitUntil = async (predicate, attempts = 120) => {
        for (let i = 0; i < attempts; i += 1) {
          if (predicate()) return true;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        return false;
      };
      const mark = m => console.log('[XLDTEST] ' + m);
      await waitUntil(() => document.querySelectorAll('.album-card').length > 0);
      await waitUntil(() => document.querySelectorAll('.engine-card').length >= 5);
      const album = [...document.querySelectorAll('.album-card')].find(c => c.textContent.includes('The Lie Lay Land'));
      album?.click();
      await new Promise(r => setTimeout(r, 300));
      const track = [...document.querySelectorAll('.track-row')].find(r => r.textContent.includes('song cemetery'));
      track?.click();
      await waitUntil(() => document.querySelector('#analysisTargetTitle')?.textContent.includes('song cemetery'));
      document.querySelector('#audioElement')?.pause();
      const aiCard = [...document.querySelectorAll('.engine-card')].find(c => c.textContent.includes('SongFormer'));
      aiCard?.click();
      await waitUntil(() => !document.querySelector('#analyzeButton')?.disabled && document.querySelector('#analyzeButton')?.textContent.includes('SongFormer'), 100);
      mark('songformer selected');
      document.querySelector('#analyzeButton')?.click();
      const taskShown = await waitUntil(() => !document.querySelector('#taskCard')?.classList.contains('hidden'), 100);
      mark('task visible=' + taskShown);
      // model load (~30-40s) + inference (~5s); wait up to ~150s
      const laneReady = await waitUntil(() => [...document.querySelectorAll('.comparison-row')].some(r => r.dataset.engine === 'songformer'), 1500);
      mark('songformer lane=' + laneReady);
      const aiRow = [...document.querySelectorAll('.comparison-row')].find(r => r.dataset.engine === 'songformer');
      const labels = aiRow ? [...aiRow.querySelectorAll('.segment-block')].map(b => b.textContent) : [];
      const functional = ['intro', 'verse', 'chorus', 'bridge', 'inst', 'solo', 'break', 'outro', 'silence'];
      // the track badge is refreshed asynchronously by the task-complete event,
      // so wait for the summary to catch up before asserting it.
      const badge = await waitUntil(() => [...document.querySelectorAll('.track-analysis-badge')].some(b => b.textContent.includes('AI') && b.textContent.includes('✓')), 100);
      mark('badge=' + badge);
      return {
        taskShown,
        laneReady,
        segmentCount: labels.length,
        labels,
        hasFunctionalLabels: labels.some(l => functional.includes(String(l).toLowerCase())),
        badge
      };
    })()`);
    const assertions = {
      taskShown: result.taskShown,
      laneReady: result.laneReady,
      hasSegments: result.segmentCount > 2,
      functionalLabels: result.hasFunctionalLabels,
      badge: result.badge,
      noRuntimeErrors: failures.length === 0
    };
    const target = process.env.XLD_SCREENSHOT;
    if (target) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      await new Promise(resolve => setTimeout(resolve, 600));
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
