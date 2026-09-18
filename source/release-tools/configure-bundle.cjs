'use strict';
const fs=require('node:fs'),path=require('node:path');
const [runtimeRoot,configFile,releaseVersion='0.5.0-rc.6',refinementRoot,refinementRoformerRoot]=process.argv.slice(2);
const relative=sub=>path.relative(path.dirname(configFile),path.join(runtimeRoot,sub)).replaceAll('\\','/');
const paths={XLD_RUNTIME_ROOT:'scripts',XLD_STABLE_RUNTIME_ROOT:'scripts',XLD_PYTHON:'envs/msaf/python.exe',XLD_AI_PYTHON:'envs/ai/python.exe',XLD_HARMONY_PYTHON:'envs/ai/python.exe',XLD_MIDI_PYTHON:'envs/basic/python.exe',XLD_HIGHRES_PYTHON:'envs/highres/python.exe',XLD_ROFORMER_PYTHON:'envs/roformer/python.exe',XLD_HIGHRES_MODELS:'models/highres',XLD_ROFORMER_MODELS:'models/roformer',TORCH_HOME:'models/torch',XLD_SEPARATION_TORCH_HOME:'models/demucs',HF_HOME:'models/huggingface',NUMBA_CACHE_DIR:'cache/numba',MPLCONFIGDIR:'cache/matplotlib'};
const configured=Object.fromEntries(Object.entries(paths).map(([key,value])=>[key,relative(value)]));
if(refinementRoot){if(!path.isAbsolute(refinementRoot))throw Error('Absolute refinement path required');configured.XLD_REFINE_MODELS=path.relative(path.dirname(configFile),refinementRoot).replaceAll('\\','/');}
if(refinementRoformerRoot){if(!path.isAbsolute(refinementRoformerRoot))throw Error('Absolute refinement RoFormer path required');configured.XLD_REFINE_ROFORMER_MODELS=path.relative(path.dirname(configFile),refinementRoformerRoot).replaceAll('\\','/');}
fs.mkdirSync(path.dirname(configFile),{recursive:true});fs.writeFileSync(configFile,JSON.stringify({schemaVersion:1,releaseVersion,kind:'isolated-runtime',paths:configured,flags:{HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1',HF_HUB_DISABLE_TELEMETRY:'1'}},null,2));
