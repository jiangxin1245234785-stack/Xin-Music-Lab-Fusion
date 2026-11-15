'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createMidiAssets,profileFor,defaultEngine,identityOf}=require('../core/derived-assets.cjs');
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'xld-muscriptor-upgrade-'));
 const track={id:'upgrade-test'},sourceRunId=crypto.randomUUID(),sourceFile=path.join(root,'strings.wav');
 await fs.writeFile(sourceFile,'unchanged audio');const stat=await fs.stat(sourceFile);
 const source={path:sourceFile,runId:sourceRunId,duration:1,target:'strings',program:48};
 const assets=createMidiAssets({analysisDirectory:()=>root,readStems:async()=>({ok:false}),readStringSource:async()=>source});
 const profile=profileFor('strings-muscriptor-large'),raw=profileFor('strings-muscriptor-large-raw');
 assert.equal(defaultEngine('strings'),profile.id);assert.equal(profile.options.gapFillMs,50);assert.equal(raw.options.gapFillMs,0);
 assert.notEqual(identityOf(profile),identityOf(raw));
 async function record(legacy=false){
  const runId=crypto.randomUUID(),base=`midi/strings/${runId}/`;
  await fs.mkdir(path.join(root,base),{recursive:true});
  await fs.writeFile(path.join(root,base,'strings.mid'),Buffer.from('4d546864000000060000000103c04d54726b0000000400ff2f00','hex'));
  await fs.writeFile(path.join(root,base,'notes.json'),JSON.stringify({schemaVersion:1,kind:'notes',trackId:track.id,stem:'strings',runId,sourceRunId,timeOrigin:0,duration:1,notes:[]}));
  const options=structuredClone(profile.options);
  if(legacy){for(const key of ['gapFillMs','codeDirectory','checkpointDevice'])delete options[key];options.codeRevision='7f213afecf23bd6a1b8672aa223690ee9807cefb';options.adapterVersion=2;}
  return {schemaVersion:1,kind:'midi',trackId:track.id,stem:'strings',runId,sourceRunId,
   source:{path:sourceFile,size:stat.size,mtimeMs:stat.mtimeMs},engine:profile.id,
   model:legacy?'muscriptor-large-8809fdfb-no-prelude-v1-strings-v1-fp16':profile.model,
   backend:{checkpointSha256:profile.checkpoint.sha256},options,timeOrigin:0,duration:1,noteCount:0,
   tempoMode:'fixed-timebase',quantized:false,file:base+'strings.mid',notesFile:base+'notes.json',sourceTarget:'strings',program:48};
 }
 try{
  const old=await record(true);await assets.activate(track,old);await assets.keepRun(track,'strings',old.runId,true);
  const previous=await assets.read(track,'strings');assert(previous.ok&&!previous.matches);
  await assert.rejects(assets.validate(old,track,'strings'),/midi-invalid/);
  const next=await record();await assets.validate(next,track,'strings');await assets.activate(track,next);
  const current=await assets.read(track,'strings');assert(current.ok&&current.matches);assert.equal(current.runId,next.runId);
  const rows=await assets.listRuns(track,'strings');assert.equal(rows.length,2);assert(rows.some(r=>r.runId===old.runId&&r.kept));
  const restored=await assets.activateRun(track,'strings',old.runId);assert(restored.ok&&!restored.matches);assert.equal(restored.runId,old.runId);
  assert.equal((await assets.readRun(track,'strings',old.runId)).status,'superseded');
  assert.equal((await assets.readRun(track,'strings',next.runId)).status,'current');
  console.log('PASS: strings 50 ms default/raw identities, legacy cache invalidation without damage, old-version activation and kept history');
 }finally{await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
