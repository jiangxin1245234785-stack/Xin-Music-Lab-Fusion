import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CURRENT_ENGINE_VERSION,
  CURRENT_PRESET_VERSION,
  CURRENT_SCHEMA_VERSION,
  MIGRATIONS,
  getMigrationPath,
  loadPreset,
  migratePreset
} from '../dist/index.js';

const migrationPairsFrom = sourceVersion =>
  Array.from(
    { length: CURRENT_SCHEMA_VERSION - sourceVersion },
    (_, index) => [
      sourceVersion + index,
      sourceVersion + index + 1
    ]
  );

test('the ordered registry exposes the callable no-op v1 baseline migration', () => {
  assert.equal(CURRENT_SCHEMA_VERSION, 16);
  assert.equal(MIGRATIONS.length, 16);
  assert.equal(MIGRATIONS[0].from, 0);
  assert.equal(MIGRATIONS[0].to, 1);
  assert.equal(MIGRATIONS[1].from, 1);
  assert.equal(MIGRATIONS[1].to, 2);
  assert.equal(MIGRATIONS[2].from, 2);
  assert.equal(MIGRATIONS[2].to, 3);
  assert.equal(MIGRATIONS[3].from, 3);
  assert.equal(MIGRATIONS[3].to, 4);
  assert.equal(MIGRATIONS[4].from, 4);
  assert.equal(MIGRATIONS[4].to, 5);
  assert.equal(MIGRATIONS[5].from, 5);
  assert.equal(MIGRATIONS[5].to, 6);
  assert.equal(MIGRATIONS[6].from, 6);
  assert.equal(MIGRATIONS[6].to, 7);
  assert.equal(MIGRATIONS[7].from, 7);
  assert.equal(MIGRATIONS[7].to, 8);
  assert.equal(MIGRATIONS[8].from, 8);
  assert.equal(MIGRATIONS[8].to, 9);
  assert.equal(MIGRATIONS[9].from, 9);
  assert.equal(MIGRATIONS[9].to, 10);
  assert.equal(MIGRATIONS[10].from, 10);
  assert.equal(MIGRATIONS[10].to, 11);
  assert.equal(MIGRATIONS[11].from, 11);
  assert.equal(MIGRATIONS[11].to, 12);
  assert.equal(MIGRATIONS[12].from, 12);
  assert.equal(MIGRATIONS[12].to, 13);
  assert.equal(MIGRATIONS[13].from, 13);
  assert.equal(MIGRATIONS[13].to, 14);
  assert.equal(MIGRATIONS[14].from, 14);
  assert.equal(MIGRATIONS[14].to, 15);
  assert.equal(MIGRATIONS[15].from, 15);
  assert.equal(MIGRATIONS[15].to, 16);

  const legacy = {
    name: 'Legacy',
    mappings: [{ sourceId: 'audio.loudness' }]
  };
  const baselineResult = MIGRATIONS[0].migrate(legacy);

  assert.deepEqual(baselineResult, legacy);
  assert.notStrictEqual(baselineResult, legacy);
  assert.notStrictEqual(baselineResult.mappings, legacy.mappings);
});

