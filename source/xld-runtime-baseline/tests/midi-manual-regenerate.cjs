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

  const watchdog=setTimeout(()=>{console.error('manual regeneration test timed out: '+children.length+' runner calls');process.exit(1);},10000);
  try{
    const firstRun=service.run(track,'basic-pitch',{stem:'bass'});
    const first=await nextChild(1);await output(first);first.emit('close',0);assert((await firstRun).ok);
    const baseRun=await service.readMidi(track,'bass','basic-pitch');assert(baseRun.ok);
    const manualProfile=require('../core/derived-assets.cjs').MANUAL,manualId=randomUUID();
    const manual={...baseRun,runId:manualId,engine:'manual-revision',model:manualProfile.model,
      options:{revision:'p0-edit',parentRunId:baseRun.runId,instrument:0},backend:{checkpointSha256:null},
      file:'midi/bass/'+manualId+'/bass.mid',notesFile:'midi/bass/'+manualId+'/notes.json',createdAt:new Date().toISOString()};
    await fs.mkdir(path.dirname(path.join(root,manual.file)),{recursive:true});
    await fs.copyFile(path.join(root,baseRun.file),path.join(root,manual.file));
    const notes=JSON.parse(await fs.readFile(path.join(root,baseRun.notesFile),'utf8'));
    Object.assign(notes,{runId:manualId,engine:manual.engine,model:manual.model});await fs.writeFile(path.join(root,manual.notesFile),JSON.stringify(notes));
    delete manual.digests;await assets.midi.activate(track,manual);
    const original=await fs.readFile(path.join(root,manual.file)),hit=await service.run(track,'basic-pitch',{stem:'bass'});
    assert(hit.cached);assert.equal(children.length,1);assert.equal((await service.readMidi(track,'bass')).runId,manualId);
    const forced=service.run(track,'basic-pitch',{stem:'bass',force:true});
    const second=await nextChild(2);await output(second);second.emit('close',0);assert((await forced).ok);
    assert.notEqual((await service.readMidi(track,'bass')).runId,manualId);
    assert((await assets.midi.readRun(track,'bass',manualId)).ok);
    assert.deepEqual(await fs.readFile(path.join(root,manual.file)),original);
    assert((await assets.midi.activateRun(track,'bass',manualId)).ok);
    console.log('manual regeneration: PASS (cache preserves active edit; forced run retains revision; return succeeds)');
  } finally {clearTimeout(watchdog);await fs.rm(root,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1});
