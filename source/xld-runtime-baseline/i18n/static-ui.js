(function initXldStaticUi(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.XLDStaticLocaleUi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createStaticUiModule(root) {
  'use strict';

  const BINDINGS = Object.freeze([
    Object.freeze({ selector: '[data-i18n]', keyAttribute: 'data-i18n', target: 'textContent' }),
    Object.freeze({ selector: '[data-i18n-title]', keyAttribute: 'data-i18n-title', target: 'title' }),
    Object.freeze({ selector: '[data-i18n-placeholder]', keyAttribute: 'data-i18n-placeholder', target: 'placeholder' }),
    Object.freeze({ selector: '[data-i18n-aria-label]', keyAttribute: 'data-i18n-aria-label', target: 'aria-label' }),
    Object.freeze({ selector: '[data-i18n-alt]', keyAttribute: 'data-i18n-alt', target: 'alt' })
  ]);

  function mountStaticLocaleUi(target) {
    const host = target || root;
    const bridge = host.xinXldLocale;
    const document = host.document;
    if (!bridge || !document) return null;
    if (host.__xinXldStaticLocaleUi) return host.__xinXldStaticLocaleUi;

    function render() {
      for (const binding of BINDINGS) {
        for (const element of document.querySelectorAll(binding.selector)) {
          if (element.closest('[data-i18n-raw]')) continue;
          const key = element.getAttribute(binding.keyAttribute);
          const translated = bridge.t(key);
          if (binding.target === 'textContent') element.textContent = translated;
          else element.setAttribute(binding.target, translated);
        }
      }
    }

    const unsubscribe = bridge.subscribe(render);
    const mounted = Object.freeze({ render, destroy: unsubscribe });
    Object.defineProperty(host, '__xinXldStaticLocaleUi', { value: mounted, enumerable: false });
    return mounted;
  }

  function mountWhenReady() {
    if (!root.document) return;
    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', () => mountStaticLocaleUi(root), { once: true });
    } else {
      mountStaticLocaleUi(root);
    }
  }

  mountWhenReady();
  return Object.freeze({ BINDINGS, mountStaticLocaleUi });
});
