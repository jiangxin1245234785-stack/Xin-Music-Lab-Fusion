'use strict';
const assert=require('node:assert/strict');const {run}=require('../midi-batch.js');
async function main(){
 const plan=[{stem:'bass'},{stem:'piano'},{stem:'guitar'},{kind:'merge'}];
 const calls=[];let active=0,max=0,cancel=false,source='a';
 const options={plan,sourceRunId:'a',readSource:async()=>({ok:true,runId:source}),cancelled:()=>cancel,onStep:()=>{},runStep:async step=>{active++;max=Math.max(active,max);await Promise.resolve();calls.push(step);active--;return {ok:true,cached:true};}};
 assert((await run(options)).ok);assert.deepEqual(calls,plan);assert.equal(max,1);
 calls.length=0;const cancelled=await run({...options,onStep:index=>{if(index===2)cancel=true;}});assert.equal(cancelled.error,'analysis-cancelled');assert.equal(calls.length,1);
 cancel=false;calls.length=0;const failed=await run({...options,runStep:async step=>{calls.push(step);return step.stem==='piano'?{ok:false,error:'test-failure'}:{ok:true};}});assert(!failed.ok);assert.equal(calls.length,2);assert.equal(failed.completed.length,1);
 calls.length=0;const changed=await run({...options,runStep:async step=>{calls.push(step);source='b';return {ok:true};}});assert.equal(changed.error,'midi-batch-source-changed');assert.equal(calls.length,1);
 source='a';const thrown=await run({...options,runStep:async()=>{throw Error('IPC rejected');}});assert(!thrown.ok);assert.equal(thrown.completed.length,0);
 let reads=0;const lateCancel=await run({...options,readSource:async()=>{if(++reads===5)cancel=true;return {ok:true,runId:'a'};}});assert.equal(lateCancel.error,'analysis-cancelled');assert.equal(lateCancel.completed.length,4);
 console.log('MIDI batch: PASS (serial cache flow, gap cancellation, failure stops merge, source change, IPC failure)');
}main().catch(error=>{console.error(error);process.exitCode=1;});
