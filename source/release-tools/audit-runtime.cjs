'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const [root,report]=process.argv.slice(2);
const specs={msaf:['numpy','scipy','librosa','msaf'],ai:['torch','librosa','transformers','demucs'],basic:['numpy','onnxruntime','basic_pitch'],highres:['torch','piano_transcription_inference','pretty_midi'],roformer:['torch','bs_roformer','ml_collections']};
const results=[];
for(const [name,modules] of Object.entries(specs)){
 const python=path.join(root,'envs',name,'python.exe');
 const result=spawnSync(python,[path.join(__dirname,'audit-runtime.py'),root,...modules],{windowsHide:true,encoding:'utf8',timeout:180000,maxBuffer:5*1024*1024,env:{...process.env,PYTHONHOME:'Z:/missing-python',PYTHONPATH:'Z:/missing-packages',PYTHONUSERBASE:'Z:/missing-user',PATH:path.join(process.env.SystemRoot,'System32'),PYTHONDONTWRITEBYTECODE:'1',NUMBA_CACHE_DIR:path.join(root,'cache/numba'),MPLCONFIGDIR:path.join(root,'cache/matplotlib'),HF_HOME:path.join(root,'models/huggingface'),HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1'}});
 let data;try{data=JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));}catch(_){}
 const item={name,ok:result.status===0 && data?.ok && data?.isolated===1,data,error:result.error?.message||(!data?result.stderr.slice(-3500):undefined)};results.push(item);console.log(JSON.stringify({name,ok:item.ok,error:item.error}));
 fs.writeFileSync(report,JSON.stringify({ok:results.every(item=>item.ok),complete:results.length===5,results},null,2));
}
if(results.some(item=>!item.ok))process.exitCode=1;
