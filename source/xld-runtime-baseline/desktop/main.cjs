'use strict';

const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { spawn } = require('child_process');
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { createDerivedAssets, trackDirectory } = require('../core/derived-assets.cjs');
const ANALYSIS_RUNTIME_ROOT = process.env.XLD_RUNTIME_ROOT || 'D:\\Program Files\\xin-local-deck-beta';
const { readAudioTags, parseTrackNumber } = require('./audio-tags.cjs');
const { createMainLocaleController, normalizeLocale } = require('./locale.cjs');

const {defaultUserPaths} = require('../../shared-analysis/user-paths.cjs');
const DEFAULT_LIBRARY_ROOT = defaultUserPaths(app).libraryRoot;
const AUDIO_EXTENSIONS = new Set(['.flac', '.wav', '.mp3', '.m4a', '.aac', '.ogg', '.opus']);
const COVER_NAMES = ['cover.jpg', 'cover.jpeg', 'cover.png', 'folder.jpg', 'folder.png', 'front.jpg', 'front.png'];
const MSAF_ENGINE_IDS = ['msaf', 'msaf-sf', 'msaf-foote', 'msaf-cnmf'];
const AI_ENGINE_IDS = ['songformer'];
const HARMONY_ENGINE_IDS = ['chord-cqt', 'chord-cens', 'chord-hybrid', 'chord-btc'];
const SECTION_ENGINE_IDS = [...MSAF_ENGINE_IDS, ...AI_ENGINE_IDS];
const RESULT_ENGINE_IDS = [...SECTION_ENGINE_IDS, ...HARMONY_ENGINE_IDS];
const ANNOTATIONS_FILENAME = 'manual-tags.json';
const MUSIC_LAB_FILENAME = 'music-lab.json';
const ANALYSIS_SECONDS_PER_MINUTE = {
  msaf: 6.0,
  'msaf-sf': .7,
  'msaf-foote': .7,
  'msaf-cnmf': 1.3,
  songformer: 7.0,
  'chord-cqt': 2.2,
  'chord-cens': .35,
  'chord-hybrid': .45
};
const trackIndex = new Map();
let libraryRoot = DEFAULT_LIBRARY_ROOT;
let analysisRootPath = null;
const {consumeRequest} = require('../core/open-request.cjs');
const { createService } = require('../core/analysis-service.cjs');
let mainWindow = null;
const mainLocale = createMainLocaleController();

function publishHostLocale() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('locale:host', mainLocale.getState());
}

app.setName("Xin's Local Deck Beta");
// One window per profile. Isolated tests opt in explicitly when checking hand-off.
const ownsWindow = process.env.XLD_TEST === '1' && process.env.XLD_SINGLE_INSTANCE_TEST !== '1'
  ? true : app.requestSingleInstanceLock();
if (!ownsWindow) app.quit();
app.on('second-instance', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (process.env.XLD_TEST !== '1') {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show(); mainWindow.focus();
  }
  if (!mainWindow.webContents.isLoading()) mainWindow.webContents.send('integration:open-request');
});
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Keep Demucs (torch.hub) weight downloads off the C: drive: point TORCH_HOME
// at a project-local folder (the app lives on D:). Inherited by every spawned
// analysis process. Honoured only if the user hasn't set it explicitly.
if (!process.env.TORCH_HOME) {
  process.env.TORCH_HOME = path.join(ANALYSIS_RUNTIME_ROOT, 'analysis-ai', 'torch-home');
}

const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');
const legacyAnalysisRoot = () => path.join(app.getPath('userData'), 'analysis');
const defaultAnalysisRoot = () => process.env.XLD_TEST === '1'
  ? path.join(app.getPath('userData'), 'analysis-v2')
  : defaultUserPaths(app).analysisRoot;
const analysisRoot = () => analysisRootPath || defaultAnalysisRoot();

async function readSettings() {
  try {
    const settings = JSON.parse(await fs.readFile(settingsPath(), 'utf8'));
    if (typeof settings.libraryRoot === 'string' && settings.libraryRoot) libraryRoot = settings.libraryRoot;
    if (typeof settings.analysisRoot === 'string' && settings.analysisRoot) analysisRootPath = settings.analysisRoot;
  } catch (_) {}
  if (!analysisRootPath) analysisRootPath = defaultAnalysisRoot();
}

async function writeSettings() {
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true });
  await fs.writeFile(settingsPath(), JSON.stringify({ libraryRoot, analysisRoot: analysisRoot() }, null, 2), 'utf8');
}

