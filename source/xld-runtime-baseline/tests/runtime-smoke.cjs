'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { app, BrowserWindow } = require('electron');

const failures = [];
process.env.XLD_TEST = '1';
app.commandLine.appendSwitch('disable-gpu');
app.disableHardwareAcceleration();
app.setPath('userData', process.env.XLD_TEST_USERDATA || path.join(os.tmpdir(), `xld-runtime-${process.pid}`));

process.on('uncaughtException', error => failures.push(error.stack || error.message));
process.on('unhandledRejection', error => failures.push(error?.stack || String(error)));

require('../desktop/main.cjs');

async function waitForWindow() {
  for (let index = 0; index < 80; index += 1) {
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
    await new Promise(resolve => setTimeout(resolve, 1800));
    const result = await win.webContents.executeJavaScript(`(async () => {
      const waitUntil = async (predicate, attempts = 80) => {
        for (let i = 0; i < attempts; i += 1) {
          if (predicate()) return true;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        return false;
      };
      const mark = message => console.log('[XLDTEST] ' + message);
      await waitUntil(() => document.querySelectorAll('.album-card').length > 0);
      await waitUntil(() => document.querySelectorAll('.engine-card').length > 0);
      const albumCards = document.querySelectorAll('.album-card').length;
      const selectedTitle = document.querySelector('#albumTitle')?.textContent;
      const visibleTracks = document.querySelectorAll('.track-row').length;
      const msafReady = [...document.querySelectorAll('.engine-card')].some(card => card.textContent.includes('MSAF') && card.textContent.includes('READY'));
      document.querySelector('.track-row')?.click();
      await waitUntil(() => document.querySelector('#analysisTargetTitle')?.textContent !== '请单击选择一首曲目');
      const singleClickDidNotPlay = document.querySelector('#nowTitle')?.textContent === '尚未播放';
      document.querySelector('.track-row .track-play-button')?.click();
      await waitUntil(() => document.querySelector('#nowTitle')?.textContent !== '尚未播放');
      await waitUntil(() => Number.isFinite(document.querySelector('#audioElement')?.duration), 300);
      let analysisBlocks = null;
      let analysisCompleted = null;
      let taskShown = null;
      let analysisBadge = null;
      let busyRejected = null;
      let comparisonRows = null;
      if (${JSON.stringify(process.env.XLD_FIXTURE_SMOKE === '1')}) {
        const targetAlbum = [...document.querySelectorAll('.album-card')].find(card => card.textContent.includes('The Lie Lay Land'));
        targetAlbum?.click();
        await new Promise(resolve => setTimeout(resolve, 250));
        const targetTrack = [...document.querySelectorAll('.track-row')].find(row => row.textContent.includes('song cemetery'));
        targetTrack?.click();
        await waitUntil(() => document.querySelectorAll('.comparison-row').length >= 2, 200);
        analysisCompleted = document.querySelectorAll('.comparison-row').length >= 2;
        analysisBlocks = document.querySelectorAll('.segment-block').length;
        analysisBadge = [...document.querySelectorAll('.track-analysis-badge')].some(badge => badge.textContent.includes('SC') && badge.textContent.includes('✓'));
        comparisonRows = document.querySelectorAll('.comparison-row').length;
      } else if (${JSON.stringify(process.env.XLD_ANALYSIS_SMOKE === '1')}) {
        const targetAlbum = [...document.querySelectorAll('.album-card')].find(card => card.textContent.includes('The Lie Lay Land'));
        targetAlbum?.click();
        await new Promise(resolve => setTimeout(resolve, 250));
        const targetTrack = [...document.querySelectorAll('.track-row')].find(row => row.textContent.includes('song cemetery'));
        targetTrack?.click();
        await waitUntil(() => document.querySelector('#analysisTargetTitle')?.textContent.includes('song cemetery'));
        document.querySelector('#audioElement')?.pause();
        const msaf = [...document.querySelectorAll('.engine-card')].find(card => card.textContent.includes('MSAF · Spectral'));
        msaf?.click();
        document.querySelector('#analyzeButton')?.click();
        mark('spectral requested');
        taskShown = await waitUntil(() => !document.querySelector('#taskCard')?.classList.contains('hidden'), 100);
        mark('spectral task visible=' + taskShown);
        const otherTrack = [...document.querySelectorAll('.track-row')].find(row => row.dataset.trackId !== targetTrack?.dataset.trackId);
        const busyResponse = await window.XLD.runAnalysis(otherTrack?.dataset.trackId, 'msaf-sf');
        busyRejected = busyResponse?.error === 'analysis-busy';
        analysisCompleted = await waitUntil(() => document.querySelectorAll('.comparison-row').length > 0, 1600);
        mark('spectral comparison=' + analysisCompleted);
        analysisBlocks = document.querySelectorAll('.segment-block').length;
        analysisBadge = [...document.querySelectorAll('.track-analysis-badge')].some(badge => badge.textContent.includes('SC') && badge.textContent.includes('✓'));
        if (${JSON.stringify(process.env.XLD_MULTI_ANALYSIS_SMOKE === '1')}) {
          await waitUntil(() => !document.querySelector('#analyzeButton')?.disabled, 200);
          mark('button released');
          const sf = [...document.querySelectorAll('.engine-card')].find(card => card.textContent.includes('MSAF · SF'));
          sf?.click();
          await waitUntil(() => !document.querySelector('#analyzeButton')?.disabled && document.querySelector('#analyzeButton')?.textContent.includes('MSAF · SF'), 200);
          mark('sf selected');
          document.querySelector('#analyzeButton')?.click();
          await waitUntil(() => document.querySelector('#taskKicker')?.textContent === 'ANALYSIS RUNNING', 100);
          mark('sf task requested');
          await waitUntil(() => document.querySelectorAll('.comparison-row').length >= 2, 1600);
          mark('sf comparison ready');
        }
        comparisonRows = document.querySelectorAll('.comparison-row').length;
      }
      return {
        title: document.title,
        apiReady: Boolean(window.XLD),
        albumCards,
        selectedTitle,
        visibleTracks,
        msafReady,
        singleClickDidNotPlay,
        nowTitle: document.querySelector('#nowTitle')?.textContent,
        coverReady: Boolean(document.querySelector('#albumCover')?.getAttribute('src')),
        sourceReady: Boolean(document.querySelector('#audioElement')?.getAttribute('src')),
        audioDuration: document.querySelector('#audioElement')?.duration,
        audioError: document.querySelector('#audioElement')?.error?.message || null,
        analysisBlocks,
        analysisCompleted,
        taskShown,
        busyRejected,
        analysisBadge,
        comparisonRows,
        analysisRootVisible: document.querySelector('#analysisRootLabel')?.textContent !== '正在读取路径…'
      };
    })()`);
    const assertions = {
      title: result.title.includes("Xin's Local Deck"),
      apiReady: result.apiReady,
      libraryScanned: result.albumCards >= 4,
      albumSelected: Boolean(result.selectedTitle),
      tracksListed: result.visibleTracks >= 2,
      msafReady: result.msafReady,
      spotifySelection: result.singleClickDidNotPlay,
      trackSelected: result.nowTitle !== '尚未播放',
      coverReady: result.coverReady,
      sourceReady: result.sourceReady,
      audioDecoded: Number.isFinite(result.audioDuration) && result.audioDuration > 0 && !result.audioError,
      analysisCompleted: result.analysisCompleted === null || result.analysisCompleted,
      analysisTimeline: result.analysisBlocks === null || result.analysisBlocks > 2,
      analysisProgress: result.taskShown === null || result.taskShown,
      analysisLock: result.busyRejected === null || result.busyRejected,
      analysisBadge: result.analysisBadge === null || result.analysisBadge,
      alignedComparison: result.comparisonRows === null || result.comparisonRows >= (process.env.XLD_MULTI_ANALYSIS_SMOKE === '1' ? 2 : 1),
      analysisRootVisible: result.analysisRootVisible,
      noRuntimeErrors: failures.length === 0
    };
    const target = process.env.XLD_SCREENSHOT;
    if (target) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      await new Promise(resolve => setTimeout(resolve, 500));
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
