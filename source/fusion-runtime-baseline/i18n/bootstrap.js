(function initMusicLabLocaleBootstrap(root, factory) {
  const controllerModule = typeof module === 'object' && module.exports ? require('./locale-controller.js') : root.XinMusicLabLocaleController;
  const api = factory(root, controllerModule);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.XinMusicLabLocaleBootstrap = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createBootstrapModule(root, controllerModule) {
  'use strict';
  if (!controllerModule) throw new Error('music-lab-locale-controller-missing');
  const LOCALE_STORAGE_KEY = 'xin.musicLab.locale';

  function createSafeStorage(host) {
    function read() { try { return host.localStorage?.getItem(LOCALE_STORAGE_KEY) || null; } catch (_error) { return null; } }
    function write(locale) { try { host.localStorage?.setItem(LOCALE_STORAGE_KEY, locale); } catch (_error) {} }
    function clear() { try { host.localStorage?.removeItem(LOCALE_STORAGE_KEY); } catch (_error) {} }
    return Object.freeze({ read, write, clear });
  }
  function bootstrapMusicLabLocale(target) {
    const host = target || root;
    if (host.xinMusicLabLocale) return host.xinMusicLabLocale;
    const storage = createSafeStorage(host);
    const controller = controllerModule.createLocaleController({ initialLocalLocale: storage.read() });
    const bridge = Object.freeze({
      getState: controller.getState,
      setLocale(locale) { const state = controller.setLocalLocale(locale); storage.write(locale); return state; },
      clearLocale() { storage.clear(); return controller.clearLocalLocale(); },
      setHostLocale: controller.setHostLocale,
      clearHostLocale: controller.clearHostLocale,
      subscribe: controller.subscribe,
      t: controller.t
    });
    Object.defineProperty(host, 'xinMusicLabLocale', { value: bridge, enumerable: true });
    Object.defineProperty(host, 'xinXmlLocale', { value: bridge, enumerable: false });
    if (host.document?.documentElement) {
      controller.subscribe(state => {
        host.document.documentElement.lang = state.locale;
        host.document.documentElement.dataset.localeSource = state.source;
      });
    }
    return bridge;
  }
  if (root?.document) bootstrapMusicLabLocale(root);
  return Object.freeze({ LOCALE_STORAGE_KEY, createSafeStorage, bootstrapMusicLabLocale });
});
