'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {check}=require('./check-runtime.cjs'),{diagnose}=require('./diagnose.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'xin-diagnostics-'));
fs.mkdirSync(path.join(root,'resources/app'),{recursive:true});
fs.writeFileSync(path.join(root,'resources/app/package.json'),JSON.stringify({version:'0.5.0-rc.5'}));
const keys=['XLD_RUNTIME_ROOT','XLD_STABLE_RUNTIME_ROOT','XLD_PYTHON','XLD_AI_PYTHON','XLD_HARMONY_PYTHON','XLD_MIDI_PYTHON','XLD_HIGHRES_PYTHON','XLD_ROFORMER_PYTHON','XLD_HIGHRES_MODELS','XLD_ROFORMER_MODELS','TORCH_HOME','XLD_SEPARATION_TORCH_HOME'];
const config=path.join(root,'runtime.json');fs.writeFileSync(config,JSON.stringify({schemaVersion:1,paths:Object.fromEntries(keys.map(key=>[key,key.endsWith('_PYTHON')?'missing/python.exe':'missing']))}));
let calls=0;const progress=[];
const missing=check(config,root,{probe:()=>{calls++;return {status:null,stdout:null,stderr:null,error:Error('ENOENT')};},onProgress:item=>progress.push(item)});
assert.equal(missing.ok,false);assert.equal(calls,8);assert.equal(progress.length,8);
// The revision writer shares the basic-pitch interpreter but is not an engine, so nothing else probes it and a
// missing pretty_midi there would first show up as a failed save.
assert.deepEqual(missing.probes.find(item=>item.name==='revision')?.required,['manual-revision']);
assert(missing.probes.find(item=>item.name==='revision').runner.endsWith('revise.py'));
assert(missing.probes.every(item=>item.error==='ENOENT'));
assert(missing.probes.find(item=>item.name==='highres').required.includes('drums-adtof'));
const ids=missing.probes.flatMap(item=>item.required);
const noDrums=check(config,root,{probe:()=>({status:0,stdout:JSON.stringify(ids.filter(id=>id!=='drums-adtof').map(id=>({id,available:true}))),stderr:''})});
assert.equal(noDrums.probes.find(item=>item.name==='highres').ok,false);
assert(noDrums.probes.filter(item=>item.name!=='highres').every(item=>item.ok));
const timeout=check(config,root,{probe:()=>({status:null,stdout:'',stderr:null,error:Error('ETIMEDOUT')})});
assert(timeout.probes.every(item=>!item.ok&&item.error==='ETIMEDOUT'));
const malformed=diagnose(root,path.join(root,'report'),{check:()=>{throw Error('Invalid runtime.json');},log:()=>{}});
assert.equal(malformed.ok,false);assert.equal(malformed.complete,false);
assert(fs.readFileSync(path.join(root,'report/检查结果.txt'),'utf8').includes('Invalid runtime.json'));
console.log('Diagnostics: missing Python, missing drums, timeout and malformed config passed.');

assert(!missing.probes.find(item=>item.name==='highres').required.includes('guitar-gaps'),'Retired GAPS is not a release requirement');
const withAddons=JSON.parse(fs.readFileSync(config,'utf8'));withAddons.paths.XLD_YOURMT3_PYTHON='shared/python.exe';withAddons.paths.XLD_MUSCRIPTOR_PYTHON='shared/python.exe';fs.writeFileSync(config,JSON.stringify(withAddons));
const addonCheck=check(config,root,{probe:()=>({status:0,stdout:JSON.stringify(ids.map(id=>({id,available:true}))),stderr:''})});
assert.equal(addonCheck.probes.length,10);assert.equal(addonCheck.probes.find(p=>p.name==='muscriptor').ok,false);assert.equal(addonCheck.probes.find(p=>p.name==='yourmt3').ok,false);
const allIds=addonCheck.probes.flatMap(p=>p.required);const ready=check(config,root,{probe:()=>({status:0,stdout:JSON.stringify(allIds.map(id=>({id,available:true}))),stderr:''})});assert(ready.probes.every(p=>p.ok));
console.log('Diagnostics addon / retired-model regression: PASS');
