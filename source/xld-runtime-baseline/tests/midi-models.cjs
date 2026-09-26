const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');
const { MODEL, OPTIONS, STEMS, profileFor } = require('../core/derived-assets.cjs');

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'xld-midi-test-'));
  const source = require.resolve('../core/analysis-service.cjs');
  const realRequire = createRequire(source), children = [];
  const python = path.join(root,'python.exe'); await fs.writeFile(python,'fixture');
  const sandbox = { module:{exports:{}}, __dirname:path.dirname(source),
    process:{...process, env:{...process.env, XLD_MIDI_PYTHON:python, XLD_HIGHRES_PYTHON:python, XLD_YOURMT3_PYTHON:python,XLD_MUSCRIPTOR_PYTHON:python}}, require(name) {
      if(name !== 'child_process') return realRequire(name);
      return {spawn(_python,args) {
        const child=new EventEmitter(); child.args=args;
        child.stdout=new EventEmitter(); child.stderr=new EventEmitter();
        child.stdout.setEncoding=child.stderr.setEncoding=()=>{};
        child.kill=()=>{setImmediate(()=>child.emit('close',null)); return true;};
        // Runtime discovery is not a transcription job. Complete its probe instead of leaving an
        // unresolved Promise that lets Node exit silently before the second half of this test.
        if(args.includes('--engines')){
          setImmediate(()=>{child.stdout.emit('data','[]');child.emit('close',0);});
          return child;
        }
        children.push(child); return child;
      }};
    }};
  vm.runInNewContext(await fs.readFile(source,'utf8'),sandbox);
  const service=sandbox.module.exports.createService({analysisRoot:root});
  const assets=require('../core/derived-assets.cjs').createDerivedAssets({analysisRoot:root});
  const audio=path.join(root,'母曲.wav'); await fs.writeFile(audio,'source');
  const track={id:'track',title:'母曲',filePath:audio,bridgePath:path.join(root,'music-lab.json')};
  const stat=await fs.stat(audio), stemRunId=randomUUID();
  const manifest={schemaVersion:1,kind:'stems',trackId:track.id,runId:stemRunId,model:'htdemucs_6s',options:{shifts:1,overlap:0.25},
    source:{path:audio,size:stat.size,mtimeMs:stat.mtimeMs},stems:[]};
  for(const name of ['bass','piano','guitar','drums','vocals','other']) {
    const relative=`stems/${stemRunId}/${name}.wav`;
    await fs.mkdir(path.dirname(path.join(root,relative)),{recursive:true});
    await fs.writeFile(path.join(root,relative),Buffer.alloc(44100*8));
    manifest.stems.push({name,file:relative,sampleRate:44100,channels:2,frames:44100});
  }
  await fs.writeFile(path.join(root,'stems.json'),JSON.stringify(manifest));
  const nextChild=async count=>{
    for(let i=0;i<200 && children.length<count;i++) await new Promise(r=>setTimeout(r,5));
    assert.equal(children.length,count);return children[count-1];
  };
  async function output(child, bad=false, wrongEngine=false) {
    const arg=name=>child.args[child.args.indexOf(name)+1];
    const profile=profileFor(wrongEngine?'basic-pitch':arg('--engine'));
    const runId=arg('--run-id'),stem=arg('--stem'),input=arg('--input'),info=await fs.stat(input);
    const relative=`midi/${stem}/${runId}`;
    const directory=path.join(root,relative);await fs.mkdir(directory,{recursive:true});
    const file=relative+`/${stem}.mid`, notesFile=relative+'/notes.json';
    await fs.writeFile(path.join(root,file),Buffer.from('4d546864000000060000000103c04d54726b0000000400ff2f00','hex'));
    const notes=bad?[{start:0,end:2,pitch:60,velocity:64}]:[];
    await fs.writeFile(path.join(root,notesFile),JSON.stringify({schemaVersion:1,kind:'notes',trackId:track.id,stem,sourceRunId:stemRunId,timeOrigin:0,duration:1,notes}));
    await fs.writeFile(arg('--output'),JSON.stringify({schemaVersion:1,kind:'midi',trackId:track.id,stem,runId,sourceRunId:stemRunId,
      source:{path:input,size:info.size,mtimeMs:info.mtimeMs},engine:profile.id,model:profile.model,options:profile.options,backend:{checkpointSha256:profile.checkpoint?.sha256},timeOrigin:0,duration:1,
      noteCount:notes.length,tempoMode:'fixed-timebase',quantized:false,file,notesFile}));
    return directory;
  }
  try {
    assert.equal((await assets.readMidiDirectory(track)).ok,false,'No result: no output folder');
    assert.equal((await service.run(track,'basic-pitch',{stem:'drums'})).error,'midi-engine-unsupported');
    const pending=service.run(track,'basic-pitch',{stem:'bass'});
    assert.equal((await service.run(track,'basic-pitch',{stem:'piano'})).error,'analysis-busy');
    const first=await nextChild(1);assert.equal(first.args[first.args.indexOf('--input')+1],path.join(root,manifest.stems[0].file));
    await output(first);first.emit('close',0);assert.equal((await pending).ok,true);
    const old=await service.readMidi(track,'bass'); assert(old.ok);assert.equal(old.noteCount,0);
    assert.equal((await assets.readMidiDirectory(track)).directory,path.join(root,'midi'),'Completed empty MIDI is still accessible');
    assert.equal((await service.run(track,'basic-pitch',{stem:'bass'})).cached,true); assert.equal(children.length,1);
    // Simulate an existing legacy MIDI created before model-specific manifests.
    await fs.rm(path.join(root,'midi/bass/basic-pitch.json'));
    const specialized=service.run(track,'bass-highres',{stem:'bass'});
    const second=await nextChild(2);await output(second);second.emit('close',0);assert((await specialized).ok);
    const highres=await service.readMidi(track,'bass','bass-highres');assert(highres.ok);
    assert.equal((await service.readMidi(track,'bass')).runId,highres.runId);
    assert.equal((await service.readMidi(track,'bass','basic-pitch')).runId,old.runId,'Legacy result preserved');
    const reused=await service.run(track,'basic-pitch',{stem:'bass'});assert(reused.cached);
    assert.equal((await service.readMidi(track,'bass')).runId,old.runId,'XML active result follows explicitly reused model');
    assert.equal((await service.readMidi(track,'bass','bass-highres')).runId,highres.runId);
    const mismatch=service.run(track,'bass-highres',{stem:'bass',force:true});
    const third=await nextChild(3),wrongDirectory=await output(third,false,true);third.emit('close',0);
    assert.equal((await mismatch).ok,false,'Wrong model cannot be promoted');
    assert.equal((await service.readMidi(track,'bass','bass-highres')).runId,highres.runId);
    assert.equal((await service.readMidi(track,'bass')).runId,old.runId);
    await assert.rejects(fs.stat(wrongDirectory),{code:'ENOENT'});
    assert.equal((await service.run(track,'piano-highres',{stem:'bass'})).error,'midi-engine-unsupported');
    const cancel=service.run(track,'bass-highres',{stem:'bass',force:true});const fourth=await nextChild(4);
    const cancelledDirectory=await output(fourth);service.cancel();assert.equal((await cancel).error,'analysis-cancelled');
    assert.equal((await service.readMidi(track,'bass','bass-highres')).runId,highres.runId);
    assert.equal((await service.readMidi(track,'bass')).runId,old.runId);await assert.rejects(fs.stat(cancelledDirectory),{code:'ENOENT'});
    assert(profileFor('yourmt3-plus').stems.includes('guitar'));
    assert.equal(require('../core/derived-assets.cjs').defaultEngine('guitar'),'muscriptor-medium');
    for(const retired of ['guitar-gaps','yourmt3-plus','basic-pitch'])assert.equal((await service.run(track,retired,{stem:'guitar'})).error,'midi-engine-unsupported');
    const guitarJob=service.run(track,'muscriptor-large',{stem:'guitar'});
    const fifth=await nextChild(5);assert.equal(fifth.args[fifth.args.indexOf('--stem')+1],'guitar');await output(fifth);fifth.emit('close',0);assert((await guitarJob).ok);
    assert((await service.readMidi(track,'guitar','muscriptor-large')).ok);
    assert((await service.run(track,'muscriptor-large',{stem:'guitar'})).cached);assert.equal(children.length,5);
    assert.equal((await service.run(track,'muscriptor-large',{stem:'drums'})).error,'midi-engine-unsupported');
    const mediumJob=service.run(track,'muscriptor-medium',{stem:'guitar'});
    const sixth=await nextChild(6);await output(sixth);sixth.emit('close',0);assert((await mediumJob).ok);
    const medium=await service.readMidi(track,'guitar','muscriptor-medium');assert(medium.ok);
    assert((await service.run(track,'muscriptor-medium',{stem:'guitar'})).cached);assert.equal(children.length,6);
    const retry=service.run(track,'muscriptor-medium',{stem:'guitar',force:true});const seventh=await nextChild(7);
    await output(seventh);service.cancel();assert.equal((await retry).error,'analysis-cancelled');
    assert.equal((await service.readMidi(track,'guitar','muscriptor-medium')).runId,medium.runId);
    assert((await service.readMidi(track,'guitar','muscriptor-large')).ok);
    assert.equal((await service.run(track,'muscriptor-medium',{stem:'strings'})).error,'midi-engine-unsupported');
    // New drum tiers must use the MuScriptor interpreter and independent caches.
    assert.equal(require('../core/derived-assets.cjs').defaultEngine('strings'),'strings-muscriptor-large');
    assert.equal(require('../core/derived-assets.cjs').defaultEngine('drums'),'drums-adtof-stems');   // drums.2
    let childCount=7;
    // drums-muscriptor Medium/Large retired 2026-09-19. R3's listening verdict on the three drum engines was
    // "broadly similar", so neither could be given a sentence saying when it is worth switching to it, and under
    // the one-default rule an alternative without that sentence does not survive. Retiring stops new runs and
    // does nothing else: the ids still resolve, so anything they ever wrote stays readable and stays deletable.
    const offered=await service.midiEngines();
    for(const engine of ['drums-muscriptor-medium','drums-muscriptor-large']) {
      assert.equal((await service.run(track,engine,{stem:'drums'})).error,'midi-engine-unsupported','a retired engine refuses to start');
      assert.equal(children.length,childCount,'and spawns no process');
      assert(!offered.some(item=>item.id===engine),engine+' is no longer offered: '+offered.map(i=>i.id).join(','));
      assert(profileFor(engine),engine+' must stay resolvable, or its stored results become unreadable');
      assert(Array.isArray(await service.listMidiRuns(track,'drums',engine)),engine+' runs stay listable');
    }
    // The drum engines that survive, and the one sentence each earns its place with.
    assert.deepEqual(offered.filter(item=>item.stems.includes('drums')).map(item=>item.id).sort(),
      ['drums-adtof','drums-adtof-stems'],'two drum engines remain: the default and the no-DrumSep fallback');
    // Piano: Transkun V2 runs beside HiRes with an independent cache through the shared highres interpreter path.
    const pianoJob=service.run(track,'piano-highres',{stem:'piano'}),pianoChild=await nextChild(++childCount);await output(pianoChild);pianoChild.emit('close',0);assert((await pianoJob).ok);
    const transkunJob=service.run(track,'piano-transkun',{stem:'piano'}),transkunChild=await nextChild(++childCount);
    assert.equal(transkunChild.args[transkunChild.args.indexOf('--engine')+1],'piano-transkun');await output(transkunChild);transkunChild.emit('close',0);assert((await transkunJob).ok);
    const transkun=await service.readMidi(track,'piano','piano-transkun');assert(transkun.ok&&transkun.matches===true);
    assert((await service.readMidi(track,'piano','piano-highres')).ok,'HiRes piano cache untouched by the new engine');
    assert.equal((await service.readMidi(track,'piano')).runId,transkun.runId);assert((await service.run(track,'piano-transkun',{stem:'piano'})).cached);
    assert.equal((await service.run(track,'piano-transkun',{stem:'bass'})).error,'midi-engine-unsupported');
    // Model-version history: an earlier version of bass-highres stays readable, is not reused as cache, and survives the new run.
    const versioned=await service.readMidi(track,'bass','bass-highres');assert(versioned.ok&&versioned.matches===true);
    const recordPath=id=>path.join(root,'midi/bass/runs',id+'.json');assert((await fs.stat(recordPath(versioned.runId))).isFile(),'promoted output is the per-run record');
    const outdated=JSON.parse(await fs.readFile(recordPath(versioned.runId),'utf8'));outdated.backend={checkpointSha256:'f'.repeat(64)};
    for(const file of [recordPath(versioned.runId),path.join(root,'midi/bass/bass-highres.json'),path.join(root,`midi/bass/by-source/${stemRunId}/bass-highres.json`)])await fs.writeFile(file,JSON.stringify(outdated));
    const earlier=await service.readMidi(track,'bass','bass-highres');assert.equal(earlier.ok,true);assert.equal(earlier.matches,false);assert.equal(earlier.runId,versioned.runId);
    const upgrade=service.run(track,'bass-highres',{stem:'bass'});const upgradeChild=await nextChild(++childCount);await output(upgradeChild);upgradeChild.emit('close',0);
    const upgraded=await upgrade;assert(upgraded.ok&&!upgraded.cached,'an earlier model version is not a cache hit for the current version');
    const replacement=await service.readMidi(track,'bass','bass-highres');assert.notEqual(replacement.runId,versioned.runId);assert.equal(replacement.matches,true);
    assert.equal((await service.readMidi(track,'bass')).runId,replacement.runId);
    assert((await fs.stat(recordPath(versioned.runId))).isFile(),'the earlier run keeps its record');assert((await fs.stat(path.join(root,'midi/bass',versioned.runId))).isDirectory(),'the earlier run keeps its files');
    assert.deepEqual((await service.listMidiRuns(track,'bass','bass-highres')).map(r=>[r.runId,r.status]).sort(),[[replacement.runId,'current'],[versioned.runId,'superseded']].sort());
    const abort=service.run(track,'bass-highres',{stem:'bass',force:true});const abortChild=await nextChild(++childCount);const abortDirectory=await output(abortChild);service.cancel();assert.equal((await abort).error,'analysis-cancelled');
    assert.equal((await service.readMidi(track,'bass','bass-highres')).runId,replacement.runId);assert((await fs.stat(recordPath(versioned.runId))).isFile());await assert.rejects(fs.stat(abortDirectory),{code:'ENOENT'});
    const redo=service.run(track,'bass-highres',{stem:'bass',force:true});const redoChild=await nextChild(++childCount);await output(redoChild);redoChild.emit('close',0);assert((await redo).ok);
    const redone=await service.readMidi(track,'bass','bass-highres');assert.notEqual(redone.runId,replacement.runId);
    await assert.rejects(fs.stat(recordPath(replacement.runId)),{code:'ENOENT'},'a same-version recompute replaces the previous run');await assert.rejects(fs.stat(path.join(root,'midi/bass',replacement.runId)),{code:'ENOENT'});
    assert((await fs.stat(recordPath(versioned.runId))).isFile(),'a different version is never cleaned up by a recompute');
    // --- A/B between two versions of one engine, end to end ---------------------------------------------------
    // Everything below happens without widening the identity rule: :145-148 above still hold verbatim.
    const B1=versioned.runId;
    const pointers=[path.join(root,'midi/bass.json'),path.join(root,'midi/bass/bass-highres.json'),
      path.join(root,`midi/bass/by-source/${stemRunId}/active.json`),path.join(root,`midi/bass/by-source/${stemRunId}/bass-highres.json`)];
    const pointerKeys=async()=>Promise.all(pointers.map(async file=>Object.keys(JSON.parse(await fs.readFile(file,'utf8'))).sort().join(',')));
    const beforeSwitch=await pointerKeys();
    const inventory=async()=>(await service.listMidiRuns(track,'bass','bass-highres')).map(r=>[r.runId,r.status,r.active,r.kept]);
    // 4. Switch. No child process, no task: the records are already on disk, only pointers move.
    const spawnsBefore=children.length;
    const rolled=await assets.midi.activateRun(track,'bass',B1);
    assert(rolled.ok&&rolled.runId===B1&&rolled.matches===false,'rolling back needs no rerun');
    assert.equal(children.length,spawnsBefore,'switching spawns nothing');
    assert.equal((await service.readMidi(track,'bass')).runId,B1);
    assert.deepEqual(await pointerKeys(),beforeSwitch,'no derived field leaked into any pointer copy');
    let listed=await inventory();
    assert.deepEqual(listed.map(([id,,active])=>[id===B1,active]).sort(),[[false,false],[true,true]].sort(),'active follows the rollback');
    assert.deepEqual(Array.from((await service.listMidiRuns(track,'bass','bass-highres')).find(r=>r.runId===redone.runId).pointed),[],'the displaced run is unreachable');
    assert((await fs.stat(path.join(root,'midi/bass',redone.runId))).isDirectory(),'and its files are intact');
    // 5. 不误命中: with the earlier version active, Generate is not a cache hit — it really re-runs the model.
    const afterSwitch=service.run(track,'bass-highres',{stem:'bass'});const afterChild=await nextChild(++childCount);await output(afterChild);afterChild.emit('close',0);
    const B4result=await afterSwitch;assert(B4result.ok&&!B4result.cached,'a rolled-back stem is never a cache hit');
    const B4=(await service.readMidi(track,'bass','bass-highres')).runId;assert.notEqual(B4,B1);
    // Retention: B1 is `previous` and protected; the orphan left by the rollback has the identity that is now
    // active, so it is reclaimed on the spot instead of accumulating.
    assert.deepEqual((await inventory()).map(([id,status])=>[id===B4?'new':id===B1?'B1':id,status]).sort(),
      [['B1','superseded'],['new','current']].sort(),'the version the user chose survives, the orphan is reclaimed');
    await assert.rejects(fs.stat(path.join(root,'midi/bass',redone.runId)),{code:'ENOENT'},'the orphan really is gone');
    assert((await fs.stat(recordPath(B1))).isFile(),'and the rolled-back version is untouched');
    // 6. Roll back again and pin it: the sweep must never touch a kept run.
    assert((await assets.midi.activateRun(track,'bass',B1)).ok);
    assert.deepEqual(await assets.midi.keepRun(track,'bass',B1,true),{ok:true,runId:B1,kept:true});
    const marker=path.join(root,'midi/bass/kept',B1+'.json');
    const markerBody=await fs.readFile(marker,'utf8');
    const again=service.run(track,'bass-highres',{stem:'bass'});const againChild=await nextChild(++childCount);await output(againChild);againChild.emit('close',0);assert((await again).ok);
    // The second one is forced: with the current version active again, a plain Generate would be a cache hit.
    const thrice=service.run(track,'bass-highres',{stem:'bass',force:true});const thriceChild=await nextChild(++childCount);await output(thriceChild);thriceChild.emit('close',0);assert((await thrice).ok);
    assert((await fs.stat(recordPath(B1))).isFile(),'a kept run survives every sweep');
    assert((await fs.stat(path.join(root,'midi/bass',B1))).isDirectory());
    assert.equal(await fs.readFile(marker,'utf8'),markerBody,'and its marker is untouched');
    assert.deepEqual((await inventory()).find(([id])=>id===B1).slice(2),[false,true],'kept, not active');
    // 6b. The pin has to hold against the *other* deletion too — the same-version cleanup above the sweep is a
    // hard fs.rm, not a Recycle Bin move, so a pinned run reaching it would be gone for good.
    const pinnedActive=(await service.readMidi(track,'bass','bass-highres')).runId;
    assert((await service.listMidiRuns(track,'bass','bass-highres')).find(r=>r.runId===pinnedActive)?.active,'the run we are about to pin is the active one');
    await assets.midi.keepRun(track,'bass',pinnedActive,true);
    const pinnedMarker=path.join(root,'midi/bass/kept',pinnedActive+'.json'),pinnedBody=await fs.readFile(pinnedMarker,'utf8');
    const sameVersion=service.run(track,'bass-highres',{stem:'bass',force:true});const sameChild=await nextChild(++childCount);await output(sameChild);sameChild.emit('close',0);
    const sameResult=await sameVersion;assert(sameResult.ok);
    assert.notEqual((await service.readMidi(track,'bass','bass-highres')).runId,pinnedActive,'the new run is active');
    assert((await fs.stat(recordPath(pinnedActive))).isFile(),'a pinned run survives the same-version cleanup');
    assert((await fs.stat(path.join(root,'midi/bass',pinnedActive))).isDirectory(),'files and all');
    assert.equal(await fs.readFile(pinnedMarker,'utf8'),pinnedBody,'and its marker is untouched');
    // The report crosses the vm realm boundary, so compare values rather than object identity.
    assert.deepEqual(Array.from(sameResult.retention?.skipped||[]).map(s=>s.runId+':'+s.reason).filter(v=>v.startsWith(pinnedActive)),
      [pinnedActive+':kept'],'and the run report says why it was spared: '+JSON.stringify(sameResult.retention));
    await assets.midi.keepRun(track,'bass',pinnedActive,false);

    // 7. Delete by runId — impossible before runs had addresses.
    const deletion=require('../core/midi-delete.cjs').createMidiDeletion({assets,getRoot:()=>root,trash:async directory=>fs.rm(directory,{recursive:true,force:true})});
    await assets.midi.keepRun(track,'bass',B1,false);
    const live=(await service.readMidi(track,'bass','bass-highres')).runId;
    const removedOld=await deletion.clear(track,{stem:'bass',engine:'bass-highres',runId:B1},async()=>true);
    assert(removedOld.deleted&&!removedOld.activated,'deleting a superseded run leaves the active one alone');
    assert.equal((await service.readMidi(track,'bass')).runId,live,'and its pointers are untouched');
    // Deleting the active run rolls the stem back to the surviving run of the same engine.
    await assets.midi.activateRun(track,'bass',live);
    const spare=service.run(track,'bass-highres',{stem:'bass',force:true});const spareChild=await nextChild(++childCount);await output(spareChild);spareChild.emit('close',0);assert((await spare).ok);
    const newest=(await service.readMidi(track,'bass','bass-highres')).runId;
    const survivor=(await service.listMidiRuns(track,'bass','bass-highres')).find(r=>r.runId!==newest&&['current','superseded'].includes(r.status));
    if(survivor) {
      const removedActive=await deletion.clear(track,{stem:'bass',engine:'bass-highres',runId:newest},async()=>true);
      assert.equal(removedActive.displacedRunId,survivor.runId,'the successor is the same engine, not the default one');
      const back=await service.readMidi(track,'bass');
      assert.equal(back.runId,survivor.runId);assert((await fs.stat(path.join(root,back.file))).isFile(),'its MIDI is really there');
    }
    assert.equal(await fs.readFile(audio,'utf8'),'source','the source WAV is never touched by any of this');
    // 8. The cache branch is untouched by all of the above: with a current-version run active, a non-forced run is
    // still a plain cache hit and spawns nothing. The other direction — a rolled-back stem is never a cache hit —
    // is pinned at step 5 above, and those two together are the whole 不误命中 guarantee.
    const settled=await service.readMidi(track,'bass','bass-highres');assert(settled.ok&&settled.matches===true,JSON.stringify(settled));
    const spawnsAtEnd=children.length;
    const stillCached=await service.run(track,'bass-highres',{stem:'bass'});
    assert(stillCached.cached,'the cache branch survived the round: '+JSON.stringify(stillCached));
    assert.equal(children.length,spawnsAtEnd,'and it really spawned nothing');
    manifest.runId=randomUUID();await fs.writeFile(path.join(root,'stems.json'),JSON.stringify(manifest));
    assert.equal((await service.readMidi(track,'bass')).error,'midi-stale');
    assert.equal((await assets.readMidiDirectory(track)).ok,false,'Old WAV source cannot enable current output folder');
    assert.equal(service.task(),null);
    console.log('midi-models: PASS (legacy preservation, independent caches, activation, wrong-model rejection, cancellation, version history, rollback and regeneration A/B, delete by runId, stale source)');
  } finally {
    if(path.dirname(path.resolve(root))===path.resolve(os.tmpdir()) && path.basename(root).startsWith('xld-midi-test-'))
      await fs.rm(root,{recursive:true,force:true});
  }
}
const watchdog=setTimeout(()=>{console.error('midi-models: unfinished async test');process.exit(1);},30000);
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>clearTimeout(watchdog));
