'use strict';
// Audit fix 1 (2026-11-15): XML starts only the score's own steps (score layers, vocal curve); separating,
// transcribing, sections and chords belong to XLD, which shows them, and a re-run there deletes the earlier
// stems or MIDI. desktop/main.cjs is loaded for real under a stand-in Electron (no window), with settings in a
// scratch folder, and its IPC handlers are called directly:
//   - the separation, transcription and engine-list channels are not registered at all;
//   - the analysis channel refuses any other engine before it looks at the track;
//   - the score layers and the vocal curve pass that gate (they go on to the track lookup).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const root = path.join(__dirname, '..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'xml-analysis-entry-'));

(async () => {
  const dirs = {appData: path.join(scratch, 'appData'), userData: path.join(scratch, 'userData'), documents: path.join(scratch, 'Documents'),
    home: scratch, videos: path.join(scratch, 'Videos'), downloads: path.join(scratch, 'Downloads'), music: scratch, temp: os.tmpdir(), exe: process.execPath};
  for (const dir of Object.values(dirs)) if (dir !== process.execPath) fs.mkdirSync(dir, {recursive: true});
  fs.mkdirSync(path.join(dirs.appData, "Xin's Local Deck Beta"), {recursive: true});
  fs.writeFileSync(path.join(dirs.appData, "Xin's Local Deck Beta", 'settings.json'),
    JSON.stringify({libraryRoot: path.join(scratch, 'library'), analysisRoot: path.join(scratch, 'analysis')}));
  const handlers = new Map();
  const nothing = () => {};
  const stub = new Proxy(function () {}, {get: (_t, key) => key === 'then' ? undefined : stub, apply: () => stub, construct: () => stub});
  class Window { constructor() { return stub; } static getAllWindows() { return []; } static fromWebContents() { return null; } }
  const electron = {
    app: {
      requestSingleInstanceLock: () => true, setName: nothing, getName: () => 'test', quit: nothing, exit: nothing, on: nothing, once: nothing,
      whenReady: () => Promise.resolve(), isReady: () => true, getPath: name => dirs[name] || scratch, getVersion: () => '0.0.0', isPackaged: false,
      getLocale: () => 'zh-CN', getPreferredSystemLanguages: () => ['zh-CN'], getSystemLocale: () => 'zh-CN', commandLine: {appendSwitch: nothing},
      setAppUserModelId: nothing, focus: nothing
    },
    BrowserWindow: Window, Menu: {setApplicationMenu: nothing, buildFromTemplate: () => stub}, nativeTheme: stub, screen: stub, protocol: stub, net: stub,
    dialog: {showSaveDialog: async () => ({canceled: true}), showOpenDialog: async () => ({canceled: true}), showMessageBox: async () => ({response: 0})},
    ipcMain: {handle: (channel, fn) => handlers.set(channel, fn), on: nothing, removeHandler: nothing, once: nothing},
    session: {defaultSession: stub}, shell: {openPath: async () => '', showItemInFolder: nothing, openExternal: async () => {}}
  };
  // Nothing may actually run: the analysis service is replaced by one that records and refuses.
  const serviceFile = path.join(root, 'desktop', 'xld-analysis-service.cjs');
  const started = [];
  const realLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') return electron;
    const resolved = (() => { try { return Module._resolveFilename(request, parent, isMain); } catch (_) { return null; } })();
    if (resolved === serviceFile) {
      const real = realLoad.apply(this, arguments);
      return {...real, createService: options => {
        const service = real.createService(options);
        return new Proxy(service, {get: (target, key) => key === 'run'
          ? async (track, engine) => { started.push(engine); return {ok: false, error: 'test-refuses-to-run'}; }
          : (typeof target[key] === 'function' ? target[key].bind(target) : target[key])});
      }};
    }
    return realLoad.apply(this, arguments);
  };
  try {
    require(path.join(root, 'desktop', 'main.cjs'));
    for (let i = 0; i < 300 && !handlers.has('fusion:analysis-run'); i++) await new Promise(resolve => setTimeout(resolve, 10));
  } finally {
    Module._load = realLoad;
  }
  assert.ok(handlers.has('fusion:analysis-run'), 'the analysis channel for the score is registered');
  assert.ok(handlers.has('fusion:stems-read') && handlers.has('fusion:midi-read') && handlers.has('fusion:analysis-cancel') && handlers.has('fusion:analysis-task'),
    'reading stems and MIDI, and following or cancelling a task, stay');
  for (const channel of ['fusion:stems-run', 'fusion:midi-run', 'fusion:analysis-engines'])
    assert.ok(!handlers.has(channel), `${channel} must not be registered in XML`);

  const sender = {isDestroyed: () => false, send: () => {}};
  const ask = engine => handlers.get('fusion:analysis-run')({sender}, {trackId: 'no-such-track', engine});
  for (const engine of ['demucs-6s', 'bs-roformer-sw', 'basic-pitch', 'muscriptor-large', 'songformer', 'chordmini', '', undefined])
    assert.deepEqual(await ask(engine), {ok: false, error: 'engine-not-in-xml'}, `XML refuses ${engine}`);
  for (const engine of ['score-layers', 'score-vocals']) {
    const answer = await ask(engine);
    assert.notEqual(answer?.error, 'engine-not-in-xml', `${engine} passes the gate`);
    assert.equal(answer?.error, 'track-missing', `${engine} goes on to the track lookup`);
  }
  assert.deepEqual(started, [], 'nothing was started');
  console.log('xml-analysis-entry: ok (no separation / transcription / engine-list IPC; only score-layers and score-vocals pass the analysis gate)');
})().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => { try { fs.rmSync(scratch, {recursive: true, force: true}); } catch (_) {} setTimeout(() => process.exit(process.exitCode || 0), 50); });
