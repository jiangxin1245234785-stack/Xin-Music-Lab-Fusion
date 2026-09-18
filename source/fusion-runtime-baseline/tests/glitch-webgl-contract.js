'use strict';

const assert = require('assert');
const api = require('../glitch-webgl.js');

assert.strictEqual(typeof api.create, 'function', 'WebGL renderer factory is missing');
for (const name of ['vertex', 'feedback', 'damage', 'composite']) {
  assert(api.shaders[name].includes('#version 300 es'), `${name} shader must target WebGL2 GLSL 300`);
}
assert(api.shaders.feedback.includes('uPrevious'), 'feedback shader must read the previous frame');
assert(api.shaders.feedback.includes('uBuild'), 'build state must control feedback memory');
assert(api.shaders.damage.includes('uBassPeak'), 'bass peak must reach the damage shader');
assert(api.shaders.damage.includes('uDrop'), 'drop entry must reach the damage shader');
assert(api.shaders.composite.includes('uLoudness'), 'loudness must reach final composite');

console.log('glitch-webgl-contract: ok');
