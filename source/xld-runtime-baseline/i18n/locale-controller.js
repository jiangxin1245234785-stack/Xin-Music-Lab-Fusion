(function initXldLocaleController(root, factory) {
  const catalogs = typeof module === 'object' && module.exports
    ? require('./catalogs.js')
    : root.XLDI18nCatalogs;
  const translator = typeof module === 'object' && module.exports
    ? require('./translator.js')
    : root.XLDI18nTranslator;
  const api = factory(catalogs, translator);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.XLDLocaleController = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createControllerModule(catalogModule, translatorModule) {
  'use strict';

  if (!catalogModule || !translatorModule) throw new Error('xld-i18n-dependency-missing');
  const { DEFAULT_LOCALE, isSupportedLocale } = catalogModule;
  const { translateMessage } = translatorModule;

  function createLocaleController(options) {
    const config = options || {};
    const defaultLocale = isSupportedLocale(config.defaultLocale)
      ? config.defaultLocale
      : DEFAULT_LOCALE;
    let localLocale = isSupportedLocale(config.initialLocalLocale)
      ? config.initialLocalLocale
      : null;
    let hostLocale = isSupportedLocale(config.initialHostLocale)
      ? config.initialHostLocale
      : null;
    const listeners = new Set();

    function resolveState() {
      if (hostLocale) return Object.freeze({ locale: hostLocale, source: 'host' });
      if (localLocale) return Object.freeze({ locale: localLocale, source: 'local' });
      return Object.freeze({ locale: defaultLocale, source: 'default' });
    }

    let state = resolveState();

    function publishIfChanged() {
      const next = resolveState();
      if (next.locale === state.locale && next.source === state.source) return state;
      state = next;
      for (const listener of listeners) listener(state);
      return state;
    }

    function assertLocale(locale) {
      if (!isSupportedLocale(locale)) throw new RangeError(`unsupported-locale:${String(locale)}`);
      return locale;
    }

    function setLocalLocale(locale) {
      localLocale = assertLocale(locale);
      return publishIfChanged();
    }

    function clearLocalLocale() {
      localLocale = null;
      return publishIfChanged();
    }

    function setHostLocale(locale) {
      hostLocale = assertLocale(locale);
      return publishIfChanged();
    }

    function clearHostLocale() {
      hostLocale = null;
      return publishIfChanged();
    }

    function subscribe(listener, emitCurrent) {
      if (typeof listener !== 'function') throw new TypeError('listener must be a function');
      listeners.add(listener);
      if (emitCurrent !== false) listener(state);
      return () => listeners.delete(listener);
    }

    function t(key, params, translatorOptions) {
      return translateMessage(state.locale, key, params, translatorOptions);
    }

    return Object.freeze({
      getState: () => state,
      setLocalLocale,
      clearLocalLocale,
      setHostLocale,
      clearHostLocale,
      subscribe,
      t
    });
  }

  return Object.freeze({ createLocaleController });
});
