import assert from 'node:assert/strict';
import test from 'node:test';

import {
  VISUAL_TARGETS,
  adaptChordLabelToHue,
  createGeneratorRuntime
} from '../dist/index.js';

const meta = (sourceProvider, confidence) => ({
  sourceProvider,
  providerDetail: { engineId: 'fixture', providerVersion: '1' },
  confidence,
  available: true,
  ageMs: 0,
  fallbackReason: null
});

function frame({ climaxConfidence, chordConfidence, chord }) {
  return {
    clock: { frameIndex: 1, nowMs: 16, deltaMs: 16 },
    transport: { epoch: 0 },
    states: { inClimax: 1 },
    labels: { chord },
    meta: {
      inClimax: meta('xld.songformer', climaxConfidence),
      chord: meta('xld.harmony', chordConfidence)
    }
  };
}

test('Harmony Adapter produces deterministic pitch-class hue without exposing chord strings as sources', () => {
  assert.deepEqual(adaptChordLabelToHue('C#m7'), {
    hue: 1 / 12,
    root: 'C#',
    recognized: true
  });
  assert.deepEqual(adaptChordLabelToHue('Bbmin'), {
    hue: 10 / 12,
    root: 'Bb',
    recognized: true
  });
  assert.deepEqual(adaptChordLabelToHue('N.C.'), {
    hue: 0,
    root: null,
    recognized: false
  });
});

test('low-confidence structure gates an editable MappingCard while high confidence opens it', () => {
  const preset = {
    mappings: [{
      id: 'climax-color',
      sourceId: 'state.inClimax',
      targetId: VISUAL_TARGETS.colorSaturation,
      gateSourceId: 'confidence.climax',
      gateThreshold: 0.7,
      range: [1.6, 1.6],
      attackMs: 0,
      fallMs: 0
    }],
    targetDefaults: {
      values: { [VISUAL_TARGETS.colorSaturation]: 1 }
    }
  };
  const low = createGeneratorRuntime({ preset });
  const lowReport = low.evaluate(
    frame({ climaxConfidence: 0.45, chordConfidence: 0.9, chord: 'C' }),
    { frameIndex: 1, nowMs: 16, deltaMs: 16 }
  );
  assert.equal(lowReport.mixer.gateDecisions[0].open, false);
  assert.equal(
    lowReport.targets.values[VISUAL_TARGETS.colorSaturation],
    1
  );

  const high = createGeneratorRuntime({ preset });
  const highReport = high.evaluate(
    frame({ climaxConfidence: 0.86, chordConfidence: 0.9, chord: 'C' }),
    { frameIndex: 1, nowMs: 16, deltaMs: 16 }
  );
  assert.equal(highReport.mixer.gateDecisions[0].open, true);
  assert.equal(
    highReport.targets.values[VISUAL_TARGETS.colorSaturation],
    1.6
  );
});

test('harmony.chordHue is a normal editable source gated by confidence.chord', () => {
  const runtime = createGeneratorRuntime({
    preset: {
      mappings: [{
        id: 'chord-hue-to-color',
        sourceId: 'harmony.chordHue',
        targetId: VISUAL_TARGETS.colorContrast,
        gateSourceId: 'confidence.chord',
        gateThreshold: 0.7,
        range: [1, 2],
        attackMs: 0,
        fallMs: 0
      }],
      targetDefaults: {
        values: { [VISUAL_TARGETS.colorContrast]: 1 }
      }
    }
  });
  const report = runtime.evaluate(
    frame({ climaxConfidence: 0.8, chordConfidence: 0.9, chord: 'A' }),
    { frameIndex: 1, nowMs: 16, deltaMs: 16 }
  );
  assert.equal(report.sources.values['harmony.chordHue'], 9 / 12);
  assert.equal(report.mixer.gateDecisions[0].open, true);
  assert.equal(
    report.targets.values[VISUAL_TARGETS.colorContrast],
    1.75
  );
});
