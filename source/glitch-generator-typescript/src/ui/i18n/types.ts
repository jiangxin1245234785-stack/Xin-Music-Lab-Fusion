import type { TranslationKey } from './en-US.js';

export const SUPPORTED_LOCALES = ['zh-CN', 'en-US'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export type LocaleSource = 'default' | 'local' | 'host';
export type TranslationParam = string | number | boolean;
export type TranslationParams = Readonly<Record<string, TranslationParam>>;
export type MessageCatalog = Readonly<Partial<Record<TranslationKey, string>>>;

export interface LocaleState {
  readonly locale: SupportedLocale;
  readonly source: LocaleSource;
  readonly revision: number;
}

export interface MissingTranslationDiagnostic {
  readonly key: string;
  readonly requestedLocale: SupportedLocale;
  readonly resolvedLocale: SupportedLocale | null;
}

export type MissingTranslationHandler = (
  diagnostic: MissingTranslationDiagnostic
) => void;

export interface LocaleStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type LocaleListener = (state: LocaleState) => void;

export interface LocaleController {
  getState(): LocaleState;
  getLocale(): SupportedLocale;
  t(key: TranslationKey, params?: TranslationParams): string;
  translate(key: string, params?: TranslationParams): string;
  setLocalLocale(locale: unknown): LocaleState;
  clearLocalLocale(): LocaleState;
  setHostLocale(locale: unknown): LocaleState;
  clearHostLocale(): LocaleState;
  subscribe(listener: LocaleListener): () => void;
}

export interface LocaleHostAdapter {
  setLocale(locale: unknown): LocaleState;
  clearLocale(): LocaleState;
  getLocale(): SupportedLocale;
  subscribeLocale(listener: LocaleListener): () => void;
}
