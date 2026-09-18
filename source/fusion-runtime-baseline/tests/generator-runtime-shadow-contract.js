'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const api = require('../generator-runtime-shadow.js');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(
  path.join(root, 'generator-runtime-shadow.js'),
  'utf8'
);

const formalBindings = Object.freeze(Array.from({ length: 21 }, (_, index) =>
  Object.freeze({
    targetId: `target.${index}`,
    uniformName: `uTarget${index}`,
    value: index / 20
  })
));

function fakeModule(capture) {
  const presets = {
    balanced: { schemaVersion: 15, id: 'balanced', name: 'Balanced Motion' },
    fracture: { schemaVersion: 15, id: 'fracture', name: 'Controlled Fracture' },
    impact: { schemaVersion: 15, id: 'impact', name: 'Event Impact' }
  };
  return {
    GLITCH_GENERATOR_PACKAGE_VERSION:
      '6.6.1-integration-v.3',
    GLITCH_GENERATOR_BROWSER_API_VERSION: 1,
    listProductBuiltInPresets() {
      return Object.values(presets).map(preset => ({
        id: preset.id,
        name: preset.name,
        schemaVersion: 15,
        category: 'built-in',
        readOnly: true
      }));
    },
    getProductBuiltInPreset(id) {
      if (!presets[id]) throw new Error('PRODUCT_PRESET_NOT_FOUND');
      return { ...presets[id] };
    },
    exportProductPresetJson(preset) {
      return `${JSON.stringify(preset, null, 2)}\n`;
    },
    createProductPresetFileName(preset) {
      return `Xin-Glitch-${preset.id}-schema${preset.schemaVersion}.json`;
    },
    stageProductPresetJson(serialized) {
      try {
        const preset = JSON.parse(serialized);
        return {
          contract: 'xin.glitch-product-preset-json/1',
          version: '5.3.0-product-json',
          applied: false,
          valid: Boolean(preset?.id && preset?.schemaVersion === 15),
          code: preset?.id ? 'PRESET_READY' : 'PRESET_INCOMPATIBLE',
          log: preset?.id ? 'Schema 15 validation passed.' : 'Invalid preset.',
          ...(preset?.id ? { preset } : {})
        };
      } catch (_) {
        return {
          contract: 'xin.glitch-product-preset-json/1',
          version: '5.3.0-product-json',
          applied: false,
          valid: false,
          code: 'PRESET_JSON_PARSE_FAILED',
          log: 'JSON parse failed.'
        };
      }
    },
    createSourceAwareWebglRenderPort(canvas, options) {
      capture.renderCanvas = canvas;
      capture.renderPortOptions = options;
      let qualityMode = options.qualityMode;
      return {
        id: 'fake-source-aware-port',
        setQualityMode(mode) {
          qualityMode = mode;
          capture.qualityMode = mode;
        },
        status() {
          return {
            quality: { mode: qualityMode, id: qualityMode },
            context: {
              state: 'ready',
              contextLosses: 0,
              contextRestores: 0,
              gpuContextsCreated: 1,
              lastError: null
            }
          };
        }
      };
    },
    createGeneratorRuntime(options) {
      capture.options = options;
      let renderCalls = 0;
      let activePreset = { ...options.preset };
      let presetRevision = 0;
      return {
        evaluate(frame, clock) {
          capture.frame = frame;
          capture.clock = clock;
          return {
            contract: 'xin.glitch-runtime-frame/1',
            runtimeVersion: '3.4.0-shadow',
            clock: { ...clock },
            sources: {
              contract: 'xin.glitch-source-frame/1',
              registryVersion: '3.3.0-shadow',
              sourceCount: 27,
              excludedLabels: ['sectionId', 'sectionLabel', 'chord']
            },
            visualIntent: {
              contract: 'xin.generator-target-intent/1',
              dimensions: {}
            },
            profile: {
              evaluateCalls: 1,
              renderAttempts: 0,
              renderCalls: 0,
              gpuContextsCreated: 0,
              canvasTouches: 0,
              rafRequests: 0,
              zeroGpu: true
            }
          };
        },
        render(source, evaluation) {
          renderCalls++;
          capture.renderSource = source;
          capture.renderEvaluation = evaluation;
          return {
            status: 'rendered',
            output: {
              contract: 'xin.generator-source-render/1',
              sourceKind: 'canvas',
              rendered: true,
              skipReason: null,
              quality: {
                mode: capture.qualityMode || 'auto',
                id: capture.qualityMode || 'auto'
              },
              context: {
                state: 'ready',
                contextLosses: 0,
                contextRestores: 0,
                gpuContextsCreated: 1,
                lastError: null
              },
              targetBindingContract:
                'xin.generator-target-uniform-bindings/1',
              targetBindingCount: 21,
              targetBindings: formalBindings
            }
          };
        },
        status() {
          return {
            lifecycle: 'active',
            preset: {
              contract: '5.1.0-product-preset',
              id: activePreset.id,
              name: activePreset.name,
              schemaVersion: activePreset.schemaVersion,
              revision: presetRevision
            },
            profile: {
              evaluateCalls: 1,
              renderCalls,
              gpuContextsCreated: options.renderPort ? 1 : 0,
              canvasTouches: renderCalls,
              rafRequests: 0,
              zeroGpu: !options.renderPort
            }
          };
        },
        setPreset(preset, reason) {
          activePreset = { ...preset };
          presetRevision++;
          capture.appliedPreset = { ...preset };
          capture.presetReason = reason;
          return { ...activePreset };
        },
        getPreset() {
          return { ...activePreset };
        },
        dispose() {
          capture.disposed = true;
        }
      };
    }
  };
}

