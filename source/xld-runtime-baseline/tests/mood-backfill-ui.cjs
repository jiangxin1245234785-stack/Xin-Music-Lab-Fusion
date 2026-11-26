'use strict';

// Run with Node. The Electron child has its own hidden window, cache, profiles and two tiny albums.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

async function child(temp) {
  const {app, BrowserWindow} = require('electron');
  assert.equal(path.dirname(fs.realpathSync(temp)), fs.realpathSync(os.tmpdir()));
  assert(path.basename(temp).startsWith('xld-backfill-ui-'));
  for (const key of ['appData','userData','sessionData','documents','music']) {
    const dir = path.join(temp, key);
    fs.mkdirSync(dir, {recursive:true});
    app.setPath(key, dir);
  }
  const analysisRoot = path.join(temp, 'Analysis'), libraryRoot = app.getPath('music');
  fs.writeFileSync(path.join(app.getPath('userData'), 'settings.json'), JSON.stringify({libraryRoot, analysisRoot}));
  const audio = require('./mood-backfill.cjs').tone();
  for (const name of ['A - First', 'B - Second']) {
    const dir = path.join(libraryRoot, name); fs.mkdirSync(dir); fs.writeFileSync(path.join(dir, '01 Shared.wav'), audio);
  }
  app.disableHardwareAcceleration();
  const errors = [];
  app.on('browser-window-created', (_event, win) => {
    win.webContents.setAudioMuted(true);
    win.webContents.on('console-message', event => { if (event.level === 'error' || event.level === 3) errors.push(event.message); });
  });
  require('../desktop/main.cjs');
  await app.whenReady();
  const sleep = () => new Promise(resolve => setTimeout(resolve, 30));
  const until = async (check, label) => {
    const end = Date.now() + 60000;
    while (Date.now() < end) { const result = await check(); if (result) return result; await sleep(); }
    throw Error('Timed out waiting for ' + label + ': ' + errors.join(' / '));
  };
  try {
    const win = await until(() => BrowserWindow.getAllWindows()[0], 'window');
    const evaluate = code => win.webContents.executeJavaScript(code);
    await until(() => evaluate('Boolean(window.__xldAppReady)'), 'XLD');
    const settings = await evaluate('window.XLD.getAnalysisSettings()');
    assert.deepEqual(settings, {libraryRoot,analysisRoot});
    assert.equal(await evaluate("document.getElementById('moodBackfill').open"), false);
    await evaluate("document.querySelector('.album-card').click(); document.querySelector('.track-row').click(); document.getElementById('workbenchResults').click(); document.querySelector('#moodBackfill summary').click(); window.xinXldLocale.setLocale('en-US'); window.batchHistory=[]; window.XLD.onMoodBackfill(s=>window.batchHistory.push(s)); true;");
    await until(() => evaluate("document.getElementById('moodBackfillAlbum').textContent.includes('First') && document.getElementById('moodBackfillAlbum').getClientRects().length && !document.getElementById('moodBackfillAlbum').disabled"), 'enabled album');
    const duplicate = await evaluate("document.getElementById('moodBackfillAlbum').click(); window.XLD.runMoodBackfill('library')");
    assert.equal(duplicate.error, 'analysis-busy');
    await until(() => evaluate("!document.getElementById('moodBackfillStop').hidden"), 'stop button');
    await evaluate("document.getElementById('moodBackfillStop').click()");
    await until(() => evaluate("window.batchHistory.some(s=>!s.running && s.cancelled)"), 'cancelled outcome');
    const stopText = await evaluate("document.getElementById('moodBackfillStatus').textContent");
    assert.match(stopText, /Stopped/);
    await evaluate("window.batchHistory=[];document.getElementById('moodBackfillAlbum').click()");
    const album = await until(() => evaluate("window.batchHistory.find(s=>!s.running)"), 'album result');
    assert.deepEqual([album.total,album.computed,album.current,album.failed],[1,1,0,0]);
    const albumText = await evaluate("document.getElementById('moodBackfillStatus').textContent");
    assert.match(albumText, /First.*Finished.*1 calculated/);
    await evaluate("window.xinXldLocale.setLocale('zh-CN'); window.batchHistory=[]; document.getElementById('moodBackfillLibrary').click()");
    const library = await until(() => evaluate("window.batchHistory.find(s=>!s.running)"), 'library result');
    assert.deepEqual([library.total,library.computed,library.current,library.failed],[1,0,1,0]);
    const libraryText = await evaluate("document.getElementById('moodBackfillStatus').textContent");
    assert.match(libraryText, /整个已分析曲库.*已完成.*已有 1/);
    assert.equal(win.isVisible(), false); assert.equal(win.webContents.isAudioMuted(), true);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(temp, 'receipt.json'), JSON.stringify({stopText,albumText,libraryText,rendererErrors:errors}));
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
}
function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'xld-backfill-ui-'));
  try {
    const executable = process.env.XLD_ELECTRON || 'D:\\Program Files\\smoke-resonance\\node_modules\\electron\\dist\\electron.exe';
    const python = process.env.XLD_MIDI_PYTHON || path.resolve(__dirname,'../../../runtime/0.5.0/envs/basic/python.exe');
    assert(fs.existsSync(executable)); assert(fs.existsSync(python));
    const data = path.join(temp, 'appData'); fs.mkdirSync(data);
    const {status, stderr, error} = require('node:child_process').spawnSync(executable, ['--mute-audio','--disable-gpu','--no-sandbox',
      '--disable-breakpad','--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND','--enable-logging=stderr','--user-data-dir='+path.join(temp,'userData'),__filename],
      {windowsHide:true, encoding:'utf8', timeout:180000, env:{...process.env, APPDATA:data, LOCALAPPDATA:data, XLD_TEST:'1', XLD_SINGLE_INSTANCE_TEST:'0', XLD_MIDI_PYTHON:python, XLD_BACKFILL_TEST_ROOT:temp,
        XLD_RUNTIME_ROOT:'', XLD_AI_PYTHON:'', XLD_HARMONY_PYTHON:'', XLD_CHORDS_PYTHON:'', PYTHONDONTWRITEBYTECODE:'1'}});
    if (error) throw error;
    assert.equal(status, 0, stderr);
    console.log('Mood backfill Electron UI PASS', fs.readFileSync(path.join(temp,'receipt.json'),'utf8'));
  } finally {
    assert.equal(path.dirname(fs.realpathSync(temp)), fs.realpathSync(os.tmpdir()));
    assert(path.basename(temp).startsWith('xld-backfill-ui-'));
    fs.rmSync(temp, {recursive:true,force:true,maxRetries:3,retryDelay:100});
  }
}
if (process.versions.electron) child(process.env.XLD_BACKFILL_TEST_ROOT).catch(error => { console.error(error); require('electron').app.exit(1); });
else main();
