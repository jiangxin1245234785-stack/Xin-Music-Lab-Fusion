(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SmokeResonanceGeneratorPresetRepositoryUi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CONTRACT = 'xin.xml-generator-preset-repository-ui/1';
  const VERSION = '5.4.0-file-repository-ui';
  const CATEGORY_ORDER = Object.freeze(['builtIn', 'user', 'recovered']);

  const copy = value => value == null
    ? value
    : JSON.parse(JSON.stringify(value));

  class GeneratorPresetRepositoryControl {
    constructor(options = {}) {
      if (!options.root) throw new Error('GENERATOR_PRESET_REPOSITORY_ROOT_REQUIRED');
      this.root = options.root;
      this.countRoot = this.root.querySelector('[data-preset-repository-counts]');
      this.pathRoot = this.root.querySelector('[data-preset-repository-path]');
      this.statusRoot = this.root.querySelector('[data-preset-repository-status]');
      this.saveButton = this.root.querySelector('[data-preset-repository-save]');
      this.refreshButton = this.root.querySelector('[data-preset-repository-refresh]');
      this.categoryRoots = Object.fromEntries(CATEGORY_ORDER.map(category => [
        category,
        this.root.querySelector(`[data-preset-repository-category="${category}"]`)
      ]));
      if (
        !this.countRoot || !this.pathRoot || !this.statusRoot ||
        !this.saveButton || !this.refreshButton ||
        CATEGORY_ORDER.some(category => !this.categoryRoots[category])
      ) throw new Error('GENERATOR_PRESET_REPOSITORY_DOM_INCOMPLETE');
      this.builtInProvider = typeof options.builtInProvider === 'function'
        ? options.builtInProvider
        : () => [];
      this.exportProvider = typeof options.exportProvider === 'function'
        ? options.exportProvider
        : null;
      this.importProvider = typeof options.importProvider === 'function'
        ? options.importProvider
        : null;
      this.selectBuiltIn = typeof options.selectBuiltIn === 'function'
        ? options.selectBuiltIn
        : null;
      this.repositoryBridge = options.repositoryBridge || null;
      this.translate = typeof options.translate === 'function'
        ? options.translate
        : (_key, fallback) => fallback;
      this.state = 'loading';
      this.repositoryRoot = '';
      this.categories = { builtIn: [], user: [], recovered: [] };
      this.warnings = [];
      this.lastAction = '';
      this.lastError = null;
      this.disposed = false;
      this.onClick = event => { void this.handleClick(event); };
      this.root.addEventListener('click', this.onClick);
      this.presentation = null;
      this.renderState('loading', 'REPOSITORY · LOADING', 'product.repository.loading');
      this.unsubscribeLocale = typeof options.subscribeLocale === 'function'
        ? options.subscribeLocale(() => this.refreshLocale())
        : null;
    }

    t(key, fallback, params = {}) {
      return this.translate(key, fallback, params) || fallback;
    }

    renderState(state, message, key = '', params = {}) {
      this.presentation = { state, message, key, params: { ...params } };
      this.state = state;
      const busy = ['loading', 'saving', 'loading-entry', 'removing'].includes(state);
      this.root.dataset.state = state;
      this.root.setAttribute('aria-busy', String(busy));
      this.saveButton.disabled = busy || !this.exportProvider;
      this.refreshButton.disabled = busy;
      this.statusRoot.dataset.state = state;
      this.statusRoot.textContent = String(key ? this.t(key, message, params) : message || state);
    }

    entryNode(category, entry) {
      const documentRef = this.root.ownerDocument;
      const item = documentRef.createElement('div');
      item.className = 'preset-repository-item';
      item.dataset.category = category;
      const copyRoot = documentRef.createElement('span');
      const name = documentRef.createElement('strong');
      const entryId = String(entry.id || '');
      name.textContent = category === 'builtIn' && ['balanced', 'fracture', 'impact'].includes(entryId)
        ? this.t(`product.preset.name.${entryId}`, entry.name || entryId)
        : entry.name || entry.id || entry.key;
      const meta = documentRef.createElement('small');
      meta.textContent = category === 'builtIn'
        ? this.t(
            'product.repository.builtInMeta',
            `BUILT-IN · SCHEMA ${entry.schemaVersion}`,
            { schema: entry.schemaVersion }
          )
        : `${entry.key} · SCHEMA ${entry.schemaVersion}`;
      copyRoot.append(name, meta);
      const actions = documentRef.createElement('span');
      actions.className = 'preset-repository-item__actions';
      const load = documentRef.createElement('button');
      load.type = 'button';
      load.textContent = this.t('product.repository.load', '载入');
      load.dataset.presetRepositoryLoad = category;
      load.dataset.presetRepositoryKey = category === 'builtIn'
        ? entry.id
        : entry.key;
      actions.append(load);
      if (category === 'user') {
        const remove = documentRef.createElement('button');
        remove.type = 'button';
        remove.textContent = this.t('product.repository.delete', '删除');
        remove.dataset.presetRepositoryRemove = category;
        remove.dataset.presetRepositoryKey = entry.key;
        actions.append(remove);
      }
      item.append(copyRoot, actions);
      return item;
    }

    renderCategories() {
      for (const category of CATEGORY_ORDER) {
        const root = this.categoryRoots[category];
        root.replaceChildren();
        const entries = this.categories[category] || [];
        if (entries.length === 0) {
          const empty = this.root.ownerDocument.createElement('p');
          empty.className = 'preset-repository-empty';
          const key = category === 'user'
            ? 'product.repository.emptyUser'
            : category === 'recovered'
              ? 'product.repository.emptyRecovered'
              : 'product.repository.emptyBuiltIn';
          const fallback = category === 'user'
            ? '尚未保存用户 preset'
            : category === 'recovered'
              ? '没有待恢复 preset'
              : '内置 preset 尚未载入';
          empty.textContent = this.t(key, fallback);
          root.append(empty);
          continue;
        }
        for (const entry of entries) root.append(this.entryNode(category, entry));
      }
      this.countRoot.textContent = CATEGORY_ORDER
        .map(category => this.categories[category]?.length || 0)
        .join(' / ');
      this.pathRoot.textContent = this.repositoryRoot || this.t(
        'product.repository.browserOnly',
        'BROWSER · BUILT-IN ONLY'
      );
    }

    async ready() {
      if (this.disposed) return null;
      return this.refresh();
    }

    async refresh() {
      if (this.disposed) return null;
      this.renderState('loading', 'REPOSITORY · SCANNING', 'product.repository.scanning');
      const builtIn = this.builtInProvider();
      this.categories.builtIn = Array.isArray(builtIn) ? builtIn.map(copy) : [];
      try {
        if (typeof this.repositoryBridge?.presetRepositoryList === 'function') {
          const response = await this.repositoryBridge.presetRepositoryList();
          if (!response?.ok || !response.repository) {
            throw new Error(response?.error || 'PRESET_REPOSITORY_LIST_FAILED');
          }
          this.repositoryRoot = String(response.repository.root || '');
          this.categories.user = (response.repository.categories?.user || []).map(copy);
          this.categories.recovered = (response.repository.categories?.recovered || []).map(copy);
          this.warnings = (response.repository.warnings || []).map(copy);
        } else {
          this.repositoryRoot = '';
          this.categories.user = [];
          this.categories.recovered = [];
          this.warnings = [];
        }
        this.renderCategories();
        this.lastError = null;
        this.renderState(
          'ready',
          this.warnings.length > 0
            ? `READY · ${this.warnings.length} WARNING(S)`
            : 'REPOSITORY · READY',
          this.warnings.length > 0
            ? 'product.repository.readyWarnings'
            : 'product.repository.ready',
          { count: this.warnings.length }
        );
        return this.status();
      } catch (error) {
        this.renderCategories();
        return this.fail(error instanceof Error ? error.message : String(error));
      }
    }

    async saveCurrent() {
      if (!this.exportProvider || typeof this.repositoryBridge?.presetRepositorySave !== 'function') {
        return this.fail('PRESET_REPOSITORY_SAVE_UNAVAILABLE');
      }
      this.renderState('saving', 'REPOSITORY · SAVING', 'product.repository.saving');
      try {
        const exported = this.exportProvider();
        const response = await this.repositoryBridge.presetRepositorySave({
          category: 'user',
          filename: exported.filename,
          json: exported.json
        });
        if (!response?.ok) throw new Error(response?.error || 'PRESET_REPOSITORY_SAVE_FAILED');
        this.lastAction = `saved:${response.entry?.key || exported.filename}`;
        await this.refresh();
        const name = response.entry?.name || exported.preset?.name || 'PRESET';
        this.renderState(
          'ready',
          `SAVED · ${name}`,
          'product.repository.saved',
          { name }
        );
        return copy(response);
      } catch (error) {
        return this.fail(error instanceof Error ? error.message : String(error));
      }
    }

    async load(category, key) {
      if (category === 'builtIn') {
        const result = this.selectBuiltIn?.(key) || null;
        if (!result) return this.fail('BUILT_IN_PRESET_LOAD_FAILED');
        this.lastAction = `loaded:builtIn:${key}`;
        const name = result.name || result.id;
        this.renderState(
          'ready',
          `LOADED · ${name}`,
          'product.repository.loaded',
          { name }
        );
        return copy(result);
      }
      if (
        !['user', 'recovered'].includes(category) ||
        typeof this.repositoryBridge?.presetRepositoryRead !== 'function' ||
        !this.importProvider
      ) return this.fail('PRESET_REPOSITORY_LOAD_UNAVAILABLE');
      this.renderState(
        'loading-entry',
        'REPOSITORY · LOADING PRESET',
        'product.repository.loadingPreset'
      );
      try {
        const response = await this.repositoryBridge.presetRepositoryRead(category, key);
        if (!response?.ok || typeof response.json !== 'string') {
          throw new Error(response?.error || 'PRESET_REPOSITORY_READ_FAILED');
        }
        const imported = this.importProvider(response.json, response.entry?.key || key);
        if (!imported?.applied) {
          throw new Error(imported?.code || 'PRESET_REPOSITORY_IMPORT_REJECTED');
        }
        this.lastAction = `loaded:${category}:${key}`;
        this.lastError = null;
        const name = imported.appliedPreset?.name || key;
        this.renderState(
          'ready',
          `LOADED · ${name}`,
          'product.repository.loaded',
          { name }
        );
        return copy(imported);
      } catch (error) {
        return this.fail(error instanceof Error ? error.message : String(error));
      }
    }

    async remove(category, key) {
      if (category !== 'user' || typeof this.repositoryBridge?.presetRepositoryRemove !== 'function') {
        return this.fail('PRESET_REPOSITORY_ENTRY_READ_ONLY');
      }
      this.renderState('removing', 'REPOSITORY · REMOVING', 'product.repository.removing');
      try {
        const response = await this.repositoryBridge.presetRepositoryRemove(category, key);
        if (!response?.ok) throw new Error(response?.error || 'PRESET_REPOSITORY_REMOVE_FAILED');
        this.lastAction = `removed:${category}:${key}`;
        await this.refresh();
        this.renderState(
          'ready',
          `REMOVED · ${key}`,
          'product.repository.removed',
          { name: key }
        );
        return copy(response);
      } catch (error) {
        return this.fail(error instanceof Error ? error.message : String(error));
      }
    }

    async handleClick(event) {
      const action = event.target.closest?.('[data-preset-repository-action]');
      if (action?.dataset.presetRepositoryAction === 'save') return this.saveCurrent();
      if (action?.dataset.presetRepositoryAction === 'refresh') return this.refresh();
      const load = event.target.closest?.('[data-preset-repository-load]');
      if (load) return this.load(
        load.dataset.presetRepositoryLoad,
        load.dataset.presetRepositoryKey
      );
      const remove = event.target.closest?.('[data-preset-repository-remove]');
      if (remove) return this.remove(
        remove.dataset.presetRepositoryRemove,
        remove.dataset.presetRepositoryKey
      );
      return null;
    }

    fail(error) {
      this.lastError = String(error || 'PRESET_REPOSITORY_ERROR');
      this.renderState(
        'ready',
        `REJECTED · ${this.lastError}`,
        'product.repository.rejected',
        { error: this.lastError }
      );
      return null;
    }

    refreshLocale() {
      this.renderCategories();
      const presentation = this.presentation;
      if (presentation) this.renderState(
        presentation.state,
        presentation.message,
        presentation.key,
        presentation.params
      );
    }

    status() {
      return {
        contract: CONTRACT,
        version: VERSION,
        state: this.state,
        root: this.repositoryRoot,
        counts: Object.fromEntries(CATEGORY_ORDER.map(category => [
          category,
          this.categories[category]?.length || 0
        ])),
        warnings: this.warnings.map(copy),
        lastAction: this.lastAction,
        lastError: this.lastError,
        desktopRepository: Boolean(
          this.repositoryBridge?.presetRepositoryList &&
          this.repositoryBridge?.presetRepositorySave &&
          this.repositoryBridge?.presetRepositoryRead &&
          this.repositoryBridge?.presetRepositoryRemove
        )
      };
    }

    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      this.root.removeEventListener('click', this.onClick);
      this.unsubscribeLocale?.();
      this.unsubscribeLocale = null;
    }
  }

  return Object.freeze({
    CONTRACT,
    VERSION,
    CATEGORY_ORDER,
    create: options => new GeneratorPresetRepositoryControl(options)
  });
});
