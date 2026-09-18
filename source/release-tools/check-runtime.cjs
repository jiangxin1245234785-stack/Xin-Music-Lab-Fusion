'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const runtime=require(fs.existsSync(path.join(__dirname,'../shared-analysis/runtime-config.cjs'))?'../shared-analysis/runtime-config.cjs':'../apps/shared-analysis/runtime-config.cjs');
function check(file,sourceRoot,{probe=spawnSync,onProgress=()=>{}}={}){
 const config=runtime.read(file),env={...process.env};const paths=runtime.apply(file,env);
 const probes=[
  ['sections',config.paths.XLD_PYTHON,path.join(config.paths.XLD_RUNTIME_ROOT,'analysis/runner.py')],
  ['songformer',config.paths.XLD_AI_PYTHON,path.join(config.paths.XLD_RUNTIME_ROOT,'analysis-ai/songformer_runner.py')],
  ['harmony',config.paths.XLD_HARMONY_PYTHON,path.join(config.paths.XLD_RUNTIME_ROOT,'analysis-harmony/harmony_runner.py')],
  ['basic-pitch',config.paths.XLD_MIDI_PYTHON,path.join(sourceRoot,'xld-runtime-baseline/analysis-midi/runner.py')],
  ['highres',config.paths.XLD_HIGHRES_PYTHON,path.join(sourceRoot,'xld-runtime-baseline/analysis-midi/runner.py')],
  ['roformer',config.paths.XLD_ROFORMER_PYTHON,path.join(sourceRoot,'xld-runtime-baseline/analysis-separation/runner.py')],
  ['demucs',config.paths.XLD_AI_PYTHON,path.join(sourceRoot,'xld-runtime-baseline/analysis-separation/runner.py')],
  ...(config.paths.XLD_YOURMT3_PYTHON?[['yourmt3',config.paths.XLD_YOURMT3_PYTHON,path.join(sourceRoot,'xld-runtime-baseline/analysis-midi/runner.py')]]:[]),
  ...(config.paths.XLD_MUSCRIPTOR_PYTHON?[['muscriptor',config.paths.XLD_MUSCRIPTOR_PYTHON,path.join(sourceRoot,'xld-runtime-baseline/analysis-midi/runner.py')]]:[]),
  ...(config.paths.XLD_REFINE_MODELS?[['refinement',config.paths.XLD_HIGHRES_PYTHON,path.join(sourceRoot,'xld-runtime-baseline/analysis-refine/runner.py')]]:[]),
  ...(config.paths.XLD_REFINE_ROFORMER_MODELS?[['refinement-roformer',config.paths.XLD_ROFORMER_PYTHON,path.join(sourceRoot,'xld-runtime-baseline/analysis-refine/runner.py')]]:[])
 ].map(([name,python,runner],index,all)=>{
  onProgress({name,index:index+1,total:all.length});
  const result=probe(python,['-X','utf8',runner,'--engines'],{env,windowsHide:true,encoding:'utf8',timeout:120000,maxBuffer:1024*1024});
  const stdout=result.stdout||'',stderr=result.stderr||'';
  let engines=[];try{const start=stdout.indexOf('['),end=stdout.lastIndexOf(']'),parsed=JSON.parse(stdout.slice(start,end+1));if(Array.isArray(parsed))engines=parsed;}catch(_){}
  const required={sections:['msaf','msaf-sf','msaf-foote','msaf-cnmf'],songformer:['songformer'],harmony:['chord-cqt','chord-cens','chord-hybrid','chord-btc'],'basic-pitch':['basic-pitch'],highres:['piano-highres','bass-highres','drums-adtof'],yourmt3:['yourmt3-plus'],muscriptor:['muscriptor-medium','muscriptor-large','strings-muscriptor-medium','strings-muscriptor-large','drums-muscriptor-medium','drums-muscriptor-large'],roformer:['bs-roformer-sw'],demucs:['demucs-6s'],refinement:['audiosep-strings'],'refinement-roformer':['bowed-strings-v2','mega-53']}[name];
  const parent=path.dirname(python),venv=path.basename(parent).toLowerCase()==='scripts'?path.dirname(parent):parent,cfg=path.join(venv,'pyvenv.cfg');
  const inherited=[];const site=path.join(venv,'Lib/site-packages');
  if(fs.existsSync(site))for(const entry of fs.readdirSync(site).filter(name=>name.endsWith('.pth')))inherited.push({file:path.join(site,entry),content:fs.readFileSync(path.join(site,entry),'utf8')});
  return {name,python,runner,ok:result.status===0 && required.every(id=>engines.some(engine=>engine.id===id && engine.available)),required,engines,baseEnvironment:fs.existsSync(cfg)?fs.readFileSync(cfg,'utf8'):null,inherited,error:result.error?.message || (result.status!==0?stderr.slice(-2000):undefined)};
 });
 return {ok:paths.ok && probes.every(item=>item.ok),paths,probes};
}
if(require.main===module){const [file,sourceRoot,out]=process.argv.slice(2),report=check(file,sourceRoot);fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify({ok:report.ok,probes:report.probes.map(({name,ok,engines,error})=>({name,ok,engines,error}))}));if(!report.ok)process.exitCode=1;}
module.exports={check};
