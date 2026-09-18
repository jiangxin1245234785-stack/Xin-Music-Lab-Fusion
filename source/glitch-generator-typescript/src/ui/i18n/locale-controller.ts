import type { TranslationKey } from './en-US.js';
import { translateMessage, type TranslatorOptions } from './translator.js';
import {
  SUPPORTED_LOCALES,
  type LocaleController,
  type LocaleListener,
  type LocaleSource,
  type LocaleState,
  type LocaleStorage,
  type SupportedLocale,
  type TranslationParams
} from './types.js';

export const DEFAULT_LOCALE: SupportedLocale = 'zh-CN';
export const FALLBACK_LOCALE: SupportedLocale = 'en-US';
export const LOCALE_STORAGE_KEY =
  'xin.glitch-mapping-generator.ui.locale.v1';

export interface LocaleControllerOptions extends TranslatorOptions {
  readonly storage?: LocaleStorage | null;
  readonly hostLocale?: unknown;
}

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return (
    typeof value === 'string' &&
    (SUPPORTED_LOCALES as readonly string[]).includes(value)
  );
}

function readStoredLocale(storage?: LocaleStorage | null): SupportedLocale | null {
  if (!storage) return null;
  try {
    const value = storage.getItem(LOCALE_STORAGE_KEY);
    return isSupportedLocale(value) ? value : null;
  } catch {
    return null;
  }
}

export function createLocaleController(
  options: LocaleControllerOptions = {}
): LocaleController {
  const listeners = new Set<LocaleListener>();
  let localLocale = readStoredLocale(options.storage);
  let hostLocale = isSupportedLocale(options.hostLocale)
    ? options.hostLocale
    : null;
  let revision = 0;

  const resolve = (): LocaleState => {
    let locale: SupportedLocale = DEFAULT_LOCALE;
    let source: LocaleSource = 'default';
    if (localLocale) {
      locale = localLocale;
      source = 'local';
    }
    if (hostLocale) {
      locale = hostLocale;
      source = 'host';
    }
    return { locale, source, revision };
  };

  let state = resolve();
  const publishIfChanged = (): LocaleState => {
    const next = resolve();
    if (next.locale === state.locale && next.source === state.source) {
      return state;
    }
    revision += 1;
    state = { ...next, revision };
    for (const listener of listeners) listener(state);
    return state;
  };

  const persistLocalLocale = (): void => {
    if (!options.storage) return;
    try {
      if (localLocale) {
        options.storage.setItem(LOCALE_STORAGE_KEY, localLocale);
      } else {
        options.storage.removeItem(LOCALE_STORAGE_KEY);
      }
    } catch {
      // The in-memory preference remains authoritative for this session.
    }
  };

  const translate = (key: string, params?: TranslationParams): string =>
    translateMessage(state.locale, key, params, options);

  return {
    getState: () => state,
    getLocale: () => state.locale,
    t: (key: TranslationKey, params?: TranslationParams) =>
      translate(key, params),
    translate,
    setLocalLocale(locale: unknown) {
      localLocale = isSupportedLocale(locale) ? locale : null;
      persistLocalLocale();
      return publishIfChanged();
    },
    clearLocalLocale() {
      localLocale = null;
      persistLocalLocale();
      return publishIfChanged();
    },
    setHostLocale(locale: unknown) {
      hostLocale = isSupportedLocale(locale) ? locale : null;
      return publishIfChanged();
    },
    clearHostLocale() {
      hostLocale = null;
      return publishIfChanged();
    },
    subscribe(listener: LocaleListener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}
