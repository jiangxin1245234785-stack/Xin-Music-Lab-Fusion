'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const api = require('../generator-preset-file-control.js');

const source = fs.readFileSync(
  path.resolve(__dirname, '..', 'generator-preset-file-control.js'),
  'utf8'
);

class FakeElement {
  constructor(role = '') {
    this.role = role;
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.disabled = false;
    this.value = '';
    this.textContent = '';
  }
  querySelector(selector) { return this.children?.find(item => item.role === selector) || null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) || null; }
  addEventListener(name, listener) { this.listeners.set(name, listener); }
  removeEventListener(name) { this.listeners.delete(name); }
  click() { this.listeners.get('click')?.({ target: this }); }
}

(async () => {
  assert.equal(api.CONTRACT, 'xin.xml-generator-preset-files-ui/1');
  assert.equal(api.VERSION, '5.3.0-product-json-files');
  assert.equal(api.MAX_JSON_BYTES, 4 * 1024 * 1024);

  const root = new FakeElement();
  const exportButton = new FakeElement('[data-product-preset-export]');
  const importButton = new FakeElement('[data-product-preset-import]');
  const input = new FakeElement('[data-product-preset-file-input]');
  const state = new FakeElement('[data-product-preset-file-state]');
  root.children = [exportButton, importButton, input, state];
  root.ownerDocument = { createElement: () => new FakeElement() };
  const validJson = JSON.stringify({ schemaVersion: 15, id: 'fixture', name: 'Fixture' });
  let imported = 0;
  const control = api.create({
    root,
    exportProvider: () => ({
      filename: 'fixture.json',
      json: validJson,
      preset: { id: 'fixture', name: 'Fixture', schemaVersion: 15 }
    }),
    stageProvider: json => json === validJson
      ? { valid: true, code: 'PRESET_READY', preset: { id: 'fixture' } }
      : { valid: false, code: 'PRESET_JSON_PARSE_FAILED' },
    importProvider: json => {
      imported++;
      return {
        valid: json === validJson,
        applied: json === validJson,
        code: 'PRESET_READY',
        appliedPreset: { id: 'fixture', name: 'Fixture', schemaVersion: 15 }
      };
    },
    desktopBridge: {
      exportGlitchPreset: async payload => ({ ok: true, path: payload.filename }),
      importGlitchPreset: async () => ({ ok: true, path: 'fixture.json', json: validJson })
    }
  });
  control.ready();
  assert.equal(control.status().state, 'ready');
  assert.equal(control.status().desktopFiles, true);
  assert.equal(root.getAttribute('aria-busy'), 'false');

  const rejected = control.importText('{broken', 'broken.json');
  assert.equal(rejected, null);
  assert.equal(imported, 0);
  assert.equal(control.status().lastError, 'PRESET_JSON_PARSE_FAILED');

  const applied = control.importText(validJson, 'fixture.json');
  assert.equal(applied.applied, true);
  assert.equal(imported, 1);
  assert.equal(control.status().imports, 1);
  assert.equal(control.status().lastFile, 'fixture.json');

  const exported = await control.exportFile();
  assert.equal(exported.ok, true);
  assert.equal(control.status().exports, 1);

  await control.requestImport();
  assert.equal(imported, 2);
  assert.equal(control.status().imports, 2);
  control.dispose();
  assert.equal(exportButton.listeners.has('click'), false);
  assert.equal(importButton.listeners.has('click'), false);

  for (const forbidden of [
    'requestAnimationFrame',
    'getContext(',
    'Math.random(',
    'performance.now(',
    'Date.now(',
    "sourceId: 'audio.",
    'targetId:'
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }

  console.log(JSON.stringify({
    contract: api.CONTRACT,
    version: api.VERSION,
    invalidRejectedBeforeApply: true,
    desktopImportExport: true,
    zeroGpu: true,
    zeroRaf: true,
    mappingFree: true
  }, null, 2));
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
