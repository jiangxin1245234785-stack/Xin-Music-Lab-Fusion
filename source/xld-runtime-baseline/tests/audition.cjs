'use strict';
// R5: hearing one transcribed part. The thing most likely to ship broken here is a hung note — a voice that keeps
// sounding after you paused, switched part, switched MIDI version or cleared storage — so most of this file is
// about what happens when playback STOPS, not when it starts.
//
// The audio context is a double that records every scheduled value, which is the only way to assert things like
// "the envelope of a 0.6 ms note is still audible" or "the oldest voice was released, not the newest" without a
// sound card.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

// --- a recording AudioContext -----------------------------------------------------------------------------------
function param(initial) {
  const events = [];
  return {
    value: initial,
    events,
    setValueAtTime(value, at) { events.push(['set', value, at]); this.value = value; return this; },
    linearRampToValueAtTime(value, at) { events.push(['linear', value, at]); return this; },
    exponentialRampToValueAtTime(value, at) { events.push(['exponential', value, at]); return this; },
    cancelScheduledValues(at) { events.push(['cancel', null, at]); return this; }
  };
}
function fakeContext() {
  const nodes = [];
  const track = node => { nodes.push(node); return node; };
  const ctx = {
    currentTime: 0,
    sampleRate: 48000,
    destination: { kind: 'destination' },
    resumed: 0,
    nodes,
    resume() { this.resumed += 1; },
    createGain: () => track({ kind: 'gain', gain: param(1), connect() {} }),
    createBiquadFilter: () => track({ kind: 'filter', type: '', frequency: param(0), Q: param(1), connect() {} }),
    createDynamicsCompressor: () => track({ kind: 'compressor', threshold: param(0), ratio: param(1), knee: param(0), connect() {} }),
    createOscillator: () => track({ kind: 'oscillator', type: '', frequency: param(0), detune: param(0), started: null, stopped: [], connect() {}, start(at) { this.started = at; }, stop(at) { this.stopped.push(at); } }),
    createBufferSource: () => track({ kind: 'buffer', buffer: null, loop: false, started: null, stopped: [], connect() {}, start(at, offset) { this.started = at; this.offset = offset; }, stop(at) { this.stopped.push(at); } }),
    createBuffer: (channels, length) => ({ length, getChannelData: () => new Float32Array(length) })
  };
  return ctx;
}
const voicesOf = ctx => ctx.nodes.filter(node => node.kind === 'oscillator' || node.kind === 'buffer');

// --- a document double -------------------------------------------------------------------------------------------
function makeNode() {
  const listeners = {};
  return {
    textContent: '', title: '', disabled: false, attributes: {}, listeners,
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    setAttribute(name, value) { this.attributes[name] = value; },
    dispatch(type) { for (const fn of listeners[type] || []) fn({ type }); }
  };
}

