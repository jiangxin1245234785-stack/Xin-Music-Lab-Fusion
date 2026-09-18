import { type TranslatorOptions } from './translator.js';
import { type LocaleController, type LocaleStorage, type SupportedLocale } from './types.js';
export declare const DEFAULT_LOCALE: SupportedLocale;
export declare const FALLBACK_LOCALE: SupportedLocale;
export declare const LOCALE_STORAGE_KEY = "xin.glitch-mapping-generator.ui.locale.v1";
export interface LocaleControllerOptions extends TranslatorOptions {
    readonly storage?: LocaleStorage | null;
    readonly hostLocale?: unknown;
}
export declare function isSupportedLocale(value: unknown): value is SupportedLocale;
export declare function createLocaleController(options?: LocaleControllerOptions): LocaleController;
//# sourceMappingURL=locale-controller.d.ts.map