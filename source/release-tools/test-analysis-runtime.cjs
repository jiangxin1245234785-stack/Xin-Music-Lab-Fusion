'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const [candidate,input,out]=process.argv.slice(2),apps=path.join(candidate,'resources/apps');
require(path.join(apps,'shared-analysis/runtime-config.cjs')).apply(path.join(candidate,'runtime.json'));
const core=require(path.join(apps,'xld-runtime-baseline/core/analysis-service.cjs'));
fs.mkdirSync(out,{recursive:true});
const service=core.createService({analysisRoot:path.join(out,'analysis')});
const track={id:'isolated-runtime-wegsample',title:'Runtime WEG sample',artist:'test',album:'runtime',number:1,filePath:input};
(async()=>{
 const results=[];
 for(const [engine,options] of [['msaf-sf',{}],['songformer',{auto:false,range:[0,30]}],['chord-cqt',{}],['chord-btc',{}],['demucs-6s',{}],['basic-pitch',{stem:'bass'}]]){
  const start=Date.now();const response=await service.run(track,engine,options,task=>fs.writeFileSync(path.join(out,'progress.json'),JSON.stringify(task,null,2)));
  const item={engine,ok:response.ok,error:response.error,detail:response.detail,seconds:(Date.now()-start)/1000,cached:response.cached||false};results.push(item);console.log(JSON.stringify(item));
  fs.writeFileSync(path.join(out,'analysis-runtime.json'),JSON.stringify({ok:results.every(item=>item.ok),complete:results.length===6,results},null,2));
  assert(response.ok,JSON.stringify(response));
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
