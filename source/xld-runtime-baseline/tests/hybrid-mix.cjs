'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const helper=path.join(__dirname,'audition.cjs');let text=fs.readFileSync(helper,'utf8').split('// --- what gets scheduled')[0];
text=text.replace("read('audition-controls.js'), sandbox","read('wav-stream.js')+'\\n'+read('audition-controls.js'), sandbox");
const env={require:createRequire(helper),__dirname,console};vm.runInNewContext(text+';globalThis.fixture={controller,lane,note,fakeContext};',env);
const {controller,lane,note,fakeContext}=env.fixture;
(async()=>{
 const audio=(key)=>({key,stream:true,duration:60});
 const lanes=[lane('strings',[note(0,8,60)],{laneId:'strings#0',sourceAudio:audio('s')}),
 lane('strings',[note(0,8,64)],{laneId:'strings#1',sourceAudio:audio('s')}),
 lane('guitar',[note(0,8,55)],{sourceAudio:audio('g')}),
 lane('other',[],{sourceAudio:audio('o'),wavOnly:true})];
 const ctx=fakeContext();const cg=ctx.createGain;ctx.createGain=()=>({...cg(),disconnect(){}});ctx.createBuffer=(channels,length,rate)=>({numberOfChannels:channels,length,sampleRate:rate,getChannelData:()=>new Float32Array(length)});
 const bufferSource=ctx.createBufferSource;ctx.createBufferSource=()=>{const n=bufferSource();n.disconnect=()=>{};return n;};
 const reads=[];const h=controller(lanes,{focus:null,overrides:{createContext:()=>ctx,getLanes:()=>lanes,getTrackKey:()=> 'one',
 readWavChunk:async(key,index)=>{reads.push([key,index]);return {ok:true,frames:32000,sampleRate:8000,channels:[new Float32Array(32000)]};}}});
 h.controls.lanesChanged();assert(await h.controls.start('@mix',0));assert.equal(h.controls.diagnostics().wav.uniqueSources,1);
 assert.equal(h.controls.diagnostics().scheduledNotes,3);assert.equal(h.controls.mixInfo().audible,4);
 await h.controls.setPreset('wav');assert.equal(h.controls.diagnostics().wav.uniqueSources,3,'strings WAV scheduled once');
 assert.equal(h.controls.diagnostics().scheduledNotes,0);assert.equal(h.controls.mixInfo().audible,3);
 assert.equal(reads.filter(r=>r[0]==='s'&&r[1]===0).length,1,'one load for both strings children');
 ctx.currentTime=.5;const before=h.controls.time();await h.controls.setSource('strings','midi');
 assert.equal(h.controls.time(),before);assert.equal(h.controls.diagnostics().scheduledNotes,2);
 assert.equal(h.controls.diagnostics().wav.uniqueSources,2);
 h.controls.setMix('stem:other','mute',true);assert.equal(h.controls.mixInfo().audible,3);
 await h.controls.setPreset('midi');assert.equal(h.controls.diagnostics().scheduledNotes,3);
 const stopped=ctx.nodes.filter(n=>n.kind==='buffer'&&n.buffer?.sampleRate===8000);assert(stopped.every(n=>n.stopped.length>=2),'switch stops scheduled WAV sources');
 h.controls.stop();assert(!h.controls.playing());
 console.log('hybrid mix: PASS (union, unique parent WAV, MIDI substitution, same position, presets, M/S, stop)');
})().catch(e=>{console.error(e);process.exitCode=1;});
