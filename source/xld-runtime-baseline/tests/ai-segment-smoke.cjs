'use strict';

// Full long-track segmentation flow in headless Electron: select a 13:43 track,
// pick SongFormer, confirm the segmentation panel appears, analyze 0:00–3:00, and
// verify the lane renders functional-label segments plus a grey "未分析" gap for
// the rest. SLOW (model load + ~180s inference). Run explicitly:
//   ..\smoke-resonance\node_modules\electron\dist\electron.exe tests\ai-segment-smoke.cjs

const path = require('path');
const fs = require('fs');
const os = require('os');
const { app, BrowserWindow } = require('electron');

const failures = [];
process.env.XLD_TEST = '1';
app.commandLine.appendSwitch('disable-gpu');
app.disableHardwareAcceleration();
app.setPath('userData', process.env.XLD_TEST_USERDATA || path.join(os.tmpdir(), `xld-seg-${process.pid}`));

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
      const waitUntil = async (p, n = 120) => { for (let i = 0; i < n; i += 1) { if (p()) return true; await new Promise(r => setTimeout(r, 100)); } return false; };
      const mark = m => console.log('[XLDTEST] ' + m);
      await waitUntil(() => document.querySelectorAll('.album-card').length > 0);
      await waitUntil(() => document.querySelectorAll('.engine-card').length >= 5);
      const album = [...document.querySelectorAll('.album-card')].find(c => c.textContent.includes('LAST WALTZ'));
      album?.click();
      await new Promise(r => setTimeout(r, 350));
      const track = [...document.querySelectorAll('.track-row')].find(r => r.textContent.includes('Flowers of Romance'));
      track?.click();
      await waitUntil(() => document.querySelector('#analysisTargetTitle')?.textContent.includes('Flowers of Romance'));
      document.querySelector('#audioElement')?.pause();
      const aiCard = [...document.querySelectorAll('.engine-card')].find(c => c.textContent.includes('SongFormer'));
      aiCard?.click();
      // duration probe + panel should appear for this long track
      const panelShown = await waitUntil(() => !document.querySelector('#segmentPanel').classList.contains('hidden'), 150);
      mark('segment panel shown=' + panelShown);
      const hint = document.querySelector('#segmentHint')?.textContent || '';
      document.querySelector('#segStart').value = '0:00';
      document.querySelector('#segEnd').value = '3:00';
      document.querySelector('#segAnalyzeButton')?.click();
      mark('segment 0:00-3:00 submitted');
      const laneReady = await waitUntil(() => [...document.querySelectorAll('.comparison-row')].some(r => r.dataset.engine === 'songformer'), 1500);
      mark('songformer lane=' + laneReady);
      const aiRow = [...document.querySelectorAll('.comparison-row')].find(r => r.dataset.engine === 'songformer');
      const labels = aiRow ? [...aiRow.querySelectorAll('.segment-block')].map(b => b.textContent) : [];
      const gaps = aiRow ? aiRow.querySelectorAll('.segment-gap').length : 0;
      const functional = ['intro', 'verse', 'chorus', 'bridge', 'inst', 'solo', 'break', 'outro', 'silence'];
      return {
        panelShown, hint, laneReady,
        segCount: labels.length, labels, gaps,
        hasFunctional: labels.some(l => functional.includes(String(l).toLowerCase())),
      };
    })()`);
    const assertions = {
      panelShown: result.panelShown,
      hintMentionsLimit: /单段上限/.test(result.hint),
      laneReady: result.laneReady,
      hasSegments: result.segCount > 2,
      functionalLabels: result.hasFunctional,
      greyGapShown: result.gaps >= 1,
      noRuntimeErrors: failures.length === 0,
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
