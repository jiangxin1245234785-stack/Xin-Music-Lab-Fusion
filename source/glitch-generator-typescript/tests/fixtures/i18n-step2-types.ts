import {
  createLocaleController,
  type SupportedLocale,
  type TranslationKey
} from '../../src/ui/i18n/index.js';

const controller = createLocaleController();
const locale: SupportedLocale = 'zh-CN';
const key: TranslationKey = 'locale.control.label';
controller.setLocalLocale(locale);
controller.t(key);

// @ts-expect-error Step 2 translation keys are a closed typed union.
controller.t('locale.key.that.does.not.exist');

// @ts-expect-error Step 2 supports only zh-CN and en-US.
const unsupportedLocale: SupportedLocale = 'fr-FR';
void unsupportedLocale;
