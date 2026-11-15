'use strict';
// The score scene inside the real XML app, against a copy of analysed tracks.
//
//   electron source/scoreview/tests/xml-scene-smoke.cjs <scratch appdata folder> <out folder> <exact title> [seconds to seek to]
//
// The scratch folder holds "Xin's Local Deck Beta/settings.json". Electron's appData and
// userData are pointed at it before XML starts, so XML reads its library and analysis roots
// from the scratch settings (never the user's own) and keeps its own data there too; the
// run refuses to go on if XML reports any other settings file. This file
// then starts XML's real main process unchanged, picks the track by title through the same
// preload bridge the app uses, switches to the score scene, plays, and writes what the scene
// reports plus a screenshot. It asserts nothing about counts: it prints, the caller reads.
const fs = require('node:fs');
const path = require('node:path');
const {app, BrowserWindow} = require('electron');

const [scratch, out, wanted, seekTo, extra] = process.argv.slice(2);
const settingsFile = scratch && path.join(path.resolve(scratch), "Xin's Local Deck Beta", 'settings.json');
if (!out || !wanted || !settingsFile || !fs.existsSync(settingsFile)) {
  console.error('用法：<带 settings.json 的临时 appdata 目录> <输出目录> <曲名> [秒]');
  process.exit(2);
}
app.setPath('appData', path.resolve(scratch));
app.setPath('userData', path.join(path.resolve(scratch), 'xml-user-data'));
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
// SCOREVIEW_XML_MAIN points at another copy of XML's main process: the one inside a packaged build.
const mainFile=process.env.SCOREVIEW_XML_MAIN || path.join(__dirname, '..', '..', 'fusion-runtime-baseline', 'desktop', 'main.cjs');
if(process.env.SCOREVIEW_XML_MAIN){
  const bundle=path.resolve(path.dirname(mainFile),'../../../..');
  if(fs.existsSync(path.join(bundle,'resources/app/release-shell.cjs'))){
    const runtime=require(path.join(bundle,'resources/apps/shared-analysis/runtime-config.cjs'));
    runtime.apply(path.join(bundle,'runtime.json'));
    require(path.join(bundle,'resources/app/release-shell.cjs')).install({root:bundle,isXml:true,version:JSON.parse(fs.readFileSync(path.join(bundle,'resources/app/package.json'),'utf8')).version,electron:require('electron'),runtime});
  }
}
require(mainFile);

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = {wanted, problems: []};

