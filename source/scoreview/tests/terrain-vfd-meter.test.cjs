'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const {mockCanvas} = require('./helpers.cjs');
const Led = require('../score-terrain-led.js');
const terrain = require('../score-terrain.js');

const duration = 40;
const frame = {w: 1440, h: 900, terrainRoadside: 'off'};
const levels = db => ({hop: 1, groups: {guitar: Array.from({length: duration}, () => db)}});
const drums = hits => ({kind: 'drums', group: 'drums', rows: ['kick', 'crash'], hits});
const barsAreClose = (actual, expected) => {
  assert.equal(actual.length, 10);
  for (const [i, value] of actual.entries()) assert.ok(Math.abs(value - expected[i]) < 1e-10, `bar ${i}: ${value} vs ${expected[i]}`);
};

test('radio VFD standby follows levels and recorded hits on the song clock', t => {
  let vfd;
  const prior = globalThis.XinScoreTerrainLed;
  globalThis.XinScoreTerrainLed = {...Led, drawHeader() {}, drawLyric(ctx, rect, data, {standby}) { vfd = {data, standby}; }};
  t.after(() => { globalThis.XinScoreTerrainLed = prior; });
  const ctx = Object.assign(mockCanvas(frame.w, frame.h).canvas.getContext('2d'), {arcTo() {}});
  const draw = (song, time, lyric) => {
    terrain.draw(ctx, {...frame, song, time, lyric});
    return vfd;
  };
  const flat = {track: {duration}, lanes: [], levels: levels(-31), sections: [[5, 35, 'Solo', 'test', 'solo']]};
  const half = Array(10).fill(.5);
  const before = draw(flat, 12).standby;
  assert.deepEqual({tag: before.tag, time: before.time, duration: before.duration}, {tag: 'SOLO', time: 12, duration});
  for (const time of [30.1, 8.3, 20.9, 12]) barsAreClose(draw(flat, time).standby.bars, half);

  const noEvents = {...flat, lanes: [drums([])], bars: {beatsPerBar: 4, bpm: 60, beats: [12, 13]},
    levels: {hop: 1, groups: {drums: Array(duration).fill(-12)}}};
  for (const time of [12, 12.05, 13]) barsAreClose(draw(noEvents, time).standby.bars, Array(10).fill(0));

  const withEvents = {...flat, lanes: [drums([[12, 1, 100], [12.25, 1, 100], [12.33, 0, 100]])]};
  const boost = [1, 1, 1, .35, .35, .35, .35, .65, .65, .65];
  barsAreClose(draw(withEvents, 11.995).standby.bars, half);
  barsAreClose(draw(withEvents, 12).standby.bars, boost.map(weight => .5 + .28 * weight));
  barsAreClose(draw(withEvents, 12.08).standby.bars, boost.map(weight => .5 + .14 * weight));
  // The existing event list thins close cymbal hits before the radio reads it.
  barsAreClose(draw(withEvents, 12.25).standby.bars, half);
  barsAreClose(draw(withEvents, 12.33).standby.bars, boost.map(weight => .5 + .28 * weight));
  barsAreClose(draw(withEvents, 12.6).standby.bars, half);
  assert.deepEqual(draw(withEvents, 12).standby, draw({...withEvents}, 12).standby);
  barsAreClose(draw({...noEvents, lanes: withEvents.lanes}, 12).standby.bars, Array(10).fill(0));
  assert.deepEqual(draw(withEvents, 12, 'A lyric').data.line, 'A lyric');
  assert.equal(vfd.standby, null);
});