function safeName(value, fallback = 'Unknown') {
  const cleaned = String(value || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/[. ]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return (cleaned || fallback).slice(0, 96);
}

function parseAlbumFolder(folderName) {
  const separator = folderName.indexOf(' - ');
  if (separator < 0) return { artist: 'Unknown Artist', album: folderName };
  return {
    artist: folderName.slice(0, separator).trim() || 'Unknown Artist',
    album: folderName.slice(separator + 3).trim() || folderName
  };
}

function parseTrackName(filename, folderName, fallbackIndex) {
  const stem = filename.slice(0, -path.extname(filename).length);
  let remainder = stem;
  if (remainder.toLowerCase().startsWith(`${folderName.toLowerCase()} - `)) remainder = remainder.slice(folderName.length + 3);
  const numbered = remainder.match(/^(\d{1,3})[\s._-]+(.+)$/);
  if (numbered) return { number: Number(numbered[1]), title: numbered[2].trim() };
  return { number: fallbackIndex, title: remainder.trim() || stem };
}

// Loose singles in the library root carry their context in the filename, e.g.
// "Artist - Album - 03 Title". Used only as a fallback when embedded tags are
// absent.
function parseLooseFilename(stem) {
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
}

function stableTrackId(filePath, stat) {
  return crypto.createHash('sha1').update(`${filePath}\0${stat.size}\0${stat.mtimeMs}`).digest('hex');
}

async function findCover(folderPath, entries) {
  const names = new Map(entries.filter(entry => entry.isFile()).map(entry => [entry.name.toLowerCase(), entry.name]));
  const name = COVER_NAMES.map(candidate => names.get(candidate)).find(Boolean);
  return name ? pathToFileURL(path.join(folderPath, name)).href : null;
}

// Cache/bridge identity stays tied to the on-disk folder + filename so embedded
// tags never relocate (and orphan) existing analysis. The pathArtist/pathAlbum/
// pathNumber/pathTitle keys are the stable, tag-independent derivation; display
// fields (track.artist/title/number) may prefer embedded tags.
function analysisDirectoryForTrack(track) {
  return trackDirectory(track, analysisRoot());
}
const derivedAssets = createDerivedAssets({analysisRoot});
const analysisService = createService({
  xldRoot: ANALYSIS_RUNTIME_ROOT,
  buildManifest: async track => (await writeMusicLabBridge(track.id)).manifest
});

async function writeTrackMetadata(track, directory) {
  await fs.mkdir(directory, { recursive: true });
  const metadata = {
    schemaVersion: 1,
    trackId: track.id,
    number: track.number,
    title: track.title,
    artist: track.artist,
    album: track.album,
    source: track.filePath
  };
  await fs.writeFile(path.join(directory, 'track.json'), JSON.stringify(metadata, null, 2), 'utf8');
}

async function analysisCachePath(trackId, engine, create = true) {
  const track = trackIndex.get(trackId);
  if (!track) return null;
  const directory = analysisDirectoryForTrack(track);
  if (create) await writeTrackMetadata(track, directory);
  return path.join(directory, `${safeName(engine, 'engine')}.json`);
}

function isResultEngine(engine) {
  return RESULT_ENGINE_IDS.includes(String(engine || ''));
}

function resultFileName(engine) {
  if (!isResultEngine(engine)) return null;
  return `${engine}.json`;
}

function annotationPath(track) {
  return path.join(analysisDirectoryForTrack(track), ANNOTATIONS_FILENAME);
}

function musicLabPath(track) {
  return path.join(analysisDirectoryForTrack(track), MUSIC_LAB_FILENAME);
}

async function readJson(filePath, fallback = null) {
  try { return JSON.parse(await fs.readFile(filePath, 'utf8')); } catch (_) { return fallback; }
}

async function writeJsonAtomic(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value, null, 2), 'utf8');
  const backup = `${filePath}.${crypto.randomUUID()}.bak`;
  let hadPrevious = false;
  try { await fs.rename(filePath, backup); hadPrevious = true; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  try {
    await fs.rename(temporary, filePath);
    if (hadPrevious) await fs.rm(backup, { force: true });
  } catch (error) {
    try { await fs.rm(temporary, { force: true }); } catch (_) {}
    if (hadPrevious) { try { await fs.rename(backup, filePath); } catch (_) {} }
    throw error;
  }
}

