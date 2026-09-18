'use strict';

const assert = require('assert');
const { create } = require('../glitch-feature-bus.js');

const bus = create();
let now = 0;
const frame = values => bus.update({
  playing: true,
  loudness: .4,
  bass: .3,
  mid: .4,
  treble: .2,
  bassSmooth: .3,
  midSmooth: .4,
  trebleSmooth: .2,
  ...values
}, now += 16);

frame({ sectionSerial: 0 });
const onset = frame({ onset: .8, bassPeak: .7, sectionSerial: 0 });
assert(onset.events.onset > .7, 'onset edge must create a short event');
assert(onset.events.bassPeak > .6, 'bass edge must create a short event');

const held = frame({ onset: .8, bassPeak: .7, sectionSerial: 0 });
assert(held.events.onset < onset.events.onset, 'held onset must decay instead of retriggering every frame');
assert(held.events.bassPeak < onset.events.bassPeak, 'held bass peak must decay instead of retriggering every frame');

const climax = frame({ onset: 0, bassPeak: 0, climaxState: 1, sectionSerial: 1 });
assert(climax.events.climaxEnter > .75, 'entering a climax must create one macro event');
assert(climax.events.sectionBoundary > .7, 'section serial change must create one boundary event');
const seedAfterBoundary = climax.seed;

const climaxHeld = frame({ onset: 0, bassPeak: 0, climaxState: 1, sectionSerial: 1 });
assert(climaxHeld.events.climaxEnter < climax.events.climaxEnter, 'climax state must not continuously retrigger climaxEnter');
assert.strictEqual(climaxHeld.seed, seedAfterBoundary, 'sample-and-hold seed must stay fixed without a new event');

frame({ climaxState: 0, dropState: 0, sectionSerial: 1 });
const drop = frame({ dropState: 1, sectionSerial: 2 });
assert(drop.events.dropEnter > .8, 'entering a drop must create one macro event');
assert.notStrictEqual(drop.seed, seedAfterBoundary, 'a new structural event must advance the held seed');

console.log('glitch-feature-bus-contract: ok');
