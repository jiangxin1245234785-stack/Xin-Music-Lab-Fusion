'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createMidiAssets,profileFor,defaultEngine,identityOf}=require('../core/derived-assets.cjs');
const {createMidiExport}=require('../core/midi-export.cjs'),{createMidiDeletion}=require('../core/midi-delete.cjs');
const {createMidiRetention}=require('../core/midi-retention.cjs');
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'xld-tempo-'));
 assert.equal(path.dirname(root),path.resolve(os.tmpdir()));
 const directory=path.join(root,'analysis');await fs.mkdir(directory);
 const audio=path.join(root,'source.wav');await fs.writeFile(audio,'source');const stat=await fs.stat(audio);
 const track={id:'tempo-test',title:'tempo 曲目'},runId=crypto.randomUUID(),sourceRunId=crypto.randomUUID(),stem='strings',engine='strings-muscriptor-large-v04';
 const source={path:audio,runId:sourceRunId,duration:1,target:'strings',program:48};
 const midi=createMidiAssets({analysisDirectory:()=>directory,readStems:async()=>({ok:false}),readStringSource:async()=>source});
 const assets={directory:()=>directory,readMidi:midi.read,midi};
 const prefix=`midi/strings/${runId}/`,profile=profileFor(engine);assert(profile);
 assert.equal(defaultEngine('strings'),'strings-muscriptor-large');
 const bytes=Buffer.from('4d546864000000060000000103c04d54726b0000000400ff2f00','hex');
 const notes={schemaVersion:1,kind:'notes',trackId:track.id,stem,runId,sourceRunId,timeOrigin:0,duration:1,notes:[]};
 const runDir=path.join(directory,prefix);await fs.mkdir(runDir,{recursive:true});
 await fs.writeFile(path.join(runDir,'strings.mid'),bytes);await fs.writeFile(path.join(runDir,'strings.tempo.mid'),bytes);
 await fs.writeFile(path.join(runDir,'notes.json'),JSON.stringify(notes));
 const result={schemaVersion:1,kind:'midi',trackId:track.id,stem,runId,sourceRunId,
  source:{path:audio,size:stat.size,mtimeMs:stat.mtimeMs},engine,model:profile.model,backend:{checkpointSha256:profile.checkpoint.sha256},
  options:profile.options,timeOrigin:0,duration:1,noteCount:0,tempoMode:'fixed-timebase',quantized:false,
  sourceTarget:'strings',program:48,file:prefix+'strings.mid',notesFile:prefix+'notes.json',tempoFile:prefix+'strings.tempo.mid',
  digests:{tempoMidi:crypto.createHash('sha256').update(bytes).digest('hex')}};
 try{
  await midi.activate(track,result);assert((await midi.read(track,stem)).ok);
  const exporter=createMidiExport({assets,protectedRoots:()=>[directory]});
  const prepared=await exporter.prepare(track,{stem,runId,variant:'performance'});assert(prepared.ok);assert(prepared.bytes.equals(bytes));
  assert(prepared.filename.endsWith(' - tempo.mid'));
  assert.equal((await exporter.write(prepared,path.join(runDir,'overwrite.mid'))).error,'export-protected');
  await fs.mkdir(path.join(root,'exports'));assert((await exporter.write(prepared,path.join(root,'exports/变速.mid'))).ok);
  assert.equal((await exporter.prepare(track,{stem,runId,variant:'invalid'})).ok,false);
  await assert.rejects(midi.verify({...result,tempoFile:'../outside.mid'},track,stem),/midi-invalid-path/);
  await fs.writeFile(path.join(runDir,'strings.tempo.mid'),'corrupt');assert(!(await midi.read(track,stem)).ok);
  await fs.writeFile(path.join(runDir,'strings.tempo.mid'),bytes);
  const deletion=createMidiDeletion({assets,getRoot:()=>directory,trash:async target=>{assert(target.startsWith(directory+path.sep));await fs.rename(target,path.join(root,'trash'));}});
  const selection={stem,runId,engine};assert((await deletion.plan(track,selection)).runId===runId);
  await fs.writeFile(path.join(runDir,'user-file.txt'),'protect');await assert.rejects(deletion.plan(track,selection),/unknown-files/);
  await fs.unlink(path.join(runDir,'user-file.txt'));assert((await deletion.clear(track,selection,async()=>true)).deleted);
  const history=[];
  for(let i=0;i<4;i++){
   const id=crypto.randomUUID(),base=`midi/${stem}/${id}/`,folder=path.join(directory,base);
   await fs.mkdir(folder,{recursive:true});
   for(const file of ['strings.mid','strings.tempo.mid'])await fs.writeFile(path.join(folder,file),bytes);
   await fs.writeFile(path.join(folder,'notes.json'),JSON.stringify({...notes,runId:id}));
   const record={...result,runId:id,file:base+'strings.mid',notesFile:base+'notes.json',tempoFile:base+'strings.tempo.mid',
    backend:{checkpointSha256:String(i+1).repeat(64)},createdAt:`2026-10-26T00:00:0${i}.000Z`};
   await midi.activate(track,record);history.push(record);
  }
  await fs.writeFile(path.join(directory,path.dirname(history[0].file),'user-file.txt'),'protect');
  const swept=await createMidiRetention({assets,getRoot:()=>directory,trash:async folder=>{
   assert.equal(path.dirname(folder),path.join(directory,'midi',stem));
   await fs.rename(folder,path.join(root,'trash-'+path.basename(folder)));
  }}).sweep(track,stem,engine,{activeIdentity:identityOf(history[3])});
  assert.deepEqual(swept.trashed,[history[1].runId]);
  assert(swept.skipped.some(row=>row.runId===history[0].runId&&row.reason==='midi-retention-unknown-files'));
  assert((await midi.read(track,stem)).runId===history[3].runId);
  assert((await midi.readRun(track,stem,history[2].runId)).ok);
  assert.equal((await fs.readFile(path.join(directory,path.dirname(history[0].file),'user-file.txt'),'utf8')),'protect');
  assert((await fs.readFile(audio,'utf8'))==='source');
  console.log('PASS: optional tempo MIDI read/digest, exact export, protected destinations, path rejection, safe deletion/retention and source/default preservation');
 }finally{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));await fs.rm(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
