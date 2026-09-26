'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {createMidiAssets,profileFor,defaultEngine}=require('../core/derived-assets.cjs');
const {createMidiDeletion}=require('../core/midi-delete.cjs');
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'xld-midi-delete-')),directory=path.join(root,'album','track'),bin=path.join(root,'bin');await fs.mkdir(directory,{recursive:true});await fs.mkdir(bin);
 const track={id:'delete-test',title:'Deletion fixture'},source={path:path.join(directory,'strings.wav'),runId:crypto.randomUUID(),duration:1,target:'strings',program:48};await fs.writeFile(source.path,'WAV must stay');
 const midi=createMidiAssets({analysisDirectory:()=>directory,readStems:async()=>({ok:false}),readStringSource:async()=>source}),assets={directory:()=>directory,readMidi:midi.read,midi};
 const trashes=[],trash=async p=>{const target=path.join(bin,path.basename(p));await fs.rename(p,target);trashes.push([p,target]);};
 const manager=createMidiDeletion({assets,getRoot:()=>root,trash});
 async function create(engine){const profile=profileFor(engine),runId=crypto.randomUUID(),prefix='midi/strings/'+runId+'/',stat=await fs.stat(source.path);await fs.mkdir(path.join(directory,prefix),{recursive:true});await fs.writeFile(path.join(directory,prefix+'strings.mid'),Buffer.from('4d546864000000060000000103c04d54726b0000000400ff2f00','hex'));await fs.writeFile(path.join(directory,prefix+'notes.json'),JSON.stringify({schemaVersion:1,kind:'notes',trackId:track.id,stem:'strings',sourceRunId:source.runId,timeOrigin:0,duration:1,notes:[{start:0,end:.5,pitch:60,velocity:100}]}));const result={schemaVersion:1,kind:'midi',trackId:track.id,stem:'strings',sourceRunId:source.runId,runId,source:{path:source.path,size:stat.size,mtimeMs:stat.mtimeMs},sourceTarget:'strings',program:48,engine,model:profile.model,options:profile.options,backend:profile.checkpoint?{checkpointSha256:profile.checkpoint.sha256}:{},timeOrigin:0,duration:1,noteCount:1,tempoMode:'fixed-timebase',quantized:false,file:prefix+'strings.mid',notesFile:prefix+'notes.json'};await midi.activate(track,result);return result;}
 const selection=r=>({stem:r.stem,engine:r.engine,runId:r.runId});
 try{
  assert.equal(defaultEngine('strings'),'strings-muscriptor-large');assert.equal(defaultEngine('piano'),'piano-transkun');
  const your=await create('strings-muscriptor-large'),basic=await create('basic-pitch'),input=selection(basic);
  assert((await manager.clear(track,input,async()=>false)).canceled);assert((await midi.read(track,'strings','basic-pitch')).ok);assert.equal(trashes.length,0);
  // The traversal guard now fires inside runRecordPath's validId, before any path is joined, so a malformed
  // runId reads as an invalid selection rather than as a changed one.
  await assert.rejects(manager.plan(track,{...input,runId:'../outside'}),/midi-delete-invalid/);
  const extra=path.join(directory,path.dirname(basic.file),'user.txt');await fs.writeFile(extra,'keep');await assert.rejects(manager.clear(track,input,async()=>true),/unknown-files/);await fs.rm(extra);
  await assert.rejects(manager.clear(track,input,async()=>{await fs.appendFile(path.join(directory,basic.notesFile),' ');return true;}),/changed/);assert.equal(trashes.length,0);
  const fail=createMidiDeletion({assets,getRoot:()=>root,trash:async()=>{throw Error('Recycle Bin failure');}});await assert.rejects(fail.clear(track,input,async()=>true),/Recycle Bin failure/);assert((await midi.read(track,'strings','basic-pitch')).ok);
  const result=await manager.clear(track,input,async plan=>{assert.equal(plan.fallback.engine,'strings-muscriptor-large');return true;});assert.equal(result.activated,'strings-muscriptor-large');assert(!(await midi.read(track,'strings','basic-pitch')).ok);assert.equal((await midi.read(track,'strings')).runId,your.runId);assert.equal(await fs.readFile(source.path,'utf8'),'WAV must stay');
  await fs.rename(trashes[0][1],trashes[0][0]);assert((await midi.read(track,'strings','basic-pitch')).ok,'Recycle Bin folder restoration restores cache');
  const inactive=await manager.clear(track,input,async()=>true);assert.equal(inactive.activated,null);assert.equal((await midi.read(track,'strings')).runId,your.runId);
  const old=source.runId;await assert.rejects(manager.clear(track,selection(your),async()=>{source.runId=crypto.randomUUID();return true;}),/changed/);source.runId=old;
  const empty=await manager.clear(track,selection(your),async()=>true);assert.equal(empty.activated,null);assert(!(await midi.read(track,'strings')).ok);
  // Replace a generated folder with a junction: the guarded path must reject it.
  const linked=await create('basic-pitch'),runDir=path.dirname(path.join(directory,linked.file)),outside=path.join(root,'outside');await fs.rename(runDir,outside);await fs.symlink(outside,runDir,'junction');await assert.rejects(manager.plan(track,selection(linked)),/link-rejected/);await fs.unlink(runDir);assert((await fs.stat(path.join(outside,'strings.mid'))).isFile());
  // An earlier model version of the same engine survives deleting the current run, and the shared WAV stays.
  const kept=await create('strings-muscriptor-large');
  const earlierId=crypto.randomUUID(),earlierPrefix='midi/strings/'+earlierId+'/';await fs.mkdir(path.join(directory,earlierPrefix),{recursive:true});
  await fs.writeFile(path.join(directory,earlierPrefix+'strings.mid'),Buffer.from('4d546864000000060000000103c04d54726b0000000400ff2f00','hex'));
  await fs.writeFile(path.join(directory,earlierPrefix+'notes.json'),JSON.stringify({schemaVersion:1,kind:'notes',trackId:track.id,stem:'strings',sourceRunId:source.runId,timeOrigin:0,duration:1,notes:[{start:0,end:.5,pitch:60,velocity:100}]}));
  const earlier={...kept,runId:earlierId,backend:{checkpointSha256:'f'.repeat(64)},file:earlierPrefix+'strings.mid',notesFile:earlierPrefix+'notes.json'};
  await fs.mkdir(path.join(directory,'midi/strings/runs'),{recursive:true});await fs.writeFile(path.join(directory,'midi/strings/runs',earlierId+'.json'),JSON.stringify(earlier));
  assert.equal((await midi.read(track,'strings','strings-muscriptor-large')).runId,kept.runId,'the current version wins over an earlier one');
  const versions=async()=>(await midi.listRuns(track,'strings','strings-muscriptor-large')).filter(r=>r.status!=='files-missing').map(r=>[r.runId,r.status]).sort();
  assert.deepEqual(await versions(),[[kept.runId,'current'],[earlierId,'superseded']].sort());
  // Deleting the active run now rolls the stem back to the surviving earlier version of the same engine instead
  // of leaving it silent. Before runs had addresses the successor search could only reach another engine.
  const removed=await manager.clear(track,selection(kept),async plan=>{assert.equal(plan.fallbackSameEngine,true);assert.equal(plan.fallback.runId,earlierId);return true;});
  assert(removed.deleted);assert.equal(removed.activated,'strings-muscriptor-large');assert.equal(removed.displacedRunId,earlierId);
  assert.equal((await midi.read(track,'strings')).runId,earlierId,'the stem rolls back rather than going silent');
  assert((await fs.stat(path.join(directory,earlier.file))).isFile());assert((await fs.stat(path.join(directory,'midi/strings/runs',earlierId+'.json'))).isFile());assert.equal(await fs.readFile(source.path,'utf8'),'WAV must stay');
  assert.deepEqual(await versions(),[[earlierId,'superseded']],'deleting the current run leaves the earlier version intact');
  console.log('MIDI deletion PASS: defaults, cancel, specific model/source, fallback, recycle restore, unknown files, stale content/source, trash failure, last result, junction guard, earlier version survival and same-engine rollback');
 }finally{await fs.rm(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
