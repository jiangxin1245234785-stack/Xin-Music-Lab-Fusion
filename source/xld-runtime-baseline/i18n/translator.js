(function initXldTranslator(root, factory) {
  const catalogs = typeof module === 'object' && module.exports
    ? require('./catalogs.js')
    : root.XLDI18nCatalogs;
  const api = factory(catalogs);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.XLDI18nTranslator = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createTranslator(catalogModule) {
  'use strict';

  if (!catalogModule) throw new Error('xld-i18n-catalogs-missing');

  const {
    DEFAULT_LOCALE,
    FALLBACK_LOCALE,
    MESSAGE_CATALOGS,
    isSupportedLocale
  } = catalogModule;

  function interpolate(template, params) {
    if (!params) return template;
    return template.replace(/\{([A-Za-z0-9_.-]+)\}/g, (match, name) => (
      Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
    ));
  }

  function translateMessage(locale, key, params, options) {
    const config = options || {};
    const catalogs = config.catalogs || MESSAGE_CATALOGS;
    const requestedLocale = isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
    const localeOrder = requestedLocale === FALLBACK_LOCALE
      ? [requestedLocale]
      : [requestedLocale, FALLBACK_LOCALE];

    for (const candidateLocale of localeOrder) {
      const candidate = catalogs[candidateLocale] && catalogs[candidateLocale][key];
      if (typeof candidate === 'string') return interpolate(candidate, params);
    }

    if (typeof config.onMissing === 'function') {
      config.onMissing(Object.freeze({ key, requestedLocale, fallbackLocale: FALLBACK_LOCALE }));
    }
    return `[${key}]`;
  }

  function createTranslator(getLocale, options) {
    if (typeof getLocale !== 'function') throw new TypeError('getLocale must be a function');
    return (key, params) => translateMessage(getLocale(), key, params, options);
  }

  return Object.freeze({ interpolate, translateMessage, createTranslator });
});
