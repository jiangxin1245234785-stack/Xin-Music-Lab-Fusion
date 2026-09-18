'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=process.env.XLD_MODELS_TEST_ROOT;if(!root)throw Error('Isolated XLD_MODELS_TEST_ROOT required');
const fixture=JSON.parse(fs.readFileSync(path.join(root,'fixture.json'))),core=require('../core/analysis-service.cjs').createService({analysisRoot:fixture.analysisRoot});
const manual=fs.readFileSync(path.join(fixture.directory,'manual-tags.json'),'utf8');
const checks=[],runs=[];
async function main(){
 const models=await core.midiEngines();assert.equal(models.filter(model=>model.available).length,4);checks.push('Four runnable models');
 for(const [stem,engine] of [['guitar','guitar-gaps'],['piano','piano-highres'],['bass','bass-highres'],['guitar','basic-pitch']]){
  console.log('Transcribe '+stem+' '+engine);let lastPhase='';
  const response=await core.run(fixture.track,engine,{stem},task=>{if(task.phase!==lastPhase){lastPhase=task.phase;console.log(engine+' '+task.phase+' '+task.message);}});
  assert(response.ok,JSON.stringify(response));assert.equal(response.result.engine,engine);assert.equal(response.result.duration,30);
  runs.push({engine,stem,noteCount:response.result.noteCount,runId:response.result.runId,seconds:response.result.elapsedSeconds,directory:response.result.directory});
 }
 checks.push('Real Radioactive Spell Wave 90–120s: three specialist models and Basic Pitch');
 const guitar=runs.find(run=>run.engine==='guitar-gaps');
 const cached=await core.run(fixture.track,'guitar-gaps',{stem:'guitar'});assert(cached.cached);assert.equal(cached.result.runId,guitar.runId);
 assert.equal((await core.readMidi(fixture.track,'guitar')).engine,'guitar-gaps');assert((await core.readMidi(fixture.track,'guitar','basic-pitch')).ok);
 checks.push('Switching cached models preserves alternatives and updates the XML current result');
 assert.equal((await core.run(fixture.track,'piano-highres',{stem:'guitar'})).error,'midi-engine-unsupported');
 const pending=core.run(fixture.track,'guitar-gaps',{stem:'guitar',force:true},task=>{if(task.status==='starting')core.cancel();});
 assert.equal((await pending).error,'analysis-cancelled');assert.equal((await core.readMidi(fixture.track,'guitar','guitar-gaps')).runId,guitar.runId);
 assert.equal(fs.readFileSync(path.join(fixture.directory,'manual-tags.json'),'utf8'),manual);
 checks.push('Wrong instrument rejected; early cancellation preserves both models and manual tags');
 const report={pass:true,checks,runs};fs.writeFileSync(path.join(root,'models-real.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
