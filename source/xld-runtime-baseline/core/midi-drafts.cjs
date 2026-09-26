'use strict';
// A draft belongs to a specific immutable MIDI run. It never occupies a run directory or an active pointer.
const fs=require('node:fs/promises'),path=require('node:path');
const {writeAtomic}=require('./derived-assets.cjs');
const {validate}=require('../midi-edit.js');
function createMidiDrafts({assets}){
 function file(track,stem,runId,instrument){
  if(!['bass','piano','guitar','drums','strings'].includes(stem) || !/^[a-zA-Z0-9-]{1,80}$/.test(runId||'') ||
    !Number.isInteger(instrument)||instrument<0||instrument>127)throw Error('draft-invalid');
  return path.join(assets.directory(track),'midi',stem,'drafts',runId+'.'+instrument+'.json');
 }
 async function read(track,p){
  try{const name=file(track,p.stem,p.runId,p.instrument);
   const value=JSON.parse(await fs.readFile(name,'utf8'));return {ok:true,draft:value};
  }catch(e){return e.code==='ENOENT'?{ok:true,draft:null}:{ok:false,error:'draft-read-failed'};}
 }
 async function write(track,p){
  try{
   const name=file(track,p.stem,p.runId,p.instrument);
   const parent=await assets.midi.readRun(track,p.stem,p.runId);
   if(!parent.ok)return {ok:false,error:'midi-missing'};
   if(p.notes===null){await fs.rm(name,{force:true});return {ok:true};}
   validate(p.notes,Number(parent.run.duration),p.instrument);
   if(p.notes.length>250000)return {ok:false,error:'draft-invalid'};
   const value={kind:'midi-draft',schemaVersion:1,trackId:track.id,stem:p.stem,runId:p.runId,instrument:p.instrument,
     notes:p.notes,sourceKey:p.sourceKey,updatedAt:new Date().toISOString()};
   await writeAtomic(name,value);return {ok:true};
  }catch(_){return {ok:false,error:'draft-write-failed'};}
 }

 async function list(track){
  const drafts=[];
  try{
   for(const stem of ['bass','piano','guitar','drums','strings']){
    const folder=path.join(assets.directory(track),'midi',stem,'drafts');
    const names=await fs.readdir(folder).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
    const active=await assets.midi.read(track,stem),parents=new Map();
    for(const name of names){
     const match=/^([a-zA-Z0-9-]{1,80})\.(\d+)\.json$/.exec(name);if(!match)continue;
     const runId=match[1],instrument=Number(match[2]);
     let status='invalid',value=null,view;
     try{
      const result=await read(track,{stem,runId,instrument});value=result.draft;
      if(!result.ok||value?.kind!=='midi-draft'||value.trackId!==track.id||value.stem!==stem||value.runId!==runId||value.instrument!==instrument)throw Error('invalid');
      if(!parents.has(runId))parents.set(runId,await assets.midi.readRun(track,stem,runId));
      view=parents.get(runId);
      if(view.status==='files-missing')status='missing';
      else if(view.status==='source-changed')status='source-changed';
      else if(view.ok){
       const r=view.run,key=JSON.stringify([r.sourceRunId,r.source?.path,r.source?.size,r.source?.mtimeMs]);
       validate(value.notes,Number(r.duration),instrument);
       status=value.sourceKey!==key?'source-changed':active.ok&&active.runId===runId?'current':'other-version';
      }
     }catch(_){status='invalid';}
     drafts.push({stem,runId,instrument,status,engine:view?.run?.engine||view?.record?.engine||null,
      noteCount:Array.isArray(value?.notes)?value.notes.length:0,updatedAt:typeof value?.updatedAt==='string'?value.updatedAt:null});
    }
   }
   return {ok:true,drafts:drafts.sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')))};
  }catch(_){return {ok:false,error:'draft-read-failed',drafts:[]};}
 }

 return {read,write,list};
}
module.exports={createMidiDrafts};