function harness() {
  const button = makeNode();
  const timers = new Map();
  let nextTimer = 1;
  const sandbox = {
    document: { getElementById: id => (id === 'timelineAudition' ? button : null) },
    setInterval(fn) { const id = nextTimer++; timers.set(id, fn); return id; },
    clearInterval(id) { timers.delete(id); },
    requestAnimationFrame() { return 1; },
    cancelAnimationFrame() {},
    console,
    module: { exports: {} }
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(read('audition-controls.js'), sandbox);
  return { button, timers, api: sandbox.XldAuditionControls, tick: () => { for (const fn of timers.values()) fn(); } };
}

const note = (start, end, pitch, velocity = 90) => [start, end, pitch, velocity, 0, 0];
const lane = (stem, notes, extra = {}) => ({ stem, laneId: stem, engine: 'e', engineName: 'E', duration: 60, notes, noteCount: notes.length, ...extra });

function controller(lanes, options = {}) {
  const parts = harness();
  const ctx = fakeContext();
  let focus = 'focus' in options ? options.focus : (lanes[0]?.laneId ?? null);
  let ticks = 0;
  const controls = parts.api.create({
    getLane: id => lanes.find(item => item.laneId === id) || null,
    getFocus: () => focus,
    rt: key => key,
    positionHint: () => options.position || 0,
    onTick: () => { ticks += 1; },
    createContext: () => ctx,
    ...options.overrides
  });
  controls.bind();
  return { controls, ctx, button: parts.button, timers: parts.timers, tick: parts.tick,
    setFocus: value => { focus = value; controls.lanesChanged(); }, ticks: () => ticks, api: parts.api };
}

// --- what gets scheduled -------------------------------------------------------------------------------------------
{
  const notes = Array.from({ length: 12 }, (_, i) => note(i * 0.5, i * 0.5 + 0.3, 60 + i));
  const { controls, ctx, tick } = controller([lane('piano', notes)]);
  assert.equal(controls.play('piano', 0), true);
  // Only the look-ahead window is handed to the audio clock. Scheduling all twelve at once would be the easy
  // version and would also mean a pause had a dozen already-committed notes to take back.
  const first = voicesOf(ctx).length;
  assert(first > 0, 'something was scheduled');
  assert(first < notes.length * 2, 'but not the whole part: ' + first);
  const scheduledNotes = ctx.nodes.filter(node => node.kind === 'gain' && node.gain.events.length > 1).length;
  assert.equal(scheduledNotes, 3, 'notes inside the 1.5 s window, from a 0.06 s lead: ' + scheduledNotes);
  ctx.currentTime += 1;
  tick();
  assert.equal(ctx.nodes.filter(node => node.kind === 'gain' && node.gain.events.length > 1).length, 5, 'the window moves with the clock');
  assert.equal(ctx.resumed, 1, 'the context is resumed on the click that starts it');
}

// --- stopping: the failure this round is most likely to ship ---------------------------------------------------------
for (const [label, act] of [
  ['pause', ({ controls }) => controls.pause()],
  ['stop', ({ controls }) => controls.stop()],
  ['switching part', harnessed => harnessed.setFocus('guitar')],
  ['the lane reloading under it', ({ controls, lanes }) => { lanes[0].notes = lanes[0].notes.slice(); controls.lanesChanged(); }]
]) {
  const lanes = [lane('piano', [note(0, 4, 60), note(0.1, 4, 64), note(0.2, 4, 67)]), lane('guitar', [note(0, 1, 50)])];
  const harnessed = controller(lanes);
  harnessed.lanes = lanes;
  harnessed.controls.play('piano', 0);
  const before = voicesOf(harnessed.ctx);
  assert(before.length >= 3, label + ': notes were sounding first');
  assert(before.every(source => !source.stopped.length || source.stopped[0] > 3), label + ': and were scheduled to ring on');
  harnessed.ctx.currentTime = 0.5;
  act(harnessed);
  // Every source has been told to stop soon, and none of them is still allowed to run to its original end.
  for (const source of before) {
    assert(source.stopped.length, label + ': every source is stopped');
    assert(source.stopped.at(-1) <= 0.6, label + ': and stopped now, not at its natural end (' + source.stopped.at(-1) + ')');
  }
  // Ramped, never cut: an abrupt zero is a click, and a click while judging onsets is the worst artefact there is.
  for (const gain of harnessed.ctx.nodes.filter(node => node.kind === 'gain')) {
    const cancelled = gain.gain.events.findIndex(event => event[0] === 'cancel');
    if (cancelled < 0) continue;
    const after = gain.gain.events.slice(cancelled);
    // The shape has to be: cancel what was scheduled, pin the value it has right now, ramp that to zero. The pin
    // and the cancel share an instant; the silence arrives later, over a ramp. A `set` to zero at a later time
    // would be a cut, and a cut in the middle of judging onsets is the worst artefact this could produce.
    assert.equal(after.at(-1)[0], 'linear', label + ': the release ends in a ramp');
    assert.equal(after.at(-1)[1], 0, label + ': ...to zero');
    assert(after.at(-1)[2] > after[0][2], label + ': and the ramp takes time rather than landing on the cancel');
    assert(after.filter(event => event[0] === 'set').every(event => event[2] === after[0][2]),
      label + ': nothing is set outright after the cancel except pinning the current value');
  }
  assert.equal(harnessed.timers.size, 0, label + ': no scheduler is left running');
  assert.equal(harnessed.controls.playing(), false, label + ': and it no longer claims to be playing');
}

// --- the clock the timeline reads ------------------------------------------------------------------------------------
{
  const { controls, ctx } = controller([lane('piano', [note(0, 30, 60)])]);
  assert.equal(controls.time(), null, 'nothing sounding, nothing to say — the playhead stays with the audio element');
  controls.play('piano', 4);
  ctx.currentTime = 2;
  assert(Math.abs(controls.time() - (4 + 2 - 0.06)) < 1e-9, 'position counts from where playback started: ' + controls.time());
  controls.pause();
  const held = controls.time();
  assert(typeof held === 'number', 'a paused audition still knows where it is, so the playhead does not jump');
  ctx.currentTime = 9;
  assert.equal(controls.time(), held, 'and does not drift while paused');
  controls.stop();
  assert.equal(controls.time(), null, 'stopping hands the playhead back');
}

// --- envelopes: the shortest notes in the library must still be audible -------------------------------------------------
{
  // 0.6 ms is the real minimum on disk, and 4.2% of all notes are under 50 ms. A fixed attack and release would
  // swallow them whole — and they are exactly the notes the fragment question is about.
  const { controls, ctx, api } = controller([lane('strings', [note(0, 0.0006, 60), note(0.2, 3, 62)])]);
  controls.play('strings', 0);
  const envelopes = ctx.nodes.filter(node => node.kind === 'gain' && node.gain.events.length > 2)
    .map(node => node.gain.events.filter(event => event[0] !== 'cancel'));
  assert.equal(envelopes.length, 2);
  const span = events => events.at(-1)[2] - events[0][2];
  assert(span(envelopes[0]) >= api.MIN_SOUNDING - 1e-9, 'the 0.6 ms note is given an audible floor: ' + span(envelopes[0]));
  assert(span(envelopes[0]) <= 0.06, 'but only a floor — stretch it further and two fragments 10 ms apart merge: ' + span(envelopes[0]));
  assert(Math.abs(span(envelopes[1]) - 2.8) < 1e-9, 'a long note keeps its real length: ' + span(envelopes[1]));
  for (const events of envelopes) {
    assert(events.every((event, at) => at === 0 || event[2] >= events[at - 1][2]), 'envelope times never go backwards');
    assert.equal(events.at(-1)[1], 0, 'and every note ends at silence');
  }
}

// --- velocity is real data, not decoration ------------------------------------------------------------------------------
{
  const { controls, ctx } = controller([lane('piano', [note(0, 1, 60, 12), note(0.05, 1, 62, 120)])]);
  controls.play('piano', 0);
  const peaks = ctx.nodes.filter(node => node.kind === 'gain' && node.gain.events.length > 2)
    .map(node => Math.max(...node.gain.events.map(event => event[1] || 0)));
  assert.equal(peaks.length, 2);
  assert(peaks[1] > peaks[0] * 1.8, 'a velocity of 120 is clearly louder than 12: ' + peaks.join(' vs '));
  assert(peaks[0] > 0.02, 'and the quietest notes are still audible: ' + peaks[0]);
}

// --- drums are categories, not frequencies --------------------------------------------------------------------------------
{
  // Every drum note in the library is exactly 0.100 s because the adapter writes a fixed length from an onset, so
  // the length carries nothing; a crash and a closed hi-hat have to differ by how long they ring here.
  const drums = lane('drums', [note(0, 0.1, 42), note(0.3, 0.4, 49)], { instrument: { index: 0, name: 'drums', isDrum: true, noteCount: 2 } });
  const { controls, ctx } = controller([drums]);
  controls.play('drums', 0);
  assert(ctx.nodes.some(node => node.kind === 'buffer'), 'percussion is noise, not a tuned oscillator');
  const pitchedAtDrumKeys = ctx.nodes.filter(node => node.kind === 'oscillator')
    .some(node => Math.abs(node.frequency.value - 440 * Math.pow(2, (42 - 69) / 12)) < 1);
  assert(!pitchedAtDrumKeys, 'a drum key never reaches an oscillator as a pitch');
  const rings = ctx.nodes.filter(node => node.kind === 'gain' && node.gain.events.length > 2)
    .map(node => node.gain.events.at(-1)[2] - node.gain.events[0][2]);
  assert.equal(rings.length, 2);
  assert(rings[1] > rings[0] * 3, 'a crash rings far longer than a closed hi-hat, though the file gives both 0.1 s: ' + rings.join(' vs '));
}

// --- polyphony -----------------------------------------------------------------------------------------------------------
{
  const { api } = harness();
  assert(api.MAX_VOICES >= 128);
  const many = Array.from({length:api.MAX_VOICES+6},(_,i)=>note(i*.0005,8,40+i%40));
  let playingClaimed=false;
  const {controls,ctx}=controller([lane('guitar',many)],{overrides:{onStateChange:()=>{if(controls.playing())playingClaimed=true;}}});
  assert.equal(controls.play('guitar',0),false,'overload stops clearly rather than stealing long notes');
  assert(!controls.playing());assert(controls.mixInfo().overload);
  assert(playingClaimed,'new source is claimed before overflow, so previous audio cannot keep playing');
  assert.equal(controls.voiceCount(),0,'no hung voices after overload');

}

// --- the button says what it can and cannot do -------------------------------------------------------------------------------
{
  const lanes = [lane('piano', [note(0, 1, 60)]), lane('bass', [])];
  const harnessed = controller(lanes, { focus: null });
  assert.equal(harnessed.button.disabled, true, 'nothing focused, nothing to audition');
  assert.equal(harnessed.button.title, 'runtime.audition.idle');
  harnessed.setFocus('bass');
  assert.equal(harnessed.button.disabled, true, 'an empty part cannot be played');
  assert.equal(harnessed.button.title, 'runtime.audition.empty');
  harnessed.setFocus('piano');
  assert.equal(harnessed.button.disabled, false);
  // The label has to say this is a synthesised tone. Someone judging timbre from it would be judging this code.
  assert.equal(harnessed.button.title, 'runtime.audition.hint');
  assert.equal(harnessed.button.textContent, 'runtime.audition.play');
  harnessed.button.dispatch('click');
  assert.equal(harnessed.controls.playing(), true, 'the button starts the focused part');
  assert.equal(harnessed.button.textContent, 'runtime.audition.pause');
  harnessed.button.dispatch('click');
  assert.equal(harnessed.controls.playing(), false, 'and the same button pauses it');
}

// --- a machine with no audio output ---------------------------------------------------------------------------------------
{
  const lanes = [lane('piano', [note(0, 1, 60)])];
  const parts = harness();
  const controls = parts.api.create({
    getLane: id => lanes.find(item => item.laneId === id) || null,
    getFocus: () => 'piano', rt: key => key,
    createContext: () => { throw new Error('no audio device'); }
  });
  controls.bind();
  assert.equal(controls.play('piano', 0), false, 'it reports failure instead of throwing into the interface');
  assert.equal(parts.button.disabled, true);
  assert.equal(parts.button.title, 'runtime.audition.unavailable', 'and says so in words');
  assert.equal(parts.timers.size, 0);
}

// --- wiring that has to exist elsewhere ---------------------------------------------------------------------------------------
{
  const app = read('app.js'), timeline = read('timeline-controls.js'), html = read('index.html');
  assert(/<script src="audition-controls\.js"><\/script>[\s\S]*<script src="app\.js">/.test(html), 'the controller loads before app.js, which constructs it');
  assert(html.includes('id="timelineAudition"'), 'the button exists in the toolbar');
  // A synthesised part is not an <audio> element, so the existing sweep walks straight past it.
  assert(app.includes('beforeClear:()=>{playbackControls?.stop();'), 'storage stops all playback owners');
  assert(app.includes("main.addEventListener('play',()=>playbackControls.claim('main'))"), 'recording claims transport');
  assert(app.includes("playbackControls?.claim('audition')"), 'audition claims transport');
  // Which rejects whatever play() promise was still in flight. Every call that is not awaited has to say so, or
  // the console fills with AbortError every time someone presses play and then auditions a part.
  assert(/function startPlayback\(\)/.test(app) && /error\?\.name !== 'AbortError'/.test(app), 'an interrupted play() is expected, not an unhandled rejection');
  const bare = app.split(/\r?\n/).filter(line => /dom\.audioElement\.play\(\)/.test(line) && !/await |\?\.catch/.test(line));
  assert.deepEqual(bare, [], 'no play() call is left to reject into the console: ' + bare.join(' // '));
  assert(/timelineControls\.setTimeSource\(/.test(app), 'the timeline follows the audition clock');
  assert(app.includes('playbackControls?.tick();'), 'WebAudio updates the shared transport');
  assert(/const auditioned = timeSource \? timeSource\(\) : null;/.test(timeline), 'and the timeline reads it');
  assert(/laneFor: id => lookup\(id\)/.test(timeline), 'the audition reads notes from the timeline, so the split lives in one place');
}

console.log('audition: ok (look-ahead scheduling, four stop paths leave nothing ringing and the other two are wired, envelopes fit the shortest notes on disk, drums are categories, overload stops explicitly)');

// R6 behavioural checks: same position and one clock, real loop scheduling, stale load cancellation.
(async () => {
  const sourceAudio = {url:'file:///test.wav',key:'one'};
  const n = [note(0,10,60),note(1.5,1.8,64),note(2.1,2.3,67)];
  const lanes = [lane('strings', n, {sourceAudio})];
  let loads=0;
  const h=controller(lanes,{overrides:{loadWav:async()=>{loads++;return {duration:60};}}});
  const c=h.controls;
  c.play('strings',5);
  assert.equal(c.time(),5,'lead-in never moves the playhead backwards');
  h.ctx.currentTime=1;
  const before=c.time();
  await c.setMode('wav');
  assert(Math.abs(c.time()-before)<1e-9,'switch to WAV keeps position');
  const wav=h.ctx.nodes.filter(n=>n.kind==='buffer' && n.buffer?.duration).at(-1);
  assert.equal(wav.offset,before,'buffer starts at the shared position, not zero');
  assert.equal(c.voiceCount(),0,'MIDI voices stopped before WAV starts');
  c.pause(); const paused=c.time();
  await c.setMode('midi');
  assert.equal(c.playing(),false,'switch while paused stays paused');
  assert.equal(c.time(),paused);
  c.setLoop(1,2);
  assert.equal(c.setLoop(2,2.1),false,'too-short ranges refused');
  await c.toggle();
  const t0=h.ctx.currentTime+0.06;
  for(let lap=0;lap<10;lap++){
    h.ctx.currentTime=t0+lap+0.4;h.tick();
    assert(Math.abs(c.time()-1.4)<1e-8,'loop playhead wraps for lap '+lap);
  }
  const pitched=h.ctx.nodes.filter(n=>n.kind==='oscillator' && n.started>=t0);
  assert(pitched.length>=20,'all loop passes actually schedule notes');
  assert(pitched.every(n=>n.stopped[0]<=t0+Math.floor((n.started-t0+1e-7))+1+1e-7),'no sustain leaks across a loop seam');
  assert.equal(c.setLoop(1.2,2.2),true,'changing the range while playing restarts at the new range');
  assert.equal(c.playing(),true);
  c.seek(4);assert.equal(c.loop().enabled,false,'seek outside disables the loop');
  assert.equal(c.time(),4);c.pause();
  await c.setMode('wav');await c.toggle();
  assert.equal(loads,1,'only one decoded source buffer is kept/reused');
  c.clearLoop();c.stop();assert.equal(c.time(),null);
  assert.equal(h.timers.size,0);

  let finish;
  const delayed=controller(lanes,{overrides:{loadWav:()=>new Promise(r=>{finish=r;})}});
  await delayed.controls.setMode('wav');
  const pending=delayed.controls.toggle();
  assert(delayed.controls.loading());
  delayed.controls.stop();
  finish({duration:60});await pending;
  assert.equal(delayed.controls.playing(),false,'cancelled decode cannot restart playback');
  assert.equal(delayed.timers.size,0);

  let track='A';
  const trackSwitch=controller(lanes,{overrides:{getTrackKey:()=>track}});
  trackSwitch.controls.setLoop(1,2);trackSwitch.controls.play('strings',1);
  track='B';trackSwitch.controls.lanesChanged();
  assert.equal(trackSwitch.controls.playing(),false);
  assert.equal(trackSwitch.controls.loop(),null,'range does not leak into a different song');

  const fail=controller(lanes,{overrides:{loadWav:async()=>{throw Error('missing');}}});
  await fail.controls.setMode('wav');assert.equal(await fail.controls.toggle(),false);
  assert.equal(fail.controls.playing(),false);
  await fail.controls.setMode('midi');await fail.controls.toggle();assert(fail.controls.playing(),'WAV failure leaves MIDI usable');
  fail.controls.stop();
  console.log('compare loop: ok (A/B position, paused switching, ten scheduled seams, cancellation, track reset, cache and load failure)');
})().catch(error=>{console.error(error);process.exitCode=1;});
