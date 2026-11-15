'use strict';
// Export a score video from the command line, against a copy of analysed tracks.
//
//   electron source/scoreview/export/cli.cjs <scratch appdata folder> <out folder> <exact title> [1080p] [720p]
//
// Like tests/xml-scene-smoke.cjs, it points Electron's appData / userData at the scratch folder
// (whose "Xin's Local Deck Beta/settings.json" names the library and a copied analysis root),
// starts XML's real main process unchanged, and asks it for the track's score model through the
// same preload bridge the score scene uses. The captions are then re-made as marks (the
// adapter's captionStyle 'mark', the look chosen at gate10), since XML's scene does not ask for
// them yet. Each tier is written as "<Artist - Title> <tier>.mp4" into the out folder, beside a
// JSON summary and the model that was drawn.
//
// The real analysis root and the scratch analysis root are both passed as forbidden folders.
const fs = require('node:fs');
const path = require('node:path');
const {app, BrowserWindow} = require('electron');

const REAL_ANALYSIS_ROOT = "D:\\Caches\\Xin's Local Deck\\Analysis";
const [scratch, out, wanted, ...tierArgs] = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
const tiers = tierArgs.length ? tierArgs : ['1080p', '720p'];
const settingsFile = scratch && path.join(path.resolve(scratch), "Xin's Local Deck Beta", 'settings.json');
if (!out || !wanted || !settingsFile || !fs.existsSync(settingsFile)) {
  console.error('用法：<带 settings.json 的临时 appdata 目录> <输出目录> <曲名> [1080p] [720p]');
  process.exit(2);
}
app.setPath('appData', path.resolve(scratch));
app.setPath('userData', path.join(path.resolve(scratch), 'xml-user-data'));
app.commandLine.appendSwitch('mute-audio');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
require(path.join(__dirname, '..', '..', 'fusion-runtime-baseline', 'desktop', 'main.cjs'));
const exporter = require('./export-main.cjs');
const {captions, mergeManual} = require('../adapter/captions.cjs');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function modelFromXml() {
  let win = null;
  for (let i = 0; i < 100 && !win; i++) { await wait(200); win = BrowserWindow.getAllWindows()[0] || null; }
  if (!win) throw new Error('XML 没有开出窗口');
  if (win.webContents.isLoading()) await new Promise(resolve => win.webContents.once('did-finish-load', resolve));
  const page = code => win.webContents.executeJavaScript(`(async () => { ${code} })()`, true);
  await wait(1000);
  const settings = await page('return await window.XinsMusicLabFusion.settings();');
  if (path.resolve(settings.settingsPath) !== settingsFile) throw new Error(`XML 读的不是临时设置：${settings.settingsPath}`);
  const library = await page('const info = await window.XinsMusicLabFusion.scanLibrary(); return (info.tracks || []).map(t => ({id: t.id, title: t.title}));');
  const track = library.find(item => String(item.title) === wanted) || library.find(item => String(item.title).includes(wanted));
  if (!track) throw new Error(`曲库里没有标题含「${wanted}」的歌`);
  const result = await page(`return await window.XinsMusicLabFusion.scoreModel(${JSON.stringify(track.id)});`);
  if (!result || !result.ok) throw new Error(`谱面模型读不出来：${result && (result.error + ' ' + (result.details || ''))}`);
  const analysisRoot = JSON.parse(fs.readFileSync(settingsFile, 'utf8')).analysisRoot || null;
  // XML's own window keeps animating its scenes on the GPU; out of sight and throttled it stops
  // competing with the export (measured: 26 → see REPORT-A frames per second at 1080p).
  win.webContents.setBackgroundThrottling(true);
  win.hide();
  win.webContents.setAudioMuted(true);
  return {model: result.model, health: result.health, analysisRoot, window: win};
}

// The marks the chosen look shows, made by the same adapter code from the finished model.
function withMarks(model, lang) {
  const manual = (model.captions || []).filter(row => row[3] === 'manual').map(row => ({start: row[0], end: row[1], text: row[2]}));
  const bare = {...model};
  delete bare.captions;
  const lines = mergeManual(captions(bare, [], {captionStyle: 'mark', lang}), manual);
  const next = {...model};
  if (lines.length) next.captions = lines; else delete next.captions;
  return next;
}

async function run() {
  await app.whenReady();
  const report = {wanted, tiers: {}, started: new Date().toISOString()};
  const got = await modelFromXml();
  const model = withMarks(got.model, 'zh');
  report.track = model.track;
  report.audio = model.audio;
  report.marks = (model.captions || []).filter(row => row[4]).length;
  // Since 2026-11-14 the adapter makes marks by default, so XML's own model should already carry them.
  report.marksFromXml = (got.model.captions || []).filter(row => row[4]).length;
  report.sameAsXml = JSON.stringify(got.model.captions || []) === JSON.stringify(model.captions || []);
  fs.mkdirSync(out, {recursive: true});
  const base = exporter.fileNameFor(model).replace(/\.mp4$/, '');
  fs.writeFileSync(path.join(out, `${base}.model.json`), JSON.stringify(model));
  for (const tier of tiers) {
    const outFile = path.join(path.resolve(out), `${base} ${tier}.mp4`);
    const t0 = Date.now();
    let last = '';
    const result = await exporter.exportVideo({
      model, tier, outFile, lang: 'zh', acceleration: process.argv.includes('--software') ? 'prefer-software' : 'auto', forbidden: [REAL_ANALYSIS_ROOT, got.analysisRoot].filter(Boolean),
      onProgress: step => { const line = `${step.stage} ${Math.round(100 * step.done / Math.max(1, step.total))}%`; if (line !== last && step.done % 900 === 0) { last = line; console.log(`[${tier}] ${line}`); } }
    });
    report.tiers[tier] = {...result, wallSeconds: (Date.now() - t0) / 1000};
    console.log(`[${tier}] ${result.ok ? `${result.file} ${(result.summary.bytes / 1048576).toFixed(2)} MB in ${((Date.now() - t0) / 1000).toFixed(1)} s` : `${result.error}: ${result.message} ${result.details || ''}`}`);
  }
  fs.writeFileSync(path.join(out, `${base}.export.json`), JSON.stringify(report, null, 1));
}

run().then(() => app.exit(0), error => { console.error(String(error && error.stack || error)); app.exit(1); });