function cleanAnnotation(input, existing = null) {
  const start = Math.max(0, Number(input?.start) || 0);
  const end = Number(input?.end);
  const label = String(input?.label || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const note = String(input?.note || '').trim().slice(0, 500);
  if (!label) throw new Error('tag-label-required');
  if (!Number.isFinite(end) || end <= start) throw new Error('tag-range-invalid');
  const now = new Date().toISOString();
  return {
    id: existing?.id || crypto.randomUUID(),
    start: Number(start.toFixed(3)),
    end: Number(end.toFixed(3)),
    label,
    note,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
}

async function loadAnnotations(trackId) {
  const track = trackIndex.get(trackId);
  if (!track) return { schemaVersion: 1, trackId, tags: [] };
  const stored = await readJson(annotationPath(track), null);
  const tags = Array.isArray(stored?.tags) ? stored.tags
    .filter(tag => tag && Number.isFinite(Number(tag.start)) && Number.isFinite(Number(tag.end)) && Number(tag.end) > Number(tag.start))
    .sort((a, b) => Number(a.start) - Number(b.start)) : [];
  return { schemaVersion: 1, trackId, updatedAt: stored?.updatedAt || null, tags };
}

async function saveAnnotations(trackId, tags) {
  const track = trackIndex.get(trackId);
  if (!track) return null;
  const directory = analysisDirectoryForTrack(track);
  await writeTrackMetadata(track, directory);
  const document = {
    schemaVersion: 1,
    trackId,
    updatedAt: new Date().toISOString(),
    tags: [...tags].sort((a, b) => Number(a.start) - Number(b.start))
  };
  await writeJsonAtomic(annotationPath(track), document);
  return document;
}

async function migrateLegacyCaches() {
  if (path.resolve(legacyAnalysisRoot()) === path.resolve(analysisRoot())) return;
  for (const [trackId, track] of trackIndex) {
    const legacyDirectory = path.join(legacyAnalysisRoot(), trackId);
    let files;
    try { files = (await fs.readdir(legacyDirectory)).filter(file => file.endsWith('.json')); } catch (_) { continue; }
    const targetDirectory = analysisDirectoryForTrack(track);
    await writeTrackMetadata(track, targetDirectory);
    for (const file of files) {
      const target = path.join(targetDirectory, file);
      try { await fs.access(target); } catch (_) {
        try { await fs.copyFile(path.join(legacyDirectory, file), target); } catch (_) {}
      }
    }
  }
}

async function scanLibrary() {
  const albums = [];
  trackIndex.clear();
  let rootEntries;
  try {
    rootEntries = await fs.readdir(libraryRoot, { withFileTypes: true });
  } catch (error) {
    return { ok: false, root: libraryRoot, analysisRoot: analysisRoot(), error: error.code === 'ENOENT' ? 'library-not-found' : 'library-unreadable', albums: [] };
  }

  const folders = rootEntries.filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  for (const folder of folders) {
    const folderPath = path.join(libraryRoot, folder.name);
    let entries;
    try { entries = await fs.readdir(folderPath, { withFileTypes: true }); } catch (_) { continue; }
    const audioFiles = entries
      .filter(entry => entry.isFile() && AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    if (!audioFiles.length) continue;

    const albumInfo = parseAlbumFolder(folder.name);
    const tracks = [];
    for (let index = 0; index < audioFiles.length; index += 1) {
      const entry = audioFiles[index];
      const filePath = path.join(folderPath, entry.name);
      const stat = await fs.stat(filePath);
      const parsed = parseTrackName(entry.name, folder.name, index + 1);
      const tags = await readAudioTags(filePath);
      const id = stableTrackId(filePath, stat);
      const track = {
        id,
        number: (tags && parseTrackNumber(tags.TRACKNUMBER)) || parsed.number,
        title: (tags && tags.TITLE) || parsed.title,
        artist: (tags && (tags.ARTIST || tags.ALBUMARTIST)) || albumInfo.artist,
        album: albumInfo.album,
        pathArtist: albumInfo.artist,
        pathAlbum: albumInfo.album,
        pathNumber: parsed.number,
        pathTitle: parsed.title,
        filename: entry.name,
        extension: path.extname(entry.name).slice(1).toUpperCase(),
        bytes: stat.size,
        fileUrl: pathToFileURL(filePath).href
      };
      trackIndex.set(id, { ...track, filePath, stat });
      tracks.push(track);
    }
    tracks.sort((a, b) => a.number - b.number || a.title.localeCompare(b.title));
    albums.push({
      id: crypto.createHash('sha1').update(folderPath).digest('hex'),
      folder: folder.name,
      artist: albumInfo.artist,
      title: albumInfo.album,
      coverUrl: await findCover(folderPath, entries),
      trackCount: tracks.length,
      tracks
    });
  }
  // Loose singles sitting directly in the library root (not inside an album
  // folder). Recognised via embedded tags first, filename pattern as fallback,
  // and grouped into one synthetic "单曲 · Singles" collection.
  const looseAudio = rootEntries
    .filter(entry => entry.isFile() && AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  if (looseAudio.length) {
    const singles = [];
    for (let index = 0; index < looseAudio.length; index += 1) {
      const entry = looseAudio[index];
      const filePath = path.join(libraryRoot, entry.name);
      let stat;
      try { stat = await fs.stat(filePath); } catch (_) { continue; }
      const stem = entry.name.slice(0, -path.extname(entry.name).length);
      const tags = await readAudioTags(filePath);
      const fallback = parseLooseFilename(stem);
      const id = stableTrackId(filePath, stat);
      const track = {
        id,
        number: (tags && parseTrackNumber(tags.TRACKNUMBER)) || fallback.number || index + 1,
        title: (tags && tags.TITLE) || fallback.title || stem,
        artist: (tags && (tags.ARTIST || tags.ALBUMARTIST)) || fallback.artist || 'Unknown Artist',
        album: (tags && tags.ALBUM) || fallback.album || '单曲',
        pathArtist: fallback.artist || 'Unknown Artist',
        pathAlbum: fallback.album || '单曲',
        pathNumber: fallback.number || 0,
        pathTitle: fallback.title || stem,
        filename: entry.name,
        extension: path.extname(entry.name).slice(1).toUpperCase(),
        bytes: stat.size,
        fileUrl: pathToFileURL(filePath).href
      };
      trackIndex.set(id, { ...track, filePath, stat });
      singles.push(track);
    }
    if (singles.length) {
      singles.sort((a, b) => a.artist.localeCompare(b.artist) || a.number - b.number || a.title.localeCompare(b.title));
      albums.push({
        id: crypto.createHash('sha1').update(`${libraryRoot}::loose-singles`).digest('hex'),
        folder: '',
        artist: 'Various Artists',
        title: '单曲 · Singles',
        coverUrl: null,
        trackCount: singles.length,
        tracks: singles
      });
    }
  }

  await migrateLegacyCaches();
  return {
    ok: true,
    root: libraryRoot,
    analysisRoot: analysisRoot(),
    albumCount: albums.length,
    trackCount: albums.reduce((sum, album) => sum + album.tracks.length, 0),
    albums
  };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1580,
    height: 960,
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: '#090a0f',
    title: "Xin's Local Deck (Beta) · Structure + Harmony · Designed by Xin",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      offscreen: process.env.XLD_TEST === '1',
      backgroundThrottling: process.env.XLD_TEST !== '1',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });
  win.once('ready-to-show', () => { if (process.env.XLD_TEST !== '1') win.show(); });
  win.loadFile(path.join(__dirname, '..', 'index.html'));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  return win;
}

function firstExisting(candidates) {
  for (const candidate of candidates) {
    if (candidate && fsSync.existsSync(candidate)) return candidate;
  }
  return null;
}

// Beta reuses the stable build's MSAF venv read-only (no reinstall). Override
// with XLD_PYTHON if the stable project lives elsewhere.
function getLocalPython() {
  return firstExisting([
    process.env.XLD_PYTHON,
    'D:\\Program Files\\xin-local-deck\\analysis\\.venv\\Scripts\\python.exe',
    path.join(ANALYSIS_RUNTIME_ROOT, 'analysis', '.venv', 'Scripts', 'python.exe')
  ]);
}

// AI engines run in the beta's own isolated venv (analysis-ai/.venv), created by
// setup-ai.ps1. Override with XLD_AI_PYTHON.
function getAiPython() {
  return firstExisting([
    process.env.XLD_AI_PYTHON,
    path.join(ANALYSIS_RUNTIME_ROOT, 'analysis-ai', '.venv', 'Scripts', 'python.exe')
  ]);
}

// Harmony analysis is CPU-only and reuses an existing lightweight scientific
// Python runtime.  No second Torch/TensorFlow stack is installed.
function getHarmonyPython() {
  return firstExisting([
    process.env.XLD_HARMONY_PYTHON,
    getAiPython(),
    getLocalPython()
  ]);
}

async function loadAnalysis(trackId, engine = null) {
  const track = trackIndex.get(trackId);
  if (!track) return engine ? null : [];
  const directory = analysisDirectoryForTrack(track);
  if (engine) {
    const filename = resultFileName(engine);
    if (!filename) return null;
    try { return JSON.parse(await fs.readFile(path.join(directory, filename), 'utf8')); } catch (_) { return null; }
  }
  try {
    const files = (await fs.readdir(directory)).filter(file => RESULT_ENGINE_IDS.some(id => file === `${id}.json`));
    const results = [];
    for (const file of files) {
      try {
        const result = JSON.parse(await fs.readFile(path.join(directory, file), 'utf8'));
        if (result && Array.isArray(result.segments) && result.engine) results.push(result);
      } catch (_) {}
    }
    return results;
  } catch (_) { return []; }
}

async function buildMusicLabManifest(trackId) {
  const track = trackIndex.get(trackId);
  if (!track) return null;
  const analyses = await loadAnalysis(trackId);
  const annotations = await loadAnnotations(trackId);
  const duration = Math.max(
    0,
    ...analyses.map(result => Number(result.duration) || Math.max(0, ...(result.segments || []).map(segment => Number(segment.end) || 0))),
    ...annotations.tags.map(tag => Number(tag.end) || 0)
  );
  const sectionAnalyses = analyses.filter(result => !HARMONY_ENGINE_IDS.includes(result.engine?.id));
  const harmonyAnalyses = analyses.filter(result => HARMONY_ENGINE_IDS.includes(result.engine?.id));
  const normalizeTimeline = result => ({
    engine: result.engine,
    duration: Number(result.duration) || duration,
    analyzedRanges: Array.isArray(result.analyzedRanges) ? result.analyzedRanges : null,
    metrics: result.metrics || null,
    segments: (result.segments || []).map(segment => ({
      start: Number(segment.start) || 0,
      end: Number(segment.end) || 0,
      label: String(segment.label ?? '?'),
      confidence: Number.isFinite(Number(segment.confidence)) ? Number(segment.confidence) : null
    }))
  });
  return {
    schemaVersion: 2,
    contract: 'xld.music-lab/2',
    producer: { name: "Xin's Local Deck Beta", version: app.getVersion() },
    generatedAt: new Date().toISOString(),
    timing: { unit: 'seconds', origin: 0, duration },
    track: {
      id: track.id,
      number: track.number,
      title: track.title,
      artist: track.artist,
      album: track.album,
      source: track.filePath
    },
    analyses: sectionAnalyses.map(normalizeTimeline),
    harmony: harmonyAnalyses.map(normalizeTimeline),
    manualTags: annotations.tags.map(tag => ({ ...tag }))
  };
}

async function writeMusicLabBridge(trackId) {
  const track = trackIndex.get(trackId);
  if (!track) return { ok: false, error: 'unknown-track' };
  const manifest = await buildMusicLabManifest(trackId);
  const target = musicLabPath(track);
  await writeTrackMetadata(track, analysisDirectoryForTrack(track));
  await writeJsonAtomic(target, manifest);
  return { ok: true, path: target, manifest };
}

async function upsertAnnotation(trackId, input) {
  if (analysisService.task()?.trackId === trackId) return { ok: false, error: 'analysis-busy' };
  const document = await loadAnnotations(trackId);
  if (!trackIndex.has(trackId)) return { ok: false, error: 'unknown-track' };
  const index = document.tags.findIndex(tag => tag.id === input?.id);
  let tag;
  try { tag = cleanAnnotation(input, index >= 0 ? document.tags[index] : null); }
  catch (error) { return { ok: false, error: error.message }; }
  if (index >= 0) document.tags[index] = tag; else document.tags.push(tag);
  const saved = await saveAnnotations(trackId, document.tags);
  let integrationWarning = null;
  try { await writeMusicLabBridge(trackId); } catch (error) { integrationWarning = error.message; }
  return { ok: true, tag, document: saved, integrationWarning };
}

async function deleteAnnotation(trackId, tagId) {
  if (analysisService.task()?.trackId === trackId) return { ok: false, error: 'analysis-busy' };
  const document = await loadAnnotations(trackId);
  if (!trackIndex.has(trackId)) return { ok: false, error: 'unknown-track' };
  const tags = document.tags.filter(tag => tag.id !== tagId);
  if (tags.length === document.tags.length) return { ok: false, error: 'unknown-tag' };
  const saved = await saveAnnotations(trackId, tags);
  let integrationWarning = null;
  try { await writeMusicLabBridge(trackId); } catch (error) { integrationWarning = error.message; }
  return { ok: true, document: saved, integrationWarning };
}

async function deleteAnalysisResult(trackId, engine = null) {
  if (analysisService.task()?.trackId === trackId) return { ok: false, error: 'analysis-busy' };
  const track = trackIndex.get(trackId);
  if (!track) return { ok: false, error: 'unknown-track' };
  const engines = engine === 'all' ? RESULT_ENGINE_IDS
    : engine === 'section-all' ? SECTION_ENGINE_IDS
      : engine === 'harmony-all' ? HARMONY_ENGINE_IDS
        : isResultEngine(engine) ? [engine] : [];
  if (!engines.length) return { ok: false, error: 'unknown-engine' };
  const directory = analysisDirectoryForTrack(track);
  const deleted = [];
  let files = [];
  try { files = await fs.readdir(directory); } catch (_) {}
  for (const id of engines) {
    const prefixes = [`${id}.json`, `${id}.error.json`, `${id}.cancelled.json`];
    for (const file of files.filter(name => prefixes.includes(name) || name.startsWith(`${id}.next.`))) {
      try { await fs.rm(path.join(directory, file), { force: true }); deleted.push(file); } catch (_) {}
    }
  }
  let integrationWarning = null;
  try { await writeMusicLabBridge(trackId); } catch (error) { integrationWarning = error.message; }
  return { ok: true, deleted, integrationWarning };
}

async function analysisSummary() {
  const summary = {};
  for (const [trackId, track] of trackIndex) {
    const engines = {};
    const directory = analysisDirectoryForTrack(track);
    let files;
    try { files = await fs.readdir(directory); } catch (_) { continue; }
    for (const id of RESULT_ENGINE_IDS) {
      if (files.includes(`${id}.json`)) engines[id] = { status: 'complete' };
      else if (files.includes(`${id}.error.json`)) engines[id] = { status: 'failed' };
      else if (files.includes(`${id}.cancelled.json`)) engines[id] = { status: 'cancelled' };
    }
    if (Object.keys(engines).length) summary[trackId] = engines;
  }
  const activeAnalysis = analysisService.task();
  if (activeAnalysis) {
    summary[activeAnalysis.trackId] ||= {};
    summary[activeAnalysis.trackId][activeAnalysis.engine] = { status: 'running', progress: activeAnalysis.progress };
  }
  return summary;
}

// Tolerant of stray stdout (warnings, first-run banners) around the JSON array.
function parseEngineList(text) {
  try { return JSON.parse(text); } catch (_) {}
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start >= 0 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch (_) {}
  }
  return [];
}

function probeEngines(python, runner) {
  return new Promise(resolve => {
    if (!python) { resolve(null); return; }
    const child = spawn(python, [runner, '--engines'], { windowsHide: true });
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.on('close', () => resolve(parseEngineList(stdout)));
    child.on('error', () => resolve([]));
  });
}

function probeSeparationModes() {
  return new Promise(resolve => {
    const python = getHarmonyPython();
    const runner = path.join(ANALYSIS_RUNTIME_ROOT, 'analysis-harmony', 'harmony_runner.py');
    if (!python) { resolve(['none']); return; }
    const child = spawn(python, [runner, '--separation-modes'], { windowsHide: true });
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.on('close', () => {
      try {
        const modes = JSON.parse(stdout.trim().split(/\r?\n/).pop());
        resolve(Array.isArray(modes) && modes.length ? modes : ['none']);
      } catch (_) { resolve(['none']); }
    });
    child.on('error', () => resolve(['none']));
  });
}

const msafUnavailable = () => MSAF_ENGINE_IDS.map(id => ({
  id,
  name: id === 'msaf' ? 'MSAF · Spectral' : `MSAF · ${id.slice(5).toUpperCase()}`,
  available: false,
  family: 'msaf',
  status: 'MSAF 运行时未安装'
}));

const aiUnavailable = () => AI_ENGINE_IDS.map(id => ({
  id,
  name: id === 'songformer' ? 'SongFormer · AI' : id,
  available: false,
  family: 'ai',
  status: 'AI 运行时未安装 · 请运行 setup-ai.ps1'
}));

const harmonyUnavailable = () => HARMONY_ENGINE_IDS.map(id => ({
  id,
  name: id === 'chord-cqt' ? 'Librosa · CQT / HMM'
    : id === 'chord-cens' ? 'Librosa · CENS / HMM' : 'Hybrid · Bass + Extended',
  available: false,
  family: 'harmony',
  resource: id === 'chord-hybrid' ? 'CPU MEDIUM' : 'CPU LIGHT',
  status: 'Harmony 运行时缺少 Librosa'
}));

// MSAF engines first, AI engines after — so the AI lane renders alongside the
// four MSAF lanes. Each family runs in its own Python environment.
async function detectEngines() {
  const msafRunner = path.join(ANALYSIS_RUNTIME_ROOT, 'analysis', 'runner.py');
  const aiRunner = path.join(ANALYSIS_RUNTIME_ROOT, 'analysis-ai', 'songformer_runner.py');
  const harmonyRunner = path.join(ANALYSIS_RUNTIME_ROOT, 'analysis-harmony', 'harmony_runner.py');
  const [msaf, ai, harmony] = await Promise.all([
    probeEngines(getLocalPython(), msafRunner),
    probeEngines(getAiPython(), aiRunner),
    probeEngines(getHarmonyPython(), harmonyRunner)
  ]);
  const msafList = Array.isArray(msaf) && msaf.length ? msaf : msafUnavailable();
  const aiList = Array.isArray(ai) && ai.length ? ai : aiUnavailable();
  const harmonyList = Array.isArray(harmony) && harmony.length ? harmony : harmonyUnavailable();
  return [...msafList, ...aiList, ...harmonyList];
}

function taskSnapshot() { return analysisService.task(); }
function broadcastTask(task) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('analysis:task', task);
}

