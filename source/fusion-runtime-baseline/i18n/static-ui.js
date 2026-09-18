(function initMusicLabStaticUi(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.XinMusicLabStaticUi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createStaticUiModule(root) {
  'use strict';

  const BINDINGS = Object.freeze([
    Object.freeze({ selector: '[data-i18n]', attribute: 'textContent', datasetKey: 'i18n' }),
    Object.freeze({ selector: '[data-i18n-title]', attribute: 'title', datasetKey: 'i18nTitle' }),
    Object.freeze({ selector: '[data-i18n-aria-label]', attribute: 'aria-label', datasetKey: 'i18nAriaLabel' }),
    Object.freeze({ selector: '[data-i18n-placeholder]', attribute: 'placeholder', datasetKey: 'i18nPlaceholder' }),
    Object.freeze({ selector: '[data-i18n-alt]', attribute: 'alt', datasetKey: 'i18nAlt' })
  ]);

  function applyStaticTranslations(target) {
    const host = target || root;
    const bridge = host?.xinMusicLabLocale;
    const document = host?.document;
    if (!bridge || !document) return 0;
    let applied = 0;
    for (const binding of BINDINGS) {
      for (const element of document.querySelectorAll(binding.selector)) {
        const key = element.dataset[binding.datasetKey];
        if (!key) continue;
        const value = bridge.t(key);
        if (binding.attribute === 'textContent') element.textContent = value;
        else element.setAttribute(binding.attribute, value);
        applied += 1;
      }
    }
    return applied;
  }

  function mountStaticUi(target) {
    const host = target || root;
    if (!host?.xinMusicLabLocale || !host?.document) return null;
    if (host.__xinMusicLabStaticUi) return host.__xinMusicLabStaticUi;
    const unsubscribe = host.xinMusicLabLocale.subscribe(() => applyStaticTranslations(host));
    const mounted = Object.freeze({ apply: () => applyStaticTranslations(host), destroy: unsubscribe });
    Object.defineProperty(host, '__xinMusicLabStaticUi', { value: mounted, enumerable: false });
    return mounted;
  }

  function mountWhenReady() {
    if (!root?.document) return;
    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', () => mountStaticUi(root), { once: true });
    } else mountStaticUi(root);
  }

  mountWhenReady();
  return Object.freeze({ BINDINGS, applyStaticTranslations, mountStaticUi });
});
