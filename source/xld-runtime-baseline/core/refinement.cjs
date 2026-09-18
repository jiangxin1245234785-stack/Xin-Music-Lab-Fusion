'use strict';
const fs=require('node:fs/promises'),fsSync=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process'),{fileURLToPath,pathToFileURL}=require('node:url');
const PROFILES=require('../analysis-refine/profiles.json');
const profileFor=id=>PROFILES.find(profile=>profile.id===id);
const idPattern=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
function createRefinement({assets,python=engine=>profileFor(engine)?.backend==='roformer'?process.env.XLD_ROFORMER_PYTHON:process.env.XLD_HIGHRES_PYTHON,spawnProcess=spawn,probeAudio}) {
 const runner=path.join(__dirname,'../analysis-refine/runner.py');
 const probeCache=new Map();
 async function probe(input,engine,stat){
  const key=JSON.stringify([input,stat.size,stat.mtimeMs]);
  if(probeCache.has(key))return probeCache.get(key);
  const info=probeAudio?await probeAudio(input):await new Promise((resolve,reject)=>{
   const child=spawnProcess(python(engine),[runner,'--probe','--input',input],{windowsHide:true,env:{...process.env,PYTHONUTF8:'1',PYTHONDONTWRITEBYTECODE:'1'}});
   let out='',err='';const timer=setTimeout(()=>{child.kill();reject(Error('读取音频信息超时'));},15000);
   child.stdout.on('data',part=>{out=(out+part).slice(-4000);});child.stderr.on('data',part=>{err=(err+part).slice(-2000);});
   child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('close',code=>{clearTimeout(timer);if(code!==0)return reject(Error(err.trim()||'无法读取原曲，请选择已有 WAV 音轨'));try{resolve(JSON.parse(out));}catch(error){reject(error);}});
  });
  if(!Number.isSafeInteger(info.frames)||info.frames<=0||!Number.isInteger(info.sampleRate)||info.sampleRate<=0||![1,2].includes(info.channels))throw Error('音频信息无效，仅支持单声道或双声道');
  if(probeCache.size>=32)probeCache.clear();probeCache.set(key,info);return info;
 }
 const directory=track=>path.join(assets.directory(track),'refinement');
 async function context(track,options={}) {
  const engine=options.engine||PROFILES.find(profile=>profile.default)?.id||PROFILES[0].id,scope=options.scope||'preview';
  let start=Number(options.start??0),duration=Number(options.duration??30);
  const profile=profileFor(engine),target=options.target||'strings',device=options.device||'auto';
  if(!profile)throw Error('refinement-engine-invalid');
  if(!['preview','full'].includes(scope)||(scope==='full'&&engine!=='mega-53'))throw Error('refinement-scope-invalid');
  if(!profile.targets.includes(target)||!['auto','cuda','cpu'].includes(device))throw Error('refinement-options-invalid');
  if(scope==='preview'&&(!Number.isFinite(start)||start<0||!Number.isFinite(duration)||duration<1||duration>30))throw Error('请选择有效的 1–30 秒片段');
  const sourceStem=options.sourceStem||'other';
  if(!['mix','other','guitar','piano','bass','drums','vocals'].includes(sourceStem)||(engine!=='mega-53'&&sourceStem!=='other'))throw Error('refinement-source-invalid');
  let parent=null,stem,input,stat;
  if(sourceStem==='mix'){
   input=path.resolve(track.filePath);stat=await fs.stat(input);stem=await probe(input,engine,stat);
  }else{
   parent=await assets.readStems(track);if(!parent.ok)throw Error('请先生成 WAV 分轨，或选择原曲作为来源');
   stem=parent.stems.find(item=>item.name===sourceStem);if(!stem)throw Error(sourceStem+' 音轨缺失');
   input=fileURLToPath(stem.audioUrl);stat=await fs.stat(input);
  }
  if(scope==='full'){start=0;duration=stem.frames/stem.sampleRate;}
  if(start>=stem.frames/stem.sampleRate)throw Error('起点已超过音轨长度');
  const modelRoot=process.env[profile.backend==='roformer'?'XLD_REFINE_ROFORMER_MODELS':'XLD_REFINE_MODELS'];if(!modelRoot)throw Error('细分模型尚未安装');
  const model=await fs.readFile(path.join(modelRoot,'manifest.json'));
  const identity={version:2,adapter:'selected-head-v1',trackId:track.id,parentRunId:parent?.runId||null,source:input,size:stat.size,mtimeMs:stat.mtimeMs,engine,target,device,start,duration,model:crypto.createHash('sha256').update(model).digest('hex')};
  if(scope==='full')identity.scope='full';
  if(sourceStem!=='other')identity.sourceStem=sourceStem;
  return {...identity,scope,input,parent,stem,sourceStem,cacheKey:crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex'),directory:directory(track)};
 }
 async function validate(result,ctx) {
  if(result?.kind!=='refinement'||result.schemaVersion!==2||!idPattern.test(result.runId||'')||result.trackId!==ctx.trackId||result.parentRunId!==ctx.parentRunId||result.cacheKey!==ctx.cacheKey||result.engine!==ctx.engine||result.sourceStem!==ctx.sourceStem||result.target!==ctx.target||result.requestedDevice!==ctx.device)throw Error('refinement-stale');
  if((result.scope||'preview')!==ctx.scope)throw Error('refinement-scope-stale');
  const stem=ctx.stem,frames=Math.min(Math.round(ctx.duration*stem.sampleRate),stem.frames-Math.round(ctx.start*stem.sampleRate));
  if(result.frames!==frames||result.channels!==stem.channels||result.sampleRate!==stem.sampleRate||result.timeOrigin!==Math.round(ctx.start*stem.sampleRate)/stem.sampleRate||Math.abs(result.duration-frames/stem.sampleRate)>1e-6||!Number.isFinite(result.reconstructionError)||result.reconstructionError>1e-5)throw Error('refinement-invalid');
  for(const name of ['original','target','residual']){
   if(result.files?.[name]!==result.runId+'/'+name+'.wav')throw Error('refinement-path-invalid');
   if((await fs.stat(path.join(ctx.directory,result.files[name]))).size<frames*stem.channels*4)throw Error('refinement-incomplete');
  }
  if(ctx.scope==='full'&&!result.playback)throw Error('refinement-playback-missing');
  if(result.playback){
   const {gain,peaks,files}=result.playback;
   if(!Number.isFinite(gain)||gain<=0||gain>1)throw Error('refinement-playback-invalid');
   for(const name of ['original','target','residual']){
    const expected=result.runId+'/'+(gain<1?'listen-':'')+name+'.wav';
    if(!Number.isFinite(peaks?.[name])||peaks[name]<0||peaks[name]*gain>1||files?.[name]!==expected)throw Error('refinement-playback-invalid');
    if((await fs.stat(path.join(ctx.directory,expected))).size<frames*stem.channels*4)throw Error('refinement-playback-incomplete');
   }
  }
  return result;
 }
 async function read(track,options={}) {
  try {
   const ctx=await context(track,options),result=await validate(JSON.parse(await fs.readFile(path.join(ctx.directory,ctx.cacheKey+'.json'),'utf8')),ctx);
   let kept=false;try{const selected=JSON.parse(await fs.readFile(path.join(ctx.directory,'kept',ctx.cacheKey+'.json'),'utf8'));kept=selected.runId===result.runId;}catch(_){}
   try{const flag=JSON.parse(await fs.readFile(path.join(ctx.directory,result.runId,'.xld-keep.json'),'utf8'));kept=kept||flag.runId===result.runId;}catch(_){}
   return {ok:true,...result,kept,directory:path.join(ctx.directory,result.runId),rawUrls:Object.fromEntries(Object.entries(result.files).map(([key,file])=>[key,pathToFileURL(path.join(ctx.directory,file)).href])),urls:Object.fromEntries(Object.entries(result.playback?.files||result.files).map(([key,file])=>[key,pathToFileURL(path.join(ctx.directory,file)).href]))};
  }catch(error){return {ok:false,error:error.code==='ENOENT'?'尚未生成当前范围的结果':error.message};}
 }
 async function keep(track,options={}) {
  const result=await read(track,options);if(!result.ok)return result;
  if(options.runId!==result.runId)return {ok:false,error:'refinement-stale'};
  const folder=path.join(directory(track),'kept');await fs.mkdir(folder,{recursive:true});
  await require('./derived-assets.cjs').writeAtomic(path.join(folder,result.cacheKey+'.json'),{schemaVersion:1,runId:result.runId,cacheKey:result.cacheKey,parentRunId:result.parentRunId,keptAt:new Date().toISOString()});
  return {...result,kept:true};
 }
 async function available() {
  return PROFILES.map(profile=>{
   const root=process.env[profile.backend==='roformer'?'XLD_REFINE_ROFORMER_MODELS':'XLD_REFINE_MODELS'];let ready=false;
   try{const manifest=JSON.parse(fsSync.readFileSync(path.join(root,'manifest.json'),'utf8'));const names=profile.backend==='audiosep'?['separator.pt','conditions.npz']:['checkpoint','config'].map(key=>manifest.models[profile.asset][key].file);ready=Boolean(python(profile.id)&&fsSync.existsSync(python(profile.id))&&names.every(name=>fsSync.existsSync(path.join(root,name))));}catch(_){}
   return {...profile,available:ready,...(profile.id==='mega-53'?{targetDetails:require('../analysis-refine/mega-targets.json')}:{})};
  });
 }
 async function generate(track,options,{runId,onChild,onProgress,cancelled,beforeCommit}) {
  const ctx=await context(track,options);
  const cached=await read(track,options);if(cached.ok){if(cancelled())throw Error('analysis-cancelled');return {...cached,cached:true};}
  if(!idPattern.test(runId)||!(await available()).find(item=>item.id===ctx.engine)?.available)throw Error('细分模型尚未安装');
  await fs.mkdir(ctx.directory,{recursive:true});
  const staging=path.join(ctx.directory,'.next.'+runId+'.json');let committed=false;
  const started=Date.now();
  try{
   if(cancelled())throw Error('analysis-cancelled');
   const args=[runner,'--scope',ctx.scope,'--engine',ctx.engine,'--target',ctx.target,'--device',ctx.device,'--input',ctx.input,'--output',staging,'--start',String(ctx.start),'--duration',String(ctx.duration),'--track-id',track.id,'--parent-run',ctx.parentRunId||'', '--source-stem',ctx.sourceStem,'--run-id',runId,'--cache-key',ctx.cacheKey];
   await new Promise((resolve,reject)=>{
    const child=spawnProcess(python(ctx.engine),args,{windowsHide:true,env:{...process.env,PYTHONUTF8:'1',PYTHONDONTWRITEBYTECODE:'1'}});onChild(child);
    let stdout='',stderr='';const consume=line=>{try{const message=JSON.parse(line);onProgress(message);}catch(_){}};
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
    child.stdout.on('data',chunk=>{stdout+=chunk;const lines=stdout.split(/\r?\n/);stdout=lines.pop();lines.forEach(consume);});
    child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-4000);});
    child.once('error',reject);child.once('close',code=>{consume(stdout);code===0?resolve():reject(Error(stderr.trim()||'音轨提取进程已退出'));});
   });
   if(cancelled())throw Error('analysis-cancelled');
   const fresh=await context(track,options);if(fresh.cacheKey!==ctx.cacheKey)throw Error('处理期间分轨来源发生变化');
   const result=await validate(JSON.parse(await fs.readFile(staging,'utf8')),ctx);
   if(result.runId!==runId)throw Error('refinement-run-mismatch');
   beforeCommit();
   await require('./derived-assets.cjs').writeAtomic(path.join(ctx.directory,ctx.cacheKey+'.json'),result);committed=true;
   return await read(track,options);
  }finally{
   await fs.rm(staging,{force:true}).catch(()=>{});
   if(!committed){const target=path.resolve(ctx.directory,runId);if(path.dirname(target)===path.resolve(ctx.directory))await fs.rm(target,{recursive:true,force:true}).catch(()=>{});}
   await fs.appendFile(path.join(ctx.directory,'refinement.jsonl'),JSON.stringify({at:new Date().toISOString(),engine:ctx.engine,parentRunId:ctx.parentRunId,runId,cacheKey:ctx.cacheKey,start:ctx.start,duration:ctx.duration,committed,cancelled:cancelled(),seconds:(Date.now()-started)/1000})+'\n').catch(()=>{});
  }
 }
 return {context,validate,read,keep,available,generate};
}
module.exports={createRefinement,PROFILES,profileFor};