async function writeErrorRecord(task, detail) {
  const track = trackIndex.get(task.trackId);
  if (!track) return;
  const directory = analysisDirectoryForTrack(track);
  await writeTrackMetadata(track, directory);
  const suffix = task.status === 'cancelled' ? '.cancelled.json' : '.error.json';
  const errorPath = path.join(directory, `${safeName(task.engine)}${suffix}`);
  const record = {
    schemaVersion: 1,
    taskId: task.taskId,
    engine: task.engine,
    status: task.status,
    message: detail,
    startedAt: task.startedAt,
    finishedAt: new Date().toISOString()
  };
  await fs.writeFile(errorPath, JSON.stringify(record, null, 2), 'utf8');
}

let midiSourceChanging=false;
const storageManager=require('../core/storage.cjs').createStorage({getRoot:analysisRoot,isBusy:()=>Boolean(analysisService.task()||midiSourceChanging),trash:directory=>shell.trashItem(directory)});

async function executeAnalysis(trackId, engine, options = {}) {
  if(storageManager.busy()||midiSourceChanging)return {ok:false,error:"存储管理正在操作文件，请稍后重试"};
  const track = trackIndex.get(String(trackId || ''));
  if (!track) return {ok:false,error:'unknown-track'};
  if (analysisService.task()) return {ok:false,error:'analysis-busy',task:analysisService.task()};
  analysisService.setAnalysisRoot(analysisRoot());
  const response = await analysisService.run(track, engine, options, broadcastTask);
  // Keep the existing XLD result/error badges and bridge export behavior.
  if (response.task && isResultEngine(engine)) {
    if (response.ok) {
      const directory=analysisDirectoryForTrack(track);
      for (const suffix of ['.error.json','.cancelled.json']) await fs.rm(path.join(directory,engine+suffix),{force:true}).catch(()=>{});
    } else await writeErrorRecord(response.task,response.detail || response.error).catch(()=>{});
  }
  return response;
}

