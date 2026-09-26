'use strict';
// Runs addressed by id: reading one, switching to it, pinning it, and the bounded sweep that reclaims the rest.
// The invariant under all of it is that a run no pointer names is a run no reader can reach — so retention can
// never take the active version away, and switching is only ever a pointer rewrite over records already on disk.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {createDerivedAssets,trackDirectory,profileFor,identityOf}=require('../core/derived-assets.cjs');
const {createStorage}=require('../core/storage.cjs');
const {createMidiRetention}=require('../core/midi-retention.cjs');
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const HEADER=Buffer.from('4d546864000000060000000103c04d54726b0000000400ff2f00','hex');
const RECORD_KEYS=['schemaVersion','kind','trackId','stem','runId','sourceRunId','source','engine','model','options','backend','timeOrigin','duration','noteCount','tempoMode','quantized','file','notesFile'].sort();
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'xld-midi-versions-'));
 try{
  const audio=path.join(root,'song.wav');await fs.writeFile(audio,'source');const stat=await fs.stat(audio);
  const track={id:'versions-track-1234567890',title:'Song',artist:'Artist',album:'Album',number:1,filePath:audio};
  const dir=trackDirectory(track,root),stemRunId=crypto.randomUUID();
  const stems={schemaVersion:1,kind:'stems',trackId:track.id,runId:stemRunId,model:'htdemucs_6s',options:{shifts:1,overlap:0.25},source:{path:audio,size:stat.size,mtimeMs:stat.mtimeMs},stems:[]};
  for(const name of ['bass','piano','guitar','drums','vocals','other']){const file=`stems/${stemRunId}/${name}.wav`;await fs.mkdir(path.dirname(path.join(dir,file)),{recursive:true});await fs.writeFile(path.join(dir,file),Buffer.alloc(44100*8));stems.stems.push({name,file,sampleRate:44100,channels:2,frames:44100});}
  await fs.writeFile(path.join(dir,'stems.json'),JSON.stringify(stems));
  const assets=createDerivedAssets({analysisRoot:root}),midi=assets.midi;
  const write=async(relative,value)=>{await fs.mkdir(path.dirname(path.join(dir,relative)),{recursive:true});await fs.writeFile(path.join(dir,relative),typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value));};
  // A stored run: its two files plus the record object. Nothing here writes a pointer.
  let clock=0;
  async function make(stem,engine,{notes=1,...tweak}={}) {
   const profile=profileFor(engine),runId=crypto.randomUUID(),prefix=`midi/${stem}/${runId}/`,wav=await fs.stat(path.join(dir,`stems/${stemRunId}/${stem}.wav`));
   const noteList=Array.from({length:notes},(_,i)=>({start:i*0.1,end:i*0.1+0.05,pitch:60+i,velocity:100}));
   const notesText=JSON.stringify({schemaVersion:1,kind:'notes',trackId:track.id,stem,sourceRunId:stemRunId,runId,engine,model:profile.model,timeOrigin:0,duration:1,notes:noteList});
   await write(prefix+stem+'.mid',HEADER);await write(prefix+'notes.json',notesText);
   const record={schemaVersion:1,kind:'midi',trackId:track.id,stem,runId,sourceRunId:stemRunId,source:{path:path.join(dir,`stems/${stemRunId}/${stem}.wav`),size:wav.size,mtimeMs:wav.mtimeMs},
    engine,model:profile.model,options:profile.options,backend:{checkpointSha256:profile.checkpoint?.sha256},timeOrigin:0,duration:1,noteCount:noteList.length,
    tempoMode:'fixed-timebase',quantized:false,file:prefix+stem+'.mid',notesFile:prefix+'notes.json',createdAt:new Date(Date.UTC(2026,8,19,0,0,clock++)).toISOString()};
   return {...record,...tweak};
  }
  const recordPath=r=>path.join(dir,'midi',r.stem,'runs',r.runId+'.json');
  const exists=async file=>fs.stat(file).then(()=>true,()=>false);
  const rows=async(stem,engine)=>midi.listRuns(track,stem,engine);
  const foreign='f'.repeat(64);

  // --- readRun -------------------------------------------------------------------------------------------------
  const current=await make('bass','bass-highres');await write(recordPath(current).slice(dir.length+1),current);
  // An earlier version of the same engine: a different checkpoint digest is a different identity.
  const older=await make('bass','bass-highres',{backend:{checkpointSha256:foreign}});await write(recordPath(older).slice(dir.length+1),older);
  await midi.activate(track,current);
  let view=await midi.readRun(track,'bass',older.runId);
  assert(view.ok&&view.matches===false&&view.status==='superseded','an earlier version is readable but not current');
  assert.deepEqual(Object.keys(view.run).sort(),Object.keys(older).sort(),'the run is the on-disk record');
  for(const key of ['kept','status','pointed','identity','matches','ok','directory'])assert(!(key in view.run),key+' must not ride into the record');
  assert.deepEqual(view.pointed,[],'nothing points at the earlier version');
  assert.equal(view.kept,false);
  await assert.rejects(midi.readRun(track,'bass','../outside'),/midi-invalid/,'a traversal runId is rejected before any join');
  await assert.rejects(midi.readRun(track,'nope',current.runId),/midi-stem-unsupported/);
  // A record file named A whose body says B would otherwise let a caller act on B while the dialog says A.
  const liar=crypto.randomUUID();await write(`midi/bass/runs/${liar}.json`,{...older,runId:older.runId});
  assert.equal((await midi.readRun(track,'bass',liar)).error,'midi-invalid','a record whose body names another run is refused');
  await fs.rm(path.join(dir,'midi/bass/runs',liar+'.json'));
  assert.equal((await midi.readRun(track,'bass',crypto.randomUUID())).error,'midi-missing');
  assert.equal((await midi.readRun(track,'bass',older.runId,{engine:'basic-pitch'})).error,'midi-invalid','the engine filter holds');

  // Backfill: a run reachable only through a pointer copy gets its own record, but only when asked.
  const pointerOnly=await make('piano','piano-highres');await write('midi/piano/piano-highres.json',pointerOnly);
  assert((await midi.readRun(track,'piano',pointerOnly.runId)).ok,'a pointer-only run is still readable');
  assert(!await exists(recordPath(pointerOnly)),'reading does not materialise a record');
  assert((await midi.readRun(track,'piano',pointerOnly.runId,{backfill:true})).ok);
  assert(await exists(recordPath(pointerOnly)),'backfill writes the record');
  // A run whose payload is gone must never be materialised: storage would then count it as a dependency.
  const ghost=await make('piano','piano-highres');await write('midi/piano/runs/'+ghost.runId+'.json.keepme','x');
  await write(`midi/piano/${'piano-transkun'}.json`,{...ghost,engine:'piano-transkun',model:profileFor('piano-transkun').model,options:profileFor('piano-transkun').options,backend:{checkpointSha256:profileFor('piano-transkun').checkpoint?.sha256}});
  await fs.rm(path.join(dir,path.dirname(ghost.file)),{recursive:true,force:true});
  const gone=await midi.readRun(track,'piano',ghost.runId,{backfill:true});
  assert(!gone.ok&&['midi-missing','midi-incomplete'].includes(gone.error)&&gone.status==='files-missing',JSON.stringify(gone));
  assert(!await exists(recordPath(ghost)),'a files-missing run is never backfilled');
  await fs.rm(path.join(dir,'midi/piano/piano-transkun.json'));

  // --- activateRun ---------------------------------------------------------------------------------------------
  const before=await Promise.all([recordPath(older),path.join(dir,'midi/bass.json'),path.join(dir,'midi/bass/bass-highres.json'),
   path.join(dir,'midi/bass/by-source',stemRunId,'active.json'),path.join(dir,'midi/bass/by-source',stemRunId,'bass-highres.json')].map(async file=>[file,await exists(file)]));
  const switched=await midi.activateRun(track,'bass',older.runId);
  assert(switched.ok&&switched.runId===older.runId&&switched.matches===false,'rolling back needs no rerun');
  assert.equal((await midi.read(track,'bass')).runId,older.runId);
  for(const [file] of before){if(!await exists(file))continue;
   assert.deepEqual(Object.keys(JSON.parse(await fs.readFile(file,'utf8'))).sort(),RECORD_KEYS.concat('createdAt').sort(),'no derived field leaked into '+path.basename(file));}
  assert((await exists(path.join(dir,current.file)))&&(await exists(recordPath(current))),'the version we rolled away from is untouched');
  let listed=await rows('bass','bass-highres');
  assert.deepEqual(listed.map(r=>[r.runId===older.runId,r.active]).sort(),[[false,false],[true,true]].sort(),'active follows the rollback');
  assert.deepEqual(listed.find(r=>r.runId===current.runId).pointed,[],'the displaced run is unreachable by any pointer');
  // `active` is computed like read() rather than read off the flat pointer label: point `midi/bass.json` at a run
  // whose payload is gone (what a delete leaves behind) and read() falls through to the run that still resolves.
  const phantom=await make('bass','bass-highres');await write(recordPath(phantom).slice(dir.length+1),phantom);
  await fs.rm(path.join(dir,path.dirname(phantom.file)),{recursive:true,force:true});
  await write('midi/bass.json',phantom);
  const doctored=await rows('bass','bass-highres');
  assert.deepEqual(doctored.find(r=>r.runId===phantom.runId).pointed,['active'],'the dangling pointer is still there');
  assert.equal(doctored.filter(r=>r.active).map(r=>r.runId).join(),older.runId,'active follows read(), not the flat pointer label');
  await fs.rm(path.join(dir,'midi/bass/runs',phantom.runId+'.json'));
  await midi.activateRun(track,'bass',older.runId);
  // Refusals keep the existing error codes.
  const brokenId=crypto.randomUUID();await write(`midi/guitar/runs/${brokenId}.json`,{schemaVersion:1,kind:'midi',trackId:track.id,stem:'guitar',runId:brokenId,noteCount:0});
  assert.equal((await midi.activateRun(track,'guitar',brokenId)).error,'midi-invalid');
  const stale=await make('guitar','basic-pitch',{sourceRunId:crypto.randomUUID()});await write(recordPath(stale).slice(dir.length+1),stale);
  assert.equal((await midi.activateRun(track,'guitar',stale.runId)).error,'midi-stale');

  // --- keep sidecar --------------------------------------------------------------------------------------------
  const keepFile=midi.keptPath(track,'bass',current.runId);
  assert.equal(path.relative(dir,keepFile).split(path.sep).join('/'),`midi/bass/kept/${current.runId}.json`);
  assert.deepEqual(await midi.keepRun(track,'bass',current.runId,true),{ok:true,runId:current.runId,kept:true});
  assert.equal(JSON.parse(await fs.readFile(keepFile,'utf8')).kind,'midi-keep');
  const marked=await rows('bass','bass-highres');
  assert.deepEqual(marked.map(r=>[r.runId===current.runId,r.kept]).sort(),[[false,false],[true,true]].sort(),'the marker shows up as a field');
  assert.equal(marked.length,listed.length,'and never as a phantom run');
  assert.deepEqual(marked.map(r=>r.pointed.join(',')).sort(),listed.map(r=>r.pointed.join(',')).sort(),'pointers unchanged');
  await assert.rejects(midi.keepRun(track,'bass',crypto.randomUUID(),true),/midi-missing/,'a typo cannot pin nothing');
  // A marker can outlive its run; unpinning must still work or it can never be cleared from the UI.
  const orphanId=crypto.randomUUID();
  await write(`midi/bass/kept/${orphanId}.json`,{schemaVersion:1,kind:'midi-keep',stem:'bass',engine:'bass-highres',runId:orphanId,keptAt:'2026-09-19T00:00:00.000Z'});
  assert((await midi.listKept(track,'bass')).has(orphanId));
  assert.deepEqual(await midi.keepRun(track,'bass',orphanId,false),{ok:true,runId:orphanId,kept:false},'an orphan marker stays clearable');
  assert(!(await midi.listKept(track,'bass')).has(orphanId));
  // A keep marker is not a MIDI dependency of the stems WAV.
  const counts=async()=>(await createStorage({getRoot:()=>root}).scan()).rows.filter(r=>r.kind==='stems').map(r=>r.dependencyCount);
  const withMarker=await counts();await midi.keepRun(track,'bass',current.runId,false);
  assert.deepEqual(await counts(),withMarker,'the marker does not change the dependency count');
  await midi.keepRun(track,'bass',current.runId,true);

  // --- retention -----------------------------------------------------------------------------------------------
  const trashed=[];const sweeper=createMidiRetention({assets,getRoot:()=>root,trash:async directory=>{trashed.push(directory);await fs.rm(directory,{recursive:true,force:true});}});
  // A kept run survives even when it is unpointed and surplus.
  let report=await sweeper.sweep(track,'bass','bass-highres',{activeIdentity:identityOf(older)});
  assert.deepEqual([report.removed,report.trashed],[[],[]],'nothing eligible: one run is active, the other is kept');
  assert(await exists(path.join(dir,current.file)));
  await midi.keepRun(track,'bass',current.runId,false);

  // Three versions of one engine on `drums`: one active, one duplicate of the active identity, one distinct.
  const kickA=await make('drums','drums-adtof-stems');
  const kickB=await make('drums','drums-adtof-stems',{backend:{checkpointSha256:foreign}});
  const kickC=await make('drums','drums-adtof-stems',{backend:{checkpointSha256:'e'.repeat(64)}});
  const kickD=await make('drums','drums-adtof-stems');
  for(const r of [kickA,kickB,kickC,kickD])await write(recordPath(r).slice(dir.length+1),r);
  await midi.activate(track,kickD);
  const drumRows=await rows('drums','drums-adtof-stems');
  assert.equal(drumRows.filter(r=>r.pointed.length).length,1,'exactly one run is pointed at');
  report=await sweeper.sweep(track,'drums','drums-adtof-stems',{activeIdentity:identityOf(kickD),protect:[kickC.runId]});
  // kickA has the same identity as the active kickD and is unreachable → hard removed.
  assert.deepEqual(report.removed,[kickA.runId],'a duplicate of the active version is reclaimed outright');
  assert(!await exists(path.join(dir,kickA.file))&&!await exists(recordPath(kickA)),'and its record goes with it');
  // kickC is protected, so kickB is the only distinct-identity candidate left and becomes the comparison slot.
  assert.deepEqual(report.trashed,[],'one distinct-identity candidate is the slot, not surplus: '+JSON.stringify(report));
  assert((await exists(path.join(dir,kickB.file)))&&(await exists(path.join(dir,kickC.file))));
  // Unprotect kickC and sweep again: it is newer than kickB, so it takes the slot and kickB is the surplus.
  report=await sweeper.sweep(track,'drums','drums-adtof-stems',{activeIdentity:identityOf(kickD)});
  assert.deepEqual(report.trashed,[kickB.runId],'surplus goes to the Recycle Bin, newest survives: '+JSON.stringify(report));
  assert.equal(trashed.length,1);
  assert(await exists(recordPath(kickB)),'the record stays so a restore restores the cache');
  assert.equal((await rows('drums','drums-adtof-stems')).find(r=>r.runId===kickB.runId).status,'files-missing');
  assert.equal((await midi.read(track,'drums')).runId,kickD.runId,'the active run is untouched');
  // The re-check: a pin written between inventory and deletion still counts.
  const kickE=await make('drums','drums-adtof-stems',{backend:{checkpointSha256:'d'.repeat(64)}});await write(recordPath(kickE).slice(dir.length+1),kickE);
  const guard=createMidiRetention({assets,getRoot:()=>root,trash:async()=>{throw Error('the pinned run must not be trashed');}});
  const originalList=assets.midi.listRuns;
  assets.midi.listRuns=async(...args)=>{const value=await originalList(...args);await midi.keepRun(track,'drums',kickC.runId,true);return value;};
  report=await guard.sweep(track,'drums','drums-adtof-stems',{activeIdentity:identityOf(kickD)});
  assets.midi.listRuns=originalList;
  assert.deepEqual(report.skipped.map(s=>s.reason),['kept'],'a pin that lands mid-sweep is honoured: '+JSON.stringify(report));
  assert(await exists(path.join(dir,kickC.file)));
  await midi.keepRun(track,'drums',kickC.runId,false);
  // With no trash callback nothing is deleted; the surplus is reported instead.
  report=await createMidiRetention({assets,getRoot:()=>root}).sweep(track,'drums','drums-adtof-stems',{activeIdentity:identityOf(kickD)});
  assert.deepEqual(report.skipped,[{runId:kickC.runId,reason:'midi-retention-trash-unavailable'}],JSON.stringify(report));
  assert(await exists(path.join(dir,kickC.file)),'and it is still on disk');
  // A source-changed run, an invalid one and a files-missing residue each survive a sweep.
  const survivors=[stale.runId];
  report=await sweeper.sweep(track,'guitar','basic-pitch',{activeIdentity:identityOf(profileFor('basic-pitch'))});
  assert.deepEqual([report.removed,report.trashed],[[],[]],'history that is not current-or-superseded is never auto-recycled');
  for(const runId of survivors)assert(await exists(path.join(dir,'midi/guitar/runs',runId+'.json')));
  // An unreadable directory propagates out of sweep, so the service's wrapper is what contains it.
  const realReaddir=fs.readdir;
  fs.readdir=async(...args)=>{if(String(args[0]).endsWith(path.join('midi','drums','kept'))){const error=Error('EPERM');error.code='EPERM';throw error;}return realReaddir(...args);};
  await assert.rejects(sweeper.sweep(track,'drums','drums-adtof-stems',{activeIdentity:identityOf(kickD)}),/EPERM/);
  fs.readdir=realReaddir;

  console.log('MIDI versions PASS: readRun addressing and guards, backfill, rollback without rerun, keep sidecar, and bounded retention (duplicate, surplus, protections and propagation)');
 }finally{await fs.rm(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
