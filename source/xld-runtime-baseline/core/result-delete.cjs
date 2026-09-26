'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {guarded}=require('./storage.cjs');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
// A section or chord engine writes exactly these three files and nothing else.
//
// The safety property is that this set is derived from the engine id and NEVER from a directory listing, so no
// file the platform did not itself name can become a deletion target. manual-tags.json, track.json, stems.json,
// music-lab.json and every other neighbour in the track directory sit outside the image of this function for
// every possible input — not because anything remembers to avoid them, but because nothing can produce them.
//
// `<engine>.next.<taskId>.json` is deliberately NOT here. That is another run's staging file
// (analysis-service.cjs:305), which the service cleans up itself in its own finally; deleting it from here kills
// an analysis in flight — in another window, on another build — and the only symptom is that run failing.
const targetNames=id=>[id+'.json',id+'.error.json',id+'.cancelled.json'];
function createResultDeletion({getRoot,trash}) {
 async function plan(directory,engines) {
  const root=path.resolve(getRoot()),entries=[];
  for(const id of engines) for(const name of targetNames(id)) {
   const file=path.join(directory,name);
   let stat=null;
   try{stat=await fs.lstat(file);}catch(error){if(error.code!=='ENOENT')throw error;}
   entries.push({id,name,file,kind:!stat?'missing':stat.isSymbolicLink()?'link':stat.isFile()?'file':'other',
    digest:stat&&stat.isFile()&&!stat.isSymbolicLink()?hash(await fs.readFile(file)):null});
  }
  return {root,directory,entries,present:entries.filter(entry=>entry.kind==='file').map(entry=>entry.name)};
 }
 // The one choke point. Every deletion re-derives the name from the engine id and re-checks the path, so a caller
 // cannot hand in a file that was never a legitimate target.
 async function assertDeletable(root,directory,entry) {
  if(path.dirname(entry.file)!==directory)throw Error('result-delete-path-invalid');
  if(!targetNames(entry.id).includes(path.basename(entry.file)))throw Error('result-delete-name-invalid');
  await guarded(root,entry.file);
  const stat=await fs.lstat(entry.file);
  if(!stat.isFile()||stat.isSymbolicLink())throw Error('result-delete-not-a-file');
  return hash(await fs.readFile(entry.file));
 }
 async function clear(directory,engines) {
  if(typeof trash!=='function')throw Error('result-delete-trash-unavailable');
  const fresh=await plan(directory,engines);
  const deleted=[],failed=[];
  for(const entry of fresh.entries) {
   if(entry.kind==='missing')continue;
   try{
    const digest=await assertDeletable(fresh.root,fresh.directory,entry);
    if(digest!==entry.digest)throw Error('result-delete-changed');
    await trash(entry.file);
    // shell.trashItem can quietly no-op on a long or non-ASCII path. A deletion that did not happen must never
    // read as one that did, and there is no fall-back to removing the file for real.
    let gone=false;
    try{await fs.lstat(entry.file);}catch(error){gone=error.code==='ENOENT';}
    if(!gone)throw Error('result-delete-not-trashed');
    deleted.push(entry.name);
   }catch(error){failed.push({file:entry.name,error:error.message});}
  }
  return {ok:failed.length===0,deleted,failed};
 }
 return {plan,clear,targetNames};
}
module.exports={createResultDeletion,targetNames};