(async () => {
  const capture = {};
  const shadow = api.create({
    sessionSeed: 31,
    importModule: async () => fakeModule(capture)
  });
  const frame = { contract: 'xin.music-frame/1' };
  const clock = { frameIndex: 1, nowMs: 16, deltaMs: 16 };

  assert.equal(shadow.evaluate(frame, clock), null);
  assert.equal(shadow.status().loadState, 'idle');
  await shadow.load();
  assert.equal(shadow.status().loadState, 'ready');
  assert.equal(capture.options.sessionSeed, 31);
  assert.equal(capture.options.preset.id, 'balanced');
  assert.equal(capture.options.renderPort, undefined);
  const report = shadow.evaluate(frame, clock);
  assert.equal(capture.frame, frame);
  assert.equal(capture.clock, clock);
  assert.equal(report.contract, 'xin.glitch-runtime-frame/1');
  assert.equal(report.sources.contract, 'xin.glitch-source-frame/1');
  assert.equal(report.sources.sourceCount, 27);
  assert.equal(report.visualIntent.contract, 'xin.generator-target-intent/1');
  assert.deepEqual(
    report.sources.excludedLabels,
    ['sectionId', 'sectionLabel', 'chord']
  );
  assert.equal(shadow.status().evaluateCalls, 1);
  assert.equal(shadow.status().rendererEnabled, false);
  assert.equal(shadow.status().formalPipeline, 'legacy');
  assert.equal(shadow.status().runtime.profile.zeroGpu, true);
  assert.equal(shadow.status().sourceAware, true);
  assert.deepEqual(
    shadow.presets().map(preset => preset.id),
    ['balanced', 'fracture', 'impact']
  );
  assert.equal(shadow.status().runtime.preset.id, 'balanced');
  const applied = shadow.setBuiltInPreset('fracture');
  assert.equal(applied.id, 'fracture');
  assert.equal(shadow.status().runtime.preset.id, 'fracture');
  assert.equal(shadow.status().runtime.preset.revision, 1);
  assert.equal(capture.presetReason, 'product-preset-change');
  assert.throws(
    () => shadow.setBuiltInPreset('missing'),
    /PRODUCT_PRESET_NOT_FOUND/
  );
  const exported = shadow.exportPresetJson();
  assert.equal(exported.contract, 'xin.xml-generator-preset-file/1');
  assert.equal(exported.filename, 'Xin-Glitch-fracture-schema15.json');
  assert.equal(JSON.parse(exported.json).id, 'fracture');
  const rejected = shadow.importPresetJson('{broken');
  assert.equal(rejected.valid, false);
  assert.equal(rejected.applied, false);
  assert.equal(shadow.status().runtime.preset.revision, 1);
  const imported = shadow.importPresetJson(exported.json);
  assert.equal(imported.valid, true);
  assert.equal(imported.applied, true);
  assert.equal(imported.appliedPreset.id, 'fracture');
  assert.equal(shadow.status().runtime.preset.revision, 2);
  assert.equal(capture.presetReason, 'product-json-import');

  shadow.evaluate(frame, clock);
  const copy = shadow.get();
  copy.profile.zeroGpu = false;
  assert.equal(shadow.get().profile.zeroGpu, true);

  shadow.dispose();
  assert.equal(capture.disposed, true);
  assert.equal(shadow.status().loadState, 'disposed');

  const renderCapture = {};
  const renderCanvas = { id: 'generator-output' };
  const sourceCanvas = { nodeName: 'CANVAS', width: 64, height: 64 };
  let qualityMode = 'eco';
  const renderer = api.create({
    formalPipeline: 'generator',
    rendererEnabled: true,
    renderCanvas,
    sourceProvider: () => ({
      source: sourceCanvas,
      available: true,
      sourceKind: 'base-canvas',
      materialFields: {
        density: { source: sourceCanvas },
        age: { source: sourceCanvas }
      }
    }),
    mappingExtension: {
      targetDefinitions: [{
        id: 'material.coverage',
        module: 'Material',
        label: 'Coverage',
        defaultValue: 1,
        min: 0,
        max: 1,
        ownerLayer: 'material'
      }],
      mappings: []
    },
    qualityProvider: () => ({ mode: qualityMode }),
    importModule: async () => fakeModule(renderCapture)
  });
  await renderer.load();
  const renderedReport = renderer.evaluate(frame, clock);
  assert.equal(renderedReport.contract, 'xin.glitch-runtime-frame/1');
  assert.equal(renderCapture.renderCanvas, renderCanvas);
  assert.equal(renderCapture.renderPortOptions.qualityMode, 'eco');
  assert.equal(renderCapture.options.renderPort.id, 'fake-source-aware-port');
  assert.equal(renderCapture.renderSource.source, sourceCanvas);
  assert.equal(
    renderCapture.renderSource.materialFields.density.source,
    sourceCanvas
  );
  assert.equal(renderCapture.options.mappingExtension.targetDefinitions.length, 1);
  assert.equal(renderer.status().rendererEnabled, true);
  assert.equal(renderer.status().qualityMode, 'eco');
  assert.equal(renderer.status().renderRequests, 1);
  assert.equal(renderer.status().renderCalls, 1);
  assert.equal(
    renderer.status().renderReport.output.contract,
    'xin.generator-source-render/1'
  );
  assert.equal(renderer.status().renderReport.output.targetBindingCount, 21);
  assert.equal(
    renderer.status().renderReport.output.targetBindingContract,
    'xin.generator-target-uniform-bindings/1'
  );
  assert.equal(
    renderer.status().renderReport.output.targetBindings.every(binding =>
      Number.isFinite(binding.value)
    ),
    true
  );
  assert.equal(renderedReport.profile.zeroGpu, false);
  assert.equal(renderedReport.profile.renderCalls, 1);
  assert.equal(renderedReport.profile.gpuContextsCreated, 1);
  assert.equal(renderedReport.profile.canvasTouches, 1);
  assert.equal(renderedReport.profile.rafRequests, 0);
  assert.equal(renderer.status().formalPipeline, 'generator');
  qualityMode = 'high';
  renderer.evaluate(
    frame,
    { ...clock, frameIndex: 2, nowMs: 32 },
    { render: false }
  );
  assert.equal(renderer.status().renderRequests, 1);
  renderer.renderCurrentSource();
  assert.equal(renderer.status().renderRequests, 2);
  assert.equal(renderCapture.qualityMode, 'high');
  assert.equal(renderer.status().renderPort.quality.mode, 'high');
  renderer.dispose();

  const failed = api.create({
    importModule: async () => ({
      GLITCH_GENERATOR_PACKAGE_VERSION: 'wrong',
      GLITCH_GENERATOR_BROWSER_API_VERSION: 1
    })
  });
  await failed.load();
  assert.equal(failed.status().loadState, 'error');
  assert.equal(
    failed.status().error,
    'GENERATOR_PACKAGE_VERSION_MISMATCH'
  );

  for (const forbidden of [
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'getContext(',
    'performance.now',
    'Date.now',
    'Math.random'
  ]) {
    assert.equal(
      source.includes(forbidden),
      false,
      `Shadow loader contains forbidden operation: ${forbidden}`
    );
  }

  console.log(JSON.stringify({
    contract: 'generator-runtime-shadow',
    loadState: 'ready',
    evaluateCalls: 1,
    rendererEnabledByDefault: false,
    sourceAwareCapability: true,
    formalPipeline: 'legacy',
    zeroGpu: true
  }, null, 2));
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
