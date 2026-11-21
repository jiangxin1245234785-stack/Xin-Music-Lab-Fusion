'use strict';
const assert = require('node:assert/strict');
const {test} = require('node:test');
require('../stem-controls.js');
const flush = () => new Promise(resolve => setImmediate(resolve));

class Media extends EventTarget {
  constructor() {
    super();
    this.src = '';
    this.loads = [];
    this.playCalls = 0;
    this.volume = 1;
    this.load();
  }
  fire(name) { this.dispatchEvent(new Event(name)); }
  load() {
    this.loads.push(this.src);
    this.currentTime = 0;
    this.duration = NaN;
    this.readyState = 0;
    this.seeking = false;
    this.paused = true;
    this.playbackRate = 1;
  }
  removeAttribute(name) { if (name === 'src') this.src = ''; }
  metadata() {
    this.duration = 180;
    this.readyState = 1;
    this.fire('loadedmetadata');
  }
  ready() {
    this.seeking = false;
    this.readyState = 4;
    this.fire('canplay');
    this.fire('seeked');
  }
  play() {
    this.playCalls++;
    this.paused = false;
    this.fire('play');
    return this.delayedPlay || this.begun();
  }
  begun() {
    this.fire('playing');
    return Promise.resolve();
  }
  pause() { this.paused = true; this.fire('pause'); }
  seek(time) {
    this.currentTime = time;
    this.seeking = true;
    this.fire('seeking');
    this.seeking = false;
    this.fire('seeked');
  }
}
class Select extends EventTarget {
  options = [];
  replaceChildren(option) { this.options = [option]; this.value = option.value; }
  add(option) { this.options.push(option); }
}
async function setup(t, otherRoute) {
  const audio = new Media(), select = new Select(), status = new EventTarget(), probes = [];
  const state = {track: {id: 'song'}, changes: 0, audible: audio};
  const original = 'file:///original.flac';
  const stems = ['bass', 'piano', 'drums', 'guitar'].map(name => ({name, audioUrl: 'file:///' + name + '.wav'}));
  if (otherRoute) stems.push({name:'other',audioUrl:'file:///stems/other.flac',playbackUrl:'file:///decoded/other.wav',playbackGain:0.8});
  const midiRequests=[], midiStatus=new EventTarget();
  global.Option = class { constructor(text, value) { this.textContent = text; this.value = value; } };
  global.document = {
    getElementById(id) {
      return {fusionStemSelect: select, fusionStemReveal: new EventTarget(), fusionStemStatus: status,
        fusionMidiStatus: otherRoute ? midiStatus : undefined}[id];
    },
    createElement(tag) {
      assert.equal(tag, 'audio');
      const probe = new Media();
      probes.push(probe);
      return probe;
    }
  };
  const bridge = {readStems: async () => ({ok: true, stems, otherRoute}),
    readMidi: async (id,stem) => {midiRequests.push({id,stem}); return {ok:true,noteCount:10};}};
  const output = {
    original() { state.audible = audio; },
    prepare(media, gain) {
      assert.equal(media.muted, true);
      media.inputGain = gain;
      const handle = {
        released: false,
        activate() { assert.equal(handle.released, false); state.audible = media; },
        release() { handle.released = true; if (state.audible === media) state.audible = audio; }
      };
      media.handle = handle;
      return handle;
    }
  };
  audio.src = original;
  audio.load();
  audio.metadata();
  audio.ready();
  audio.currentTime = 27;
  const controls = global.XldStemControls.create({
    bridge, audio, output, getTrack: () => state.track, getOriginalUrl: () => original,
    onSwitch: () => state.changes++
  });
  t.after(() => controls.reset());
  await controls.refresh();
  function pick(name) {
    select.value = name;
    select.dispatchEvent(new Event('change'));
    return probes.at(-1);
  }
  async function loaded(name) {
    const media = pick(name);
    await flush();
    media.metadata();
    media.ready();
    await flush();
    return media;
  }
  return {audio, select, probes, status, original, state, controls, pick, loaded, bridge, output, stems,midiRequests};
}

test('the direct route auditions the genuine decoded other stem and reads its MIDI', async t => {
  const {loaded,state,controls,midiRequests}=await setup(t, 'direct');
  const other=await loaded('other');
  assert.equal(state.audible,other);
  assert.equal(other.src,'file:///decoded/other.wav');
  assert.equal(other.inputGain,0.8);
  assert.equal(controls.activeName(),'other');
  assert.deepEqual(midiRequests,[{id:'song',stem:'other'}]);
});

