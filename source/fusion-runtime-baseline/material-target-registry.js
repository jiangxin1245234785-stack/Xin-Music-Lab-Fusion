(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SmokeResonanceMaterialTargets = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '1.0.0-phase1';
  const REGISTRY_CONTRACT = 'xin.material-target-registry/1';
  const OWNERSHIP_CONTRACT = 'xin.mapping-ownership-diagnostics/1';
  const ACTION_CLASSES = Object.freeze([
    'motion',
    'coverage',
    'refresh',
    'displacement',
    'feedback',
    'color',
    'quantize',
    'commit'
  ]);
  const DEFAULT_DEFINITIONS = Object.freeze([
    Object.freeze({
      id: 'material.coverage',
      label: 'Coverage',
      defaultValue: 1,
      min: 0,
      max: 1,
      actionClass: 'coverage',
      ownerLayer: 'material',
      semanticIntent: 'visible-material-coverage'
    }),
    Object.freeze({
      id: 'material.continuity',
      label: 'Continuity',
      defaultValue: 0.72,
      min: 0,
      max: 1,
      actionClass: 'motion',
      ownerLayer: 'material',
      semanticIntent: 'material-spatial-continuity'
    }),
    Object.freeze({
      id: 'material.refreshRate',
      label: 'Refresh Rate',
      defaultValue: 1,
      min: 0,
      max: 1,
      actionClass: 'refresh',
      ownerLayer: 'material',
      semanticIntent: 'material-temporal-refresh'
    }),
    Object.freeze({
      id: 'material.density',
      label: 'Density',
      defaultValue: 0.5,
      min: 0,
      max: 1,
      actionClass: 'coverage',
      ownerLayer: 'material',
      semanticIntent: 'material-information-density'
    })
  ]);

  function normalizeDefinition(input = {}) {
    const id = String(input.id || '');
    if (!id.startsWith('material.')) {
      throw new Error(`MATERIAL_TARGET_NAMESPACE_INVALID:${id}`);
    }
    const actionClass = String(input.actionClass || '');
    if (!ACTION_CLASSES.includes(actionClass)) {
      throw new Error(`MATERIAL_TARGET_ACTION_CLASS_INVALID:${id}:${actionClass}`);
    }
    const min = Number(input.min);
    const max = Number(input.max);
    const defaultValue = Number(input.defaultValue);
    if (![min, max, defaultValue].every(Number.isFinite) ||
        min > max ||
        defaultValue < min ||
        defaultValue > max) {
      throw new Error(`MATERIAL_TARGET_RANGE_INVALID:${id}`);
    }
    return Object.freeze({
      id,
      label: String(input.label || id),
      defaultValue,
      min,
      max,
      actionClass,
      ownerLayer: 'material',
      semanticIntent: String(input.semanticIntent || id),
      allowDuplicate: input.allowDuplicate === true
    });
  }

  class MaterialTargetRegistry {
    constructor(options = {}) {
      this.definitions = new Map();
      const definitions = options.defaults === false
        ? []
        : DEFAULT_DEFINITIONS;
      for (const definition of definitions) this.register(definition);
    }

    register(input) {
      const definition = normalizeDefinition(input);
      if (this.definitions.has(definition.id)) {
        throw new Error(`MATERIAL_TARGET_DUPLICATE:${definition.id}`);
      }
      this.definitions.set(definition.id, definition);
      return definition;
    }

    has(id) {
      return this.definitions.has(String(id || ''));
    }

    get(id) {
      return this.definitions.get(String(id || '')) || null;
    }

    list() {
      return Object.freeze([...this.definitions.values()]);
    }

    defaults() {
      return Object.freeze(Object.fromEntries(
        [...this.definitions.values()].map(definition => [
          definition.id,
          definition.defaultValue
        ])
      ));
    }

    split(values = {}) {
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

    status() {
      return Object.freeze({
        contract: REGISTRY_CONTRACT,
        version: VERSION,
        namespace: 'material.*',
        count: this.definitions.size,
        ids: Object.freeze([...this.definitions.keys()])
      });
    }
  }

  function analyzeOwnership(options = {}) {
    const mappings = Array.isArray(options.mappings) ? options.mappings : [];
    const definitions = new Map(
      (Array.isArray(options.targetDefinitions)
        ? options.targetDefinitions
        : []
      ).map(definition => [definition.id, definition])
    );
    const groups = new Map();
    let exemptedMappings = 0;

    for (const mapping of mappings) {
      const definition = definitions.get(mapping?.targetId);
      if (!definition || !mapping?.sourceId) continue;
      if (!definition.actionClass || !definition.ownerLayer) continue;
      if (mapping.allowDuplicate === true || definition.allowDuplicate === true) {
        exemptedMappings++;
        continue;
      }
      const key = `${mapping.sourceId}\u0000${definition.actionClass}`;
      const entries = groups.get(key) || [];
      entries.push(Object.freeze({
        mappingId: String(mapping.id || ''),
        sourceId: String(mapping.sourceId),
        targetId: String(mapping.targetId),
        actionClass: String(definition.actionClass),
        ownerLayer: String(definition.ownerLayer),
        semanticIntent: String(definition.semanticIntent || '')
      }));
      groups.set(key, entries);
    }

    const warnings = [];
    for (const entries of groups.values()) {
      const owners = new Set(entries.map(entry => entry.ownerLayer));
      if (owners.size < 2) continue;
      warnings.push(Object.freeze({
        code: 'CROSS_LAYER_DUPLICATE_SEMANTIC',
        severity: 'warning',
        sourceId: entries[0].sourceId,
        actionClass: entries[0].actionClass,
        ownerLayers: Object.freeze([...owners].sort()),
        mappings: Object.freeze(entries)
      }));
    }

    return Object.freeze({
      contract: OWNERSHIP_CONTRACT,
      version: VERSION,
      warningCount: warnings.length,
      warnings: Object.freeze(warnings),
      exemptedMappings,
      hardFailure: false
    });
  }

  return Object.freeze({
    create: options => new MaterialTargetRegistry(options),
    analyzeOwnership,
    constants: Object.freeze({
      VERSION,
      REGISTRY_CONTRACT,
      OWNERSHIP_CONTRACT,
      ACTION_CLASSES,
      DEFAULT_DEFINITIONS
    })
  });
});
