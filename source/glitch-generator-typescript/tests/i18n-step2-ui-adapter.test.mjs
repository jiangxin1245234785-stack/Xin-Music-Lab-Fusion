import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createLocaleController,
  mountLocaleUi
} from '../dist/ui/i18n/index.js';

class FakeSelect {
  value = '';
  disabled = false;
  title = '';
  attributes = new Map();
  listeners = new Map();

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  addEventListener(name, listener) {
    this.listeners.set(name, listener);
  }

  removeEventListener(name, listener) {
    if (this.listeners.get(name) === listener) this.listeners.delete(name);
  }

  change(value) {
    this.value = value;
    this.listeners.get('change')?.({ currentTarget: this });
  }
}

function createElements() {
  return {
    documentElement: { lang: '' },
    label: { textContent: '' },
    select: new FakeSelect(),
    zhOption: { textContent: '' },
    enOption: { textContent: '' },
    status: { textContent: '', dataset: {} }
  };
}

test('Step 2 DOM adapter switches only language chrome without reload', () => {
  const controller = createLocaleController();
  const elements = createElements();
  const mounted = mountLocaleUi(controller, elements);

  assert.equal(elements.documentElement.lang, 'zh-CN');
  assert.equal(elements.label.textContent, '界面语言');
  assert.equal(elements.status.textContent, '默认');
  elements.select.change('en-US');
  assert.equal(elements.documentElement.lang, 'en-US');
  assert.equal(elements.label.textContent, 'Language');
  assert.equal(elements.status.textContent, 'Local');
  assert.equal(elements.select.attributes.get('aria-label'), 'Interface language');

  mounted.dispose();
  elements.select.change('zh-CN');
  assert.equal(controller.getLocale(), 'en-US');
});

test('Step 2 host adapter takes authority and releases to local preference', () => {
  const controller = createLocaleController();
  controller.setLocalLocale('en-US');
  const elements = createElements();
  const mounted = mountLocaleUi(controller, elements);
  const hostEvents = [];
  const unsubscribe = mounted.host.subscribeLocale(state => hostEvents.push(state));

  mounted.host.setLocale('zh-CN');
  assert.equal(mounted.host.getLocale(), 'zh-CN');
  assert.equal(elements.documentElement.lang, 'zh-CN');
  assert.equal(elements.select.disabled, true);
  assert.equal(elements.status.dataset.source, 'host');
  assert.equal(elements.status.textContent, '宿主');

  mounted.host.clearLocale();
  assert.equal(mounted.host.getLocale(), 'en-US');
  assert.equal(elements.documentElement.lang, 'en-US');
  assert.equal(elements.select.disabled, false);
  assert.equal(elements.status.textContent, 'Local');
  assert.equal(hostEvents.length, 2);
  unsubscribe();
  mounted.dispose();
});
