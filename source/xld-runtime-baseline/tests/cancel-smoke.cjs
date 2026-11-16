'use strict';

const path = require('path');
const os = require('os');
const { app, BrowserWindow } = require('electron');

process.env.XLD_TEST = '1';
app.commandLine.appendSwitch('disable-gpu');
app.disableHardwareAcceleration();
const userData = path.join(os.tmpdir(), `xld-cancel-${process.pid}`);
app.setPath('userData', userData);
// A fixture library of one song (B7, 2026-11-15: no longer a song of the user's own library). 20 s of a quiet tone.
const fs = require('fs');
const library = path.join(userData, 'library'), album = path.join(library, 'Fixture Artist - Cancel Album');
fs.mkdirSync(album, {recursive: true});
{
  const rate = 22050, frames = rate * 20, data = Buffer.alloc(frames * 2);
  for (let i = 0; i < frames; i++) data.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 220 * i / rate) * 3000), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0, 'latin1'); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8, 'latin1'); h.write('fmt ', 12, 'latin1');
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36, 'latin1'); h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(path.join(album, '01 Cancel Tone.wav'), Buffer.concat([h, data]));
}
fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({libraryRoot: library}));
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
      // The fixture song, found through the library the window shows; SongFormer started through the bridge the
      // panel's button uses (analysis:run), not awaited, so it can be cancelled while it runs.
      let scan = null;
      for (let i = 0; i < 100; i++) { scan = await window.XLD.scanLibrary(); if ((scan.albums || []).some(a => /Cancel Album/.test(a.title || a.album || ''))) break; await wait(100); }
      const track = (scan.albums || []).flatMap(a => a.tracks || []).find(item => /Cancel Tone/.test(item.title || ''));
      const started = track ? window.XLD.runAnalysis(track.id, 'songformer') : Promise.resolve({ok: false, error: 'no-fixture-track'});
      const engine = track ? 'songformer' : null;
      let task = null;
      for (let i = 0; i < 100 && !task; i++) { task = await window.XLD.getAnalysisTask(); if (!task) await wait(100); }
      const cancelled = task ? await window.XLD.cancelAnalysis(task.taskId) : { ok: false };
      const answer = await started;
      for (let i = 0; i < 200 && await window.XLD.getAnalysisTask(); i++) await wait(100);
      await wait(350);
      return {
        engine, track: track ? track.title : null, answer: answer && (answer.error || (answer.ok ? 'ok' : 'failed')),
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
