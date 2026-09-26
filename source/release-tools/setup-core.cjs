'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const groups=[
 {id:'midi',label:['MIDI 保存与导出','MIDI save & export'],keys:['XLD_MIDI_PYTHON'],runner:'analysis-midi/revise.py',ids:['manual-revision'],links:['https://github.com/craffel/pretty-midi']},
 {id:'muscriptor',label:['MuScriptor 转谱','MuScriptor transcription'],keys:['XLD_MUSCRIPTOR_PYTHON','XLD_MUSCRIPTOR_ROOT'],runner:'analysis-midi/runner.py',ids:['muscriptor-medium','muscriptor-large'],links:['https://huggingface.co/MuScriptor/muscriptor-medium','https://huggingface.co/MuScriptor/muscriptor-large'],notice:['权重需本人授权，非商业许可；目录中还需 upstream 源码。','Weights require personal authorization, with noncommercial terms. The directory must also contain upstream code.']},
 {id:'roformer',label:['SW 基础分轨','SW separation'],keys:['XLD_ROFORMER_PYTHON','XLD_ROFORMER_MODELS'],runner:'analysis-separation/runner.py',ids:['bs-roformer-sw'],links:['https://huggingface.co/enerjazzer/BS-ROFO-SW-Fixed'],notice:['权重许可待确认；仅导入已有环境，不提供自动下载。','Weight license unresolved; import an existing environment only. No automatic download.']},
 {id:'mega',label:['Mega53 乐器细分','Mega53 target extraction'],keys:['XLD_ROFORMER_PYTHON','XLD_REFINE_ROFORMER_MODELS'],runner:'analysis-refine/runner.py',ids:['mega-53'],links:['https://github.com/ZFTurbo/Music-Source-Separation-Training/releases/tag/v1.0.21'],notice:['与 SW 共用解释器；权重目录需 manifest.json。','Shares the SW interpreter. The model directory needs manifest.json.']},
 {id:'demucs',label:['Demucs 分轨','Demucs separation'],keys:['XLD_AI_PYTHON','XLD_SEPARATION_TORCH_HOME'],runner:'analysis-separation/runner.py',ids:['demucs-6s'],links:['https://github.com/facebookresearch/demucs']},
 {id:'highres',label:['钢琴与贝斯转谱','Piano & bass transcription'],keys:['XLD_HIGHRES_PYTHON','XLD_HIGHRES_MODELS'],runner:'analysis-midi/runner.py',ids:['piano-highres','bass-highres','piano-transkun'],links:['https://huggingface.co/xavriley/midi-transcription-models']},
 {id:'yourmt3',label:['YourMT3+ 转谱','YourMT3+ transcription'],keys:['XLD_YOURMT3_PYTHON','XLD_YOURMT3_ROOT'],runner:'analysis-midi/runner.py',ids:['yourmt3-plus'],links:['https://huggingface.co/spaces/mimbres/YourMT3']},
 {id:'sections',label:['SongFormer 段落','SongFormer sections'],keys:['XLD_AI_PYTHON','XLD_RUNTIME_ROOT'],external:'analysis-ai/songformer_runner.py',ids:['songformer'],links:[]},
 {id:'chords',label:['和弦环境','Chord environment'],keys:['XLD_CHORDS_PYTHON','XLD_CHORDS_ROOT'],runner:'analysis-harmony/harmony_runner.py',ids:['chord-chordmini','chord-consonance'],links:[]}
];
function groupFor(id){const g=groups.find(x=>x.id===id);if(!g)throw Error('Unknown backend');return g;}
function validate(g,values){
 if(!values||typeof values!=='object'||Object.keys(values).some(k=>!g.keys.includes(k)))throw Error('Invalid settings');
 const result={};for(const key of g.keys){const value=values[key];if(typeof value!=='string'||!path.isAbsolute(value)||value.includes('\0'))throw Error('Select an absolute path: '+key);
 const stat=fs.statSync(value);if(key.endsWith('_PYTHON')?!stat.isFile()||!/^python(?:3(?:\.\d+)?)?\.exe$/i.test(path.basename(value)):!stat.isDirectory())throw Error('Wrong path type: '+key);result[key]=path.resolve(value);}
 return result;
}
function atomic(file,data){const tmp=file+'.'+crypto.randomUUID()+'.tmp';try{fs.writeFileSync(tmp,JSON.stringify(data,null,2),'utf8');fs.renameSync(tmp,file);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}}
function save(root,id,values){const g=groupFor(id),valid=validate(g,values),file=path.join(root,'runtime.json'),data=JSON.parse(fs.readFileSync(file,'utf8'));
 if(data.schemaVersion!==1||!data.paths)throw Error('Invalid runtime configuration');
 for(const [key,value]of Object.entries(valid)){const rel=path.relative(root,value);data.paths[key]=path.isAbsolute(rel)?value:rel.split(path.sep).join('/')||'.';}
 atomic(file,data);return {ok:true,restartRequired:true};
}
function run(exe,args,{env,signal,timeout=120000,onLog=()=>{}}={}){return new Promise((resolve,reject)=>{
 if(signal?.aborted)return reject(Error('Cancelled'));let out='',err='',done=false,child;
 try{child=spawn(exe,args,{env,windowsHide:true,stdio:['ignore','pipe','pipe']});}catch(e){return reject(e);}
 const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve(result);};
 const stop=()=>{if(process.platform==='win32'&&child.pid){const killer=spawn(path.join(process.env.SystemRoot||'C:/Windows','System32/taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.on('error',()=>child.kill());}else child.kill();};
 const abort=()=>{stop();finish(Error('Cancelled'));};
 const timer=setTimeout(()=>{stop();finish(Error('Timed out'));},timeout);
 signal?.addEventListener('abort',abort,{once:true});
 child.stdout.on('data',b=>{out=(out+b).slice(-1024*1024);onLog(String(b));});child.stderr.on('data',b=>{err=(err+b).slice(-16000);onLog(String(b));});
 child.on('error',e=>finish(e));child.on('close',code=>finish(null,{code,out,err}));
});}
function environment(root,values){const data=JSON.parse(fs.readFileSync(path.join(root,'runtime.json'),'utf8')),env={...process.env};
 // Never inherit a developer Python path or startup hook into probes/installs.
 for(const key of ['PYTHONPATH','PYTHONHOME','VIRTUAL_ENV'])delete env[key];
 for(const [key,v]of Object.entries(data.paths))env[key]=path.resolve(root,v);
 Object.assign(env,data.flags||{},values,{PYTHONUTF8:'1',PYTHONDONTWRITEBYTECODE:'1'});return env;
}
async function probe(root,id,values,{signal,execute=run}={}){
 const g=groupFor(id),valid=validate(g,values),env=environment(root,valid),python=valid[g.keys[0]],runner=g.external?path.join(valid.XLD_RUNTIME_ROOT,g.external):path.join(root,'resources/apps/xld-runtime-baseline',g.runner);
 if(!fs.existsSync(runner))throw Error('Runner missing; see MODEL-SETUP.md');
 const result=await execute(python,['-s','-X','utf8',runner,'--engines'],{env,signal});
 let engines=[];try{const start=result.out.indexOf('['),end=result.out.lastIndexOf(']');engines=JSON.parse(result.out.slice(start,end+1));if(!Array.isArray(engines))engines=[];}catch(_){}
 const selected=g.ids.map(id=>{const e=engines.find(x=>x.id===id);return {id,available:!!e?.available};});
 return {ok:result.code===0&&selected.some(x=>x.available),scope:id==='midi'?'midi-roundtrip':'availability-only',engines:selected,error:result.code===0?null:result.err.slice(-2000)||'Probe failed'};
}
function redact(text){return String(text).replace(/(?:hf_|gh[pousr]_|github_pat_)[A-Za-z0-9_]+/g,'[TOKEN]').replace(/[A-Z]:[\\/][^\r\n"<>]*/gi,'[LOCAL_PATH]').replace(/\\\\[^\r\n"<>]+/g,'[LOCAL_PATH]');}
module.exports={groups,groupFor,validate,save,atomic,run,probe,environment,redact};
