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
    assert.equal(require('../core/derived-assets.cjs').defaultEngine('drums'),'drums-adtof');
    let childCount=7;
    for(const engine of ['drums-muscriptor-medium','drums-muscriptor-large']) {
      const job=service.run(track,engine,{stem:'drums'}),child=await nextChild(++childCount);
      await output(child);child.emit('close',0);assert((await job).ok);
      const saved=await service.readMidi(track,'drums',engine);assert(saved.ok);
      assert((await service.run(track,engine,{stem:'drums'})).cached);
      const cancel=service.run(track,engine,{stem:'drums',force:true});await nextChild(++childCount);service.cancel();
      assert.equal((await cancel).error,'analysis-cancelled');
      assert.equal((await service.readMidi(track,'drums',engine)).runId,saved.runId);
      assert.equal((await service.run(track,engine,{stem:'guitar'})).error,'midi-engine-unsupported');
    }
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
    manifest.runId=randomUUID();await fs.writeFile(path.join(root,'stems.json'),JSON.stringify(manifest));
    assert.equal((await service.readMidi(track,'bass')).error,'midi-stale');
    assert.equal((await assets.readMidiDirectory(track)).ok,false,'Old WAV source cannot enable current output folder');
    assert.equal(service.task(),null);
    console.log('midi-models: PASS (legacy preservation, independent caches, activation, wrong-model rejection, cancellation, version history, stale source)');
  } finally {
    if(path.dirname(path.resolve(root))===path.resolve(os.tmpdir()) && path.basename(root).startsWith('xld-midi-test-'))
      await fs.rm(root,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
