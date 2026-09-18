import type { LocaleController, LocaleHostAdapter } from './types.js';
export interface LocaleDomElements {
    readonly documentElement: Pick<HTMLElement, 'lang'>;
    readonly label: Pick<HTMLLabelElement, 'textContent'>;
    readonly select: Pick<HTMLSelectElement, 'value' | 'disabled' | 'title' | 'setAttribute' | 'addEventListener' | 'removeEventListener'>;
    readonly zhOption: Pick<HTMLOptionElement, 'textContent'>;
    readonly enOption: Pick<HTMLOptionElement, 'textContent'>;
    readonly status: Pick<HTMLOutputElement, 'textContent' | 'dataset'>;
}
export interface MountedLocaleUi {
    readonly host: LocaleHostAdapter;
    dispose(): void;
}
export declare function createLocaleHostAdapter(controller: LocaleController): LocaleHostAdapter;
export declare function mountLocaleUi(controller: LocaleController, elements: LocaleDomElements): MountedLocaleUi;
//# sourceMappingURL=locale-dom-adapter.d.ts.map