'use strict';
// Export one analysed song as a video of its score: the main-process half.
//
//   const exporter = require('<scoreview>/export/export-main.cjs');
//   const result = await exporter.exportVideo({model, tier: '1080p', outFile, forbidden: [analysis roots],
//                                              onProgress, signal, lang});
//   // → {ok: true, file, summary} or {ok: false, error, message}
//
// The picture is drawn offline in a hidden window (export-page.html) by the same core the app
// uses; the song's audio file (model.audio.src) is read here and handed over as bytes. The
// file is written next to its final name as "<name>.part-<pid>" and renamed only when it is
// complete, so a cancel, a full disk or a crash never leaves half a video under the real name.
// Nothing is ever written inside a folder listed in `forbidden` (the analysis roots).
const fs = require('node:fs');
const path = require('node:path');
const {fileURLToPath} = require('node:url');

// The look chosen on the listening page (gate9 / gate10): clear, icons, thin section line, marks. In a video the
// backdrop keeps one brightness (REPORT-A §10 (b)): a picture that changes every frame costs most of the bits.
const LOOK = Object.freeze({fxPreset: 'clear', laneLabels: 'icon', sectionStyle: 'line', captionStyle: 'mark', mergeTimbres: true, simplify: true, backdropLevel: 'steady'});

// Two sizes only. Both lay the score out on the same 1280 × 720 page; 1080p draws it at 1.5×.
// Bit rates are averages the encoder aims at (variable rate); audio is AAC-LC. The GPU's
// encoder is used when there is one: it keeps to the rate. Chromium's software encoder does
// not (on this content about 480 kbps at 1080p and 245 kbps at 720p whatever is asked), so
// without a GPU encoder the files come out larger. Measured in work/score-export-20261114/probe.
const TIERS = Object.freeze({
  '1080p': Object.freeze({width: 1920, height: 1080, ratio: 1.5, videoBitrate: 420000, audioBitrate: 128000, keySeconds: 10, codec: 'avc1.640028'}),
  '720p': Object.freeze({width: 1280, height: 720, ratio: 1, videoBitrate: 200000, audioBitrate: 96000, keySeconds: 10, codec: 'avc1.64001f'})
});
const FPS = 30;
const SAMPLE_RATE = 44100;
// Samples of encoder delay at the start of the AAC stream, skipped by an edit list. Chromium's
// AAC encoder adds none: tests/export-verify.cjs finds the MP4's audio and the song's own audio
// line up to the sample (REPORT-A).
const AUDIO_PRIMING = 0;

const PAGE = path.join(__dirname, 'export-page.html');
const PRELOAD = path.join(__dirname, 'export-preload.cjs');

const MESSAGES = {
  zh: {
    'no-model': '这首歌还没有分析结果，导不出谱面视频。',
    'audio-missing': '找不到这首歌的音频文件，导不出来。',
    'audio-decode': '这首歌的音频读不出来，导不出来。',
    'forbidden-folder': '不能存到分析结果的文件夹里，换一个位置。',
    'folder-missing': '要存的文件夹不存在。',
    'disk-full': '磁盘空间不够，视频没有存下来。',
    'write-failed': '写文件失败，视频没有存下来。',
    'cancelled': '已取消，没有留下文件。',
    'window-gone': '导出中途意外停了，没有留下文件。再试一次。',
    'webcodecs': '这台电脑上编不了这种视频。',
    'encode': '编码视频时出错，没有留下文件。',
    'busy': '已经在导出一首歌，等它结束。',
    'failed': '导出失败，没有留下文件。'
  },
  en: {
    'no-model': 'This song has no analysis yet, so there is no score to export.',
    'audio-missing': "Can't find this song's audio file.",
    'audio-decode': "Can't read this song's audio.",
    'forbidden-folder': "Can't save into the analysis folder. Pick another place.",
    'folder-missing': "The folder to save in doesn't exist.",
    'disk-full': 'The disk is full. The video was not saved.',
    'write-failed': "Couldn't write the file. The video was not saved.",
    'cancelled': 'Cancelled. No file was left behind.',
    'window-gone': 'The export stopped unexpectedly. No file was left behind. Try again.',
    'webcodecs': "This computer can't encode this kind of video.",
    'encode': 'Encoding failed. No file was left behind.',
    'busy': 'A song is already being exported. Wait for it to finish.',
    'failed': 'The export failed. No file was left behind.'
  }
};
const say = (code, lang) => (MESSAGES[lang === 'en' ? 'en' : 'zh'][code] || MESSAGES[lang === 'en' ? 'en' : 'zh'].failed);
const PAGE_CODES = {'audio-missing': 'audio-missing', 'audio-decode': 'audio-decode', cancelled: 'cancelled', webcodecs: 'webcodecs',
                    'video-encode': 'encode', 'audio-encode': 'encode', size: 'encode'};

