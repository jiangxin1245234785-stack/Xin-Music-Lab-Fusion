(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SmokeResonanceProductControlDock = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CONTRACT = 'xin.xml-product-control-dock/1';
  const VERSION = '5.5.0-productization';
  const UPDATE_INTERVAL_MS = 250;

  const finite = (value, fallback = 0) =>
    Number.isFinite(Number(value)) ? Number(value) : fallback;

  class ProductControlDock {
    constructor(options = {}) {
      if (!options.root) throw new Error('PRODUCT_CONTROL_DOCK_ROOT_REQUIRED');
      this.root = options.root;
      this.master = this.root.querySelector('[data-product-fx-master]');
      this.masterOutput = this.root.querySelector('[data-product-fx-master-output]');
      this.quality = this.root.querySelector('[data-product-quality]');
      this.source = this.root.querySelector('[data-product-source]');
      this.sourceLabel = this.root.querySelector('[data-product-source-label]');
      this.sourceMeta = this.root.querySelector('[data-product-source-meta]');
      this.xld = this.root.querySelector('[data-product-open-xld]');
      this.generator = this.root.querySelector('[data-product-open-generator]');
      this.stateRoot = this.root.querySelector('[data-product-tool-state]');
      if ([
        this.master, this.masterOutput, this.quality, this.source,
        this.sourceLabel, this.sourceMeta, this.xld, this.generator,
        this.stateRoot
      ].some(element => !element)) {
        throw new Error('PRODUCT_CONTROL_DOCK_DOM_INCOMPLETE');
      }
      this.masterSource = options.masterSource || null;
      this.qualitySource = options.qualitySource || null;
      this.openInspector = typeof options.openInspector === 'function'
        ? options.openInspector
        : () => null;
      this.openXld = typeof options.openXld === 'function'
        ? options.openXld
        : null;
      this.openGenerator = typeof options.openGenerator === 'function'
        ? options.openGenerator
        : null;
      this.translate = typeof options.translate === 'function'
        ? options.translate
        : (_key, fallback) => fallback;
      this.lastUpdateAt = -Infinity;
      this.lastSource = {
        label: 'SOURCE UNKNOWN',
        key: 'product.source.idle',
        provider: 'unavailable',
        confidence: 0,
        available: false
      };
      this.lastTool = '';
      this.lastError = null;
      this.toolPresentation = {
        state: 'ready',
        key: 'product.tool.ready',
        fallback: 'PRODUCT READY',
        params: {}
      };
      this.disposed = false;
      this.listeners = [];
      this.bind(this.master, 'input', () => this.applyMaster());
      this.bind(this.masterSource, 'input', () => this.syncMaster());
      this.bind(this.quality, 'click', () => {
        this.qualitySource?.click();
        Promise.resolve().then(() => this.syncQuality());
      });
      this.bind(this.qualitySource, 'click', () => {
        Promise.resolve().then(() => this.syncQuality());
      });
      this.bind(this.source, 'click', () => this.openInspector());
      this.bind(this.xld, 'click', () => { void this.launch('xld'); });
      this.bind(this.generator, 'click', () => { void this.launch('generator'); });
      this.syncMaster();
      this.syncQuality();
      this.renderToolState('ready', 'PRODUCT READY', 'product.tool.ready');
      this.unsubscribeLocale = typeof options.subscribeLocale === 'function'
        ? options.subscribeLocale(() => this.refreshLocale())
        : null;
    }

    t(key, fallback, params = {}) {
      return this.translate(key, fallback, params) || fallback;
    }

    bind(element, event, listener) {
      if (!element?.addEventListener) return;
      element.addEventListener(event, listener);
      this.listeners.push({ element, event, listener });
    }

    syncMaster() {
      const value = Math.max(0, Math.min(200, finite(
        this.masterSource?.value,
        this.master.value || 100
      )));
      this.master.value = String(value);
      this.masterOutput.textContent = `${Math.round(value)}%`;
      this.root.style.setProperty('--product-master', `${value / 2}%`);
      return value;
    }

    applyMaster() {
      if (!this.masterSource) return null;
      const value = Math.max(0, Math.min(200, finite(this.master.value, 100)));
      this.masterSource.value = String(value);
      const EventCtor = this.masterSource.ownerDocument?.defaultView?.Event ||
        globalThis.Event;
      this.masterSource.dispatchEvent(new EventCtor('input', { bubbles: true }));
      return this.syncMaster();
    }

    syncQuality() {
      const mode = String(this.qualitySource?.dataset?.mode || 'auto');
      const labels = {
        auto: this.t('product.quality.auto', 'QUALITY AUTO'),
        high: this.t('product.quality.high', 'QUALITY HIGH'),
        eco: this.t('product.quality.eco', 'QUALITY ECO')
      };
      this.quality.dataset.mode = mode;
      this.quality.textContent = labels[mode] || labels.auto;
      return mode;
    }

    update(engineNowMs, frame, context = {}) {
      const nowMs = finite(engineNowMs, 0);
      if (nowMs < this.lastUpdateAt) this.lastUpdateAt = -Infinity;
      if (nowMs - this.lastUpdateAt < UPDATE_INTERVAL_MS) return this.status();
      this.lastUpdateAt = nowMs;
      const energy = frame?.meta?.loudness || null;
      const section = frame?.meta?.sectionId || null;
      const external = context.sourceMode === 'external';
      const xld = Boolean(
        section?.available && String(section?.sourceProvider || '').startsWith('xld.')
      );
      const available = Boolean(energy?.available || section?.available);
      const label = external
        ? 'LIVE INPUT'
        : xld
          ? 'LOCAL + XLD'
          : available
            ? 'LOCAL PCM'
            : 'SOURCE IDLE';
      const labelKey = external
        ? 'product.source.live'
        : xld
          ? 'product.source.localXld'
          : available
            ? 'product.source.localPcm'
            : 'product.source.idle';
      const provider = xld
        ? `${energy?.sourceProvider || 'neutral'} + ${section.sourceProvider}`
        : String(energy?.sourceProvider || section?.sourceProvider || 'unavailable');
      const confidence = Math.max(
        finite(energy?.confidence, 0),
        finite(section?.confidence, 0)
      );
      this.lastSource = { label, key: labelKey, provider, confidence, available };
      this.source.dataset.state = available ? 'available' : 'idle';
      this.sourceLabel.textContent = this.t(labelKey, label);
      this.sourceMeta.textContent = `${provider} · ${Math.round(confidence * 100)}%`;
      return this.status();
    }

    renderToolState(state, message, key = '', params = {}) {
      this.toolPresentation = { state, key, fallback: message, params: { ...params } };
      this.stateRoot.dataset.state = state;
      this.stateRoot.textContent = key ? this.t(key, message, params) : message;
      const busy = state === 'launching';
      this.xld.disabled = busy || !this.openXld;
      this.generator.disabled = busy || !this.openGenerator;
    }

    async launch(tool) {
      const launcher = tool === 'xld' ? this.openXld : this.openGenerator;
      if (!launcher) return this.fail(`${tool.toUpperCase()}_LAUNCH_UNAVAILABLE`);
      const toolName = tool.toUpperCase();
      this.renderToolState(
        'launching',
        `OPENING ${toolName}…`,
        'product.tool.opening',
        { tool: toolName }
      );
      try {
        const result = await launcher();
        if (!result?.ok) throw new Error(result?.error || `${tool.toUpperCase()}_LAUNCH_FAILED`);
        this.lastTool = tool;
        this.lastError = null;
        this.renderToolState(
          'ready',
          `${toolName} OPENED`,
          'product.tool.opened',
          { tool: toolName }
        );
        return result;
      } catch (error) {
        return this.fail(error instanceof Error ? error.message : String(error));
      }
    }

    fail(error) {
      this.lastError = String(error || 'PRODUCT_TOOL_ERROR');
      this.renderToolState(
        'error',
        `UNAVAILABLE · ${this.lastError}`,
        'product.tool.unavailable',
        { error: this.lastError }
      );
      return null;
    }

    refreshLocale() {
      this.syncQuality();
      this.sourceLabel.textContent = this.t(
        this.lastSource.key || 'product.source.idle',
        this.lastSource.label || 'SOURCE IDLE'
      );
      const presentation = this.toolPresentation;
      this.renderToolState(
        presentation.state,
        presentation.fallback,
        presentation.key,
        presentation.params
      );
    }

    status() {
      return {
        contract: CONTRACT,
        version: VERSION,
        masterPercent: finite(this.master.value, 0),
        qualityMode: this.quality.dataset.mode || 'auto',
        source: { ...this.lastSource },
        lastTool: this.lastTool,
        lastError: this.lastError,
        desktopTools: Boolean(this.openXld && this.openGenerator),
        updateIntervalMs: UPDATE_INTERVAL_MS
      };
    }

    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      for (const { element, event, listener } of this.listeners) {
        element.removeEventListener(event, listener);
      }
      this.listeners = [];
      this.unsubscribeLocale?.();
      this.unsubscribeLocale = null;
    }
  }

  return Object.freeze({
    CONTRACT,
    VERSION,
    UPDATE_INTERVAL_MS,
    create: options => new ProductControlDock(options)
  });
});
