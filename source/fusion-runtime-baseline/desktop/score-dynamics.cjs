'use strict';
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const {notesRoot}=require('./score-notes.cjs');
const VERSION='xml-relative-energy/1';
const rootFor=(appData,userData)=>path.join(path.dirname(notesRoot(appData,userData)),'Score Dynamics');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const dataHash=notes=>hash(JSON.stringify(notes));
const validId=id=>typeof id==='string'&&/^[a-z0-9_-]{1,80}$/i.test(id);
const busy=t=>t&&['preparing','running','cancelling'].includes(t.status);
async function hashFile(file,signal){const value=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file,{signal}))value.update(chunk);return value.digest('hex');}
function applyOverlay(stems,cache){
 const result={...stems},applied=[];
 for(const [stem,part]of Object.entries(cache?.stems||{})){
  const entry=stems[stem],values=part?.velocities;
  if(!entry?.notes?.length||dataHash(entry.notes)!==part.originalDataSha||!Array.isArray(values)||values.length!==entry.notes.length||values.some(v=>!Number.isInteger(v)||v<1||v>127))continue;
  const notes=entry.notes.map((n,i)=>({...n,velocity:values[i]})),indices=new Map(entry.notes.map((n,i)=>[n,i]));
  const cloned={...entry,notes};
  if(entry.instruments)cloned.instruments=entry.instruments.map(p=>({...p,notes:p.notes.map(n=>{const i=indices.get(n);return i===undefined?{...n}:notes[i];})}));
  result[stem]=cloned;applied.push(stem);
 }
 return{stems:result,applied};
}
function createService({root,readMidi,profileForResult,python=process.env.XLD_MIDI_PYTHON,spawnProcess=spawn,algorithmPath=path.resolve(__dirname,'../../xld-runtime-baseline/analysis-midi/velocity.py'),runnerPath=path.join(__dirname,'score-dynamics.py'),timeoutMs=600000}){
 if(!path.isAbsolute(root))throw Error('dynamics-root-invalid');
 let current=null,owner=null;
 const snapshot=()=>current?JSON.parse(JSON.stringify(current)):null;
 function update(job,fields){if(owner!==job)return;current={...current,...fields,updatedAt:Date.now()};try{job.notify?.(snapshot());}catch(_){}}
 function safe(...parts){const target=path.resolve(root,...parts),relative=path.relative(root,target);if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('dynamics-path-invalid');return target;}
 async function prepare(track,signal){
  if(!validId(track?.id))throw Error('track-missing');
  const inputs=[],skipped=[];
  for(const stem of ['guitar','strings','drums','bass','piano']){
   signal?.throwIfAborted();const record=await readMidi(track,stem);
   if(!record?.ok){skipped.push({stem,why:record?.error||'midi-missing'});continue;}
   const notesFile=path.join(record.directory,path.basename(record.notesFile)),raw=await fsp.readFile(notesFile),body=JSON.parse(raw);
   const notes=body.notes;if(!Array.isArray(notes)||!notes.length){skipped.push({stem,why:'empty'});continue;}
   if(record.engine==='manual-revision'||new Set(notes.map(n=>n.velocity)).size!==1){skipped.push({stem,why:'original-dynamics'});continue;}
   const profile=profileForResult(record),fallback=stem==='drums'?require('../../xld-runtime-baseline/core/derived-assets.cjs').profileFor('drums-adtof')?.options?.velocityFromStem:null;
   const options=profile?.options?.velocityFromStem||fallback;
   if(!options||!record.source?.path){skipped.push({stem,why:'no-energy-profile'});continue;}
   const midiFile=path.join(record.directory,path.basename(record.file)),audioPath=record.source.path;
   inputs.push({stem,engine:record.engine,runId:record.runId,sourceRunId:record.sourceRunId,notesFile,midiFile,audioPath,options,count:notes.length,dataSha:dataHash(notes),notesSha:hash(raw),midiSha:await hashFile(midiFile,signal),audioSha:await hashFile(audioPath,signal)});
  }
  const algorithmSha=await hashFile(algorithmPath,signal),runnerSha=await hashFile(runnerPath,signal);
  const identity={version:VERSION,trackId:track.id,algorithmSha,runnerSha,inputs};
  return{key:hash(JSON.stringify(identity)),identity,inputs,skipped,algorithmSha};
 }
 function validate(cache,input){
  if(cache?.schemaVersion!==1||cache.kind!=='xml-score-dynamics'||cache.key!==input.key||cache.trackId!==input.identity.trackId||!cache.stems||Object.keys(cache.stems).length!==input.inputs.length)return false;
  return input.inputs.every(item=>{const part=cache.stems[item.stem];return part?.originalDataSha===item.dataSha&&Array.isArray(part.velocities)&&part.velocities.length===item.count&&part.velocities.every(v=>Number.isInteger(v)&&v>=1&&v<=127);});
 }
 async function find(input){
  if(!input.inputs.length)return{cache:null,damaged:false};
  const dir=safe(input.identity.trackId,input.key);let names=[];
  try{names=(await fsp.readdir(dir,{withFileTypes:true})).filter(e=>e.isDirectory()&&/^[a-f0-9-]{36}$/.test(e.name)).map(e=>e.name);}catch(e){if(e.code!=='ENOENT')throw e;}
  const valid=[];let damaged=false;
  for(const name of names){try{const run=path.join(dir,name),seal=JSON.parse(await fsp.readFile(path.join(run,'complete.json'),'utf8')),bytes=await fsp.readFile(path.join(run,'result.json'));if(bytes.length>16*1024*1024||hash(bytes)!==seal.sha256)throw Error('cache-invalid');const cache=JSON.parse(bytes);if(!validate(cache,input)||cache.runId!==name)throw Error('cache-invalid');valid.push(cache);}catch(_){damaged=true;}}
  valid.sort((a,b)=>b.createdAt-a.createdAt||b.runId.localeCompare(a.runId));return{cache:valid[0]||null,damaged};
 }
 async function read(track){const input=await prepare(track),found=await find(input);return{...found,key:input.key,eligible:input.inputs.length,skipped:input.skipped,state:found.cache?'ready':input.inputs.length?'missing':'unneeded'};}
 function cancel(){if(!busy(current)||!owner)return{ok:false,error:'dynamics-idle'};update(owner,{status:'cancelling'});owner.abort.abort();owner.child?.kill();return{ok:true,task:snapshot()};}
 function execute(job,input,requestFile,outputFile){return new Promise((resolve,reject)=>{
  job.abort.signal.throwIfAborted();if(!python)throw Error('dynamics-python-missing');
  const child=spawnProcess(python,['-B','-X','utf8',runnerPath,requestFile,outputFile],{windowsHide:true,env:{...process.env,PYTHONUTF8:'1',PYTHONDONTWRITEBYTECODE:'1'}});job.child=child;
  let buffer='',stderr='';const timeout=setTimeout(()=>{job.timedOut=true;child.kill();},timeoutMs);
  child.stderr.on('data',v=>{stderr=(stderr+v).slice(-8000);});
  child.stdout.on('data',v=>{buffer+=v;if(buffer.length>65536)buffer=buffer.slice(-65536);let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);try{const p=JSON.parse(line);if(p.total===input.inputs.length&&Number.isInteger(p.completed)&&p.completed>=current.completed&&p.completed<=p.total)update(job,{completed:p.completed,total:p.total,stem:String(p.stem||'')});}catch(_){}}});
  child.once('error',e=>{clearTimeout(timeout);reject(e);});child.once('close',code=>{clearTimeout(timeout);job.child=null;if(job.abort.signal.aborted)return reject(Error('dynamics-canceled'));if(job.timedOut)return reject(Error('dynamics-timeout'));if(code!==0)return reject(Error(stderr.trim()||'dynamics-process-failed'));resolve();});
 });}
 async function perform(job,track,force){let stage,terminal;
  try{
   const input=await prepare(track,job.abort.signal);job.abort.signal.throwIfAborted();
   if(!input.inputs.length){terminal={status:'unneeded',eligible:0,total:0};return;}
   const found=await find(input);if(!force&&found.cache){terminal={status:'cached',runId:found.cache.runId,key:input.key,completed:input.inputs.length,total:input.inputs.length};return;}
   stage=safe('.pending',job.id);await fsp.mkdir(stage,{recursive:true});
   const requestFile=path.join(stage,'request.json'),outputFile=path.join(stage,'output.json');
   await fsp.writeFile(requestFile,JSON.stringify({schemaVersion:1,algorithmPath,algorithmSha:input.algorithmSha,inputs:input.inputs}));
   update(job,{status:'running',key:input.key,total:input.inputs.length,completed:0});
   await execute(job,input,requestFile,outputFile);job.abort.signal.throwIfAborted();
   const output=JSON.parse(await fsp.readFile(outputFile,'utf8'));
   const cache={schemaVersion:1,kind:'xml-score-dynamics',version:VERSION,trackId:track.id,key:input.key,runId:job.id,createdAt:Date.now(),identity:input.identity,stems:output.stems};
   if(output.schemaVersion!==1||!validate(cache,input))throw Error('dynamics-output-invalid');
   const after=await prepare(track,job.abort.signal);if(after.key!==input.key)throw Error('dynamics-source-changed');job.abort.signal.throwIfAborted();
   const bytes=JSON.stringify(cache);await fsp.writeFile(path.join(stage,'result.json'),bytes);await fsp.writeFile(path.join(stage,'complete.json'),JSON.stringify({sha256:hash(bytes)}));
   job.abort.signal.throwIfAborted();const target=safe(track.id,input.key,job.id);await fsp.mkdir(path.dirname(target),{recursive:true});job.abort.signal.throwIfAborted();
   // No cancellation is accepted during this atomic publication; a new immutable run is the result.
   job.publishing=true;await fsp.rename(stage,target);stage=null;
   terminal={status:'complete',runId:job.id,completed:input.inputs.length,total:input.inputs.length};
  }catch(e){terminal={status:job.abort.signal.aborted?'canceled':'failed',error:String(e.message||e)};}
  finally{
   const settled={...current,...terminal,updatedAt:Date.now()};
   if(stage)await fsp.writeFile(path.join(stage,'status.json'),JSON.stringify(settled)).catch(()=>{});
   // Terminal notifications mean the lock is released, so an immediate retry is valid.
   if(owner===job){current=settled;owner=null;try{job.notify?.(snapshot());}catch(_){}}
  }
 }
 function start(track,{force=false}={},notify){if(busy(current)||owner)return{ok:false,error:'dynamics-busy'};if(!validId(track?.id))return{ok:false,error:'track-missing'};const job={id:crypto.randomUUID(),abort:new AbortController(),notify,publishing:false};owner=job;current={id:job.id,trackId:track.id,title:track.title||'',status:'preparing',completed:0,total:null,startedAt:Date.now()};try{notify?.(snapshot());}catch(_){}job.done=perform(job,track,force);return{ok:true,task:snapshot()};}
 return{read,start,task:snapshot,isBusy:()=>busy(current)||Boolean(owner),cancel:()=>owner?.publishing?{ok:false,error:'dynamics-finishing'}:cancel(),shutdown:()=>{if(owner&&!owner.publishing)cancel();},wait:()=>owner?.done||Promise.resolve(),applyOverlay};
}
module.exports={createService,rootFor,applyOverlay,dataHash,VERSION};