// "Artist - Title.mp4", with characters Windows will not take replaced.
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
function fileNameFor(model) {
  const clean = text => String(text || '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim();
  // A library's placeholder artist says nothing; the title alone reads better.
  const rawArtist = clean(model && model.track && model.track.artist);
  const artist = /^unknown artist$/i.test(rawArtist) || rawArtist === '未知艺术家' ? '' : rawArtist;
  const title = clean(model && model.track && model.track.title);
  let base = artist && title ? `${artist} - ${title}` : (title || artist || 'score');
  base = base.replace(/[. ]+$/, '').slice(0, 150).replace(/[. ]+$/, '') || 'score';
  if (RESERVED.test(base)) base = `_${base}`;
  return `${base}.mp4`;
}

// The folder offered first: the user's Videos folder, else Downloads.
function defaultFolder(app) {
  for (const name of ['videos', 'downloads']) {
    try { const folder = app.getPath(name); if (folder && fs.existsSync(folder)) return folder; } catch (_) {}
  }
  return null;
}

function inside(file, folder) {
  if (!folder) return false;
  const a = path.resolve(file).toLowerCase(), b = path.resolve(folder).toLowerCase().replace(/[\\/]+$/, '');
  return a === b || a.startsWith(b + path.sep);
}

function audioPathOf(model, given) {
  if (given) return given;
  const src = model && model.audio && model.audio.src;
  if (!src) return null;
  try { return src.startsWith('file:') ? fileURLToPath(src) : (path.isAbsolute(src) ? src : null); } catch (_) { return null; }
}

// One job per export window, found again by the window's webContents id.
const jobs = new Map();
let wired = false;
function wire(ipcMain) {
  if (wired) return;
  wired = true;
  const jobOf = event => jobs.get(event.sender.id);
  ipcMain.handle('xin-score-export:job', event => { const job = jobOf(event); return job ? job.payload() : null; });
  ipcMain.handle('xin-score-export:write', async (event, bytes) => {
    const job = jobOf(event);
    if (!job) return false;
    return job.write(bytes);
  });
  ipcMain.on('xin-score-export:progress', (event, step) => { const job = jobOf(event); if (job) job.progress(step); });
  ipcMain.on('xin-score-export:done', (event, summary) => { const job = jobOf(event); if (job) job.done(summary); });
  ipcMain.on('xin-score-export:fail', (event, problem) => { const job = jobOf(event); if (job) job.fail(problem); });
}

// Every export window in this process at once is allowed; the caller decides whether to queue.
async function exportVideo(request) {
  const {BrowserWindow, ipcMain} = require('electron');
  const lang = request && request.lang;
  const result = (ok, extra) => ok ? {ok: true, ...extra} : {ok: false, error: extra.error, message: say(extra.error, lang), details: extra.details || null};
  const model = request && request.model;
  if (!model || !Array.isArray(model.lanes) || !model.lanes.length || !(model.track && model.track.duration > 0)) return result(false, {error: 'no-model'});
  const tier = TIERS[request.tier || '1080p'];
  if (!tier) return result(false, {error: 'failed', details: `unknown tier ${request.tier}`});
  const outFile = request.outFile && path.resolve(request.outFile);
  if (!outFile) return result(false, {error: 'write-failed', details: 'no output file'});
  if ((request.forbidden || []).some(root => inside(outFile, root))) return result(false, {error: 'forbidden-folder'});
  if (!fs.existsSync(path.dirname(outFile))) return result(false, {error: 'folder-missing'});
  const audioPath = audioPathOf(model, request.audioPath);
  if (!audioPath || !fs.existsSync(audioPath)) return result(false, {error: 'audio-missing', details: audioPath});
  if ((request.forbidden || []).some(root => inside(`${outFile}.part`, root))) return result(false, {error: 'forbidden-folder'});

  let audioBytes;
  try { audioBytes = await fs.promises.readFile(audioPath); } catch (error) { return result(false, {error: 'audio-missing', details: String(error.message)}); }

  wire(ipcMain);
  const partFile = `${outFile}.part-${process.pid}`;
  let handle = null, written = 0, finished = false;
  const window = new BrowserWindow({
    show: false, width: 320, height: 200, paintWhenInitiallyHidden: true,
    webPreferences: {preload: PRELOAD, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, spellcheck: false}
  });
  const id = window.webContents.id;

  return new Promise(resolve => {
    const finish = async (ok, extra) => {
      if (finished) return;
      finished = true;
      jobs.delete(id);
      if (request.signal) request.signal.removeEventListener('abort', onAbort);
      try { if (handle) await handle.close(); } catch (_) {}
      handle = null;
      let outcome;
      if (ok) {
        try {
          await fs.promises.rename(partFile, outFile).catch(async error => {
            // Replacing an existing file the user chose to overwrite.
            if (error.code !== 'EEXIST' && error.code !== 'EPERM') throw error;
            await fs.promises.rm(outFile, {force: true});
            await fs.promises.rename(partFile, outFile);
          });
          outcome = result(true, {file: outFile, summary: {...extra, bytes: (await fs.promises.stat(outFile)).size, audioPath}});
        } catch (error) {
          outcome = result(false, {error: 'write-failed', details: String(error.message)});
        }
      } else outcome = result(false, extra);
      if (!outcome.ok) await fs.promises.rm(partFile, {force: true}).catch(() => {});
      if (!window.isDestroyed()) window.destroy();
      resolve(outcome);
    };
    const onAbort = () => {
      if (!window.isDestroyed()) window.webContents.send('xin-score-export:cancel');
      finish(false, {error: 'cancelled'});
    };
    if (request.signal) {
      if (request.signal.aborted) { finish(false, {error: 'cancelled'}); return; }
      request.signal.addEventListener('abort', onAbort);
    }

    jobs.set(id, {
      payload: () => ({mode: 'export', model, look: {...LOOK, ...(request.look || {})}, tier, fps: FPS, sampleRate: SAMPLE_RATE,
                       audioPriming: Number.isFinite(request.audioPriming) ? request.audioPriming : AUDIO_PRIMING, acceleration: request.acceleration || 'auto',
                       audioBytes: audioBytes.buffer.slice(audioBytes.byteOffset, audioBytes.byteOffset + audioBytes.byteLength),
                       coverUrl: request.coverUrl || null}),
      write: async bytes => {
        if (finished) return false;
        try {
          if (!handle) {
            const opened = await fs.promises.open(partFile, 'w');
            // A cancel (or any end) that came while the file was being opened has already cleaned up,
            // before the file existed: this one is left to remove here.
            if (finished) {
              await opened.close().catch(() => {});
              await fs.promises.rm(partFile, {force: true}).catch(() => {});
              return false;
            }
            handle = opened;
          }
          const data = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
          let at = 0;
          while (at < data.byteLength) {
            const {bytesWritten} = await handle.write(data, at, data.byteLength - at, written + at);
            at += bytesWritten;
          }
          written += data.byteLength;
          return true;
        } catch (error) {
          finish(false, {error: error.code === 'ENOSPC' ? 'disk-full' : 'write-failed', details: `${error.code || ''} ${error.message}`});
          return false;
        }
      },
      progress: step => { if (typeof request.onProgress === 'function') { try { request.onProgress(step); } catch (_) {} } },
      done: async summary => {
        try { if (handle) await handle.sync(); } catch (_) {}
        finish(true, summary);
      },
      fail: problem => finish(false, {error: PAGE_CODES[problem && problem.code] || 'failed', details: problem && problem.message})
    });
    window.webContents.on('render-process-gone', (_event, details) => finish(false, {error: 'window-gone', details: details && details.reason}));
    window.on('closed', () => finish(false, {error: 'window-gone', details: 'closed'}));
    window.loadFile(PAGE).catch(error => finish(false, {error: 'failed', details: String(error.message)}));
  });
}

module.exports = {exportVideo, fileNameFor, defaultFolder, inside, LOOK, TIERS, FPS, SAMPLE_RATE, AUDIO_PRIMING, MESSAGES};
