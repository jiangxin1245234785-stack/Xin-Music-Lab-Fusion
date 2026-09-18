'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {guarded}=require('./storage.cjs');
const {defaultEngine,profileFor}=require('./derived-assets.cjs');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function createMidiDeletion({assets,getRoot,trash}) {
 async function plan(track,selection) {
  const {stem,engine,runId}=selection||{};
  if(!profileFor(engine)?.stems.includes(stem)||!runId)throw Error('midi-delete-invalid');
  const result=await assets.readMidi(track,stem,engine);
  if(!result.ok||result.runId!==runId)throw Error('midi-delete-changed');
  const root=path.resolve(getRoot()),directory=path.join(assets.directory(track),'midi',stem,runId);
  await guarded(root,directory);
  const names=(await fs.readdir(directory)).sort(),expected=[stem+'.mid','notes.json'].sort();
  if(JSON.stringify(names)!==JSON.stringify(expected))throw Error('midi-delete-unknown-files');
  const fingerprints=[];
  for(const name of names){const file=await guarded(root,path.join(directory,name)),stat=await fs.lstat(file);if(!stat.isFile())throw Error('midi-delete-unknown-files');fingerprints.push([name,hash(await fs.readFile(file))]);}
  const active=await assets.readMidi(track,stem),preferred=defaultEngine(stem);
  const fallback=active.ok&&active.runId===runId&&preferred!==engine?await assets.readMidi(track,stem,preferred):null;
  return {root,directory,stem,engine,runId,model:profileFor(engine).name,track:track.title,active:active.ok&&active.runId===runId,
   fallback:fallback?.ok?fallback:null,revision:hash(JSON.stringify([root,directory,result.sourceRunId,result.source,active.ok?active.runId:null,fallback?.ok?fallback.runId:null,fingerprints]))};
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
  if(fresh.fallback){try{await assets.midi.activate(track,fresh.fallback);activated=fresh.fallback.engine;}catch(error){activationError=error.message;}}
  return {ok:true,deleted:true,stem:fresh.stem,engine:fresh.engine,runId:fresh.runId,activated,activationError};
 }
 return {plan,clear};
}
module.exports={createMidiDeletion};
