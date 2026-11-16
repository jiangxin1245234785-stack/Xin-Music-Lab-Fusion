'use strict';

const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { app, BrowserWindow, dialog, ipcMain, session, shell } = require('electron');
const { readAudioTags, parseTrackNumber } = require('./audio-tags.cjs');
const { createService: createXldAnalysisService } = require('./xld-analysis-service.cjs');
const {readLatestTrack} = require('./refresh-track.cjs');
const {writeRequest} = require('../../xld-runtime-baseline/core/open-request.cjs');
// Section names come from XLD's one module; manifests written before segments carried `name` get it in memory.
const {namedManifest} = require('../../xld-runtime-baseline/core/sections.cjs');
const layersStateModule = require('./score-layers-state.cjs');
const xldTimelineProvider = require('../xld-timeline-provider-adapter.js');
const { createRepository: createGlitchPresetRepository } =
  require('./glitch-preset-repository.cjs');
const { createMainLocaleController, normalizeLocale } = require('./locale.cjs');
const { applyGeneratorHostLocale } = require('./generator-locale.cjs');

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
  const hiddenTest=process.env.XML_TEST==='1'&&process.env.XML_TEST_VISIBLE!=='1';
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
      offscreen: hiddenTest,
      backgroundThrottling: process.env.XML_TEST !== '1',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  const reveal = () => {
    if(hiddenTest)return;
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
  // A file:// link to a FLAC stem plays its decoded WAV (gain restored); every other file request is untouched.
  require('../../xld-runtime-baseline/core/stem-audio.cjs').registerFileProtocol({protocol: require('electron').protocol, net: require('electron').net});
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

  // The runtime root comes from XLD_RUNTIME_ROOT only (audit fix 2 / item 7): no fallback to an older install; a
  // runtime that is not configured is reported as missing by the analysis service.
  const xldRoot = process.env.XLD_RUNTIME_ROOT || null;
  const xldAnalysis = createXldAnalysisService({
    xldRoot,
    program: 'XML',
    analysisRoot: fusionAnalysisRoot
  });
  const glitchPresetRepository = createGlitchPresetRepository({
    root: path.join(app.getPath('userData'), 'Glitch Presets')
  });
  // A damaged or temporarily unavailable preset directory must not prevent
  // the player and visual engine from starting. Repository IPC retries the
  // initialization and reports a clone-safe error to the renderer.
  await glitchPresetRepository.initialize().catch(() => null);
  const noteModule=require('./score-notes.cjs');
  const scoreNotes=noteModule.createStore(noteModule.notesRoot(app.getPath('appData'),app.getPath('userData')));
  const listeningModule=require('./listening-state.cjs');
  const listeningState=listeningModule.createStore(listeningModule.rootFor(app.getPath('appData'),app.getPath('userData')));
  const dynamicsModule=require('./score-dynamics.cjs');
  const dynamics=dynamicsModule.createService({root:dynamicsModule.rootFor(app.getPath('appData'),app.getPath('userData')),readMidi:(track,stem)=>xldAnalysis.readMidi(track,stem),profileForResult:require('../../xld-runtime-baseline/core/derived-assets.cjs').profileForResult});
  app.on('before-quit',()=>dynamics.shutdown());
  // An analysis still running when XML quits (the score layers prepared in the background, or any other
  // one started here) is cancelled: its Python process is stopped and nothing half-made is kept. Once
  // XLD's service has started saving ('committing') it refuses, and that result is saved whole.
  app.on('before-quit',()=>{try{const running=xldAnalysis.task();if(running&&['starting','running'].includes(running.status))xldAnalysis.cancel();}catch(_){}});
  ipcMain.handle('fusion:listening-read',async()=>{try{return {ok:true,value:await listeningState.read()};}catch(e){return {ok:false,error:String(e.message||e)};}});
  // Lyrics for the score (B6): the page names a track by id; the names sent out come from the library here, not the page.
  const lyricsModule=require('./lyrics.cjs');
  const lyrics=lyricsModule.createLyrics({root:lyricsModule.rootFor(app.getPath('appData'),app.getPath('userData'))});
  ipcMain.handle('fusion:lyrics',async(_event,payload)=>{const track=fusionTrackIndex.get(String(payload?.trackId||''));if(!track)return {ok:false,reason:'track-missing'};const duration=Number(track.duration)>0?Number(track.duration):(Number(payload?.duration)>0&&Number(payload.duration)<86400?Number(payload.duration):0);try{const answer=await lyrics.get({id:track.id,title:track.title,artist:track.artist,album:track.album,duration,filePath:track.filePath});if(!answer.ok)return answer;
    // B7: one whole-song offset, estimated from the song's vocal line (score-vocals.json) when there is one, plus the user's nudges.
    let vocal=null;try{const loaded=await loadFusionTrack(track.id);if(loaded.ok&&loaded.filePath){const line=JSON.parse(await fs.readFile(path.join(path.dirname(loaded.filePath),'score-vocals.json'),'utf8'));if(Array.isArray(line?.lane?.notes)&&line.lane.notes.length)vocal={id:String(line.source?.runId||'')+':'+line.lane.notes.length+':'+(line.duration||0),notes:line.lane.notes};}}catch(_){}
    let offset={auto:0,sure:false,why:'unavailable',manual:0};try{offset=await lyrics.offsetFor(track.id,answer.lrc,vocal);}catch(_){}
    return {...answer,offset};}catch(e){return {ok:false,reason:'error'};}});
  ipcMain.handle('fusion:lyrics-nudge',async(_event,payload)=>{const track=fusionTrackIndex.get(String(payload?.trackId||''));if(!track)return {ok:false,reason:'track-missing'};const delta=Number(payload?.delta);if(!(delta===0.1||delta===-0.1))return {ok:false,reason:'bad-step'};try{return {ok:true,offset:await lyrics.nudge(track.id,delta)};}catch(e){return {ok:false,reason:'error'};}});
  ipcMain.handle('fusion:listening-save',async(_event,value)=>{if(!fusionTrackIndex.has(String(value?.trackId||'')))return {ok:false,error:'track-missing'};try{return {ok:true,value:await listeningState.save(value)};}catch(e){return {ok:false,error:String(e.message||e)};}});
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
              manifests.set(path.resolve(source).toLowerCase(), { filePath: entryPath, manifest: namedManifest(manifest) });
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

  // SPEC-B3: whether XLD has separated the track (stems.json) and written notes for it (a midi/<stem>.json
  // pointer), by looking for the files only (read-only), for the library row's word (library-status.js).
  // `manifestPath` is the track's music-lab.json. The full scan and the one-track refresh both use this.
  const stemFacts = async manifestPath => {
    if (!manifestPath) return {hasStems: false, hasNotes: false};
    const dir = path.dirname(manifestPath);
    let hasStems = false, hasNotes = false;
    try { await fs.access(path.join(dir, 'stems.json')); hasStems = true; } catch (_) { hasStems = false; }
    if (hasStems) { try { hasNotes = (await fs.readdir(path.join(dir, 'midi'))).some(name => name.endsWith('.json') && !name.endsWith('-source.json')); } catch (_) { hasNotes = false; } }
    return {hasStems, hasNotes};
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
    const stemFields = linked => stemFacts(linked?.filePath);
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
          ...analysisFields(linked),
          ...(await stemFields(linked))
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
        // 「N 首可看谱面」: songs XLD wrote notes for (library-status.js isReady), not sections / chords.
        analyzedCount: albumTracks.filter(track => track.hasNotes).length,
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
          ...analysisFields(linked),
          ...(await stemFields(linked))
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
          analyzedCount: singles.filter(track => track.hasNotes).length,
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
      analyzedCount: tracks.filter(track => track.hasNotes).length,
      albums,
      tracks
    };
  };

  const loadFusionTrack = async trackId => {
    const indexed = fusionTrackIndex.get(String(trackId || ''));
    if (!indexed || !fsSync.existsSync(indexed.filePath)) return { ok: false, error: 'track-missing' };
    const latest=await readLatestTrack(indexed,existingAnalysisRoots(),xldTimelineProvider.validateManifest);
    if(!latest.ok)return latest;
    indexed.manifest=namedManifest(latest.manifest);indexed.bridgePath=latest.filePath;
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
        manifest: namedManifest(manifest)
      };
    } catch (error) {
      return { ok: false, error: error?.code === 'ENOENT' ? 'missing-file' : 'read-failed' };
    }
  };

  ipcMain.handle('fusion:scan-library', scanFusionLibrary);
  ipcMain.handle('fusion:refresh-track', async (_event, trackId) => {
    const indexed=fusionTrackIndex.get(String(trackId || ''));
    if(!indexed || !fsSync.existsSync(indexed.filePath))return {ok:false,error:'track-missing'};
    if(xldAnalysis.task()||dynamics.isBusy())return {ok:false,error:'analysis-busy'};
    await refreshXldSettings();xldAnalysis.setAnalysisRoot(fusionAnalysisRoot);
    const loaded = await loadFusionTrack(trackId);
    // B3 acceptance M1: coming back from XLD, the row's word (stems / notes) is looked at again too.
    if (loaded && loaded.ok) loaded.trackFacts = await stemFacts(loaded.filePath);
    return loaded;
  });
  ipcMain.handle('fusion:load-track', (_event, trackId) => loadFusionTrack(trackId));
  ipcMain.handle('fusion:settings', refreshXldSettings);
  // Where the music is and where the analysis results are. Both live in the settings file this app shares with
  // XLD, so a folder picked here is the folder XLD uses too. Only the one key is changed; the rest of the file stays.
  ipcMain.handle('fusion:choose-folder', async (event, payload) => {
    const key = payload?.kind === 'analysis' ? 'analysisRoot' : 'libraryRoot';
    if (xldAnalysis.task()||dynamics.isBusy()) return { ok: false, error: 'analysis-busy' };
    await refreshXldSettings();
    const current = key === 'analysisRoot' ? fusionAnalysisRoot : fusionLibraryRoot;
    const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
      title: mainLocale.message(key === 'analysisRoot' ? 'dialog.analysis.chooseTitle' : 'dialog.library.chooseTitle'),
      defaultPath: fsSync.existsSync(current) ? current : undefined,
      properties: ['openDirectory']
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
    let settings = {};
    try { settings = JSON.parse(await fs.readFile(xldSettingsPath, 'utf8')); } catch (_) {}
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) settings = {};
    settings[key] = path.resolve(result.filePaths[0]);
    try {
      await fs.mkdir(path.dirname(xldSettingsPath), { recursive: true });
      await fs.writeFile(xldSettingsPath, JSON.stringify(settings, null, 2), 'utf8');
    } catch (error) {
      return { ok: false, error: 'settings-unwritable', details: String(error?.message || error) };
    }
    const roots = await refreshXldSettings();
    xldAnalysis.setAnalysisRoot(fusionAnalysisRoot);
    return { ok: true, ...roots };
  });
  ipcMain.handle('fusion:analysis-task', () => xldAnalysis.task());
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
  // The listening score's model for one track: its sections and chords from the bridge manifest, its notes from
  // each stem's active MIDI. Read-only; the adapter lives with the score view (source/scoreview).
  const scoreModelFor = async payload => {
    const track = fusionTrackIndex.get(String(payload?.trackId || ''));
    if (!track) return { ok: false, error: 'track-missing' };
    const loaded = await loadFusionTrack(track.id);
    if (!loaded.ok) return loaded;
    try {
      const adapter = require('../../scoreview/adapter/track-model.cjs');
      let manualCaptions=[],notesError=null;
      try{manualCaptions=await scoreNotes.list(track.id);}catch(error){notesError=String(error.message||error);}
      let stems=await adapter.readStems(stem => xldAnalysis.readMidi(track, stem));
      let dynamicsHealth={enabled:payload?.useDynamics===true,state:'original',applied:[]};
      if(dynamicsHealth.enabled){try{const found=await dynamics.read(track),overlay=dynamicsModule.applyOverlay(stems,found.cache);stems=overlay.stems;dynamicsHealth={enabled:true,state:found.state,eligible:found.eligible,applied:overlay.applied,runId:found.cache?.runId||null,damaged:found.damaged};if(found.cache&&!overlay.applied.length)dynamicsHealth.state='missing';}catch(error){dynamicsHealth={enabled:true,state:'unavailable',applied:[],error:String(error.message||error)};}}
      const layersBody = await adapter.readLayers(loaded.filePath ? path.dirname(loaded.filePath) : null);
      const built=adapter.modelFrom({
        track: { id: track.id, title: track.title, artist: track.artist, album: track.album },
        duration: track.duration, audioUrl: loaded.audioUrl, coverUrl: loaded.coverUrl, manifest: loaded.manifest,
        stems,
        layers: layersBody,
        vocalLine: await adapter.readVocalLine(loaded.filePath ? path.dirname(loaded.filePath) : null),manualCaptions,
        // The renderer says which language it shows (it asks again when that changes); otherwise the app's.
        lang: normalizeLocale(payload?.lang) || mainLocale.getState().locale
      });
      for(const lane of built.model?.lanes||[])if(dynamicsHealth.applied.includes(lane.group||lane.id))lane.meta={...lane.meta,velocity:'stem-energy-relative',dynamicsRunId:dynamicsHealth.runId};
      // Which engine each lane's notes come from, in the words XLD shows (desktop/score-layers-state.cjs).
      const lang = normalizeLocale(payload?.lang) || mainLocale.getState().locale;
      for(const lane of built.model?.lanes||[])if(lane.meta&&lane.meta.engine)lane.meta={...lane.meta,engineName:layersStateModule.engineName(lane.meta.engine,lang)};
      // Whether the score layers are there and made from the current stems, so the scene can have them prepared.
      // A read that throws is "unreadable", not "no stems" (stemsStatus).
      const stemsNow = await xldAnalysis.readStems(track).catch(error => ({ok: false, error: String(error?.message || error)}));
      const stemsKind = layersStateModule.stemsStatus(stemsNow), layersState = layersStateModule.layersState(layersBody, stemsNow);
      // stemRunId: which stems the verdict is about, so a song prepared earlier is looked at again after new stems.
      const layersHealth = {state: layersState, stems: stemsKind, stemsReady: stemsKind === 'ready', stemRunId: stemsNow?.ok ? (stemsNow.runId ?? null) : null,
                            owed: layersStateModule.owed(layersState, stemsKind)};
      // The vocal line too (B7): XML prepares it after the layers when the song has a vocal stem and no current line.
      const vocalsNow = await layersStateModule.vocalsState(loaded.filePath ? path.dirname(loaded.filePath) : null);
      const vocalsHealth = {state: vocalsNow.state, owed: layersStateModule.vocalsOwed(vocalsNow, stemsKind)};
      return {...built,health:{...built.health,layers:layersHealth,vocals:vocalsHealth,dynamics:dynamicsHealth,manualNotes:{ok:!notesError,count:manualCaptions.length,why:notesError}}};
    } catch (error) {
      return { ok: false, error: 'score-adapter-failed', details: String(error?.message || error) };
    }
  };
  ipcMain.handle('fusion:score-model', (_event, payload) => scoreModelFor(payload));
  // For preparing many tracks at once (the library drawer): per track, whether XLD has its stems and
  // whether its score layers are current. Read-only, no model is built.
  ipcMain.handle('fusion:score-layers-state', async (_event, payload) => {
    const ids = Array.isArray(payload?.trackIds) ? payload.trackIds.map(String).slice(0, 5000) : [];
    const adapter = require('../../scoreview/adapter/track-model.cjs');
    const rows = [];
    for (const id of ids) {
      const track = fusionTrackIndex.get(id);
      if (!track) { rows.push({trackId: id, ok: false, error: 'track-missing'}); continue; }
      try {
        const stems = await xldAnalysis.readStems(track).catch(error => ({ok: false, error: String(error?.message || error)}));
        const status = layersStateModule.stemsStatus(stems);
        let state = 'missing', vocals = {state: 'no-stem', due: false};
        if (status === 'ready') {
          const loaded = await loadFusionTrack(track.id);
          const body = loaded.ok && loaded.filePath ? await adapter.readLayers(path.dirname(loaded.filePath)) : null;
          state = layersStateModule.layersState(body, stems);
          vocals = await layersStateModule.vocalsState(loaded.ok && loaded.filePath ? path.dirname(loaded.filePath) : null);
        }
        rows.push({trackId: id, ok: true, stems: status, stemsReady: status === 'ready', state, owed: layersStateModule.owed(state, status),
                   vocals: vocals.state, vocalsOwed: layersStateModule.vocalsOwed(vocals, status)});
      } catch (error) {
        rows.push({trackId: id, ok: false, error: String(error?.message || error)});
      }
    }
    return {ok: true, rows};
  });
  // The score as a video file (source/scoreview/export): desktop/score-export-ipc.cjs. The roots it keeps clear
  // of are every folder XML takes analysis from (the settings' root and the two default ones), whether or not
  // it exists yet; tests/score-export-wiring.cjs loads this file with a stand-in Electron and checks them.
  require('./score-export-ipc.cjs').createScoreExport({
    app, dialog, shell, BrowserWindow, scoreModelFor,
    exporter: require('../../scoreview/export/export-main.cjs'),
    analysisRoots: () => [...new Map(analysisRootCandidates().map(root => [path.resolve(root).toLowerCase(), path.resolve(root)])).values()],
    locale: () => mainLocale.getState().locale
  }).register(ipcMain);
  ipcMain.handle('fusion:score-dynamics',async(event,payload)=>{
    if(payload?.action==='task')return {ok:true,task:dynamics.task()};
    if(payload?.action==='cancel'){if(payload.taskId&&dynamics.task()?.id!==payload.taskId)return {ok:false,error:'dynamics-task-stale'};return dynamics.cancel();}
    const track=fusionTrackIndex.get(String(payload?.trackId||''));if(!track)return {ok:false,error:'track-missing'};
    try{
      if(payload.action==='status'){const found=await dynamics.read(track);return {ok:true,state:found.state,eligible:found.eligible,runId:found.cache?.runId||null,damaged:found.damaged};}
      if(payload.action==='run'){
        if(xldAnalysis.task())return {ok:false,error:'analysis-busy'};
        // The cross-program analysis lock (core/analysis-lock.cjs), held until the job is no longer busy.
        const lockModule=require('../../xld-runtime-baseline/core/analysis-lock.cjs');
        const lock=await lockModule.createAnalysisLock({program:'XML'}).acquire(fusionAnalysisRoot,{task:'score-dynamics',song:track.title||track.id});
        if(!lock.ok)return {ok:false,error:'analysis-locked',holder:lock.holder,detail:lockModule.holderMessage(lock.holder)};
        const finished=task=>!task||!['preparing','running','cancelling'].includes(task.status);
        const started=dynamics.start(track,{force:payload.force===true},task=>{if(finished(task))lock.release().catch(()=>{});if(!event.sender.isDestroyed())event.sender.send('fusion:score-dynamics-task',task);});
        if(!started?.ok||finished(started.task))await lock.release().catch(()=>{});
        return started;
      }
      return {ok:false,error:'dynamics-action-invalid'};
    }catch(error){return {ok:false,error:String(error.message||error)};}
  });
  ipcMain.handle('fusion:score-notes',async(_event,payload)=>{
    const track=fusionTrackIndex.get(String(payload?.trackId||''));if(!track)return {ok:false,error:'track-missing'};
    try{
      if(payload.action==='save'){const duration=Number(track.duration)>0?Number(track.duration):86400;return {ok:true,note:await scoreNotes.save(track.id,payload.note,duration)};}
      if(payload.action==='remove')return await scoreNotes.remove(track.id,payload.id);
      if(payload.action==='list')return {ok:true,notes:await scoreNotes.list(track.id)};
      return {ok:false,error:'notes-action-invalid'};
    }catch(error){return {ok:false,error:String(error.message||error)};}
  });
  ipcMain.handle('fusion:midi-reveal', async (_event, payload) => {
    const track = fusionTrackIndex.get(String(payload?.trackId || ''));
    if (!track) return { ok: false, error: 'track-missing' };
    const result = await xldAnalysis.readMidi(track, payload?.stem);
    if (!result.ok) return result;
    const error = await shell.openPath(result.directory);
    return { ok: !error, error: error || null };
  });
  ipcMain.handle('fusion:stems-read', async (_event, payload) => {
    const track = fusionTrackIndex.get(String(payload?.trackId || ''));
    if(!track)return {ok:false,error:'track-missing'};
    const base=await xldAnalysis.readStems(track),strings=await xldAnalysis.readMidi(track,'strings');
    if(base.ok&&strings.ok&&strings.source?.path)return {...base,stems:[...base.stems,{name:'strings',audioUrl:pathToFileURL(strings.source.path).href}]};
    return base;
  });
  ipcMain.handle('fusion:stems-reveal', async (_event, payload) => {
    const track = fusionTrackIndex.get(String(payload?.trackId || ''));
    if (!track) return { ok: false, error: 'track-missing' };
    const result = await xldAnalysis.readStems(track);
    if (!result.ok) return result;
    const error = await shell.openPath(result.directory);
    return { ok: !error, error: error || null };
  });

  // XML starts only what it shows and XLD does not (project rule "who shows it starts it"): the score's
  // own layers and the vocal curve. Splitting, transcription, sections and chords are XLD's, and their
  // results are only read here; a re-run of those would delete the earlier stems or MIDI without a word.
  const XML_ENGINES = new Set(['score-layers', 'score-vocals']);
  ipcMain.handle('fusion:analysis-run', async (event, payload) => {
    if (!XML_ENGINES.has(String(payload?.engine || ''))) return {ok: false, error: 'engine-not-in-xml'};
    if(dynamics.isBusy())return {ok:false,error:'analysis-busy'};
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
      if (response.manifest) response.manifest = namedManifest(response.manifest);
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
    const launcher = fsSync.existsSync(developmentLauncher) ? developmentLauncher : xldRoot ? path.join(xldRoot, 'start-xld.cmd') : '';
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

  ipcMain.handle('app:toggle-always-on-top', event => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    const next = !win.isAlwaysOnTop();
    win.setAlwaysOnTop(next, 'floating');
    // B3 acceptance L3: say what the window really is after the change, not what was asked for.
    return win.isAlwaysOnTop();
  });
  // So a reloaded page shows the window's real state.
  ipcMain.handle('app:is-always-on-top', event => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return Boolean(win && win.isAlwaysOnTop());
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
