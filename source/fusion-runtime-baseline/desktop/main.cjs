'use strict';

const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { app, BrowserWindow, desktopCapturer, dialog, ipcMain, session, shell } = require('electron');
const { readAudioTags, parseTrackNumber } = require('./audio-tags.cjs');
const { createService: createXldAnalysisService } = require('./xld-analysis-service.cjs');
const {readLatestTrack} = require('./refresh-track.cjs');
const {writeRequest} = require('../../xld-runtime-baseline/core/open-request.cjs');
const xldTimelineProvider = require('../xld-timeline-provider-adapter.js');
const { createRepository: createGlitchPresetRepository } =
  require('./glitch-preset-repository.cjs');
const { createMainLocaleController, normalizeLocale } = require('./locale.cjs');
const { applyGeneratorHostLocale } = require('./generator-locale.cjs');

const execFileAsync = promisify(execFile);
const mediaKeyCodes = Object.freeze({ previous: 0xB1, 'play-pause': 0xB3, next: 0xB0 });
const gotSingleInstanceLock = app.requestSingleInstanceLock();
const {defaultUserPaths} = require('../../shared-analysis/user-paths.cjs');
const DEFAULT_LIBRARY_ROOT = defaultUserPaths(app).libraryRoot;
const DEFAULT_ANALYSIS_ROOT = defaultUserPaths(app).analysisRoot;
let fusionLibraryRoot = DEFAULT_LIBRARY_ROOT;
let fusionAnalysisRoot = DEFAULT_ANALYSIS_ROOT;
const AUDIO_EXTENSIONS = new Set(['.flac', '.wav', '.mp3', '.m4a', '.aac', '.ogg', '.opus']);
const COVER_NAMES = ['cover.jpg', 'cover.jpeg', 'cover.png', 'folder.jpg', 'folder.png', 'front.jpg', 'front.png'];
const MAX_GLITCH_PRESET_JSON_BYTES = 4 * 1024 * 1024;
const ADVANCED_GENERATOR_VERSION = '6.6.1-integration-v.3';
const fusionTrackIndex = new Map();
const mainLocale = createMainLocaleController();

app.setName("Xin's Music Lab Fusion");
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

if (!gotSingleInstanceLock) app.quit();

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 620,
    backgroundColor: '#05070f',
    title: "Xin's Music Lab Fusion · Designed by Xin",
    icon: path.join(__dirname, '..', 'assets', 'xins-music-lab-icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      offscreen: process.env.XML_TEST === '1',
      backgroundThrottling: process.env.XML_TEST !== '1',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  const reveal = () => {
    if(process.env.XML_TEST === '1')return;
    if (!win.isDestroyed() && !win.isVisible()) win.show();
  };
  win.once('ready-to-show', reveal);
  win.webContents.once('did-finish-load', reveal);
  const revealFallback = setTimeout(reveal, 3500);
  win.once('closed', () => clearTimeout(revealFallback));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });
  win.loadFile(path.join(__dirname, '..', 'index.html')).catch(error => {
    console.error('Failed to load the application shell:', error);
    if (!win.isDestroyed()) win.close();
  });
  return win;
}

