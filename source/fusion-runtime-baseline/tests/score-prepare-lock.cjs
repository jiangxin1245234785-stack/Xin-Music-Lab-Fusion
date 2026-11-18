'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {create}=require('../score-prepare.js');
const {createAnalysisLock}=require('../../xld-runtime-baseline/core/analysis-lock.cjs');
const settle=()=>new Promise(r=>setImmediate(r));
const lock={program:'XLD',song:'other',pid:1},busy={ok:false,error:'analysis-locked',holder:lock};
function rig(){
  const timers=new Map(),calls=[],results=[],events=[];let index=0;
  const env={active:true,wanted:'A',owner:lock,owed:['score-layers'],read:()=>env.owner,steps:()=>env.owed};
  const q=create({run:async(id,e)=>{calls.push([id,e]);return results.shift()??busy;}, readLock:()=>env.read(),owedAfterLock:()=>env.steps(),
    mayStart:()=>env.active,isWanted:id=>env.wanted===id,setTimeout:(fn,ms)=>{timers.set(++index,{fn,ms});return index;},clearTimeout:id=>timers.delete(id)});
  q.subscribe(e=>events.push(e));
  async function next(ms){assert.equal(timers.size,1);const [n,t]=[...timers][0];assert.equal(t.ms,ms);timers.delete(n);t.fn();await settle();}
  return {q,env,calls,results,events,timers,next};
}

test('busy for multiple retry periods starts no engine, a release resumes precisely once',async()=>{
  const {q,calls,results,timers,env,next}=rig();q.auto('A','s');await settle();assert.equal(q.phase('A'),'locked');assert.equal(q.attempts('A'),0);
  assert.equal(q.request('A'),false);const batch=q.batch(['A'],()=>{});assert.deepEqual([batch.status().total,batch.status().finished],[0,true]);
  for(let i=0;i<35;i++){await next(2000);assert.equal(q.auto('A','s'),false);assert.equal(calls.length,1);}
  env.owner=null;results.push({ok:true});await next(2000);assert.equal(q.phase('A'),'done');assert.equal(q.attempts('A'),1);assert.equal(timers.size,0);assert.equal(calls.length,2);
});

test('read errors retain the previous owner and stay cancellable without starting or surveying a song',async()=>{
  for(const cancel of [false,true]){
    const {q,env,calls,results,timers,next}=rig();let surveys=0;
    env.read=async()=>{throw Error('IPC unavailable');};env.steps=()=>{surveys++;return env.owed;};
    q.auto('A','s');await settle();
    for(let i=0;i<3;i++)await next(2000);
    assert.equal(q.phase('A'),'locked');assert.equal(q.holder('A'),lock);assert.equal(q.attempts('A'),0);
    assert.equal(calls.length,1);assert.equal(surveys,0);
    if(cancel){assert.ok(q.cancelWait('A'));assert.equal(timers.size,0);}
    else{env.read=()=>null;results.push({ok:true});await next(2000);assert.equal(q.phase('A'),'done');assert.equal(calls.length,2);assert.equal(surveys,1);}
  }
});

test('release re-reads missing steps, including partial, already completed and reacquired work',async()=>{
  const {q,env,calls,results,events,next,timers}=rig();results.push({ok:true},busy);q.auto('A','s',['score-layers','score-vocals']);await settle();
  assert.equal(q.step('A'),'score-vocals');env.owner=null;env.owed=['score-vocals'];results.push(busy);await next(2000);assert.equal(q.phase('A'),'locked');
  env.owed=[];await next(2000);assert.equal(q.phase('A'),'done');assert.equal(timers.size,0);assert.equal(events.at(-1).result.cached,true);
  assert.deepEqual(calls.map(c=>c[1]),['score-layers','score-vocals','score-vocals']);
});

test('ordinary failures still have only one retry regardless of lock waits',async()=>{
  const {q,env,results,next,timers,calls}=rig();results.push({ok:false,error:'engine-error'},busy);q.auto('A','s');await settle();await next(30000);
  assert.equal(q.phase('A'),'locked');assert.equal(q.attempts('A'),1);env.owner=null;results.push({ok:false,error:'engine-error'});await next(2000);
  assert.equal(q.phase('A'),'failed');assert.equal(q.attempts('A'),2);assert.equal(timers.size,0);assert.equal(calls.length,3);
});

test('scene hidden parks; track change, disable and explicit cancel cannot revive an asynchronous read',async()=>{
  for(const mode of ['hide','change','disable','cancel']){
    const {q,env,calls,results,next,timers}=rig();q.auto('A','s');await settle();let unblock;env.read=()=>new Promise(r=>unblock=r);await next(2000);
    if(mode==='hide')env.active=false;
    if(mode==='change'||mode==='disable'){env.wanted=mode==='change'?'B':'';q.forgetWaiting(env.wanted);}
    if(mode==='cancel'){assert.ok(q.cancelWait('A'));assert.equal(q.auto('A','s'),false);}
    unblock(null);await settle();assert.equal(timers.size,0);assert.equal(calls.length,1);
    if(mode==='hide'){assert.equal(q.phase('A'),'held');env.read=()=>null;env.active=true;results.push({ok:true});q.auto('A','s');await next(2000);assert.equal(q.phase('A'),'done');}
    else assert.equal(q.phase('A'),mode==='cancel'?'cancelled':'idle');
  }
});

test('discarded checks during owed-step survey and returning an old in-flight result after changing song',async()=>{
  const {q,env,calls,next}=rig();q.auto('A','s');await settle();env.owner=null;let unblock;env.steps=()=>new Promise(r=>unblock=r);await next(2000);
  q.cancelWait('A');unblock(['score-layers']);await settle();assert.equal(calls.length,1);
  let finish;const work=new Promise(r=>finish=r);const q2=create({run:()=>work,isWanted:id=>env.wanted===id,readLock:()=>null,setTimeout(){throw Error('abandoned run scheduled a timer');}});
  q2.auto('A');env.wanted='B';q2.forgetWaiting('B');finish(busy);await settle();assert.equal(q2.phase('A'),'idle');
});

test('manual and batch cannot silently rerun after the operator receives a locked result; batch cancellation remains final',async()=>{
  const {q,timers}=rig();q.request('A');await settle();assert.equal(q.phase('A'),'failed');assert.equal(timers.size,0);
  const group=q.batch(['B','C'],()=>{});group.cancel();await settle();assert.equal(group.status().cancelled,true);assert.equal(group.status().finished,true);assert.equal(timers.size,0);
});

test('readonly holder uses the acquisition policy but never reclaims a live, partial or stale file',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'score-lock-reader-'));try{
    const a=createAnalysisLock({program:'XLD'}),held=await a.acquire(dir,{task:'fixture',song:'song'});assert.ok(held.ok);
    const reader=createAnalysisLock(),file=reader.file(dir),bytes=await fs.readFile(file);assert.equal((await reader.holder(dir)).program,'XLD');assert.ok(!('token' in await reader.holder(dir)));
    const dead=createAnalysisLock({isAlive:()=>false});assert.equal(await dead.holder(dir),null);assert.deepEqual(await fs.readFile(file),bytes);
    await held.release();assert.equal(await reader.holder(dir),null);await fs.writeFile(file,'{');assert.ok(await reader.holder(dir));
    await fs.unlink(file);await fs.mkdir(file);await assert.rejects(reader.holder(dir),{code:'EISDIR'});
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
