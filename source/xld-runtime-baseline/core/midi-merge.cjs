'use strict';
const fs=require('node:fs/promises'),fsSync=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {createDerivedAssets,STEMS}=require('./derived-assets.cjs');
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
// A part may be left out of a merge for reasons that are not failures. 'midi-string-source-stale' is simply the
// strings spelling of 'midi-stale' — derived-assets.cjs returns it instead only because the stem is strings —
// so treating it as fatal made changing the strings source kill the whole merge. What stays fatal stays fatal:
// 'midi-incomplete' and 'midi-notes-invalid' mean the files on disk are damaged, and failing loudly is right.
// Two kinds of absence, and neither is a damaged file: 'midi-missing' is a stem that was never transcribed, and
// 'midi-needs-stems' is a track that was never separated at all. Both mean the part is simply not there, so they
// are tolerated AND stay out of the skip notice -- reporting five skips for an unanalysed track would bury the
// one notice that matters. Treating 'midi-needs-stems' as fatal made plan() throw on such a track instead of
// returning a refusal; nothing caught it because this module's only test needs a fixture and is out of npm test.
const ABSENT=['midi-missing','midi-needs-stems'];
const TOLERATED=[...ABSENT,'midi-stale','midi-string-source-stale'];

function createMidiMerge({analysisRoot,python}) {
  const assets=createDerivedAssets({analysisRoot});
  const drafts=require('./midi-drafts.cjs').createMidiDrafts({assets});
  async function checkDrafts(track,input){
    const list=await drafts.list(track);
    if(!list.ok)throw Error('merge-draft-read-failed');
    // Even a corrupt draft for an included run must not silently fall back to saved notes.
    if(list.drafts.some(d=>input.parts.some(p=>p.stem===d.stem&&p.runId===d.runId)))throw Error('merge-draft-pending');
  }
  async function checkCurrent(track,input){
    const latest=await plan(track);
    if(!latest.ok||latest.fingerprint!==input.fingerprint)throw Error('merge-source-changed');
    await checkDrafts(track,latest);
  }
  async function plan(track) {
    const source=await assets.readStems(track);
    const parts=[],provenance=[],skipped=[];
    for(const stem of STEMS) {
      const midi=await assets.readMidi(track,stem);
      if(!midi.ok && !TOLERATED.includes(midi.error))throw Error(midi.error);
      if(!midi.ok || !midi.noteCount) {
        // Report a part that EXISTS but could not be used — the source moved under it, or it transcribed to
        // nothing. Dropping one of those silently is the shape the whole design forbids: a merge that reports
        // success and is quietly missing a voice. A stem that was simply never transcribed is not "left out";
        // saying so for every untranscribed stem would bury the one notice that matters under three that do not.
        if(!ABSENT.includes(midi.error))skipped.push({stem,reason:midi.ok?'midi-empty':midi.error});
        continue;
      }
      const file=path.join(assets.directory(track),midi.file);
      const sha256=hash(await fs.readFile(file));
      parts.push({stem,engine:midi.engine,model:midi.model,runId:midi.runId,sourceRunId:midi.sourceRunId,noteCount:midi.noteCount,path:file,sha256});
      // Model-version provenance stays outside the hashed parts so existing merged outputs keep their fingerprints.
      provenance.push({stem,runId:midi.runId,engine:midi.engine||null,model:midi.model||null,identity:midi.identity||null,matches:midi.matches!==false,
        checkpointSha256:midi.backend?.checkpointSha256||null,adapterVersion:midi.options?.adapterVersion??null,weightDtype:midi.options?.weightDtype||midi.backend?.weightDtype||null,createdAt:midi.createdAt||null});
    }
    if(parts.length<2)return {ok:false,error:'merge-needs-parts',parts,skipped};
    const fingerprint=hash(JSON.stringify({version:2,trackId:track.id,sourceRunId:source.runId||null,parts}));
    const directory=path.join(assets.directory(track),'midi','merged',fingerprint);
    return {ok:true,trackId:track.id,sourceRunId:source.runId||null,parts,provenance,skipped,fingerprint,directory,file:path.join(directory,'merged.mid')};
  }
  async function read(track) {
    // `input` is hoisted so the skip list survives the catch: "not merged yet" is exactly when the owner most
    // needs to know which part is being left out.
    let input=null;
    try {
      input=await plan(track);
      if(!input.ok)return input;
      await checkDrafts(track,input);
      const manifest=JSON.parse(await fs.readFile(path.join(input.directory,'merge.json'),'utf8'));
      const midi=await fs.readFile(input.file);
      if(manifest.schemaVersion!==1 || manifest.kind!=='midi-merge' || manifest.fingerprint!==input.fingerprint || manifest.sha256!==hash(midi) || midi.toString('ascii',0,4)!=='MThd')throw Error('merge-invalid');
      return {...input,noteCount:manifest.noteCount,instrumentCount:manifest.instrumentCount,provenance:manifest.provenance||input.provenance};
    }catch(error){return {ok:false,error:error.code==='ENOENT'?'merge-missing':error.message,skipped:input?.skipped||[]};}
  }
  async function generate(track,{onChild,progress,cancelled}) {
    const input=await plan(track);
    if(!input.ok)throw Error(input.error);
    await checkDrafts(track,input);
    if(cancelled())throw Error('analysis-cancelled');
    const cached=await read(track);
    if(cached.ok){await checkCurrent(track,input);if(cancelled())throw Error('analysis-cancelled');return {...cached,cached:true};}
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
      await checkCurrent(track,input);
      progress(.9,'正在保存融合 MIDI');
      if(cancelled())throw Error('analysis-cancelled');
      const manifest={schemaVersion:1,kind:'midi-merge',fingerprint:input.fingerprint,trackId:track.id,sourceRunId:input.sourceRunId,...summary,parts:input.parts,provenance:input.provenance,sha256:hash(await fs.readFile(output)),createdAt:new Date().toISOString()};
      await checkCurrent(track,input);
      if(cancelled())throw Error('analysis-cancelled');
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
