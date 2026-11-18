'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const app = read('app.js');
const fusion = read('fusion.js');
const shadow = read('generator-runtime-shadow.js');
const vm = require('node:vm');

const animate = app.slice(
  app.indexOf('function animate()'),
  app.indexOf(
    "intensityInput.addEventListener('input'",
    app.indexOf('function animate()')
  )
);
const pre = animate.indexOf('engineFrameSubscribers.preMaterial');
const material = animate.indexOf('materialFrameOrchestrator.run(materialFrame)');
const post = animate.indexOf('engineFrameSubscribers.postMaterial');
assert.ok(pre >= 0);
assert.ok(pre < material);
assert.ok(material < post);
assert.match(app, /source: 'generator-shared-mapping'/);
assert.match(fusion, /subscribe\([\s\S]*updateResolverShadow,[\s\S]*phase: 'pre-material'/);
assert.match(fusion, /subscribe\([\s\S]*renderGeneratorFrame,[\s\S]*phase: 'post-material'/);
assert.match(fusion, /evaluate\([\s\S]*\{ render: false \}/);
assert.match(fusion, /acceptGeneratorMapping/);
assert.match(fusion, /renderCurrentSource\(\)/);
assert.match(shadow, /this\.runtime\.render\(sourceFrame, this\.report\)/);

// Exercise the real score branch without material globals: accidentally submitting
// work to the invisible renderer would fail here. The director still hears the music.
const seen = [], work = [];
const score = {
  frame: 0, activeEffect: 'score', document: {hidden: false},
  performance: {now: () => 200}, requestAnimationFrame() {},
  audioState: {playing: true}, directorState: {enabled: false},
  glitchPanelOpen: false, scoreClockFrame: {}, shellRequest: 0, scoreDriver: null,
  engineClockFrame: {frameIndex: 0, nowMs: 100},
  engineFrameSubscribers: {
    preMaterial: new Set([clock => seen.push(['pre', clock.frameIndex])]),
    postMaterial: new Set([clock => seen.push(['post', clock.frameIndex])])
  },
  getEnergy: () => { work.push('audio'); return {}; },
  updateDirector: () => work.push('director')
};
vm.runInNewContext(app.slice(app.indexOf('  function publishScoreClock'), app.indexOf("  intensityInput.addEventListener('input'")), score);
score.animate();
assert.deepEqual(work, []);
assert.deepEqual(seen, [['pre', 1], ['post', 1]]);
score.directorState.enabled = true;
score.animate();
assert.deepEqual(work, ['audio', 'director']);
score.audioState.playing = false;
score.animate();
assert.deepEqual(work, ['audio', 'director']);
assert.equal(score.engineClockFrame.frameIndex, 3);
score.engineFrameSubscribers.preMaterial.clear();
score.engineFrameSubscribers.postMaterial.clear();
score.animate();
assert.equal(score.engineClockFrame.frameIndex, 4);
assert.equal(seen.length, 6);

console.log(JSON.stringify({
  contract: 'xin.phase2-material-frame-phases/1',
  order: [
    'generator-mapping',
    'material-render',
    'generator-field-aware-render'
  ],
  sameFrame: true
}, null, 2));
