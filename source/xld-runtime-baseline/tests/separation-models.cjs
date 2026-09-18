'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {randomUUID}=require('node:crypto'),vm=require('node:vm'),{createRequire}=require('node:module'),{EventEmitter}=require('node:events');
const core=require('../core/derived-assets.cjs');
async function main(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'xld-separation-'));
 const audio=path.join(root,'source.wav');await fs.writeFile(audio,'source');
 const track={id:'track',title:'fixture',filePath:audio,bridgePath:path.join(root,'music-lab.json')};
 const assets=core.createDerivedAssets({analysisRoot:root});
 const script=require.resolve('../core/analysis-service.cjs'),realRequire=createRequire(script),children=[];
 const python=path.join(root,'python.exe');await fs.writeFile(python,'fixture');
 const sandbox={module:{exports:{}},__dirname:path.dirname(script),process:{...process,env:{...process.env,XLD_AI_PYTHON:python,XLD_ROFORMER_PYTHON:python}},require(name){
  if(name!=='child_process')return realRequire(name);
  return {spawn(_python,args){const child=new EventEmitter();child.args=args;child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdout.setEncoding=child.stderr.setEncoding=()=>{};child.kill=()=>setImmediate(()=>child.emit('close',null));children.push(child);return child;}};
 }};
 vm.runInNewContext(await fs.readFile(script,'utf8'),sandbox);const service=sandbox.module.exports.createService({analysisRoot:root});
 async function stemResult(engine,runId=randomUUID()){
  const profile=core.separationProfile(engine),stat=await fs.stat(audio),stems=[];
  for(const name of ['bass','piano','guitar','drums','vocals','other']){
   const file=`stems/${runId}/${name}.wav`;await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true});await fs.writeFile(path.join(root,file),Buffer.alloc(44100*8));
   stems.push({name,file,sampleRate:44100,channels:2,frames:44100});
  }
  return {schemaVersion:1,kind:'stems',trackId:track.id,runId,engine,model:profile.model,options:profile.options,backend:{checkpointSha256:profile.checkpoint?.sha256,configSha256:profile.config?.sha256},source:{path:audio,size:stat.size,mtimeMs:stat.mtimeMs},stems};
 }
 async function midiResult(engine='guitar-gaps'){
  const source=await assets.midi.source(track,'guitar'),stat=await fs.stat(source.path),runId=randomUUID(),relative=`midi/guitar/${runId}`,profile=core.profileFor(engine);
  await fs.mkdir(path.join(root,relative),{recursive:true});await fs.writeFile(path.join(root,relative,'guitar.mid'),Buffer.from('4d546864000000060000000103c04d54726b0000000400ff2f00','hex'));
  await fs.writeFile(path.join(root,relative,'notes.json'),JSON.stringify({schemaVersion:1,kind:'notes',trackId:track.id,stem:'guitar',sourceRunId:source.runId,timeOrigin:0,duration:1,notes:[]}));
  return {schemaVersion:1,kind:'midi',trackId:track.id,stem:'guitar',runId,sourceRunId:source.runId,source:{path:source.path,size:stat.size,mtimeMs:stat.mtimeMs},engine,model:profile.model,options:profile.options,backend:{checkpointSha256:profile.checkpoint?.sha256},timeOrigin:0,duration:1,noteCount:0,tempoMode:'fixed-timebase',quantized:false,file:relative+'/guitar.mid',notesFile:relative+'/notes.json'};
 }
 async function childAt(count){for(let i=0;i<200&&children.length<count;i++)await new Promise(r=>setTimeout(r,5));assert.equal(children.length,count);return children[count-1];}
 try{
  const legacy=await stemResult('demucs-6s');delete legacy.engine;await fs.writeFile(path.join(root,'stems.json'),JSON.stringify(legacy));
  const oldMidi=await midiResult();await fs.writeFile(path.join(root,'midi/guitar.json'),JSON.stringify(oldMidi));
  const pending=service.run(track,'bs-roformer-sw');assert.equal((await service.run(track,'demucs-6s')).error,'analysis-busy');
  const child=await childAt(1),arg=name=>child.args[child.args.indexOf(name)+1],fresh=await stemResult('bs-roformer-sw',arg('--run-id'));
  await fs.writeFile(arg('--output'),JSON.stringify(fresh));child.emit('close',0);assert((await pending).ok);
  assert.equal((await assets.readStems(track)).runId,fresh.runId);assert.equal((await assets.readStems(track,'demucs-6s')).runId,legacy.runId);
  assert(!(await assets.readMidi(track,'guitar')).ok,'Old-source MIDI must not appear under RoFormer');
  const newMidi=await midiResult();await assets.midi.activate(track,newMidi);
  const alternateMidi=await midiResult('basic-pitch');await assets.midi.activate(track,alternateMidi);
  assert((await service.run(track,'demucs-6s')).cached);assert.equal((await assets.readMidi(track,'guitar')).runId,oldMidi.runId);
  assert((await service.run(track,'bs-roformer-sw')).cached);assert.equal((await assets.readMidi(track,'guitar')).runId,alternateMidi.runId);
  assert.equal((await assets.readMidi(track,'guitar','guitar-gaps')).runId,newMidi.runId);
  assert.equal(children.length,1,'Switching cached models does not launch Python');
  const cancelling=service.run(track,'bs-roformer-sw',{force:true});const cancelledChild=await childAt(2);
  const cancelId=cancelledChild.args[cancelledChild.args.indexOf('--run-id')+1];await stemResult('bs-roformer-sw',cancelId);service.cancel();assert.equal((await cancelling).error,'analysis-cancelled');
  await assert.rejects(fs.stat(path.join(root,'stems',cancelId)),{code:'ENOENT'});assert.equal((await assets.readStems(track)).runId,fresh.runId);
  const failing=service.run(track,'bs-roformer-sw',{force:true});const badChild=await childAt(3);
  const badId=badChild.args[badChild.args.indexOf('--run-id')+1],wrong=await stemResult('demucs-6s',badId);
  await fs.writeFile(badChild.args[badChild.args.indexOf('--output')+1],JSON.stringify(wrong));badChild.emit('close',0);assert(!(await failing).ok);
  assert.equal((await assets.readStems(track)).runId,fresh.runId);assert.equal((await assets.readMidi(track,'guitar')).runId,alternateMidi.runId);
  await assert.rejects(fs.stat(path.join(root,'stems',badId)),{code:'ENOENT'});
  await fs.appendFile(audio,'changed');assert(!(await assets.readStems(track,'demucs-6s')).ok);assert(!(await assets.readStems(track,'bs-roformer-sw')).ok);
  assert.equal(service.task(),null);console.log('separation-models: PASS (legacy migration, independent WAVs, all MIDI variants restored per source, cache reuse, cancellation, wrong-model rejection, stale source)');
 }finally{if(path.dirname(path.resolve(root))===path.resolve(os.tmpdir())&&path.basename(root).startsWith('xld-separation-'))await fs.rm(root,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
