'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const api = require('../product-control-dock.js');

const source = fs.readFileSync(
  path.resolve(__dirname, '..', 'product-control-dock.js'),
  'utf8'
);

class FakeElement {
  constructor(role = '') {
    this.role = role;
    this.dataset = {};
    this.listeners = new Map();
    this.children = [];
    this.disabled = false;
    this.value = '';
    this.textContent = '';
    this.style = { setProperty: (name, value) => { this.style[name] = value; } };
    this.ownerDocument = { defaultView: { Event } };
  }
  querySelector(selector) {
    return this.children.find(child => child.role === selector) || null;
  }
  addEventListener(name, listener) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(listener);
  }
  removeEventListener(name, listener) { this.listeners.get(name)?.delete(listener); }
  dispatchEvent(event) {
    for (const listener of this.listeners.get(event.type) || []) {
      listener({ target: this, type: event.type });
    }
    return true;
  }
  click() { this.dispatchEvent(new Event('click')); }
}

(async () => {
  assert.equal(api.CONTRACT, 'xin.xml-product-control-dock/1');
  assert.equal(api.VERSION, '5.5.0-productization');
  assert.equal(api.UPDATE_INTERVAL_MS, 250);

  const roles = [
    '[data-product-fx-master]',
    '[data-product-fx-master-output]',
    '[data-product-quality]',
    '[data-product-source]',
    '[data-product-source-label]',
    '[data-product-source-meta]',
    '[data-product-open-xld]',
    '[data-product-open-generator]',
    '[data-product-tool-state]'
  ];
  const root = new FakeElement();
  root.children = roles.map(role => new FakeElement(role));
  const masterSource = new FakeElement();
  masterSource.value = '125';
  const qualitySource = new FakeElement();
  qualitySource.dataset.mode = 'auto';
  qualitySource.addEventListener('click', () => {
    qualitySource.dataset.mode = qualitySource.dataset.mode === 'auto'
      ? 'high'
      : qualitySource.dataset.mode === 'high'
        ? 'eco'
        : 'auto';
  });
  let inspectorOpens = 0;
  let xldOpens = 0;
  let generatorOpens = 0;
  const control = api.create({
    root,
    masterSource,
    qualitySource,
    openInspector: () => { inspectorOpens++; return { ok: true }; },
    openXld: async () => { xldOpens++; return { ok: true }; },
    openGenerator: async () => { generatorOpens++; return { ok: true }; }
  });

  assert.equal(control.status().masterPercent, 125);
  assert.equal(control.status().qualityMode, 'auto');
  root.querySelector('[data-product-fx-master]').value = '170';
  root.querySelector('[data-product-fx-master]').dispatchEvent(new Event('input'));
  assert.equal(masterSource.value, '170');
  assert.equal(control.status().masterPercent, 170);
  assert.equal(root.querySelector('[data-product-fx-master-output]').textContent, '170%');

  root.querySelector('[data-product-quality]').click();
  await Promise.resolve();
  assert.equal(control.status().qualityMode, 'high');
  assert.equal(root.querySelector('[data-product-quality]').textContent, 'QUALITY HIGH');

  const frame = {
    meta: {
      loudness: {
        available: true,
        sourceProvider: 'realtime.core',
        confidence: 0.88
      },
      sectionId: {
        available: true,
        sourceProvider: 'xld.songformer',
        confidence: 0.94
      }
    }
  };
  control.update(1000, frame, { sourceMode: 'internal' });
  assert.equal(control.status().source.label, 'LOCAL + XLD');
  assert.equal(control.status().source.provider, 'realtime.core + xld.songformer');
  assert.equal(control.status().source.confidence, 0.94);
  control.update(1100, null, { sourceMode: 'external' });
  assert.equal(control.status().source.label, 'LOCAL + XLD');
  control.update(1250, null, { sourceMode: 'external' });
  assert.equal(control.status().source.label, 'LIVE INPUT');

  root.querySelector('[data-product-source]').click();
  assert.equal(inspectorOpens, 1);
  await control.launch('xld');
  await control.launch('generator');
  assert.equal(xldOpens, 1);
  assert.equal(generatorOpens, 1);
  assert.equal(control.status().lastTool, 'generator');
  assert.equal(control.status().desktopTools, true);

  control.dispose();
  assert.equal(root.querySelector('[data-product-open-xld]').listeners.get('click')?.size, 0);
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
    delegatedMaster: true,
    delegatedQuality: true,
    sourceInspectorSummary: true,
    advancedTools: ['xld', 'generator'],
    zeroGpu: true,
    zeroRaf: true,
    mappingFree: true
  }, null, 2));
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
