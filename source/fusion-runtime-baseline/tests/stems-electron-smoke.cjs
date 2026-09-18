const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const assert = require('assert/strict');
const { createService } = require('../desktop/xld-analysis-service.cjs');
const fixtureFile = process.env.STEM_SMOKE_INPUT;
if (!fixtureFile) throw new Error('Set STEM_SMOKE_INPUT to preview-result.json');
const preview = JSON.parse(fs.readFileSync(fixtureFile, 'utf8')).result;
const resultRoot = path.resolve(preview.directory, '../../..');
const track = { id: preview.trackId, filePath: preview.source.path, title: 'LAST WALTZ', artist: "world's end girlfriend", album: 'LAST WALTZ', number: 1,
  bridgePath: path.resolve(preview.directory, '../../music-lab.json'), hasStructure: true, hasHarmony: false };
const service = createService({ xldRoot: 'D:/Program Files/xin-local-deck-beta', stableXldRoot: 'D:/Program Files/xin-local-deck', analysisRoot: resultRoot });
const duration = preview.stems[0].frames / 44100;
const manifest = { schemaVersion: 2, contract: 'xld.music-lab/2', track: { ...track, source: track.filePath }, timing: { unit: 'seconds', origin: 0, duration },
  analyses: [{ engine: { id: 'songformer', name: 'Timeline fixture' }, duration, segments: [{ start: 0, end: duration, label: 'A' }] }], harmony: [], manualTags: [] };
