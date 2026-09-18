(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SmokeResonanceGeneratorOutputController = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '4.5.0-formal-output-switch';
  const CONTRACT = 'xin.xml-generator-output/1';
  const TARGET_BINDING_CONTRACT =
    'xin.generator-target-uniform-bindings/1';

  const copy = value => value === null || value === undefined
    ? value
    : JSON.parse(JSON.stringify(value));
  const finite = value => Number.isFinite(Number(value));

  class GeneratorOutputController {
    constructor(options = {}) {
      this.stage = options.stage || null;
      this.canvas = options.canvas || null;
      this.enabled = options.enabled !== false;
      this.requiredBindingCount = Math.max(
        1,
        Number(options.requiredBindingCount) || 21
      );
      this.promotions = 0;
      this.fallbacks = 0;
      this.bypasses = 0;
      this.lastFrameIndex = null;
      this.latest = this.buildStatus('warming', ['RUNTIME_NOT_READY']);
      this.applyVisible(false, 'warming');
    }

    reasons(runtimeStatus, sourceStatus, ownershipStatus, fxEnabled) {
      const reasons = [];
      if (!this.enabled) reasons.push('CONTROLLER_DISABLED');
      if (fxEnabled === false) reasons.push('FX_BYPASS');
      if (runtimeStatus?.loadState !== 'ready') {
        reasons.push('RUNTIME_NOT_READY');
      }
      if (sourceStatus?.available !== true) {
        reasons.push('SOURCE_UNAVAILABLE');
      }
      if (ownershipStatus?.pass !== true) {
        reasons.push('FRAME_OWNERSHIP_PENDING');
      }
      const output = runtimeStatus?.renderReport?.output || {};
      const renderedNow =
        runtimeStatus?.renderReport?.status === 'rendered' &&
        output.rendered === true;
      const holdingBudgetFrame =
        output.rendered === false &&
        output.skipReason === 'quality-budget' &&
        Number(runtimeStatus?.renderCalls) > 0;
      if (
        !renderedNow &&
        !holdingBudgetFrame
      ) {
        reasons.push('OUTPUT_NOT_RENDERED');
      }
      if ((output.context || runtimeStatus?.renderPort?.context)?.state !== 'ready') {
        reasons.push('RENDER_CONTEXT_UNAVAILABLE');
      }
      if (runtimeStatus?.renderError) reasons.push('RENDER_ERROR');
      if (
        output.targetBindingContract !== TARGET_BINDING_CONTRACT ||
        output.targetBindingCount !== this.requiredBindingCount ||
        !Array.isArray(output.targetBindings) ||
        output.targetBindings.length !== this.requiredBindingCount ||
        !output.targetBindings.every(binding =>
          typeof binding?.targetId === 'string' &&
          typeof binding?.uniformName === 'string' &&
          finite(binding?.value)
        )
      ) {
        reasons.push('TARGET_BINDINGS_INVALID');
      }
      return reasons;
    }

    update(clock, runtimeStatus, sourceStatus, ownershipStatus, fxEnabled) {
      const frameIndex = Number.isInteger(Number(clock?.frameIndex))
        ? Number(clock.frameIndex)
        : null;
      const reasons = this.reasons(
        runtimeStatus,
        sourceStatus,
        ownershipStatus,
        fxEnabled
      );
      const active = reasons.length === 0;
      const nextState = active
        ? 'generator'
        : reasons.includes('FX_BYPASS')
          ? 'legacy-bypass'
          : 'legacy-fallback';
      const previousState = this.latest.activePipeline;
      if (active && previousState !== 'generator') this.promotions++;
      if (!active && previousState === 'generator') this.fallbacks++;
      if (
        nextState === 'legacy-bypass' &&
        previousState !== 'legacy-bypass'
      ) {
        this.bypasses++;
      }
      this.lastFrameIndex = frameIndex;
      this.applyVisible(active, nextState);
      this.latest = this.buildStatus(nextState, reasons, {
        frameIndex,
        runtimeStatus,
        sourceStatus,
        ownershipStatus
      });
      return this.get();
    }

    applyVisible(visible, state) {
      this.stage?.classList?.toggle('generator-renderer-on', visible);
      if (this.stage?.dataset) {
        this.stage.dataset.generatorOutput = state;
      }
      if (this.canvas) {
        this.canvas.setAttribute?.('aria-hidden', String(!visible));
      }
    }

    buildStatus(activePipeline, reasons, details = {}) {
      const visible = activePipeline === 'generator';
      return Object.freeze({
        contract: CONTRACT,
        version: VERSION,
        configuredPipeline: 'generator',
        activePipeline,
        visible,
        fxBypassed: activePipeline === 'legacy-bypass',
        fallbackActive: activePipeline === 'legacy-fallback',
        reasons: Object.freeze([...reasons]),
        frameIndex: details.frameIndex ?? this.lastFrameIndex,
        requiredBindingCount: this.requiredBindingCount,
        sourceKind: String(details.sourceStatus?.sourceKind || 'unavailable'),
        contextState: String(
          details.runtimeStatus?.renderReport?.output?.context?.state ||
          details.runtimeStatus?.renderPort?.context?.state ||
          'unavailable'
        ),
        ownershipPass: details.ownershipStatus?.pass === true,
        holdingBudgetFrame:
          details.runtimeStatus?.renderReport?.output?.rendered === false &&
          details.runtimeStatus?.renderReport?.output?.skipReason ===
            'quality-budget',
        promotions: this.promotions,
        fallbacks: this.fallbacks,
        bypasses: this.bypasses
      });
    }

    snapshotCanvas() {
      return this.latest.visible ? this.canvas : null;
    }

    get() {
      return copy(this.latest);
    }

    status() {
      return this.get();
    }

    dispose() {
      this.applyVisible(false, 'disposed');
      this.latest = this.buildStatus('legacy-fallback', ['DISPOSED']);
    }
  }

  return Object.freeze({
    create: options => new GeneratorOutputController(options),
    constants: Object.freeze({
      VERSION,
      CONTRACT,
      TARGET_BINDING_CONTRACT
    })
  });
});
