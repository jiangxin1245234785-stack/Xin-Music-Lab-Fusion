'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {notesRoot}=require('./score-notes.cjs');
const rootFor=(appData,userData)=>path.join(path.dirname(notesRoot(appData,userData)),'Listening State');
function valid(value){
 if(value?.schemaVersion!==1||!/^[a-z0-9_-]{1,80}$/i.test(value.trackId||'')||!Number.isFinite(value.time)||value.time<0||value.time>86400)throw Error('listening-state-invalid');
 return {schemaVersion:1,trackId:value.trackId,time:Math.round(value.time*100)/100,updatedAt:Number.isFinite(value.updatedAt)&&value.updatedAt>=0?value.updatedAt:0};
}
function createStore(root){
 if(!path.isAbsolute(root))throw Error('listening-root-invalid');
 const file=path.join(root,'resume.json');let pending=Promise.resolve();
 return {async read(){await pending.catch(()=>{});try{return valid(JSON.parse(await fs.readFile(file,'utf8')));}catch(e){if(e.code==='ENOENT')return null;throw e;}},
 save(value){const record=valid(value);const task=pending.catch(()=>{}).then(async()=>{record.updatedAt=Date.now();await fs.mkdir(root,{recursive:true});const temp=path.join(root,'resume.'+crypto.randomUUID()+'.tmp');try{await fs.writeFile(temp,JSON.stringify(record),'utf8');await fs.rename(temp,file);}finally{await fs.rm(temp,{force:true}).catch(()=>{});}return record;});pending=task;return task;}};
}
module.exports={rootFor,createStore,valid};
