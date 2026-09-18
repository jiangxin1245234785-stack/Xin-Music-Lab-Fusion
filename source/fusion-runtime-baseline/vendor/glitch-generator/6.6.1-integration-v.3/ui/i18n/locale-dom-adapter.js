export function createLocaleHostAdapter(controller) {
    return {
        setLocale: locale => controller.setHostLocale(locale),
        clearLocale: () => controller.clearHostLocale(),
        getLocale: () => controller.getLocale(),
        subscribeLocale: listener => controller.subscribe(listener)
    };
}
export function mountLocaleUi(controller, elements) {
    const render = (state) => {
        elements.documentElement.lang = state.locale;
        elements.label.textContent = controller.t('locale.control.label');
        elements.select.setAttribute('aria-label', controller.t('locale.control.ariaLabel'));
        elements.zhOption.textContent = controller.t('locale.option.zhCN');
        elements.enOption.textContent = controller.t('locale.option.enUS');
        elements.select.value = state.locale;
        elements.select.disabled = state.source === 'host';
        elements.select.title =
            state.source === 'host' ? controller.t('locale.hostControlled') : '';
        elements.status.textContent = controller.t(`locale.source.${state.source}`);
        elements.status.dataset.source = state.source;
    };
    const onChange = (event) => {
        const target = event.currentTarget;
        controller.setLocalLocale(target?.value);
    };
    elements.select.addEventListener('change', onChange);
    const unsubscribe = controller.subscribe(render);
    render(controller.getState());
    return {
        host: createLocaleHostAdapter(controller),
        dispose() {
            unsubscribe();
            elements.select.removeEventListener('change', onChange);
        }
    };
}
//# sourceMappingURL=locale-dom-adapter.js.map