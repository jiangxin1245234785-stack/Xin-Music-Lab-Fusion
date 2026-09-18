const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { LOCALE_STORAGE_KEY, bootstrapXldLocale } = require('../i18n/bootstrap.js');

function createStorage(initial) {
  const values = new Map(initial ? [[LOCALE_STORAGE_KEY, initial]] : []);
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    snapshot: () => Object.fromEntries(values)
  };
}

function createHost(storage) {
  return {
    localStorage: storage,
    document: { documentElement: { lang: '', dataset: {} } }
  };
}

const storage = createStorage('en-US');
const host = createHost(storage);
const bridge = bootstrapXldLocale(host);
assert.deepEqual(bridge.getState(), { locale: 'en-US', source: 'local' });
assert.equal(host.document.documentElement.lang, 'en-US');

bridge.setHostLocale('zh-CN');
assert.deepEqual(bridge.getState(), { locale: 'zh-CN', source: 'host' });
bridge.setLocale('en-US');
assert.deepEqual(bridge.getState(), { locale: 'zh-CN', source: 'host' });
assert.equal(storage.snapshot()[LOCALE_STORAGE_KEY], 'en-US');
bridge.clearHostLocale();
assert.deepEqual(bridge.getState(), { locale: 'en-US', source: 'local' });

bridge.setLocale('zh-CN');
assert.equal(storage.snapshot()[LOCALE_STORAGE_KEY], 'zh-CN');
bridge.clearLocale();
assert.deepEqual(bridge.getState(), { locale: 'zh-CN', source: 'default' });
assert.equal(storage.snapshot()[LOCALE_STORAGE_KEY], undefined);

const brokenStorageHost = createHost({
  getItem: () => { throw new Error('blocked'); },
  setItem: () => { throw new Error('blocked'); },
  removeItem: () => { throw new Error('blocked'); }
});
const memoryBridge = bootstrapXldLocale(brokenStorageHost);
memoryBridge.setLocale('en-US');
assert.deepEqual(memoryBridge.getState(), { locale: 'en-US', source: 'local' });

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.match(html, /id="localeControl"/);
assert.match(html, /data-locale="zh-CN"/);
assert.match(html, /data-locale="en-US"/);
assert.ok(html.indexOf('i18n/locale-ui.js') < html.indexOf('app.js'));

console.log('XLD i18n Step 2: PASS');
