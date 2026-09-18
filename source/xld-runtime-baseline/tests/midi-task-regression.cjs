const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');
const { MODEL, OPTIONS, STEMS } = require('../core/derived-assets.cjs');

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'xld-midi-test-'));
  const source = require.resolve('../core/analysis-service.cjs');
  const realRequire = createRequire(source), children = [];
  const python = path.join(root,'python.exe'); await fs.writeFile(python,'fixture');
  const sandbox = { module:{exports:{}}, __dirname:path.dirname(source),
    process:{...process, env:{...process.env, XLD_MIDI_PYTHON:python}}, require(name) {
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
  async function output(child, bad=false) {
    const arg=name=>child.args[child.args.indexOf(name)+1];
    const runId=arg('--run-id'),stem=arg('--stem'),input=arg('--input'),info=await fs.stat(input);
    const relative=`midi/${stem}/${runId}`;
    const directory=path.join(root,relative);await fs.mkdir(directory,{recursive:true});
    const file=relative+`/${stem}.mid`, notesFile=relative+'/notes.json';
    await fs.writeFile(path.join(root,file),Buffer.from('4d546864000000060000000103c04d54726b0000000400ff2f00','hex'));
    const notes=bad?[{start:0,end:2,pitch:60,velocity:64}]:[];
    await fs.writeFile(path.join(root,notesFile),JSON.stringify({schemaVersion:1,kind:'notes',trackId:track.id,stem,sourceRunId:stemRunId,timeOrigin:0,duration:1,notes}));
    await fs.writeFile(arg('--output'),JSON.stringify({schemaVersion:1,kind:'midi',trackId:track.id,stem,runId,sourceRunId:stemRunId,
      source:{path:input,size:info.size,mtimeMs:info.mtimeMs},model:MODEL,options:OPTIONS,timeOrigin:0,duration:1,
      noteCount:notes.length,tempoMode:'fixed-timebase',quantized:false,file,notesFile}));
    return directory;
  }
  try {
    assert.equal((await service.run(track,'basic-pitch',{stem:'drums'})).error,'midi-engine-unsupported');
    const pending=service.run(track,'basic-pitch',{stem:'bass'});
    assert.equal((await service.run(track,'basic-pitch',{stem:'piano'})).error,'analysis-busy');
    const first=await nextChild(1);assert.equal(first.args[first.args.indexOf('--input')+1],path.join(root,manifest.stems[0].file));
    await output(first);first.emit('close',0);assert.equal((await pending).ok,true);
    const old=await service.readMidi(track,'bass'); assert(old.ok);assert.equal(old.noteCount,0);
    assert.equal((await service.run(track,'basic-pitch',{stem:'bass'})).cached,true); assert.equal(children.length,1);
    const invalid=service.run(track,'basic-pitch',{stem:'bass',force:true});
    const second=await nextChild(2), badDirectory=await output(second,true);second.emit('close',0);
    assert.equal((await invalid).ok,false);assert.equal((await service.readMidi(track,'bass')).runId,old.runId);
    await assert.rejects(fs.stat(badDirectory),{code:'ENOENT'});
    const cancel=service.run(track,'basic-pitch',{stem:'bass',force:true});const third=await nextChild(3);
    const cancelledDirectory=await output(third);service.cancel();assert.equal((await cancel).error,'analysis-cancelled');
    assert.equal((await service.readMidi(track,'bass')).runId,old.runId);await assert.rejects(fs.stat(cancelledDirectory),{code:'ENOENT'});
    manifest.runId=randomUUID();await fs.writeFile(path.join(root,'stems.json'),JSON.stringify(manifest));
    assert.equal((await service.readMidi(track,'bass')).error,'midi-stale');
    assert.equal(service.task(),null);
    console.log('midi-task-regression: PASS (single task, stem input, cache, empty notes, invalid output, cancellation, stale source)');
  } finally {
    if(path.dirname(path.resolve(root))===path.resolve(os.tmpdir()) && path.basename(root).startsWith('xld-midi-test-'))
      await fs.rm(root,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
