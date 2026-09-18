'use strict';
const fs=require('node:fs/promises'),fsSync=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {createDerivedAssets,STEMS}=require('./derived-assets.cjs');
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');

function createMidiMerge({analysisRoot,python}) {
  const assets=createDerivedAssets({analysisRoot});
  async function plan(track) {
    const source=await assets.readStems(track);
    const parts=[],provenance=[];
    for(const stem of STEMS) {
      const midi=await assets.readMidi(track,stem);
      if(!midi.ok && !['midi-missing','midi-stale'].includes(midi.error))throw Error(midi.error);
      if(!midi.ok || !midi.noteCount)continue;
      const file=path.join(assets.directory(track),midi.file);
      const sha256=hash(await fs.readFile(file));
      parts.push({stem,engine:midi.engine,model:midi.model,runId:midi.runId,sourceRunId:midi.sourceRunId,noteCount:midi.noteCount,path:file,sha256});
      // Model-version provenance stays outside the hashed parts so existing merged outputs keep their fingerprints.
      provenance.push({stem,runId:midi.runId,engine:midi.engine||null,model:midi.model||null,identity:midi.identity||null,matches:midi.matches!==false,
        checkpointSha256:midi.backend?.checkpointSha256||null,adapterVersion:midi.options?.adapterVersion??null,weightDtype:midi.options?.weightDtype||midi.backend?.weightDtype||null,createdAt:midi.createdAt||null});
    }
    if(parts.length<2)return {ok:false,error:'merge-needs-parts',parts};
    const fingerprint=hash(JSON.stringify({version:2,trackId:track.id,sourceRunId:source.runId||null,parts}));
    const directory=path.join(assets.directory(track),'midi','merged',fingerprint);
    return {ok:true,trackId:track.id,sourceRunId:source.runId||null,parts,provenance,fingerprint,directory,file:path.join(directory,'merged.mid')};
  }
  async function read(track) {
    try {
      const input=await plan(track);
      if(!input.ok)return input;
      const manifest=JSON.parse(await fs.readFile(path.join(input.directory,'merge.json'),'utf8'));
      const midi=await fs.readFile(input.file);
      if(manifest.schemaVersion!==1 || manifest.kind!=='midi-merge' || manifest.fingerprint!==input.fingerprint || manifest.sha256!==hash(midi) || midi.toString('ascii',0,4)!=='MThd')throw Error('merge-invalid');
      return {...input,noteCount:manifest.noteCount,instrumentCount:manifest.instrumentCount,provenance:manifest.provenance||input.provenance};
    }catch(error){return {ok:false,error:error.code==='ENOENT'?'merge-missing':error.message};}
  }
  async function generate(track,{onChild,progress,cancelled}) {
    const input=await plan(track);
    if(!input.ok)throw Error(input.error);
    const cached=await read(track);
    if(cached.ok)return {...cached,cached:true};
    const runtime=python || [process.env.XLD_HIGHRES_PYTHON,process.env.XLD_MIDI_PYTHON,'D:/Caches/codex/runtimes/xld-midi-highres/Scripts/python.exe','D:/Caches/codex/runtimes/xld-midi/Scripts/python.exe'].find(p=>p && fsSync.existsSync(p));
    if(!runtime)throw Error('runtime-missing');
    const directory=input.directory, token=crypto.randomUUID();
    const job=path.join(directory,token+'.json'), output=path.join(directory,token+'.mid');
    await fs.mkdir(directory,{recursive:true});
    try {
      await fs.writeFile(job,JSON.stringify({parts:input.parts}),'utf8');
      if(cancelled())throw Error('analysis-cancelled');
      progress(.2,'正在合并 MIDI 声部');
      let stdout='',stderr='';
      const code=await new Promise((resolve,reject)=>{
        const child=spawn(runtime,['-X','utf8',path.join(__dirname,'../analysis-midi/merge.py'),'--job',job,'--output',output],{windowsHide:true,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
        onChild(child);
        child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr=(stderr+chunk).slice(-4000));child.once('error',reject);child.once('close',resolve);
      });
      if(cancelled())throw Error('analysis-cancelled');
      if(code!==0)throw Error(stderr.trim() || 'merge-failed');
      const summary=JSON.parse(stdout.trim().split(/\r?\n/).at(-1));
      if(summary.noteCount!==input.parts.reduce((sum,p)=>sum+p.noteCount,0))throw Error('merge-note-mismatch');
      if((await plan(track)).fingerprint!==input.fingerprint)throw Error('merge-source-changed');
      progress(.9,'正在保存融合 MIDI');
      if(cancelled())throw Error('analysis-cancelled');
      const manifest={schemaVersion:1,kind:'midi-merge',fingerprint:input.fingerprint,trackId:track.id,sourceRunId:input.sourceRunId,...summary,parts:input.parts,provenance:input.provenance,sha256:hash(await fs.readFile(output)),createdAt:new Date().toISOString()};
      // Keep original MIDI files and all previous source combinations untouched.
      await fs.rename(output,input.file);
      await fs.writeFile(job,JSON.stringify(manifest,null,2),'utf8');
      await fs.rename(job,path.join(directory,'merge.json'));
      return {...input,...summary,cached:false};
    }finally {await fs.rm(job,{force:true}).catch(()=>{});await fs.rm(output,{force:true}).catch(()=>{});}
  }
  return {plan,read,generate};
}
module.exports={createMidiMerge};