test('the split route can audition raw other without opening the alternate MIDI', async t => {
  const {loaded,state,midiRequests}=await setup(t, 'split');
  const other=await loaded('other');
  assert.equal(state.audible,other);
  assert.deepEqual(midiRequests,[]);
});

test('cold prepare, late readiness and muted clock alignment keep the previous output advancing', async t => {
  const {audio, select, original, pick, state, controls} = await setup(t);
  await audio.play();
  const bass = pick('bass');
  await flush();
  assert.equal(select.disabled, false);
  assert.equal(state.audible, audio);
  audio.currentTime = 35;
  bass.metadata();
  assert.equal(bass.currentTime, 35);
  audio.currentTime = 35.15;
  let resolvePlay;
  bass.delayedPlay = new Promise(resolve => { resolvePlay = resolve; });
  bass.ready();
  assert.equal(state.audible, audio);
  bass.fire('playing');
  assert(bass.playbackRate > 1 && bass.playbackRate <= 1.1);
  assert.equal(state.audible, audio);
  bass.currentTime = 35.14;
  bass.fire('timeupdate');
  assert.equal(state.audible, bass);
  resolvePlay();
  await flush();
  assert.equal(controls.activeName(), 'bass');
  assert.equal(bass.playbackRate, 1);
  assert.equal(audio.src, original);
  assert.equal(audio.currentTime, 35.15);
  assert.equal(audio.paused, false);
  assert.equal(audio.playCalls, 1);
  assert.equal(bass.playCalls, 1);
  assert.deepEqual(audio.loads.filter(Boolean), [original]);
  assert.deepEqual(bass.loads.filter(Boolean), ['file:///bass.wav']);
});

test('rapid choices, cancellation back to Original and a stale play promise never change the route', async t => {
  const {audio, pick, loaded, state, controls} = await setup(t);
  await audio.play();
  const bass = await loaded('bass');
  const drums = pick('drums');
  await flush();
  let resolvePlay;
  drums.delayedPlay = new Promise(resolve => { resolvePlay = resolve; });
  drums.metadata(); drums.ready();
  assert.equal(state.audible, bass);
  const piano = pick('piano');
  assert(drums.handle.released);
  drums.fire('playing'); resolvePlay();
  pick('original');
  await flush();
  piano.metadata(); piano.ready();
  assert.equal(controls.activeName(), 'original');
  assert.equal(state.audible, audio);
  assert(bass.handle.released && piano.handle.released);
  assert.equal(piano.playCalls, 0);
});

test('pause, seek to zero, playback rate and resume follow the primary element without changing its source', async t => {
  const {audio, loaded, controls, state, original} = await setup(t);
  const bass = await loaded('bass');
  assert.equal(state.audible, bass);
  assert(bass.paused);
  await audio.play();
  assert.equal(bass.paused, false);
  audio.pause();
  assert(bass.paused);
  audio.seek(0);
  assert.equal(bass.currentTime, 0);
  assert.equal(controls.activeName(), 'bass');
  audio.playbackRate = 1.25;
  audio.fire('ratechange');
  await audio.play();
  assert.equal(bass.playbackRate, 1.25);
  audio.seek(94);
  assert.equal(bass.currentTime, 94);
  assert.equal(controls.activeName(), 'bass');
  assert.equal(audio.src, original);
  assert.equal(audio.currentTime, 94);
});

test('failed new source keeps the old stem playing, active decoder error immediately returns to original', async t => {
  const {audio, select, status, state, loaded, pick, controls} = await setup(t);
  await audio.play();
  const bass = await loaded('bass');
  const bad = pick('drums');
  await flush();
  bad.fire('error');
  assert.equal(select.value, 'bass');
  assert.equal(controls.activeName(), 'bass');
  assert.equal(state.audible, bass);
  assert.equal(bass.paused, false);
  assert(bad.handle.released);
  assert.match(status.textContent, /保留/);
  await controls.refresh();
  assert.match(status.textContent, /保留/);
  bass.fire('error');
  assert.equal(state.audible, audio);
  assert.match(status.textContent, /已切回原曲/);
  assert.equal(select.value, 'original');
  assert.equal(audio.currentTime, 27);
  assert.equal(audio.paused, false);
  const piano = await loaded('piano');
  assert.equal(state.audible, piano);
  assert.equal(status.textContent, '分轨已就绪');
});

