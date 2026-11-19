'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {runInNewContext} = require('node:vm');
const {mockCanvas} = require('./helpers.cjs');
const Lamps = require('../score-radar-lamps.js');

const off = {green: 0, yellow: 0, red: 0};
const on = {green: 1, yellow: 1, red: 1};
const channels = ['green', 'yellow', 'red'];

function calibration() {
  const guitar = [-40, -37, -34, -31, -28, -25, -22, -19, -16, -13, -10];
  return {hop: 1, groups: {
    guitar: [-90, ...guitar, -90],
    bass: [-90, ...guitar.map(db => db - 3), -90],
    other: Array(13).fill(-1),
    winds: Array(13).fill(-99)
  }};
}

test('the ordinary browser script and CommonJS expose the lamp API', () => {
  const browser = {};
  runInNewContext(readFileSync(require.resolve('../score-radar-lamps.js'), 'utf8'), browser);
  for (const method of ['thresholds', 'glow', 'draw', 'drawLamp']) {
    assert.equal(typeof browser.XinScoreRadarLamps[method], 'function');
    assert.equal(typeof Lamps[method], 'function');
  }
});

test('own uses the sounding windows of each channel; both quantiles can be changed', () => {
  const levels = calibration(), cuts = Lamps.thresholds(levels, {rule: 'own'});
  assert.equal(cuts.channels.guitar.yellow, -19);
  assert.equal(cuts.channels.guitar.red, -13);
  assert.equal(cuts.channels.bass.yellow, -22);
  assert.equal(cuts.channels.bass.red, -16);
  const tuned = Lamps.thresholds(levels, {rule: 'own', yellowQuantile: .5, redQuantile: .8});
  assert.equal(tuned.channels.guitar.yellow, -25);
  assert.equal(tuned.channels.guitar.red, -16);
});

test('song references one peak across the radar channels; offset and gate adjustments work', () => {
  const levels = calibration(), cuts = Lamps.thresholds(levels, {rule: 'song'});
  assert.equal(cuts.peakDb, -10, 'the residual stem has no lamp and cannot set the peak');
  for (const id of ['guitar', 'bass']) {
    assert.equal(cuts.channels[id].yellow, -16);
    assert.equal(cuts.channels[id].red, -13);
  }
  const custom = Lamps.thresholds(levels, {rule: 'song', yellowBelowPeakDb: 9, redBelowPeakDb: 4});
  assert.equal(custom.channels.bass.yellow, -19);
  assert.equal(custom.channels.bass.red, -14);
  const quiet = {hop: 1, groups: {bass: [-50, -50, -50]}};
  assert.deepEqual(Lamps.glow(quiet, Lamps.thresholds(quiet, {rule: 'song'}), 'bass', 1.5), off);
  const lowerGate = Lamps.thresholds(quiet, {rule: 'song', gateDb: -55});
  assert.ok(Lamps.glow(quiet, lowerGate, 'bass', 1.5).green > .9);
});

test('multiple stems feeding one meter form one channel, sampled by their maximum', () => {
  const levels = {hop: 1, groups: {
    violin: [-30, -18, -34], strings: [-24, -32, -35], keys: [-30, -30, -30]
  }};
  const before = JSON.stringify(levels);
  const cuts = Lamps.thresholds(levels, {rule: 'own', yellowQuantile: .5, redQuantile: 1});
  assert.equal(cuts.channels.strings.yellow, -24);
  assert.equal(cuts.channels.strings.red, -18);
  assert.equal(cuts.channels.piano.red, -30);
  assert.equal(JSON.stringify(levels), before);
});

// A short, loud pulse well inside the recording. Each array value describes a whole hop.
const pulse = {hop: .01, groups: {guitar: Array.from({length: 140}, (_, i) =>
  i >= 30 && i < 70 ? -10 : -95)}};

test('pause, repeated calls and backward seeks reproduce the same filament state', () => {
  const cuts = Lamps.thresholds(pulse, {rule: 'song'});
  const frame = t => Lamps.glow(pulse, cuts, 'guitar', t);
  const times = [.31, .33, .64, .72, .77, 1.12];
  const forward = times.map(frame);
  assert.deepEqual(times.map(frame), forward);
  assert.deepEqual([...times].reverse().map(frame).reverse(), forward);
  assert.notDeepEqual(forward[1], forward[5], 'the check traverses actual changes of light');
});

