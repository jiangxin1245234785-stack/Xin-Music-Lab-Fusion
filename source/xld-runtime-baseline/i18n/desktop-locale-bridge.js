(function initXldDesktopLocaleBridge(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.XLDDesktopLocaleBridge = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createDesktopLocaleBridgeModule(root) {
  'use strict';

  function mountDesktopLocaleBridge(target) {
    const host = target || root;
    const locale = host.xinXldLocale;
    const desktop = host.XLD;
    if (!locale || !desktop?.setRendererLocale || !desktop?.getHostLocale) return null;
    if (host.__xinXldDesktopLocaleBridge) return host.__xinXldDesktopLocaleBridge;

    const syncRendererLocale = state => {
      if (state?.source !== 'host') desktop.setRendererLocale(state.locale).catch(() => {});
    };
    const applyHostLocale = payload => {
      const hasExplicitHost = Boolean(payload) && Object.prototype.hasOwnProperty.call(payload, 'hostLocale');
      const hostLocale = hasExplicitHost ? payload.hostLocale : (payload?.locale || null);
      if (hostLocale) locale.setHostLocale(hostLocale);
      else locale.clearHostLocale();
    };

    const unsubscribeLocale = locale.subscribe(syncRendererLocale);
    const unsubscribeHost = typeof desktop.onHostLocale === 'function'
      ? desktop.onHostLocale(applyHostLocale)
      : () => {};
    const ready = desktop.getHostLocale().then(applyHostLocale).catch(() => null);
    const mounted = Object.freeze({
      ready,
      destroy() {
        unsubscribeLocale?.();
        unsubscribeHost?.();
      }
    });
    Object.defineProperty(host, '__xinXldDesktopLocaleBridge', { value: mounted, enumerable: false });
    return mounted;
  }

  if (root?.document) mountDesktopLocaleBridge(root);
  return Object.freeze({ mountDesktopLocaleBridge });
});
