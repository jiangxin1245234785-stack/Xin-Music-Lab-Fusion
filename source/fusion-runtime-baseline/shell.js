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
  const generalPage = find('#xlSettingsGeneral'), scorePage = find('#xlScoreSettings');
  const generalTitle = find('#xlGeneralTitle'), scoreTitle = find('#xlScoreTitle');
  const scoreEntry = find('#xlScoreSettingsOpen'), scoreShortcut = find('#scoreSidebarSettings'), back = find('#xlSettingsBack');
  const starPage=find('#xlStarScoreSettings'), starTitle=find('#xlStarTitle'), starEntry=find('#scoreStarSettingsOpen');
  const closeLibrary = () => { if (isOpen(library) && libraryClose) libraryClose.click(); };
  let settingsOrigin = settingsButton;
  function setSettings(open, score = false, star = false) {
    if (open) closeLibrary();
    const inScore = open && score, inStar = inScore && star;
    settings.classList.toggle('is-open', open);
    settings.setAttribute('aria-hidden', String(!open));
    settings.inert = !open;
    settingsButton.setAttribute('aria-expanded', String(open));
    if (scorePage) {
      generalPage.hidden = generalTitle.hidden = inScore;
      scorePage.hidden = scoreTitle.hidden = !inScore || inStar;
      if(starPage)starPage.hidden=starTitle.hidden=!inStar;
      if(starEntry)starEntry.setAttribute('aria-expanded',String(inStar));
      back.hidden=!inScore;
      const backKey=inStar?'score.backSettings':'shell.backSettings';
      const backText=root.XinMusicLabDynamicUi?.t?.(backKey,{},inStar?'返回谱面设置':'返回外观与设置') || (inStar?'返回谱面设置':'返回外观与设置');
      back.dataset.i18nAriaLabel=back.dataset.i18nTitle=backKey;back.setAttribute('aria-label',backText);back.title=backText;
      scoreEntry.setAttribute('aria-expanded', String(inScore));
      scoreShortcut.setAttribute('aria-expanded', String(inScore));
    }
  }
  function openSettings(from, score) {
    settingsOrigin = from;
    setSettings(true, score);
    (score ? back : settingsClose)?.focus();
  }
  function leaveScore() {
    if(starPage?.hidden===false){setSettings(true,true);starEntry.focus();return;}
    setSettings(true);
    scoreEntry.focus();
  }
  function dismissSettings() {
    const returnTo = settingsOrigin.getClientRects().length ? settingsOrigin : settingsButton;
    returnTo.focus();
    setSettings(false);
  }

  settingsButton.addEventListener('click', () => {
    if (isOpen(settings) && scorePage?.hidden !== false && starPage?.hidden !== false) dismissSettings();
    else openSettings(settingsButton, false);
  });
  starEntry?.addEventListener('click',()=>{setSettings(true,true,true);back.focus();});
  scoreEntry?.addEventListener('click', () => { setSettings(true, true); back.focus(); });
  scoreShortcut?.addEventListener('click', () => {
    if (isOpen(settings) && (!scorePage.hidden || starPage?.hidden===false)) dismissSettings();
    else openSettings(scoreShortcut, true);
  });
  back?.addEventListener('click', leaveScore);
  settingsClose?.addEventListener('click', dismissSettings);
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
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    if (isOpen(settings)) {
      event.preventDefault();
      if (scorePage?.hidden === false || starPage?.hidden===false) leaveScore();
      else dismissSettings();
    } else closeLibrary();
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
