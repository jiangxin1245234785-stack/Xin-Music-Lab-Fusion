(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SmokeResonanceMaterialMappingProfile = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '1.0.0-phase2';
  const CONTRACT = 'xin.material-generator-mapping-extension/1';

  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, clone(child)])
    );
  }

  function materialTarget(input) {
    return Object.freeze({
      ...input,
      module: 'Material',
      ownerLayer: 'material'
    });
  }

  const TARGET_DEFINITIONS = Object.freeze([
    materialTarget({
      id: 'material.coverage',
      label: 'Coverage',
      defaultValue: 1,
      min: 0,
      max: 1,
      actionClass: 'coverage',
      semanticIntent: 'visible-material-coverage'
    }),
    materialTarget({
      id: 'material.continuity',
      label: 'Continuity',
      defaultValue: 0.72,
      min: 0,
      max: 1,
      actionClass: 'motion',
      semanticIntent: 'material-spatial-continuity'
    }),
    materialTarget({
      id: 'material.refreshRate',
      label: 'Refresh Rate',
      defaultValue: 1,
      min: 0,
      max: 1,
      actionClass: 'refresh',
      semanticIntent: 'material-temporal-refresh'
    }),
    materialTarget({
      id: 'material.density',
      label: 'Density',
      defaultValue: 0.5,
      min: 0,
      max: 1,
      actionClass: 'coverage',
      semanticIntent: 'material-information-density'
    })
  ]);

  const MAPPINGS = Object.freeze([
    Object.freeze({
      id: 'material-loudness-to-coverage',
      sourceId: 'audio.loudness',
      targetId: 'material.coverage',
      kind: 'continuous',
      range: Object.freeze([0.32, 0.96]),
      curve: 0.88,
      attackMs: 180,
      fallMs: 900,
      priority: 40,
      replaceMode: 'replace',
      safetyClamp: true,
      probability: 1
    }),
    Object.freeze({
      id: 'material-flatness-to-continuity',
      sourceId: 'audio.flatness',
      targetId: 'material.continuity',
      kind: 'continuous',
      range: Object.freeze([0.44, 0.94]),
      curve: 0.82,
      attackMs: 260,
      fallMs: 1000,
      priority: 40,
      polarity: 'inverted',
      replaceMode: 'replace',
      safetyClamp: true,
      probability: 1
    }),
    Object.freeze({
      id: 'material-flux-to-refresh',
      sourceId: 'audio.flux',
      targetId: 'material.refreshRate',
      kind: 'continuous',
      range: Object.freeze([0.08, 1]),
      curve: 1.15,
      attackMs: 40,
      fallMs: 650,
      priority: 40,
      replaceMode: 'replace',
      safetyClamp: true,
      probability: 1
    }),
    Object.freeze({
      id: 'material-spectrum-to-density',
      sourceId: 'audio.spectralDensity',
      targetId: 'material.density',
      kind: 'continuous',
      range: Object.freeze([0.12, 0.92]),
      curve: 0.9,
      attackMs: 140,
      fallMs: 850,
      priority: 40,
      replaceMode: 'replace',
      safetyClamp: true,
      probability: 1
    })
  ]);

  function runtimeExtension() {
    return clone({
      targetDefinitions: TARGET_DEFINITIONS,
      mappings: MAPPINGS,
      envelopes: []
    });
  }

  return Object.freeze({
    runtimeExtension,
    constants: Object.freeze({
      VERSION,
      CONTRACT,
      TARGET_DEFINITIONS,
      MAPPINGS
    })
  });
});
