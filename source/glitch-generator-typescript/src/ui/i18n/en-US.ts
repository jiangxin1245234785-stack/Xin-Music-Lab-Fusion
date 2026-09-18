import { EN_US_SEMANTIC_MESSAGES } from './semantic-en-US.js';

export const EN_US_MESSAGES = {
  'locale.control.label': 'Language',
  'locale.control.ariaLabel': 'Interface language',
  'locale.option.zhCN': '中文',
  'locale.option.enUS': 'English',
  'locale.source.default': 'Default',
  'locale.source.local': 'Local',
  'locale.source.host': 'Host',
  'locale.hostControlled': 'Language is controlled by the host',
  'locale.current': 'Current language: {locale}',
  ...EN_US_SEMANTIC_MESSAGES
} as const;

export type TranslationKey = keyof typeof EN_US_MESSAGES;
