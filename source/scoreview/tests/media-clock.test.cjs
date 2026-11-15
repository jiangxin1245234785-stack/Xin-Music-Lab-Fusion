'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const MediaClock = require(process.env.SCOREVIEW_CLOCK || path.join(__dirname, '..', 'media-clock.js'));
const FRAME = 1000 / 60;

// An <audio> element whose position follows a wall clock we control. `report` turns the
// true position into what `currentTime` shows, which is how the different browsers differ.
function player({report = t => t, startDelay = 0, rate = 1, drift = 1} = {}) {
  const listeners = {};
  const state = {wall: 0, playing: false, startedWall: 0, startedMedia: 0};
  const truth = () => !state.playing ? state.startedMedia
    : state.startedMedia + Math.max(0, state.wall - state.startedWall - startDelay) / 1000 * rate * drift;
  const audio = {
    paused: true, seeking: false, ended: false, readyState: 4, playbackRate: rate,
    get currentTime() { return report(truth(), state); },
    addEventListener(name, handler) { (listeners[name] = listeners[name] || []).push(handler); },
    removeEventListener() {}
  };
  const emit = name => (listeners[name] || []).forEach(handler => handler());
  return {
    audio, truth, state,
    play() { state.playing = true; state.startedWall = state.wall; audio.paused = false; emit('play'); },
    pause() { state.startedMedia = truth(); state.playing = false; audio.paused = true; emit('pause'); },
    seek(to) { state.startedMedia = to; state.startedWall = state.wall; emit('seeking'); emit('seeked'); },
    advance(ms) { state.wall += ms; },
    clock(settings) { return MediaClock.create(audio, {now: () => state.wall, ...settings}); }
  };
}

// Run `frames` animation frames; return clock-minus-truth in milliseconds for each.
function run(p, clock, frames) {
  const errors = [];
  for (let i = 0; i < frames; i++) {
    p.advance(FRAME);
    errors.push((clock.now() - p.truth()) * 1000);
  }
  return errors;
}

const stepped = interval => truth => Math.floor(truth / interval + 1e-9) * interval;

test('paused: the clock is the element position, minus the file offset', () => {
  const p = player();
  p.state.startedMedia = 42.5;
  assert.equal(p.clock().now(), 42.5);
  assert.equal(p.clock({offset: 0.025}).now(), 42.475);
});

test('the file offset is taken off while playing too, in both kinds of browser', () => {
  for (const report of [t => t, stepped(0.25)]) {
    const p = player({report});
    const clock = p.clock({offset: 0.04});
    p.play();
    const errors = run(p, clock, 400).slice(60).map(error => error + 40);
    assert.ok(Math.max(...errors.map(Math.abs)) < 20, `扣掉 40 ms 之后还差 ${Math.max(...errors.map(Math.abs)).toFixed(1)} ms`);
  }
});

test('a browser that refreshes the position every frame: the clock sits on it', () => {
  const p = player();
  const clock = p.clock();
  p.play();
  const errors = run(p, clock, 600).slice(5);
  assert.ok(Math.max(...errors.map(Math.abs)) < 1, `最大误差 ${Math.max(...errors.map(Math.abs)).toFixed(2)} ms`);
});

test('a browser that refreshes four times a second: the score still moves every frame', () => {
  const p = player({report: stepped(0.25)});
  const clock = p.clock();
  p.play();
  const values = [];
  const errors = [];
  for (let i = 0; i < 900; i++) {
    p.advance(FRAME);
    values.push(clock.now());
    errors.push((values[i] - p.truth()) * 1000);
  }
  const settled = errors.slice(60);
  const worst = Math.max(...settled.map(Math.abs));
  const mean = settled.reduce((sum, value) => sum + value, 0) / settled.length;
  assert.ok(worst < 20, `最大误差 ${worst.toFixed(1)} ms，应当小于 20`);
  assert.ok(Math.abs(mean) < 12, `平均偏差 ${mean.toFixed(1)} ms，不应当被陈旧读数拖晚`);
  const steps = values.slice(61).map((value, i) => (value - values[60 + i]) * 1000);
  assert.ok(Math.min(...steps) > 10 && Math.max(...steps) < 24, `每帧走 ${Math.min(...steps).toFixed(1)}–${Math.max(...steps).toFixed(1)} ms，应当接近 16.7`);
});