test('loading an unversioned preset runs the baseline migration and resolves defaults', () => {
  const legacy = {
    name: 'Unversioned preset',
    mappings: [{ sourceId: 'audio.loudness', amount: 0.4 }],
    metadata: { source: 'step-0.1' }
  };

  assert.deepEqual(
    getMigrationPath(0).map(entry => [entry.from, entry.to]),
    migrationPairsFrom(0)
  );

  const loaded = loadPreset(legacy);
  assert.equal(loaded.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(loaded.engineVersion, CURRENT_ENGINE_VERSION);
  assert.equal(loaded.presetVersion, CURRENT_PRESET_VERSION);
  assert.equal(loaded.seed, 1);
  assert.equal(loaded.name, 'Unversioned preset');
  assert.equal(loaded.mappings[0].amount, 0.4);
  assert.deepEqual(legacy, {
    name: 'Unversioned preset',
    mappings: [{ sourceId: 'audio.loudness', amount: 0.4 }],
    metadata: { source: 'step-0.1' }
  });
});

test('loading a v1 preset traverses seed and continuous MappingCard migrations', () => {
  const loaded = loadPreset({
    schemaVersion: 1,
    engineVersion: '0.2.0',
    presetVersion: 1,
    name: 'Schema v1'
  });

  assert.deepEqual(
    getMigrationPath(1).map(entry => [entry.from, entry.to]),
    migrationPairsFrom(1)
  );
  assert.equal(loaded.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(loaded.seed, 1);
  assert.equal(loaded.name, 'Schema v1');
});

test('loading a v2 preset resolves Phase 1a continuous MappingCard defaults', () => {
  const loaded = loadPreset({
    schemaVersion: 2,
    mappings: [{
      id: 'legacy-mapping',
      sourceId: 'audio.bass',
      targetId: 'feedback.zoom'
    }]
  });

  assert.deepEqual(
    getMigrationPath(2).map(entry => [entry.from, entry.to]),
    migrationPairsFrom(2)
  );
  assert.equal(loaded.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.deepEqual(loaded.mappings[0].range, [0, 1]);
  assert.equal(loaded.mappings[0].curve, 1);
  assert.equal(loaded.mappings[0].attackMs, 80);
  assert.equal(loaded.mappings[0].fallMs, 240);
  assert.equal(loaded.mappings[0].threshold, 0);
  assert.equal(loaded.mappings[0].priority, 0);
  assert.equal(loaded.mappings[0].kind, 'continuous');
  assert.equal(loaded.mappings[0].envelopeId, '');
  assert.equal(loaded.mappings[0].gateSourceId, '');
  assert.equal(loaded.mappings[0].gateThreshold, 0.5);
  assert.equal(loaded.mappings[0].polarity, 'normal');
  assert.equal(loaded.mappings[0].replaceMode, 'replace');
  assert.equal(loaded.mappings[0].safetyClamp, true);
  assert.equal(loaded.mappings[0].probability, 1);
});

test('loading a v3 preset resolves Phase 1c event defaults', () => {
  const loaded = loadPreset({
    schemaVersion: 3,
    mappings: [{ id: 'event-card', kind: 'event' }],
    envelopes: [{ id: 'event-envelope' }]
  });

  assert.deepEqual(
    getMigrationPath(3).map(entry => [entry.from, entry.to]),
    migrationPairsFrom(3)
  );
  assert.equal(loaded.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(loaded.mappings[0].kind, 'event');
  assert.equal(loaded.envelopes[0].delayMs, 0);
  assert.equal(loaded.envelopes[0].cooldownMs, 250);
  assert.equal(loaded.envelopes[0].retriggerMode, 'restart');
});

test('loading a v4 preset traverses the Snapshot Stack schema migration', () => {
  const loaded = loadPreset({
    schemaVersion: 4,
    name: 'Schema v4'
  });

  assert.deepEqual(
    getMigrationPath(4).map(entry => [entry.from, entry.to]),
    migrationPairsFrom(4)
  );
  assert.equal(loaded.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(loaded.name, 'Schema v4');
});

test('loading a v5 preset resolves independent Mapping A/B defaults', () => {
  const loaded = loadPreset({
    schemaVersion: 5,
    name: 'Schema v5',
    mappings: [{
      id: 'legacy-card',
      amount: 0.42,
      range: [0.2, 0.8],
      attackMs: 110
    }]
  });

  assert.deepEqual(
    getMigrationPath(5).map(entry => [entry.from, entry.to]),
    migrationPairsFrom(5)
  );
  assert.equal(loaded.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(loaded.mappings[0].ab.active, 'A');
  assert.deepEqual(loaded.mappings[0].ab.a, loaded.mappings[0].ab.b);
  assert.equal(loaded.mappings[0].ab.a.amount, 0.42);
  assert.deepEqual(loaded.mappings[0].ab.a.range, [0.2, 0.8]);
  assert.equal(loaded.mappings[0].ab.a.attackMs, 110);
});

test('loading a v6 preset traverses the second-batch feature schema migration', () => {
  const loaded = loadPreset({
    schemaVersion: 6,
    name: 'Schema v6',
    mappings: [{
      id: 'build-retention',
      sourceId: 'audio.buildEnergy',
      targetId: 'feedback.retention'
    }]
  });

  assert.deepEqual(
    getMigrationPath(6).map(entry => [entry.from, entry.to]),
    migrationPairsFrom(6)
  );
  assert.equal(loaded.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(loaded.mappings[0].sourceId, 'audio.buildEnergy');
});

test('loading a v7 preset resolves Phase 3.2 Gate defaults', () => {
  const loaded = loadPreset({
    schemaVersion: 7,
    name: 'Schema v7',
    mappings: [{
      id: 'legacy-structure-card',
      sourceId: 'audio.flux',
      targetId: 'feedback.decay'
    }]
  });

  assert.deepEqual(
    getMigrationPath(7).map(entry => [entry.from, entry.to]),
    migrationPairsFrom(7)
  );
  assert.equal(loaded.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(loaded.mappings[0].gateSourceId, '');
  assert.equal(loaded.mappings[0].gateThreshold, 0.5);
});

test('loading a v8 preset resolves complete MappingCard defaults', () => {
  const loaded = loadPreset({
    schemaVersion: 8,
    name: 'Schema v8',
    mappings: [{
      id: 'legacy-card',
      sourceId: 'audio.bass',
      targetId: 'feedback.zoom'
    }]
  });

  assert.deepEqual(
    getMigrationPath(8).map(entry => [entry.from, entry.to]),
    migrationPairsFrom(8)
  );
  assert.equal(loaded.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(loaded.mappings[0].polarity, 'normal');
  assert.equal(loaded.mappings[0].replaceMode, 'replace');
  assert.equal(loaded.mappings[0].safetyClamp, true);
  assert.equal(loaded.mappings[0].probability, 1);
});

test('loading a v9 preset resolves the active EnergyBudget defaults', () => {
  const loaded = loadPreset({
    schemaVersion: 9,
    name: 'Schema v9'
  });

  assert.deepEqual(
    getMigrationPath(9).map(entry => [entry.from, entry.to]),
    migrationPairsFrom(9)
  );
  assert.deepEqual(loaded.energyBudget, {
    enabled: false,
    budget: 1,
    weights: {},
    eventVoiceLimit: 4,
    globalEventPolicy: 'drop-low-priority',
    experimentalQueueEnabled: false
  });
});

test('loading a v10 preset resolves complete SafetyLimiter defaults', () => {
  const loaded = loadPreset({
    schemaVersion: 10,
    name: 'Schema v10'
  });

  assert.deepEqual(
    getMigrationPath(10).map(entry => [entry.from, entry.to]),
    migrationPairsFrom(10)
  );
  assert.deepEqual(loaded.safety, {
    whiteoutProtection: true,
    blackoutProtection: true,
    feedbackRunawayProtection: true
  });
});

test('loading a v11 preset resolves the NodeGraph core defaults', () => {
  const loaded = loadPreset({
    schemaVersion: 11,
    name: 'Schema v11'
  });

  assert.deepEqual(
    getMigrationPath(11).map(entry => [entry.from, entry.to]),
    migrationPairsFrom(11)
  );
  assert.deepEqual(loaded.nodeGraph, {
    nodes: [],
    edges: []
  });
});

test('loading a v12 preset resolves second-order modulation defaults', () => {
  const loaded = loadPreset({
    schemaVersion: 12,
    name: 'Schema v12',
    mappings: [{
      id: 'modulated-card',
      sourceId: 'audio.bass',
      targetId: 'feedback.zoom',
      modulations: [{
        sourceId: 'state.inDrop'
      }]
    }]
  });

  assert.deepEqual(
    getMigrationPath(12).map(entry => [entry.from, entry.to]),
    [[12, 13], [13, 14], [14, 15], [15, 16]]
  );
  assert.deepEqual(loaded.mappings[0].modulations, [{
    id: 'modulated-card-modulation-1',
    sourceId: 'state.inDrop',
    targetParameter: 'amount',
    depth: 0,
    enabled: true
  }]);
});

test('loading a v13 preset resolves Phase 5.4 shader pipeline defaults', () => {
  const loaded = loadPreset({
    schemaVersion: 13,
    name: 'Schema v13'
  });

  assert.deepEqual(
    getMigrationPath(13).map(entry => [entry.from, entry.to]),
    [[13, 14], [14, 15], [15, 16]]
  );
  assert.deepEqual(loaded.shaderPipeline, {
    passOrder: ['builtin-feedback', 'custom-glsl'],
    customPass: {
      enabled: true,
      label: 'Custom GLSL pass',
      source: ''
    },
    uniformRegistry: []
  });
});

test('loading a v14 preset registers confidence and harmony source compatibility', () => {
  const loaded = loadPreset({
    schemaVersion: 14,
    name: 'Schema v14',
    mappings: [{
      id: 'chord-hue',
      sourceId: 'harmony.chordHue',
      targetId: 'color.saturation',
      gateSourceId: 'confidence.chord',
      gateThreshold: 0.6
    }]
  });

  assert.deepEqual(
    getMigrationPath(14).map(entry => [entry.from, entry.to]),
    [[14, 15], [15, 16]]
  );
  assert.equal(loaded.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(loaded.mappings[0].sourceId, 'harmony.chordHue');
  assert.equal(loaded.mappings[0].gateSourceId, 'confidence.chord');
});

test('loading a current preset is a migration no-op', () => {
  const current = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    engineVersion: CURRENT_ENGINE_VERSION,
    presetVersion: CURRENT_PRESET_VERSION,
    name: 'Current preset'
  };

  assert.deepEqual(getMigrationPath(CURRENT_SCHEMA_VERSION), []);
  assert.deepEqual(migratePreset(current), current);
  assert.equal(loadPreset(current).name, 'Current preset');
});

test('future and invalid schema versions are rejected', () => {
  assert.throws(
    () => loadPreset({ schemaVersion: CURRENT_SCHEMA_VERSION + 1 }),
    /newer than supported/
  );
  assert.throws(
    () => loadPreset({ schemaVersion: -1 }),
    /Invalid schemaVersion/
  );
});