async function run() {
  await app.whenReady();
  let win = null;
  for (let i = 0; i < 100 && !win; i++) { await wait(200); win = BrowserWindow.getAllWindows()[0] || null; }
  if (!win) throw new Error('XML 没有开出窗口');
  win.webContents.on('console-message', (_event, level, message) => { if (level >= 2) report.problems.push(String(message).slice(0, 300)); });
  if (win.webContents.isLoading()) await new Promise(resolve => win.webContents.once('did-finish-load', resolve));
  const page = code => win.webContents.executeJavaScript(`(async () => { ${code} })()`, true);
  win.show();
  await wait(1500);
  report.settings = await page('return await window.XinsMusicLabFusion.settings();');
  if (path.resolve(report.settings.settingsPath) !== settingsFile) throw new Error(`XML 读的不是临时设置：${report.settings.settingsPath}`);
  const library = await page('const info = await window.XinsMusicLabFusion.scanLibrary(); return {ok: info.ok, tracks: (info.tracks || []).map(t => ({id: t.id, title: t.title, album: t.album}))};');
  const track = (library.tracks || []).find(item => String(item.title) === wanted) || (library.tracks || []).find(item => String(item.title).includes(wanted));
  report.library = {ok: library.ok, tracks: (library.tracks || []).length};
  if (!track) throw new Error(`曲库里没有标题含「${wanted}」的歌`);
  report.track = track;
  // The model exactly as the scene will get it.
  const model = await page(`const r = await window.XinsMusicLabFusion.scoreModel(${JSON.stringify(track.id)}); return {ok: r.ok, error: r.error || null, details: r.details || null, health: r.health || null, lanes: r.ok ? r.model.lanes.map(l => [l.id, (l.notes || l.hits).length]) : null, chords: r.ok && r.model.chords ? r.model.chords.length : 0, sections: r.ok && r.model.sections ? r.model.sections.map(s => s[2]) : null, cover: r.ok ? Boolean(r.model.cover) : false, duration: r.ok ? r.model.track.duration : null};`);
  report.model = model;
  // Load the track the way the app does at start-up: it reopens the last track.
  await page(`localStorage.setItem('xins-fusion-last-track', ${JSON.stringify(track.id)});`);
  win.webContents.reload();
  await new Promise(resolve => win.webContents.once('did-finish-load', resolve));
  win.show();
  for (let i = 0; i < 60; i++) {
    await wait(500);
    const state = await page('return window.XinScoreSceneView ? window.XinScoreSceneView.status() : null;');
    if (state && (state.status === 'ready' || state.status === 'empty' || state.status === 'failed') && state.trackId === track.id) break;
  }
  report.beforeScene = await page('const s = window.XinScoreSceneView.status(); return {status: s.status, active: s.active, trackId: s.trackId};');
  await page(`document.querySelector('.scene-button[data-effect="score"]').click();`);
  await page(`const audio = document.getElementById('fusionAudio'); audio.muted = true; ${Number(seekTo) > 0 ? `audio.currentTime = ${Number(seekTo)};` : ''} try { await audio.play(); } catch (error) { return String(error); }`);
  // The app pauses the element while it settles a freshly loaded track; ask again until it holds.
  for (let i = 0; i < 6; i++) {
    await wait(700);
    if (!await page('const audio = document.getElementById("fusionAudio"); if (audio.paused) { try { await audio.play(); } catch (error) {} } return audio.paused;')) break;
  }
  await wait(3000);
  const first = await page('const s = window.XinScoreSceneView.status(); return {status: s.status, active: s.active, external: s.external, latencyMs: s.latencyMs, layers: s.layers, frame: s.frame, audio: document.getElementById("fusionAudio").currentTime, effect: document.querySelector(".stage").dataset.effect, opacity: getComputedStyle(document.getElementById("scoreCanvas")).opacity};');
  report.layout = await page('const box = name => { const e = document.querySelector(name); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; }; return {stage: box(".stage"), score: box("#scoreCanvas"), brand: box(".brand"), controls: box(".controls"), hud: box(".fusion-hud"), catalog: box(".visual-catalog")};');
  await wait(2000);
  const second = await page('const s = window.XinScoreSceneView.status(); const a = document.getElementById("fusionAudio"); return {frame: s.frame, audio: a.currentTime, paused: a.paused, ended: a.ended, ready: a.readyState, duration: a.duration, src: a.src.slice(-24)};');
  report.scene = first;
  report.audio = {paused: second.paused, ended: second.ended, ready: second.ready, duration: second.duration, src: second.src};
  report.moved = {audio: second.audio - first.audio, score: second.frame && first.frame ? second.frame.time - first.frame.time : null};
  // The latency control: one step later, one step back, and the number the scene uses follows.
  report.sync = await page('const box = document.querySelector(".score-sync"), [less, more] = box.querySelectorAll("button"); const read = () => ({text: box.querySelector("span").textContent, ms: window.XinScoreSceneView.status().latencyMs, hidden: box.hidden}); const before = read(); more.click(); const up = read(); less.click(); const back = read(); return {before, up, back};');
  // The effects level in the settings drawer: off, then strong, then back to what it was;
  // the frame the scene draws next says which level it drew with, and the choice is kept.
  report.effectsSetting = await page(`const select = document.getElementById('scoreEffects'); if (!select) return {missing: true};
    const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => { const f = window.XinScoreSceneView.status().frame; resolve(f && f.fx ? f.fx.level : 'off'); })));
    const pick = async value => { select.value = value; select.dispatchEvent(new Event('change')); return {value, drawn: await frame(), kept: localStorage.getItem('xin-score-effects'), status: window.XinScoreSceneView.status().effects}; };
    const before = {value: select.value, drawn: await frame()}; const off = await pick('off'); const strong = await pick('strong'); const back = await pick(before.value);
    return {before, off, strong, back, labels: [...select.options].map(option => option.textContent)};`);
  // B0: run the `score-layers` analysis through the scene's own button, then look again.
  if (extra === 'layers') {
    const before = await page('const s = window.XinScoreSceneView.status(); return {offering: s.offering, layers: s.layers && {bars: s.layers.bars, energy: s.layers.energy, levels: s.layers.levels}, health: s.health && {bars: s.health.bars, layersRun: s.health.layersRun}};');
    await page('window.XinScoreSceneView.makeLayers();');
    let after = null;
    for (let i = 0; i < 240; i++) {
      await wait(1000);
      after = await page('const s = window.XinScoreSceneView.status(); return {making: s.making, offering: s.offering, layers: s.layers && {bars: s.layers.bars, beats: s.layers.beats, energy: s.layers.energy, levels: s.layers.levels}, health: s.health && {bars: s.health.bars, energy: s.health.energy, levels: s.health.levels, layersRun: s.health.layersRun}, bar: s.frame && s.frame.bar, heights: s.frame && s.frame.heights, backdrop: s.frame && s.frame.backdrop};');
      if (!after.making && i > 2) break;
    }
    report.layers = {before, after};
  }
  // Touching the score, with real DOM events on the canvas (plan B2).
  const touch = (x, y, type) => page(`const c = document.getElementById('scoreCanvas'), b = c.getBoundingClientRect(); c.dispatchEvent(new MouseEvent(${JSON.stringify(type || 'click')}, {bubbles: true, clientX: b.left + b.width * ${x}, clientY: b.top + ${y}}));`);
  const state = () => page('const s = window.XinScoreSceneView.status(), a = document.getElementById("fusionAudio"); return {solo: s.solo, loop: s.loop, focus: s.frame && s.frame.focus, drawnLoop: s.frame && s.frame.loop, time: a.currentTime, stem: document.getElementById("fusionStemSelect").value, options: Array.from(document.getElementById("fusionStemSelect").options).map(o => o.value), src: decodeURIComponent(a.src).slice(-28), paused: a.paused, tall: document.getElementById("scoreCanvas").clientHeight};');
  const touching = {steps: []};
  const tall = (await state()).tall;
  // Lanes: go down the middle until the stem selector moves, then touch the same place again.
  for (let y = 60; y < tall - 70 && !touching.soloAt; y += 12) {
    await touch(0.8, y);
    await wait(900);
    const now = await state();
    if (now.stem !== 'original') { touching.soloAt = y; touching.solo = now; }
  }
  if (touching.soloAt) {
    await wait(1200);
    touching.soloPlaying = await state();
    await touch(0.8, touching.soloAt);
    await wait(1500);
    touching.soloOff = await state();
  }
  // Sections: the bar is near the bottom of the canvas. A click jumps, a double click loops.
  // Freeze the media clock while locating the bar: ordinary playback during a slow probe
  // must not be mistaken for a successful seek of more than five seconds.
  await page('document.getElementById("fusionAudio").pause();');
  const before = await state();
  for (let y = tall - 8; y > tall - 80 && touching.jump === undefined; y -= 6) {
    await touch(0.1, y);
    await wait(500);
    const now = await state();
    if (Math.abs(now.time - before.time) > 5) { touching.barAt = y; touching.jump = {from: before.time, to: now.time}; }
  }
  if (touching.barAt) {
    await touch(0.1, touching.barAt, 'dblclick');
    await wait(400);
    touching.looping = await state();
    if (touching.looping.loop) {
      await page(`const audio = document.getElementById('fusionAudio'); audio.currentTime = ${touching.looping.loop.end - 1}; await audio.play();`);
      await wait(2500);
      touching.wrapped = await state();
      await touch(0.6, touching.barAt);
      await wait(500);
      touching.loopOff = await state();
    }
  }
  report.touching = touching;
  fs.mkdirSync(out, {recursive: true});
  fs.writeFileSync(path.join(out, `${wanted}-score.png`), (await win.webContents.capturePage()).toPNG());
  // Another scene: the score canvas must go away and stop drawing.
  await page(`document.querySelector('.scene-button[data-effect="spectrum"]').click();`);
  await wait(1200);
  report.afterLeaving = await page('return {effect: document.querySelector(".stage").dataset.effect, opacity: getComputedStyle(document.getElementById("scoreCanvas")).opacity, active: window.XinScoreSceneView.status().active};');
  fs.writeFileSync(path.join(out, `${wanted}-other.png`), (await win.webContents.capturePage()).toPNG());
}

run().catch(error => { report.error = String(error && error.stack || error); }).finally(() => {
  fs.mkdirSync(out, {recursive: true});
  fs.writeFileSync(path.join(out, `${wanted}-report.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  app.exit(report.error ? 1 : 0);
});
