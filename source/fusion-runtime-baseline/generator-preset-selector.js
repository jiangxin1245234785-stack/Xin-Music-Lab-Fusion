(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SmokeResonanceGeneratorPresetSelector = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CONTRACT = 'xin.xml-generator-preset-selector/1';
  const VERSION = '5.2.0-product-preset-selector';
  const DEFAULT_STORAGE_KEY = 'xins-generator-product-preset-id';

  const copy = value => value == null
    ? value
    : JSON.parse(JSON.stringify(value));

  function readStoredPresetId(
    storage,
    key = DEFAULT_STORAGE_KEY,
    fallback = '',
    allowedIds = []
  ) {
    let value = '';
    try {
      value = String(storage?.getItem?.(key) || '').trim();
    } catch (_) {}
    if (!value) return String(fallback || '');
    const allowed = Array.isArray(allowedIds)
      ? allowedIds.map(String)
      : [];
    return allowed.length === 0 || allowed.includes(value)
      ? value
      : String(fallback || '');
  }

  class GeneratorPresetSelector {
    constructor(options = {}) {
      if (!options.root) throw new Error('GENERATOR_PRESET_SELECTOR_ROOT_REQUIRED');
      this.root = options.root;
      this.listRoot = this.root.querySelector('[data-product-preset-list]');
      this.stateRoot = this.root.querySelector('[data-product-preset-state]');
      this.detailRoot = this.root.querySelector('[data-product-preset-detail]');
      if (!this.listRoot || !this.stateRoot || !this.detailRoot) {
        throw new Error('GENERATOR_PRESET_SELECTOR_DOM_INCOMPLETE');
      }
      this.presetsProvider = typeof options.presetsProvider === 'function'
        ? options.presetsProvider
        : () => [];
      this.activeProvider = typeof options.activeProvider === 'function'
        ? options.activeProvider
        : () => null;
      this.applyPreset = typeof options.applyPreset === 'function'
        ? options.applyPreset
        : null;
      this.storage = options.storage || null;
      this.storageKey = String(options.storageKey || DEFAULT_STORAGE_KEY);
      this.translate = typeof options.translate === 'function'
        ? options.translate
        : (_key, fallback) => fallback;
      this.presets = [];
      this.state = 'loading';
      this.activeId = '';
      this.revision = 0;
      this.lastError = null;
      this.appliedCount = 0;
      this.disposed = false;
      this.handleClick = event => {
        const button = event.target.closest?.('[data-product-preset-id]');
        if (button) this.select(button.dataset.productPresetId, 'user');
      };
      this.root.addEventListener('click', this.handleClick);
      this.presentation = null;
      this.renderState(
        'loading',
        '正在载入 Generator 产品预设…',
        'product.preset.loadingDetail'
      );
      this.unsubscribeLocale = typeof options.subscribeLocale === 'function'
        ? options.subscribeLocale(() => this.refreshLocale())
        : null;
    }

    t(key, fallback, params = {}) {
      return this.translate(key, fallback, params) || fallback;
    }

    presetName(preset) {
      const id = String(preset?.id || '');
      const fallback = preset?.name || id || 'PRESET';
      return [
        'balanced',
        'temporal-excavation',
        'raster-deflection',
        'bitplane-drift',
        'quantized-memory'
      ].includes(id)
        ? this.t(`product.preset.name.${id}`, fallback)
        : fallback;
    }

    presetDescription(preset) {
      const id = String(preset?.id || '');
      const fallback = preset?.description || '';
      return [
        'balanced',
        'temporal-excavation',
        'raster-deflection',
        'bitplane-drift',
        'quantized-memory'
      ].includes(id)
        ? this.t(`product.preset.description.${id}`, fallback)
        : fallback;
    }

    renderState(state, detail, detailKey = '', params = {}) {
      this.presentation = { state, detail, detailKey, params: { ...params } };
      this.state = state;
      this.root.dataset.state = state;
      this.root.setAttribute('aria-busy', String(state === 'loading' || state === 'applying'));
      this.stateRoot.dataset.state = state;
      const fallbackState = state === 'ready'
        ? 'READY'
        : state === 'applying'
          ? 'APPLYING'
          : state === 'error'
            ? 'ERROR'
            : 'LOADING';
      this.stateRoot.textContent = this.t(`product.preset.state.${state}`, fallbackState);
      this.detailRoot.textContent = String(
        detailKey ? this.t(detailKey, detail, params) : detail || ''
      );
      for (const button of this.listRoot.querySelectorAll('[data-product-preset-id]')) {
        button.disabled = state === 'loading' || state === 'applying' || state === 'error';
      }
    }

    renderPresets() {
      const documentRef = this.root.ownerDocument;
      this.listRoot.replaceChildren();
      for (const preset of this.presets) {
        const button = documentRef.createElement('button');
        button.type = 'button';
        button.className = 'product-preset-button';
        button.dataset.productPresetId = preset.id;
        button.setAttribute('aria-pressed', 'false');
        button.title = this.presetDescription(preset) || this.presetName(preset);
        const name = documentRef.createElement('strong');
        name.textContent = this.presetName(preset);
        const description = documentRef.createElement('small');
        description.textContent = this.presetDescription(preset);
        button.append(name, description);
        this.listRoot.append(button);
      }
    }

    ready() {
      if (this.disposed) return null;
      const presets = this.presetsProvider();
      this.presets = Array.isArray(presets)
        ? presets.filter(item => item && item.id && item.name).map(copy)
        : [];
      if (this.presets.length === 0 || !this.applyPreset) {
        return this.fail('GENERATOR_PRODUCT_PRESETS_UNAVAILABLE');
      }
      this.renderPresets();
      const active = this.activeProvider() || null;
      const activeId = String(active?.id || this.presets[0].id);
      const restoredId = readStoredPresetId(
        this.storage,
        this.storageKey,
        activeId,
        this.presets.map(preset => preset.id)
      );
      if (restoredId && restoredId !== activeId) {
        return this.select(restoredId, 'restore');
      }
      return this.sync();
    }

    sync() {
      if (this.disposed || this.presets.length === 0) return null;
      const active = this.activeProvider() || null;
      this.activeId = String(active?.id || this.activeId || this.presets[0].id);
      this.revision = Math.max(0, Number(active?.revision) || 0);
      const current = this.presets.find(preset => preset.id === this.activeId);
      for (const button of this.listRoot.querySelectorAll('[data-product-preset-id]')) {
        const selected = button.dataset.productPresetId === this.activeId;
        button.classList.toggle('is-active', selected);
        button.setAttribute('aria-pressed', String(selected));
      }
      this.lastError = null;
      this.renderState(
        'ready',
        `${this.presetName(current || { id: this.activeId, name: this.activeId })} · SCHEMA ${current?.schemaVersion || '?'} · R${this.revision}`
      );
      return copy(active);
    }

    select(id, source = 'user') {
      if (this.disposed || this.state === 'applying') return null;
      const nextId = String(id || '');
      const summary = this.presets.find(preset => preset.id === nextId);
      if (!summary) {
        this.fail('PRODUCT_PRESET_NOT_FOUND');
        return null;
      }
      const displayName = this.presetName(summary);
      this.renderState(
        'applying',
        `正在应用 ${displayName}…`,
        'product.preset.applying',
        { name: displayName }
      );
      try {
        const applied = this.applyPreset(nextId, source);
        this.appliedCount++;
        try { this.storage?.setItem?.(this.storageKey, nextId); } catch (_) {}
        this.sync();
        return copy(applied);
      } catch (error) {
        this.fail(error instanceof Error ? error.message : String(error));
        return null;
      }
    }

    fail(error) {
      this.lastError = String(error || 'GENERATOR_PRESET_SELECTOR_ERROR');
      this.renderState('error', this.lastError);
      return null;
    }

    refreshLocale() {
      if (this.presets.length > 0) {
        this.renderPresets();
        if (this.state === 'ready') return this.sync();
      }
      const presentation = this.presentation;
      if (presentation) this.renderState(
        presentation.state,
        presentation.detail,
        presentation.detailKey,
        presentation.params
      );
      return null;
    }

    status() {
      return {
        contract: CONTRACT,
        version: VERSION,
        state: this.state,
        activeId: this.activeId,
        revision: this.revision,
        appliedCount: this.appliedCount,
        presetCount: this.presets.length,
        presets: this.presets.map(copy),
        lastError: this.lastError
      };
    }

    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      this.root.removeEventListener('click', this.handleClick);
      this.unsubscribeLocale?.();
      this.unsubscribeLocale = null;
    }
  }

  return Object.freeze({
    CONTRACT,
    VERSION,
    DEFAULT_STORAGE_KEY,
    readStoredPresetId,
    create: options => new GeneratorPresetSelector(options)
  });
});
