(function initXldLocaleUi(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.XLDLocaleUi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createLocaleUiModule(root) {
  'use strict';

  function mountLocaleUi(target) {
    const host = target || root;
    const bridge = host.xinXldLocale;
    const document = host.document;
    if (!bridge || !document) return null;
    if (host.__xinXldLocaleUi) return host.__xinXldLocaleUi;

    const container = document.querySelector('#localeControl');
    if (!container) return null;
    const buttons = Array.from(container.querySelectorAll('[data-locale]'));

    function render(state) {
      container.dataset.localeSource = state.source;
      container.setAttribute('aria-label', bridge.t('locale.control.label'));
      for (const button of buttons) {
        const locale = button.dataset.locale;
        const active = locale === state.locale;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
        button.setAttribute('title', bridge.t(`locale.option.${locale}`));
      }
    }

    for (const button of buttons) {
      button.addEventListener('click', () => bridge.setLocale(button.dataset.locale));
    }
    const unsubscribe = bridge.subscribe(render);
    const mounted = Object.freeze({ render, destroy: unsubscribe });
    Object.defineProperty(host, '__xinXldLocaleUi', { value: mounted, enumerable: false });
    return mounted;
  }

  function mountWhenReady() {
    if (!root.document) return;
    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', () => mountLocaleUi(root), { once: true });
    } else {
      mountLocaleUi(root);
    }
  }

  mountWhenReady();
  return Object.freeze({ mountLocaleUi });
});