test('a new choice survives an older active error and a scrub before it becomes audible', async t => {
  const {audio, state, loaded, pick, select, controls, status} = await setup(t);
  await audio.play();
  const bass = await loaded('bass');
  const drums = pick('drums');
  await flush();
  bass.fire('error');
  assert.match(status.textContent, /已切回原曲/);
  assert.equal(select.value, 'drums');
  assert.equal(controls.activeName(), 'original');
  audio.pause();
  audio.seek(74);
  drums.metadata(); drums.ready();
  assert.equal(state.audible, drums);
  assert.equal(drums.currentTime, 74);
  assert.equal(drums.paused, true);
  assert.equal(controls.activeName(), 'drums');
  assert.equal(status.textContent, '分轨已就绪');
});

test('a refused route leaves the previous audio and focus selected', async t => {
  const {audio, state, loaded, pick, select, controls, status} = await setup(t);
  await audio.play();
  const bass = await loaded('bass');
  const piano = pick('piano');
  await flush();
  piano.handle.activate = () => false;
  piano.metadata(); piano.ready();
  assert.equal(controls.activeName(), 'bass');
  assert.equal(select.value, 'bass');
  assert.equal(state.audible, bass);
  assert(piano.handle.released);
  assert.match(status.textContent, /保留/);
});

test('stalled solo uses original while muted stem catches up, and returns only once aligned', async t => {
  const {audio, loaded, controls, state} = await setup(t);
  await audio.play();
  const bass = await loaded('bass');
  bass.readyState = 2;
  bass.fire('waiting');
  assert.equal(state.audible, audio);
  audio.currentTime = 29;
  bass.ready();
  bass.fire('playing');
  assert.equal(controls.activeName(), 'original');
  assert.equal(bass.playbackRate, 1);
  assert(bass.currentTime > 29.4 && bass.paused);
  audio.currentTime = bass.currentTime - 0.01;
  audio.fire('timeupdate');
  assert.equal(state.audible, bass);
  assert.equal(bass.playbackRate, 1);
});

test('a 2.14s initial seek followed by a 3.83s seek starts at normal speed at its future cue', async t => {
  let wallMs = 0;
  t.mock.method(performance, 'now', () => wallMs);
  const {audio, pick, state, controls} = await setup(t);
  await audio.play();
  const guitar = pick('guitar');
  await flush();
  audio.currentTime = 72.693;
  guitar.metadata();
  guitar.seeking = true;
  wallMs += 2140;
  audio.currentTime += 2.14;
  guitar.readyState = 4;
  guitar.seeking = false;
  guitar.fire('seeked');
  const cue = guitar.currentTime;
  assert(Math.abs(cue - audio.currentTime - 4.63) < 0.001);
  assert(guitar.paused);
  assert.equal(state.audible, audio);
  guitar.seeking = true;
  wallMs += 3830;
  audio.currentTime += 3.83;
  guitar.ready();
  assert(guitar.paused);
  assert.equal(controls.activeName(), 'original');
  audio.currentTime = cue - 0.010;
  audio.fire('timeupdate');
  assert.equal(controls.activeName(), 'guitar');
  assert.equal(guitar.playbackRate, 1);
  assert.equal(guitar.playCalls, 1);
  assert.equal(audio.playCalls, 1);
  assert(Math.abs(audio.currentTime - guitar.currentTime) < 0.075);
});

test('pause and scrub replace a pending future cue with the user position', async t => {
  const {audio, pick, state, controls} = await setup(t);
  await audio.play();
  const piano = pick('piano');
  await flush();
  piano.metadata();
  audio.currentTime += 1;
  piano.ready();
  assert(piano.paused && piano.currentTime > audio.currentTime);
  assert.equal(state.audible, audio);
  audio.pause();
  audio.seek(16);
  piano.ready();
  assert.equal(controls.activeName(), 'piano');
  assert.equal(piano.currentTime, 16);
  assert(piano.paused);
});

