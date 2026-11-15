'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
function notesRoot(appData,userData){return path.basename(path.dirname(appData)).toLowerCase()==='xinmusicdevelopment'?path.join(path.dirname(appData),'Listening Notes'):path.join(userData,'Listening Notes');}
function createStore(root){
 const folder=track=>{if(typeof track!=='string'||! /^[a-z0-9_-]{1,80}$/i.test(track))throw Error('notes-track-invalid');return path.join(root,track);};
 const file=(track,id)=>{if(!/^[a-f0-9-]{36}$/.test(id))throw Error('notes-id-invalid');return path.join(folder(track),id+'.json');};
 const queues=new Map();
 async function serial(key,action){const previous=queues.get(key)||Promise.resolve();const task=previous.catch(()=>{}).then(action);queues.set(key,task);try{return await task;}finally{if(queues.get(key)===task)queues.delete(key);}}
 function validate(value,duration=86400){
  const {start,end,text}=value||{};
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>duration)throw Error('notes-time-invalid');
  if(typeof text!=='string'||!text.trim()||text.length>500)throw Error('notes-text-invalid');
  const rounded={start:Math.round(start*1000)/1000,end:Math.round(end*1000)/1000,text:text.trim()};
  if(rounded.end<=rounded.start||rounded.end>duration)throw Error('notes-time-invalid');
  return rounded;
 }
 async function read(track,id){const body=JSON.parse(await fs.readFile(file(track,id),'utf8'));if(body.trackId!==track||body.id!==id)throw Error('notes-identity-invalid');validate(body);return body;}
 async function list(track){const dir=folder(track);let files;try{files=await fs.readdir(dir);}catch(e){if(e.code==='ENOENT')return [];throw e;}
  const rows=await Promise.all(files.filter(f=>/^[a-f0-9-]{36}\.json$/.test(f)).map(f=>read(track,f.slice(0,-5))));return rows.sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id));
 }
 async function archive(track,previous){const dir=path.join(folder(track),'.history');await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,previous.id+'.'+crypto.randomUUID()+'.json'),JSON.stringify(previous,null,2),'utf8');}
 async function save(track,input,duration){
  folder(track);const id=input.id||crypto.randomUUID();return serial(track+'/'+id,async()=>{
   const valid=validate(input,duration),target=file(track,id);let previous=null;
   if(input.id)previous=await read(track,id);
   const result={schemaVersion:1,trackId:track,id,...valid,updatedAt:new Date().toISOString()};
   await fs.mkdir(folder(track),{recursive:true});if(previous)await archive(track,previous);
   const temp=target+'.'+crypto.randomUUID()+'.tmp';try{await fs.writeFile(temp,JSON.stringify(result,null,2),'utf8');await fs.rename(temp,target);}finally{await fs.rm(temp,{force:true}).catch(()=>{});}return result;
  });
 }
 async function remove(track,id){return serial(track+'/'+id,async()=>{const previous=await read(track,id);await archive(track,previous);await fs.unlink(file(track,id));return {ok:true};});}
 return {list,save,remove};
}
module.exports={createStore,notesRoot};
