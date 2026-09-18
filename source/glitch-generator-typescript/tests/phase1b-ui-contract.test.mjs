import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  applyMappingMacros
} from '../dist/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'demo', 'index.html'), 'utf8');
const demoSource = fs.readFileSync(
  path.join(root, 'src', 'ui-debug', 'phase1-demo.ts'),
  'utf8'
);

test('Phase 1b UI exposes Perform, Map and Visual pages', () => {
  for (const page of ['perform', 'map', 'visual']) {
    assert.match(html, new RegExp(`data-page-button="${page}"`));
    assert.match(html, new RegExp(`data-page="${page}"`));
  }
  for (const id of [
    'presetSelect',
    'presetName',
    'captureSnapshotButton',
    'restoreSnapshotButton',
    'snapshotNote',
    'snapshotCount',
    'snapshotStack',
    'savePresetButton',
    'loadPresetButton',
    'persistenceStatus',
    'offlineButton',
    'microphoneButton',
    'phase1Canvas',
    'macroIntensity',
    'macroResponse',
    'mappingSelect',
    'mappingKind',
    'mappingSource',
    'mappingTarget',
    'mappingEnvelope',
    'addMappingButton',
    'soloMappingButton',
    'bypassMappingButton',
    'duplicateMappingButton',
    'deleteMappingButton',
    'mappingVariantA',
    'mappingVariantB',
    'mappingABStatus',
    'mappingAmount',
    'mappingDebugStatus',
    'normalizedReadout',
    'baseReadout',
    'mappingDebugReason',
    'targetDebugReason',
    'energyMeterFill',
    'energyPercent',
    'energyRaw',
    'energyActiveTargets',
    'energyPeak',
    'eventLog',
    'eventLogCount',
    'clearEventLogButton',
    'fxRackToggle',
    'visualTableBody',
    'undoButton',
    'redoButton',
    'historyStatus'
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  for (const id of [
    'eventEnvelopePanel',
    'envelopeDelay',
    'envelopeAttack',
    'envelopeHold',
    'envelopeDecay',
    'envelopeSustain',
    'envelopeRelease',
    'envelopeCooldown',
    'envelopeRetrigger'
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /value="event\.onset"/);
  assert.match(html, /value="event\.bassPeak"/);
  for (const feature of ['loudness', 'bass', 'mid', 'treble']) {
    assert.match(html, new RegExp(`data-meter-fill="${feature}"`));
    assert.match(html, new RegExp(`data-meter-value="${feature}"`));
  }
  for (const label of ['Base Value', 'Mapped Value', 'Final Value']) {
    assert.match(html, new RegExp(label));
  }
});

test('Phase 1b runtime keeps mappings in data and updates Visual rows from mixer trace', () => {
  assert.match(demoSource, /new TargetMixer\(\)/);
  assert.match(demoSource, /applyMappingMacros\(mappings, macroState\(\)\)/);
  assert.match(demoSource, /mixed\.trace\.base\.values/);
  assert.match(demoSource, /mixed\.trace\.replace\.values/);
  assert.match(demoSource, /finalState\.values/);
  assert.match(demoSource, /filterMappingsForRuntime/);
  assert.match(demoSource, /toggleMappingBypass/);
  assert.match(demoSource, /duplicateMapping/);
  assert.match(demoSource, /deleteMapping/);
  assert.match(demoSource, /setMappingABVariantById/);
  assert.match(demoSource, /updateMappingABParameters/);
  assert.match(demoSource, /'Switch mapping to A'/);
  assert.match(demoSource, /'Switch mapping to B'/);
  assert.match(demoSource, /new DebugEventLog\(64\)/);
  assert.match(demoSource, /createMappingIntentViewModel/);
  assert.match(demoSource, /createMappingRuntimeViewModel/);
  assert.match(
    demoSource,
    /measureGlobalEnergyDebug\(\s*mixed\.trace\.energyBudget,\s*targetDefinitions\s*\)/
  );
  assert.match(demoSource, /debugEventLog\.recordFrame\(features\)/);
  assert.match(demoSource, /new SnapshotStack\(\)/);
  assert.match(demoSource, /snapshotStack\.capture\(/);
  assert.match(demoSource, /snapshotStack\.restore\(/);
  assert.match(demoSource, /snapshotStack\.promoteToPreset\(/);
  assert.match(demoSource, /saveCustomPresetToStorage/);
  assert.match(demoSource, /savePresetToStorage/);
  assert.match(demoSource, /loadPresetInputFromStorage/);
  assert.match(demoSource, /renderer\?\.resetFeedback\(\)/);
  assert.match(demoSource, /new UndoHistory<EditorHistoryState>/);
  assert.match(demoSource, /beginContinuous\(/);
  assert.match(demoSource, /commitContinuous\(captureHistoryState\(\)\)/);
  assert.match(demoSource, /'snapshot-restore'/);
  assert.match(demoSource, /history\.undo\(\)/);
  assert.match(demoSource, /history\.redo\(\)/);
  assert.doesNotMatch(demoSource, /Math\.random\(/);
});

test('macro controls alter mapping amount and response without mutating input', () => {
  const input = [{
    id: 'test',
    amount: 0.5,
    attackMs: 100,
    fallMs: 400
  }];
  const output = applyMappingMacros(input, {
    intensity: 1.5,
    response: 2
  });

  assert.equal(output[0].amount, 0.75);
  assert.equal(output[0].attackMs, 50);
  assert.equal(output[0].fallMs, 200);
  assert.equal(input[0].amount, 0.5);
});
