import { EN_US_MESSAGES, type TranslationKey } from './en-US.js';
import type {
  MessageCatalog,
  MissingTranslationHandler,
  SupportedLocale,
  TranslationParams
} from './types.js';
import { ZH_CN_MESSAGES } from './zh-CN.js';

export interface TranslatorOptions {
  readonly catalogs?: Readonly<Record<SupportedLocale, MessageCatalog>>;
  readonly onMissingTranslation?: MissingTranslationHandler;
}

const DEFAULT_CATALOGS: Readonly<Record<SupportedLocale, MessageCatalog>> = {
  'zh-CN': ZH_CN_MESSAGES,
  'en-US': EN_US_MESSAGES
};

function interpolate(message: string, params?: TranslationParams): string {
  if (!params) return message;
  return message.replace(/\{([A-Za-z0-9_]+)\}/g, (token, name: string) => {
    const value = params[name];
    return value === undefined ? token : String(value);
  });
}

export function translateMessage(
  locale: SupportedLocale,
  key: string,
  params?: TranslationParams,
  options: TranslatorOptions = {}
): string {
  const catalogs = options.catalogs ?? DEFAULT_CATALOGS;
  const requested = catalogs[locale][key as TranslationKey];
  if (typeof requested === 'string' && requested.length > 0) {
    return interpolate(requested, params);
  }

  const fallbackOrder: readonly SupportedLocale[] =
    locale === 'en-US' ? ['zh-CN'] : ['en-US', 'zh-CN'];
  let resolvedLocale: SupportedLocale | null = null;
  let resolvedMessage: string | undefined;
  for (const fallbackLocale of fallbackOrder) {
    const candidate = catalogs[fallbackLocale][key as TranslationKey];
    if (typeof candidate === 'string' && candidate.length > 0) {
      resolvedLocale = fallbackLocale;
      resolvedMessage = candidate;
      break;
    }
  }

  options.onMissingTranslation?.({
    key,
    requestedLocale: locale,
    resolvedLocale
  });
  return interpolate(resolvedMessage ?? `[${key}]`, params);
}
