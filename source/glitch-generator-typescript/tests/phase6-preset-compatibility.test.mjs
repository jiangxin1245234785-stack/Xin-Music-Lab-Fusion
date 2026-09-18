import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CURRENT_SCHEMA_VERSION,
  MIGRATIONS,
  buildPresetCompatibilityReport,
  deserializePresetInput
} from '../dist/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('old preset reports every applied migration and resolved field', () => {
  const legacy = {
    name: 'Legacy preset',
    legacyBloom: 0.8,
    mappings: [{
      id: 'legacy-map',
      sourceId: 'audio.bass',
      targetId: 'feedback.zoom',
      legacyGain: 2
    }]
  };
  const report = buildPresetCompatibilityReport(legacy);

  assert.equal(report.compatible, true);
  assert.equal(report.status, 'partial');
  assert.equal(report.sourceSchemaVersion, 0);
  assert.equal(report.targetSchemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(report.appliedMigrations.length, CURRENT_SCHEMA_VERSION);
  assert.deepEqual(
    report.appliedMigrations.map(step => [step.from, step.to]),
    Array.from(
      { length: CURRENT_SCHEMA_VERSION },
      (_, index) => [index, index + 1]
    )
  );
  assert.ok(
    report.migratedFields.some(field =>
      field.path === 'schemaVersion' && field.action === 'defaulted'
    )
  );
  assert.ok(
    report.migratedFields.some(field =>
      field.path === 'mappings[0].ab' && field.action === 'defaulted'
    )
  );
  assert.ok(
    report.migratedFields.some(field =>
      field.path === 'shaderPipeline.passOrder'
    )
  );
  assert.deepEqual(
    report.nonMigratedFields.map(field => field.path),
    ['legacyBloom', 'mappings[0].legacyGain']
  );
  assert.match(report.nonMigratedFields[0].reason, /No migration rule/);
  assert.deepEqual(legacy, {
    name: 'Legacy preset',
    legacyBloom: 0.8,
    mappings: [{
      id: 'legacy-map',
      sourceId: 'audio.bass',
      targetId: 'feedback.zoom',
      legacyGain: 2
    }]
  });
});

test('invalid known field is named as non-migratable with exact reason', () => {
  const report = buildPresetCompatibilityReport({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    mappings: [{
      id: 'broken',
      sourceId: 'audio.bass',
      targetId: 'visual.unknown'
    }]
  });

  assert.equal(report.status, 'incompatible');
  assert.equal(report.compatible, false);
  assert.deepEqual(
    report.nonMigratedFields.map(field => field.path),
    ['mappings[0].targetId']
  );
  assert.match(report.nonMigratedFields[0].reason, /Unknown visual target/);
});

test('future schema reports schemaVersion as explicitly incompatible', () => {
  const report = buildPresetCompatibilityReport({
    schemaVersion: CURRENT_SCHEMA_VERSION + 1,
    name: 'Future preset'
  });

  assert.equal(report.status, 'incompatible');
  assert.equal(report.appliedMigrations.length, 0);
  assert.deepEqual(
    report.nonMigratedFields.map(field => field.path),
    ['schemaVersion']
  );
  assert.match(
    report.nonMigratedFields[0].reason,
    /newer than supported schema/
  );
});

test('current preset reports a no-op compatibility path', () => {
  const report = buildPresetCompatibilityReport({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    name: 'Current'
  });

  assert.equal(report.status, 'current');
  assert.equal(report.compatible, true);
  assert.equal(report.fullyCompatible, true);
  assert.deepEqual(report.appliedMigrations, []);
  assert.deepEqual(report.migratedFields, []);
  assert.deepEqual(report.nonMigratedFields, []);
});

test('migration registry carries human-readable field metadata', () => {
  assert.equal(MIGRATIONS.length, CURRENT_SCHEMA_VERSION);
  for (const migration of MIGRATIONS) {
    assert.equal(typeof migration.label, 'string');
    assert.ok(Array.isArray(migration.fields));
  }
  assert.ok(
    MIGRATIONS.some(migration =>
      migration.fields.some(field => field.path === 'mappings[].modulations')
    )
  );
});

test('raw persistence parser preserves the source schema for reporting', () => {
  const input = deserializePresetInput(JSON.stringify({
    schemaVersion: 3,
    name: 'Raw legacy',
    legacyField: true
  }));
  assert.equal(input.schemaVersion, 3);
  assert.equal(input.legacyField, true);
});

test('Preset surface exposes migration and compatibility UX', () => {
  const html = readFileSync(path.join(root, 'demo', 'index.html'), 'utf8');
  const runtime = readFileSync(
    path.join(root, 'src', 'ui-debug', 'phase1-demo.ts'),
    'utf8'
  );
  for (const id of [
    'presetCompatibilityStatus',
    'presetCompatibilitySummary',
    'presetCompatibilitySource',
    'presetCompatibilityTarget',
    'presetMigrationCount',
    'presetMigratedFieldCount',
    'presetNonMigratedFieldCount',
    'presetMigrationSteps',
    'presetMigratedFields',
    'presetNonMigratedFields',
    'presetCompatibilityWarnings'
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(runtime, /buildPresetCompatibilityReport\(preset\)/);
  assert.match(runtime, /loadPresetInputFromStorage\(localStorage\)/);
  assert.match(runtime, /renderPresetCompatibility/);
});
