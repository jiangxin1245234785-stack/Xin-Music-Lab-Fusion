'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const app = read('app.js');
const fusion = read('fusion.js');
const shadow = read('generator-runtime-shadow.js');

const animate = app.slice(
  app.indexOf('function animate()'),
  app.indexOf(
    "enterButton.addEventListener('click'",
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

console.log(JSON.stringify({
  contract: 'xin.phase2-material-frame-phases/1',
  order: [
    'generator-mapping',
    'material-render',
    'generator-field-aware-render'
  ],
  sameFrame: true
}, null, 2));
