import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  DISPLAY_FRAGMENT_SHADER,
  MINIMAL_FRAGMENT_SHADER,
  PING_PONG_BUFFER_COUNT,
  TEMPORAL_HISTORY_BUFFER_COUNT,
  VISUAL_TARGET_REGISTRY,
  VISUAL_TARGETS
} from '../dist/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rendererSource = fs.readFileSync(
  path.join(root, 'src', 'render', 'minimal-webgl-renderer.ts'),
  'utf8'
);

test('shader consumes all six visual modules and contains no audio semantics', () => {
  for (const uniform of [
    'uFeedbackRetention',
    'uFeedbackDecay',
    'uFeedbackZoom',
    'uFeedbackRotation',
    'uBlockSize',
    'uBlockDisplacementX',
    'uBlockSpawnProbability',
    'uBlockLifetime',
    'uRgbDistance',
    'uRgbAngle',
    'uRgbDecay',
    'uScanlineDepth',
    'uGrainDensity',
    'uGrainContrast',
    'uDropoutProbability',
    'uDropoutOpacity',
    'uWhiteTearBrightness',
    'uColorBrightness',
    'uColorContrast',
    'uColorSaturation',
    'uColorFlashStrength'
  ]) {
    assert.match(MINIMAL_FRAGMENT_SHADER, new RegExp(uniform));
  }
  for (const forbidden of ['loudness', 'bass', 'mid', 'treble', 'onset']) {
    assert.doesNotMatch(MINIMAL_FRAGMENT_SHADER.toLowerCase(), new RegExp(forbidden));
  }
  assert.equal(VISUAL_TARGET_REGISTRY.length, 21);
  assert.equal(VISUAL_TARGETS.feedbackZoom, 'feedback.zoom');
  assert.equal(VISUAL_TARGETS.colorBrightness, 'color.brightness');
  assert.match(MINIMAL_FRAGMENT_SHADER, /uniform sampler2D uSourceFrame/);
  assert.match(MINIMAL_FRAGMENT_SHADER, /uniform float uSourceAvailable/);
  assert.match(MINIMAL_FRAGMENT_SHADER, /texture\(uSourceFrame/);
  assert.match(MINIMAL_FRAGMENT_SHADER, /uniform sampler2D uMaterialDensity/);
  assert.match(MINIMAL_FRAGMENT_SHADER, /uniform sampler2D uMaterialAge/);
  assert.match(MINIMAL_FRAGMENT_SHADER, /materialDensityAt\(uv\)/);
  assert.match(MINIMAL_FRAGMENT_SHADER, /materialAgeAt\(uv\)/);
  assert.match(rendererSource, /fields\.density \?\? null/);
  assert.match(rendererSource, /fields\.age \?\? null/);
  assert.match(rendererSource, /this\.materialDensityAvailable \? 1 : 0/);
  assert.match(rendererSource, /this\.materialAgeAvailable \? 1 : 0/);
});

test('Feedback uses a two-surface ping-pong framebuffer contract', () => {
  assert.equal(PING_PONG_BUFFER_COUNT, 2);
  assert.match(MINIMAL_FRAGMENT_SHADER, /uniform sampler2D uPreviousFrame/);
  assert.match(MINIMAL_FRAGMENT_SHADER, /texture\(uPreviousFrame, feedbackUv\)/);
  assert.match(MINIMAL_FRAGMENT_SHADER, /previousFrame \* decay/);
  assert.match(DISPLAY_FRAGMENT_SHADER, /uniform sampler2D uFrame/);
  assert.match(DISPLAY_FRAGMENT_SHADER, /texture\(uFrame, vUv\)/);
  assert.match(rendererSource, /vUv = position;/);
  assert.match(rendererSource, /const destinationIndex = 1 - sourceIndex/);
  assert.match(rendererSource, /for \(const passId of this\.passOrder\)/);
  assert.match(rendererSource, /gl\.bindFramebuffer\(gl\.FRAMEBUFFER, writeSurface\.framebuffer\)/);
  assert.match(rendererSource, /this\.readIndex = sourceIndex/);
  assert.match(rendererSource, /gl\.texImage2D\([\s\S]*source/);
  assert.match(rendererSource, /checkFramebufferStatus/);
});

test('Temporal history uses an eight-frame deterministic reservoir', () => {
  assert.equal(TEMPORAL_HISTORY_BUFFER_COUNT, 8);
  for (const uniform of [
    'uHistory1',
    'uHistory2',
    'uHistory4',
    'uHistory7',
    'uHistoryAvailable'
  ]) {
    assert.match(rendererSource, new RegExp(uniform));
  }
  assert.match(
    rendererSource,
    /historySurfaces = Array\.from\([\s\S]*TEMPORAL_HISTORY_BUFFER_COUNT/
  );
  assert.match(rendererSource, /captureHistory\(this\.surfaces\[sourceIndex\]/);
  assert.match(rendererSource, /historyTextureAtAge\(age, readSurface\.texture\)/);
  assert.match(rendererSource, /this\.historyWriteIndex = 0/);
  assert.match(rendererSource, /this\.historyAvailable = 0/);
  assert.doesNotMatch(rendererSource, /Date\.now|Math\.random|requestAnimationFrame/);
});
