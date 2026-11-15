'use strict';
// Check an exported score video against what it should be (REPORT-A items 2–5).
//
//   electron source/scoreview/export/tests/export-verify.cjs <video.mp4> <model.json> <tier> <out folder> [t1 t2 t3]
//
// 1. Container and codecs: read back with our own reader (tests/mp4-read.cjs), with Chromium's
//    demuxer (<video>: duration, size), and with Windows' own Media Foundation (Shell properties).
// 2. Every video sample decodes (WebCodecs VideoDecoder) and the count is duration × fps.
// 3. At three moments: the frame as exported (a fresh core drawn frame by frame from 0, as the
//    export does) against the frame as live playback draws it (a core on a clock that runs in
//    real time for 1.5 s before the moment): pixels and the frame's own report (effects, mark,
//    icons, section names). Then the decoded video frame against that drawing (compression error).
//    The decoded frames are saved as PNG.
// 4. Sound against picture: the MP4's audio (decoded by Chromium) against the song's own audio,
//    by cross-correlating loudness envelopes at several places; and drum onsets found in the
//    MP4's audio against the same onsets in the source.
// Prints JSON and writes <out>/<name>.verify.json.
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL, fileURLToPath} = require('node:url');
const {execFileSync} = require('node:child_process');
const {app, BrowserWindow} = require('electron');
const {readMp4} = require('./mp4-read.cjs');
const exporter = require('../export-main.cjs');

const [videoFile, modelFile, tierName, outDir, ...times] = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
app.commandLine.appendSwitch('mute-audio');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function mediaFoundation(file) {
  // Windows Shell reads these through Media Foundation's property handler for .mp4. Column
  // numbers on Windows 11: 27 length, 28 audio bit rate, 325 video compression (a FourCC GUID:
  // 34363248-… is "H264"), 327 video data rate, 328 frame height, 329 frame rate, 330 frame width.
  const columns = {27: 'length', 28: 'audioBitrate', 325: 'videoCompression', 327: 'videoDataRate', 328: 'height', 329: 'frameRate', 330: 'width'};
  const script = [
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    '$shell = New-Object -ComObject Shell.Application',
    `$folder = $shell.Namespace('${path.dirname(file).replace(/'/g, "''")}')`,
    `$item = $folder.ParseName('${path.basename(file).replace(/'/g, "''")}')`,
    `foreach ($i in @(${Object.keys(columns).join(',')})) { Write-Output ("$i=" + $folder.GetDetailsOf($item, $i)) }`
  ].join('; ');
  try {
    const text = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {encoding: 'utf8', timeout: 60000});
    const out = {};
    for (const line of text.split(/\r?\n/)) {
      const match = /^(\d+)=(.*)$/.exec(line.trim());
      if (match && columns[match[1]]) out[columns[match[1]]] = match[2].replace(/[\u200e\u200f\u202a-\u202c]/g, '').trim();
    }
    if (out.videoCompression) out.videoCompressionIsH264 = /^\{34363248-/.test(out.videoCompression);
    return out;
  } catch (error) { return {error: String(error.message).slice(0, 300)}; }
}

