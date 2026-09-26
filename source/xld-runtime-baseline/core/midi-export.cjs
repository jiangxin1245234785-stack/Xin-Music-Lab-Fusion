'use strict';
// Export is an exact copy of a verified active run. No re-synthesis and no dependency on a model runtime.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const within=(base,file)=>{const rel=path.relative(base,file);return rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));};
function createMidiExport({assets,protectedRoots=()=>[]}){
 async function prepare(track,{stem,runId}){
  const value=await assets.readMidi(track,stem);
  if(!value.ok)return {ok:false,error:value.error||'midi-missing'};
  if(!runId||value.runId!==runId)return {ok:false,error:'export-version-changed'};
  const source=path.join(assets.directory(track),value.file),bytes=await fs.readFile(source);
  const name=(track.title||'Track').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,100);
  return {ok:true,bytes,source,runId,stem,filename:name+' - '+stem+' - '+runId.slice(0,8)+'.mid'};
 }
 async function write(prepared,destination){
  if(!prepared?.ok)return {ok:false,error:'midi-missing'};
  let temporary=null;
  try{
   const target=path.resolve(destination);
   if(!/\.midi?$/i.test(target))return {ok:false,error:'export-extension'};
   const parent=await fs.realpath(path.dirname(target)),resolved=path.join(parent,path.basename(target));
   const link=await fs.lstat(resolved).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
   if(link?.isSymbolicLink()||link?.isDirectory())return {ok:false,error:'export-protected'};
   for(const directory of protectedRoots()){
    const root=await fs.realpath(directory).catch(()=>path.resolve(directory));
    if(within(root,resolved))return {ok:false,error:'export-protected'};
   }
   const original=await fs.realpath(prepared.source);
   if(resolved.toLowerCase()===original.toLowerCase())return {ok:false,error:'export-protected'};
   if(link){const stat=await fs.stat(original);if(stat.ino===link.ino&&stat.dev===link.dev)return {ok:false,error:'export-protected'};}
   temporary=path.join(parent,'.xld-export-'+crypto.randomUUID()+'.tmp');
   await fs.writeFile(temporary,prepared.bytes,{flag:'wx'});
   await fs.rename(temporary,resolved);temporary=null;
   return {ok:true,path:resolved,runId:prepared.runId,stem:prepared.stem,bytes:prepared.bytes.length};
  }catch(_){return {ok:false,error:'export-write-failed'};}
  finally{if(temporary)await fs.rm(temporary,{force:true}).catch(()=>{});}
 }
 return {prepare,write};
}
module.exports={createMidiExport};
