'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const Curve = require('../../shared-analysis/mood-curve.js');
const Weather = require('../score-terrain-weather.js');

const duration = 128, step = .5, points = duration / step + 1;
const precipitation = ['rain', 'snow', 'sandstorm'];
const values = source => Array.from({length: points}, (_, i) => typeof source === 'function' ? source(i * step) : source);
function curve(slow, fast = slow) {
  return {kind: 'mood-curve', schemaVersion: 1, formulaVersion: 'mood-direct-1', scaleVersion: 'mood-scale-1',
    engineVersion: 1, duration, step, loudnessMode: 'half', belowFlatnessGate: [],
    slow: values(slow), fast: values(fast), shape: {fast: values(.5), slow: values(.5)},
    components: {lufs: values(-25), band28Dbfs: values(-35), logFlatness: values(-4)}};
}
const oldInputs = {
  energy: {hop: .5, db: values(t => t < 25 || t >= 90 ? -42 : -9)},
  levels: {hop: .5, groups: {drum: values(-5), piano: values(-32)}},
  lanes: [{id: 'drum', group: 'drum', notes: [[26, .2, 49, 126], [29, .4, 36, 124], [51, .3, 38, 121]]},
    {id: 'piano', group: 'piano', notes: [[24, 5, 62, 106], [55, 8, 57, 118]]}],
  chords: [[0, 30, 'C'], [30, 56, 'F#dim'], [56, 95, 'C#m'], [95, 128, 'C']],
  chordTones: [[28, 51, 1, [0, 1, 4, 6]]], sections: [[0, 25, 'intro'], [25, 90, 'chorus'], [90, 128, 'outro']],
};
const song = (moodCurve, extra = {}) => ({track: {id: 'mood-weather', duration}, moodCurve, ...extra});
const sample = (model, time, terrainWeather = 'rain', terrainWeatherDriver = 'mood', terrainLightning = true) =>
  Weather.sample(model, time, {terrainWeather, terrainWeatherDriver, terrainLightning});
const numericState = ({intensity, level, humidity, stormDrive, surface, tension, wind, windTravel, farRain,
  state, events, distantBands, flashes, lightning, rainAt, stormDriveAt, wetAt, glassDriveAt}) =>
  ({intensity, level, humidity, stormDrive, surface, tension, wind, windTravel, farRain, state, events,
    distantBands, flashes, lightning, history: [12, 48, 79].map(t => [rainAt(t), stormDriveAt(t), wetAt(t), glassDriveAt(t)])});

test('mood weather ignores the original weather inputs in all precipitation modes', () => {
  const record = curve(t => t < 45 ? .53 : t < 88 ? .96 : .32, t => .6 + .38 * Math.sin(t));
  assert.ok(Curve.valid(record));
  const quiet = song(record);
  const noisy = song(record, oldInputs);
  assert.notEqual(sample(quiet, 42, 'rain', 'original').intensity, sample(noisy, 42, 'rain', 'original').intensity,
    'fixture must distinguish the inputs in the original driver');
  for (const mode of precipitation) for (const t of [2, 25, 42, 45.25, 63, 84, 88.25, 127.75]) {
    const left = sample(quiet, t, mode), right = sample(noisy, t, mode);
    assert.equal(left.source, 'mood-curve');
    assert.equal(right.source, 'mood-curve');
    assert.deepEqual(numericState(left), numericState(right));
  }
});

test('slow concentration maps monotonically to precipitation and wetness without jumps', () => {
  for (const mode of precipitation) {
    let prior;
    for (let i = 0; i <= 200; i++) {
      const level = i / 200;
      const current = sample(song(curve(level)), 90, mode);
      assert.equal(current.source, 'mood-curve');
      if (prior) for (const field of ['intensity', 'stormDrive', 'humidity', 'surface']) {
        assert.ok(current[field] + 1e-7 >= prior[field], `${mode} ${field} must not fall at ${level}`);
        assert.ok(current[field] - prior[field] < .06, `${mode} ${field} must not jump at ${level}`);
      }
      prior = current;
    }
  }
  const nocturne = sample(song(curve(.35)), 96);
  const wall = sample(song(curve(.98)), 96);
  assert.notEqual(nocturne.state, wall.state);
  assert.ok(wall.intensity - nocturne.intensity > .45);
  const middle = sample(song(curve(.47)), 96), before = sample(song(curve(.69)), 96), after = sample(song(curve(.86)), 96);
  assert.ok(before.intensity - middle.intensity > .1 && after.intensity - before.intensity > .1);
});

