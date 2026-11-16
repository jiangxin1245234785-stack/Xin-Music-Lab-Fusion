'use strict';
// The input of a part transcribed from a refinement result rather than from a stem: the strings (since 2026-09) and,
// W1 (2026-11-15), the winds. A pointer per part (midi/strings-source.json, midi/winds-source.json) names one full
// Mega 53 result of that part's targets; the MIDI of the part is made from its target file. The winds pointer can also
// say "this song has no winds" (none: the measured numbers), so nothing is transcribed and no lane is shown.
const fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url');
const TARGETS=Object.freeze({strings:48,'strings-all':48,violin:40,viola:41,cello:42,'double-bass':43});
// Mega 53's wind targets (analysis-refine/mega-targets.json, group "wind"). The program is only a fallback: MuScriptor
// gives every wind instrument it hears its own track and General MIDI program.
const WIND_TARGETS=Object.freeze({wind:56,woodwind:71,brass:61,flute:73,saxophone:65});
const PARTS=Object.freeze({
 strings:Object.freeze({targets:TARGETS,file:'strings-source.json',kind:'midi-string-source',error:'midi-string-source'}),
 winds:Object.freeze({targets:WIND_TARGETS,file:'winds-source.json',kind:'midi-winds-source',error:'midi-winds-source'})
});
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/,KEY=/^[a-f0-9]{64}$/;
function createPartSource({assets,part='strings'}){
 const spec=PARTS[part];if(!spec)throw Error('part-source-invalid');
 const refinement=require('./refinement.cjs').createRefinement({assets});
 const pointer=track=>path.join(assets.directory(track),'midi',spec.file);
 async function resolve(track,selection){
  if(!KEY.test(selection?.cacheKey||'')||!UUID.test(selection?.runId||''))throw Error(spec.error+'-invalid');
  const folder=path.join(assets.directory(track),'refinement');
  const manifest=path.join(folder,selection.cacheKey+'.json');
  await require('./storage.cjs').guarded(assets.directory(track),manifest);
  const saved=JSON.parse(await fs.readFile(manifest,'utf8'));
  if(saved.runId!==selection.runId||saved.engine!=='mega-53'||saved.scope!=='full'||saved.timeOrigin!==0||!Object.hasOwn(spec.targets,saved.target))throw Error(spec.error+'-invalid');
  const result=await refinement.read(track,{engine:saved.engine,scope:'full',sourceStem:saved.sourceStem,target:saved.target,device:saved.requestedDevice});
  if(!result.ok||result.runId!==selection.runId||result.cacheKey!==selection.cacheKey)throw Error(spec.error+'-stale');
  const input=path.join(folder,result.files.target);
  await require('./storage.cjs').guarded(assets.directory(track),input);
  return {runId:result.runId,cacheKey:result.cacheKey,path:input,audioUrl:result.urls.target,
   rawAudioUrl:pathToFileURL(input).href,duration:result.duration,timeOrigin:0,target:result.target,program:spec.targets[result.target],
   parentRunId:result.parentRunId,sourceStem:result.sourceStem,engine:result.engine,createdAt:result.createdAt||'',level:result.level||null};
 }
 async function selection(track){try{return JSON.parse(await fs.readFile(pointer(track),'utf8'));}catch(error){if(error.code==='ENOENT'||error instanceof SyntaxError)return null;throw error;}}
 async function current(track){const value=await selection(track);if(!value?.runId)return null;try{return await resolve(track,value);}catch{return null;}}
 async function list(track){
  const folder=path.join(assets.directory(track),'refinement');let names=[];
  try{names=await fs.readdir(folder);}catch(error){if(error.code!=='ENOENT')throw error;}
  const choices=[];
  for(const name of names){if(!/^[a-f0-9]{64}\.json$/.test(name))continue;
   try{const value=JSON.parse(await fs.readFile(path.join(folder,name),'utf8'));if(value.engine==='mega-53'&&value.scope==='full'&&Object.hasOwn(spec.targets,value.target))choices.push(await resolve(track,{cacheKey:name.slice(0,-5),runId:value.runId}));}catch{/* A stale, partial or deleted result is not a transcription input. */}
  }
  choices.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.runId.localeCompare(b.runId));
  const picked=await selection(track),active=choices.find(item=>item.runId===picked?.runId&&item.cacheKey===picked?.cacheKey)||null;
  return {choices,active,unavailable:Boolean(picked?.runId&&!active),none:picked?.none?{fromRunId:picked.fromRunId||null,level:picked.level||null,at:picked.at||null}:null};
 }
 async function select(track,value){
  const selected=value===null?null:await resolve(track,value);
  await require('./derived-assets.cjs').writeAtomic(pointer(track),{schemaVersion:1,kind:spec.kind,runId:selected?.runId||null,cacheKey:selected?.cacheKey||null});
  return {ok:true,source:selected};
 }
 // The extraction found (nearly) nothing of this part: say so, so nothing is transcribed and no lane is drawn.
 async function markNone(track,{fromRunId=null,level=null}={}){
  await require('./derived-assets.cjs').writeAtomic(pointer(track),{schemaVersion:1,kind:spec.kind,runId:null,cacheKey:null,none:true,fromRunId,level,at:new Date().toISOString()});
  return {ok:true,none:true};
 }
 // A finished extraction of this part: the source of its MIDI, or - when it holds (nearly) nothing - "none".
 async function adopt(track,selection){
  const found=await resolve(track,selection);
  if(found.level&&isNone(found.level))return {...(await markNone(track,{fromRunId:found.runId,level:found.level})),level:found.level};
  return {...(await select(track,selection)),none:false,level:found.level||null};
 }
 return {current,list,select,resolve,markNone,adopt,part};
}
// "This song has none of it", from the runner's `level` (analysis-refine/runner.py, method 1): measured on the winds
// test song and on songs with no winds (work/winds-20261115/REPORT-W1.md). A result without `level` (made before) is
// never judged by this.
// No-winds songs: within30dB 0.004-0.057, rms -14 to -45 dB; the winds test song (chained): 0.376, -0.4 dB.
const NONE=Object.freeze({rmsVsInputDb:-10,within30dB:0.12});
const isNone=level=>Number.isFinite(level?.rmsVsInputDb)&&Number.isFinite(level?.within30dB)&&(level.rmsVsInputDb<NONE.rmsVsInputDb||level.within30dB<NONE.within30dB);
const createStringSource=({assets})=>createPartSource({assets,part:'strings'});
module.exports={createStringSource,createPartSource,TARGETS,WIND_TARGETS,PARTS,NONE,isNone};
