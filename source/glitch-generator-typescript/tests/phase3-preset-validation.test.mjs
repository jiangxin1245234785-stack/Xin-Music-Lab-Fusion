import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CURRENT_SCHEMA_VERSION,
  PresetValidationError,
  VISUAL_TARGETS,
  deserializePreset,
  loadValidatedPreset,
  validatePreset
} from '../dist/index.js';

const validMapping = {
  id: 'bass-to-zoom',
  sourceId: 'audio.bass',
  targetId: VISUAL_TARGETS.feedbackZoom,
  range: [0.9, 1.2]
};

test('broken preset reports exact field paths and causes', () => {
  const report = validatePreset({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    mappings: [
      {
        id: 'broken-source',
        sourceId: 'audio.not-real',
        targetId: VISUAL_TARGETS.feedbackZoom,
        range: [0, 1]
      },
      {
        id: 'broken-target',
        sourceId: 'audio.bass',
        targetId: 'visual.not-real',
        range: [0, 'loud']
      },
      {
        id: 'broken-event',
        kind: 'event',
        sourceId: 'event.onset',
        targetId: VISUAL_TARGETS.colorFlashStrength
      }
    ]
  });

  assert.equal(report.valid, false);
  assert.deepEqual(
    report.issues
      .filter(issue => issue.severity === 'error')
      .map(issue => [issue.code, issue.path]),
    [
      ['UNKNOWN_SOURCE', 'mappings[0].sourceId'],
      ['UNKNOWN_TARGET', 'mappings[1].targetId'],
      ['INVALID_RANGE', 'mappings[1].range'],
      ['MISSING_REQUIRED', 'mappings[2].envelopeId']
    ]
  );
  assert.match(report.issues[0].message, /Unknown mapping source/);
});

test('old schema migrates and future schema fails clearly', () => {
  const old = validatePreset({
    schemaVersion: 3,
    mappings: [validMapping]
  });
  assert.equal(old.valid, true);
  assert.equal(old.migrated, true);
  assert.equal(old.preset.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.deepEqual(
    old.issues.map(issue => [issue.code, issue.path]),
    [['SCHEMA_MIGRATED', 'schemaVersion']]
  );

  const future = validatePreset({
    schemaVersion: CURRENT_SCHEMA_VERSION + 1
  });
  assert.equal(future.valid, false);
  assert.equal(future.issues[0].code, 'UNSUPPORTED_SCHEMA_VERSION');
  assert.equal(future.issues[0].path, 'schemaVersion');
  assert.match(future.issues[0].message, /newer than supported schema/);
});

test('unsafe configuration remains loadable but is reported precisely', () => {
  const report = validatePreset({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    mappings: [{
      ...validMapping,
      safetyClamp: false
    }],
    energyBudget: {
      globalEventPolicy: 'queue',
      experimentalQueueEnabled: true
    },
    safety: {
      whiteoutProtection: false,
      blackoutProtection: false,
      feedbackRunawayProtection: false
    }
  });

  assert.equal(report.valid, true);
  assert.deepEqual(
    report.issues.map(issue => issue.path),
    [
      'mappings[0].safetyClamp',
      'energyBudget.experimentalQueueEnabled',
      'safety.whiteoutProtection',
      'safety.blackoutProtection',
      'safety.feedbackRunawayProtection'
    ]
  );
  assert.ok(report.issues.every(issue => issue.severity === 'warning'));
});

test('known but unavailable source reports the configured runtime fallback', () => {
  const report = validatePreset({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    mappings: [validMapping]
  }, {
    availableSourceIds: ['audio.loudness'],
    unavailableSourceFallback: 'hold-last'
  });

  assert.equal(report.valid, true);
  assert.equal(report.issues[0].code, 'SOURCE_UNAVAILABLE');
  assert.equal(report.issues[0].path, 'mappings[0].sourceId');
  assert.match(report.issues[0].message, /fallback is "hold-last"/);
});

test('legacy renderer defaults remain valid without becoming mapping targets', () => {
  const defaultsReport = validatePreset({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    mappings: [validMapping],
    targetDefaults: {
      values: {
        [VISUAL_TARGETS.brightness]: 0.7,
        [VISUAL_TARGETS.scale]: 1,
        [VISUAL_TARGETS.alpha]: 1
      }
    }
  });
  const mappingReport = validatePreset({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    mappings: [{
      ...validMapping,
      targetId: VISUAL_TARGETS.alpha
    }]
  });

  assert.equal(defaultsReport.valid, true);
  assert.equal(mappingReport.valid, false);
  assert.equal(mappingReport.issues[0].path, 'mappings[0].targetId');
});

test('validated load and persistence throw PresetValidationError with path', () => {
  const broken = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    mappings: [{
      sourceId: 'audio.bass'
    }]
  };
  assert.throws(
    () => loadValidatedPreset(broken),
    error => {
      assert.ok(error instanceof PresetValidationError);
      assert.match(error.message, /mappings\[0\]\.targetId/);
      return true;
    }
  );
  assert.throws(
    () => deserializePreset(JSON.stringify(broken)),
    /mappings\[0\]\.targetId/
  );
});

test('Step 4.1 validation rejects cyclic NodeGraph data at the edge path', () => {
  const report = validatePreset({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    nodeGraph: {
      nodes: [
        { id: 'a', kind: 'bus' },
        { id: 'b', kind: 'math' }
      ],
      edges: [
        {
          id: 'a-to-b',
          sourceId: 'a',
          targetNodeId: 'b',
          targetPort: 'a'
        },
        {
          id: 'b-to-a',
          sourceId: 'b',
          targetNodeId: 'a',
          targetPort: 'input'
        }
      ]
    }
  });

  assert.equal(report.valid, false);
  assert.equal(report.issues.at(-1).code, 'NODE_GRAPH_CYCLE');
  assert.equal(report.issues.at(-1).path, 'nodeGraph.edges');
  assert.match(report.issues.at(-1).message, /must be acyclic/);
});
