'use strict';
const fs=require('node:fs'),path=require('node:path');
const relativeTo=(file,target)=>{
 const relative=path.relative(path.dirname(file),target);
 if(path.isAbsolute(relative))throw Error('Program configuration and runtime must be on the same volume');
 return (relative || '.').split(path.sep).join('/');
};
function configure({runtimeRoot,configFile,releaseVersion='0.5.0-rc.6',refinementRoot,refinementRoformerRoot,yourmt3Root,muscriptorRoot,muscriptorPython,chordsRoot,drumsepRoot,channel}){
 for(const value of [runtimeRoot,configFile])if(!value||!path.isAbsolute(value))throw Error('Absolute runtime and configuration paths required');
 if(channel!==undefined&&channel!=='preview')throw Error('Unknown release channel');
 const paths={XLD_RUNTIME_ROOT:'scripts',XLD_STABLE_RUNTIME_ROOT:'scripts',XLD_PYTHON:'envs/msaf/python.exe',XLD_AI_PYTHON:'envs/ai/python.exe',XLD_HARMONY_PYTHON:'envs/ai/python.exe',XLD_MIDI_PYTHON:'envs/basic/python.exe',XLD_HIGHRES_PYTHON:'envs/highres/python.exe',XLD_ROFORMER_PYTHON:'envs/roformer/python.exe',XLD_HIGHRES_MODELS:'models/highres',XLD_ROFORMER_MODELS:'models/roformer',TORCH_HOME:'models/torch',XLD_SEPARATION_TORCH_HOME:'models/demucs',HF_HOME:'models/huggingface',NUMBA_CACHE_DIR:'cache/numba',MPLCONFIGDIR:'cache/matplotlib'};
 const configured=Object.fromEntries(Object.entries(paths).map(([key,value])=>[key,relativeTo(configFile,path.join(runtimeRoot,value))]));
 const addons=path.resolve(runtimeRoot,'../addons');
 const optional=(explicit,name)=>{if(explicit){if(!path.isAbsolute(explicit))throw Error('Absolute addon path required');return explicit;}const candidate=path.join(addons,name);return fs.existsSync(candidate)?candidate:null;};
 const roots={XLD_REFINE_MODELS:optional(refinementRoot,'audiosep-v1'),XLD_REFINE_ROFORMER_MODELS:optional(refinementRoformerRoot,'refine-roformer-v1'),XLD_YOURMT3_ROOT:optional(yourmt3Root,'yourmt3-v1'),XLD_MUSCRIPTOR_ROOT:optional(muscriptorRoot,'muscriptor-v1'),XLD_CHORDS_ROOT:optional(chordsRoot,'chords-v1'),XLD_DRUMSEP_ROOT:optional(drumsepRoot,'drumsep-v1')};
 for(const [key,value]of Object.entries(roots))if(value)configured[key]=relativeTo(configFile,value);
 if(roots.XLD_YOURMT3_ROOT)configured.XLD_YOURMT3_PYTHON=relativeTo(configFile,path.join(roots.XLD_YOURMT3_ROOT,'python.exe'));
 if(roots.XLD_CHORDS_ROOT){
  const own=path.join(roots.XLD_CHORDS_ROOT,'python.exe');
  if(!fs.existsSync(own))throw Error('chords-v1 addon requires its own python.exe');
  configured.XLD_CHORDS_PYTHON=relativeTo(configFile,own);
 }
 if(roots.XLD_MUSCRIPTOR_ROOT){
  const own=path.join(roots.XLD_MUSCRIPTOR_ROOT,'python.exe');
  const python=muscriptorPython || (fs.existsSync(own)?own:roots.XLD_YOURMT3_ROOT?path.join(roots.XLD_YOURMT3_ROOT,'python.exe'):null);
  if(!python||!path.isAbsolute(python))throw Error('MuScriptor requires its configured Python, or the shared YourMT3 runtime');
  configured.XLD_MUSCRIPTOR_PYTHON=relativeTo(configFile,python);
 }
 const config={schemaVersion:1,releaseVersion,kind:'isolated-runtime',...(channel?{channel}:{}),paths:configured,flags:{HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1',HF_HUB_DISABLE_TELEMETRY:'1'}};
 fs.mkdirSync(path.dirname(configFile),{recursive:true});fs.writeFileSync(configFile,JSON.stringify(config,null,2));return config;
}
if(require.main===module){const [runtimeRoot,configFile,releaseVersion,refinementRoot,refinementRoformerRoot,yourmt3Root,muscriptorRoot]=process.argv.slice(2);configure({runtimeRoot,configFile,releaseVersion,refinementRoot,refinementRoformerRoot,yourmt3Root,muscriptorRoot});}
module.exports={configure};
