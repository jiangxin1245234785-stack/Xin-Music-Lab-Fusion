(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SmokeResonanceGeneratorSourceAdapter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '5.0.0-material-source';
  const CONTRACT = 'xin.xml-visual-source/1';
  const MATERIAL_EXTENSION_CONTRACT = 'xin.xml-material-source/1';

  function dimension(source, key) {
    const clientKey = `client${key[0].toUpperCase()}${key.slice(1)}`;
    const value = Number(source?.[key] ?? source?.[clientKey]);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  }

  class GeneratorSourceAdapter {
    constructor(options = {}) {
      this.stage = options.stage || null;
      this.baseCanvas = options.baseCanvas || null;
      this.betaCanvas = options.betaCanvas || null;
      this.rendererEnabled = options.rendererEnabled === true;
      this.materialProvider = typeof options.materialProvider === 'function'
        ? options.materialProvider
        : null;
    }

    get() {
      const effect = String(this.stage?.dataset?.effect || '');
      const beta = effect.startsWith('beta-');
      const materialOutput = this.materialProvider?.() || null;
      const materialSurface = materialOutput?.color || null;
      const materialSource = materialSurface?.source || null;
      const source = materialSource || (beta ? this.betaCanvas : this.baseCanvas);
      const width = dimension(source, 'width');
      const height = dimension(source, 'height');
      const sourceKind = materialSource
        ? String(materialSurface.sourceKind || materialSurface.kind || 'material')
        : beta
          ? 'butterchurn-canvas'
          : 'base-canvas';
      return Object.freeze({
        contract: CONTRACT,
        version: VERSION,
        extensionContract: MATERIAL_EXTENSION_CONTRACT,
        compatibleContracts: Object.freeze([CONTRACT]),
        source,
        sourceKind,
        effect: effect || 'unknown',
        width,
        height,
        available: Boolean(source && width > 0 && height > 0),
        materialId: materialOutput?.materialId || null,
        materialFrameIndex: Number.isInteger(materialOutput?.frameIndex)
          ? materialOutput.frameIndex
          : null,
        materialSurface: materialSurface || null,
        materialFields: materialOutput?.fields || Object.freeze({}),
        materialAvailable: Boolean(materialSource)
      });
    }

    status() {
      const snapshot = this.get();
      return Object.freeze({
        contract: snapshot.contract,
        version: snapshot.version,
        sourceKind: snapshot.sourceKind,
        effect: snapshot.effect,
        width: snapshot.width,
        height: snapshot.height,
        available: snapshot.available,
        extensionContract: snapshot.extensionContract,
        materialId: snapshot.materialId,
        materialFrameIndex: snapshot.materialFrameIndex,
        materialAvailable: snapshot.materialAvailable,
        fieldIds: Object.freeze(Object.keys(snapshot.materialFields || {})),
        formalPipeline: 'legacy',
        rendererEnabled: this.rendererEnabled
      });
    }
  }

  return Object.freeze({
    create: options => new GeneratorSourceAdapter(options),
    constants: Object.freeze({
      VERSION,
      CONTRACT,
      MATERIAL_EXTENSION_CONTRACT
    })
  });
});
