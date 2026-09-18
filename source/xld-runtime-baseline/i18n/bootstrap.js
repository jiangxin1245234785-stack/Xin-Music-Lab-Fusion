(function initXldLocaleBootstrap(root, factory) {
  const controllerModule = typeof module === 'object' && module.exports
    ? require('./locale-controller.js')
    : root.XLDLocaleController;
  const api = factory(root, controllerModule);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.XLDLocaleBootstrap = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createBootstrapModule(root, controllerModule) {
  'use strict';

  if (!controllerModule) throw new Error('xld-locale-controller-missing');
  const LOCALE_STORAGE_KEY = 'xin.xld.locale';

  function createSafeLocaleStorage(host) {
    function read() {
      try { return host.localStorage ? host.localStorage.getItem(LOCALE_STORAGE_KEY) : null; }
      catch (_error) { return null; }
    }
    function write(locale) {
      try { if (host.localStorage) host.localStorage.setItem(LOCALE_STORAGE_KEY, locale); }
      catch (_error) { /* In-memory locale remains usable. */ }
    }
    function clear() {
      try { if (host.localStorage) host.localStorage.removeItem(LOCALE_STORAGE_KEY); }
      catch (_error) { /* In-memory locale remains usable. */ }
    }
    return Object.freeze({ read, write, clear });
  }

  function bootstrapXldLocale(target) {
    const host = target || root;
    if (host.xinXldLocale) return host.xinXldLocale;
    const storage = createSafeLocaleStorage(host);
    const controller = controllerModule.createLocaleController({
      initialLocalLocale: storage.read()
    });

    function setLocale(locale) {
      const state = controller.setLocalLocale(locale);
      storage.write(locale);
      return state;
    }

    function clearLocale() {
      storage.clear();
      return controller.clearLocalLocale();
    }

    const bridge = Object.freeze({
      getState: controller.getState,
      setLocale,
      clearLocale,
      setHostLocale: controller.setHostLocale,
      clearHostLocale: controller.clearHostLocale,
      subscribe: controller.subscribe,
      t: controller.t
    });

    Object.defineProperty(host, 'xinXldLocale', {
      configurable: false,
      enumerable: true,
      writable: false,
      value: bridge
    });

    if (host.document && host.document.documentElement) {
      controller.subscribe(state => {
        host.document.documentElement.lang = state.locale;
        host.document.documentElement.dataset.localeSource = state.source;
      });
    }

    return bridge;
  }

  if (root && root.document) bootstrapXldLocale(root);
  return Object.freeze({ LOCALE_STORAGE_KEY, createSafeLocaleStorage, bootstrapXldLocale });
});
