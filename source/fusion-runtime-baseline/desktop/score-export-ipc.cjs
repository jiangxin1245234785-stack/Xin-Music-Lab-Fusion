'use strict';
// "Export video" in XML's main process: the three channels behind the score scene's button.
// main.cjs hands over what it owns (its windows, its dialogs, the score model and the analysis
// roots); the engine is source/scoreview/export. Kept apart from main.cjs so the wiring can be
// tested without Electron (tests/score-export-wiring.cjs).
const path = require('path');
const fsSync = require('fs');

const PRESETS = ['clear', 'keys', 'ink', 'stage', 'strong', 'off'];

// deps: {app, dialog, shell, BrowserWindow, exporter, scoreModelFor(payload), analysisRoots() → [folders], locale() → 'zh-CN' | 'en-US' | …}
function createScoreExport(deps) {
  const {app, dialog, shell, BrowserWindow, exporter, scoreModelFor, analysisRoots, locale} = deps;
  let running = null;
  const exported = new Set();
  const langOf = () => (String(locale() || '').toLowerCase().startsWith('en') ? 'en' : 'zh');

  async function start(event, payload) {
    const lang = langOf();
    const refuse = (error, details) => ({ok: false, error, message: exporter.MESSAGES[lang][error] || exporter.MESSAGES[lang].failed, details: details || null});
    if (running) return refuse('busy');
    const videoBitrate = payload?.videoBitrate;
    if (videoBitrate != null && !exporter.validVideoBitrate(videoBitrate)) return refuse('invalid-video-bitrate');
    // Nothing is ever written inside an analysis root. Without the list there is nothing to check
    // against, so there is no export either.
    const forbidden = analysisRoots();
    if (!Array.isArray(forbidden) || !forbidden.length) return refuse('failed', 'no analysis roots to keep clear of');
    const tier = payload?.tier === '720p' ? '720p' : '1080p';
    const built = await scoreModelFor({trackId: payload?.trackId, useDynamics: payload?.useDynamics === true, lang: payload?.lang});
    if (!built?.ok) return refuse('no-model');
    const owner = BrowserWindow.fromWebContents(event.sender);
    const folder = exporter.defaultFolder(app) || app.getPath('home');
    const picked = await dialog.showSaveDialog(owner, {
      defaultPath: path.join(folder, exporter.fileNameFor(built.model)),
      filters: [{name: 'MP4', extensions: ['mp4']}]
    });
    if (picked.canceled || !picked.filePath) return {ok: false, error: 'not-chosen'};
    const Core = require('../../scoreview/score-view.js');
    const Presentation = require('../../scoreview/score-presentation.js');
    const look = {};
    for (const key of Object.keys(Core.DEFAULTS)) if (Object.hasOwn(payload?.presentationLook || {}, key)) look[key] = payload.presentationLook[key];
    if (!Number.isFinite(look.offsetSeconds) || Math.abs(look.offsetSeconds)>1) look.offsetSeconds=0;
    look.scoreStyle=require('../../scoreview/score-style.cjs').normalize(payload?.presentationLook?.scoreStyle);
    look.presentationLayout = true;
    look.lang = lang === 'en' ? 'en-US' : 'zh-CN';
    if (look.scoreStyle === 'starry' || look.scoreStyle === 'paper') {
      look.variation = Presentation.variationSnapshot(payload?.presentationLook?.variation, built.model.track.id);
      look.variationLang = look.lang;
    }
    const lyrics = Presentation.lyricsSnapshot(payload?.lyrics, built.model.track.id, Boolean(look.variation));
    if (PRESETS.includes(payload?.fxPreset)) look.fxPreset = payload.fxPreset;
    // The effects follow the song's rise and fall in the video when they do in the scene.
    if (payload?.fxDynamics === 'song' || payload?.fxDynamics === 'off') look.fxDynamics = payload.fxDynamics;
    // The scene always shows the stems without notes as a band (SPEC-REST.md), so the video does too.
    look.showTexture = true;
    // 按乐器画音符 (SPEC-B4): the video draws the shapes when the scene does, the spindle set; off, nothing is passed.
    if (payload?.shapes === true) { look.showShapes = true; look.shapeSet = 'spindle'; }
    // Starry score is permanent, including requests from older saved presets.
    look.meteorMotion = true;
    Object.assign(look,Core.transientTiming(payload?.transientTiming || payload?.presentationLook));
    for (const key of ['mergeTimbres', 'simplify']) if (typeof payload?.[key] === 'boolean') look[key] = payload[key];
    const controller = new AbortController();
    running = {controller, file: picked.filePath};
    const stop = () => controller.abort();
    owner?.once?.('closed', stop);
    const started = Date.now();
    const tell = step => { if (!event.sender.isDestroyed()) event.sender.send('fusion:score-export-progress', {...step, elapsed: (Date.now() - started) / 1000}); };
    tell({stage: 'start', done: 0, total: 1, tier, file: picked.filePath});
    try {
      const result = await exporter.exportVideo({
        model: built.model, lyrics, tier, videoBitrate, outFile: picked.filePath, lang, look, signal: controller.signal, forbidden, onProgress: tell
      });
      if (result.ok) exported.add(path.resolve(result.file));
      return result.ok ? {ok: true, file: result.file, bytes: result.summary.bytes, seconds: (Date.now() - started) / 1000} : result;
    } finally {
      owner?.removeListener?.('closed', stop);
      running = null;
    }
  }

  function cancel() {
    if (!running) return {ok: false};
    running.controller.abort();
    return {ok: true};
  }

  // Only a file this run exported can be shown in its folder.
  function reveal(_event, payload) {
    const file = path.resolve(String(payload?.file || ''));
    if (!exported.has(file) || !fsSync.existsSync(file)) return {ok: false};
    shell.showItemInFolder(file);
    return {ok: true};
  }

  return {start, cancel, reveal, register: ipcMain => {
    ipcMain.handle('fusion:score-export', start);
    ipcMain.handle('fusion:score-export-cancel', cancel);
    ipcMain.handle('fusion:score-export-reveal', reveal);
  }};
}

module.exports = {createScoreExport, PRESETS};
