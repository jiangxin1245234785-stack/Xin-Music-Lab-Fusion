// Presentation only. Existing controls continue to own preferences, defaults and change handlers.
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const page = byId('xlScoreSettings');
  if (!page) return;

  const groups = [...page.querySelectorAll('[data-score-group]')];
  const styleFields = [...page.querySelectorAll('[data-score-styles]')];
  const styleTitle = page.querySelector('[data-score-style-title]');
  const comparison = page.querySelector('[data-score-compare]');
  const key = 'xin-score-settings-open-group-v1';
  let open = '';
  try {
    const saved = localStorage.getItem(key);
    if (groups.some(button => button.dataset.scoreGroup === saved)) open = saved;
  } catch (_) {}

  const t = (key, params) => window.xinMusicLabLocale.t(key, params);
  function selected(id) {
    const option = byId(id).selectedOptions[0];
    return option?.dataset.i18n ? t(option.dataset.i18n) : option?.textContent || '';
  }
  function syncGroups() {
    for (const button of groups) {
      const expanded = !button.closest('section').hidden && open === button.dataset.scoreGroup;
      button.setAttribute('aria-expanded', String(expanded));
      byId(button.getAttribute('aria-controls')).hidden = !expanded;
    }
  }
  function summarize(style) {
    const on = id => byId(id).checked;
    const state = id => t(on(id) ? 'score.groupOn' : 'score.groupOff');
    const join = items => items.filter(Boolean).join(' · ');
    const hints = {};
    if (style === 'terrain') {
      hints.style = join([byId('scoreTerrainWeather').value === 'rain' && t('score.groupGlass'),
        t('score.groupRoadside', {value:selected('scoreTerrainRoadside')})]);
    } else if (style === 'glass') {
      hints.style = join([selected('scoreRadarFall'), selected('scoreRadarEcho'), selected('scoreRadarLead')]);
    } else {
      hints.style = t('score.groupStar');
    }
    hints.reading = join([on('scoreAlbumLayout') && t('score.groupSidebar'), selected('scoreAppearance'),
      on('scoreMergeTimbres') && t('score.groupMerge'), on('scoreSimplify') && t('score.groupSimplify')]);
    hints.lights = join([selected('scoreEffects'), on('scoreFxFollow') && t('score.fxFollow')]);
    const delay = window.XinScoreSceneView?.status()?.latencyMs;
    hints.timing = join([t('score.groupAuto', {value:state('scoreAutoLayers')}),
      Number.isFinite(delay) ? t('score.sync', {ms:delay}) : t('score.syncLabel')]);
    hints.import = t('score.groupImportHint');
    hints.debug = join([t('score.groupInspector', {value:state('scoreMoodDebugSwitch')}),
      style === 'terrain' && selected('scoreTerrainWeatherDriver')]);
    for (const button of groups) button.querySelector('small').textContent = hints[button.dataset.scoreGroup];
  }
  function refresh() {
    const style = byId('scoreStyle').value;
    for (const field of styleFields) field.hidden = !field.dataset.scoreStyles.split(' ').includes(style);
    comparison.hidden = !window.XinScoreCompareControls.supports(style);
    styleTitle.textContent = t('score.groupStyle', {style:selected('scoreStyle')});
    syncGroups();
    summarize(style);
  }

  page.addEventListener('click', event => {
    const button = event.target.closest('[data-score-group]');
    if (button) {
      open = open === button.dataset.scoreGroup ? '' : button.dataset.scoreGroup;
      try { localStorage.setItem(key, open); } catch (_) {}
      syncGroups();
    }
    if (event.target.closest('.score-sync')) summarize(byId('scoreStyle').value);
  });
  page.addEventListener('change', refresh);
  // The drawer is re-opened from either gear. Some settings, including the inspector, also have shortcuts.
  new MutationObserver(() => { if (!page.hidden) refresh(); }).observe(page, {attributes:true, attributeFilter:['hidden']});
  window.xinMusicLabLocale.subscribe(refresh);
})();