if (gotSingleInstanceLock) app.whenReady().then(async () => {
  const xldSettingsPath = path.join(app.getPath('appData'), "Xin's Local Deck Beta", 'settings.json');
  const refreshXldSettings = async () => {
    try {
      const settings = JSON.parse(await fs.readFile(xldSettingsPath, 'utf8'));
      if (typeof settings.libraryRoot === 'string' && path.isAbsolute(settings.libraryRoot)) {
        fusionLibraryRoot = path.resolve(settings.libraryRoot);
      }
      if (typeof settings.analysisRoot === 'string' && path.isAbsolute(settings.analysisRoot)) {
        fusionAnalysisRoot = path.resolve(settings.analysisRoot);
      }
    } catch (_) {}
    return { libraryRoot: fusionLibraryRoot, analysisRoot: fusionAnalysisRoot, settingsPath: xldSettingsPath };
  };
  await refreshXldSettings();

  const firstExistingRoot = candidates => candidates.find(candidate => fsSync.existsSync(candidate)) || candidates[0];
  const xldRoot = firstExistingRoot([
    process.env.XLD_RUNTIME_ROOT,
    path.join(__dirname, '..', '..', 'xin-local-deck-beta'),
    'D:\\Program Files\\xin-local-deck-beta'
  ].filter(Boolean));
  const stableXldRoot = firstExistingRoot([
    process.env.XLD_STABLE_RUNTIME_ROOT,
    path.join(__dirname, '..', '..', 'xin-local-deck'),
    'D:\\Program Files\\xin-local-deck'
  ].filter(Boolean));
  const xldAnalysis = createXldAnalysisService({
    xldRoot,
    stableXldRoot,
    analysisRoot: fusionAnalysisRoot
  });
  const glitchPresetRepository = createGlitchPresetRepository({
    root: path.join(app.getPath('userData'), 'Glitch Presets')
  });
  // A damaged or temporarily unavailable preset directory must not prevent
  // the player and visual engine from starting. Repository IPC retries the
  // initialization and reports a clone-safe error to the renderer.
  await glitchPresetRepository.initialize().catch(() => null);
  const generatorEditorEntry = path.join(
    __dirname,
    '..',
    'tools',
    'glitch-generator',
    ADVANCED_GENERATOR_VERSION,
    'demo',
    'index.html'
  );
  let generatorEditorWindow = null;
  const syncGeneratorLocale = locale => {
    if (!generatorEditorWindow || generatorEditorWindow.isDestroyed()) {
      return Promise.resolve({ ok: false, error: 'generator-editor-not-open' });
    }
    return applyGeneratorHostLocale(generatorEditorWindow.webContents, locale);
  };
  const openGeneratorEditor = async (_event, payload = {}) => {
    const locale = normalizeLocale(payload?.locale) || mainLocale.getState().locale;
    if (generatorEditorWindow && !generatorEditorWindow.isDestroyed()) {
      const localeResult = await syncGeneratorLocale(locale);
      if (generatorEditorWindow.isMinimized()) generatorEditorWindow.restore();
      generatorEditorWindow.show();
      generatorEditorWindow.focus();
      return { ok: true, reused: true, version: ADVANCED_GENERATOR_VERSION, locale, localeResult };
    }
    if (!fsSync.existsSync(generatorEditorEntry)) {
      return {
        ok: false,
        error: 'generator-editor-not-packaged',
        version: ADVANCED_GENERATOR_VERSION
      };
    }
    const editor = new BrowserWindow({
      width: 1480,
      height: 940,
      minWidth: 980,
      minHeight: 680,
      backgroundColor: '#090a14',
      title: mainLocale.message('window.generator.title', { version: ADVANCED_GENERATOR_VERSION }),
      icon: path.join(__dirname, '..', 'assets', 'xins-music-lab-icon.png'),
      autoHideMenuBar: true,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true
      }
    });
    generatorEditorWindow = editor;
    editor.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    editor.once('ready-to-show', () => {
      if (!editor.isDestroyed()) editor.show();
    });
    editor.once('closed', () => {
      if (generatorEditorWindow === editor) generatorEditorWindow = null;
    });
    try {
      await editor.loadFile(generatorEditorEntry);
      const localeResult = await applyGeneratorHostLocale(editor.webContents, locale);
      if (!editor.isDestroyed()) editor.show();
      return { ok: true, reused: false, version: ADVANCED_GENERATOR_VERSION, locale, localeResult };
    } catch (error) {
      if (!editor.isDestroyed()) editor.close();
      return {
        ok: false,
        error: error?.message || 'generator-editor-load-failed',
        version: ADVANCED_GENERATOR_VERSION
      };
    }
  };
  const parseAlbumFolder = folderName => {
    const separator = folderName.indexOf(' - ');
    if (separator < 0) return { artist: 'Unknown Artist', album: folderName };
    return {
      artist: folderName.slice(0, separator).trim() || 'Unknown Artist',
      album: folderName.slice(separator + 3).trim() || folderName
    };
  };

  const parseTrackName = (filename, folderName, fallbackIndex) => {
    const stem = filename.slice(0, -path.extname(filename).length);
    let remainder = stem;
    if (remainder.toLowerCase().startsWith(`${folderName.toLowerCase()} - `)) remainder = remainder.slice(folderName.length + 3);
    const numbered = remainder.match(/^(\d{1,3})[\s._-]+(.+)$/);
    if (numbered) return { number: Number(numbered[1]), title: numbered[2].trim() };
    const embeddedNumber = remainder.match(/(?:^| - )(\d{1,3})[\s._-]+(.+)$/);
    if (embeddedNumber) return { number: Number(embeddedNumber[1]), title: embeddedNumber[2].trim() };
    return { number: fallbackIndex, title: remainder.trim() || stem };
  };

  const stableTrackId = (filePath, stat) => crypto
    .createHash('sha1')
    .update(`${filePath}\0${stat.size}\0${stat.mtimeMs}`)
    .digest('hex');

  // Loose singles in the library root carry context in the filename, e.g.
  // "Artist - Album - 03 Title". Used only when embedded tags are absent.
  const parseLooseFilename = stem => {
    const parts = stem.split(' - ').map(part => part.trim()).filter(Boolean);
    const splitNumber = text => {
      const match = String(text || '').match(/^(\d{1,3})[\s._-]+(.+)$/);
      return match ? { number: Number(match[1]), title: match[2].trim() } : { number: null, title: String(text || '').trim() };
    };
    if (parts.length >= 3) {
      const tail = splitNumber(parts.slice(2).join(' - '));
      return { artist: parts[0], album: parts[1], number: tail.number, title: tail.title || stem };
    }
    if (parts.length === 2) {
      const tail = splitNumber(parts[1]);
      return { artist: parts[0], album: null, number: tail.number, title: tail.title || parts[1] };
    }
    const tail = splitNumber(stem);
    return { artist: null, album: null, number: tail.number, title: tail.title || stem };
  };

  const findCover = async (folderPath, entries) => {
    const names = new Map(entries.filter(entry => entry.isFile()).map(entry => [entry.name.toLowerCase(), entry.name]));
    const name = COVER_NAMES.map(candidate => names.get(candidate)).find(Boolean);
    return name ? pathToFileURL(path.join(folderPath, name)).href : null;
  };

  const collectManifests = async root => {
    const manifests = new Map();
    const queue = [root];
    let visited = 0;
    while (queue.length && visited < 12000) {
      const directory = queue.shift();
      visited++;
      let entries;
      try { entries = await fs.readdir(directory, { withFileTypes: true }); } catch (_) { continue; }
      for (const entry of entries) {
        if (entry.name === '.tmp') continue;
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) queue.push(entryPath);
        else if (entry.isFile() && entry.name.toLowerCase() === 'music-lab.json') {
          try {
            const manifest = JSON.parse(await fs.readFile(entryPath, 'utf8'));
            const source = manifest?.track?.source;
            if (manifest?.contract === 'xld.music-lab/2' && Number(manifest?.schemaVersion) === 2 && typeof source === 'string') {
              manifests.set(path.resolve(source).toLowerCase(), { filePath: entryPath, manifest });
            }
          } catch (_) {}
        }
      }
    }
    return manifests;
  };

  const analysisRootCandidates = () => [
    fusionAnalysisRoot,
    path.join(app.getPath('documents'), "Xin's Local Deck Beta", 'Analysis'),
    path.join(app.getPath('documents'), "Xin's Local Deck", 'Analysis')
  ];
  const existingAnalysisRoots = () => {
    const seen = new Set();
    return analysisRootCandidates().filter(root => {
      const key = path.resolve(root).toLowerCase();
      if (seen.has(key) || !fsSync.existsSync(root)) return false;
      seen.add(key);
      return true;
    });
  };
  const primaryAnalysisRoot = () => existingAnalysisRoots()[0] || fusionAnalysisRoot;
  const collectAllManifests = async () => {
    const roots = existingAnalysisRoots();
    const merged = new Map();
    for (const root of (roots.length ? roots : [fusionAnalysisRoot])) {
      const found = await collectManifests(root);
      for (const [key, value] of found) if (!merged.has(key)) merged.set(key, value);
    }
    return merged;
  };

  const scanFusionLibrary = async () => {
    await refreshXldSettings();
    xldAnalysis.setAnalysisRoot(fusionAnalysisRoot);
    fusionTrackIndex.clear();
    let rootEntries;
    try {
      rootEntries = await fs.readdir(fusionLibraryRoot, { withFileTypes: true });
    } catch (error) {
      return { ok: false, error: error?.code === 'ENOENT' ? 'library-not-found' : 'library-unreadable', root: fusionLibraryRoot, albums: [], tracks: [] };
    }
    const folders = rootEntries
      .filter(entry => entry.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    const manifests = await collectAllManifests();
    const albums = [];
    const tracks = [];
    const linkOf = filePath => manifests.get(path.resolve(filePath).toLowerCase()) || null;
    const analysisFields = linked => {
      const analyses = Array.isArray(linked?.manifest?.analyses) ? linked.manifest.analyses : [];
      const harmony = Array.isArray(linked?.manifest?.harmony) ? linked.manifest.harmony : [];
      return {
        duration: Number(linked?.manifest?.timing?.duration) || 0,
        hasStructure: analyses.some(result => Array.isArray(result?.segments) && result.segments.length),
        hasHarmony: harmony.some(result => Array.isArray(result?.segments) && result.segments.length),
        structureEngines: analyses.map(result => String(result?.engine?.id || result?.engine || '')).filter(Boolean),
        harmonyEngines: harmony.map(result => String(result?.engine?.id || result?.engine || '')).filter(Boolean)
      };
    };
    const registerTrack = (track, filePath, linked) => {
      fusionTrackIndex.set(track.id, { ...track, filePath, bridgePath: linked?.filePath || '', manifest: linked?.manifest || null });
      tracks.push(track);
    };

    for (const folder of folders) {
      const folderPath = path.join(fusionLibraryRoot, folder.name);
      let entries;
      try { entries = await fs.readdir(folderPath, { withFileTypes: true }); } catch (_) { continue; }
      const audioFiles = entries
        .filter(entry => entry.isFile() && AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
      if (!audioFiles.length) continue;
      const albumInfo = parseAlbumFolder(folder.name);
      const coverUrl = await findCover(folderPath, entries);
      const albumTracks = [];
      for (let index = 0; index < audioFiles.length; index++) {
        const entry = audioFiles[index];
        const filePath = path.join(folderPath, entry.name);
        let stat;
        try { stat = await fs.stat(filePath); } catch (_) { continue; }
        const parsed = parseTrackName(entry.name, folder.name, index + 1);
        const tags = await readAudioTags(filePath);
        const linked = linkOf(filePath);
        const track = {
          id: stableTrackId(filePath, stat),
          pathArtist: albumInfo.artist, pathAlbum: albumInfo.album, pathNumber: parsed.number, pathTitle: parsed.title,
          number: (tags && parseTrackNumber(tags.TRACKNUMBER)) || parsed.number,
          title: (tags && tags.TITLE) || parsed.title,
          artist: (tags && (tags.ARTIST || tags.ALBUMARTIST)) || albumInfo.artist,
          album: albumInfo.album,
          extension: path.extname(entry.name).slice(1).toUpperCase(),
          bytes: stat.size,
          coverUrl,
          ...analysisFields(linked)
        };
        registerTrack(track, filePath, linked);
        albumTracks.push(track);
      }
      if (!albumTracks.length) continue;
      albumTracks.sort((a, b) => a.number - b.number || a.title.localeCompare(b.title));
      albums.push({
        id: crypto.createHash('sha1').update(folderPath).digest('hex'),
        folder: folder.name,
        artist: albumInfo.artist,
        title: albumInfo.album,
        coverUrl,
        trackCount: albumTracks.length,
        analyzedCount: albumTracks.filter(track => track.hasStructure || track.hasHarmony).length,
        tracks: albumTracks
      });
    }

    // Loose singles sitting directly in the library root.
    const looseAudio = rootEntries
      .filter(entry => entry.isFile() && AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    if (looseAudio.length) {
      const singles = [];
      for (let index = 0; index < looseAudio.length; index++) {
        const entry = looseAudio[index];
        const filePath = path.join(fusionLibraryRoot, entry.name);
        let stat;
        try { stat = await fs.stat(filePath); } catch (_) { continue; }
        const stem = entry.name.slice(0, -path.extname(entry.name).length);
        const tags = await readAudioTags(filePath);
        const fallback = parseLooseFilename(stem);
        const linked = linkOf(filePath);
        const track = {
          id: stableTrackId(filePath, stat),
          pathArtist: fallback.artist || 'Unknown Artist', pathAlbum: fallback.album || '单曲', pathNumber: fallback.number || 0, pathTitle: fallback.title || stem,
          number: (tags && parseTrackNumber(tags.TRACKNUMBER)) || fallback.number || index + 1,
          title: (tags && tags.TITLE) || fallback.title || stem,
          artist: (tags && (tags.ARTIST || tags.ALBUMARTIST)) || fallback.artist || 'Unknown Artist',
          album: (tags && tags.ALBUM) || fallback.album || '单曲',
          extension: path.extname(entry.name).slice(1).toUpperCase(),
          bytes: stat.size,
          coverUrl: null,
          ...analysisFields(linked)
        };
        registerTrack(track, filePath, linked);
        singles.push(track);
      }
      if (singles.length) {
        singles.sort((a, b) => a.artist.localeCompare(b.artist) || a.number - b.number || a.title.localeCompare(b.title));
        albums.push({
          id: crypto.createHash('sha1').update(`${fusionLibraryRoot}::loose-singles`).digest('hex'),
          folder: '',
          artist: 'Various Artists',
          title: '单曲 · Singles',
          coverUrl: null,
          trackCount: singles.length,
          analyzedCount: singles.filter(track => track.hasStructure || track.hasHarmony).length,
          tracks: singles
        });
      }
    }

    tracks.sort((a, b) => a.artist.localeCompare(b.artist) || a.album.localeCompare(b.album) || a.number - b.number || a.title.localeCompare(b.title));
    return {
      ok: true,
      root: fusionLibraryRoot,
      analysisRoot: primaryAnalysisRoot(),
      albumCount: albums.length,
      trackCount: tracks.length,
      analyzedCount: tracks.filter(track => track.hasStructure || track.hasHarmony).length,
      albums,
      tracks
    };
  };

  const loadFusionTrack = async trackId => {
    const indexed = fusionTrackIndex.get(String(trackId || ''));
    if (!indexed || !fsSync.existsSync(indexed.filePath)) return { ok: false, error: 'track-missing' };
    const latest=await readLatestTrack(indexed,existingAnalysisRoots(),xldTimelineProvider.validateManifest);
    if(!latest.ok)return latest;
    indexed.manifest=latest.manifest;indexed.bridgePath=latest.filePath;
    const manifest = indexed.manifest || {
      schemaVersion: 2,
      contract: 'xld.music-lab/2',
      producer: { name: "Xin's Music Lab Fusion", version: '0.2.0' },
      timing: { unit: 'seconds', origin: 0, duration: 0 },
      track: {
        id: indexed.id,
        number: indexed.number,
        title: indexed.title,
        artist: indexed.artist,
        album: indexed.album,
        source: indexed.filePath
      },
      analyses: [],
      harmony: [],
      manualTags: []
    };
    const validation = xldTimelineProvider.validateManifest(manifest, {
      trackId: indexed.id,
      sourcePath: indexed.filePath
    });
    if (!validation.ok) {
      return {
        ok: false,
        error: validation.error,
        path: validation.path,
        details: validation.details
      };
    }
    return {
      ok: true,
      filePath: indexed.bridgePath,
      sourcePath: indexed.filePath,
      audioUrl: pathToFileURL(indexed.filePath).href,
      coverUrl: indexed.coverUrl,
      identity: {
        trackId: indexed.id,
        sourcePath: indexed.filePath
      },
      manifest
    };
  };

  const readFusionBridge = async filePath => {
    if (!filePath || path.basename(filePath).toLowerCase() !== 'music-lab.json') {
      return { ok: false, error: 'invalid-file' };
    }
    try {
      const manifest = JSON.parse(await fs.readFile(filePath, 'utf8'));
      const validation = xldTimelineProvider.validateManifest(manifest);
      if (!validation.ok) {
        return {
          ok: false,
          error: validation.error,
          path: validation.path,
          details: validation.details
        };
      }
      const source = manifest?.track?.source;
      if (typeof source !== 'string' || !fsSync.existsSync(source)) {
        return { ok: false, error: 'audio-missing' };
      }
      return {
        ok: true,
        filePath,
        audioUrl: pathToFileURL(source).href,
        identity: {
          trackId: manifest.track.id,
          sourcePath: source
        },
        manifest
      };
    } catch (error) {
      return { ok: false, error: error?.code === 'ENOENT' ? 'missing-file' : 'read-failed' };
    }
  };

  ipcMain.handle('fusion:scan-library', scanFusionLibrary);
  ipcMain.handle('fusion:refresh-track', async (_event, trackId) => {
    const indexed=fusionTrackIndex.get(String(trackId || ''));
    if(!indexed || !fsSync.existsSync(indexed.filePath))return {ok:false,error:'track-missing'};
    if(xldAnalysis.task())return {ok:false,error:'analysis-busy'};
    await refreshXldSettings();xldAnalysis.setAnalysisRoot(fusionAnalysisRoot);
    return loadFusionTrack(trackId);
  });
  ipcMain.handle('fusion:load-track', (_event, trackId) => loadFusionTrack(trackId));
  ipcMain.handle('fusion:settings', refreshXldSettings);
  ipcMain.handle('fusion:analysis-engines', () => xldAnalysis.detectEngines());
  ipcMain.handle('fusion:analysis-task', () => xldAnalysis.task());
  ipcMain.handle('fusion:shadow-telemetry', async () => {
    // This stable scalar acknowledgement is deliberately evaluated before
    // collecting optional OS diagnostics. It keeps the renderer's gate from
    // ever waiting on a platform-specific metrics call.
    const neutral = {
      available: false,
      cpuPercent: null,
      memoryKb: null,
      processCount: 0,
      scope: 'unavailable'
    };
    try {
      // Electron's aggregate ProcessMetric wrappers can neither be cloned nor
      // reliably resolve across every desktop build.  Use the main-process
      // diagnostics API and transfer only a JSON scalar snapshot instead.
      const cpu = process.getCPUUsage?.() || {};
      const memoryPromise = typeof process.getProcessMemoryInfo === 'function'
        ? process.getProcessMemoryInfo()
        : Promise.resolve({});
      const memory = await Promise.race([
        memoryPromise,
        new Promise(resolve => setTimeout(() => resolve({}), 250))
      ]);
      return JSON.stringify({
        available: true,
        cpuPercent: Math.max(0, Number(cpu.percentCPUUsage) || 0),
        memoryKb: Math.max(0, Number(memory.private || memory.workingSetSize) || 0),
        processCount: 1,
        scope: 'main-process'
      });
    } catch (_) {
      return JSON.stringify(neutral);
    }
  });
  ipcMain.handle('fusion:analysis-cancel', () => xldAnalysis.cancel());
  ipcMain.handle('app:locale-get', () => ({ ok: true, ...mainLocale.getState() }));
  ipcMain.handle('app:locale-set', async (_event, payload) => {
    try {
      const state = mainLocale.setRendererLocale(payload?.locale);
      const generator = generatorEditorWindow && !generatorEditorWindow.isDestroyed()
        ? await syncGeneratorLocale(state.locale)
        : { ok: false, error: 'generator-editor-not-open' };
      return { ok: true, ...state, generator };
    } catch (error) {
      return { ok: false, error: error?.message || 'invalid-locale' };
    }
  });
  ipcMain.handle('fusion:midi-read', async (_event, payload) => {
    const track = fusionTrackIndex.get(String(payload?.trackId || ''));
    return track ? xldAnalysis.readMidi(track, payload?.stem) : { ok: false, error: 'track-missing' };
  });
  ipcMain.handle('fusion:midi-reveal', async (_event, payload) => {
    const track = fusionTrackIndex.get(String(payload?.trackId || ''));
    if (!track) return { ok: false, error: 'track-missing' };
    const result = await xldAnalysis.readMidi(track, payload?.stem);
    if (!result.ok) return result;
    const error = await shell.openPath(result.directory);
    return { ok: !error, error: error || null };
  });
  ipcMain.handle('fusion:midi-run', async (event, payload) => {
    const track = fusionTrackIndex.get(String(payload?.trackId || ''));
    if (!track) return { ok: false, error: 'track-missing' };
    const core = require('./midi-assets.cjs');
    if (!core.STEMS.includes(payload?.stem)) return {ok:false,error:'midi-stem-unsupported'};
    const active = await xldAnalysis.readMidi(track, payload.stem);
    // A hand-edited revision must never be transcribed over from here. This handler picks the engine itself, and
    // the renderer passes force = true whenever any MIDI exists (stem-controls.js), so the cache branch that
    // protects a revision in the workbench is never reached: without this line the button silently replaces the
    // user's own edit with fresh model output. Replacing an edit is a decision, and it belongs where the edit is
    // made, not behind a button in the visualizer.
    if (active.ok && active.engine === core.MANUAL_ENGINE) return {ok: false, error: 'midi-manual-active'};
    const activeProfile = active.ok ? core.profileForResult(active) : null;
    const reusable = activeProfile && !activeProfile.retiredFor?.includes(payload.stem);
    const models = reusable ? [] : (await xldAnalysis.midiEngines()).filter(model=>model.stems.includes(payload.stem));
    const engine = reusable ? activeProfile.id : (models.find(model => model.defaultFor === payload.stem && model.available) || models.find(model => model.id === 'basic-pitch' && model.available))?.id;
    if (!engine) return {ok:false,error:'runtime-missing'};
    return xldAnalysis.run(track, engine, { stem: payload?.stem, force: payload?.force === true }, snapshot => {
      if (!event.sender.isDestroyed()) event.sender.send('fusion:analysis-task', snapshot);
    });
  });
  ipcMain.handle('fusion:stems-read', async (_event, payload) => {
    const track = fusionTrackIndex.get(String(payload?.trackId || ''));
    return track ? xldAnalysis.readStems(track) : { ok: false, error: 'track-missing' };
  });
  ipcMain.handle('fusion:stems-reveal', async (_event, payload) => {
    const track = fusionTrackIndex.get(String(payload?.trackId || ''));
    if (!track) return { ok: false, error: 'track-missing' };
    const result = await xldAnalysis.readStems(track);
    if (!result.ok) return result;
    const error = await shell.openPath(result.directory);
    return { ok: !error, error: error || null };
  });
  ipcMain.handle('fusion:stems-run', async (event, payload) => {
    const track = fusionTrackIndex.get(String(payload?.trackId || ''));
    if (!track) return { ok: false, error: 'track-missing' };
    const active = await xldAnalysis.readStems(track);
    const models = active.ok ? [] : await xldAnalysis.separationEngines();
    const engine = active.ok ? active.engine : (models.find(model => model.default && model.available) || models.find(model => model.available))?.id;
    if (!engine) return {ok:false,error:'runtime-missing'};
    return xldAnalysis.run(track, engine, { force: payload.force === true }, snapshot => {
      if (!event.sender.isDestroyed()) event.sender.send('fusion:analysis-task', snapshot);
    });
  });

  ipcMain.handle('fusion:analysis-run', async (event, payload) => {
    const indexed = fusionTrackIndex.get(String(payload?.trackId || ''));
    if (!indexed) return { ok: false, error: 'track-missing' };
    const publish = snapshot => {
      if (!event.sender.isDestroyed()) event.sender.send('fusion:analysis-task', snapshot);
    };
    const response = await xldAnalysis.run(
      { ...indexed, filePath: indexed.filePath, bridgePath: indexed.bridgePath },
      String(payload?.engine || ''),
      payload?.options && typeof payload.options === 'object' ? payload.options : {},
      publish
    );
    if (response?.ok) {
      indexed.manifest = response.manifest;
      indexed.bridgePath = response.manifestPath;
    }
    return response;
  });

  // XLD is the main analysis workspace; XML can also host its core locally.
  ipcMain.handle('fusion:analyze-in-xld', async (_event, payload) => {
    await refreshXldSettings();
    const indexed = fusionTrackIndex.get(String(payload?.trackId || ''));
    const source = indexed?.filePath || (typeof payload?.source === 'string' ? payload.source : '');
    if ((payload?.trackId && !indexed) || (source && !fsSync.existsSync(source))) return {ok:false,error:'track-missing'};
    const locale=normalizeLocale(payload?.locale) || mainLocale.getState().locale;
    let wrote=0;
    if(source){
      try{await writeRequest(fusionAnalysisRoot,{source,locale,from:"Xin's Music Lab"});wrote=1;}
      catch(error){return {ok:false,error:'handoff-write-failed',detail:error.message};}
    }
    const developmentLauncher = path.join(__dirname, '..', '..', 'xld-runtime-baseline', 'start-dev.cmd');
    if(process.env.XLD_EXECUTABLE){
      return {...await require('./launch-xld.cjs').launch(process.env.XLD_EXECUTABLE),wrote};
    }
    const launcher = fsSync.existsSync(developmentLauncher) ? developmentLauncher : path.join(xldRoot, 'start-xld.cmd');
    if (!fsSync.existsSync(launcher)) return { ok: false, error: 'xld-not-found', wrote };
    try {
      // The launcher opens XLD; detached + unref lets it outlive this call.
      const child = require('child_process').spawn(process.env.ComSpec || 'cmd.exe', ['/c', launcher], { detached: true, windowsHide: true, stdio: 'ignore' });
      child.unref();
      return { ok: true, wrote };
    } catch (error) {
      return { ok: false, error: error?.message || 'launch-failed', wrote };
    }
  });

  ipcMain.handle('fusion:open-generator-editor', openGeneratorEditor);

  ipcMain.handle('fusion:open-bridge', async () => {
    const result = await dialog.showOpenDialog({
      title: mainLocale.message('dialog.bridge.openTitle'),
      defaultPath: primaryAnalysisRoot(),
      properties: ['openFile'],
      filters: [{ name: mainLocale.message('dialog.bridge.filter'), extensions: ['json'] }]
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
    return readFusionBridge(result.filePaths[0]);
  });

  ipcMain.handle('fusion:export-glitch-preset', async (_event, payload) => {
    const json = typeof payload?.json === 'string' ? payload.json : '';
    if (!json || Buffer.byteLength(json, 'utf8') > MAX_GLITCH_PRESET_JSON_BYTES) {
      return { ok: false, error: 'invalid-preset-json' };
    }
    const requestedName = path.basename(String(payload?.filename || 'Xin-Glitch-preset.json'));
    const filename = (requestedName.toLowerCase().endsWith('.json')
      ? requestedName
      : `${requestedName}.json`
    ).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-');
    const result = await dialog.showSaveDialog({
      title: mainLocale.message('dialog.preset.exportTitle'),
      defaultPath: path.join(app.getPath('documents'), filename),
      filters: [{ name: mainLocale.message('dialog.preset.filter'), extensions: ['json'] }]
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    const target = path.resolve(result.filePath);
    const temporary = `${target}.${process.pid}.tmp`;
    try {
      await fs.writeFile(temporary, json, { encoding: 'utf8', flag: 'wx' });
      await fs.rename(temporary, target);
      return { ok: true, path: target };
    } catch (error) {
      await fs.rm(temporary, { force: true }).catch(() => {});
      return { ok: false, error: error?.message || 'preset-write-failed' };
    }
  });

  ipcMain.handle('fusion:import-glitch-preset', async () => {
    const result = await dialog.showOpenDialog({
      title: mainLocale.message('dialog.preset.importTitle'),
      properties: ['openFile'],
      filters: [{ name: mainLocale.message('dialog.preset.filter'), extensions: ['json'] }]
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
    const source = path.resolve(result.filePaths[0]);
    try {
      const stat = await fs.stat(source);
      if (!stat.isFile() || stat.size > MAX_GLITCH_PRESET_JSON_BYTES) {
        return { ok: false, error: 'preset-file-too-large' };
      }
      return {
        ok: true,
        path: source,
        name: path.basename(source),
        json: await fs.readFile(source, 'utf8')
      };
    } catch (error) {
      return { ok: false, error: error?.message || 'preset-read-failed' };
    }
  });

  ipcMain.handle('fusion:preset-repository-list', async () => {
    try { return { ok: true, repository: await glitchPresetRepository.list() }; }
    catch (error) {
      return { ok: false, error: error?.message || 'preset-repository-list-failed' };
    }
  });

  ipcMain.handle('fusion:preset-repository-save', async (_event, payload) => {
    if (payload?.category !== 'user') {
      return { ok: false, error: 'preset-repository-category-read-only' };
    }
    try {
      const entry = await glitchPresetRepository.save(
        'user',
        payload?.json,
        payload?.filename
      );
      return { ok: true, entry };
    } catch (error) {
      return { ok: false, error: error?.message || 'preset-repository-save-failed' };
    }
  });

  ipcMain.handle('fusion:preset-repository-read', async (_event, payload) => {
    if (!['user', 'recovered'].includes(payload?.category)) {
      return { ok: false, error: 'preset-repository-category-invalid' };
    }
    try {
      return await glitchPresetRepository.read(payload.category, payload.key);
    } catch (error) {
      return { ok: false, error: error?.message || 'preset-repository-read-failed' };
    }
  });

  ipcMain.handle('fusion:preset-repository-remove', async (_event, payload) => {
    if (payload?.category !== 'user') {
      return { ok: false, error: 'preset-repository-entry-read-only' };
    }
    try { return await glitchPresetRepository.remove('user', payload.key); }
    catch (error) {
      return { ok: false, error: error?.message || 'preset-repository-remove-failed' };
    }
  });

  ipcMain.handle('fusion:reveal-bridge', async (_event, filePath) => {
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) return false;
    try {
      shell.showItemInFolder(filePath);
      return true;
    } catch (_) {
      return false;
    }
  });

  ipcMain.handle('app:media-control', async (_event, action) => {
    const keyCode = mediaKeyCodes[action];
    if (!keyCode) return { ok: false };
    const script = [
      'Add-Type -TypeDefinition @\"',
      'using System;',
      'using System.Runtime.InteropServices;',
      'public static class XinMediaKey {',
      '  [DllImport(\"user32.dll\")] public static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr info);',
      '}',
      '\"@;',
      `[XinMediaKey]::keybd_event([byte]${keyCode},0,0,[UIntPtr]::Zero);`,
      `[XinMediaKey]::keybd_event([byte]${keyCode},0,2,[UIntPtr]::Zero);`
    ].join('\n');
    try {
      await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
        windowsHide: true,
        timeout: 5000
      });
      return { ok: true };
    } catch (_) {
      return { ok: false };
    }
  });

  ipcMain.handle('app:toggle-always-on-top', event => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    const next = !win.isAlwaysOnTop();
    win.setAlwaysOnTop(next, 'floating');
    return next;
  });

  ipcMain.handle('app:save-snapshot', async (_event, dataUrl) => {
    if (typeof dataUrl !== 'string'
      || dataUrl.length > 80 * 1024 * 1024
      || !dataUrl.startsWith('data:image/png;base64,')) return { saved: false, error: 'invalid-image' };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    try {
      const result = await dialog.showSaveDialog({
        title: mainLocale.message('dialog.snapshot.saveTitle'),
        defaultPath: path.join(app.getPath('pictures'), `Xins-Music-Lab-${stamp}.png`),
        filters: [{ name: mainLocale.message('dialog.snapshot.filter'), extensions: ['png'] }]
      });
      if (result.canceled || !result.filePath) return { saved: false, canceled: true };
      await fs.writeFile(result.filePath, Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64'));
      return { saved: true, path: result.filePath };
    } catch (error) {
      console.error('Failed to save snapshot:', error);
      return { saved: false, error: 'write-failed' };
    }
  });

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media' || permission === 'fullscreen');
  });

  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 0, height: 0 },
        fetchWindowIcons: false
      });
      if (!sources.length) {
        callback({});
        return;
      }
      callback({ video: sources[0], audio: 'loopback' });
    } catch (_) {
      callback({});
    }
  });

  let mainWindow = createWindow();
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) mainWindow = createWindow();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
