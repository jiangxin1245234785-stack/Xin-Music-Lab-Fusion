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
 for(const stem of ['bass','piano','guitar']){const midi=await assets.readMidi(track,stem);assert(midi.ok);const file=path.join(assets.directory(track),midi.file);original.push({file,hash:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),notes:midi.noteCount});}
 const states=[];
 const first=service.run(track,'midi-merge',{},task=>states.push(task));
 const duplicate=await service.run(track,'midi-merge');assert.equal(duplicate.error,'analysis-busy');
 const result=await first;assert(result.ok,result.detail);assert.equal(result.result.noteCount,original.reduce((sum,p)=>sum+p.notes,0));
 assert.equal(result.result.instrumentCount,3);assert.equal(service.task(),null);
 const cached=await service.run(track,'midi-merge');assert(cached.ok && cached.cached);
 const cancelled=await service.run(track,'midi-merge',{},task=>{if(task.status==='starting')service.cancel();});assert.equal(cancelled.error,'analysis-cancelled');
 assert((await service.readMidiMerge(track)).ok);
 const missing=await createMidiMerge({analysisRoot:fixture.analysisRoot}).plan({...track,id:'unrelated-track',bridgePath:null});assert(!missing.ok);
 // Changing the active WAV source makes this combination inapplicable; switching back restores it.
 const active=await assets.readStems(track),alternate=await assets.readStems(track,'demucs-6s');assert(alternate.ok);
 try{await assets.activateStems(track,alternate);assert(!(await service.readMidiMerge(track)).ok);}finally{await assets.activateStems(track,active);}
 assert((await service.readMidiMerge(track)).ok);
 for(const item of original)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(item.file)).digest('hex'),item.hash,'source MIDI unchanged');
 const report={pass:true,checks:['three real WEG parts merged','same-input cache','single-task exclusion','early cancellation','WAV source invalidation and restoration','original MIDI unchanged'],result:result.result,states};
 fs.writeFileSync(path.join(root,'merge-core.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({pass:true,notes:result.result.noteCount,parts:result.result.instrumentCount,file:result.result.file}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
