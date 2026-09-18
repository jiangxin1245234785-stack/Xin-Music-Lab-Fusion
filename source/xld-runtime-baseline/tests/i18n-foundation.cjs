const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const catalogs = require('../i18n/catalogs.js');
const { translateMessage } = require('../i18n/translator.js');
const { createLocaleController } = require('../i18n/locale-controller.js');
const { bootstrapXldLocale } = require('../i18n/bootstrap.js');

assert.deepEqual(catalogs.SUPPORTED_LOCALES, ['zh-CN', 'en-US']);
assert.equal(catalogs.DEFAULT_LOCALE, 'zh-CN');
assert.equal(catalogs.FALLBACK_LOCALE, 'en-US');
assert.equal(translateMessage('zh-CN', 'locale.control.label'), '语言');
assert.equal(translateMessage('en-US', 'locale.control.label'), 'Language');

const fallbackCatalogs = {
  'zh-CN': {},
  'en-US': { greeting: 'Hello {name}' }
};
assert.equal(
  translateMessage('zh-CN', 'greeting', { name: 'Xin' }, { catalogs: fallbackCatalogs }),
  'Hello Xin'
);

let missingDiagnostic = null;
assert.equal(
  translateMessage('zh-CN', 'missing.key', null, {
    catalogs: fallbackCatalogs,
    onMissing: diagnostic => { missingDiagnostic = diagnostic; }
  }),
  '[missing.key]'
);
assert.deepEqual(missingDiagnostic, {
  key: 'missing.key',
  requestedLocale: 'zh-CN',
  fallbackLocale: 'en-US'
});

const controller = createLocaleController();
assert.deepEqual(controller.getState(), { locale: 'zh-CN', source: 'default' });
controller.setLocalLocale('en-US');
assert.deepEqual(controller.getState(), { locale: 'en-US', source: 'local' });
controller.setHostLocale('zh-CN');
assert.deepEqual(controller.getState(), { locale: 'zh-CN', source: 'host' });
controller.setLocalLocale('en-US');
assert.deepEqual(controller.getState(), { locale: 'zh-CN', source: 'host' });
controller.clearHostLocale();
assert.deepEqual(controller.getState(), { locale: 'en-US', source: 'local' });
assert.throws(() => controller.setLocalLocale('fr-FR'), /unsupported-locale/);

const fakeDocument = { documentElement: { lang: '', dataset: {} } };
const fakeWindow = { document: fakeDocument };
const bridge = bootstrapXldLocale(fakeWindow);
assert.equal(fakeDocument.documentElement.lang, 'zh-CN');
assert.equal(fakeDocument.documentElement.dataset.localeSource, 'default');
bridge.setHostLocale('en-US');
assert.equal(fakeDocument.documentElement.lang, 'en-US');
assert.equal(fakeDocument.documentElement.dataset.localeSource, 'host');
assert.equal(bootstrapXldLocale(fakeWindow), bridge);

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const appIndex = html.indexOf('<script src="app.js"></script>');
for (const script of [
  'i18n/catalogs.js',
  'i18n/translator.js',
  'i18n/locale-controller.js',
  'i18n/bootstrap.js'
]) {
  const scriptIndex = html.indexOf(`<script src="${script}"></script>`);
  assert.ok(scriptIndex >= 0, `${script} must be mounted`);
  assert.ok(scriptIndex < appIndex, `${script} must load before app.js`);
}

console.log('XLD i18n foundation: PASS');
