'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createService}=require('../core/analysis-service.cjs');
const {createDerivedAssets}=require('../core/derived-assets.cjs');
const {createMidiMerge}=require('../core/midi-merge.cjs');
const root=process.env.XLD_MERGE_TEST_ROOT;if(!root)throw Error('Isolated XLD_MERGE_TEST_ROOT required');
async function main(){
 const fixture=JSON.parse(fs.readFileSync(path.join(root,'fixture.json')));
 const service=createService({analysisRoot:fixture.analysisRoot}),assets=createDerivedAssets({analysisRoot:fixture.analysisRoot});
 const track=fixture.track;
 const original=[];
 // Whatever the fixture actually holds, not a hardcoded three: merging is defined over every stem that has a
 // readable result, so pinning the list here makes the test go red the day the fixture gains a part -- which is
 // what happened when drums were added, and it read as a merge regression.
 const {STEMS}=require('../core/derived-assets.cjs');
 for(const stem of STEMS){const midi=await assets.readMidi(track,stem);if(!midi.ok||!midi.noteCount)continue;const file=path.join(assets.directory(track),midi.file);original.push({file,hash:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),notes:midi.noteCount,stem,engine:midi.engine});}
 assert(original.length>=3,'the fixture must hold several parts to merge: '+original.length);
 const states=[];
 const first=service.run(track,'midi-merge',{},task=>states.push(task));
 const duplicate=await service.run(track,'midi-merge');assert.equal(duplicate.error,'analysis-busy');
 const result=await first;assert(result.ok,result.detail);assert.equal(result.result.noteCount,original.reduce((sum,p)=>sum+p.notes,0));
 // At least one instrument per merged part, and often more: a stem's .mid can hold several named instrument
 // tracks (a guitar result is routinely acoustic / clean electric / distorted electric), so a fixed number here
 // would be asserting a property of one fixture rather than of merging.
 assert(result.result.instrumentCount>=original.length,'every part reaches the merged file: '+result.result.instrumentCount+' instruments from '+original.length+' parts');
 assert.equal(service.task(),null);
 const cached=await service.run(track,'midi-merge');assert(cached.ok && cached.cached);
 const cancelled=await service.run(track,'midi-merge',{},task=>{if(task.status==='starting')service.cancel();});assert.equal(cancelled.error,'analysis-cancelled');
 assert((await service.readMidiMerge(track)).ok);
 const missing=await createMidiMerge({analysisRoot:fixture.analysisRoot}).plan({...track,id:'unrelated-track',bridgePath:null});assert(!missing.ok);
 // Changing the active WAV source makes this combination inapplicable; switching back restores it.
 // Needs a fixture carrying two separations. Skipped rather than faked when it does not, and SAID so: a check
 // that quietly stops running reads exactly like a check that passed.
 const active=await assets.readStems(track),alternate=await assets.readStems(track,'demucs-6s');
 const skipped=[];
 if(alternate.ok){
  try{await assets.activateStems(track,alternate);assert(!(await service.readMidiMerge(track)).ok);}finally{await assets.activateStems(track,active);}
  assert((await service.readMidiMerge(track)).ok);
 } else skipped.push('WAV source invalidation and restoration (fixture has one separation: '+alternate.error+')');
 for(const item of original)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(item.file)).digest('hex'),item.hash,'source MIDI unchanged');
 const report={pass:true,parts:original.map(p=>p.stem+' · '+p.engine),skipped,
  checks:['every transcribed part merged','same-input cache','single-task exclusion','early cancellation','unanalysed track refused rather than thrown','original MIDI unchanged',
   ...(skipped.length?[]:['WAV source invalidation and restoration'])],result:result.result,states};
 fs.writeFileSync(path.join(root,'merge-core.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({pass:true,notes:result.result.noteCount,instruments:result.result.instrumentCount,parts:original.length,skipped}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