async function runAnalysis(_event, trackId, engine, range = null, auto = false, separation = 'none') {
  const sep = HARMONY_ENGINE_IDS.includes(engine) && ['hpss','demucs'].includes(separation) ? separation : 'none';
  return executeAnalysis(trackId,engine,{range,auto,separation:sep});
}

async function cancelAnalysis(taskId) {
  const task=analysisService.task();
  if (!task || (taskId && task.taskId !== taskId)) return {ok:false,error:'no-matching-task'};
  return analysisService.cancel();
}

app.whenReady().then(async () => {
  if(!ownsWindow)return;
  await readSettings();
  ipcMain.handle('locale:get-host', () => mainLocale.getState());
  ipcMain.handle('locale:set-renderer', (_event, payload) => {
    try { return { ok: true, ...mainLocale.setRendererLocale(payload?.locale) }; }
    catch (error) { return { ok: false, error: error?.message || 'invalid-locale' }; }
  });
  ipcMain.handle('locale:clear-host', () => {
    const state = mainLocale.clearHostLocale();
    publishHostLocale();
    return { ok: true, ...state };
  });
  ipcMain.handle('library:scan', scanLibrary);
  ipcMain.handle('library:choose', async () => {
    const result = await dialog.showOpenDialog({ title: mainLocale.message('dialog.library.chooseTitle'), defaultPath: libraryRoot, properties: ['openDirectory'] });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    libraryRoot = result.filePaths[0];
    await writeSettings();
    return scanLibrary();
  });
  ipcMain.handle('library:reveal-track', (_event, trackId) => {
    const track = trackIndex.get(trackId);
    if (!track) return false;
    shell.showItemInFolder(track.filePath);
    return true;
  });
  ipcMain.handle('library:consume-open-request', async () => {
    const request=await consumeRequest(analysisRoot());
    if(!request)return {trackId:null};
    const requestedLocale=normalizeLocale(request.locale);
    if(requestedLocale){mainLocale.setHostLocale(requestedLocale);publishHostLocale();}
    const match=[...trackIndex.values()].find(track=>path.resolve(track.filePath).toLowerCase()===path.resolve(request.source).toLowerCase());
    return {trackId:match?.id || null,source:request.source};
  });
  ipcMain.handle('assets:merge-midi', (_event, payload) => executeAnalysis(payload?.trackId,'midi-merge'));
  ipcMain.handle('assets:open-merged-midi', async (_event, payload) => {
    const track=trackIndex.get(String(payload?.trackId || ''));
    if(!track)return {ok:false,error:'track-missing'};
    analysisService.setAnalysisRoot(analysisRoot());
    const result=await analysisService.readMidiMerge(track);
    if(!result.ok)return result;
    const error=await shell.openPath(payload.folder===true ? result.directory : result.file);
    return {ok:!error,error:error || null};
  });
  ipcMain.handle('assets:separation-engines', () => analysisService.separationEngines());
  ipcMain.handle('refinement:engines',()=>analysisService.refinementEngines());
  ipcMain.handle('refinement:run',(_event,payload)=>{
    if(!require('../core/refinement.cjs').profileFor(payload?.engine))return {ok:false,error:'refinement-engine-invalid'};
    return executeAnalysis(payload.trackId,payload.engine,{scope:payload.scope,start:payload.start,duration:30,sourceStem:payload.sourceStem,target:payload.target,device:payload.device});
  });
  for(const operation of ['read','keep','reveal'])ipcMain.handle('refinement:'+operation,async(_event,payload)=>{
    const track=trackIndex.get(String(payload?.trackId||''));if(!track)return {ok:false,error:'track-missing'};
    analysisService.setAnalysisRoot(analysisRoot());
    const options={scope:payload.scope,engine:payload.engine,start:payload.start,duration:30,sourceStem:payload.sourceStem,target:payload.target,device:payload.device,runId:payload.runId};
    try {
      const result=await (operation==='keep'?analysisService.keepRefinement(track,options):analysisService.readRefinement(track,options));
      if(operation==='reveal'&&result.ok){const error=await shell.openPath(result.directory);return {ok:!error,error:error||null};}
      return result;
    }catch(error){return {ok:false,error:error.message};}
  });
  ipcMain.handle('assets:strings-source',async(_event,payload)=>{
    if(analysisService.task()||storageManager.busy()||midiSourceChanging)return {ok:false,error:'analysis-busy'};
    const track=trackIndex.get(String(payload?.trackId||''));if(!track)return {ok:false,error:'track-missing'};
    midiSourceChanging=true;
    try{return await derivedAssets.stringSources.select(track,payload.selection);}catch(error){return {ok:false,error:error.message};}finally{midiSourceChanging=false;}
  });
  ipcMain.handle('assets:delete-midi',async(_event,payload)=>{
    if(analysisService.task()||storageManager.busy()||midiSourceChanging)return {ok:false,error:'analysis-busy'};
    const track=trackIndex.get(String(payload?.trackId||''));if(!track)return {ok:false,error:'track-missing'};
    midiSourceChanging=true;
    try{
      const manager=require('../core/midi-delete.cjs').createMidiDeletion({assets:derivedAssets,getRoot:analysisRoot,trash:directory=>shell.trashItem(directory)});
      return await manager.clear(track,payload,async plan=>{
        const english=mainLocale.getState().locale==='en-US';
        const fallback=plan.fallback?require('../core/derived-assets.cjs').profileFor(plan.fallback.engine).name:null;
        const response=await dialog.showMessageBox(mainWindow,{type:'question',title:english?'Delete generated MIDI':'删除生成的 MIDI',
          message:plan.track+' · '+plan.stem+' · '+plan.model,
          detail:(english?'Move this MIDI and its note data to the Recycle Bin. Original audio and other model results are kept.':'将这份 MIDI 与音符数据移至回收站，保留原曲、WAV 和其他模型结果。')+'\n'+
            (fallback?(english?'Then use the cached '+fallback+' result.':'随后启用已生成的 '+fallback+' 结果。'):plan.active?(english?'This part will need a new or selected MIDI result.':'该声部随后需要重新生成或启用其他 MIDI。'):'')+'\n'+
            (english?'Existing merged files are kept; regenerate the merge if its inputs change.':'已有融合文件保留；参与融合的结果改变后需重新融合。'),
          buttons:english?['Cancel','Move to Recycle Bin']:['取消','移至回收站'],defaultId:0,cancelId:0,noLink:true});
        return response.response===1;
      });
    }catch(error){return {ok:false,error:error.message};}finally{midiSourceChanging=false;}
  });
  ipcMain.handle('assets:midi-engines', () => analysisService.midiEngines());
  ipcMain.handle('assets:run', (_event, payload) => {
    if (!['stems','midi'].includes(payload?.kind)) return {ok:false,error:'asset-kind-invalid'};
    const midiCore = require('../core/derived-assets.cjs');
    const engine = payload.kind==='stems'?(payload.engine || midiCore.defaultSeparation):(payload.engine || midiCore.defaultEngine(payload.stem));
    if(payload.kind==='stems' && !midiCore.separationProfile(engine)) return {ok:false,error:'stems-engine-unsupported'};
    if(payload.kind==='midi' && !midiCore.profileFor(engine)?.stems.includes(payload.stem)) return {ok:false,error:'midi-engine-unsupported'};
    return executeAnalysis(payload.trackId,engine,{
      stem:payload.stem,force:payload.force===true
    });
  });
  ipcMain.handle('assets:read', async (_event, payload) => {
    const track = trackIndex.get(String(payload?.trackId || ''));
    if (!track) return {ok: false, error: 'track-missing', stems: [], midi: {}};
    const stems = await derivedAssets.readStems(track);
    const strings=await derivedAssets.stringSources.list(track);
    const midi = {};
    if (stems.ok || strings.active) for (const name of require('../core/derived-assets.cjs').STEMS) midi[name] = await derivedAssets.readMidi(track, name);
    const variants = {};
    if (stems.ok || strings.active) for (const name of require('../core/derived-assets.cjs').STEMS) {
      variants[name] = {};
      for (const model of require('../core/derived-assets.cjs').PROFILES.filter(model=>model.stems.includes(name)))
        variants[name][model.id] = await derivedAssets.readMidi(track, name, model.id);
    }
    const stemVariants = {};
    for(const profile of require('../core/derived-assets.cjs').SEPARATION_PROFILES) stemVariants[profile.id] = await derivedAssets.readStems(track, profile.id);
    analysisService.setAnalysisRoot(analysisRoot());
    const merged=await analysisService.readMidiMerge(track);
    const midiInputs=Object.fromEntries((stems.ok?stems.stems:[]).filter(item=>require('../core/derived-assets.cjs').STEMS.includes(item.name)).map(item=>[item.name,{runId:stems.runId,audioUrl:item.audioUrl}]));
    if(strings.active)midiInputs.strings=strings.active;
    const midiSourceKey=JSON.stringify([stems.ok?stems.runId:null,strings.active?.runId||null]);
    return {...stems, midi, variants, stemVariants, merged,strings,midiInputs,midiSourceKey};
  });
  ipcMain.handle('assets:reveal', async (_event, payload) => {
    const track = trackIndex.get(String(payload?.trackId || ''));
    if (!track) return {ok: false, error: 'track-missing'};
    const result = payload?.kind === 'midi-all' ? await derivedAssets.readMidiDirectory(track) : payload?.kind === 'midi' ? await derivedAssets.readMidi(track, payload?.stem, payload?.engine || null) : await derivedAssets.readStems(track);
    if (!result.ok) return result;
    const error = await shell.openPath(result.directory);
    return {ok: !error, error: error || null};
  });
  ipcMain.handle('analysis:engines', detectEngines);
  ipcMain.handle('analysis:separation-modes', probeSeparationModes);
  ipcMain.handle('analysis:load', (_event, payload) => loadAnalysis(payload.trackId, payload.engine));
  ipcMain.handle('analysis:summary', analysisSummary);
  ipcMain.handle('analysis:delete-result', (_event, payload) => deleteAnalysisResult(payload.trackId, payload.engine));
  ipcMain.handle('analysis:task:get', () => taskSnapshot());
  ipcMain.handle('analysis:run', (event, payload) => runAnalysis(event, payload.trackId, payload.engine, payload.range || null, Boolean(payload.auto), payload.separation || 'none'));
  ipcMain.handle('analysis:cancel', (_event, payload) => cancelAnalysis(payload?.taskId));
  const storageReply=fn=>async(_event,payload)=>{try{return await fn(payload);}catch(error){return {ok:false,error:error.message};}};
  ipcMain.handle('storage:scan',storageReply(async()=>({ok:true,...await storageManager.scan()})));
  ipcMain.handle('storage:keep',storageReply(payload=>{if(typeof payload?.value!=='boolean')throw Error('storage-options-invalid');return storageManager.protect(payload.item,payload.value);}));
  ipcMain.handle('storage:reveal',storageReply(async payload=>{const error=await shell.openPath(await storageManager.reveal(payload.item));return {ok:!error,error};}));
  ipcMain.handle('storage:clear',storageReply(payload=>storageManager.clear(payload?.items,payload?.mode,async plan=>{
   const permanent=plan.mode==='permanent',english=mainLocale.getState()?.locale==='en-US';
   const size=(plan.bytes/1024**3).toFixed(2)+' GiB';
   const result=await dialog.showMessageBox(mainWindow,{type:'warning',buttons:english?['Cancel',permanent?'Delete permanently':'Move to Recycle Bin']:['取消',permanent?'永久删除':'移至回收站'],defaultId:0,cancelId:0,noLink:true,
    title:english?'Storage cleanup':'清理分析音频',message:english?plan.rows.length+' results · '+size:plan.rows.length+' 项结果 · '+size,
    detail:(permanent?(english?'Permanently delete the selected generated audio. This cannot be undone.':'将永久删除所选生成音频，无法撤销。'):(english?'Disk space is freed after emptying the Recycle Bin.':'先移至回收站；清空回收站后才会释放磁盘空间。'))+'\n'+(english?'Original songs, MIDI and annotations are kept.':'原曲、MIDI 与人工标注保留。')+'\n\n'+plan.rows.slice(0,12).map(row=>row.track+' · '+row.engine+' · '+(row.target||'六轨')+' · '+(row.bytes/1024**2).toFixed(0)+' MiB').join('\n')+(plan.rows.length>12?'\n…':'')});return result.response===1;
  })));
  ipcMain.handle('analysis:settings', () => ({ analysisRoot: analysisRoot(), libraryRoot }));
  ipcMain.handle('analysis:choose-root', async () => {
    if (analysisService.task()||storageManager.busy()||midiSourceChanging) return {canceled:true,error:'analysis-busy',analysisRoot:analysisRoot()};
    const result = await dialog.showOpenDialog({ title: mainLocale.message('dialog.analysis.chooseTitle'), defaultPath: analysisRoot(), properties: ['openDirectory', 'createDirectory'] });
    if (result.canceled || !result.filePaths[0]) return { canceled: true, analysisRoot: analysisRoot() };
    analysisRootPath = result.filePaths[0];
    await fs.mkdir(analysisRoot(), { recursive: true });
    await writeSettings();
    return { canceled: false, analysisRoot: analysisRoot() };
  });
  ipcMain.handle('analysis:open-root', async () => {
    await fs.mkdir(analysisRoot(), { recursive: true });
    return shell.openPath(analysisRoot());
  });
  ipcMain.handle('annotations:load', (_event, payload) => loadAnnotations(payload.trackId));
  ipcMain.handle('annotations:upsert', (_event, payload) => upsertAnnotation(payload.trackId, payload.tag));
  ipcMain.handle('annotations:delete', (_event, payload) => deleteAnnotation(payload.trackId, payload.tagId));
  ipcMain.handle('integration:manifest', (_event, payload) => buildMusicLabManifest(payload.trackId));
  ipcMain.handle('integration:export', (_event, payload) => writeMusicLabBridge(payload.trackId));
  mainWindow = createWindow();
});

app.on('before-quit', () => {
  analysisService.cancel();
});
app.on('window-all-closed', () => app.quit());