test('a 9.28 s cold seek and a 1.46 s warm seek do not leave ready audio parked for 13.54 s', async t => {
  let wallMs = 0;
  t.mock.method(performance, 'now', () => wallMs);
  const {audio, pick, state, controls} = await setup(t);
  await audio.play();
  const guitar = pick('guitar');
  await flush();
  guitar.metadata();
  const finishSeek = seconds => {
    guitar.seeking = true;
    audio.currentTime += seconds;
    wallMs += seconds * 1000;
    guitar.readyState = 4;
    guitar.seeking = false;
    guitar.fire('seeked');
  };
  finishSeek(9.28);
  assert.equal(guitar.currentTime - audio.currentTime, 15);
  finishSeek(1.46);
  const shortened = guitar.currentTime;
  assert(shortened - audio.currentTime < 2 && shortened - audio.currentTime > 1.46);
  assert(guitar.paused && state.audible === audio);
  finishSeek(1.46);
  assert.equal(guitar.currentTime, shortened);
  audio.currentTime = shortened - .01;
  audio.fire('timeupdate');
  assert.equal(controls.activeName(), 'guitar');
  assert.equal(guitar.playCalls, 1);
  assert.equal(guitar.playbackRate, 1);
});

test('missing piano invalidates the list without cutting a healthy bass; confirmed removal switches back', async t => {
  const {audio, loaded, pick, controls, select, bridge, state, status} = await setup(t);
  await audio.play();
  const bass = await loaded('bass');
  const piano = pick('piano');
  await flush();
  piano.fire('error');
  bridge.readStems = async () => ({ok: false, error: 'stem missing'});
  await controls.refresh();
  assert.equal(controls.activeName(), 'bass');
  assert.equal(state.audible, bass);
  assert.equal(bass.paused, false);
  assert.equal(audio.paused, false);
  assert.deepEqual(select.options.map(o => o.value), ['original', 'bass']);
  assert.match(status.textContent, /保留/);
  bridge.readStems = async () => ({ok: true, stems: []});
  await controls.refresh();
  assert.equal(controls.activeName(), 'original');
  assert.equal(state.audible, audio);
  assert.equal(select.value, 'original');
  assert.deepEqual(select.options.map(o => o.value), ['original']);
});

test('variable warm seeks do not park a fully ready final cue for the observed 2.29 seconds', async t => {
  let wallMs = 0;
  t.mock.method(performance, 'now', () => wallMs);
  const {audio, pick, controls, state} = await setup(t);
  await audio.play();
  const guitar = pick('guitar');
  await flush();
  audio.currentTime = 68.621;
  guitar.metadata();
  function finishSeek(seconds) {
    audio.currentTime += seconds;
    wallMs += seconds * 1000;
    guitar.readyState = 4;
    guitar.seeking = false;
    guitar.fire('seeked');
    return guitar.currentTime - audio.currentTime;
  }
  assert(Math.abs(finishSeek(1.799) - 3.948) < .001);
  assert(Math.abs(finishSeek(.261) - .50015) < .001);
  assert(Math.abs(finishSeek(1.074) - 1.5) < .001);
  const cue = guitar.currentTime;
  assert(Math.abs(finishSeek(.204) - 1.296) < .001);
  assert.equal(guitar.currentTime, cue);
  assert.equal(state.audible, audio);
  assert(guitar.paused && guitar.readyState === 4);
  audio.currentTime = cue - .01;
  audio.fire('timeupdate');
  assert.equal(controls.activeName(), 'guitar');
  assert.equal(guitar.playbackRate, 1);
  assert.equal(guitar.playCalls, 1);
  assert.equal(guitar.currentTime, cue);
});

test('an old routed source stays alive until the scheduled output boundary; failed preparation is released immediately', async t => {
  const {audio, loaded, pick, state} = await setup(t);
  await audio.play();
  const bass = await loaded('bass');
  let complete;
  bass.handle.release = () => new Promise(done => { complete = done; });
  const guitar = await loaded('guitar');
  assert.equal(state.audible, guitar);
  assert.equal(bass.paused, false);
  assert.equal(bass.src, 'file:///bass.wav');
  complete();
  await flush();
  assert.equal(bass.paused, true);
  assert.equal(bass.src, '');
  const piano = pick('piano');
  await flush();
  piano.fire('error');
  assert.equal(piano.src, '');
  assert(piano.handle.released);
});

test('direct registered playback uses its gain and stable URL, while legacy WAV stays at unity', async t => {
  const {audio, stems, loaded, controls, state} = await setup(t);
  stems[0].playbackUrl = 'file:///bass.flac?xin-xml-stem=token';
  stems[0].playbackGain = 2;
  stems[1].playbackGain = 2; // Its audioUrl already contains the restored samples.
  await audio.play();
  const bass = await loaded('bass');
  assert.equal(bass.src, stems[0].playbackUrl);
  assert.equal(bass.inputGain, 2);
  await controls.refresh();
  assert.equal(state.audible, bass);
  const piano = await loaded('piano');
  assert.equal(piano.src, stems[1].audioUrl);
  assert.equal(piano.inputGain, 1);
});

