(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SmokeResonanceGeneratorRuntimeShadow = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '5.3.0-product-json-loader';
  const DEFAULT_ENTRY =
    './vendor/glitch-generator/6.6.1-integration-v.3/browser/index.js';
  const EXPECTED_PACKAGE_VERSION = '6.6.1-integration-v.3';
  const EXPECTED_BROWSER_API_VERSION = 1;

  function copy(value) {
    if (Array.isArray(value)) return value.map(copy);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, copy(child)])
    );
  }

  class GeneratorRuntimeShadow {
    constructor(options = {}) {
      this.enabled = options.enabled !== false;
      this.formalPipeline = options.formalPipeline === 'generator'
        ? 'generator'
        : 'legacy';
      this.entryUrl = String(options.entryUrl || DEFAULT_ENTRY);
      this.sessionSeed = Number.isFinite(Number(options.sessionSeed))
        ? Number(options.sessionSeed)
        : 0;
      this.initialPresetId = String(options.initialPresetId || 'balanced');
      this.importModule = typeof options.importModule === 'function'
        ? options.importModule
        : specifier => import(specifier);
      this.rendererEnabled = options.rendererEnabled === true;
      this.renderCanvas = options.renderCanvas || null;
      this.sourceProvider = typeof options.sourceProvider === 'function'
        ? options.sourceProvider
        : null;
      this.qualityProvider = typeof options.qualityProvider === 'function'
        ? options.qualityProvider
        : null;
      this.renderPortOptions = options.renderPortOptions || {};
      this.mappingExtension = copy(options.mappingExtension || {});
      this.loadPromise = null;
      this.runtime = null;
      this.productPresetModule = null;
      this.builtInPresets = [];
      this.renderPort = null;
      this.report = null;
      this.loadState = this.enabled ? 'idle' : 'disabled';
      this.error = null;
      this.evaluateCalls = 0;
      this.renderCalls = 0;
      this.renderRequests = 0;
      this.renderSkips = 0;
      this.renderReport = null;
      this.renderError = null;
    }

    load() {
      if (!this.enabled) return Promise.resolve(null);
      if (this.runtime) return Promise.resolve(this.runtime);
      if (this.loadPromise) return this.loadPromise;
      this.loadState = 'loading';
      this.loadPromise = Promise.resolve()
        .then(() => this.importModule(this.entryUrl))
        .then(module => {
          if (
            module?.GLITCH_GENERATOR_PACKAGE_VERSION !==
              EXPECTED_PACKAGE_VERSION
          ) {
            throw new Error('GENERATOR_PACKAGE_VERSION_MISMATCH');
          }
          if (
            module?.GLITCH_GENERATOR_BROWSER_API_VERSION !==
              EXPECTED_BROWSER_API_VERSION
          ) {
            throw new Error('GENERATOR_BROWSER_API_MISMATCH');
          }
          if (typeof module?.createGeneratorRuntime !== 'function') {
            throw new Error('GENERATOR_RUNTIME_FACADE_MISSING');
          }
          if (
            typeof module?.listProductBuiltInPresets !== 'function' ||
            typeof module?.getProductBuiltInPreset !== 'function' ||
            typeof module?.exportProductPresetJson !== 'function' ||
            typeof module?.createProductPresetFileName !== 'function' ||
            typeof module?.stageProductPresetJson !== 'function'
          ) {
            throw new Error('GENERATOR_PRODUCT_PRESET_JSON_API_MISSING');
          }
          const builtInPresets = module.listProductBuiltInPresets();
          const initialPreset = module.getProductBuiltInPreset(
            this.initialPresetId
          );
          let renderPort;
          if (this.rendererEnabled) {
            if (!this.renderCanvas || !this.sourceProvider) {
              throw new Error('GENERATOR_RENDER_SOURCE_MISSING');
            }
            if (typeof module?.createSourceAwareWebglRenderPort !== 'function') {
              throw new Error('GENERATOR_SOURCE_RENDER_PORT_MISSING');
            }
            renderPort = module.createSourceAwareWebglRenderPort(
              this.renderCanvas,
              {
                ...this.renderPortOptions,
                qualityMode: this.resolveQualityMode()
              }
            );
            this.renderPort = renderPort;
          }
          this.runtime = module.createGeneratorRuntime({
            sessionSeed: this.sessionSeed,
            preset: initialPreset,
            mappingExtension: this.mappingExtension,
            ...(renderPort ? { renderPort } : {})
          });
          if (typeof this.runtime?.setPreset !== 'function') {
            throw new Error('GENERATOR_RUNTIME_PRESET_CONTROL_MISSING');
          }
          if (typeof this.runtime?.getPreset !== 'function') {
            throw new Error('GENERATOR_RUNTIME_PRESET_EXPORT_MISSING');
          }
          this.productPresetModule = module;
          this.builtInPresets = builtInPresets.map(copy);
          this.loadState = 'ready';
          this.error = null;
          return this.runtime;
        })
        .catch(error => {
          this.loadState = 'error';
          this.error = error instanceof Error
            ? error.message
            : String(error);
          this.loadPromise = null;
          return null;
        });
      return this.loadPromise;
    }

    evaluate(frame, clock, options = {}) {
      if (!this.enabled || !this.runtime) return null;
      try {
        this.report = this.runtime.evaluate(frame, clock);
        this.evaluateCalls++;
        this.error = null;
        if (this.rendererEnabled && options.render !== false) {
          this.renderCurrentSource();
        }
        return this.get();
      } catch (error) {
        this.error = error instanceof Error
          ? error.message
          : String(error);
        return null;
      }
    }

    renderCurrentSource() {
      if (!this.rendererEnabled || !this.runtime || !this.report) return null;
      const sourceFrame = this.sourceProvider?.() || null;
      const source = sourceFrame?.source || sourceFrame;
      if (!source || sourceFrame?.available === false) {
        this.renderSkips++;
        this.renderReport = null;
        this.renderError = 'GENERATOR_RENDER_SOURCE_UNAVAILABLE';
        return null;
      }
      try {
        this.renderPort?.setQualityMode?.(this.resolveQualityMode());
        this.renderReport = this.runtime.render(sourceFrame, this.report);
        this.renderRequests++;
        if (this.renderReport?.output?.rendered === false) this.renderSkips++;
        else this.renderCalls++;
        this.renderError = null;
        const runtimeProfile = this.runtime.status?.()?.profile;
        if (runtimeProfile) {
          this.report = {
            ...this.report,
            profile: copy(runtimeProfile)
          };
        }
        return copy(this.renderReport);
      } catch (error) {
        this.renderSkips++;
        this.renderReport = null;
        this.renderError = error instanceof Error ? error.message : String(error);
        return null;
      }
    }

    get() {
      return this.report ? copy(this.report) : null;
    }

    setPreset(preset, reason = 'product-preset-change') {
      if (!this.runtime || typeof this.runtime.setPreset !== 'function') {
        throw new Error('GENERATOR_RUNTIME_NOT_READY');
      }
      const applied = this.runtime.setPreset(preset, reason);
      this.report = null;
      this.renderReport = null;
      this.renderError = null;
      return copy(applied);
    }

    setBuiltInPreset(id) {
      if (!this.productPresetModule) {
        throw new Error('GENERATOR_PRODUCT_PRESET_API_UNAVAILABLE');
      }
      return this.setPreset(
        this.productPresetModule.getProductBuiltInPreset(String(id || '')),
        'product-preset-change'
      );
    }

    presets() {
      return this.builtInPresets.map(copy);
    }

    exportPresetJson() {
      if (!this.runtime || !this.productPresetModule) {
        throw new Error('GENERATOR_RUNTIME_NOT_READY');
      }
      const preset = this.runtime.getPreset();
      return {
        contract: 'xin.xml-generator-preset-file/1',
        filename: this.productPresetModule.createProductPresetFileName(preset),
        json: this.productPresetModule.exportProductPresetJson(preset),
        preset: {
          id: preset.id,
          name: preset.name,
          schemaVersion: preset.schemaVersion
        }
      };
    }

    stagePresetJson(serialized) {
      if (!this.productPresetModule) {
        throw new Error('GENERATOR_PRODUCT_PRESET_JSON_API_UNAVAILABLE');
      }
      return copy(this.productPresetModule.stageProductPresetJson(
        String(serialized || '')
      ));
    }

    importPresetJson(serialized) {
      const staged = this.stagePresetJson(serialized);
      if (!staged.valid || !staged.preset) return staged;
      const appliedPreset = this.setPreset(
        staged.preset,
        'product-json-import'
      );
      return copy({
        ...staged,
        applied: true,
        appliedPreset: {
          id: appliedPreset.id,
          name: appliedPreset.name,
          schemaVersion: appliedPreset.schemaVersion
        }
      });
    }

    status() {
      const runtimeStatus = this.runtime?.status?.() || null;
      return {
        version: VERSION,
        enabled: this.enabled,
        loadState: this.loadState,
        entryUrl: this.entryUrl,
        packageVersion: EXPECTED_PACKAGE_VERSION,
        browserApiVersion: EXPECTED_BROWSER_API_VERSION,
        initialPresetId: this.initialPresetId,
        builtInPresets: this.presets(),
        evaluateCalls: this.evaluateCalls,
        error: this.error,
        rendererEnabled: this.rendererEnabled,
        sourceAware: true,
        qualityMode: this.resolveQualityMode(),
        renderRequests: this.renderRequests,
        renderCalls: this.renderCalls,
        renderSkips: this.renderSkips,
        renderError: this.renderError,
        renderReport: this.renderReport ? copy(this.renderReport) : null,
        renderPort: this.renderPort?.status?.() || null,
        mappingExtension: {
          targetCount: Array.isArray(this.mappingExtension.targetDefinitions)
            ? this.mappingExtension.targetDefinitions.length
            : 0,
          mappingCount: Array.isArray(this.mappingExtension.mappings)
            ? this.mappingExtension.mappings.length
            : 0
        },
        formalPipeline: this.formalPipeline,
        runtime: runtimeStatus ? copy(runtimeStatus) : null
      };
    }

    dispose() {
      this.runtime?.dispose?.();
      this.runtime = null;
      this.renderPort = null;
      this.productPresetModule = null;
      this.report = null;
      this.loadPromise = null;
      this.loadState = this.enabled ? 'disposed' : 'disabled';
    }

    resolveQualityMode() {
      const provided = this.qualityProvider?.();
      const mode = typeof provided === 'string' ? provided : provided?.mode;
      return mode === 'eco' || mode === 'high' ? mode : 'auto';
    }
  }

  return Object.freeze({
    create: options => new GeneratorRuntimeShadow(options),
    constants: Object.freeze({
      VERSION,
      DEFAULT_ENTRY,
      EXPECTED_PACKAGE_VERSION,
      EXPECTED_BROWSER_API_VERSION
    })
  });
});
