// The shell's own behaviour: the settings drawer, and keeping the two drawers and the older
// floating panels from sitting on top of each other. The library drawer itself is the Fusion
// panel and is still opened and closed by fusion.js; this file only asks it to.
(function (root) {
  'use strict';
  const find = selector => root.document.querySelector(selector);
  const settings = find('#xlSettings'), settingsButton = find('#xlSettingsButton'), settingsClose = find('#xlSettingsClose');
  const library = find('#fusionPanel'), libraryButton = find('#fusionButton'), libraryClose = find('#fusionClose'), now = find('#xlNow');
  if (!settings || !settingsButton || !library || !libraryButton) return;

  // The existing controls own their state. Reflect it without adding a second toggle handler.
  const switches = [...root.document.querySelectorAll('button.xl-switch')];
  const syncSwitch = button => button.setAttribute('aria-checked', String(button.getAttribute('aria-pressed') === 'true'));
  const switchObserver = new MutationObserver(records => records.forEach(record => syncSwitch(record.target)));
  for (const button of switches) { syncSwitch(button); switchObserver.observe(button, {attributes: true, attributeFilter: ['aria-pressed']}); }
  root.addEventListener('beforeunload', () => switchObserver.disconnect(), {once: true});

  const isOpen = panel => panel.classList.contains('is-open');
  function setSettings(open) {
    settings.classList.toggle('is-open', open);
    settings.setAttribute('aria-hidden', String(!open));
    settingsButton.setAttribute('aria-expanded', String(open));
  }
  const closeLibrary = () => { if (isOpen(library) && libraryClose) libraryClose.click(); };

  settingsButton.addEventListener('click', () => {
    const open = !isOpen(settings);
    if (open) closeLibrary();
    setSettings(open);
  });
  if (settingsClose) settingsClose.addEventListener('click', () => setSettings(false));
  // One drawer at a time.
  libraryButton.addEventListener('click', () => setSettings(false));
  // The song in the top bar is the way into the library.
  if (now) now.addEventListener('click', () => { setSettings(false); if (isOpen(library)) closeLibrary(); else libraryButton.click(); });
  // The detail panels open over the picture; the drawer that launched them steps aside.
  for (const id of ['paletteButton', 'glitchSettingsButton']) {
    const button = find('#' + id);
    if (button) button.addEventListener('click', () => setSettings(false));
  }
  root.document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (isOpen(settings)) setSettings(false);
    else closeLibrary();
  });

  // Where the music and the analysis results are. The folders are shared with XLD; picking one
  // here rescans the library through the same button a person would press.
  const bridge = root.XinsMusicLabFusion, i18n = root.XinMusicLabDynamicUi;
  const say = (key, fallback, params) => (i18n && typeof i18n.t === 'function' && i18n.t(key, params || {}, fallback)) || fallback;
  const analysisRoot = find('#xlAnalysisRoot'), refresh = find('#fusionRefresh'), toast = find('#toast');
  const tell = text => { if (!toast) return; toast.textContent = text; toast.classList.add('show'); root.setTimeout(() => toast.classList.remove('show'), 2600); };
  async function showRoots() {
    if (!analysisRoot || !bridge || typeof bridge.settings !== 'function') return;
    try { const roots = await bridge.settings(); analysisRoot.textContent = say('shell.analysisRoot', '分析结果在：{path}', {path: roots.analysisRoot}).replace('{path}', roots.analysisRoot); } catch (error) { /* leave it empty */ }
  }
  async function choose(kind) {
    if (!bridge || typeof bridge.chooseFolder !== 'function') return null;
    const result = await bridge.chooseFolder(kind);
    if (result && result.ok) { await showRoots(); if (refresh) refresh.click(); }
    else if (result && result.error === 'analysis-busy') tell(say('shell.folderBusy', '有分析正在跑，等它结束再换文件夹。'));
    else if (result && !result.canceled) tell(say('shell.folderFailed', '文件夹没有保存下来。'));
    return result;
  }
  for (const [id, kind] of [['xlChooseLibrary', 'library'], ['xlChooseAnalysis', 'analysis']]) {
    const button = find('#' + id);
    if (button) button.addEventListener('click', () => { choose(kind); });
  }
  showRoots();

  root.XinShell = Object.freeze({setSettings, isSettingsOpen: () => isOpen(settings), isLibraryOpen: () => isOpen(library)});
})(globalThis);
