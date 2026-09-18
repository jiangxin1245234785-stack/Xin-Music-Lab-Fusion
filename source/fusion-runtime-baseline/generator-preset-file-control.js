(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SmokeResonanceGeneratorPresetFilesUi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CONTRACT = 'xin.xml-generator-preset-files-ui/1';
  const VERSION = '5.3.0-product-json-files';
  const MAX_JSON_BYTES = 4 * 1024 * 1024;

  const copy = value => value == null
    ? value
    : JSON.parse(JSON.stringify(value));

  class GeneratorPresetFileControl {
    constructor(options = {}) {
      if (!options.root) throw new Error('GENERATOR_PRESET_FILES_ROOT_REQUIRED');
      this.root = options.root;
      this.exportButton = this.root.querySelector('[data-product-preset-export]');
      this.importButton = this.root.querySelector('[data-product-preset-import]');
      this.input = this.root.querySelector('[data-product-preset-file-input]');
      this.stateRoot = this.root.querySelector('[data-product-preset-file-state]');
      if (!this.exportButton || !this.importButton || !this.input || !this.stateRoot) {
        throw new Error('GENERATOR_PRESET_FILES_DOM_INCOMPLETE');
      }
      this.exportProvider = typeof options.exportProvider === 'function'
        ? options.exportProvider
        : null;
      this.stageProvider = typeof options.stageProvider === 'function'
        ? options.stageProvider
        : null;
      this.importProvider = typeof options.importProvider === 'function'
        ? options.importProvider
        : null;
      this.desktopBridge = options.desktopBridge || null;
      this.translate = typeof options.translate === 'function'
        ? options.translate
        : (_key, fallback) => fallback;
      this.state = 'loading';
      this.lastCode = '';
      this.lastError = null;
      this.lastFile = '';
      this.imports = 0;
      this.exports = 0;
      this.disposed = false;
      this.onExport = () => { void this.exportFile(); };
      this.onImport = () => { void this.requestImport(); };
      this.onFile = event => { void this.readBrowserFile(event); };
      this.exportButton.addEventListener('click', this.onExport);
      this.importButton.addEventListener('click', this.onImport);
      this.input.addEventListener('change', this.onFile);
      this.presentation = null;
      this.render('loading', 'JSON FILES · LOADING', 'product.files.loading');
      this.unsubscribeLocale = typeof options.subscribeLocale === 'function'
        ? options.subscribeLocale(() => this.refreshLocale())
        : null;
    }

    t(key, fallback, params = {}) {
      return this.translate(key, fallback, params) || fallback;
    }

    render(state, message, key = '', params = {}) {
      this.presentation = { state, message, key, params: { ...params } };
      this.state = state;
      this.root.dataset.state = state;
      this.root.setAttribute('aria-busy', String(
        state === 'loading' || state === 'importing' || state === 'exporting'
      ));
      this.exportButton.disabled = state !== 'ready';
      this.importButton.disabled = state !== 'ready';
      this.stateRoot.dataset.state = state;
      this.stateRoot.textContent = String(key ? this.t(key, message, params) : message || state);
    }

    ready() {
      if (this.disposed) return null;
      if (!this.exportProvider || !this.stageProvider || !this.importProvider) {
        return this.fail('GENERATOR_PRESET_FILE_API_UNAVAILABLE');
      }
      this.lastError = null;
      this.render('ready', 'JSON FILES · READY', 'product.files.ready');
      return this.status();
    }

    stageText(serialized) {
      if (!this.stageProvider) return null;
      return copy(this.stageProvider(String(serialized || '')));
    }

    importText(serialized, filename = '') {
      if (this.disposed || !this.importProvider) return null;
      const text = String(serialized || '');
      if (new TextEncoder().encode(text).byteLength > MAX_JSON_BYTES) {
        return this.fail('PRESET_JSON_FILE_TOO_LARGE');
      }
      this.render('importing', 'JSON FILES · VALIDATING', 'product.files.validating');
      try {
        const staged = this.stageText(text);
        if (!staged?.valid) {
          this.lastCode = staged?.code || 'PRESET_IMPORT_REJECTED';
          return this.fail(this.lastCode);
        }
        const result = this.importProvider(text);
        if (!result?.applied) {
          this.lastCode = result?.code || 'PRESET_IMPORT_REJECTED';
          return this.fail(this.lastCode);
        }
        this.imports++;
        this.lastCode = result.code || 'PRESET_IMPORTED';
        this.lastFile = String(filename || 'memory.json');
        this.lastError = null;
        this.render(
          'ready',
          `IMPORTED · ${result.appliedPreset?.name || result.appliedPreset?.id || 'PRESET'}`,
          'product.files.imported',
          { name: result.appliedPreset?.name || result.appliedPreset?.id || 'PRESET' }
        );
        return copy(result);
      } catch (error) {
        return this.fail(error instanceof Error ? error.message : String(error));
      }
    }

    async exportFile() {
      if (this.disposed || !this.exportProvider) return null;
      this.render('exporting', 'JSON FILES · EXPORTING', 'product.files.exporting');
      try {
        const payload = this.exportProvider();
        let result;
        if (typeof this.desktopBridge?.exportGlitchPreset === 'function') {
          result = await this.desktopBridge.exportGlitchPreset(payload);
        } else {
          const blob = new Blob([payload.json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const anchor = this.root.ownerDocument.createElement('a');
          anchor.href = url;
          anchor.download = payload.filename;
          anchor.click();
          URL.revokeObjectURL(url);
          result = { ok: true, path: payload.filename, browser: true };
        }
        if (result?.canceled) {
          this.render('ready', 'EXPORT · CANCELED', 'product.files.exportCanceled');
          return copy(result);
        }
        if (!result?.ok) return this.fail(result?.error || 'PRESET_EXPORT_FAILED');
        this.exports++;
        this.lastFile = String(result.path || payload.filename || '');
        this.lastCode = 'PRESET_EXPORTED';
        this.lastError = null;
        this.render(
          'ready',
          `EXPORTED · ${payload.preset?.name || 'PRESET'}`,
          'product.files.exported',
          { name: payload.preset?.name || 'PRESET' }
        );
        return copy(result);
      } catch (error) {
        return this.fail(error instanceof Error ? error.message : String(error));
      }
    }

    async requestImport() {
      if (this.disposed) return null;
      if (typeof this.desktopBridge?.importGlitchPreset === 'function') {
        this.render('importing', 'JSON FILES · OPENING', 'product.files.opening');
        try {
          const result = await this.desktopBridge.importGlitchPreset();
          if (result?.canceled) {
            this.render('ready', 'IMPORT · CANCELED', 'product.files.importCanceled');
            return copy(result);
          }
          if (!result?.ok) return this.fail(result?.error || 'PRESET_IMPORT_FAILED');
          return this.importText(result.json, result.path || result.name);
        } catch (error) {
          return this.fail(error instanceof Error ? error.message : String(error));
        }
      }
      this.input.click();
      return null;
    }

    async readBrowserFile(event) {
      const file = event?.target?.files?.[0] || null;
      if (!file) return null;
      try {
        if (file.size > MAX_JSON_BYTES) return this.fail('PRESET_JSON_FILE_TOO_LARGE');
        return this.importText(await file.text(), file.name);
      } catch (error) {
        return this.fail(error instanceof Error ? error.message : String(error));
      } finally {
        this.input.value = '';
      }
    }

    fail(error) {
      this.lastError = String(error || 'GENERATOR_PRESET_FILE_ERROR');
      this.render(
        'ready',
        `REJECTED · ${this.lastError}`,
        'product.files.rejected',
        { error: this.lastError }
      );
      return null;
    }

    refreshLocale() {
      const presentation = this.presentation;
      if (presentation) this.render(
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
        lastCode: this.lastCode,
        lastError: this.lastError,
        lastFile: this.lastFile,
        imports: this.imports,
        exports: this.exports,
        maxJsonBytes: MAX_JSON_BYTES,
        desktopFiles: Boolean(
          this.desktopBridge?.exportGlitchPreset &&
          this.desktopBridge?.importGlitchPreset
        )
      };
    }

    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      this.exportButton.removeEventListener('click', this.onExport);
      this.importButton.removeEventListener('click', this.onImport);
      this.input.removeEventListener('change', this.onFile);
      this.unsubscribeLocale?.();
      this.unsubscribeLocale = null;
    }
  }

  return Object.freeze({
    CONTRACT,
    VERSION,
    MAX_JSON_BYTES,
    create: options => new GeneratorPresetFileControl(options)
  });
});
