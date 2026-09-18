'use strict';

const dom = Object.fromEntries([
  'librarySummary','rescanButton','chooseLibraryButton','albumCount','searchInput','albumGrid','emptyState','albumView',
  'albumCover','coverFallback','albumTitle','albumArtist','albumTrackCount','playAlbumButton','shuffleAlbumButton','batchAlbumButton','trackList',
  'analysisState','analysisRootLabel','openAnalysisRootButton','chooseAnalysisRootButton','analysisTargetTitle','analysisTargetMeta',
  'labEyebrow','labTitle','labNote','harmonyPolicy','separationToggle','separationToggleRow',
  'engineList','segmentPanel','segmentHint','segStart','segEnd','segAnalyzeButton','segAutoButton','segmentStatus','analyzeButton','analyzeAllButton','cancelAnalysisButton','taskCard','taskKicker','taskTitle','taskPercent','taskProgressBar',
  'taskEngine','taskMessage','taskElapsed','taskRemaining','comparisonTitle','comparisonHint','comparisonTimeline','currentSegmentDetail','analysisLog',
  'timelineZoomOutButton','timelineZoomLabel','timelineZoomInButton','timelineFitButton','fontDecreaseButton','fontScaleLabel','fontIncreaseButton',
  'deleteAnalysisButton','deleteAllAnalysisButton','exportMusicLabButton','integrationStatus',
  'manualTagPanel','tagStart','tagEnd','tagLabel','tagNote','tagUseCurrentButton','tagUseSegmentButton','saveTagButton','clearTagButton','manualTagList',
  'playerCover','miniFallback','nowTitle','nowArtist','shuffleButton','previousButton','playButton','nextButton','repeatButton',
  'currentTime','seekBar','durationTime','revealButton','volumeBar','audioElement'
].map(id => [id, document.getElementById(id)]));

const runtimeLocale = window.XLDRuntimeMessages.createRuntimeTranslator(window.xinXldLocale);
const rt = (key, params) => runtimeLocale.t(key, params);
const runtimeRef = (key, params) => Object.freeze({ __xldI18nKey: key, params: params || {} });
const resolveRuntimeParams = params => Object.fromEntries(Object.entries(params || {}).map(([key, value]) => [
  key,
  value && value.__xldI18nKey ? rt(value.__xldI18nKey, resolveRuntimeParams(value.params)) : value
]));
const runtimeError = value => value || rt('runtime.common.unknownError');
const labTerm = lab => rt(lab === 'harmony' ? 'runtime.comparison.term.harmony' : 'runtime.comparison.term.section');

const state = {
  library: null,
  settings: null,
  selectedAlbum: null,
  selectedTrack: null,
  currentTrack: null,
  queue: [],
  queueIndex: -1,
  engines: [],
  selectedEngine: null,
  activeLab: 'section',
  selectedEngineByLab: { section: null, harmony: null },
  separation: 'none',
  separationModes: ['none'],
  analysisResults: new Map(),
  analysisSummary: {},
  annotations: [],
  editingTagId: null,
  selectedSegment: null,
  activeTask: null,
  lastTaskLogKey: '',
  batchRunning: false,
  batchCancelled: false,
  batchIndex: 0,
  batchTotal: 0,
  timelineZoom: 1,
  timelineSeeking: false,
  fontScale: 1,
  shuffle: false,
  repeat: 'off',
  seeking: false,
  lastTask: null,
  libraryView: { kind: 'scanning' },
  segmentMessage: { key: 'runtime.segment.help', params: {} },
  integrationMessage: { key: 'runtime.integration.notExported', params: {} },
  analysisLogs: [],
  bootstrapped: false
};

let playbackSequence = 0, cancelPendingMetadata = null;
let workspaceControls = null;
let refinementControls = null;
const derivedControls = window.XldDerivedControls.create({
  bridge: window.XLD, audio: dom.audioElement, getSelected: () => state.selectedTrack,
  getCurrent: () => state.currentTrack, queueFor: track => albumForTrack(track)?.tracks || [],
  playTrack, rt, localizeError: runtimeLocale.localizeBackendMessage, onPlaybackChange: renderNowPlayingCopy,
  getBusy: () => Boolean(state.activeTask || state.batchRunning), onTask: applyTask,
  onChange: () => {workspaceControls?.render();refinementControls?.update();},
  isBatchCancelled: () => state.batchCancelled,
  onBatchState: ({running,index,total,reset}) => {
    if(reset)state.batchCancelled=false;
    state.batchRunning=running;state.batchIndex=index;state.batchTotal=total;
    updateAnalyzeButton();
  }
});
derivedControls.reset();
window.XldStorageControls.create({bridge:window.XLD,getBusy:()=>Boolean(state.activeTask||state.batchRunning),beforeClear:()=>{for(const player of document.querySelectorAll('audio'))player.pause();},onChanged:async()=>{await derivedControls.refresh();await refinementControls?.refresh();await refreshAnalysisSummary();}});
refinementControls=window.XldRefinementControls.create({bridge:window.XLD,getSelected:()=>state.selectedTrack,getCurrent:()=>state.currentTrack,getDerived:()=>derivedControls.snapshot(),getTask:()=>state.activeTask,getBusy:()=>Boolean(state.activeTask||state.batchRunning),audio:dom.audioElement,rt,onTask:applyTask});

const segmentColors = ['#8f7cff','#5cc9b3','#df72aa','#ddbd62','#6ba0dc','#a97fd2','#df896f','#79b877','#c1a0ff'];
const engineShortNames = { msaf: 'SC', 'msaf-sf': 'SF', 'msaf-foote': 'FT', 'msaf-cnmf': 'CN', songformer: 'AI' };
// SongFormer emits functional labels; give the common ones a stable semantic
// colour. MSAF's abstract A/B/C labels won't match these keys and keep using
// the hashed palette below.
const functionLabelColors = {
  intro: '#5cc9b3', verse: '#6ba0dc', chorus: '#df72aa', 'pre-chorus': '#c98fd0',
  bridge: '#a97fd2', inst: '#ddbd62', solo: '#df896f', break: '#8f9bb3',
  outro: '#79b877', silence: '#5b6172', start: '#5b6172', end: '#5b6172'
};
const MSAF_ENGINE_IDS = ['msaf', 'msaf-sf', 'msaf-foote', 'msaf-cnmf'];
const AI_ENGINE_IDS = ['songformer'];
const HARMONY_ENGINE_IDS = ['chord-cqt', 'chord-cens', 'chord-hybrid', 'chord-btc'];
const SECTION_ENGINE_IDS = [...MSAF_ENGINE_IDS, ...AI_ENGINE_IDS];
const KNOWN_ENGINE_IDS = [...SECTION_ENGINE_IDS, ...HARMONY_ENGINE_IDS];
Object.assign(engineShortNames, { 'chord-cqt': 'CQ', 'chord-cens': 'CE', 'chord-hybrid': 'HX' });
const chordRootColors = {
  C: '#e76f8f', 'C#': '#ef8a6f', D: '#e9b45f', Eb: '#c6ca62', E: '#8dcc70', F: '#65c795',
  'F#': '#56c5bf', G: '#5aa9df', Ab: '#7c8fe0', A: '#9a79df', Bb: '#be72cf', B: '#dc73b0', N: '#555b69'
};
const UI_SCALES = [.94, 1, 1.06, 1.12];
const FONT_BASE_SCALE = 1.2; // 默认字号基线 +20%（A−/A+ 仍在此基线上相对缩放）
const AI_MIN_RANGE_SECONDS = 15;
const AI_RANGE_EPSILON_SECONDS = 1.25;

