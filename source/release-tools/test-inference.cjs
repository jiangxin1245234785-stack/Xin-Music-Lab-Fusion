'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const [candidate,fixtureFile,out]=process.argv.slice(2),apps=path.join(candidate,'resources/apps');
require(path.join(apps,'shared-analysis/runtime-config.cjs')).apply(path.join(candidate,'runtime.json'));
const fixture=JSON.parse(fs.readFileSync(fixtureFile));fs.mkdirSync(out,{recursive:true});
const input=path.join(out,'WEG-30s.wav');
if(!fs.existsSync(input)){
 const snippet=spawnSync(process.env.XLD_HIGHRES_PYTHON,['-X','utf8','-c',"import soundfile as sf,sys; f=sf.SoundFile(sys.argv[1]); f.seek(90*f.samplerate); data=f.read(30*f.samplerate); sf.write(sys.argv[2],data,f.samplerate,subtype='PCM_24')",fixture.track.filePath,input],{windowsHide:true,encoding:'utf8'});
 assert.equal(snippet.status,0,snippet.stderr);
}
const core=require(path.join(apps,'xld-runtime-baseline/core/analysis-service.cjs'));
const service=core.createService({analysisRoot:path.join(out,'analysis')});
const track={id:'release-weg-30s',title:'WEG 30s release check',artist:'test',album:'release',number:1,filePath:input};
(async()=>{
 const results=[];let nonempty=0;
 const plan=[['bs-roformer-sw',{}],['bass-highres',{stem:'bass'}],['piano-highres',{stem:'piano'}],['guitar-gaps',{stem:'guitar'}],['drums-adtof',{stem:'drums'}],['midi-merge',{}]];
 for(const [engine,options] of plan){
  const started=Date.now();const result=await service.run(track,engine,options,task=>{fs.writeFileSync(path.join(out,'progress.json'),JSON.stringify(task,null,2));});
  const expectedEmpty=engine==='midi-merge' && nonempty<2;
  const accepted=expectedEmpty?(!result.ok && result.detail==='merge-needs-parts'):result.ok;
  if(result.ok && result.result?.noteCount>0 && engine!=='midi-merge')nonempty++;
  const item={engine,ok:result.ok,accepted,expectedEmpty,error:result.error,detail:result.detail,cached:result.cached||false,seconds:(Date.now()-started)/1000,noteCount:result.result?.noteCount};results.push(item);console.log(JSON.stringify(item));
  fs.writeFileSync(path.join(out,'inference.json'),JSON.stringify({pass:results.every(item=>item.accepted),complete:results.length===plan.length,results},null,2));
  assert(accepted,JSON.stringify(result));
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
