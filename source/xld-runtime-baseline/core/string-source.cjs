'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url');
const TARGETS=Object.freeze({strings:48,'strings-all':48,violin:40,viola:41,cello:42,'double-bass':43});
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/,KEY=/^[a-f0-9]{64}$/;
function createStringSource({assets}){
 const refinement=require('./refinement.cjs').createRefinement({assets});
 const pointer=track=>path.join(assets.directory(track),'midi','strings-source.json');
 async function resolve(track,selection){
  if(!KEY.test(selection?.cacheKey||'')||!UUID.test(selection?.runId||''))throw Error('midi-string-source-invalid');
  const folder=path.join(assets.directory(track),'refinement');
  const manifest=path.join(folder,selection.cacheKey+'.json');
  await require('./storage.cjs').guarded(assets.directory(track),manifest);
  const saved=JSON.parse(await fs.readFile(manifest,'utf8'));
  if(saved.runId!==selection.runId||saved.engine!=='mega-53'||saved.scope!=='full'||saved.timeOrigin!==0||!Object.hasOwn(TARGETS,saved.target))throw Error('midi-string-source-invalid');
  const result=await refinement.read(track,{engine:saved.engine,scope:'full',sourceStem:saved.sourceStem,target:saved.target,device:saved.requestedDevice});
  if(!result.ok||result.runId!==selection.runId||result.cacheKey!==selection.cacheKey)throw Error('midi-string-source-stale');
  const input=path.join(folder,result.files.target);
  await require('./storage.cjs').guarded(assets.directory(track),input);
  return {runId:result.runId,cacheKey:result.cacheKey,path:input,audioUrl:result.urls.target,
   rawAudioUrl:pathToFileURL(input).href,duration:result.duration,timeOrigin:0,target:result.target,program:TARGETS[result.target],
   parentRunId:result.parentRunId,sourceStem:result.sourceStem,engine:result.engine,createdAt:result.createdAt||''};
 }
 async function selection(track){try{return JSON.parse(await fs.readFile(pointer(track),'utf8'));}catch(error){if(error.code==='ENOENT'||error instanceof SyntaxError)return null;throw error;}}
 async function current(track){const value=await selection(track);if(!value?.runId)return null;try{return await resolve(track,value);}catch{return null;}}
 async function list(track){
  const folder=path.join(assets.directory(track),'refinement');let names=[];
  try{names=await fs.readdir(folder);}catch(error){if(error.code!=='ENOENT')throw error;}
  const choices=[];
  for(const name of names){if(!/^[a-f0-9]{64}\.json$/.test(name))continue;
   try{const value=JSON.parse(await fs.readFile(path.join(folder,name),'utf8'));if(value.engine==='mega-53'&&value.scope==='full'&&Object.hasOwn(TARGETS,value.target))choices.push(await resolve(track,{cacheKey:name.slice(0,-5),runId:value.runId}));}catch{/* A stale, partial or deleted result is not a transcription input. */}
  }
  choices.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.runId.localeCompare(b.runId));
  const picked=await selection(track),active=choices.find(item=>item.runId===picked?.runId&&item.cacheKey===picked?.cacheKey)||null;
  return {choices,active,unavailable:Boolean(picked?.runId&&!active)};
 }
 async function select(track,value){
  const selected=value===null?null:await resolve(track,value);
  await require('./derived-assets.cjs').writeAtomic(pointer(track),{schemaVersion:1,kind:'midi-string-source',runId:selected?.runId||null,cacheKey:selected?.cacheKey||null});
  return {ok:true,source:selected};
 }
 return {current,list,select,resolve};
}
module.exports={createStringSource,TARGETS};