test('slow local FLAC worker and a progressing partial read survive the old total deadline', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const {audio, select, controls, state, stems, pick} = await setup(t);
  stems.find(stem => stem.name === 'drums').audioUrl = 'file:///drums.flac';
  const drums = pick('drums');
  await flush();
  drums.networkState = 2;
  drums.fire('stalled');
  t.mock.timers.tick(31000);
  t.mock.timers.tick(31000);
  assert.equal(select.value, 'drums');
  assert.equal(state.audible, audio);
  assert.equal(drums.handle.released, false);
  drums.metadata(); // The worker has produced a WAV and the native parser exposes its duration.
  t.mock.timers.tick(20000);
  drums.fire('progress');
  t.mock.timers.tick(20000);
  drums.ready();
  assert.equal(controls.activeName(), 'drums');
  assert.equal(state.audible, drums);
  assert.equal(audio.currentTime, 27);
});

test('a silent cold read that leaves NETWORK_LOADING without a further event is released', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const {audio, select, state, stems, pick} = await setup(t);
  stems[0].audioUrl = 'file:///bass.flac';
  const bass = pick('bass');
  await flush();
  bass.networkState = 2;
  t.mock.timers.tick(31000);
  assert.equal(select.value, 'bass');
  bass.networkState = 1;
  t.mock.timers.tick(31000);
  assert.equal(state.audible, audio);
  assert.equal(select.value, 'original');
  assert(bass.handle.released);
});

test('a decoder parked at metadata gets one position recovery and then releases the pending input', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const {audio, loaded, pick, state, controls, status, select} = await setup(t);
  await audio.play();
  const bass = await loaded('bass');
  const piano = pick('piano');
  await flush();
  piano.delayedPlay = new Promise(() => {}); // Metadata arrives, but no samples or 'playing' event follow.
  piano.metadata();
  const anchor = piano.currentTime;
  audio.currentTime += 9;
  bass.currentTime = audio.currentTime;
  t.mock.timers.tick(31000);
  assert(piano.currentTime > anchor);
  assert.equal(select.value, 'piano');
  assert.equal(state.audible, bass);
  t.mock.timers.tick(31000);
  assert.equal(select.value, 'bass');
  assert.equal(controls.activeName(), 'bass');
  assert.equal(state.audible, bass);
  assert(piano.handle.released);
  assert.match(status.textContent, /保留/);
});

test('an unresponsive remote read can fail before metadata; an explicit cold cancel is immediate', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const {audio, select, state, stems, pick} = await setup(t);
  stems[0].audioUrl = 'https://example.invalid/bass.flac';
  const remote = pick('bass');
  await flush();
  remote.networkState = 2;
  t.mock.timers.tick(31000);
  assert.equal(select.value, 'original');
  assert(remote.handle.released);
  stems[0].audioUrl = 'file:///cold.flac';
  const local = pick('bass');
  await flush();
  local.networkState = 2;
  t.mock.timers.tick(31000);
  pick('original');
  assert(local.handle.released);
  assert.equal(state.audible, audio);
  t.mock.timers.tick(60000);
  assert.equal(select.value, 'original');
});

test('refresh and track reset discard stale reads, delayed output handles and replaced audio', async t => {
  const {audio, select, controls, state, bridge, stems, pick, loaded, output} = await setup(t);
  const bass = await loaded('bass');
  let deliver;
  bridge.readStems = () => new Promise(resolve => { deliver = resolve; });
  const first = controls.refresh();
  const drums = pick('drums');
  deliver({ok: true, stems});
  await first;
  assert.equal(select.value, 'drums');
  assert.equal(state.audible, bass);
  const second = controls.refresh();
  deliver({ok: true, stems: []});
  await second;
  assert.equal(select.value, 'original');
  assert(bass.handle.released && drums.handle.released);
  bridge.readStems = async () => ({ok: true, stems});
  await controls.refresh();
  let prepared;
  const prepare = output.prepare;
  output.prepare = media => new Promise(resolve => { prepared = () => resolve(prepare(media)); });
  const piano = pick('piano');
  controls.reset();
  state.track = {id: 'other'};
  audio.src = 'file:///another.flac';
  audio.load();
  prepared();
  await flush();
  piano.metadata(); piano.ready();
  assert(piano.handle.released);
  assert.equal(state.audible, audio);
  assert.equal(audio.currentTime, 0);
});
