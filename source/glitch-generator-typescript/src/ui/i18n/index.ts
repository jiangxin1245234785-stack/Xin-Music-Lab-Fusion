export { EN_US_MESSAGES, type TranslationKey } from './en-US.js';
export {
  EN_US_SEMANTIC_MESSAGES,
  type SemanticTranslationKey
} from './semantic-en-US.js';
export { ZH_CN_SEMANTIC_MESSAGES } from './semantic-zh-CN.js';
export { ZH_CN_MESSAGES } from './zh-CN.js';
export {
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  LOCALE_STORAGE_KEY,
  createLocaleController,
  isSupportedLocale,
  type LocaleControllerOptions
} from './locale-controller.js';
export {
  createLocaleHostAdapter,
  mountLocaleUi,
  type LocaleDomElements,
  type MountedLocaleUi
} from './locale-dom-adapter.js';
export {
  translateMessage,
  type TranslatorOptions
} from './translator.js';
export {
  SURFACE_TRANSLATIONS,
  SURFACE_TRANSLATION_COUNT
} from './surface-catalog.js';
export {
  DYNAMIC_SURFACE_TRANSLATIONS,
  DYNAMIC_SURFACE_TRANSLATION_COUNT
} from './surface-dynamic-catalog.js';
export {
  mountLocalizedSurface,
  normalizeSurfaceText,
  translateSurfaceText,
  type LocalizedSurfaceStats,
  type MountedLocalizedSurface
} from './surface-dom-adapter.js';
export {
  SUPPORTED_LOCALES,
  type LocaleController,
  type LocaleHostAdapter,
  type LocaleListener,
  type LocaleSource,
  type LocaleState,
  type LocaleStorage,
  type MessageCatalog,
  type MissingTranslationDiagnostic,
  type MissingTranslationHandler,
  type SupportedLocale,
  type TranslationParam,
  type TranslationParams
} from './types.js';
