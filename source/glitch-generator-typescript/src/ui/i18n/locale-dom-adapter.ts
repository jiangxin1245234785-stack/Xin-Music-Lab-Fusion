import type {
  LocaleController,
  LocaleHostAdapter,
  LocaleState
} from './types.js';

export interface LocaleDomElements {
  readonly documentElement: Pick<HTMLElement, 'lang'>;
  readonly label: Pick<HTMLLabelElement, 'textContent'>;
  readonly select: Pick<
    HTMLSelectElement,
    | 'value'
    | 'disabled'
    | 'title'
    | 'setAttribute'
    | 'addEventListener'
    | 'removeEventListener'
  >;
  readonly zhOption: Pick<HTMLOptionElement, 'textContent'>;
  readonly enOption: Pick<HTMLOptionElement, 'textContent'>;
  readonly status: Pick<HTMLOutputElement, 'textContent' | 'dataset'>;
}

export interface MountedLocaleUi {
  readonly host: LocaleHostAdapter;
  dispose(): void;
}

export function createLocaleHostAdapter(
  controller: LocaleController
): LocaleHostAdapter {
  return {
    setLocale: locale => controller.setHostLocale(locale),
    clearLocale: () => controller.clearHostLocale(),
    getLocale: () => controller.getLocale(),
    subscribeLocale: listener => controller.subscribe(listener)
  };
}

export function mountLocaleUi(
  controller: LocaleController,
  elements: LocaleDomElements
): MountedLocaleUi {
  const render = (state: LocaleState): void => {
    elements.documentElement.lang = state.locale;
    elements.label.textContent = controller.t('locale.control.label');
    elements.select.setAttribute(
      'aria-label',
      controller.t('locale.control.ariaLabel')
    );
    elements.zhOption.textContent = controller.t('locale.option.zhCN');
    elements.enOption.textContent = controller.t('locale.option.enUS');
    elements.select.value = state.locale;
    elements.select.disabled = state.source === 'host';
    elements.select.title =
      state.source === 'host' ? controller.t('locale.hostControlled') : '';
    elements.status.textContent = controller.t(`locale.source.${state.source}`);
    elements.status.dataset.source = state.source;
  };

  const onChange = (event: Event): void => {
    const target = event.currentTarget as { value?: unknown } | null;
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
