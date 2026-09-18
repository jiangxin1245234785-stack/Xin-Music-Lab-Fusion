(function initMusicLabTranslator(root, factory) {
  const catalogs = typeof module === 'object' && module.exports ? require('./catalogs.js') : root.XinMusicLabI18nCatalogs;
  const api = factory(catalogs);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.XinMusicLabI18nTranslator = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createTranslator(catalogModule) {
  'use strict';
  if (!catalogModule) throw new Error('music-lab-i18n-catalogs-missing');
  const { MESSAGE_CATALOGS, DEFAULT_LOCALE, FALLBACK_LOCALE, isSupportedLocale } = catalogModule;

  function interpolate(template, params) {
    const values = params || {};
    return String(template).replace(/\{([\w.-]+)\}/g, (_match, key) => (
      Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : `{${key}}`
    ));
  }
  function translateMessage(locale, key, params) {
    const requested = isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
    const message = MESSAGE_CATALOGS[requested]?.[key]
      ?? MESSAGE_CATALOGS[FALLBACK_LOCALE]?.[key]
      ?? `[${key}]`;
    return interpolate(message, params);
  }
  return Object.freeze({ interpolate, translateMessage });
});
