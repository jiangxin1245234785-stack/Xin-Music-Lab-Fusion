'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const catalogs = require('../i18n/catalogs.js');
const translator = require('../i18n/translator.js');
const controllerModule = require('../i18n/locale-controller.js');
const bootstrapModule = require('../i18n/bootstrap.js');
const inventory = require('../scripts/i18n-inventory.cjs');

const root = path.join(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

assert.deepEqual(catalogs.SUPPORTED_LOCALES, ['zh-CN', 'en-US']);
assert.equal(catalogs.DEFAULT_LOCALE, 'zh-CN');
assert.deepEqual(Object.keys(catalogs.ZH_CN_MESSAGES).sort(), Object.keys(catalogs.EN_US_MESSAGES).sort());
assert.equal(translator.translateMessage('zh-CN', 'locale.control.label'), '语言');
assert.equal(translator.translateMessage('en-US', 'locale.control.label'), 'Language');
assert.equal(translator.translateMessage('zh-CN', 'missing.key'), '[missing.key]');

const controller = controllerModule.createLocaleController({ initialLocalLocale: 'en-US' });
assert.deepEqual(controller.getState(), { locale: 'en-US', source: 'local' });
controller.setHostLocale('zh-CN');
assert.deepEqual(controller.getState(), { locale: 'zh-CN', source: 'host' });
controller.clearHostLocale();
assert.deepEqual(controller.getState(), { locale: 'en-US', source: 'local' });

const persisted = new Map();
const fakeHost = {
  localStorage: {
    getItem: key => persisted.get(key) || null,
    setItem: (key, value) => persisted.set(key, value),
    removeItem: key => persisted.delete(key)
  },
  document: { documentElement: { lang: '', dataset: {} } },
  productState: Object.freeze({ playing: true, preset: 'balanced', seed: 42, mappingCount: 5 })
};
const before = fakeHost.productState;
const bridge = bootstrapModule.bootstrapMusicLabLocale(fakeHost);
assert.equal(bridge, fakeHost.xinXmlLocale);
assert.deepEqual(bridge.getState(), { locale: 'zh-CN', source: 'default' });
bridge.setLocale('en-US');
assert.equal(persisted.get('xin.musicLab.locale'), 'en-US');
bridge.setHostLocale('zh-CN');
bridge.clearHostLocale();
assert.deepEqual(bridge.getState(), { locale: 'en-US', source: 'local' });
assert.equal(fakeHost.productState, before);
assert.deepEqual(fakeHost.productState, { playing: true, preset: 'balanced', seed: 42, mappingCount: 5 });

const brokenStorageHost = { localStorage: { getItem() { throw new Error('blocked'); } } };
assert.doesNotThrow(() => bootstrapModule.bootstrapMusicLabLocale(brokenStorageHost));
assert.deepEqual(brokenStorageHost.xinMusicLabLocale.getState(), { locale: 'zh-CN', source: 'default' });

const html = read('index.html');
const bootstrapAt = html.indexOf('./i18n/bootstrap.js');
assert.ok(bootstrapAt > 0 && bootstrapAt < html.indexOf('./app.js') && bootstrapAt < html.indexOf('./fusion.js'));
assert.ok(inventory.htmlTextCandidates > 100);
assert.ok(inventory.htmlAttributeCandidates > 50);
assert.ok(inventory.dynamicPresentationSinks > 100);
assert.doesNotMatch(read('app.js'), /XinMusicLabI18n|xinMusicLabLocale/);
assert.doesNotMatch(read('fusion.js'), /XinMusicLabI18n|xinMusicLabLocale/);

console.log(`XML i18n Step 1: PASS (${inventory.htmlTextCandidates} text, ${inventory.htmlAttributeCandidates} attributes, ${inventory.dynamicPresentationSinks} dynamic sinks)`);
