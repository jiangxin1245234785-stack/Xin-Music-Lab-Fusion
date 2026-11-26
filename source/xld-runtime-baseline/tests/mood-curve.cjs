'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const readerFile=require.resolve('../../shared-analysis/mood-curve.js'),reader=require(readerFile);
const mood=require('../core/mood-curve.cjs'),identity=require('../core/score-identity.cjs');
const {createService}=require('../core/analysis-service.cjs');
const browser={};vm.runInNewContext(fs.readFileSync(readerFile,'utf8'),browser);
const base={kind:'mood-curve',schemaVersion:1,duration:1.2,step:.5,formulaVersion:'mood-direct-1',scaleVersion:'mood-scale-1',
  engineVersion:1,loudnessMode:'mix',identity:identity.expected('mood-curve'),belowFlatnessGate:[2],
  fast:[0,.4,null,1],slow:[.1,.2,.5,1],shape:{fast:[0,0,0,0],slow:[1,1,1,1]},
  components:{lufs:[0,0,0,0],band28Dbfs:[0,0,0,0],logFlatness:[0,0,null,0]}};
for(const api of [reader,browser.XinMoodCurve]){
  assert(api.valid(base));assert(!api.valid({...base,slow:[2,0,0,0]}));assert(!api.valid({...base,duration:1.51}));
  for(const [t,f,s] of [[0,0,.1],[.25,.2,.15],[.5,.4,.2],[.75,null,.35],[1.1,null,.75],[1.2,1,1],[-1,null,null],[1.21,null,null],[NaN,null,null]]){
    const answer=api.at(base,t);
    for(const [key,want] of [['fast',f],['slow',s]])if(want===null)assert.equal(answer[key],null);else assert(Math.abs(answer[key]-want)<1e-12);
  }
}
function wave(file){
  const sr=24000,n=sr*2+2500,b=Buffer.alloc(44+2*n);
  b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);
  b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(sr,24);b.writeUInt32LE(sr*2,28);
  b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(2*n,40);
  for(let i=0;i<n;i++)b.writeInt16LE(Math.round(8192*Math.sin(2*Math.PI*3200*i/sr)),44+2*i);
  fs.writeFileSync(file,b);
}
async function main(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'xld-mood-')),dir=path.join(root,'song'),file=path.join(root,'mix.wav');
  const track={id:'mood-test',title:'Mood',filePath:file,bridgePath:path.join(dir,'music-lab.json')};
  const service=createService({analysisRoot:root}),out=path.join(dir,'mood-curve.json');
  try {
    fs.mkdirSync(dir);wave(file);
    assert.equal(await service.readMoodStatus(track),'missing');
    const source=await mood.inputs(track,dir);assert(mood.matches({...base,source},source));
    assert(!mood.matches({...base,source,scaleVersion:'other'},source));
    const py=process.env.XLD_MIDI_PYTHON||path.resolve(__dirname,'../../../runtime/0.5.0/envs/basic',process.platform==='win32'?'python.exe':'bin/python');
    if(!fs.existsSync(py)){console.log('Mood audio integration: configured Python unavailable');return;}
    process.env.XLD_MIDI_PYTHON=py;
    const phases=[];const first=await service.run(track,mood.ENGINE,{},task=>{if(task)phases.push(task.phase);});
    assert(first.ok,first.detail);assert(phases.includes('measure'));assert(reader.valid(first.result));
    assert.equal(first.result.duration,(48000+2500)/24000);assert.equal(first.result.loudnessMode,'mix');
    const bytes=fs.readFileSync(out);assert((await service.run(track,mood.ENGINE)).cached);
    assert((await service.run(track,mood.ENGINE,{force:true})).ok);assert(bytes.equals(fs.readFileSync(out)));
    const stemsDir=path.join(dir,'stems','r1');fs.mkdirSync(stemsDir,{recursive:true});
    const mf=path.join(dir,'stems.json'),stem={name:'other',file:'stems/r1/other.wav',gain:.5};
    fs.copyFileSync(file,path.join(stemsDir,'other.wav'));
    const put=()=>fs.writeFileSync(mf,JSON.stringify({trackId:track.id,runId:'r1',stems:[stem]}));put();
    assert.equal(await service.readMoodStatus(track),'stale');
    const split=await service.run(track,mood.ENGINE);assert(split.ok,split.detail);
    assert.equal(split.result.loudnessMode,'half');assert(Math.abs(first.result.components.lufs[2]-split.result.components.lufs[2]-3.0103)<.03);
    stem.gain=.25;put();assert.equal(await service.readMoodStatus(track),'stale');
    const kept=fs.readFileSync(out);fs.unlinkSync(path.join(stemsDir,'other.wav'));
    assert(!(await service.run(track,mood.ENGINE)).ok);assert(kept.equals(fs.readFileSync(out)));
    fs.unlinkSync(mf);assert((await service.run(track,mood.ENGINE)).ok);
    const later=new Date(Date.now()+5000);fs.utimesSync(file,later,later);assert.equal(await service.readMoodStatus(track),'stale');
    console.log('Mood curve: PASS (runner, mix/stem gain, cache, deterministic staging, stale inputs, rollback, Node/browser reader)');
  }finally{
    assert.equal(path.dirname(fs.realpathSync(root)),fs.realpathSync(os.tmpdir()));assert(path.basename(root).startsWith('xld-mood-'));
    fs.rmSync(root,{recursive:true,force:true});
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
