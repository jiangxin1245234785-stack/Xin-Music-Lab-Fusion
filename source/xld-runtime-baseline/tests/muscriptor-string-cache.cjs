'use strict';
const fs=require('fs/promises'),path=require('path'),os=require('os'),crypto=require('crypto'),assert=require('assert/strict');
const {createDerivedAssets,MODEL,OPTIONS}=require('../core/derived-assets.cjs');
const {createRefinement}=require('../core/refinement.cjs');
const {createStorage}=require('../core/storage.cjs');
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'xld-string-midi-')),analysisRoot=path.join(root,'analysis'),models=path.join(root,'models');
 const old=process.env.XLD_REFINE_ROFORMER_MODELS;await fs.mkdir(models);await fs.writeFile(path.join(models,'manifest.json'),'{}');process.env.XLD_REFINE_ROFORMER_MODELS=models;
 const track={id:'strings-test',artist:'artist',album:'album',title:'song',filePath:path.join(root,'song.wav')};await fs.writeFile(track.filePath,'original');
 const assets=createDerivedAssets({analysisRoot}),directory=assets.directory(track);await fs.mkdir(directory,{recursive:true});
 const sourceStat=await fs.stat(track.filePath),baseRun=crypto.randomUUID(),base={schemaVersion:1,kind:'stems',trackId:track.id,runId:baseRun,model:'htdemucs_6s',options:{shifts:1,overlap:.25},source:{path:track.filePath,size:sourceStat.size,mtimeMs:sourceStat.mtimeMs},stems:[]};
 for(const name of ['bass','piano','guitar','drums','vocals','other']){const file=`stems/${baseRun}/${name}.wav`;await fs.mkdir(path.dirname(path.join(directory,file)),{recursive:true});await fs.writeFile(path.join(directory,file),Buffer.alloc(44100*8+80));base.stems.push({name,file,sampleRate:44100,frames:44100,channels:2});}
 await fs.writeFile(path.join(directory,'stems.json'),JSON.stringify(base));
 const refinement=createRefinement({assets});
 async function refined(target,scope='full'){
  const ctx=await refinement.context(track,{engine:'mega-53',target,scope}),runId=crypto.randomUUID();await fs.mkdir(path.join(ctx.directory,runId),{recursive:true});
  const files={};for(const name of ['original','target','residual']){files[name]=runId+'/'+name+'.wav';await fs.writeFile(path.join(ctx.directory,files[name]),Buffer.alloc(44100*8+80));}
  const value={schemaVersion:2,kind:'refinement',trackId:track.id,scope,runId,parentRunId:baseRun,cacheKey:ctx.cacheKey,engine:'mega-53',sourceStem:'other',target,requestedDevice:'auto',timeOrigin:0,duration:1,frames:44100,sampleRate:44100,channels:2,reconstructionError:0,files,playback:{gain:1,peaks:{original:0,target:0,residual:0},files}};
  await fs.writeFile(path.join(ctx.directory,ctx.cacheKey+'.json'),JSON.stringify(value));return value;
 }
 async function midi(stem='strings',engine='basic-pitch'){
  const input=await assets.midi.source(track,stem),stat=await fs.stat(input.path),runId=crypto.randomUUID(),prefix=`midi/${stem}/${runId}/`;
  await fs.mkdir(path.join(directory,prefix),{recursive:true});await fs.writeFile(path.join(directory,prefix+stem+'.mid'),Buffer.from('4d546864000000060000000103c04d54726b0000000400ff2f00','hex'));
  await fs.writeFile(path.join(directory,prefix+'notes.json'),JSON.stringify({schemaVersion:1,kind:'notes',trackId:track.id,stem,sourceRunId:input.runId,timeOrigin:0,duration:1,notes:[{start:0,end:.5,pitch:60,velocity:80}]}));
  const result={schemaVersion:1,kind:'midi',trackId:track.id,stem,runId,sourceRunId:input.runId,source:{path:input.path,size:stat.size,mtimeMs:stat.mtimeMs},engine,backend:{checkpointSha256:require('../core/derived-assets.cjs').profileFor(engine).checkpoint?.sha256},model:require('../core/derived-assets.cjs').profileFor(engine).model,options:require('../core/derived-assets.cjs').profileFor(engine).options,timeOrigin:0,duration:1,noteCount:1,tempoMode:'fixed-timebase',quantized:false,file:prefix+stem+'.mid',notesFile:prefix+'notes.json',...(stem==='strings'?{sourceTarget:input.target,program:input.program}:{})};
  await assets.midi.activate(track,result);return result;
 }
 try{
  const group=await refined('strings'),violin=await refined('violin');await assets.stringSources.select(track,group);
  const originals={};for(const engine of ['yourmt3-plus','strings-muscriptor-medium','strings-muscriptor-large']){originals[engine]=await midi('strings',engine);}
  for(const [engine,result] of Object.entries(originals))assert.equal((await assets.readMidi(track,'strings',engine)).runId,result.runId);
  await assets.stringSources.select(track,violin);assert(!(await assets.readMidi(track,'strings','strings-muscriptor-large')).ok);
  const other=await midi('strings','strings-muscriptor-large');assert.equal(other.program,40);
  await assets.stringSources.select(track,group);assert.equal((await assets.readMidi(track,'strings','strings-muscriptor-large')).runId,originals['strings-muscriptor-large'].runId);
  await assets.midi.activate(track,originals['yourmt3-plus']);assert.equal((await assets.readMidi(track,'strings')).engine,'yourmt3-plus');
  await assert.rejects(assets.midi.validate({...originals['strings-muscriptor-large'],program:40},track,'strings'),/source-stale/);
  const wrongOptions=structuredClone(originals['strings-muscriptor-large']);wrongOptions.options.instrumentsByTarget.violin='cello';await assert.rejects(assets.midi.validate(wrongOptions,track,'strings'),/midi-invalid/);
  console.log('MuScriptor strings PASS: three independent caches, target invalidation, source restore, baseline activation');
 }finally{if(old===undefined)delete process.env.XLD_REFINE_ROFORMER_MODELS;else process.env.XLD_REFINE_ROFORMER_MODELS=old;await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
