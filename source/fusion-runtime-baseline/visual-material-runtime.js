(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SmokeResonanceVisualMaterial = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '1.0.0-phase1';
  const REGISTRY_CONTRACT = 'xin.visual-material-registry/1';
  const RUNTIME_CONTRACT = 'xin.material-runtime/1';
  const MATERIAL_CONTRACT = 'xin.visual-material/1';
  const SURFACE_CONTRACT = 'xin.material-surface/1';
  const OUTPUT_CONTRACT = 'xin.material-output/1';
  const ORCHESTRATOR_CONTRACT = 'xin.material-frame-orchestrator/1';
  const SURFACE_KINDS = Object.freeze([
    'canvas',
    'bitmap',
    'webgl-texture',
    'external'
  ]);

  function finiteDimension(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
  }

  function frameIndexOf(clock) {
    const frameIndex = Number(clock?.frameIndex);
    if (!Number.isInteger(frameIndex) || frameIndex < 0) {
      throw new Error('MATERIAL_CLOCK_FRAME_INDEX_INVALID');
    }
    return frameIndex;
  }

  function freezeRecord(value) {
    return Object.freeze({ ...(value || {}) });
  }

  function createSurface(input = {}) {
    const source = input.source;
    if (!source) throw new Error('MATERIAL_SURFACE_SOURCE_REQUIRED');
    const kind = String(input.kind || 'external');
    if (!SURFACE_KINDS.includes(kind)) {
      throw new Error(`MATERIAL_SURFACE_KIND_INVALID:${kind}`);
    }
    const width = finiteDimension(input.width ?? source.width ?? source.clientWidth);
    const height = finiteDimension(input.height ?? source.height ?? source.clientHeight);
    if (!width || !height) {
      throw new Error('MATERIAL_SURFACE_DIMENSIONS_INVALID');
    }
    return Object.freeze({
      contract: SURFACE_CONTRACT,
      kind,
      source,
      sourceKind: String(input.sourceKind || kind),
      width,
      height,
      format: String(input.format || 'rgba8'),
      colorSpace: String(input.colorSpace || 'srgb')
    });
  }

  function assertMaterial(material, id) {
    for (const method of ['reset', 'update', 'render', 'outputs', 'status']) {
      if (typeof material?.[method] !== 'function') {
        throw new Error(`MATERIAL_LIFECYCLE_METHOD_MISSING:${id}:${method}`);
      }
    }
    return material;
  }

  function normalizeDescriptor(input = {}) {
    const id = String(input.id || '').trim();
    if (!/^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/.test(id)) {
      throw new Error(`MATERIAL_ID_INVALID:${id}`);
    }
    if (typeof input.create !== 'function') {
      throw new Error(`MATERIAL_FACTORY_REQUIRED:${id}`);
    }
    return Object.freeze({
      id,
      label: String(input.label || id),
      category: String(input.category || 'legacy'),
      sourceKind: String(input.sourceKind || 'base-canvas'),
      experimental: input.experimental === true,
      create: input.create
    });
  }

  class VisualMaterialRegistry {
    constructor() {
      this.descriptors = new Map();
    }

    register(input) {
      const descriptor = normalizeDescriptor(input);
      if (this.descriptors.has(descriptor.id)) {
        throw new Error(`MATERIAL_ID_DUPLICATE:${descriptor.id}`);
      }
      this.descriptors.set(descriptor.id, descriptor);
      return this.describe(descriptor.id);
    }

    has(id) {
      return this.descriptors.has(String(id || ''));
    }

    describe(id) {
      const descriptor = this.descriptors.get(String(id || ''));
      if (!descriptor) return null;
      const { create: omitted, ...publicDescriptor } = descriptor;
      return Object.freeze({ ...publicDescriptor });
    }

    list() {
      return Object.freeze(
        [...this.descriptors.keys()].map(id => this.describe(id))
      );
    }

    create(id, options = {}) {
      const key = String(id || '');
      const descriptor = this.descriptors.get(key);
      if (!descriptor) throw new Error(`MATERIAL_NOT_REGISTERED:${key}`);
      return assertMaterial(
        descriptor.create({ ...options, descriptor: this.describe(key) }),
        key
      );
    }

    status() {
      return Object.freeze({
        contract: REGISTRY_CONTRACT,
        version: VERSION,
        count: this.descriptors.size,
        ids: Object.freeze([...this.descriptors.keys()])
      });
    }
  }

  class LegacyCanvasMaterialAdapter {
    constructor(options = {}) {
      this.id = String(options.id || '');
      this.label = String(options.label || this.id);
      this.sourceKind = String(options.sourceKind || 'base-canvas');
      this.sourceProvider = typeof options.sourceProvider === 'function'
        ? options.sourceProvider
        : null;
      this.onReset = typeof options.reset === 'function' ? options.reset : null;
      this.onUpdate = typeof options.update === 'function' ? options.update : null;
      this.onRender = typeof options.render === 'function' ? options.render : null;
      this.onStatus = typeof options.status === 'function' ? options.status : null;
      this.resetCount = 0;
      this.updateCount = 0;
      this.renderCount = 0;
      this.lastResetReason = 'initial';
      this.lastFrameIndex = null;
      this.lastUpdate = null;
      this.lastOutput = null;
    }

    reset(reason = 'manual') {
      this.resetCount++;
      this.lastResetReason = String(reason || 'manual');
      this.lastFrameIndex = null;
      this.lastUpdate = null;
      this.lastOutput = null;
      this.onReset?.(this.lastResetReason);
    }

    update(musicFrame, clock, parameters = {}) {
      const frameIndex = frameIndexOf(clock);
      if (frameIndex === this.lastFrameIndex && this.lastUpdate) {
        return this.lastUpdate;
      }
      this.lastFrameIndex = frameIndex;
      this.updateCount++;
      this.lastUpdate = Object.freeze({
        musicFrame,
        clock: freezeRecord(clock),
        parameters: freezeRecord(parameters)
      });
      this.onUpdate?.(this.lastUpdate);
      return this.lastUpdate;
    }

    render(target = {}) {
      if (!this.lastUpdate) throw new Error('MATERIAL_RENDER_BEFORE_UPDATE');
      const rendered = this.onRender?.({
        ...this.lastUpdate,
        target
      });
      const supplied = rendered?.color || rendered || this.sourceProvider?.();
      const surfaceInput = supplied?.source
        ? supplied
        : {
            kind: 'canvas',
            source: supplied,
            sourceKind: this.sourceKind
          };
      const color = createSurface({
        kind: surfaceInput.kind || 'canvas',
        source: surfaceInput.source,
        sourceKind: surfaceInput.sourceKind || this.sourceKind,
        width: surfaceInput.width,
        height: surfaceInput.height,
        format: surfaceInput.format,
        colorSpace: surfaceInput.colorSpace
      });
      this.renderCount++;
      this.lastOutput = Object.freeze({
        contract: OUTPUT_CONTRACT,
        materialId: this.id,
        frameIndex: this.lastFrameIndex,
        color,
        fields: Object.freeze({})
      });
      return this.lastOutput;
    }

    outputs() {
      return this.lastOutput;
    }

    status() {
      return Object.freeze({
        contract: MATERIAL_CONTRACT,
        version: VERSION,
        id: this.id,
        label: this.label,
        adapter: 'legacy-canvas',
        sourceKind: this.sourceKind,
        frameIndex: this.lastFrameIndex,
        resetCount: this.resetCount,
        updateCount: this.updateCount,
        renderCount: this.renderCount,
        lastResetReason: this.lastResetReason,
        metrics: Object.freeze({
          coverage: null,
          meanFrameDifference: null,
          refreshRate: null
        }),
        ...(this.onStatus?.() || {})
      });
    }
  }

  class MaterialRuntime {
    constructor(options = {}) {
      if (!(options.registry instanceof VisualMaterialRegistry)) {
        throw new Error('MATERIAL_REGISTRY_REQUIRED');
      }
      this.registry = options.registry;
      this.materialOptions = options.materialOptions || {};
      this.activeId = null;
      this.activeMaterial = null;
      this.previousId = null;
      this.activationSerial = 0;
      this.disposed = false;
      if (options.initialMaterialId) {
        this.activate(options.initialMaterialId, 'initial');
      }
    }

    assertActive() {
      if (this.disposed) throw new Error('MATERIAL_RUNTIME_DISPOSED');
      if (!this.activeMaterial) throw new Error('MATERIAL_RUNTIME_INACTIVE');
    }

    activate(id, reason = 'material-change') {
      if (this.disposed) throw new Error('MATERIAL_RUNTIME_DISPOSED');
      const key = String(id || '');
      if (key === this.activeId && this.activeMaterial) {
        return this.status();
      }
      const next = this.registry.create(key, this.materialOptions);
      const previous = this.activeMaterial;
      this.previousId = this.activeId;
      previous?.reset('material-deactivate');
      this.activeId = key;
      this.activeMaterial = next;
      this.activationSerial++;
      next.reset(reason);
      return this.status();
    }

    reset(reason = 'manual') {
      this.assertActive();
      this.activeMaterial.reset(reason);
      return this.status();
    }

    update(musicFrame, clock, parameters = {}) {
      this.assertActive();
      return this.activeMaterial.update(musicFrame, clock, parameters);
    }

    render(target = {}) {
      this.assertActive();
      return this.activeMaterial.render(target);
    }

    outputs() {
      return this.activeMaterial?.outputs() || null;
    }

    status() {
      const material = this.activeMaterial?.status() || null;
      return Object.freeze({
        contract: RUNTIME_CONTRACT,
        version: VERSION,
        activeMaterialId: this.activeId,
        previousMaterialId: this.previousId,
        activationSerial: this.activationSerial,
        registry: this.registry.status(),
        material
      });
    }

    dispose() {
      if (this.disposed) return;
      this.activeMaterial?.reset('dispose');
      this.activeMaterial = null;
      this.activeId = null;
      this.disposed = true;
    }
  }

  function defaultSplitTargets(snapshot) {
    const values = snapshot?.values || snapshot?.targets || snapshot || {};
    const material = {};
    const glitch = {};
    for (const [id, value] of Object.entries(values)) {
      if (id.startsWith('material.')) material[id] = value;
      else glitch[id] = value;
    }
    return Object.freeze({
      material: Object.freeze(material),
      glitch: Object.freeze(glitch)
    });
  }

  class MaterialFrameOrchestrator {
    constructor(options = {}) {
      if (!(options.materialRuntime instanceof MaterialRuntime)) {
        throw new Error('MATERIAL_RUNTIME_REQUIRED');
      }
      this.materialRuntime = options.materialRuntime;
      this.evaluateMapping = typeof options.evaluateMapping === 'function'
        ? options.evaluateMapping
        : null;
      this.splitTargets = typeof options.splitTargets === 'function'
        ? options.splitTargets
        : defaultSplitTargets;
      this.renderGlitch = typeof options.renderGlitch === 'function'
        ? options.renderGlitch
        : null;
      this.compose = typeof options.compose === 'function'
        ? options.compose
        : null;
      this.lastFrameIndex = null;
      this.lastSnapshot = null;
      this.mappingEvaluations = 0;
      this.materialFrames = 0;
      this.glitchFrames = 0;
      this.frameMismatchCount = 0;
    }

    run(input = {}) {
      const clock = freezeRecord(input.clock);
      const frameIndex = frameIndexOf(clock);
      if (frameIndex === this.lastFrameIndex) {
        throw new Error(`MATERIAL_FRAME_DUPLICATE:${frameIndex}`);
      }
      const mappingSnapshot = input.mappingSnapshot !== undefined
        ? input.mappingSnapshot
        : this.evaluateMapping?.(input.musicFrame, clock);
      if (input.mappingSnapshot === undefined && this.evaluateMapping) {
        this.mappingEvaluations++;
      }
      const split = this.splitTargets(mappingSnapshot || {});
      this.materialRuntime.update(input.musicFrame, clock, split.material);
      const materialOutput = this.materialRuntime.render(input.target || {});
      this.materialFrames++;
      const glitchOutput = (input.renderGlitch || this.renderGlitch)?.({
        musicFrame: input.musicFrame,
        clock,
        mappingSnapshot,
        targets: split.glitch,
        materialOutput
      }) || null;
      if (glitchOutput) this.glitchFrames++;
      const composed = (input.compose || this.compose)?.({
        clock,
        materialOutput,
        glitchOutput
      }) || null;
      this.lastFrameIndex = frameIndex;
      this.lastSnapshot = Object.freeze({
        contract: ORCHESTRATOR_CONTRACT,
        frameIndex,
        order: Object.freeze([
          'mapping',
          'material-update',
          'material-render',
          'glitch-render',
          'compose'
        ]),
        mappingSnapshot,
        materialTargets: split.material,
        glitchTargets: split.glitch,
        materialOutput,
        glitchOutput,
        composed
      });
      return this.lastSnapshot;
    }

    observeGlitch(frameIndex, report = null) {
      const observed = Number(frameIndex);
      const matches = Number.isInteger(observed) &&
        observed === this.lastFrameIndex;
      if (!matches) this.frameMismatchCount++;
      else this.glitchFrames++;
      return Object.freeze({
        contract: ORCHESTRATOR_CONTRACT,
        materialFrameIndex: this.lastFrameIndex,
        glitchFrameIndex: Number.isInteger(observed) ? observed : null,
        matches,
        reportAvailable: Boolean(report)
      });
    }

    get() {
      return this.lastSnapshot;
    }

    status() {
      return Object.freeze({
        contract: ORCHESTRATOR_CONTRACT,
        version: VERSION,
        frameIndex: this.lastFrameIndex,
        mappingEvaluations: this.mappingEvaluations,
        materialFrames: this.materialFrames,
        glitchFrames: this.glitchFrames,
        frameMismatchCount: this.frameMismatchCount,
        sameFramePass: this.frameMismatchCount === 0,
        runtime: this.materialRuntime.status()
      });
    }
  }

  return Object.freeze({
    createRegistry: () => new VisualMaterialRegistry(),
    createRuntime: options => new MaterialRuntime(options),
    createLegacyAdapter: options => new LegacyCanvasMaterialAdapter(options),
    createFrameOrchestrator: options => new MaterialFrameOrchestrator(options),
    createSurface,
    splitTargets: defaultSplitTargets,
    constants: Object.freeze({
      VERSION,
      REGISTRY_CONTRACT,
      RUNTIME_CONTRACT,
      MATERIAL_CONTRACT,
      SURFACE_CONTRACT,
      OUTPUT_CONTRACT,
      ORCHESTRATOR_CONTRACT,
      SURFACE_KINDS
    })
  });
});
