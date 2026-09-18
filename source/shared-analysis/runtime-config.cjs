'use strict';
const fs=require('node:fs'),path=require('node:path');
const keys=['XLD_RUNTIME_ROOT','XLD_STABLE_RUNTIME_ROOT','XLD_PYTHON','XLD_AI_PYTHON','XLD_HARMONY_PYTHON','XLD_MIDI_PYTHON','XLD_HIGHRES_PYTHON','XLD_ROFORMER_PYTHON','XLD_HIGHRES_MODELS','XLD_ROFORMER_MODELS','TORCH_HOME','XLD_SEPARATION_TORCH_HOME','HF_HOME','NUMBA_CACHE_DIR','MPLCONFIGDIR','XLD_REFINE_MODELS','XLD_REFINE_ROFORMER_MODELS','XLD_YOURMT3_ROOT','XLD_YOURMT3_PYTHON','XLD_MUSCRIPTOR_ROOT','XLD_MUSCRIPTOR_PYTHON'];
function read(file){
 const config=JSON.parse(fs.readFileSync(file,'utf8'));
 if(config.schemaVersion!==1 || !config.paths || typeof config.paths!=='object')throw Error('Invalid runtime.json');
 const paths={};
 for(const [key,value] of Object.entries(config.paths)){
  if(!keys.includes(key)||typeof value!=='string'||!value.trim())throw Error('Invalid runtime path: '+key);
  paths[key]=path.resolve(path.dirname(file),value);
 }
 for(const key of keys.slice(0,12))if(!paths[key])throw Error('Missing runtime setting: '+key);
 const flags=config.flags || {};
 for(const [key,value] of Object.entries(flags))if(!['HF_HUB_OFFLINE','TRANSFORMERS_OFFLINE','HF_HUB_DISABLE_TELEMETRY'].includes(key)||!['0','1'].includes(value))throw Error('Invalid runtime flag: '+key);
 return {schemaVersion:1,paths,flags};
}
function inspect(config){
 const missing=[];
 for(const [key,value] of Object.entries(config.paths)){
  if(['NUMBA_CACHE_DIR','MPLCONFIGDIR'].includes(key))continue;
  const kind=key.endsWith('_PYTHON')?'file':'directory';
  try{const stat=fs.statSync(value);if(!(kind==='file'?stat.isFile():stat.isDirectory()))missing.push({key,path:value});}catch(_){missing.push({key,path:value});}
 }
 return {ok:missing.length===0,missing};
}
function apply(file,env=process.env){
 const config=read(file);
 // Bind the release's reviewed environment before importing either application.
 for(const [key,value] of Object.entries(config.paths))env[key]=value;
 for(const [key,value] of Object.entries(config.flags))env[key]=value;
 env.PYTHONDONTWRITEBYTECODE='1';env.PYTHONUTF8='1';
 return inspect(config);
}
module.exports={read,inspect,apply};
