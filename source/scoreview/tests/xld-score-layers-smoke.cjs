'use strict';
// The "谱面层 · 这首歌" button inside the real XLD window, against a copy of analysed tracks.
//
//   electron source/scoreview/tests/xld-score-layers-smoke.cjs <scratch appdata folder> <out folder> <album text> <track text>
//
// The scratch folder holds "Xin's Local Deck Beta/settings.json" (library and analysis roots).
// appData and userData are pointed there before XLD starts, and the run refuses to go on if
// XLD reports any other analysis root. Needs XLD_MUSCRIPTOR_PYTHON, XLD_MUSCRIPTOR_ROOT and
// XLD_ROFORMER_PYTHON in the environment, as a build's runtime.json would set them.
// Only the single-track button is pressed: the album button would run every song of the album.
const fs = require('node:fs');
const path = require('node:path');
const {app, BrowserWindow} = require('electron');

const [scratch, out, albumText, trackText] = process.argv.slice(2);
const profile = scratch && path.join(path.resolve(scratch), "Xin's Local Deck Beta");
if (!out || !albumText || !trackText || !profile || !fs.existsSync(path.join(profile, 'settings.json'))) {
  console.error('用法：<带 settings.json 的临时 appdata 目录> <输出目录> <专辑名的一部分> <曲名的一部分>');
  process.exit(2);
}
const wanted = JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'), 'utf8'));
app.setPath('appData', path.resolve(scratch));
app.setPath('userData', profile);
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
require(process.env.SCOREVIEW_XLD_MAIN || path.join(__dirname, '..', '..', 'xld-runtime-baseline', 'desktop', 'main.cjs'));

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = {problems: []};

async function run() {
  await app.whenReady();
  let win = null;
  for (let i = 0; i < 100 && !win; i++) { await wait(200); win = BrowserWindow.getAllWindows()[0] || null; }
  if (!win) throw new Error('XLD 没有开出窗口');
  win.webContents.on('console-message', (_event, level, message) => { if (level >= 3) report.problems.push(String(message).slice(0, 300)); });
  if (win.webContents.isLoading()) await new Promise(resolve => win.webContents.once('did-finish-load', resolve));
  win.show();
  const page = code => win.webContents.executeJavaScript(`(async () => { ${code} })()`, true);
  for (let i = 0; i < 60; i++) { await wait(500); if (await page('return document.querySelectorAll("[data-album-id]").length;')) break; }
  report.settings = await page('const s = await window.XLD.getAnalysisSettings(); return {analysisRoot: s.analysisRoot};');
  if (path.resolve(report.settings.analysisRoot) !== path.resolve(wanted.analysisRoot)) throw new Error(`XLD 用的不是临时分析根：${report.settings.analysisRoot}`);
  report.buttons = await page('const b = id => { const e = document.getElementById(id); return e && {text: e.textContent, disabled: e.disabled, shown: e.offsetParent !== null}; }; return {track: b("scoreLayersTrackButton"), album: b("scoreLayersAlbumButton")};');
  const picked = await page(`const card = [...document.querySelectorAll('[data-album-id]')].find(e => e.textContent.includes(${JSON.stringify(albumText)})); if (!card) return 'no-album'; card.click(); await new Promise(r => setTimeout(r, 1200)); const row = [...document.querySelectorAll('[data-track-id]')].find(e => e.textContent.includes(${JSON.stringify(trackText)})); if (!row) return 'no-track'; row.click(); await new Promise(r => setTimeout(r, 2500)); return {track: state.selectedTrack && state.selectedTrack.title, id: state.selectedTrack && state.selectedTrack.id, albumTracks: state.selectedAlbum && state.selectedAlbum.tracks.length};`);
  report.picked = picked;
  if (typeof picked === 'string') throw new Error(picked);
  await page('document.getElementById("scoreLayersTrackButton").click();');
  const seen = new Set();
  for (let i = 0; i < 600; i++) {
    await wait(1000);
    const now = await page('return {busy: Boolean(state.activeTask || state.batchRunning), text: document.getElementById("scoreLayersTrackButton").textContent, other: document.getElementById("batchAlbumButton").disabled};');
    seen.add(now.text);
    if (i === 3) report.whileRunning = now;
    if (!now.busy && i > 2) break;
  }
  report.buttonTexts = [...seen];
  report.log = await page('return [...document.getElementById("analysisLog").children].map(e => e.textContent).slice(-6);');
  report.after = await page('const b = document.getElementById("scoreLayersTrackButton"); return {text: b.textContent, disabled: b.disabled, results: [...state.analysisResults.keys()]};');
  // Pressed again: both are answered from disk.
  const started = Date.now();
  await page('document.getElementById("scoreLayersTrackButton").click();');
  for (let i = 0; i < 120; i++) { await wait(500); if (!(await page('return Boolean(state.activeTask || state.batchRunning);')) && i > 1) break; }
  report.again = {seconds: (Date.now() - started) / 1000, log: await page('return [...document.getElementById("analysisLog").children].map(e => e.textContent).slice(-2);')};
  fs.mkdirSync(out, {recursive: true});
  fs.writeFileSync(path.join(out, 'xld-score-layers.png'), (await win.webContents.capturePage()).toPNG());
}

run().catch(error => { report.error = String(error && error.stack || error); }).finally(() => {
  fs.mkdirSync(out, {recursive: true});
  fs.writeFileSync(path.join(out, 'xld-score-layers-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  app.exit(report.error ? 1 : 0);
});
