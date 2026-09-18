(function initMusicLabDesktopLocaleBridge(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.XinMusicLabDesktopLocaleBridge = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createDesktopLocaleBridgeModule(root) {
  'use strict';

  function mountDesktopLocaleBridge(target) {
    const host = target || root;
    const locale = host?.xinMusicLabLocale;
    const desktop = host?.SmokeResonanceDesktop;
    if (!locale || typeof desktop?.setLocale !== 'function') return null;
    if (host.__xinMusicLabDesktopLocaleBridge) return host.__xinMusicLabDesktopLocaleBridge;

    let lastResult = null;
    let sequence = 0;
    const sync = state => {
      const request = ++sequence;
      return Promise.resolve(desktop.setLocale(state.locale))
        .then(result => {
          if (request === sequence) lastResult = result || null;
          return result;
        })
        .catch(error => {
          if (request === sequence) lastResult = { ok: false, error: error?.message || 'desktop-locale-sync-failed' };
          return lastResult;
        });
    };
    const unsubscribe = locale.subscribe(sync);
    const mounted = Object.freeze({
      ready: Promise.resolve(desktop.getLocale?.()).catch(() => null).then(() => sync(locale.getState())),
      status: () => Object.freeze({ sequence, locale: locale.getState().locale, lastResult }),
      destroy: () => unsubscribe?.()
    });
    Object.defineProperty(host, '__xinMusicLabDesktopLocaleBridge', { value: mounted, enumerable: false });
    return mounted;
  }

  if (root?.document) mountDesktopLocaleBridge(root);
  return Object.freeze({ mountDesktopLocaleBridge });
});