async function main() {
  await app.whenReady();
  const tier = exporter.TIERS[tierName];
  const model = JSON.parse(fs.readFileSync(modelFile, 'utf8'));
  const report = {video: videoFile, tier: tierName};
  const step = text => console.log(`-- ${text} ${new Date().toISOString().slice(11, 19)}`);
  report.reader = readMp4(videoFile);
  step('reader');
  report.mediaFoundation = mediaFoundation(videoFile);

  // Samples for the decoder, from our reader's tables (the decoder itself is Chromium's).
  const buffer = fs.readFileSync(videoFile);
  const {boxes} = require('./mp4-read.cjs');
  const samples = sampleBytes(buffer, boxes);

  const audioPath = model.audio.src.startsWith('file:') ? fileURLToPath(model.audio.src) : model.audio.src;
  const win = new BrowserWindow({show: false, width: 400, height: 300, webPreferences: {backgroundThrottling: false, contextIsolation: false, nodeIntegration: false, sandbox: false, preload: path.join(__dirname, 'verify-preload.cjs')}});
  await win.loadFile(path.join(__dirname, '..', 'export-page.html'));
  const page = (code, arg) => win.webContents.executeJavaScript(`(async (arg) => { ${code} })(${JSON.stringify(arg)})`, true);
  const duration = model.track.duration;
  const moments = times.length ? times.map(Number) : [Math.min(12.4, duration * 0.05), duration * 0.5, duration - 6.3];
  report.moments = moments;

  // --- decode every video sample ---
  report.decode = await page(`
    const fps = arg.fps, bytes = readBytes(arg.file); let decoded = 0, failure = null;
    const decoder = new VideoDecoder({output: frame => { decoded++; frame.close(); }, error: e => { failure = String(e); }});
    decoder.configure({codec: arg.codec, description: new Uint8Array(arg.description), hardwareAcceleration: 'prefer-software'});
    for (const [k, s] of arg.table.entries()) {
      decoder.decode(new EncodedVideoChunk({type: s[0] ? 'key' : 'delta', timestamp: Math.round(k * 1e6 / fps), data: bytes.subarray(s[1], s[1] + s[2])}));
      if (decoder.decodeQueueSize > 30) await new Promise(r => decoder.addEventListener('dequeue', r, {once: true}));
    }
    await decoder.flush(); decoder.close();
    return {decoded, failure};
  `, {fps: exporter.FPS, file: videoFile, codec: samples.codec, description: Array.from(samples.description), table: samples.video});

  step('decoded');
  // --- the <video> element: Chromium's own demuxer ---
  report.element = await page(`
    const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.src = arg; document.body.appendChild(v);
    await new Promise((ok, no) => { v.onloadedmetadata = ok; v.onerror = () => no(new Error('video error ' + (v.error && v.error.message))); });
    window.__video = v;
    return {duration: v.duration, width: v.videoWidth, height: v.videoHeight};
  `, pathToFileURL(videoFile).href);

  step('element');
  // --- the three moments ---
  const job = {model, look: {...exporter.LOOK}, tier, fps: exporter.FPS};
  report.frames = await page(`
    const job = arg.job, fps = job.fps, moments = arg.moments;
    const exported = await XinScoreExport.makeView(job);
    // The live drawing: its own canvas and a clock that runs in real time.
    let now = 0;
    const liveCanvas = document.createElement('canvas'); liveCanvas.width = job.tier.width; liveCanvas.height = job.tier.height;
    const live = XinScoreView.create(liveCanvas, job.model, () => now, {...job.look, offsetSeconds: 0});
    live.resize();
    if (exported.coverTaken) { const img = new Image(); img.src = job.model.cover.src; await img.decode(); live.setCover(img); }
    const pixels = c => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const pick = s => s ? JSON.parse(JSON.stringify({fx: s.fx, mark: s.mark, labels: s.labels, sectionNames: s.sectionNames, notes: s.notes, hits: s.hits, active: s.active})) : null;
    const compare = (a, b) => {
      let differ = 0, sum = 0, sq = 0, big = 0;
      for (let i = 0; i < a.length; i += 4) {
        let pixel = 0;
        for (let c = 0; c < 3; c++) { const d = Math.abs(a[i + c] - b[i + c]); sum += d; sq += d * d; pixel = Math.max(pixel, d); }
        if (pixel) differ++;
        if (pixel > 24) big++;
      }
      const n = a.length / 4, mse = sq / (n * 3);
      return {pixels: n, differing: differ, over24: big, meanAbs: +(sum / (n * 3)).toFixed(3), psnr: mse ? +(10 * Math.log10(255 * 255 / mse)).toFixed(2) : Infinity};
    };
    const out = [];
    let k = 0;
    for (const target of moments) {
      const frameIndex = Math.round(target * fps), time = frameIndex / fps;
      // As the export draws: every frame from where it left off.
      let stats = null;
      for (; k <= frameIndex; k++) stats = exported.view.draw(k / fps);
      const exportedPixels = pixels(exported.canvas).slice(0);
      const exportedStats = pick(stats);
      // As playback draws: real time for 1.5 s up to the moment, at whatever rate frames come.
      const startAt = performance.now(), from = time - 1.5;
      let liveFrames = 0;
      while (performance.now() - startAt < 1500) {
        now = from + (performance.now() - startAt) / 1000; live.draw(); liveFrames++;
        await new Promise(r => setTimeout(r, 16));
      }
      now = time;
      const liveStats = pick(live.draw());
      const livePixels = pixels(liveCanvas);
      // The decoded video frame at that index (seek into the middle of the frame).
      const v = window.__video;
      v.currentTime = (frameIndex + 0.5) / fps;
      await new Promise(r => v.addEventListener('seeked', r, {once: true}));
      const presented = v.currentTime;
      const shot = document.createElement('canvas'); shot.width = v.videoWidth; shot.height = v.videoHeight;
      shot.getContext('2d').drawImage(v, 0, 0);
      const videoPixels = pixels(shot);
      const exportPng = exported.canvas.toDataURL('image/png');
      out.push({target, frameIndex, time, liveFrames, presentedMediaTime: presented,
                exportVsLive: compare(exportedPixels, livePixels),
                statsEqual: JSON.stringify(exportedStats) === JSON.stringify(liveStats),
                exportedStats: {mark: exportedStats.mark, sectionNames: exportedStats.sectionNames, labels: (exportedStats.labels || []).map(l => l.shown).join(','), fx: exportedStats.fx && exportedStats.fx.preset},
                videoVsExport: compare(videoPixels, exportedPixels),
                // Mean colour of an empty stretch of the header (x 40–60 %, y 9–15 %): a colour-matrix mismatch shows here.
                flatColour: (() => { const w = job.tier.width, h = job.tier.height, mean = p => { const s = [0, 0, 0]; let n = 0; for (let y = Math.round(h * 0.09); y < Math.round(h * 0.15); y++) for (let x = Math.round(w * 0.4); x < Math.round(w * 0.6); x++) { const i = (y * w + x) * 4; s[0] += p[i]; s[1] += p[i + 1]; s[2] += p[i + 2]; n++; } return s.map(v => +(v / n).toFixed(1)); }; return {drawn: mean(exportedPixels), video: mean(videoPixels)}; })(),
                png: shot.toDataURL('image/png'), exportPng});
    }
    return out;
  `, {job, moments});
  const base = path.basename(videoFile, '.mp4');
  for (const [i, frame] of report.frames.entries()) {
    const file = path.join(outDir, `${base} frame${i + 1} ${frame.time.toFixed(2)}s.png`);
    fs.writeFileSync(file, Buffer.from(frame.png.split(',')[1], 'base64'));
    fs.writeFileSync(path.join(outDir, `${base} frame${i + 1} ${frame.time.toFixed(2)}s drawn.png`), Buffer.from(frame.exportPng.split(',')[1], 'base64'));
    frame.png = file;
    delete frame.exportPng;
  }

  step('moments');
  // --- sound against picture ---
  report.audio = await page(`
    const rate = 44100;
    const decode = async file => { const b = readBytes(file); return new OfflineAudioContext(2, 1, rate).decodeAudioData(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
    const song = await decode(arg.song), video = await decode(arg.video);
    const mono = b => { const l = b.getChannelData(0), r = b.numberOfChannels > 1 ? b.getChannelData(1) : l, m = new Float32Array(b.length); for (let i = 0; i < b.length; i++) m[i] = (l[i] + r[i]) / 2; return m; };
    const a = mono(song), b = mono(video);
    // Sample-level lag by cross-correlation in 3 s windows, searched within ±100 ms.
    const lagAt = (centre) => {
      const n = Math.floor(rate * 3), start = Math.floor(centre * rate) - (n >> 1), range = Math.floor(rate * 0.1);
      let best = 0, bestScore = -Infinity;
      for (let lag = -range; lag <= range; lag++) {
        let s = 0;
        for (let i = 0; i < n; i += 2) { const x = a[start + i], y = b[start + i + lag]; if (x !== undefined && y !== undefined) s += x * y; }
        if (s > bestScore) { bestScore = s; best = lag; }
      }
      return best;
    };
    const centres = arg.centres;
    const lags = centres.map(c => { const lag = lagAt(c); return {at: c, lagSamples: lag, lagMs: +(lag / rate * 1000).toFixed(3)}; });
    // Onsets: the first sample after a known drum hit where the short-time energy jumps,
    // found the same way in both signals.
    const onset = (sig, t) => {
      const hop = 64, win = 256, from = Math.floor((t - 0.08) * rate), to = Math.floor((t + 0.08) * rate);
      let prev = 0, bestJump = 0, at = null;
      for (let i = from; i < to; i += hop) { let e = 0; for (let j = 0; j < win; j++) { const x = sig[i + j] || 0; e += x * x; } const jump = e - prev; if (jump > bestJump) { bestJump = jump; at = i; } prev = e; }
      return at === null ? null : at / rate;
    };
    const onsets = arg.hits.map(t => { const s = onset(a, t), v = onset(b, t); return {model: t, song: s, video: v, videoMinusSongMs: s !== null && v !== null ? +((v - s) * 1000).toFixed(2) : null}; });
    return {songSeconds: song.length / rate, videoAudioSeconds: video.length / rate, lags, onsets};
  `, {song: audioPath, video: videoFile, centres: [duration * 0.15, duration * 0.5, duration * 0.85], hits: strongHits(model, 6)});

  // Summary lines.
  const [vt, at] = report.reader.tracks;
  report.summary = {
    codecs: `${vt.codec} ${vt.width}x${vt.height} / ${at.codec} ${at.sampleRate} Hz ${at.channels} ch`,
    fps: vt.timescale / vt.deltas[0],
    frames: vt.samples, decodedFrames: report.decode.decoded,
    videoSeconds: vt.sttsDuration / vt.timescale, audioSeconds: (at.edit ? at.edit.segmentDuration / 1000 : at.sttsDuration / at.timescale),
    elementDuration: report.element.duration, modelDuration: duration, songSeconds: report.audio.songSeconds,
    framesExpected: report.audio.songSeconds * exporter.FPS,
    bytes: report.reader.bytes, mbPerMinute: +(report.reader.bytes / 1048576 / (report.element.duration / 60)).toFixed(3),
    videoKbps: +(vt.bytes * 8 / (vt.sttsDuration / vt.timescale) / 1000).toFixed(1), audioKbps: +(at.bytes * 8 / (at.sttsDuration / at.timescale) / 1000).toFixed(1),
    keyFrames: vt.syncSamples ? vt.syncSamples.length : null
  };
  fs.writeFileSync(path.join(outDir, `${base}.verify.json`), JSON.stringify(report, null, 1));
  console.log(JSON.stringify({summary: report.summary, mediaFoundation: report.mediaFoundation, decode: report.decode, element: report.element,
    frames: report.frames.map(f => ({time: f.time, presented: f.presentedMediaTime, flat: f.flatColour, liveFrames: f.liveFrames, exportVsLive: f.exportVsLive, statsEqual: f.statsEqual, videoVsExport: f.videoVsExport, stats: f.exportedStats})),
    audio: report.audio}, null, 1));
}

