'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const api = require('../generator-preset-selector.js');

const source = fs.readFileSync(
  path.resolve(__dirname, '..', 'generator-preset-selector.js'),
  'utf8'
);

assert.equal(api.CONTRACT, 'xin.xml-generator-preset-selector/1');
assert.equal(api.VERSION, '5.2.0-product-preset-selector');
assert.equal(api.DEFAULT_STORAGE_KEY, 'xins-generator-product-preset-id');

const values = new Map([['preset', 'fracture']]);
const storage = {
  getItem: key => values.get(key) || null,
  setItem: (key, value) => values.set(key, value)
};
assert.equal(
  api.readStoredPresetId(storage, 'preset', 'balanced', [
    'balanced', 'fracture', 'impact'
  ]),
  'fracture'
);
values.set('preset', 'unknown');
assert.equal(
  api.readStoredPresetId(storage, 'preset', 'balanced', [
    'balanced', 'fracture', 'impact'
  ]),
  'balanced'
);
assert.equal(
  api.readStoredPresetId(null, 'preset', 'balanced', []),
  'balanced'
);
assert.throws(
  () => api.create({}),
  /GENERATOR_PRESET_SELECTOR_ROOT_REQUIRED/
);

class FakeElement {
  constructor(role = '') {
    this.role = role;
    this.dataset = {};
    this.attributes = new Map();
    this.children = [];
    this.listeners = new Map();
    this.className = '';
    this.textContent = '';
    this.disabled = false;
    this.classList = {
      values: new Set(),
      toggle: (name, force) => {
        if (force) this.classList.values.add(name);
        else this.classList.values.delete(name);
      }
    };
  }
  querySelector(selector) {
    return this.children.find(child => child.role === selector) || null;
  }
  querySelectorAll(selector) {
    if (selector === '[data-product-preset-id]') {
      return this.children.filter(child => child.dataset.productPresetId);
    }
    return [];
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) || null; }
  addEventListener(name, listener) { this.listeners.set(name, listener); }
  removeEventListener(name) { this.listeners.delete(name); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = [...children]; }
}

const root = new FakeElement();
const list = new FakeElement('[data-product-preset-list]');
const state = new FakeElement('[data-product-preset-state]');
const detail = new FakeElement('[data-product-preset-detail]');
root.children.push(list, state, detail);
root.ownerDocument = { createElement: () => new FakeElement() };
const summaries = ['balanced', 'fracture', 'impact'].map(id => ({
  id,
  name: id.toUpperCase(),
  description: `${id} description`,
  schemaVersion: 15,
  readOnly: true,
  category: 'built-in'
}));
let active = { id: 'balanced', revision: 0 };
const selectorStorage = new Map([[
  api.DEFAULT_STORAGE_KEY,
  'impact'
]]);
const selector = api.create({
  root,
  presetsProvider: () => summaries,
  activeProvider: () => active,
  applyPreset: id => {
    active = { id, revision: active.revision + 1 };
    return { id };
  },
  storage: {
    getItem: key => selectorStorage.get(key) || null,
    setItem: (key, value) => selectorStorage.set(key, value)
  }
});
selector.ready();
assert.equal(selector.status().state, 'ready');
assert.equal(selector.status().activeId, 'impact');
assert.equal(selector.status().revision, 1);
assert.equal(selector.status().appliedCount, 1);
assert.equal(selector.status().presetCount, 3);
assert.equal(list.children.length, 3);
assert.equal(root.getAttribute('aria-busy'), 'false');
assert.equal(
  list.children.filter(button =>
    button.getAttribute('aria-pressed') === 'true'
  ).length,
  1
);
selector.select('fracture');
assert.equal(selector.status().activeId, 'fracture');
assert.equal(selector.status().revision, 2);
assert.equal(
  selectorStorage.get(api.DEFAULT_STORAGE_KEY),
  'fracture'
);
selector.dispose();
assert.equal(root.listeners.has('click'), false);

for (const forbidden of [
  'requestAnimationFrame',
  'getContext(',
  'Math.random(',
  'performance.now(',
  'Date.now(',
  "sourceId: 'audio.",
  'targetId:'
]) {
  assert.equal(
    source.includes(forbidden),
    false,
    `selector must not own runtime, mapping or timing logic: ${forbidden}`
  );
}

console.log(JSON.stringify({
  contract: api.CONTRACT,
  version: api.VERSION,
  persistedSelectionValidated: true,
  restoredSelection: 'impact',
  hotSelection: 'fracture',
  zeroGpu: true,
  zeroRaf: true,
  mappingFree: true
}, null, 2));
