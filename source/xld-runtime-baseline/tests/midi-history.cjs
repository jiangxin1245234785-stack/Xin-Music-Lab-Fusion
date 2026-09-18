'use strict';
// Model-version history: an earlier version of an engine stays readable and bound to its WAV, but is never a cache hit
// for the current version, never gets orphaned by a new run, and merge/storage keep seeing it.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {createDerivedAssets,trackDirectory,profileFor,identityOf,engineOf,PROFILES,MODEL}=require('../core/derived-assets.cjs');
const {createStorage}=require('../core/storage.cjs');
const {createMidiMerge}=require('../core/midi-merge.cjs');
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const HEADER=Buffer.from('4d546864000000060000000103c04d54726b0000000400ff2f00','hex');
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'xld-midi-history-'));
 try{
  // A version bump edits the models.json entry in place, so every profile needs its own model string and identity.
  assert.equal(new Set(PROFILES.map(p=>p.model)).size,PROFILES.length,'model strings are unique');
  assert.equal(new Set(PROFILES.map(identityOf)).size,PROFILES.length,'profile identities are unique');
  assert.equal(engineOf({model:MODEL}),'basic-pitch','engine-less legacy records resolve by model string');
  const audio=path.join(root,'song.wav');await fs.writeFile(audio,'source');const stat=await fs.stat(audio);
  const track={id:'history-track-1234567890',title:'Song',artist:'Artist',album:'Album',number:1,filePath:audio};
  const dir=trackDirectory(track,root),stemRunId=crypto.randomUUID();
  const stems={schemaVersion:1,kind:'stems',trackId:track.id,runId:stemRunId,model:'htdemucs_6s',options:{shifts:1,overlap:0.25},source:{path:audio,size:stat.size,mtimeMs:stat.mtimeMs},stems:[]};
  for(const name of ['bass','piano','guitar','drums','vocals','other']){const file=`stems/${stemRunId}/${name}.wav`;await fs.mkdir(path.dirname(path.join(dir,file)),{recursive:true});await fs.writeFile(path.join(dir,file),Buffer.alloc(44100*8));stems.stems.push({name,file,sampleRate:44100,channels:2,frames:44100});}
  await fs.writeFile(path.join(dir,'stems.json'),JSON.stringify(stems));
  const assets=createDerivedAssets({analysisRoot:root}),midi=assets.midi;
  const write=async(relative,value)=>{await fs.mkdir(path.dirname(path.join(dir,relative)),{recursive:true});await fs.writeFile(path.join(dir,relative),typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value));};
  // A stored run: its files plus the manifest object, without touching any pointer.
  async function run(stem,engine,{notes=[{start:0,end:.5,pitch:60,velocity:100}],digests=false,sourceRunId=stemRunId,...tweak}={}){
   const profile=profileFor(engine),runId=crypto.randomUUID(),prefix=`midi/${stem}/${runId}/`,wav=await fs.stat(path.join(dir,`stems/${stemRunId}/${stem}.wav`));
   const notesText=JSON.stringify({schemaVersion:1,kind:'notes',trackId:track.id,stem,sourceRunId,runId,engine,model:profile.model,timeOrigin:0,duration:1,notes});
   await write(prefix+stem+'.mid',HEADER);await write(prefix+'notes.json',notesText);
   const record={schemaVersion:1,kind:'midi',trackId:track.id,stem,runId,sourceRunId,source:{path:path.join(dir,`stems/${stemRunId}/${stem}.wav`),size:wav.size,mtimeMs:wav.mtimeMs},engine,model:profile.model,options:profile.options,backend:{checkpointSha256:profile.checkpoint?.sha256},timeOrigin:0,duration:1,noteCount:notes.length,tempoMode:'fixed-timebase',quantized:false,file:prefix+stem+'.mid',notesFile:prefix+'notes.json'};
   if(digests)record.digests={midi:hash(HEADER),notes:hash(Buffer.from(notesText,'utf8'))};
   return {...record,...tweak};
  }
  const pointer=(stem,engine)=>`midi/${stem}/${engine}.json`,active=stem=>`midi/${stem}.json`,recordOf=r=>path.join(dir,'midi',r.stem,'runs',r.runId+'.json');
  const runs=(stem,engine)=>midi.listRuns(track,stem,engine);
  // 1. Records written before this version: engine pointer only, flat active pointer without `engine`, stray stored keys.
  const bass=await run('bass','bass-highres');await write(pointer('bass','bass-highres'),bass);await write(active('bass'),bass);
  let read=await midi.read(track,'bass','bass-highres');assert(read.ok&&read.matches===true);assert.equal(read.identity,identityOf(profileFor('bass-highres')));
  assert.equal((await midi.read(track,'bass')).runId,bass.runId);
  const guitar=await run('guitar','basic-pitch');delete guitar.engine;await write(active('guitar'),{...guitar,ok:true,directory:'stale-directory'});
  read=await midi.read(track,'guitar','basic-pitch');assert(read.ok&&read.matches===true,'legacy basic-pitch record without engine reads via the flat pointer');
  assert.equal(read.directory,path.join(dir,'midi','guitar',guitar.runId),'stray stored keys never leak into the reader result');
  assert.deepEqual((await runs('guitar')).map(r=>r.status),['current']);
  // 2. Same engine, earlier model version: readable and bound to the current WAV, but not the current version.
  const foreign='f'.repeat(64),pianoOptions=profileFor('piano-highres').options,[driftKey,driftValue]=Object.entries(pianoOptions)[0];
  const earlier=await run('piano','piano-highres',{backend:{checkpointSha256:foreign}});await write(pointer('piano','piano-highres'),earlier);await write(active('piano'),earlier);
  read=await midi.read(track,'piano','piano-highres');assert.equal(read.ok,true);assert.equal(read.matches,false);assert.notEqual(read.identity,identityOf(profileFor('piano-highres')));
  assert.equal((await midi.read(track,'piano')).matches,false,'the active pointer stays readable for XML after a version change');
  await assert.rejects(midi.validate(earlier,track,'piano'),/midi-model-invalid/,'strict validation keeps the legacy code for checkpoint drift');
  const drifted=await run('piano','piano-highres',{options:{...pianoOptions,[driftKey]:typeof driftValue==='number'?driftValue+1:'changed'}});
  await assert.rejects(midi.validate(drifted,track,'piano'),/midi-invalid/,'strict validation keeps the legacy code for option drift');assert.equal((await midi.verify(drifted,track,'piano')).matches,false);
  const renamed=await run('piano','piano-highres',{model:'piano-highres-next'});assert.equal((await midi.verify(renamed,track,'piano')).matches,false);await assert.rejects(midi.validate(renamed,track,'piano'),/midi-model-invalid/);
  await assert.rejects(midi.verify(earlier,track,'piano',{engine:'bass-highres'}),/midi-invalid/);
  assert.deepEqual((await runs('piano')).map(r=>r.status),['superseded']);
  // 3. Activating the current version keeps the earlier run and its record; pointers move to the new run.
  const current=await run('piano','piano-highres',{digests:true});await midi.activate(track,current);
  assert((await fs.stat(recordOf(current))).isFile());assert((await fs.stat(recordOf(earlier))).isFile(),'a displaced pointer is preserved as a per-run record');
  assert((await fs.stat(path.join(dir,earlier.file))).isFile());
  read=await midi.read(track,'piano','piano-highres');assert.equal(read.runId,current.runId);assert.equal(read.matches,true);assert.equal((await midi.read(track,'piano')).runId,current.runId);
  let inventory=await runs('piano');assert.deepEqual(inventory.map(r=>[r.runId,r.status]).sort(),[[current.runId,'current'],[earlier.runId,'superseded']].sort());
  const pointed=inventory.find(r=>r.runId===current.runId).pointed;assert(pointed.includes('active')&&pointed.includes('piano-highres'));assert.deepEqual(inventory.find(r=>r.runId===earlier.runId).pointed,[]);
  assert((await assets.readMidiDirectory(track)).ok);
  const storage=createStorage({getRoot:()=>root}),row=async()=>(await storage.scan()).rows.find(r=>r.runId===stemRunId);
  assert.equal((await row()).dependencyCount,4,'earlier and current runs both protect the shared WAV');
  // 4. Deleting the current run leaves the earlier run and the WAV intact; activating it again needs no rerun.
  await midi.removeRun(dir,'piano',current.runId);
  await assert.rejects(fs.stat(recordOf(current)),{code:'ENOENT'});assert((await fs.stat(recordOf(earlier))).isFile());assert((await fs.stat(path.join(dir,earlier.file))).isFile());
  assert.equal((await midi.read(track,'piano','piano-highres')).error,'midi-missing','dangling pointers read as missing, as before');
  inventory=await runs('piano');assert.equal(inventory.find(r=>r.runId===current.runId).status,'files-missing');assert.equal(inventory.find(r=>r.runId===earlier.runId).status,'superseded');
  assert.equal((await row()).dependencyCount,3);assert.equal(await fs.readFile(audio,'utf8'),'source');
  await midi.activate(track,earlier);read=await midi.read(track,'piano');assert.equal(read.runId,earlier.runId);assert.equal(read.matches,false);
  // 5. Digests catch a damaged file; records without digests keep today's structural checks.
  const signed=await run('guitar','muscriptor-medium',{digests:true});await write(pointer('guitar','muscriptor-medium'),signed);
  assert((await midi.read(track,'guitar','muscriptor-medium')).ok);
  await fs.appendFile(path.join(dir,signed.file),Buffer.from([0]));assert.equal((await midi.read(track,'guitar','muscriptor-medium')).ok,false);await assert.rejects(midi.verify(signed,track,'guitar'),/midi-incomplete/);
  await fs.writeFile(path.join(dir,signed.file),HEADER);assert((await midi.read(track,'guitar','muscriptor-medium')).ok);
  await write(signed.notesFile,JSON.stringify({...JSON.parse(await fs.readFile(path.join(dir,signed.notesFile),'utf8')),runId:crypto.randomUUID()}));
  assert.equal((await midi.read(track,'guitar','muscriptor-medium')).ok,false);await assert.rejects(midi.verify(signed,track,'guitar'),/midi-notes-invalid/);
  // 6. The inventory reports damaged and stale records without hiding the others.
  const stale=await run('drums','drums-adtof',{sourceRunId:crypto.randomUUID()});await write(pointer('drums','drums-adtof'),stale);
  const broken=await run('drums','drums-muscriptor-medium');await fs.writeFile(path.join(dir,broken.file),'not midi');await write(pointer('drums','drums-muscriptor-medium'),broken);
  await write(pointer('drums','drums-muscriptor-large'),'{not json');
  inventory=await runs('drums');assert.deepEqual(inventory.map(r=>[r.runId,r.status,r.reason]).sort(),[[stale.runId,'source-changed','midi-stale'],[broken.runId,'invalid','midi-incomplete']].sort());
  assert.equal((await midi.read(track,'drums','drums-adtof')).error,'midi-stale');
  // 7. Merge follows the active selection (including an earlier version), skips stale parts, records provenance and keeps the fingerprint.
  const plan=await createMidiMerge({analysisRoot:root}).plan(track);
  assert(plan.ok);assert.deepEqual(plan.parts.map(p=>p.stem),['bass','piano','guitar']);
  assert.deepEqual(Object.keys(plan.parts[0]),['stem','engine','model','runId','sourceRunId','noteCount','path','sha256'],'the hashed part tuple is unchanged');
  assert.equal(plan.fingerprint,hash(JSON.stringify({version:2,trackId:track.id,sourceRunId:stemRunId,parts:plan.parts})));
  const piano=plan.provenance.find(p=>p.stem==='piano');assert.equal(piano.runId,earlier.runId);assert.equal(piano.matches,false);assert.equal(piano.identity,identityOf(earlier));assert.equal(piano.checkpointSha256,foreign);
  assert.equal(plan.provenance.find(p=>p.stem==='bass').matches,true);
  console.log('MIDI history PASS: legacy records, earlier model version readable but not reused, preserved runs, deletion keeps history and WAV, digests, inventory statuses, merge provenance');
 }finally{if(path.dirname(path.resolve(root))===path.resolve(os.tmpdir())&&path.basename(root).startsWith('xld-midi-history-'))await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
