'use strict';

const SUPPORTED_LOCALES = Object.freeze(['zh-CN', 'en-US']);
const DEFAULT_LOCALE = 'zh-CN';

const NATIVE_MESSAGES = Object.freeze({
  'zh-CN': Object.freeze({
    'dialog.library.chooseTitle': '选择本地音乐库',
    'dialog.analysis.chooseTitle': '选择 XLD 分析资料库'
  }),
  'en-US': Object.freeze({
    'dialog.library.chooseTitle': 'Choose local music library',
    'dialog.analysis.chooseTitle': 'Choose XLD analysis repository'
  })
});

function normalizeLocale(locale) {
  return SUPPORTED_LOCALES.includes(locale) ? locale : null;
}

function createMainLocaleController(options = {}) {
  let rendererLocale = normalizeLocale(options.rendererLocale) || DEFAULT_LOCALE;
  let hostLocale = normalizeLocale(options.hostLocale);

  function getState() {
    return Object.freeze({
      locale: hostLocale || rendererLocale || DEFAULT_LOCALE,
      source: hostLocale ? 'host' : 'renderer',
      rendererLocale,
      hostLocale
    });
  }

  function setRendererLocale(locale) {
    const normalized = normalizeLocale(locale);
    if (!normalized) throw new RangeError(`unsupported-locale:${String(locale)}`);
    rendererLocale = normalized;
    return getState();
  }

  function setHostLocale(locale) {
    const normalized = normalizeLocale(locale);
    if (!normalized) throw new RangeError(`unsupported-locale:${String(locale)}`);
    hostLocale = normalized;
    return getState();
  }

  function clearHostLocale() {
    hostLocale = null;
    return getState();
  }

  function message(key) {
    const locale = getState().locale;
    return NATIVE_MESSAGES[locale]?.[key] || NATIVE_MESSAGES['en-US']?.[key] || `[${key}]`;
  }

  return Object.freeze({ getState, setRendererLocale, setHostLocale, clearHostLocale, message });
}

module.exports = Object.freeze({
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  NATIVE_MESSAGES,
  normalizeLocale,
  createMainLocaleController
});
