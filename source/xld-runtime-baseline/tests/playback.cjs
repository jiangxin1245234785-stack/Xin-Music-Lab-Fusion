'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const {create}=require('../playback-controls.js');
function media(trackId='song',start=0,end=60){
 const state={trackId,available:true,playing:false,loading:false,time:start,start,end,volume:1,stops:0,loop:null};
 return {state,info:()=>({...state}),play:()=>{state.playing=true;},pause:()=>{state.playing=false;state.loading=false;},stop:()=>{state.playing=false;state.loading=false;state.stops++;},seek:t=>{state.time=t;},volume:v=>state.volume=v,loop:l=>state.loop=l};
}
(async()=>{
 const main=media(),midi=media(),refine=media('song',20,40),sources={main,audition:midi,refinement:refine},claims=[];
 const p=create({sources,onClaim:id=>claims.push(id)});
 p.setVolume(0);assert(Object.values(sources).every(s=>s.state.volume===0));
 await p.play();assert(main.state.playing);
 p.claim('audition');await p.play();assert(!main.state.playing&&midi.state.playing);
 p.seek(15);assert.equal(midi.state.time,15);assert.equal(main.state.time,0);
 p.toggle();assert(!midi.state.playing);await p.toggle();assert(midi.state.playing);
 p.setLoop(10,12);assert.equal(midi.state.time,10);
 midi.state.time=12.1;p.tick();assert.equal(midi.state.time,10);
 p.claim('refinement');assert(!midi.state.playing);assert.equal(p.loop(),null,'invalid loop discarded for preview range');
 await p.play();p.seek(5);assert(!refine.state.playing);assert.equal(p.info().error,'range');
 assert.equal(p.setLoop(0,60),false);assert(p.setLoop(21,23));await p.play();
 refine.state.time=23;p.tick();assert.equal(refine.state.time,21);
 p.seek(30);assert.equal(p.loop().enabled,false,'seek outside loop disables it');
 p.stop();assert(Object.values(sources).every(s=>!s.state.playing));assert.equal(p.loop(),null);
 let reject;main.play=()=>new Promise((_,r)=>reject=r);
 const pending=p.play();p.claim('audition');await p.play();reject(Error('late old failure'));await pending;
 assert(midi.state.playing);assert.equal(p.info().error,'','stale error does not pause new owner');
 // Reuse the existing recording AudioContext helper, not a second approximation of MIDI scheduling.
 const helperFile=path.join(__dirname,'audition.cjs'),all=fs.readFileSync(helperFile,'utf8'),at=all.indexOf('// --- what gets scheduled');
 assert(at>0);
 const context={require:createRequire(helperFile),__dirname,console};
 vm.runInNewContext(all.slice(0,at)+';globalThis.fixture={controller,lane,note};',context);
 const f=context.fixture,h=f.controller([f.lane('strings',[f.note(0,10,60)],{sourceAudio:{url:'file:///fixture.wav',key:'a'}})],{overrides:{loadWav:async()=>({duration:60})}});
 h.controls.setVolume(0);h.controls.play('strings',5);
 const gains=h.ctx.nodes.filter(n=>n.kind==='gain');assert.equal(gains[1].gain.value,0,'post-compressor master starts muted');
 assert.equal(h.controls.time(),5);assert(h.controls.voiceCount()>0,'seek into a sustained note schedules its remaining sound');
 h.controls.setVolume(.3);assert.equal(gains[1].gain.value,.3);
 await h.controls.setMode('wav');assert.equal(h.controls.time(),5);assert.equal(gains[1].gain.value,.3);
 h.controls.pause();const paused=h.controls.time();await h.controls.toggle();assert.equal(h.controls.time(),paused);h.controls.stop();
 let resolve;const late=f.controller([f.lane('strings',[f.note(0,10,60)],{sourceAudio:{url:'file:///fixture.wav',key:'b'}})],{overrides:{loadWav:()=>new Promise(r=>resolve=r)}});
 await late.controls.setMode('wav');const loading=late.controls.start('strings',5);late.controls.stop();resolve({duration:60});await loading;
 assert(!late.controls.playing()&&!late.controls.loading(),'cancelled WAV load cannot restart sound');
 console.log('playback: PASS (shared owner/volume/seek/pause, preview range/loop, stale errors, master mute and late WAV cancellation)');
})().catch(e=>{console.error(e);process.exitCode=1;});
