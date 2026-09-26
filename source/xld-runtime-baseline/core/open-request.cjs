'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const filename='.xml-open-request.json';
async function writeRequest(root, request) {
  await fs.mkdir(root,{recursive:true});
  const id=crypto.randomUUID(),temporary=path.join(root,filename+'.'+id+'.tmp');
  try {
    await fs.writeFile(temporary,JSON.stringify({...request,requestId:id,requestedAt:new Date().toISOString()},null,2),'utf8');
    await fs.rename(temporary,path.join(root,filename));
  } finally {await fs.rm(temporary,{force:true}).catch(()=>{});}
  return id;
}
// Windows can complete two concurrently submitted renames against the same opened source.
// The desktop owns a single consumer process; serialize its polling calls per request directory.
const readers=new Map();
function consumeRequest(root) {
  const key=process.platform==='win32'?path.resolve(root).toLowerCase():path.resolve(root);
  const previous=readers.get(key);
  const pending=previous?previous.catch(()=>{}).then(()=>consumeClaimed(root)):consumeClaimed(root);
  readers.set(key,pending);
  return pending.finally(()=>{if(readers.get(key)===pending)readers.delete(key);});
}
async function consumeClaimed(root) {
  const claimed=path.join(root,filename+'.'+crypto.randomUUID()+'.reading');
  try{await fs.rename(path.join(root,filename),claimed);}catch(error){if(error.code==='ENOENT')return null;throw error;}
  try {
    const value=JSON.parse(await fs.readFile(claimed,'utf8'));
    return value && typeof value.source==='string' && value.source ? value : null;
  } catch(_){return null;}
  finally {await fs.rm(claimed,{force:true}).catch(()=>{});}
}
module.exports={writeRequest,consumeRequest};