const errors = [];
let reveals = 0;
let midiReveals = 0;
app.setPath('userData', path.resolve(process.env.STEM_SMOKE_OUTPUT, '../electron-profile'));
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-background-timer-throttling');
ipcMain.handle('app:locale-get', () => ({ ok: true, locale: 'zh-CN' }));
ipcMain.handle('app:locale-set', (_e,p) => ({ ok: true, locale: p.locale }));
ipcMain.handle('fusion:scan-library', () => ({ ok: true, tracks: [track], albums: [{ id: 'album', title: track.album, artist: track.artist, tracks: [track] }], root: path.dirname(track.filePath), trackCount: 1, albumCount: 1, analyzedCount: 1 }));
ipcMain.handle('fusion:load-track', () => ({ ok: true, manifest, sourcePath: track.filePath, audioUrl: pathToFileURL(track.filePath).href, identity: { trackId: track.id, sourcePath: track.filePath } }));
ipcMain.handle('fusion:analysis-engines', () => [{ id: 'songformer', name: 'SongFormer', family: 'ai', available: true }]);
ipcMain.handle('fusion:analysis-task', () => service.task());
ipcMain.handle('fusion:analysis-cancel', () => service.cancel());
ipcMain.handle('fusion:stems-read', () => service.readStems(track));
ipcMain.handle('fusion:midi-read', (_event, payload) => service.readMidi(track, payload.stem));
ipcMain.handle('fusion:midi-reveal', async (_event, payload) => { assert((await service.readMidi(track, payload.stem)).ok); midiReveals++; return { ok: true }; });
ipcMain.handle('fusion:midi-run', async (event, payload) => service.run(track, 'basic-pitch', { stem: payload.stem, force: payload.force }, task => event.sender.send('fusion:analysis-task', task)));
ipcMain.handle('fusion:stems-reveal', async () => { assert((await service.readStems(track)).ok); reveals++; return { ok: true }; });
ipcMain.handle('fusion:stems-run', async (event,payload) => service.run(track, 'demucs-6s', { force: payload.force }, task => event.sender.send('fusion:analysis-task', task)));
ipcMain.handle('fusion:preset-repository-list', () => ({ ok: true, repository: { categories: { builtIn: [], user: [], recovered: [] }, warnings: [] } }));
ipcMain.handle('fusion:shadow-telemetry', () => JSON.stringify({ available: false }));
ipcMain.handle('fusion:settings', () => ({}));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 950, show: false, webPreferences: { offscreen: true, backgroundThrottling: false, contextIsolation: true, sandbox: true, preload: path.resolve(__dirname, '../desktop/preload.cjs') } });
  win.webContents.setAudioMuted(true);
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 3) errors.push(message); });
  const evaluate = code => win.webContents.executeJavaScript(code);
  async function until(code) {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) { if (await evaluate(code)) return; await new Promise(r => setTimeout(r, 100)); }
    throw new Error('Timed out: ' + code);
  }
  try {
    await win.loadFile(path.resolve(__dirname, '../index.html'));
    await until("document.querySelector('#fusionStemSelect').options.length === 7");
    assert.equal(await evaluate("document.querySelector('#fusionMidiRun').disabled"), true);
    assert.equal(await evaluate("document.querySelector('#fusionStemRun').textContent"), '重新分轨');
    await evaluate("document.querySelector('#welcome')?.remove(); document.querySelector('#fusionPanel').classList.add('is-open'); document.querySelector('#fusionAudio').currentTime=35;");
    await until("Math.abs(document.querySelector('#fusionAudio').currentTime-35)<0.1");
    await evaluate("document.querySelector('#fusionStemSelect').value='bass'; document.querySelector('#fusionStemSelect').dispatchEvent(new Event('change'));");
    await until("!document.querySelector('#fusionStemSelect').disabled && document.querySelector('#fusionAudio').src.endsWith('bass.wav') && Math.abs(document.querySelector('#fusionAudio').currentTime-35)<0.1");
    await evaluate("document.querySelector('#fusionPlay').click()");
    await until("!document.querySelector('#fusionAudio').paused && document.querySelector('#fusionAudio').currentTime>35.1");
    if (process.env.MIDI_SMOKE === '1') {
      await until("!document.querySelector('#fusionMidiRun').disabled && document.querySelector('#fusionMidiStatus').textContent.includes('已就绪')");
      await evaluate("document.querySelector('#fusionMidiRun').click()");
      await until("document.querySelector('#fusionAnalysisCard').dataset.state === 'complete' && !document.querySelector('#fusionMidiRun').disabled && !document.querySelector('#fusionMidiReveal').disabled");
      assert.match(await evaluate("document.querySelector('#fusionAnalysisStatus').textContent"), /bass MIDI 转谱完成/);
      await evaluate("document.querySelector('#fusionMidiReveal').click()");
      await until("document.querySelector('#fusionMidiStatus').textContent.includes('已就绪')");
      await new Promise(resolve => setTimeout(resolve, 100));
      assert.equal(midiReveals, 1);
      await evaluate("document.querySelector('#fusionStemSelect').value='drums'; document.querySelector('#fusionStemSelect').dispatchEvent(new Event('change'));");
      await until("!document.querySelector('#fusionStemSelect').disabled");
      assert.equal(await evaluate("document.querySelector('#fusionMidiRun').disabled"), true);
    }
    await evaluate("document.querySelector('#fusionPlay').click(); document.querySelector('#fusionStemSelect').value='original'; document.querySelector('#fusionStemSelect').dispatchEvent(new Event('change'));");
    await until("!document.querySelector('#fusionStemSelect').disabled && document.querySelector('#fusionAudio').src.endsWith('.flac')");
    await evaluate("document.querySelector('#fusionStemReveal').click()");
    for (let attempt = 0; attempt < 100 && reveals < 1; attempt++) await new Promise(r => setTimeout(r, 25));
    assert.equal(reveals, 1);
    if (process.env.STEM_SMOKE_RERUN === '1') {
      await evaluate("document.querySelector('#fusionStemRun').click()");
      await until("document.querySelector('#fusionAnalysisCard').dataset.state === 'complete' && !document.querySelector('#fusionStemRun').disabled");
      const latest = await service.readStems(track);
      assert(latest.ok);
      const saved = JSON.parse(fs.readFileSync(fixtureFile, 'utf8'));
      saved.result = latest;
      fs.writeFileSync(fixtureFile, JSON.stringify(saved, null, 2));
    }
    const before = await evaluate("document.querySelector('#fusionTrack').textContent");
    await new Promise(resolve => { win.webContents.once('did-finish-load', resolve); win.webContents.reload(); });
    await until("document.querySelector('#fusionStemSelect').options.length === 7");
    assert.equal(await evaluate("document.querySelector('#fusionTrack').textContent"), before);
    if (process.env.MIDI_SMOKE === '1') {
      await evaluate("document.querySelector('#fusionStemSelect').value='bass'; document.querySelector('#fusionStemSelect').dispatchEvent(new Event('change'));");
      await until("!document.querySelector('#fusionMidiReveal').disabled && document.querySelector('#fusionMidiStatus').textContent.includes('已就绪')");
    }
    await evaluate("document.querySelector('#welcome')?.remove(); document.querySelector('.stage').classList.remove('ui-hidden'); if(document.querySelector('#fusionPanel').getAttribute('aria-hidden') !== 'false') document.querySelector('#fusionButton').click(); document.querySelector('#fusionAnalysisCard').scrollIntoView({block:'center'});");
    await new Promise(r => setTimeout(r, 700));
    const layout = await evaluate("(() => { const n=document.querySelector('#fusionStemRun'); const p=document.querySelector('#fusionPanel'); const r=n.getBoundingClientRect(); return {visible:getComputedStyle(p).visibility,opacity:getComputedStyle(p).opacity,x:r.x,y:r.y,width:r.width,height:r.height,panelClasses:p.className,stageClasses:document.querySelector('.stage').className}; })()");
    console.log(JSON.stringify({ layout }));
    assert.equal(layout.visible, 'visible');
    assert(Number(layout.opacity) > 0.9);
    fs.writeFileSync(process.env.STEM_SMOKE_OUTPUT + '.png', (await win.webContents.capturePage()).toPNG());
    assert.deepEqual(errors, []);
    const report = { pass: true, rerunFromUi: process.env.STEM_SMOKE_RERUN === '1', checks: ['seven audio choices', 'Chinese labels', '35s position preserved', 'stem playback', 'return to original', 'output action', 'reload retains stems', 'track identity retained', 'no renderer errors'], layout, errors };
    fs.writeFileSync(process.env.STEM_SMOKE_OUTPUT + '.json', JSON.stringify(report, null, 2));
    if (process.env.MIDI_SMOKE === '1') {
      report.midi = { pass: true, midiReveals, checks: ['original and drums unavailable', 'bass conversion through UI', 'named task completion', 'open MIDI folder', 'MIDI retained after reload'] };
      fs.writeFileSync(process.env.STEM_SMOKE_OUTPUT + '.json', JSON.stringify(report, null, 2));
    }
    console.log(JSON.stringify(report));
  } catch(error) { console.error(error); console.error(errors); process.exitCode = 1; }
  finally { win.destroy(); app.exit(process.exitCode || 0); }
});