test('the onset is fast, afterglow outlasts it, and silence, mute and missing levels stay dark', () => {
  const cuts = Lamps.thresholds(pulse, {rule: 'song'});
  const frame = (t, options) => Lamps.glow(pulse, cuts, 'guitar', t, options);
  assert.deepEqual(frame(0), off);
  assert.deepEqual(frame(.25), off);
  assert.ok(frame(.38).red > .9, 'a sustained high level has heated the red lamp after 80 ms');
  assert.ok(frame(.75).red > 0 && frame(.75).red < frame(.65).red, 'cool filament is still visible');
  assert.deepEqual(frame(1.25), off);
  assert.deepEqual(frame(.65, {enabled: false}), off);
  assert.deepEqual(frame(.75, {enabled: false}), off);
  assert.deepEqual(Lamps.glow(pulse, cuts, 'piano', .65), off);
  assert.deepEqual(Lamps.glow(null, Lamps.thresholds(null), 'vocals', 3), off);
});

test('all three rungs occur, remain ordered through transitions, and change continuously between samples', () => {
  const levels = {hop: 1, groups: {guitar: [-60, -34, -34, -15, -15, -10, -10, -60]}};
  const cuts = Lamps.thresholds(levels, {rule: 'song'});
  const frame = t => Lamps.glow(levels, cuts, 'guitar', t);
  const green = frame(2.1), amber = frame(4.1), red = frame(6.1);
  assert.ok(green.green > .9 && green.yellow === 0 && green.red === 0);
  assert.ok(amber.green > .9 && amber.yellow > .9 && amber.red === 0);
  assert.ok(red.green > .9 && red.yellow > .9 && red.red > .9);
  let prev = frame(0), intermediate = 0;
  for (let ms = 1; ms <= 8000; ms++) {
    const next = frame(ms / 1000);
    assert.ok(1 >= next.green && next.green >= next.yellow && next.yellow >= next.red && next.red >= 0);
    for (const k of channels) assert.ok(Math.abs(next[k] - prev[k]) < .06, k + ' jumped within 1 ms');
    if (next.red > .1 && next.red < .9) intermediate++;
    prev = next;
  }
  assert.ok(intermediate > 5);
});

test('disabled drawing ignores live brightness and keeps the three different unlit lenses', () => {
  const capture = paint => {
    const canvas = mockCanvas();
    paint(canvas.canvas.getContext('2d'));
    return JSON.stringify(canvas.calls);
  };
  const stack = (g, opts) => capture(ctx => Lamps.draw(ctx, 224, 190, 10, g, opts));
  assert.equal(stack(on, {enabled: false}), stack(off));
  assert.notEqual(stack(off), stack(on));
  const single = (color, brightness, options) => capture(ctx => Lamps.drawLamp(ctx, 50, 50, 10, color, brightness, options));
  assert.equal(new Set(channels.map(color => single(color, 0))).size, 3);
  for (const color of channels) {
    assert.equal(single(color, 1, {enabled: false}), single(color, 0));
    assert.equal(new Set([0, .5, 1].map(v => single(color, v))).size, 3);
  }
});

test('one short level peak produces just one flash, with no repeated sparks in the tail', () => {
  const levels = {hop: .025, groups: {drums: Array.from({length: 120}, (_, i) => i === 40 ? -10 : -90)}};
  const cuts = Lamps.thresholds(levels, {rule: 'song'});
  const brightness = Array.from({length: 500}, (_, ms) =>
    Lamps.glow(levels, cuts, 'drums', .95 + ms / 1000).red);
  const peak = Math.max(...brightness);
  assert.ok(peak > .02, 'a real pulse must reach the filament');
  for (let i = brightness.indexOf(peak) + 1; i < brightness.length; i++) {
    assert.ok(brightness[i] <= brightness[i - 1] + 1e-7, 'the filament relit after the same pulse');
  }
  assert.equal(brightness.at(-1), 0);
});
