'use strict';
// How an export ends when it cannot finish: nothing left behind, one plain sentence.
//
//   electron source/scoreview/export/tests/export-failures.cjs <model.json> <scratch folder>
//
// Uses a short generated WAV as the song's audio so each case is quick. Cases: no analysis,
// a forbidden folder, a missing folder, missing audio, cancel mid-way, a full disk (the file
// handle's write is made to fail with ENOSPC), the export window dying mid-way, and one
// normal short export as the control. After each case the scratch folder must hold no
// video and no ".part" file. Prints JSON lines; exit code 1 when any case is wrong.
const fs = require('node:fs');
const path = require('node:path');
const {app, BrowserWindow, webContents} = require('electron');
const exporter = require('../export-main.cjs');

const [modelFile, scratch] = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
app.commandLine.appendSwitch('mute-audio');
// Each export window closes when its case ends; that must not end this run (XML keeps its own window).
app.on('window-all-closed', () => {});

function wav(file, seconds, rate = 44100) {
  const n = Math.round(seconds * rate), data = Buffer.alloc(44 + n * 4);
  data.write('RIFF', 0); data.writeUInt32LE(36 + n * 4, 4); data.write('WAVE', 8); data.write('fmt ', 12);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22); data.writeUInt32LE(rate, 24);
  data.writeUInt32LE(rate * 4, 28); data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { const v = Math.round(Math.sin(i / 20) * 8000 * (i % rate < 2000 ? 1 : 0.1)); data.writeInt16LE(v, 44 + i * 4); data.writeInt16LE(v, 46 + i * 4); }
  fs.writeFileSync(file, data);
}

const leftovers = folder => fs.readdirSync(folder).filter(name => /\.mp4($|\.part)/.test(name));

app.whenReady().then(async () => {
  fs.mkdirSync(scratch, {recursive: true});
  for (const name of leftovers(scratch)) fs.rmSync(path.join(scratch, name));
  const model = JSON.parse(fs.readFileSync(modelFile, 'utf8'));
  const shortAudio = path.join(scratch, 'short.wav'), longAudio = path.join(scratch, 'long.wav');
  wav(shortAudio, 4);
  wav(longAudio, 60);
  const outFile = path.join(scratch, 'case.mp4');
  const forbiddenRoot = path.join(scratch, 'analysis-root');
  fs.mkdirSync(forbiddenRoot, {recursive: true});
  const results = [];
  let wrong = 0;
  const check = async (name, request, expect, during) => {
    const started = Date.now();
    const pending = exporter.exportVideo({model, tier: '720p', outFile, lang: 'zh', forbidden: [forbiddenRoot], ...request});
    if (during) await during();
    const result = await pending;
    const left = leftovers(scratch).concat(fs.existsSync(forbiddenRoot) ? leftovers(forbiddenRoot) : []);
    const ok = expect === 'ok' ? (result.ok && left.length === 1 && left[0] === 'case.mp4') : (!result.ok && result.error === expect && left.length === 0);
    if (!ok) wrong++;
    const line = {case: name, pass: ok, error: result.error || null, message: result.message || null, left, seconds: (Date.now() - started) / 1000,
                  bytes: result.ok ? result.summary.bytes : undefined};
    results.push(line);
    console.log(JSON.stringify(line));
    for (const file of left) fs.rmSync(path.join(scratch, file), {force: true});
  };

  await check('control: a short normal export', {audioPath: shortAudio}, 'ok');
  await check('no analysis (no lanes)', {model: {...model, lanes: []}, audioPath: shortAudio}, 'no-model');
  await check('into the analysis root', {audioPath: shortAudio, outFile: path.join(forbiddenRoot, 'x.mp4')}, 'forbidden-folder');
  await check('folder does not exist', {audioPath: shortAudio, outFile: path.join(scratch, 'nope', 'x.mp4')}, 'folder-missing');
  await check('audio file missing', {audioPath: path.join(scratch, 'missing.mp3')}, 'audio-missing');
  {
    const control = new AbortController();
    await check('cancel after 2 s', {audioPath: longAudio, signal: control.signal}, 'cancelled', async () => { await new Promise(r => setTimeout(r, 2000)); control.abort(); });
  }
  {
    // A cancel that lands while the file is being opened (the last moment, when the bytes are about to be
    // written): the clean-up has run before the file exists, so the late-opened file must remove itself.
    const open = fs.promises.open;
    const control = new AbortController();
    fs.promises.open = async (...args) => { control.abort(); await new Promise(r => setTimeout(r, 400)); return open(...args); };
    const started = Date.now();
    let result;
    try { result = await exporter.exportVideo({model, tier: '720p', outFile, lang: 'zh', forbidden: [forbiddenRoot], audioPath: shortAudio, signal: control.signal}); }
    finally { fs.promises.open = open; }
    await new Promise(r => setTimeout(r, 1200));
    const left = leftovers(scratch);
    const ok = !result.ok && result.error === 'cancelled' && left.length === 0;
    if (!ok) wrong++;
    const line = {case: 'cancel while the file is being opened', pass: ok, error: result.error || null, message: result.message || null, left, seconds: (Date.now() - started) / 1000};
    results.push(line);
    console.log(JSON.stringify(line));
    for (const file of left) fs.rmSync(path.join(scratch, file), {force: true});
  }
  {
    // A full disk: the second write of the file fails as Windows reports it.
    const open = fs.promises.open;
    fs.promises.open = async (...args) => {
      const handle = await open(...args);
      let writes = 0;
      const write = handle.write.bind(handle);
      handle.write = async (...more) => { if (++writes >= 1) { const error = new Error('ENOSPC: no space left on device, write'); error.code = 'ENOSPC'; throw error; } return write(...more); };
      return handle;
    };
    try { await check('disk full while writing', {audioPath: shortAudio}, 'disk-full'); } finally { fs.promises.open = open; }
  }
  await check('export window dies mid-way', {audioPath: longAudio}, 'window-gone', async () => {
    await new Promise(r => setTimeout(r, 2500));
    const target = BrowserWindow.getAllWindows().map(w => w.webContents).find(c => /export-page\.html/.test(c.getURL()));
    if (target) target.forcefullyCrashRenderer();
  });
  fs.writeFileSync(path.join(scratch, 'failures.json'), JSON.stringify(results, null, 1));
  console.log(JSON.stringify({cases: results.length, wrong}));
  app.exit(wrong ? 1 : 0);
});