test('reading the element directly in that browser would be up to a quarter second late', () => {
  // The reason this file exists, kept as a test so the number is on record.
  const p = player({report: stepped(0.25)});
  p.play();
  let worst = 0;
  for (let i = 0; i < 300; i++) { p.advance(FRAME); worst = Math.max(worst, (p.truth() - p.audio.currentTime) * 1000); }
  assert.ok(worst > 200);
});

test('after play the element can sit still before sound comes out: the clock never runs ahead', () => {
  const p = player({startDelay: 140});
  const clock = p.clock();
  p.play();
  const errors = run(p, clock, 240);
  assert.ok(Math.max(...errors) < 2, `时钟比声音早了 ${Math.max(...errors).toFixed(1)} ms`);
  assert.ok(Math.max(...errors.slice(30).map(Math.abs)) < 2);
});

test('a seek lands at once instead of gliding there', () => {
  const p = player();
  const clock = p.clock();
  p.play();
  run(p, clock, 120);
  p.seek(95);
  const errors = run(p, clock, 30);
  assert.ok(Math.abs(errors[0]) < 20 && Math.max(...errors.slice(2).map(Math.abs)) < 2, `拖动后误差 ${errors.slice(0, 4).map(v => v.toFixed(1))}`);
});

test('a jump with no seek event (a stall the element did not announce) is still followed', () => {
  const p = player();
  const clock = p.clock();
  p.play();
  run(p, clock, 120);
  p.state.startedMedia += 3;                    // the position leaps without any event
  const errors = run(p, clock, 10);
  assert.ok(Math.max(...errors.slice(1).map(Math.abs)) < 2);
  assert.equal(clock.health().jumps, 1);
});

test('pause freezes the clock on the element position, and play resumes from it', () => {
  const p = player();
  const clock = p.clock();
  p.play();
  run(p, clock, 100);
  p.pause();
  const at = p.truth();
  p.advance(5000);
  assert.equal(clock.now(), at);
  p.play();
  const errors = run(p, clock, 60);
  assert.ok(Math.max(...errors.slice(3).map(Math.abs)) < 2);
});

test('jittery readings are smoothed, so notes do not shiver', () => {
  let seed = 7;
  const noise = () => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647 - 0.5) * 0.010; };
  const p = player({report: truth => truth + noise()});
  const clock = p.clock();
  p.play();
  const values = [];
  for (let i = 0; i < 600; i++) { p.advance(FRAME); values.push(clock.now()); }
  const steps = values.slice(31).map((value, i) => (value - values[30 + i]) * 1000);
  assert.ok(Math.min(...steps) > 14.5 && Math.max(...steps) < 19, `每帧走 ${Math.min(...steps).toFixed(1)}–${Math.max(...steps).toFixed(1)} ms`);
  const errors = values.slice(30).map((value, i) => (value - (p.state.startedMedia + (i + 31) * FRAME / 1000)) * 1000);
  assert.ok(Math.max(...errors.map(Math.abs)) < 6);
});

test('the sound card running half a percent off the wall clock does not accumulate', () => {
  const p = player({drift: 1.005});
  const clock = p.clock();
  p.play();
  const errors = run(p, clock, 3600).slice(60);            // one minute
  assert.ok(Math.max(...errors.map(Math.abs)) < 2, `一分钟后最大误差 ${Math.max(...errors.map(Math.abs)).toFixed(2)} ms`);
});

test('a playback rate other than one is followed', () => {
  const p = player({rate: 1.25, report: stepped(0.25)});
  const clock = p.clock();
  p.play();
  const errors = run(p, clock, 600).slice(60);
  assert.ok(Math.max(...errors.map(Math.abs)) < 25);
});

test('buffering holds the clock still', () => {
  const p = player();
  const clock = p.clock();
  p.play();
  run(p, clock, 60);
  p.audio.readyState = 2;                                   // HAVE_CURRENT_DATA: stalled
  p.pause(); p.audio.paused = false;                        // position frozen, element still "playing"
  const frozen = p.truth();
  p.advance(800);
  assert.equal(clock.now(), frozen);
});