function formatTime(seconds) {
  if (!Number.isFinite(Number(seconds)) || Number(seconds) < 0) return '0:00';
  const value = Math.floor(Number(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

function formatPreciseTime(seconds) {
  if (!Number.isFinite(Number(seconds)) || Number(seconds) < 0) return '0:00.000';
  const value = Number(seconds);
  const minutes = Math.floor(value / 60);
  const remainder = value - minutes * 60;
  return `${minutes}:${remainder.toFixed(3).padStart(6, '0')}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function isHarmonyEngineId(engineId) {
  return HARMONY_ENGINE_IDS.includes(String(engineId || ''));
}

function enginesForLab(lab = state.activeLab) {
  const ids = lab === 'harmony' ? HARMONY_ENGINE_IDS : SECTION_ENGINE_IDS;
  return state.engines.filter(engine => ids.includes(engine.id));
}

function setActiveLab(lab) {
  if (!['section', 'harmony'].includes(lab)) return;
  if (state.selectedEngine) state.selectedEngineByLab[state.activeLab] = state.selectedEngine;
  state.activeLab = lab;
  const remembered = state.selectedEngineByLab[lab];
  const candidates = enginesForLab(lab);
  state.selectedEngine = candidates.some(engine => engine.id === remembered)
    ? remembered
    : candidates.find(engine => engine.available || state.analysisResults.has(engine.id))?.id || null;
  state.selectedEngineByLab[lab] = state.selectedEngine;
  for (const button of document.querySelectorAll('[data-lab]')) button.classList.toggle('active', button.dataset.lab === lab);
  const harmony = lab === 'harmony';
  renderLabCopy();
  dom.harmonyPolicy.classList.toggle('hidden', !harmony);
  dom.segmentPanel.classList.toggle('lab-hidden', harmony);
  dom.manualTagPanel.classList.toggle('hidden', harmony);
  state.selectedSegment = null;
  renderEngines();
  renderComparison();
  updateAnalyzeButton();
  updateResultActions();
}

function renderLabCopy() {
  const suffix = state.activeLab === 'harmony' ? 'harmony' : 'section';
  dom.labEyebrow.textContent = rt(`runtime.lab.eyebrow.${suffix}`);
  dom.labTitle.textContent = rt(`runtime.lab.title.${suffix}`);
  dom.labNote.textContent = rt(`runtime.lab.note.${suffix}`);
  dom.comparisonHint.textContent = rt(`runtime.lab.hint.${suffix}`);
}

const transportIcons = {
  shuffle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h3.4c3.6 0 5.2 10 9.2 10H20m-3-3 3 3-3 3M4 17h3.4c1.5 0 2.7-1.8 3.8-3.8M15.8 8.7c.4-1 1-1.7 1.8-1.7H20m-3-3 3 3-3 3"/></svg>',
  previous: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5v14M18 6l-9 6 9 6z"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="fill" d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="fill" d="M7 5h4v14H7zM14 5h4v14h-4z"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 5v14M6 6l9 6-9 6z"/></svg>',
  repeat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 3l3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3m13-2v2a3 3 0 0 1-3 3H4"/></svg>',
  repeatOne: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 3l3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3m13-2v2a3 3 0 0 1-3 3H4"/><path d="M12 10v5m-2-3 2-2"/></svg>'
};

function setTransportIcon(button, icon) {
  if (button) button.innerHTML = transportIcons[icon] || '';
}

function renderRepeatTitle() {
  const modeKey = state.repeat === 'all' ? 'runtime.repeat.all' : state.repeat === 'one' ? 'runtime.repeat.one' : 'runtime.repeat.off';
  dom.repeatButton.title = rt('runtime.repeat.title', { mode: rt(modeKey) });
}

function applyFontScale(scale) {
  const closest = UI_SCALES.reduce((best, value) => Math.abs(value - scale) < Math.abs(best - scale) ? value : best, 1);
  state.fontScale = closest;
  document.documentElement.style.setProperty('--font-scale', String(closest * FONT_BASE_SCALE));
  dom.fontScaleLabel.textContent = `${Math.round(closest * 100)}%`;
  dom.fontDecreaseButton.disabled = closest === UI_SCALES[0];
  dom.fontIncreaseButton.disabled = closest === UI_SCALES.at(-1);
  localStorage.setItem('xld:fontScale', String(closest));
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '';
  return `${(bytes / 1024 / 1024).toFixed(bytes > 100 * 1024 * 1024 ? 0 : 1)} MB`;
}

function setCover(image, fallback, url) {
  if (url) {
    image.src = url;
    image.hidden = false;
    fallback.hidden = true;
  } else {
    image.removeAttribute('src');
    image.hidden = true;
    fallback.hidden = false;
  }
}

function compactPath(value, max = 58) {
  const pathValue = String(value || '');
  if (pathValue.length <= max) return pathValue;
  return `${pathValue.slice(0, 22)}…${pathValue.slice(-(max - 23))}`;
}

function renderAnalysisLogs() {
  dom.analysisLog.innerHTML = '';
  if (!state.analysisLogs.length) {
    const waiting = document.createElement('span');
    waiting.textContent = rt('runtime.log.waiting');
    dom.analysisLog.append(waiting);
    return;
  }
  const locale = runtimeLocale.locale();
  for (const entry of state.analysisLogs) {
    const line = document.createElement('span');
    line.className = 'log-line';
    const message = entry.backend
      ? `${entry.engine} · ${runtimeLocale.localizeBackendMessage(entry.backend)}`
      : entry.key ? rt(entry.key, resolveRuntimeParams(entry.params)) : runtimeLocale.localizeBackendMessage(entry.raw);
    line.textContent = `${entry.at.toLocaleTimeString(locale, { hour12: false })}  ${message}`;
    dom.analysisLog.append(line);
  }
  dom.analysisLog.scrollTop = dom.analysisLog.scrollHeight;
}

function logAnalysis(keyOrRaw, params) {
  state.analysisLogs.push(params === undefined
    ? { raw: String(keyOrRaw || ''), at: new Date() }
    : { key: keyOrRaw, params, at: new Date() });
  if (state.analysisLogs.length > 120) state.analysisLogs.shift();
  renderAnalysisLogs();
}

function logBackendAnalysis(engine, message) {
  state.analysisLogs.push({ engine, backend: String(message || ''), at: new Date() });
  if (state.analysisLogs.length > 120) state.analysisLogs.shift();
  renderAnalysisLogs();
}

function renderNowPlayingCopy() {
  workspaceControls?.render();
  if (state.currentTrack) {
    dom.nowTitle.textContent = state.currentTrack.title;
    const stem = derivedControls.playingStem(state.currentTrack);
    dom.nowArtist.textContent = `${state.currentTrack.artist} · ${state.currentTrack.album}${stem ? ' · ' + stem : ''}`;
  } else {
    dom.nowTitle.textContent = rt('runtime.player.none');
    dom.nowArtist.textContent = rt('runtime.player.choose');
  }
}

function renderLibrarySummary() {
  const view = state.libraryView || { kind: 'scanning' };
  if (view.kind === 'initFailed') {
    dom.librarySummary.textContent = rt('runtime.app.initFailed');
  } else if (view.kind === 'error') {
    dom.librarySummary.textContent = rt('runtime.library.unreadable', {
      root: view.root || rt('runtime.library.unspecified')
    });
  } else if (view.kind === 'ready') {
    dom.librarySummary.textContent = rt('runtime.library.summary', view);
  } else {
    dom.librarySummary.textContent = rt('runtime.library.scanning');
  }
}

function setSegmentStatus(key, params) {
  state.segmentMessage = { key, params: params || {} };
  dom.segmentStatus.textContent = rt(key, params);
}

function renderSegmentStatus() {
  if (state.segmentMessage) {
    dom.segmentStatus.textContent = rt(state.segmentMessage.key, state.segmentMessage.params);
  }
}

function setIntegrationStatus(key, params) {
  state.integrationMessage = { key, params: params || {} };
  dom.integrationStatus.textContent = rt(key, params);
}

function renderIntegrationStatus() {
  if (state.integrationMessage) {
    dom.integrationStatus.textContent = rt(state.integrationMessage.key, state.integrationMessage.params);
  }
}

function albumForTrack(track) {
  return state.library?.albums.find(album => album.tracks.some(candidate => candidate.id === track?.id)) || null;
}

async function refreshLibrary(resultPromise = window.XLD.scanLibrary()) {
  state.libraryView = { kind: 'scanning' };
  renderLibrarySummary();
  const result = await resultPromise;
  if (result?.canceled) return;
  if (!result?.ok) {
    state.libraryView = { kind: 'error', root: result?.root || '' };
    renderLibrarySummary();
    dom.albumGrid.innerHTML = `<p class="analysis-note">${escapeHtml(rt('runtime.library.chooseReadable'))}</p>`;
    return;
  }
  state.library = result;
  if (state.selectedTrack && !result.albums.some(album => album.tracks.some(track => track.id === state.selectedTrack.id))) {
    state.selectedTrack = null;
    state.analysisLoading = false;
    state.analysisResults = new Map(); state.annotations = []; state.selectedSegment = null;
    derivedControls.reset(); renderAnalysisTarget(); renderComparison(); renderManualTags(); updateAnalyzeButton();
    localStorage.removeItem('xld:selectedTrack');
  }
  state.libraryView = { kind: 'ready', albums: result.albumCount, tracks: result.trackCount, root: result.root };
  renderLibrarySummary();
  dom.albumCount.textContent = result.albumCount;
  renderAlbums();
  const previousAlbumId = localStorage.getItem('xld:selectedAlbum');
  selectAlbum(result.albums.find(album => album.id === previousAlbumId) || result.albums[0] || null);
  await refreshAnalysisSummary();
}

function renderAlbums() {
  const query = dom.searchInput.value.trim().toLowerCase();
  const albums = (state.library?.albums || []).filter(album => {
    if (!query) return true;
    return [album.title, album.artist, ...album.tracks.map(track => track.title)].some(value => value.toLowerCase().includes(query));
  });
  dom.albumGrid.innerHTML = '';
  for (const album of albums) {
    const card = document.createElement('article');
    card.className = `album-card${state.selectedAlbum?.id === album.id ? ' active' : ''}`;
    card.dataset.albumId = album.id;
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-pressed', String(state.selectedAlbum?.id === album.id));
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectAlbum(album); }
    });
    const thumb = document.createElement('div');
    thumb.className = 'album-thumb';
    if (album.coverUrl) {
      const img = document.createElement('img');
      img.src = album.coverUrl;
      img.alt = rt('runtime.library.coverAlt', { album: album.title });
      thumb.append(img);
    }
    const title = document.createElement('strong');
    title.textContent = album.title;
    const artist = document.createElement('span');
    artist.textContent = album.artist;
    card.append(thumb, title, artist);
    card.addEventListener('click', () => selectAlbum(album));
    dom.albumGrid.append(card);
  }
}

function selectAlbum(album) {
  state.selectedAlbum = album;
  if (!album) {
    dom.emptyState.classList.remove('hidden');
    dom.albumView.classList.add('hidden');
    workspaceControls?.showLibrary('albums');
    return;
  }
  localStorage.setItem('xld:selectedAlbum', album.id);
  dom.emptyState.classList.add('hidden');
  dom.albumView.classList.remove('hidden');
  setCover(dom.albumCover, dom.coverFallback, album.coverUrl);
  dom.albumTitle.textContent = album.title;
  dom.albumArtist.textContent = album.artist;
  dom.albumTrackCount.textContent = rt('runtime.library.trackCount', { count: album.trackCount });
  renderTracks();
  renderAlbums();
  updateAnalyzeButton();
  workspaceControls?.showLibrary('tracks');
}

function getTrackEngineStatus(trackId, engineId) {
  if (state.activeTask?.trackId === trackId && state.activeTask.engine === engineId) return { status: 'running', progress: state.activeTask.progress };
  return state.analysisSummary?.[trackId]?.[engineId] || null;
}

function renderTrackBadges(track) {
  const wrap = document.createElement('div');
  wrap.className = 'track-analysis-badges';
  for (const engine of state.engines.filter(item => !isHarmonyEngineId(item.id) && (item.available || getTrackEngineStatus(track.id, item.id)))) {
    const status = getTrackEngineStatus(track.id, engine.id);
    if (!status) continue;
    const badge = document.createElement('span');
    badge.className = `track-analysis-badge ${status.status}`;
    const short = engineShortNames[engine.id] || engine.name.slice(0, 3).toUpperCase();
    badge.textContent = status.status === 'running'
      ? `${short} ${Math.round((status.progress || 0) * 100)}%`
      : status.status === 'failed' ? `${short} ×`
        : status.status === 'cancelled' ? `${short} —` : `${short} ✓`;
    const statusKey = ['complete', 'failed', 'cancelled'].includes(status.status) ? status.status : 'running';
    badge.title = rt('runtime.track.badgeTitle', { engine: engine.name, status: rt(`runtime.track.status.${statusKey}`) });
    wrap.append(badge);
  }
  const harmonyStatuses = HARMONY_ENGINE_IDS
    .map(id => ({ id, status: getTrackEngineStatus(track.id, id) }))
    .filter(item => item.status);
  if (harmonyStatuses.length) {
    const running = harmonyStatuses.find(item => item.status.status === 'running');
    const completed = harmonyStatuses.filter(item => item.status.status === 'complete').length;
    const failed = harmonyStatuses.filter(item => item.status.status === 'failed').length;
    const badge = document.createElement('span');
    badge.className = `track-analysis-badge ${running ? 'running' : failed && !completed ? 'failed' : 'complete'} harmony-summary-badge`;
    badge.textContent = running ? `HM ${Math.round((running.status.progress || 0) * 100)}%` : `HM ${completed}/${HARMONY_ENGINE_IDS.length}${failed ? ' !' : ''}`;
    badge.title = rt('runtime.track.harmonyBadgeTitle', {
      completed,
      failed: failed ? rt('runtime.track.harmonyFailedSuffix', { count: failed }) : ''
    });
    wrap.append(badge);
  }
  if (!wrap.childElementCount) {
    const empty = document.createElement('span');
    empty.className = 'track-analysis-empty';
    empty.textContent = rt('runtime.track.unanalyzed');
    wrap.append(empty);
  }
  return wrap;
}

function renderTracks() {
  const scroller = document.querySelector('.album-stage');
  const scrollTop = scroller.scrollTop;
  dom.trackList.innerHTML = '';
  for (const track of state.selectedAlbum?.tracks || []) {
    const row = document.createElement('div');
    const selected = state.selectedTrack?.id === track.id;
    const playing = state.currentTrack?.id === track.id;
    row.className = `track-row${selected ? ' selected' : ''}${playing ? ' playing' : ''}`;
    row.dataset.trackId = track.id;

    const lead = document.createElement('div');
    lead.className = 'track-lead';
    const number = document.createElement('span');
    number.className = 'track-number';
    number.textContent = String(track.number).padStart(2, '0');
    const play = document.createElement('button');
    play.className = 'track-play-button';
    play.textContent = playing && !dom.audioElement.paused ? 'Ⅱ' : '▶';
    play.title = rt('runtime.track.playTitle', { track: track.title });
    play.addEventListener('click', event => {
      event.stopPropagation();
      if (playing) dom.playButton.click();
      else playTrack(track, state.selectedAlbum.tracks);
    });
    lead.append(number, play);

    const copy = document.createElement('div');
    copy.className = 'track-copy';
    const title = document.createElement('strong');
    title.textContent = track.title;
    const subtitle = document.createElement('span');
    subtitle.textContent = `${track.artist} · ${formatBytes(track.bytes)}`;
    copy.append(title, subtitle);
    copy.tabIndex = 0;
    copy.setAttribute('role', 'button');
    copy.setAttribute('aria-pressed', String(selected));
    copy.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); selectTrack(track); }
    });

    const format = document.createElement('span');
    format.className = 'track-format';
    format.textContent = track.extension;
    const duration = document.createElement('span');
    duration.className = 'track-duration';
    duration.textContent = track.duration ? formatTime(track.duration) : '—:—';
    row.append(lead, copy, renderTrackBadges(track), format, duration);
    row.addEventListener('click', () => selectTrack(track));
    row.addEventListener('dblclick', () => playTrack(track, state.selectedAlbum.tracks));
    dom.trackList.append(row);
  }
  scroller.scrollTop = scrollTop;
}

function openTrackById(trackId) {
  const album = state.library?.albums?.find(item => item.tracks.some(track => track.id === trackId));
  if (!album) return false;
  const track = album.tracks.find(item => item.id === trackId);
  selectAlbum(album);
  selectTrack(track);
  workspaceControls?.show('overview');
  logAnalysis('runtime.track.musicLabJump', { track: track.title });
  return true;
}

async function selectTrack(track) {
  if (!track) return;
  state.selectedTrack = track;
  state.analysisLoading = true;
  localStorage.setItem('xld:selectedTrack', track.id);
  derivedControls.reset();
  derivedControls.refresh();
  state.analysisResults = new Map();
  state.annotations = [];
  state.editingTagId = null;
  state.selectedSegment = null;
  probeDuration(track);
  renderTracks();
  renderAnalysisTarget();
  renderEngines();
  renderComparison();
  renderManualTags();
  updateResultActions();
  await loadTrackAnalysis(track.id);
  updateAnalyzeButton();
}

function renderAnalysisTarget() {
  if (!state.selectedTrack) {
    dom.analysisTargetTitle.textContent = rt('runtime.target.choose');
    dom.analysisTargetMeta.textContent = rt('runtime.target.chooseMeta');
    return;
  }
  dom.analysisTargetTitle.textContent = state.selectedTrack.title;
  dom.analysisTargetMeta.textContent = `${state.selectedTrack.artist} · ${state.selectedTrack.album}`;
}

// "3:00" / "1:23:45" / "180" -> seconds
function parseClock(text) {
  const s = String(text == null ? '' : text).trim();
  if (!s) return NaN;
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const parts = s.split(':').map(Number);
  if (!parts.length || parts.some(n => Number.isNaN(n))) return NaN;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

function getAiMaxSegment() {
  return Number(state.engines.find(engine => engine.id === 'songformer')?.maxSegmentSeconds) || 180;
}

function analyzedRanges() {
  const result = state.analysisResults.get('songformer');
  return Array.isArray(result?.analyzedRanges) ? result.analyzedRanges : [];
}

function lastAnalyzedEnd() {
  return analyzedRanges().reduce((max, range) => Math.max(max, Number(range[1]) || 0), 0);
}

function nextUncoveredRange(duration, maxLength) {
  if (!(duration > 0)) return null;
  const ranges = analyzedRanges()
    .map(range => [Math.max(0, Number(range[0]) || 0), Math.min(duration, Number(range[1]) || 0)])
    .filter(range => range[1] > range[0])
    .sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const range of ranges) {
    if (merged.length && range[0] <= merged.at(-1)[1] + AI_RANGE_EPSILON_SECONDS) {
      merged.at(-1)[1] = Math.max(merged.at(-1)[1], range[1]);
    } else merged.push([...range]);
  }
  let cursor = 0;
  let gap = null;
  for (const [start, end] of merged) {
    if (start - cursor > AI_RANGE_EPSILON_SECONDS) { gap = [cursor, start]; break; }
    cursor = Math.max(cursor, end);
  }
  if (!gap && duration - cursor > AI_RANGE_EPSILON_SECONDS) gap = [cursor, duration];
  if (!gap) return null;

  let [start, end] = gap;
  end = Math.min(duration, Math.max(end, start + Math.min(maxLength, AI_MIN_RANGE_SECONDS)));
  if (end - start < AI_MIN_RANGE_SECONDS) start = Math.max(0, end - AI_MIN_RANGE_SECONDS);
  if (end - start > maxLength) end = start + maxLength;
  return [start, Math.min(duration, end)];
}

// Read a track's duration without disturbing the player (long tracks need it to
// decide whether the segmentation panel is required).
function probeDuration(track) {
  if (!track || track.duration) return;
  const probe = new Audio();
  probe.preload = 'metadata';
  probe.addEventListener('loadedmetadata', () => {
    if (Number.isFinite(probe.duration) && probe.duration > 0) {
      track.duration = probe.duration;
      if (state.selectedTrack?.id === track.id) { updateAnalyzeButton(); renderTracks(); }
    }
  }, { once: true });
  probe.src = track.fileUrl;
}

// SongFormer can't fit a long track in one GPU pass, so long tracks are analyzed
// as user-defined segments (each <= max). Show the panel only for those.
function updateSegmentPanel() {
  const busy = Boolean(state.activeTask || state.batchRunning);
  const track = state.selectedTrack;
  const max = getAiMaxSegment();
  const duration = Number(track?.duration) || 0;
  const needsSeg = state.activeLab === 'section' && state.selectedEngine === 'songformer' && track && duration > max + 1;
  dom.segmentPanel.classList.toggle('hidden', !needsSeg);
  if (!needsSeg) return;
  const nextRange = nextUncoveredRange(duration, max);
  dom.segAnalyzeButton.disabled = busy || !nextRange;
  dom.segAutoButton.disabled = busy;
  const done = lastAnalyzedEnd();
  dom.segmentHint.textContent = nextRange
    ? rt('runtime.segment.hint.partial', { limit: formatTime(max), duration: formatTime(duration), done: formatTime(done) })
    : rt('runtime.segment.hint.covered', { duration: formatPreciseTime(duration) });
  const editing = document.activeElement === dom.segStart || document.activeElement === dom.segEnd;
  if (!editing && nextRange) {
    dom.segStart.value = formatPreciseTime(nextRange[0]);
    dom.segEnd.value = formatPreciseTime(nextRange[1]);
  } else if (!editing && !nextRange) {
    dom.segStart.value = formatPreciseTime(duration);
    dom.segEnd.value = formatPreciseTime(duration);
    if (!busy) setSegmentStatus('runtime.segment.completeNote');
  }
}

async function runSegmentAnalysis() {
  const track = state.selectedTrack;
  if (!track || state.activeTask || state.batchRunning) return;
  const max = getAiMaxSegment();
  const duration = Number(track.duration) || 0;
  let start = parseClock(dom.segStart.value);
  let end = parseClock(dom.segEnd.value);
  if (Number.isNaN(start) || Number.isNaN(end)) { setSegmentStatus('runtime.segment.formatError'); return; }
  start = Math.max(0, start);
  if (duration) {
    end = Math.min(end, duration);
    if (duration - end <= AI_RANGE_EPSILON_SECONDS) end = duration;
  }
  if (end - start <= 0) { setSegmentStatus('runtime.segment.invalidRange'); return; }
  if (end - start < AI_MIN_RANGE_SECONDS && duration) {
    end = Math.min(duration, Math.max(end, start + AI_MIN_RANGE_SECONDS));
    start = Math.max(0, end - AI_MIN_RANGE_SECONDS);
    dom.segStart.value = formatPreciseTime(start);
    dom.segEnd.value = formatPreciseTime(end);
  }
  if (end - start > max + 1) { setSegmentStatus('runtime.segment.maxRange', { limit: formatTime(max) }); return; }
  setSegmentStatus('runtime.segment.running', { start: formatPreciseTime(start), end: formatPreciseTime(end) });
  const response = await runAnalysis('songformer', { range: [start, end] });
  if (response?.ok) setSegmentStatus('runtime.segment.success', { start: formatPreciseTime(start), end: formatPreciseTime(end) });
  else if (response?.error === 'analysis-cancelled') setSegmentStatus('runtime.segment.cancelled');
  else setSegmentStatus('runtime.segment.failed', { error: runtimeError(response?.detail || response?.error) });
  updateSegmentPanel();
}

async function playTrack(track, queue = state.queue, autoPlay = true, startAt = null, sourceUrl = null) {
  if (!track) return;
  const playbackRequest = ++playbackSequence;
  cancelPendingMetadata?.(); cancelPendingMetadata = null;
  const playbackUrl = sourceUrl || (state.currentTrack?.id === track.id ? dom.audioElement.getAttribute('src') : null) || track.fileUrl;
  const album = albumForTrack(track);
  state.queue = [...queue];
  state.queueIndex = state.queue.findIndex(item => item.id === track.id);
  state.currentTrack = track;
  if (album && state.selectedAlbum?.id !== album.id) selectAlbum(album);
  if (state.selectedTrack?.id !== track.id) await selectTrack(track);

  if (playbackRequest !== playbackSequence) return;
  const sameSource = dom.audioElement.getAttribute('src') === playbackUrl;
  if (!sameSource) { dom.audioElement.pause(); dom.audioElement.src = playbackUrl; }
  dom.nowTitle.textContent = track.title;
  dom.nowArtist.textContent = `${track.artist} · ${track.album}`;
  setCover(dom.playerCover, dom.miniFallback, album?.coverUrl);
  setTransportIcon(dom.playButton, 'play');
  renderTracks();
  updateMediaSession(track, album);
  derivedControls.onPlayback(track, playbackUrl);
  localStorage.setItem('xld:lastTrack', track.id);

  if (Number.isFinite(startAt)) {
    if (dom.audioElement.readyState < 1) await new Promise(resolve => {
      const finish = () => { dom.audioElement.removeEventListener('loadedmetadata', finish); dom.audioElement.removeEventListener('error', finish); cancelPendingMetadata = null; resolve(); };
      cancelPendingMetadata = finish;
      dom.audioElement.addEventListener('loadedmetadata', finish, { once: true });
      dom.audioElement.addEventListener('error', finish, { once: true });
    });
    if (playbackRequest !== playbackSequence) return;
    if (dom.audioElement.readyState >= 1) dom.audioElement.currentTime = Math.max(0, Math.min(startAt, Math.max(0, dom.audioElement.duration - 0.02)));
  }
  if (autoPlay) {
    try { await dom.audioElement.play(); } catch (error) { logAnalysis('runtime.playback.failed', { error: error.message }); }
  }
}

function updateMediaSession(track, album) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: track.album,
    artwork: album?.coverUrl ? [{ src: album.coverUrl }] : []
  });
}

function stepTrack(direction) {
  if (!state.queue.length) return;
  let nextIndex;
  if (state.shuffle) nextIndex = Math.floor(Math.random() * state.queue.length);
  else {
    nextIndex = state.queueIndex + direction;
    if (nextIndex < 0) nextIndex = state.repeat === 'all' ? state.queue.length - 1 : 0;
    if (nextIndex >= state.queue.length) nextIndex = state.repeat === 'all' ? 0 : state.queue.length - 1;
  }
  playTrack(state.queue[nextIndex], state.queue);
}

function renderEngines() {
  dom.engineList.innerHTML = '';
  for (const engine of enginesForLab()) {
    const card = document.createElement('button');
    const cached = state.analysisResults.has(engine.id);
    const running = state.activeTask?.engine === engine.id && state.activeTask?.trackId === state.selectedTrack?.id;
    card.type = 'button';
    card.dataset.engineId = engine.id;
    card.setAttribute('aria-pressed', String(state.selectedEngine === engine.id));
    const localizedStatus = runtimeLocale.localizeBackendMessage(engine.status || '');
    card.title = `${engine.name} · ${localizedStatus}${engine.resource ? ` · ${engine.resource}` : ''}`;
    card.className = `engine-card ${engine.available ? 'available' : 'unavailable'}${state.selectedEngine === engine.id ? ' selected' : ''}${cached ? ' cached' : ''}${running ? ' running' : ''}`;
    card.disabled = !engine.available && !cached;
    const badge = rt(running ? 'runtime.engine.running' : cached ? 'runtime.engine.cached' : engine.available ? 'runtime.engine.ready' : 'runtime.engine.offline');
    card.innerHTML = `<span class="engine-radio"></span><span class="engine-copy"><strong>${engine.name}</strong><span>${escapeHtml(localizedStatus)}${engine.resource ? ` · ${escapeHtml(engine.resource)}` : ''}</span></span><span class="engine-badge">${escapeHtml(badge)}</span>`;
    if (engine.available || cached) card.addEventListener('click', () => {
      state.selectedEngine = engine.id;
      state.selectedEngineByLab[state.activeLab] = engine.id;
      renderEngines();
      updateAnalyzeButton();
      updateResultActions();
    });
    dom.engineList.append(card);
  }
}

async function refreshAnalysisSummary() {
  state.analysisSummary = await window.XLD.getAnalysisSummary() || {};
  renderTracks();
}

async function loadTrackAnalysis(trackId) {
  const requestTrackId = trackId;
  const [results, annotationDocument] = await Promise.all([
    window.XLD.loadAnalysis(trackId),
    window.XLD.loadAnnotations(trackId)
  ]);
  if (state.selectedTrack?.id !== requestTrackId) return;
  state.analysisLoading = false;
  state.analysisResults = new Map((Array.isArray(results) ? results : []).map(result => [result.engine?.id || result.engine, result]));
  state.annotations = Array.isArray(annotationDocument?.tags) ? annotationDocument.tags : [];
  state.editingTagId = null;
  state.selectedSegment = null;
  clearTagEditor();
  renderEngines();
  renderComparison();
  renderManualTags();
  updateResultActions();
}

function updateAnalyzeButton() {
  derivedControls.render();
  updateSegmentPanel();
  updateResultActions();
  const busy = Boolean(state.activeTask || state.batchRunning);
  dom.cancelAnalysisButton.classList.toggle('hidden', !busy);
  dom.cancelAnalysisButton.disabled = Boolean(state.activeTask && (state.activeTask.cancellable === false || state.activeTask.status === 'cancelling'));
  document.getElementById('workspaceDismissTask').hidden = busy;
  if (dom.batchAlbumButton) dom.batchAlbumButton.disabled = busy || !(state.selectedAlbum?.tracks?.length);
  if (dom.batchAlbumButton && !state.batchRunning) dom.batchAlbumButton.textContent = rt('runtime.album.batchDefault');
  dom.analyzeAllButton.textContent = rt(state.activeLab === 'harmony'
    ? 'runtime.analysis.runHarmonyBatch'
    : 'runtime.analysis.runSectionBatch');
  if (busy) {
    dom.analyzeButton.disabled = true;
    dom.analyzeAllButton.disabled = true;
    const batch = state.batchRunning
      ? rt('runtime.analysis.busyBatch', { index: Math.max(1, state.batchIndex), total: state.batchTotal })
      : rt('runtime.analysis.busyEngine');
    dom.analyzeButton.textContent = `${batch} · ${state.activeTask?.trackTitle || state.selectedTrack?.title || ''}`;
    return;
  }
  if (!state.selectedTrack) {
    dom.analyzeButton.disabled = true;
    dom.analyzeAllButton.disabled = true;
    dom.analyzeButton.textContent = rt('runtime.analysis.chooseTrack');
    return;
  }
  if (!state.selectedEngine) {
    dom.analyzeButton.disabled = true;
    dom.analyzeButton.textContent = rt('runtime.analysis.chooseEngine');
    return;
  }
  const engine = state.engines.find(item => item.id === state.selectedEngine);
  const batchIds = state.activeLab === 'harmony' ? HARMONY_ENGINE_IDS : MSAF_ENGINE_IDS;
  dom.analyzeAllButton.disabled = batchIds.some(id => !state.engines.find(item => item.id === id)?.available);
  const longSongformer = state.selectedEngine === 'songformer'
    && (Number(state.selectedTrack.duration) || 0) > getAiMaxSegment() + 1;
  if (longSongformer) {
    dom.analyzeButton.disabled = true;
    dom.analyzeButton.textContent = rt('runtime.analysis.longTrack');
  } else {
    dom.analyzeButton.disabled = !engine?.available;
    dom.analyzeButton.textContent = `${rt(state.analysisResults.has(state.selectedEngine) ? 'runtime.analysis.rerun' : 'runtime.analysis.run')} · ${engine?.name || state.selectedEngine}`;
  }
}

function updateResultActions() {
  workspaceControls?.render();
  const busy = Boolean(state.activeTask || state.batchRunning);
  const trackStatuses = state.selectedTrack ? state.analysisSummary?.[state.selectedTrack.id] || {} : {};
  const labIds = state.activeLab === 'harmony' ? HARMONY_ENGINE_IDS : SECTION_ENGINE_IDS;
  const labResultCount = labIds.filter(id => state.analysisResults.has(id) || trackStatuses[id]).length;
  const hasSelectedResult = Boolean(state.selectedEngine && (state.analysisResults.has(state.selectedEngine) || trackStatuses[state.selectedEngine]));
  dom.deleteAnalysisButton.disabled = busy || !state.selectedTrack || !hasSelectedResult;
  dom.deleteAllAnalysisButton.disabled = busy || !state.selectedTrack || labResultCount === 0;
  dom.exportMusicLabButton.disabled = busy || !state.selectedTrack;
  dom.saveTagButton.disabled = busy || !state.selectedTrack || !dom.tagLabel.value.trim();
  dom.tagUseSegmentButton.disabled = busy || !state.selectedSegment;
}

function hashColor(engineId, label) {
  if (isHarmonyEngineId(engineId)) {
    const root = String(label || 'N').match(/^([A-G](?:#|b)?)/)?.[1] || 'N';
    return chordRootColors[root] || chordRootColors.N;
  }
  const key = String(label ?? '').trim().toLowerCase();
  if (functionLabelColors[key]) return functionLabelColors[key];
  let hash = 0;
  for (const char of `${engineId}:${label}`) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return segmentColors[Math.abs(hash) % segmentColors.length];
}

function resultDuration(result) {
  const segments = Array.isArray(result?.segments) ? result.segments : [];
  return Number(result?.duration) || Math.max(0, ...segments.map(segment => Number(segment.end) || 0));
}

function renderComparison() {
  dom.comparisonTimeline.innerHTML = '';
  dom.timelineZoomLabel.textContent = state.timelineZoom === 1 ? rt('runtime.comparison.fit') : `${state.timelineZoom}×`;
  dom.timelineZoomOutButton.disabled = state.timelineZoom === 1;
  dom.timelineZoomInButton.disabled = state.timelineZoom === 8;
  const labIds = state.activeLab === 'harmony' ? HARMONY_ENGINE_IDS : SECTION_ENGINE_IDS;
  const results = [...state.analysisResults.values()].filter(result => labIds.includes(result.engine?.id) && Array.isArray(result?.segments) && result.segments.length);
  if (state.activeLab === 'section' && state.annotations.length) {
    const annotationDuration = Math.max(Number(state.selectedTrack?.duration) || 0, ...state.annotations.map(tag => Number(tag.end) || 0));
    results.push({
      engine: { id: 'manual', name: rt('runtime.analysis.manualName'), description: rt('runtime.analysis.manualDescription') },
      duration: annotationDuration,
      segments: state.annotations,
      manual: true
    });
  }
  const order = new Map(state.engines.map((engine, index) => [engine.id, index]));
  order.set('manual', -1);
  results.sort((a, b) => (order.get(a.engine?.id) ?? 99) - (order.get(b.engine?.id) ?? 99));
  if (!state.selectedTrack || !results.length) {
    const kind = labTerm(state.activeLab);
    dom.analysisState.textContent = rt(state.selectedTrack ? 'runtime.comparison.noResult' : 'runtime.comparison.idle');
    dom.comparisonTitle.textContent = state.selectedTrack
      ? rt('runtime.comparison.noNamedResult', { kind })
      : rt('runtime.comparison.chooseFirst');
    dom.comparisonTimeline.innerHTML = `<div class="timeline-empty">${escapeHtml(rt('runtime.comparison.empty', { kind }))}</div>`;
    dom.currentSegmentDetail.textContent = rt('runtime.comparison.afterPlay', { kind });
    return;
  }
  dom.analysisState.textContent = state.activeLab === 'harmony'
    ? rt('runtime.comparison.harmonyCount', { count: results.length })
    : rt('runtime.comparison.sectionCount', { count: results.filter(result => !result.manual).length, tags: state.annotations.length });
  dom.comparisonTitle.textContent = state.selectedTrack.title;
  const duration = Math.max(...results.map(resultDuration));
  const canvas = document.createElement('div');
  canvas.className = 'comparison-canvas';
  canvas.style.width = `${state.timelineZoom * 100}%`;

  const scale = document.createElement('div');
  scale.className = 'timeline-scale';
  const tickCount = Math.max(4, Math.round(state.timelineZoom * 4));
  scale.innerHTML = Array.from({ length: tickCount + 1 }, (_, index) => {
    const ratio = index / tickCount;
    return `<span style="left:${ratio * 100}%">${formatTime(duration * ratio)}</span>`;
  }).join('');
  canvas.append(scale);

  for (const result of results) {
    const engineId = result.engine?.id || 'engine';
    const harmonyResult = isHarmonyEngineId(engineId) || result.kind === 'harmony';
    const segments = result.segments;
    const row = document.createElement('section');
    row.className = `comparison-row${harmonyResult ? ' harmony-row' : ''}`;
    row.dataset.engine = engineId;
    const header = document.createElement('div');
    header.className = 'comparison-row-header';
    const sequence = segments.map(segment => String(segment.label ?? '?')).join(' → ');
    const method = result.engine?.description ? runtimeLocale.localizeBackendMessage(result.engine.description) : rt('runtime.comparison.method', {
      boundaries: result.engine?.boundaries || '?', labels: result.engine?.labels || '?'
    });
    const elapsed = result.manual ? '' : rt('runtime.comparison.elapsed', { seconds: Number(result.elapsedSeconds || 0).toFixed(1) });
    const metrics = harmonyResult && result.metrics
      ? `<span class="harmony-metrics"><b>${result.metrics.uniqueChords || 0}</b> ${escapeHtml(rt('runtime.comparison.metricChords'))} <b>${Math.round((Number(result.metrics.meanConfidence) || 0) * 100)}%</b> ${escapeHtml(rt('runtime.comparison.metricConfidence'))} <b>${Math.round((Number(result.metrics.noChordRatio) || 0) * 100)}%</b> ${escapeHtml(rt('runtime.comparison.metricNoChord'))}</span>`
      : '';
    header.innerHTML = `<div><strong>${escapeHtml(result.engine?.name || engineId)}</strong><span>${escapeHtml(rt('runtime.comparison.segmentCount', { count: segments.length }))}${escapeHtml(elapsed)} · ${escapeHtml(method)}</span>${metrics}</div><small>${escapeHtml(sequence)}</small>`;
    const track = document.createElement('div');
    track.className = 'comparison-track';
    track.dataset.duration = String(resultDuration(result));
    // For segmented (long-track) AI results, shade the not-yet-analyzed gaps grey.
    const ranges = Array.isArray(result.analyzedRanges) ? result.analyzedRanges : null;
    if (ranges) {
      const sorted = ranges.map(r => [Number(r[0]) || 0, Number(r[1]) || 0]).sort((a, b) => a[0] - b[0]);
      const gaps = [];
      let cursor = 0;
      for (const [a, b] of sorted) { if (a > cursor + 0.5) gaps.push([cursor, a]); cursor = Math.max(cursor, b); }
      if (cursor < duration - 0.5) gaps.push([cursor, duration]);
      for (const [a, b] of gaps) {
        const gap = document.createElement('div');
        gap.className = 'segment-gap';
        gap.style.left = `${Math.max(0, a / duration) * 100}%`;
        gap.style.width = `${Math.max(.4, ((b - a) / duration) * 100)}%`;
        gap.title = rt('runtime.comparison.gapTitle', { start: formatPreciseTime(a), end: formatPreciseTime(b) });
        gap.innerHTML = `<span>${escapeHtml(rt('runtime.comparison.gap'))}</span>`;
        track.append(gap);
      }
    }
    for (const segment of segments) {
      const start = Number(segment.start) || 0;
      const end = Number(segment.end) || start;
      const block = document.createElement('button');
      block.type = 'button';
      block.className = 'segment-block';
      block.dataset.start = String(start);
      block.dataset.end = String(end);
      if (segment.id) block.dataset.segmentId = segment.id;
      block.style.left = `${Math.max(0, start / duration) * 100}%`;
      block.style.width = `${Math.max(.25, ((end - start) / duration) * 100)}%`;
      block.style.background = `${hashColor(engineId, segment.label)}d8`;
      const confidence = Number(segment.confidence);
      if (harmonyResult && Number.isFinite(confidence) && confidence < .48) block.classList.add('low-confidence');
      block.title = rt('runtime.comparison.segmentTitle', {
        label: segment.label,
        start: formatPreciseTime(start),
        end: formatPreciseTime(end),
        duration: formatPreciseTime(end - start),
        confidence: Number.isFinite(confidence)
          ? rt('runtime.comparison.confidenceSuffix', { confidence: Math.round(confidence * 100) })
          : ''
      });
      block.textContent = String(segment.label ?? '?');
      block.addEventListener('pointerdown', event => event.stopPropagation());
      block.addEventListener('click', () => {
        state.selectedSegment = { start, end, label: String(segment.label ?? '?'), engineId, id: segment.id || null };
        if (!harmonyResult) {
          dom.tagStart.value = formatPreciseTime(start);
          dom.tagEnd.value = formatPreciseTime(end);
          if (!dom.tagLabel.value.trim() || engineId !== 'manual') dom.tagLabel.value = String(segment.label ?? '');
          if (engineId === 'manual' && segment.id) editTag(segment.id);
        }
        updateResultActions();
      });
      block.addEventListener('dblclick', () => playTrack(state.selectedTrack, albumForTrack(state.selectedTrack)?.tracks || [], true, start));
      track.append(block);
    }
    const cursor = document.createElement('i');
    cursor.className = 'timeline-playhead';
    track.append(cursor);
    const seekAtPointer = event => {
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
      const target = ratio * duration;
      const sameTrack = state.currentTrack?.id === state.selectedTrack?.id;
      if (sameTrack && Number.isFinite(dom.audioElement.duration)) {
        dom.audioElement.currentTime = target;
        updatePlaybackIndicators();
      } else if (event.type === 'pointerdown') {
        playTrack(state.selectedTrack, albumForTrack(state.selectedTrack)?.tracks || [], true, target);
      }
    };
    track.addEventListener('pointerdown', event => {
      event.preventDefault();
      state.timelineSeeking = true;
      track.setPointerCapture(event.pointerId);
      seekAtPointer(event);
    });
    track.addEventListener('pointermove', event => {
      if (state.timelineSeeking && track.hasPointerCapture(event.pointerId)) seekAtPointer(event);
    });
    const endSeek = event => {
      if (track.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId);
      state.timelineSeeking = false;
    };
    track.addEventListener('pointerup', endSeek);
    track.addEventListener('pointercancel', endSeek);
    row.append(header, track);
    canvas.append(row);
  }
  dom.comparisonTimeline.append(canvas);
  updatePlaybackIndicators();
}

function updatePlaybackIndicators() {
  const sameTrack = state.currentTrack?.id && state.currentTrack.id === state.selectedTrack?.id;
  const current = sameTrack ? Number(dom.audioElement.currentTime) || 0 : 0;
  const duration = sameTrack && Number.isFinite(dom.audioElement.duration) ? dom.audioElement.duration : 0;
  const percent = duration > 0 ? Math.max(0, Math.min(100, (current / duration) * 100)) : 0;
  const details = [];
  for (const row of dom.comparisonTimeline.querySelectorAll('.comparison-row')) {
    const playhead = row.querySelector('.timeline-playhead');
    playhead.style.left = `${percent}%`;
    playhead.classList.toggle('visible', Boolean(sameTrack && duration));
    let activeLabel = null;
    for (const block of row.querySelectorAll('.segment-block')) {
      const active = sameTrack && current >= Number(block.dataset.start) && current < Number(block.dataset.end);
      block.classList.toggle('current', active);
      if (active) activeLabel = `${block.textContent} · ${formatPreciseTime(block.dataset.start)}–${formatPreciseTime(block.dataset.end)}`;
    }
    if (activeLabel) {
      const name = row.querySelector('.comparison-row-header strong')?.textContent || row.dataset.engine;
      details.push(`${name}: ${activeLabel}`);
    }
  }
  const kind = labTerm(state.activeLab);
  dom.currentSegmentDetail.textContent = details.length
    ? `${formatPreciseTime(current)}  ·  ${details.join('   |   ')}`
    : sameTrack
      ? rt('runtime.comparison.awaiting', { time: formatTime(current), kind })
      : rt('runtime.comparison.sync', { kind });

  if (sameTrack && duration && state.timelineZoom > 1 && !state.timelineSeeking) {
    const canvas = dom.comparisonTimeline.querySelector('.comparison-canvas');
    if (canvas) {
      const x = (current / duration) * canvas.scrollWidth;
      const left = dom.comparisonTimeline.scrollLeft;
      const width = dom.comparisonTimeline.clientWidth;
      if (x < left + width * .12 || x > left + width * .88) {
        dom.comparisonTimeline.scrollLeft = Math.max(0, x - width * .22);
      }
    }
  }
}

function clearTagEditor() {
  state.editingTagId = null;
  const current = state.currentTrack?.id === state.selectedTrack?.id ? Number(dom.audioElement.currentTime) || 0 : 0;
  dom.tagStart.value = formatPreciseTime(current);
  dom.tagEnd.value = formatPreciseTime(current + 30);
  dom.tagLabel.value = '';
  dom.tagNote.value = '';
  dom.saveTagButton.textContent = rt('runtime.tag.save');
  updateResultActions();
}

function editTag(tagId) {
  const tag = state.annotations.find(item => item.id === tagId);
  if (!tag) return;
  state.editingTagId = tag.id;
  state.selectedSegment = { start: tag.start, end: tag.end, label: tag.label, engineId: 'manual', id: tag.id };
  dom.tagStart.value = formatPreciseTime(tag.start);
  dom.tagEnd.value = formatPreciseTime(tag.end);
  dom.tagLabel.value = tag.label;
  dom.tagNote.value = tag.note || '';
  dom.saveTagButton.textContent = rt('runtime.tag.update');
  updateResultActions();
}

function renderManualTags() {
  dom.manualTagList.innerHTML = '';
  if (!state.annotations.length) {
    dom.manualTagList.innerHTML = `<span class="tag-empty">${escapeHtml(rt('runtime.tag.empty'))}</span>`;
    return;
  }
  for (const tag of state.annotations) {
    const item = document.createElement('div');
    item.className = `manual-tag-item${state.editingTagId === tag.id ? ' editing' : ''}`;
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'manual-tag-copy';
    const title = document.createElement('strong');
    title.textContent = tag.label;
    const meta = document.createElement('span');
    meta.textContent = `${formatPreciseTime(tag.start)}–${formatPreciseTime(tag.end)}${tag.note ? ` · ${tag.note}` : ''}`;
    copy.append(title, meta);
    copy.addEventListener('click', () => editTag(tag.id));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'tag-delete-button';
    remove.textContent = rt('runtime.tag.delete');
    remove.addEventListener('click', async () => {
      if (!confirm(rt('runtime.tag.confirmDelete', { label: tag.label }))) return;
      const response = await window.XLD.deleteAnnotation(state.selectedTrack.id, tag.id);
      if (!response?.ok) return logAnalysis('runtime.tag.deleteFailed', { error: runtimeError(response?.error) });
      state.annotations = response.document.tags || [];
      if (state.editingTagId === tag.id) clearTagEditor();
      renderManualTags();
      renderComparison();
      updateResultActions();
      setIntegrationStatus(response.integrationWarning ? 'runtime.integration.pending' : 'runtime.integration.auto');
      logAnalysis('runtime.tag.deleted', {
        label: tag.label,
        warning: response.integrationWarning ? runtimeRef('runtime.tag.warningSuffix') : ''
      });
    });
    item.append(copy, remove);
    dom.manualTagList.append(item);
  }
}

async function saveTag() {
  if (!state.selectedTrack) return;
  const tag = {
    id: state.editingTagId || undefined,
    start: parseClock(dom.tagStart.value),
    end: parseClock(dom.tagEnd.value),
    label: dom.tagLabel.value,
    note: dom.tagNote.value
  };
  const response = await window.XLD.saveAnnotation(state.selectedTrack.id, tag);
  if (!response?.ok) {
    const messages = {
      'tag-label-required': runtimeRef('runtime.tag.labelRequired'),
      'tag-range-invalid': runtimeRef('runtime.tag.rangeInvalid')
    };
    logAnalysis('runtime.tag.saveFailed', { error: messages[response?.error] || runtimeError(response?.error) });
    return;
  }
  state.annotations = response.document.tags || [];
  state.editingTagId = response.tag.id;
  renderManualTags();
  renderComparison();
  updateResultActions();
  setIntegrationStatus(response.integrationWarning ? 'runtime.integration.pending' : 'runtime.integration.auto');
  logAnalysis('runtime.tag.saved', {
    label: response.tag.label,
    warning: response.integrationWarning ? runtimeRef('runtime.tag.warningSuffix') : ''
  });
}

async function deleteResults(engine) {
  if (!state.selectedTrack) return;
  const groupIds = engine === 'harmony-all' ? HARMONY_ENGINE_IDS
    : engine === 'section-all' ? SECTION_ENGINE_IDS : KNOWN_ENGINE_IDS;
  const statuses = state.analysisSummary?.[state.selectedTrack.id] || {};
  const statusCount = groupIds.filter(id => state.analysisResults.has(id) || statuses[id]).length;
  const target = engine === 'all' || engine.endsWith('-all')
    ? rt('runtime.delete.trackTarget', {
      kind: rt(engine === 'harmony-all' ? 'runtime.delete.kind.harmony' : engine === 'section-all' ? 'runtime.delete.kind.section' : 'runtime.delete.kind.all'),
      count: statusCount
    })
    : rt('runtime.delete.engineTarget', { engine: state.engines.find(item => item.id === engine)?.name || engine });
  if (!confirm(rt('runtime.delete.confirm', { target }))) return;
  const response = await window.XLD.deleteAnalysisResult(state.selectedTrack.id, engine);
  if (!response?.ok) return logAnalysis('runtime.delete.failed', { error: runtimeError(response?.error) });
  await refreshAnalysisSummary();
  await loadTrackAnalysis(state.selectedTrack.id);
  setIntegrationStatus(response.integrationWarning ? 'runtime.integration.pending' : 'runtime.integration.auto');
  logAnalysis('runtime.delete.done', { target, warning: response.integrationWarning ? runtimeRef('runtime.tag.warningSuffix') : '' });
}

async function exportMusicLabManifest() {
  if (!state.selectedTrack) return;
  const response = await window.XLD.exportMusicLabManifest(state.selectedTrack.id);
  if (!response?.ok) return logAnalysis('runtime.integration.exportFailed', { error: runtimeError(response?.error) });
  setIntegrationStatus('runtime.integration.updated');
  dom.integrationStatus.title = response.path || '';
  logAnalysis('runtime.integration.exported', { path: response.path });
}

function applyTask(task) {
  const running = task && ['starting', 'running', 'cancelling'].includes(task.status);
  if (task) state.lastTask = task;
  state.activeTask = running ? task : null;
  if (task) {
    const progress = Math.round((Number(task.progress) || 0) * 100);
    dom.taskCard.classList.remove('hidden');
    dom.taskKicker.textContent = task.status === 'complete' ? rt('runtime.task.complete')
      : task.status === 'failed' ? rt('runtime.task.failed')
        : task.status === 'cancelled' ? rt('runtime.task.cancelled')
          : state.batchRunning ? rt('runtime.task.batch', { index: state.batchIndex, total: state.batchTotal })
            : rt('runtime.task.running');
    dom.taskTitle.textContent = task.trackTitle || rt('runtime.task.defaultTitle');
    dom.taskPercent.textContent = `${task.estimatedProgress ? '≈' : ''}${progress}%`;
    dom.taskProgressBar.style.width = `${progress}%`;
    dom.taskEngine.textContent = task.engineName || task.engine || '—';
    dom.taskMessage.textContent = task.message
      ? runtimeLocale.localizeBackendMessage(task.message)
      : rt('runtime.task.waiting');
    dom.taskMessage.title = dom.taskMessage.textContent;
    dom.taskElapsed.textContent = rt('runtime.task.elapsed', { time: formatTime(task.elapsedSeconds || 0) });
    dom.taskRemaining.textContent = Number.isFinite(task.remainingSeconds)
      ? rt('runtime.task.remaining', {
        time: formatTime(task.remainingSeconds),
        cache: task.cacheHit ? rt('runtime.task.cacheSuffix') : ''
      })
      : rt('runtime.task.estimating');
    if (!running) dom.taskRemaining.textContent = '';
    if (task.trackId === state.selectedTrack?.id) dom.analysisState.textContent = running ? `${progress}%`
      : rt(task.status === 'complete' ? 'runtime.task.stateComplete' : task.status === 'cancelled' ? 'runtime.task.cancelled' : 'runtime.task.stateFailed');
  } else {
    dom.taskCard.classList.add('hidden');
  }
  dom.cancelAnalysisButton.classList.toggle('hidden', !running && !state.batchRunning);
  dom.cancelAnalysisButton.disabled = Boolean(running && (task.cancellable === false || task.status === 'cancelling'));
  document.getElementById('workspaceDismissTask').hidden = Boolean(running || state.batchRunning);
  const locked = Boolean(running || state.batchRunning);
  dom.chooseAnalysisRootButton.disabled = locked;
  dom.chooseLibraryButton.disabled = locked;
  dom.rescanButton.disabled = locked;
  renderTracks();
  renderEngines();
  updateAnalyzeButton();
  updateResultActions();
}

async function runAnalysis(engineOverride = null, options = {}) {
  const targetTrack = options.track || state.selectedTrack;
  const engineId = typeof engineOverride === 'string' ? engineOverride : state.selectedEngine;
  if (!targetTrack || !engineId || state.activeTask || (state.batchRunning && !options.fromBatch)) return null;
  const trackId = targetTrack.id;
  const engineName = state.engines.find(engine => engine.id === engineId)?.name || engineId;
  const replacing = Boolean(state.analysisResults.has(engineId));
  const separation = HARMONY_ENGINE_IDS.includes(engineId) ? (state.separation || 'none') : 'none';
  logAnalysis('runtime.log.analysisStart', {
    engine: engineName,
    track: targetTrack.title,
    separation: separation !== 'none' ? runtimeRef('runtime.log.separationSuffix', { engine: separation === 'demucs' ? 'Demucs' : 'HPSS' }) : '',
    replacement: replacing ? runtimeRef('runtime.log.replacementSuffix') : ''
  });
  dom.analyzeButton.disabled = true;
  const response = await window.XLD.runAnalysis(trackId, engineId, options.range || null, Boolean(options.auto), separation);
  if (response.ok && response.result) {
    state.analysisSummary[trackId] ||= {};
    state.analysisSummary[trackId][engineId] = { status: 'complete' };
    if (state.selectedTrack?.id === trackId) {
      state.analysisResults.set(response.result.engine?.id || engineId, response.result);
      renderComparison();
    }
    logAnalysis('runtime.log.analysisComplete', {
      engine: engineName,
      warning: response.integrationWarning ? runtimeRef('runtime.log.integrationWarning', { warning: response.integrationWarning }) : ''
    });
    setIntegrationStatus(response.integrationWarning ? 'runtime.integration.pending' : 'runtime.integration.auto');
  } else if (response.error === 'analysis-busy') {
    logAnalysis('runtime.log.analyzerBusy', { track: response.task?.trackTitle || runtimeRef('runtime.common.otherTrack') });
  } else if (response.error !== 'analysis-cancelled') {
    state.analysisSummary[trackId] ||= {};
    state.analysisSummary[trackId][engineId] = { status: 'failed' };
    logAnalysis('runtime.log.analysisFailed', {
      error: runtimeError(response.detail || response.error),
      replacement: replacing ? runtimeRef('runtime.log.oldResultPreserved') : ''
    });
  }
  await refreshAnalysisSummary();
  if (state.selectedTrack?.id === trackId) await loadTrackAnalysis(trackId);
  updateAnalyzeButton();
  return response;
}

async function runAllAnalyses() {
  if (!state.selectedTrack || state.activeTask || state.batchRunning) return;
  const requested = state.activeLab === 'harmony' ? HARMONY_ENGINE_IDS : MSAF_ENGINE_IDS;
  const engines = requested.filter(id => state.engines.find(item => item.id === id)?.available);
  if (engines.length !== requested.length) {
    logAnalysis('runtime.log.batchUnavailable', { group: state.activeLab === 'harmony' ? 'Harmony' : 'MSAF' });
    return;
  }
  const track = state.selectedTrack;
  state.batchRunning = true;
  state.batchCancelled = false;
  state.batchIndex = 0;
  state.batchTotal = engines.length;
  updateAnalyzeButton();
  logAnalysis('runtime.log.batchStart', {
    group: state.activeLab === 'harmony' ? 'Harmony' : 'MSAF', track: track.title, count: engines.length
  });
  let completed = 0;
  let failed = 0;
  for (let index = 0; index < engines.length; index += 1) {
    if (state.batchCancelled) break;
    state.batchIndex = index + 1;
    updateAnalyzeButton();
    const response = await runAnalysis(engines[index], { fromBatch: true, track });
    if (response?.ok) completed += 1;
    else if (response?.error === 'analysis-cancelled') {
      state.batchCancelled = true;
      break;
    } else failed += 1;
  }
  const cancelled = state.batchCancelled;
  state.batchRunning = false;
  state.batchIndex = 0;
  state.batchTotal = 0;
  updateAnalyzeButton();
  logAnalysis(cancelled ? 'runtime.log.batchCancelled' : 'runtime.log.batchEnd', {
    completed,
    failed: failed ? runtimeRef('runtime.log.failedSuffix', { count: failed }) : ''
  });
}

// Whole-album batch: per track run one section engine (SongFormer auto-segment,
// falling back to any available MSAF) + one chord engine (BTC, falling back to
// any available chord engine). Strictly serial, reuses the batch/cancel state.
async function runAlbumBatch() {
  const album = state.selectedAlbum;
  if (!album || !album.tracks?.length || state.activeTask || state.batchRunning) return;
  const pick = (preferred, pool) => (state.engines.find(item => item.id === preferred && item.available)?.id)
    || pool.find(id => state.engines.find(item => item.id === id)?.available)
    || null;
  const sectionEngine = pick('songformer', SECTION_ENGINE_IDS);
  const chordEngine = pick('chord-btc', HARMONY_ENGINE_IDS);
  const plan = [];
  if (sectionEngine) plan.push(sectionEngine);
  if (chordEngine) plan.push(chordEngine);
  if (!plan.length) {
    logAnalysis('runtime.log.noBatchEngines', {});
    return;
  }
  const tracks = album.tracks;
  state.batchRunning = true;
  state.batchCancelled = false;
  state.batchTotal = tracks.length * plan.length;
  state.batchIndex = 0;
  updateAnalyzeButton();
  const planLabel = plan.map(id => state.engines.find(item => item.id === id)?.name || id).join(' + ');
  logAnalysis('runtime.log.albumBatchStart', { album: album.title, tracks: tracks.length, plan: planLabel });
  let completed = 0;
  let failed = 0;
  let skipped = 0;
  for (const track of tracks) {
    if (state.batchCancelled) break;
    for (const engineId of plan) {
      if (state.batchCancelled) break;
      state.batchIndex += 1;
      if (dom.batchAlbumButton) dom.batchAlbumButton.textContent = rt('runtime.album.batchProgress', { index: state.batchIndex, total: state.batchTotal });
      updateAnalyzeButton();
      const options = { fromBatch: true, track };
      if (engineId === 'songformer') options.auto = true;
      const response = await runAnalysis(engineId, options);
      if (response?.ok) completed += 1;
      else if (response?.error === 'analysis-cancelled') { state.batchCancelled = true; break; }
      else if (response == null) skipped += 1;
      else failed += 1;
    }
  }
  const cancelled = state.batchCancelled;
  state.batchRunning = false;
  state.batchIndex = 0;
  state.batchTotal = 0;
  if (dom.batchAlbumButton) dom.batchAlbumButton.textContent = rt('runtime.album.batchDefault');
  updateAnalyzeButton();
  logAnalysis(cancelled ? 'runtime.log.albumBatchCancelled' : 'runtime.log.albumBatchEnd', {
    completed,
    failed: failed ? runtimeRef('runtime.log.failedSuffix', { count: failed }) : '',
    skipped: skipped ? runtimeRef('runtime.log.skippedSuffix', { count: skipped }) : ''
  });
}

async function refreshAnalysisSettings() {
  state.settings = await window.XLD.getAnalysisSettings();
  dom.analysisRootLabel.textContent = compactPath(state.settings?.analysisRoot || rt('runtime.common.notSet'));
  dom.analysisRootLabel.title = state.settings?.analysisRoot || '';
}

dom.rescanButton.addEventListener('click', () => refreshLibrary());
dom.chooseLibraryButton.addEventListener('click', () => refreshLibrary(window.XLD.chooseLibrary()));
dom.searchInput.addEventListener('input', renderAlbums);
dom.openAnalysisRootButton.addEventListener('click', () => window.XLD.openAnalysisRoot());
dom.chooseAnalysisRootButton.addEventListener('click', async () => {
  const result = await window.XLD.chooseAnalysisRoot();
  if (result?.canceled) return;
  await refreshAnalysisSettings();
  await refreshAnalysisSummary();
  if (state.selectedTrack) await loadTrackAnalysis(state.selectedTrack.id);
  await derivedControls.refresh();
  logAnalysis('runtime.log.repositoryChanged', { path: result.analysisRoot });
});
dom.playAlbumButton.addEventListener('click', () => playTrack(state.selectedAlbum?.tracks[0], state.selectedAlbum?.tracks || []));
dom.shuffleAlbumButton.addEventListener('click', () => {
  const tracks = state.selectedAlbum?.tracks || [];
  if (tracks.length) playTrack(tracks[Math.floor(Math.random() * tracks.length)], tracks);
});
dom.playButton.addEventListener('click', () => {
  if (!state.currentTrack) return playTrack(state.selectedTrack || state.selectedAlbum?.tracks[0], state.selectedAlbum?.tracks || []);
  if (dom.audioElement.paused) dom.audioElement.play(); else dom.audioElement.pause();
});
dom.previousButton.addEventListener('click', () => stepTrack(-1));
dom.nextButton.addEventListener('click', () => stepTrack(1));
dom.shuffleButton.addEventListener('click', () => {
  state.shuffle = !state.shuffle;
  dom.shuffleButton.classList.toggle('active', state.shuffle);
});
dom.repeatButton.addEventListener('click', () => {
  state.repeat = state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off';
  dom.repeatButton.classList.toggle('active', state.repeat !== 'off');
  setTransportIcon(dom.repeatButton, state.repeat === 'one' ? 'repeatOne' : 'repeat');
  renderRepeatTitle();
});
dom.volumeBar.addEventListener('input', () => {
  dom.audioElement.volume = Number(dom.volumeBar.value);
  localStorage.setItem('xld:volume', dom.volumeBar.value);
});
dom.seekBar.addEventListener('pointerdown', () => { state.seeking = true; });
dom.seekBar.addEventListener('input', () => {
  if (!Number.isFinite(dom.audioElement.duration)) return;
  dom.currentTime.textContent = formatTime((Number(dom.seekBar.value) / 1000) * dom.audioElement.duration);
});
dom.seekBar.addEventListener('change', () => {
  if (Number.isFinite(dom.audioElement.duration)) dom.audioElement.currentTime = (Number(dom.seekBar.value) / 1000) * dom.audioElement.duration;
  state.seeking = false;
});
dom.revealButton.addEventListener('click', () => (state.currentTrack || state.selectedTrack) && window.XLD.revealTrack((state.currentTrack || state.selectedTrack).id));
// Main workspace tabs own navigation and call setActiveLab for the shared lab.
dom.analyzeButton.addEventListener('click', () => runAnalysis());
dom.analyzeAllButton.addEventListener('click', runAllAnalyses);
dom.batchAlbumButton?.addEventListener('click', runAlbumBatch);
dom.separationToggle?.addEventListener('change', () => {
  state.separation = dom.separationToggle.checked ? 'demucs' : 'none';
  logAnalysis(state.separation === 'demucs' ? 'runtime.log.demucsOn' : 'runtime.log.demucsOff', {});
});
dom.segAnalyzeButton.addEventListener('click', runSegmentAnalysis);
dom.segAutoButton.addEventListener('click', runAutoSegmentation);
async function runAutoSegmentation() {
  const track = state.selectedTrack;
  if (!track || state.activeTask || state.batchRunning) return;
  setSegmentStatus('runtime.segment.autoRunning');
  const response = await runAnalysis('songformer', { auto: true });
  if (response?.ok) setSegmentStatus('runtime.segment.autoComplete');
  else if (response?.error === 'analysis-cancelled') setSegmentStatus('runtime.segment.autoCancelled');
  else setSegmentStatus('runtime.segment.autoFailed', { error: runtimeError(response?.detail || response?.error) });
  updateSegmentPanel();
}
dom.deleteAnalysisButton.addEventListener('click', () => deleteResults(state.selectedEngine));
dom.deleteAllAnalysisButton.addEventListener('click', () => deleteResults(state.activeLab === 'harmony' ? 'harmony-all' : 'section-all'));
dom.exportMusicLabButton.addEventListener('click', exportMusicLabManifest);
dom.clearTagButton.addEventListener('click', clearTagEditor);
dom.saveTagButton.addEventListener('click', saveTag);
dom.tagLabel.addEventListener('input', updateResultActions);
dom.tagUseCurrentButton.addEventListener('click', () => {
  const current = state.currentTrack?.id === state.selectedTrack?.id ? Number(dom.audioElement.currentTime) || 0 : 0;
  const previousStart = parseClock(dom.tagStart.value);
  const previousEnd = parseClock(dom.tagEnd.value);
  const length = Number.isFinite(previousEnd - previousStart) && previousEnd > previousStart ? previousEnd - previousStart : 30;
  dom.tagStart.value = formatPreciseTime(current);
  dom.tagEnd.value = formatPreciseTime(current + length);
});
dom.tagUseSegmentButton.addEventListener('click', () => {
  if (!state.selectedSegment) return;
  dom.tagStart.value = formatPreciseTime(state.selectedSegment.start);
  dom.tagEnd.value = formatPreciseTime(state.selectedSegment.end);
  if (!dom.tagLabel.value.trim()) dom.tagLabel.value = state.selectedSegment.label;
  updateResultActions();
});
dom.cancelAnalysisButton.addEventListener('click', () => {
  if (state.batchRunning) state.batchCancelled = true;
  if (state.activeTask) window.XLD.cancelAnalysis(state.activeTask.taskId);
});
dom.timelineZoomOutButton.addEventListener('click', () => {
  state.timelineZoom = Math.max(1, state.timelineZoom / 2);
  renderComparison();
});
dom.timelineZoomInButton.addEventListener('click', () => {
  state.timelineZoom = Math.min(8, state.timelineZoom * 2);
  renderComparison();
});
dom.timelineFitButton.addEventListener('click', () => {
  state.timelineZoom = 1;
  renderComparison();
  dom.comparisonTimeline.scrollLeft = 0;
});
dom.fontDecreaseButton.addEventListener('click', () => {
  const index = UI_SCALES.indexOf(state.fontScale);
  applyFontScale(UI_SCALES[Math.max(0, index - 1)]);
});
dom.fontIncreaseButton.addEventListener('click', () => {
  const index = UI_SCALES.indexOf(state.fontScale);
  applyFontScale(UI_SCALES[Math.min(UI_SCALES.length - 1, index + 1)]);
});

dom.audioElement.addEventListener('play', () => { setTransportIcon(dom.playButton, 'pause'); dom.playButton.setAttribute('aria-label', rt('runtime.playback.pauseAria')); renderTracks(); });
dom.audioElement.addEventListener('pause', () => { setTransportIcon(dom.playButton, 'play'); dom.playButton.setAttribute('aria-label', rt('runtime.playback.playAria')); renderTracks(); });
dom.audioElement.addEventListener('loadedmetadata', () => {
  dom.durationTime.textContent = formatTime(dom.audioElement.duration);
  if (state.currentTrack) state.currentTrack.duration = dom.audioElement.duration;
  renderTracks();
});
dom.audioElement.addEventListener('timeupdate', () => {
  if (!state.seeking && Number.isFinite(dom.audioElement.duration) && dom.audioElement.duration > 0) {
    dom.seekBar.value = Math.round((dom.audioElement.currentTime / dom.audioElement.duration) * 1000);
    dom.currentTime.textContent = formatTime(dom.audioElement.currentTime);
  }
  if (state.currentTrack) localStorage.setItem('xld:lastPosition', String(dom.audioElement.currentTime));
  updatePlaybackIndicators();
});
dom.audioElement.addEventListener('ended', () => {
  if (state.repeat === 'one') { dom.audioElement.currentTime = 0; dom.audioElement.play(); }
  else stepTrack(1);
});
dom.audioElement.addEventListener('error', () => logAnalysis('runtime.playback.loadFailed', { error: runtimeError(dom.audioElement.error?.message) }));

document.addEventListener('keydown', event => {
  if (event.defaultPrevented || event.target.closest('input, textarea, select, button, summary, [contenteditable="true"], [role="button"]')) return;
  if (event.code === 'Space') { event.preventDefault(); dom.playButton.click(); }
  if (event.code === 'ArrowRight' && event.altKey) stepTrack(1);
  if (event.code === 'ArrowLeft' && event.altKey) stepTrack(-1);
});

if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('play', () => dom.audioElement.play());
  navigator.mediaSession.setActionHandler('pause', () => dom.audioElement.pause());
  navigator.mediaSession.setActionHandler('previoustrack', () => stepTrack(-1));
  navigator.mediaSession.setActionHandler('nexttrack', () => stepTrack(1));
  navigator.mediaSession.setActionHandler('seekto', details => { if (Number.isFinite(details.seekTime)) dom.audioElement.currentTime = details.seekTime; });
}

window.XLD.onAnalysisTask(async task => {
  applyTask(task);
  if (!task) return;
  const logKey = `${task.taskId}:${task.status}:${task.phase || ''}:${task.message || ''}`;
  if (task.message && logKey !== state.lastTaskLogKey) {
    state.lastTaskLogKey = logKey;
    logBackendAnalysis(task.engineName || task.engine, task.message);
  }
  if (['complete', 'failed', 'cancelled'].includes(task.status)) {
    await refreshAnalysisSummary();
    if (state.selectedTrack?.id === task.trackId) {
      await loadTrackAnalysis(task.trackId);
      if (['demucs-6s','bs-roformer-sw','basic-pitch','guitar-gaps','muscriptor-medium','muscriptor-large','strings-muscriptor-medium','strings-muscriptor-large','drums-muscriptor-medium','drums-muscriptor-large','yourmt3-plus','piano-highres','bass-highres','midi-merge','drums-adtof','mega-53'].includes(task.engine)) await derivedControls.refresh();
    }
    // Keep the terminal result visible until it is dismissed or a new task starts.
  }
});

function refreshRuntimeLocaleUi() {
  const scroll = {
    albums: dom.albumGrid.scrollTop,
    tracks: dom.trackList.scrollTop,
    comparisonLeft: dom.comparisonTimeline.scrollLeft,
    comparisonTop: dom.comparisonTimeline.scrollTop
  };
  const taskWasVisible = !dom.taskCard.classList.contains('hidden');
  renderLabCopy();
  renderLibrarySummary();
  dom.analysisRootLabel.textContent = compactPath(state.settings?.analysisRoot || rt('runtime.common.notSet'));
  dom.analysisRootLabel.title = state.settings?.analysisRoot || '';
  if (state.selectedAlbum) dom.albumTrackCount.textContent = rt('runtime.library.trackCount', { count: state.selectedAlbum.trackCount });
  renderAlbums();
  renderTracks();
  renderAnalysisTarget();
  renderEngines();
  updateAnalyzeButton();
  renderComparison();
  renderManualTags();
  renderSegmentStatus();
  renderIntegrationStatus();
  renderAnalysisLogs();
  if (taskWasVisible && state.lastTask) applyTask(state.lastTask);
  renderRepeatTitle();
  renderNowPlayingCopy();
  derivedControls.render();
  dom.playButton.setAttribute('aria-label', rt(dom.audioElement.paused ? 'runtime.playback.playAria' : 'runtime.playback.pauseAria'));
  dom.albumGrid.scrollTop = scroll.albums;
  dom.trackList.scrollTop = scroll.tracks;
  dom.comparisonTimeline.scrollLeft = scroll.comparisonLeft;
  dom.comparisonTimeline.scrollTop = scroll.comparisonTop;
}

window.xinXldLocale.subscribe(() => queueMicrotask(refreshRuntimeLocaleUi), false);

let acceptingOpenRequest=false, openRequestPending=false;
async function acceptOpenRequest() {
  openRequestPending=true;
  if(!state.bootstrapped || acceptingOpenRequest)return;
  acceptingOpenRequest=true;
  try {
    while(openRequestPending){
      openRequestPending=false;
      const open=await window.XLD.consumeOpenRequest?.();
      if(open?.trackId)openTrackById(open.trackId);
      else if(open?.source)logAnalysis('runtime.assets.openMissing');
    }
  } catch(error){logAnalysis('runtime.assets.openFailed');}
  finally{acceptingOpenRequest=false;}
}
window.XLD.onOpenRequest?.(acceptOpenRequest);
window.addEventListener('focus',acceptOpenRequest);

async function bootstrap() {
  applyFontScale(Number(localStorage.getItem('xld:fontScale') || 1));
  setTransportIcon(dom.shuffleButton, 'shuffle');
  setTransportIcon(dom.previousButton, 'previous');
  setTransportIcon(dom.playButton, 'play');
  setTransportIcon(dom.nextButton, 'next');
  setTransportIcon(dom.repeatButton, 'repeat');
  renderRepeatTitle();
  renderNowPlayingCopy();
  renderSegmentStatus();
  renderIntegrationStatus();
  renderAnalysisLogs();
  dom.audioElement.volume = Number(localStorage.getItem('xld:volume') || .82);
  dom.volumeBar.value = String(dom.audioElement.volume);
  await refreshLibrary();
  const [engines, settings, task, separationModes] = await Promise.all([
    window.XLD.getAnalysisEngines(),
    window.XLD.getAnalysisSettings(),
    window.XLD.getAnalysisTask(),
    window.XLD.getSeparationModes ? window.XLD.getSeparationModes() : Promise.resolve(['none'])
  ]);
  state.engines = (engines || []).filter(engine => KNOWN_ENGINE_IDS.includes(engine.id));
  state.separationModes = Array.isArray(separationModes) && separationModes.length ? separationModes : ['none'];
  if (dom.separationToggleRow && state.separationModes.includes('demucs')) {
    dom.separationToggleRow.classList.remove('hidden');
  }
  state.settings = settings;
  state.selectedEngineByLab.section = state.engines.find(engine => SECTION_ENGINE_IDS.includes(engine.id) && engine.available)?.id || null;
  state.selectedEngineByLab.harmony = state.engines.find(engine => HARMONY_ENGINE_IDS.includes(engine.id) && engine.available)?.id || null;
  state.selectedEngine = state.selectedEngineByLab.section;
  dom.analysisRootLabel.textContent = compactPath(settings?.analysisRoot || rt('runtime.common.notSet'));
  dom.analysisRootLabel.title = settings?.analysisRoot || '';
  setActiveLab('section');
  renderTracks();
  renderAnalysisTarget();
  applyTask(task);
  updateAnalyzeButton();
  const rememberedTrack = localStorage.getItem('xld:selectedTrack');
  const rememberedAlbum = state.library?.albums?.find(album => album.tracks.some(track => track.id === rememberedTrack));
  if (rememberedAlbum) {
    selectAlbum(rememberedAlbum);
    await selectTrack(rememberedAlbum.tracks.find(track => track.id === rememberedTrack));
  }
  workspaceControls.show('overview');
  workspaceControls.showLibrary(state.selectedTrack ? 'tracks' : 'albums');
  state.bootstrapped = true;
  window.__xldAppReady = true;
  await acceptOpenRequest();
}

workspaceControls = window.XldWorkspaceControls.create({
  getState: () => state, getDerived: () => derivedControls.snapshot(), audio: dom.audioElement, rt,
  setActiveLab, setDerivedView: value => derivedControls.setView(value), selectAlbum,
  refresh: async () => {
    const track = state.selectedTrack;
    if (track) await Promise.all([loadTrackAnalysis(track.id), derivedControls.refresh(), refreshAnalysisSummary()]);
  }
});
bootstrap().catch(error => {
  state.libraryView = { kind: 'initFailed' };
  dom.librarySummary.textContent = rt('runtime.app.initFailed');
  logAnalysis(error.stack || error.message);
});
