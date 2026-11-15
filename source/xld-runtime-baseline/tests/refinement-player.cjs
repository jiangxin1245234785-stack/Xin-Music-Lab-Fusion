'use strict';
const assert=require('node:assert/strict'),{create}=require('../refinement-player.js');
(async()=>{
 const calls=[],gain={gain:{value:1},connect(){}},ctx={currentTime:0,createGain:()=>gain,resume:async()=>{},destination:{}},stream={prepare:async(...args)=>{calls.push(args);return true;},start:at=>calls.push(['start',at]),stop(){},tick(){},clear(){}};
 const p=create({readChunk:()=>{},createContext:()=>ctx,createStream:()=>stream});
 const value={track:{id:'test'},start:10.25,end:12.25,sourceOffset:10.25,sourceAudio:{streamKey:'parent'},gain:.5};
 p.set(value);p.volume(.8);assert(await p.play());assert.equal(gain.gain.value,.4);assert.equal(calls[0][1],10.25);assert.equal(calls[0][2],12.25);
 ctx.currentTime=1.025;assert.equal(p.info().time,11.25);p.pause();assert(!p.info().playing);assert.equal(p.info().time,11.25);
 p.set({...value,sourceOffset:0,sourceAudio:{streamKey:'target'}});p.seek(11.25);assert(await p.play());assert.equal(calls.at(-2)[1],1);assert.equal(calls.at(-2)[2],2);
 ctx.currentTime=2.05;p.tick();assert(!p.info().playing);assert.equal(p.info().time,12.25);assert(await p.play());assert.equal(calls.at(-2)[1],0,'replay starts at segment beginning');
 p.pause();p.loop({start:10.5,end:11.5,enabled:true});p.seek(10.5);assert(await p.play());assert.equal(calls.at(-2)[2],1.25);assert.equal(calls.at(-2)[3],true);assert.equal(calls.at(-2)[4],.25);
 ctx.currentTime+=1.525;assert(Math.abs(p.info().time-11)<1e-6,'loop clock follows scheduler');
 p.pause();let release;stream.prepare=()=>new Promise(r=>release=r);const pending=p.play();await new Promise(r=>setImmediate(r));p.pause();release(true);assert.equal(await pending,false);assert(!p.info().playing);assert(!p.info().loading);
 stream.prepare=async()=>{throw Error('missing-source');};assert.equal(await p.play(),false);assert.equal(p.info().error,'missing-source');p.clear();assert(!p.info().playing);
 console.log('Refinement player PASS: source offsets, shared gain, pause/replay, exact loop, cancellation and load errors');
})().catch(e=>{console.error(e);process.exitCode=1;});
