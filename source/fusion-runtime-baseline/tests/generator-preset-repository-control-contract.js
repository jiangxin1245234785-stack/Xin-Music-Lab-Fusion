'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const api = require('../generator-preset-repository-control.js');

const source = fs.readFileSync(
  path.resolve(__dirname, '..', 'generator-preset-repository-control.js'),
  'utf8'
);

class FakeElement {
  constructor(role = '') {
    this.role = role;
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.children = [];
    this.disabled = false;
    this.textContent = '';
  }
  querySelector(selector) {
    return this.children.find(child => child.role === selector) || null;
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) || null; }
  addEventListener(name, listener) { this.listeners.set(name, listener); }
  removeEventListener(name) { this.listeners.delete(name); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = [...children]; }
}

const presetJson = (id, name = id) => JSON.stringify({
  schemaVersion: 15,
  id,
  name,
  mappings: []
});

(async () => {
  assert.equal(api.CONTRACT, 'xin.xml-generator-preset-repository-ui/1');
  assert.equal(api.VERSION, '5.4.0-file-repository-ui');
  assert.deepEqual(api.CATEGORY_ORDER, ['builtIn', 'user', 'recovered']);

  const root = new FakeElement();
  const roles = [
    '[data-preset-repository-counts]',
    '[data-preset-repository-path]',
    '[data-preset-repository-status]',
    '[data-preset-repository-save]',
    '[data-preset-repository-refresh]',
    '[data-preset-repository-category="builtIn"]',
    '[data-preset-repository-category="user"]',
    '[data-preset-repository-category="recovered"]'
  ];
  root.children = roles.map(role => new FakeElement(role));
  root.ownerDocument = { createElement: () => new FakeElement() };

  const files = {
    user: new Map([['saved.json', presetJson('saved', 'Saved')]]),
    recovered: new Map([['recovery.json', presetJson('recovery', 'Recovery')]])
  };
  const entry = (category, key, json) => {
    const parsed = JSON.parse(json);
    return {
      category,
      key,
      id: parsed.id,
      name: parsed.name,
      schemaVersion: parsed.schemaVersion,
      readOnly: category !== 'user'
    };
  };
  const listing = () => ({
    ok: true,
    repository: {
      contract: 'xin.glitch-preset-repository/1',
      version: '5.4.0-file-repository',
      root: 'fixture://Glitch Presets',
      categories: {
        builtIn: [],
        user: [...files.user].map(([key, json]) => entry('user', key, json)),
        recovered: [...files.recovered].map(([key, json]) => entry('recovered', key, json))
      },
      warnings: []
    }
  });
  const loaded = [];
  const selected = [];
  const control = api.create({
    root,
    builtInProvider: () => [
      { id: 'balanced', name: 'Balanced', schemaVersion: 15 },
      { id: 'fracture', name: 'Fracture', schemaVersion: 15 }
    ],
    exportProvider: () => ({
      filename: 'current.json',
      json: presetJson('current', 'Current'),
      preset: { id: 'current', name: 'Current', schemaVersion: 15 }
    }),
    importProvider: (json, filename) => {
      const preset = JSON.parse(json);
      loaded.push({ id: preset.id, filename });
      return { applied: true, appliedPreset: preset };
    },
    selectBuiltIn: id => {
      selected.push(id);
      return { id, name: id === 'balanced' ? 'Balanced' : 'Fracture' };
    },
    repositoryBridge: {
      presetRepositoryList: async () => listing(),
      presetRepositorySave: async payload => {
        files.user.set(payload.filename, payload.json);
        return { ok: true, entry: entry('user', payload.filename, payload.json) };
      },
      presetRepositoryRead: async (category, key) => ({
        ok: true,
        entry: entry(category, key, files[category].get(key)),
        json: files[category].get(key)
      }),
      presetRepositoryRemove: async (category, key) => ({
        ok: files[category].delete(key), category, key
      })
    }
  });

  await control.ready();
  assert.equal(control.status().state, 'ready');
  assert.equal(control.status().root, 'fixture://Glitch Presets');
  assert.deepEqual(control.status().counts, { builtIn: 2, user: 1, recovered: 1 });
  assert.equal(control.status().desktopRepository, true);
  assert.equal(root.getAttribute('aria-busy'), 'false');

  const saved = await control.saveCurrent();
  assert.equal(saved.ok, true);
  assert.equal(control.status().counts.user, 2);
  await control.load('builtIn', 'fracture');
  await control.load('user', 'current.json');
  await control.load('recovered', 'recovery.json');
  assert.deepEqual(selected, ['fracture']);
  assert.deepEqual(loaded.map(item => item.id), ['current', 'recovery']);

  const rejected = await control.remove('recovered', 'recovery.json');
  assert.equal(rejected, null);
  assert.equal(control.status().lastError, 'PRESET_REPOSITORY_ENTRY_READ_ONLY');
  await control.remove('user', 'current.json');
  assert.equal(control.status().counts.user, 1);

  control.dispose();
  assert.equal(root.listeners.has('click'), false);
  for (const forbidden of [
    'requestAnimationFrame',
    'getContext(',
    'Math.random(',
    'performance.now(',
    'Date.now(',
    "sourceId: 'audio.",
    'targetId:'
  ]) assert.equal(source.includes(forbidden), false, forbidden);

  console.log(JSON.stringify({
    contract: api.CONTRACT,
    version: api.VERSION,
    categoriesIsolated: true,
    readOnlyBoundaries: true,
    zeroGpu: true,
    zeroRaf: true,
    mappingFree: true
  }, null, 2));
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
