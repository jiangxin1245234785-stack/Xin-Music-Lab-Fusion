(function initMusicLabLocaleController(root, factory) {
  const catalogs = typeof module === 'object' && module.exports ? require('./catalogs.js') : root.XinMusicLabI18nCatalogs;
  const translator = typeof module === 'object' && module.exports ? require('./translator.js') : root.XinMusicLabI18nTranslator;
  const api = factory(catalogs, translator);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.XinMusicLabLocaleController = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createControllerModule(catalogModule, translatorModule) {
  'use strict';
  if (!catalogModule || !translatorModule) throw new Error('music-lab-i18n-dependency-missing');
  const { DEFAULT_LOCALE, isSupportedLocale } = catalogModule;
  const { translateMessage } = translatorModule;

  function createLocaleController(options = {}) {
    const defaultLocale = isSupportedLocale(options.defaultLocale) ? options.defaultLocale : DEFAULT_LOCALE;
    let localLocale = isSupportedLocale(options.initialLocalLocale) ? options.initialLocalLocale : null;
    let hostLocale = isSupportedLocale(options.initialHostLocale) ? options.initialHostLocale : null;
    const listeners = new Set();
    const resolve = () => Object.freeze(hostLocale
      ? { locale: hostLocale, source: 'host' }
      : localLocale ? { locale: localLocale, source: 'local' } : { locale: defaultLocale, source: 'default' });
    let state = resolve();

    function publish() {
      const next = resolve();
      if (next.locale === state.locale && next.source === state.source) return state;
      state = next;
      for (const listener of listeners) listener(state);
      return state;
    }
    function assertLocale(locale) {
      if (!isSupportedLocale(locale)) throw new RangeError(`unsupported-locale:${String(locale)}`);
      return locale;
    }
    function subscribe(listener, emitCurrent = true) {
      if (typeof listener !== 'function') throw new TypeError('listener must be a function');
      listeners.add(listener);
      if (emitCurrent) listener(state);
      return () => listeners.delete(listener);
    }
    return Object.freeze({
      getState: () => state,
      setLocalLocale(locale) { localLocale = assertLocale(locale); return publish(); },
      clearLocalLocale() { localLocale = null; return publish(); },
      setHostLocale(locale) { hostLocale = assertLocale(locale); return publish(); },
      clearHostLocale() { hostLocale = null; return publish(); },
      subscribe,
      t(key, params) { return translateMessage(state.locale, key, params); }
    });
  }
  return Object.freeze({ createLocaleController });
});