// The loudest isolated drum hits (kick or snare), as times.
function strongHits(model, count) {
  const drums = model.lanes.find(lane => lane.kind === 'drums');
  if (!drums) return [];
  const times = drums.hits.map(hit => hit[0]);
  const isolated = drums.hits.filter(hit => (hit[1] === 0 || hit[1] === 1) && !times.some(t => t !== hit[0] && Math.abs(t - hit[0]) < 0.25));
  return isolated.sort((a, b) => b[2] - a[2]).slice(0, count).map(hit => hit[0]).sort((a, b) => a - b);
}

// Sample bytes of the video track, in decode order, from the file's own tables.
function sampleBytes(buffer, boxes) {
  const top = boxes(buffer, 0, buffer.length);
  const moov = top.find(b => b.type === 'moov');
  const trak = moov.children.filter(t => t.type === 'trak').find(t => {
    const hdlr = t.children.find(c => c.type === 'mdia').children.find(c => c.type === 'hdlr');
    return buffer.toString('latin1', hdlr.body + 8, hdlr.body + 12) === 'vide';
  });
  const stbl = trak.children.find(c => c.type === 'mdia').children.find(c => c.type === 'minf').children.find(c => c.type === 'stbl');
  const get = type => stbl.children.find(c => c.type === type);
  const u32 = at => buffer.readUInt32BE(at);
  const stsz = get('stsz'), n = u32(stsz.body + 8), sizes = Array.from({length: n}, (_, i) => u32(stsz.body + 12 + i * 4));
  const stco = get('stco'), offsets = Array.from({length: u32(stco.body + 4)}, (_, i) => u32(stco.body + 8 + i * 4));
  const stsc = get('stsc'), rows = Array.from({length: u32(stsc.body + 4)}, (_, i) => [u32(stsc.body + 8 + i * 12), u32(stsc.body + 12 + i * 12)]);
  const stss = get('stss'), keys = new Set(Array.from({length: u32(stss.body + 4)}, (_, i) => u32(stss.body + 8 + i * 4) - 1));
  const avc1 = get('stsd').children[0], avcC = avc1.children.find(c => c.type === 'avcC');
  const out = [];
  let s = 0;
  offsets.forEach((offset, c) => {
    let per = 0;
    for (const [first, count] of rows) if (first - 1 <= c) per = count;
    let at = offset;
    for (let i = 0; i < per && s < n; i++, s++) { out.push([keys.has(s) ? 1 : 0, at, sizes[s]]); at += sizes[s]; }
  });
  const description = buffer.subarray(avcC.body, avcC.end);
  return {video: out, description, codec: `avc1.${[1, 2, 3].map(i => description[i].toString(16).padStart(2, '0')).join('')}`};
}

main().then(() => app.exit(0), error => { console.error(String(error && error.stack || error)); app.exit(1); });
