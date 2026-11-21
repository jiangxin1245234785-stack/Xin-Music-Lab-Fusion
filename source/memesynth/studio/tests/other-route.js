'use strict';
const assert = require('node:assert/strict');
const Engine = require('../engine.js');

const strings = {sample: 'bowed', rootHz: 220};
const vocals = {sample: 'vocal', rootHz: 220};
const kit = {voices: {strings, vocals}};
assert.equal(Engine.resolveVoice(kit, 'other'), strings);
assert.equal(Engine.resolveVoice(kit, 'other/overlap 2'), strings);
assert.equal(Engine.resolveVoice({voices: {vocals}}, 'other'), null);
assert.equal(Engine.resolveVoice(kit, 'winds'), vocals);

const midi = {duration: 1, tracks: [{
  name: 'other',
  isDrum: false,
  notes: [{start: 0.1, end: 0.25, pitch: 57, velocity: 100}],
}]};
const score = Engine.buildScore(midi);
assert.deepEqual(score.routes, {other: 1});
assert.deepEqual(score.warnings, []);
const rate = 48000;
const audio = Float32Array.from({length: rate / 2}, (_, index) => 0.5 * Math.sin(index * 220 * Math.PI * 2 / rate));
const result = Engine.renderScore(score, kit, {bowed: audio}, rate);
assert.equal(result.rendered, 1);
assert.deepEqual(result.unresolved, {});
assert.deepEqual(Object.keys(result.stems), ['other']);
assert(result.stems.other.some(value => Math.abs(value) > 0.1));
console.log('other-route: ok');
