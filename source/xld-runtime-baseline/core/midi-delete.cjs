'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {guarded}=require('./storage.cjs');
const {defaultEngine,profileFor}=require('./derived-assets.cjs');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function createMidiDeletion({assets,getRoot,trash}) {
 async function plan(track,selection) {
  const {stem,engine,runId}=selection||{};
  if(!profileFor(engine)?.stems.includes(stem)||!runId)throw Error('midi-delete-invalid');
  // By runId, not "whatever this engine's pointer resolves to": an A/B loop leaves runs no pointer names, and
  // those have to be deletable too. validId fires first, inside runRecordPath.
  let view;
  try{view=await assets.midi.readRun(track,stem,runId,{engine});}catch(_){throw Error('midi-delete-invalid');}
  const result=view.ok?view.run:view.record;
  // A run bound to a source that has since changed, or one that no longer validates, is still deletable —
  // 'files-missing' is not: there is nothing to trash, and its record is the restore path.
  if(!result||(!view.ok&&!['invalid','source-changed'].includes(view.status)))throw Error('midi-delete-changed');
  const root=path.resolve(getRoot()),directory=path.join(assets.directory(track),'midi',stem,runId);
  // Today these agree only as a side effect of checkRecord forcing file === midi/<stem>/<runId>/<stem>.mid.
  // Once the lookup is by runId that deserves saying out loud.
  if(directory!==path.dirname(path.join(assets.directory(track),String(result.file||''))))throw Error('midi-delete-changed');
  await guarded(root,directory);
  const names=(await fs.readdir(directory)).sort(),expected=[stem+'.mid','notes.json'].sort();
  if(JSON.stringify(names)!==JSON.stringify(expected))throw Error('midi-delete-unknown-files');
  const fingerprints=[];
  for(const name of names){const file=await guarded(root,path.join(directory,name)),stat=await fs.lstat(file);if(!stat.isFile())throw Error('midi-delete-unknown-files');fingerprints.push([name,hash(await fs.readFile(file))]);}
  const active=await assets.readMidi(track,stem),isActive=active.ok&&active.runId===runId;
  // Only when the deleted run is the active one: re-pointing a merely engine-pointed run would hijack the flat
  // pointer. Another run of the same engine comes first — that is 回退 — and the default engine only after.
  let fallback=null,fallbackSameEngine=false;
  if(isActive) {
   const siblings=(await assets.midi.listRuns(track,stem,engine)).filter(run=>run.runId!==runId&&['current','superseded'].includes(run.status));
   const successor=siblings.find(run=>run.status==='current')||siblings[0]||null;
   if(successor){
    const heir=await assets.midi.readRun(track,stem,successor.runId,{engine});
    // The four derived fields are exactly what cleanMidi strips, so nothing new is ever written to disk.
    if(heir.ok){fallback={...heir.run,ok:true,identity:heir.identity,matches:heir.matches,directory:heir.directory};fallbackSameEngine=true;}
   }
   if(!fallback){const preferred=defaultEngine(stem);const alternate=preferred!==engine?await assets.readMidi(track,stem,preferred):null;if(alternate?.ok)fallback=alternate;}
  }
  return {root,directory,stem,engine,runId,model:profileFor(engine).name,track:track.title,active:isActive,degraded:view.ok?null:view.status,
   fallback,fallbackSameEngine,revision:hash(JSON.stringify([root,directory,result.sourceRunId,result.source,active.ok?active.runId:null,fallback?.runId??null,fingerprints]))};
 }
 async function clear(track,selection,confirm) {
  if(typeof trash!=='function')throw Error('midi-delete-trash-unavailable');
  const before=await plan(track,selection);
  if(!await confirm(before))return {ok:true,canceled:true};
  const fresh=await plan(track,selection);
  if(fresh.revision!==before.revision)throw Error('midi-delete-changed');
  // Retain small cache manifests: restoring this folder from the Recycle Bin
  // restores the model cache. Existing readers validate actual files first.
  await trash(fresh.directory);
  let activated=null,activationError=null;
  // This only works because read() inside activate() resolves through pointers naming the just-trashed run,
  // checkFiles throws ENOENT and read() swallows it — so the archive(old,true) branch is skipped. If that
  // swallowing ever tightens this throws, and the deletion stands with activationError set.
  if(fresh.fallback){try{await assets.midi.activate(track,fresh.fallback);activated=fresh.fallback.engine;}catch(error){activationError=error.message;}}
  return {ok:true,deleted:true,stem:fresh.stem,engine:fresh.engine,runId:fresh.runId,activated,activationError,
   displacedRunId:fresh.fallbackSameEngine?fresh.fallback.runId:null};
 }
 return {plan,clear};
}
module.exports={createMidiDeletion};
