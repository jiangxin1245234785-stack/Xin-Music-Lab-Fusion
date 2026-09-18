import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VISUAL_TARGET_REGISTRY
} from '../dist/render/visual-targets.js';

test('all 21 formal Generator targets declare Phase 1 ownership metadata', () => {
  assert.equal(VISUAL_TARGET_REGISTRY.length, 21);
  for (const definition of VISUAL_TARGET_REGISTRY) {
    assert.equal(definition.ownerLayer, 'glitch', definition.id);
    assert.match(definition.actionClass, /^(motion|coverage|refresh|displacement|feedback|color|quantize|commit)$/, definition.id);
    assert.equal(
      typeof definition.semanticIntent === 'string' &&
      definition.semanticIntent.length > 0,
      true,
      definition.id
    );
  }
});

test('formal target IDs and compatibility count remain unchanged', () => {
  assert.deepEqual(
    VISUAL_TARGET_REGISTRY.map(definition => definition.id),
    [
      'feedback.retention',
      'feedback.decay',
      'feedback.zoom',
      'feedback.rotation',
      'blockDamage.blockSize',
      'blockDamage.displacementX',
      'blockDamage.spawnProbability',
      'blockDamage.lifetime',
      'rgbSplit.distance',
      'rgbSplit.angle',
      'rgbSplit.decay',
      'scanlineGrain.scanlineDepth',
      'scanlineGrain.grainDensity',
      'scanlineGrain.grainContrast',
      'signalLoss.dropoutProbability',
      'signalLoss.dropoutOpacity',
      'signalLoss.whiteTearBrightness',
      'color.brightness',
      'color.contrast',
      'color.saturation',
      'color.flashStrength'
    ]
  );
});
