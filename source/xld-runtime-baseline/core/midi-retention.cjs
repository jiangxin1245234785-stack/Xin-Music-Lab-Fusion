'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {guarded}=require('./storage.cjs');
const {MANUAL_ENGINE}=require('./derived-assets.cjs');
// Bounded version history for one (stem, engine) pair, swept right after a run is activated.
//
// The load-bearing invariant is `pointed.length === 0`: read() resolves a stem through exactly three literal pointer
// paths and never looks in runs/, so a run no pointer names is a run no reader can reach. Retention therefore cannot
// delete the active version, cannot leave a dangling pointer, and cannot make a stem go silent — it reclaims only
// what is already unreachable. Everything else here is a budget on top of that.
function createMidiRetention({assets,getRoot,trash}) {
 // Pass A removes duplicates of the version that is now active (the same class of deletion the service already does
 // inline); pass B keeps the newest run of a *different* version as the comparison slot and recycles the rest.
 async function sweep(track,stem,engine,{activeIdentity=null,protect=[]}={}) {
  const removed=[],trashed=[],skipped=[],protected_=new Set(protect.filter(Boolean));
  const runs=await assets.midi.listRuns(track,stem,engine);
  // 'source-changed' is live history, 'files-missing' is the Recycle-Bin residue a restore needs, 'invalid' is a
  // diagnostic. None of the three is ever auto-recycled.
  // A hand-edited revision is permanently 'superseded' — no model version will ever match it — so it satisfies the
  // status clause forever. Today it is out of range for a second reason: the only production caller scopes the
  // sweep to the model engine it just ran, and collectRuns drops every other engine. That is an accident of
  // scoping, not a decision, and it would stop protecting anything the moment someone swept a stem rather than an
  // engine. Retention reclaims model output; it never reclaims the user's own work.
  const candidates=runs.filter(run=>['current','superseded'].includes(run.status)&&run.engine!==MANUAL_ENGINE&&run.pointed.length===0&&!run.kept&&!protected_.has(run.runId));
  const root=path.resolve(getRoot()),directory=assets.directory(track);
  // Re-read the markers immediately before each deletion: a pin written while we took inventory still counts.
  const pinned=async runId=>(await assets.midi.listKept(track,stem)).has(runId);
  const duplicates=activeIdentity?candidates.filter(run=>run.identity===activeIdentity):[];
  for(const run of duplicates) {
   if(await pinned(run.runId)){skipped.push({runId:run.runId,reason:'kept'});continue;}
   await assets.midi.removeRun(directory,stem,run.runId);
   removed.push(run.runId);
  }
  // listRuns is newest-first (createdAt desc, then runId), so slot 0 is the comparison slot and the rest are surplus.
  for(const run of candidates.filter(run=>!duplicates.includes(run)).slice(1)) {
   if(await pinned(run.runId)){skipped.push({runId:run.runId,reason:'kept'});continue;}
   if(typeof trash!=='function'){skipped.push({runId:run.runId,reason:'midi-retention-trash-unavailable'});continue;}
   let folder,names;
   try{folder=await guarded(root,path.join(directory,'midi',stem,run.runId));names=(await fs.readdir(folder)).sort();}
   catch(error){if(error.code!=='ENOENT')throw error;skipped.push({runId:run.runId,reason:'midi-missing'});continue;}
   if(JSON.stringify(names)!==JSON.stringify([stem+'.mid','notes.json'].sort())){skipped.push({runId:run.runId,reason:'midi-retention-unknown-files'});continue;}
   // Only the payload folder, exactly as midi-delete.clear does: the record and any pointer copies stay, so a
   // restore from the bin revives the cache.
   await trash(folder);
   trashed.push(run.runId);
  }
  return {removed,trashed,skipped};
 }
 return {sweep};
}
module.exports={createMidiRetention};
