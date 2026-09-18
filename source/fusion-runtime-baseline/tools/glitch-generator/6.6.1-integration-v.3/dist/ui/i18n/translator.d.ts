import type { MessageCatalog, MissingTranslationHandler, SupportedLocale, TranslationParams } from './types.js';
export interface TranslatorOptions {
    readonly catalogs?: Readonly<Record<SupportedLocale, MessageCatalog>>;
    readonly onMissingTranslation?: MissingTranslationHandler;
}
export declare function translateMessage(locale: SupportedLocale, key: string, params?: TranslationParams, options?: TranslatorOptions): string;
//# sourceMappingURL=translator.d.ts.map