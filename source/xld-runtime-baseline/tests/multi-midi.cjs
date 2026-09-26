'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const helperFile=path.join(__dirname,'audition.cjs'),all=fs.readFileSync(helperFile,'utf8'),at=all.indexOf('// --- what gets scheduled');
const context={require:createRequire(helperFile),__dirname,console};
vm.runInNewContext(all.slice(0,at)+';globalThis.fixture={controller,lane,note};',context);
const {controller,lane,note}=context.fixture;
const lanes=[
 lane('guitar',Array.from({length:45},(_,i)=>note(0,8,40+i%40)),{laneId:'guitar#0',instrument:{index:0,isDrum:false}}),
 lane('strings',Array.from({length:45},(_,i)=>note(0,8,48+i%40)),{laneId:'strings#0',instrument:{index:0,isDrum:false}}),
 lane('strings',[note(0,8,65)],{laneId:'strings#1',instrument:{index:1,isDrum:false}}),
 lane('drums',[note(0,0.1,49)],{instrument:{index:0,isDrum:true}})
];
let track='a';
const h=controller(lanes,{focus:null,overrides:{getLanes:()=>lanes,getTrackKey:()=>track}});
h.controls.lanesChanged();
assert(!h.button.disabled,'overview can play MIDI without focusing');
h.controls.toggle();assert(h.controls.playing());assert.equal(h.controls.laneId(),'@mix');
assert.equal(h.controls.mixInfo().audible,4);
const oscillators=h.ctx.nodes.filter(n=>n.kind==='oscillator'),starts=oscillators.map(n=>n.started);
assert(oscillators.length>=182,'all 91 sustained notes exceed former 64-note limit');
assert(starts.every(t=>t===starts[0]),'all tracks share a sample clock');
const stops=oscillators.map(n=>n.stopped.slice()),beforeCount=h.ctx.nodes.length;
h.ctx.currentTime=.3;
h.setFocus('strings#0');h.setFocus(null);assert(h.controls.playing());assert.equal(h.ctx.nodes.length,beforeCount,'focus does not reschedule mix');
assert.deepEqual(oscillators.map(n=>n.stopped),stops,'focus does not cut notes');
h.controls.setMix('stem:strings','mute',true);assert.equal(h.controls.mixInfo().audible,2);
h.controls.setMix('lane:strings#0','solo',true);assert.equal(h.controls.mixInfo().audible,0,'parent mute wins over child solo');
h.controls.setMix('stem:strings','mute',false);assert.equal(h.controls.mixInfo().audible,1);
h.controls.setMix('lane:guitar#0','solo',true);assert.equal(h.controls.mixInfo().audible,2,'multiple solos combine');
h.controls.setMix('stem:strings','solo',true);assert.equal(h.controls.mixInfo().audible,3,'parent solo includes siblings');
h.controls.setMix('lane:strings#1','mute',true);assert.equal(h.controls.mixInfo().audible,2,'child mute wins inside soloed parent');
h.controls.setMix('stem:guitar','volume',.2);
const ramps=h.ctx.nodes.filter(n=>n.kind==='gain').flatMap(n=>n.gain.events).filter(e=>e[0]==='linear');
assert(ramps.some(e=>e[1]===.2&&e[2]===.315),'parent gain changes with short ramp');
assert.deepEqual(oscillators.map(n=>n.stopped),stops,'M/S never reschedules other long notes');
h.controls.resetMix();assert.equal(h.controls.mixInfo().audible,4);
h.controls.seek(2);assert(h.controls.playing());assert.equal(h.controls.time(),2);
h.controls.setLoop(2,3);h.ctx.currentTime+=1.3;h.tick();assert(h.controls.time()>=2&&h.controls.time()<3);
h.controls.pause();const time=h.controls.time();h.setFocus('guitar#0');assert.equal(h.controls.time(),time);
lanes[1]={...lanes[1],notes:[note(0,7,62)],isDraft:true};h.controls.notesChanged();
assert.equal(h.controls.mixInfo().isDraft,true);h.controls.toggle();assert(h.controls.playing());
lanes[1]={...lanes[1],runId:'new-version',notes:[note(0,7,64)]};h.controls.lanesChanged();assert(!h.controls.playing(),'changed results invalidate scheduled notes');
track='b';h.controls.lanesChanged();assert.equal(h.controls.mixInfo().audible,4);assert.equal(h.controls.loop(),null);
h.controls.stop();
console.log('multi MIDI: PASS (92 concurrent notes, one clock, parent/child M/S union, smooth gain, focus stability, loops, drafts and version invalidation)');
