import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EN_US_MESSAGES,
  LOCALE_STORAGE_KEY,
  ZH_CN_MESSAGES,
  createLocaleController,
  translateMessage
} from '../dist/ui/i18n/index.js';

class MemoryStorage {
  constructor(initial = {}) {
    this.values = new Map(Object.entries(initial));
    this.writes = [];
  }

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, value);
    this.writes.push([key, value]);
  }

  removeItem(key) {
    this.values.delete(key);
    this.writes.push([key, null]);
  }
}

test('Step 2 translator supports both catalogs and stable interpolation', () => {
  assert.equal(
    translateMessage('zh-CN', 'locale.current', { locale: '中文', count: 0 }),
    '当前语言：中文'
  );
  assert.equal(
    translateMessage('en-US', 'locale.current', { locale: 'English' }),
    'Current language: English'
  );
  assert.equal(ZH_CN_MESSAGES['locale.control.label'], '界面语言');
  assert.equal(EN_US_MESSAGES['locale.control.label'], 'Language');
});

test('Step 2 translator falls back to en-US and never renders blank text', () => {
  const diagnostics = [];
  const catalogs = {
    'zh-CN': {},
    'en-US': { 'locale.control.label': 'Language fallback' }
  };
  assert.equal(
    translateMessage('zh-CN', 'locale.control.label', undefined, {
      catalogs,
      onMissingTranslation: diagnostic => diagnostics.push(diagnostic)
    }),
    'Language fallback'
  );
  assert.deepEqual(diagnostics, [{
    key: 'locale.control.label',
    requestedLocale: 'zh-CN',
    resolvedLocale: 'en-US'
  }]);

  assert.equal(
    translateMessage('zh-CN', 'unknown.dynamic.key', undefined, {
      catalogs: { 'zh-CN': {}, 'en-US': {} }
    }),
    '[unknown.dynamic.key]'
  );
});

test('Step 2 locale priority is host over local over zh-CN default', () => {
  const storage = new MemoryStorage({ [LOCALE_STORAGE_KEY]: 'en-US' });
  const controller = createLocaleController({ storage });
  const notifications = [];
  const unsubscribe = controller.subscribe(state => notifications.push(state));

  assert.deepEqual(controller.getState(), {
    locale: 'en-US', source: 'local', revision: 0
  });
  controller.setHostLocale('zh-CN');
  assert.deepEqual(controller.getState(), {
    locale: 'zh-CN', source: 'host', revision: 1
  });

  controller.setLocalLocale('en-US');
  assert.equal(controller.getLocale(), 'zh-CN');
  assert.equal(notifications.length, 1, 'hidden local changes do not repaint');
  controller.clearHostLocale();
  assert.deepEqual(controller.getState(), {
    locale: 'en-US', source: 'local', revision: 2
  });
  controller.setLocalLocale('en-US');
  assert.equal(notifications.length, 2, 'idempotent writes do not repaint');
  unsubscribe();
  controller.setLocalLocale('zh-CN');
  assert.equal(notifications.length, 2, 'unsubscribe is effective');

  assert.ok(storage.writes.every(([key]) => key === LOCALE_STORAGE_KEY));
});

test('Step 2 invalid values and failing localStorage remain safe in memory', () => {
  const brokenRead = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); }
  };
  const controller = createLocaleController({ storage: brokenRead });
  assert.equal(controller.getLocale(), 'zh-CN');
  controller.setLocalLocale('en-US');
  assert.deepEqual(controller.getState(), {
    locale: 'en-US', source: 'local', revision: 1
  });
  controller.setHostLocale('fr-FR');
  assert.equal(controller.getLocale(), 'en-US');
  controller.setLocalLocale('corrupt');
  assert.deepEqual(controller.getState(), {
    locale: 'zh-CN', source: 'default', revision: 2
  });
});