test('clear weather uses the same slow scale for clouds and does not turn on precipitation', () => {
  let prior = 0;
  for (let i = 0; i <= 100; i++) {
    const slow = i / 100;
    const a = sample(song(curve(slow, 0)), 90, 'clear');
    const b = sample(song(curve(slow, 1), oldInputs), 90, 'clear');
    assert.equal(a.source, 'mood-curve');
    assert.equal(a.state, 'clear');
    assert.equal(a.intensity, 0);
    assert.deepEqual(a, b);
    assert.ok(a.cloudOpacity >= prior && (!i || a.cloudOpacity - prior < .01));
    prior = a.cloudOpacity;
  }
});

test('the fast curve modulates detail without changing slow-curve tiers or causing flashes', () => {
  const thresholds = [0, .26, .52, .70, .90, 1];
  for (const mode of precipitation) {
    const steady = slow => sample(song(curve(slow)), 90, mode).intensity;
    for (let i = 1; i < thresholds.length; i++) {
      const a = thresholds[i-1], b = thresholds[i];
      const lower = steady(a), upper = steady(b);
      for (const slow of [a, a + .001, (a + b) / 2, b - .001]) {
        const low = sample(song(curve(slow, 0)), 90, mode);
        const high = sample(song(curve(slow, 1)), 90, mode);
        assert.equal(high.source, 'mood-curve');
        assert.equal(low.state, high.state, `${mode} fast extremes at slow ${slow}`);
        assert.equal(low.stormDrive, high.stormDrive);
        assert.equal(low.humidity, high.humidity);
        assert.equal(low.surface, high.surface);
        assert.ok(low.intensity >= lower - 1e-10 && high.intensity <= upper + 1e-10,
          `${mode} fast extremes must stay in the intensity range of slow ${a} to ${b}`);
        assert.ok(high.intensity - low.intensity < .15);
        if (slow < .92) assert.equal(high.flashes.length, 0);
      }
    }
  }
  const low = sample(song(curve(.65, 0)), 90);
  const high = sample(song(curve(.65, 1)), 90);
  assert.notDeepEqual([low.intensity, low.wind, low.farRain, low.glassDriveAt(90)],
    [high.intensity, high.wind, high.farRain, high.glassDriveAt(90)], 'fast curve must change some short-term detail');
});

test('high-slow lightning is deterministic, rain only and separated by the original cooldown', () => {
  const record = curve(t => t >= 20 && t <= 112 ? .985 : .6, .99);
  const model = song(record, oldInputs);
  const {flashes} = sample(model, 37);
  assert.ok(flashes.length > 0);
  for (const [index, flash] of flashes.entries()) {
    assert.ok(Curve.at(record, flash.time).slow >= .92);
    if (index) assert.ok(flash.time - flashes[index - 1].time >= 22);
    assert.deepEqual(sample(model, flash.time + .026).flashes, flashes);
    assert.ok(sample(model, flash.time + .026).lightning.intensity > 0);
    assert.equal(sample(model, flash.time + .026, 'rain', 'mood', false).lightning.intensity, 0);
    assert.equal(sample(model, flash.time + .026, 'snow').lightning.intensity, 0);
  }
  const target = flashes[0].time + .026;
  const fromStart = numericState(sample(model, target));
  for (const t of [122, 10, 70, 65]) sample(model, t);
  assert.deepEqual(numericState(sample(model, target)), fromStart);
});

test('missing or unfamiliar curve records fall back to the same original weather while manual mode ignores a valid curve', () => {
  const record = curve(.99);
  const noCurve = song(undefined, oldInputs);
  const known = song(record, oldInputs);
  const unrecognized = [{...record, schemaVersion: 2}, {...record, engineVersion: 100},
    {...record, scaleVersion: 'future-scale'}, {...record, formulaVersion: 'future-formula'}, {...record, slow: []},
    {...record, slow: values(t => t === 50 ? null : .99)}];
  for (const t of [3, 28, 42, 95]) {
    const original = sample(noCurve, t, 'rain', 'original');
    assert.equal(original.source, 'energy');
    assert.deepEqual(numericState(sample(noCurve, t)), numericState(original));
    assert.deepEqual(numericState(sample(known, t, 'rain', 'original')), numericState(original));
    for (const invalid of unrecognized) {
      const fallback = sample(song(invalid, oldInputs), t);
      assert.equal(fallback.source, original.source);
      assert.deepEqual(numericState(fallback), numericState(original));
    }
  }
  const missingFast = sample(song(curve(.75, t => t === 45 ? null : .75)), 45.25);
  const steady = sample(song(curve(.75)), 45.25);
  assert.equal(missingFast.source, 'mood-curve');
  assert.equal(missingFast.intensity, steady.intensity);
});
