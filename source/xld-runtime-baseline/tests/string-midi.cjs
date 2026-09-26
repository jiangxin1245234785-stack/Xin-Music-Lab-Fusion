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
 async function midi(stem='strings'){
  const input=await assets.midi.source(track,stem),stat=await fs.stat(input.path),runId=crypto.randomUUID(),prefix=`midi/${stem}/${runId}/`;
  await fs.mkdir(path.join(directory,prefix),{recursive:true});await fs.writeFile(path.join(directory,prefix+stem+'.mid'),Buffer.from('4d546864000000060000000103c04d54726b0000000400ff2f00','hex'));
  await fs.writeFile(path.join(directory,prefix+'notes.json'),JSON.stringify({schemaVersion:1,kind:'notes',trackId:track.id,stem,sourceRunId:input.runId,timeOrigin:0,duration:1,notes:[{start:0,end:.5,pitch:60,velocity:80}]}));
  const result={schemaVersion:1,kind:'midi',trackId:track.id,stem,runId,sourceRunId:input.runId,source:{path:input.path,size:stat.size,mtimeMs:stat.mtimeMs},engine:'basic-pitch',model:MODEL,options:OPTIONS,timeOrigin:0,duration:1,noteCount:1,tempoMode:'fixed-timebase',quantized:false,file:prefix+stem+'.mid',notesFile:prefix+'notes.json',...(stem==='strings'?{sourceTarget:input.target,program:input.program}:{})};
  await assets.midi.activate(track,result);return result;
 }
 try{
  const group=await refined('strings'),violin=await refined('violin');await refined('violin','preview');await refined('electric-guitar');
  assert.equal((await assets.stringSources.list(track)).choices.length,2);assert.equal(await assets.stringSources.current(track),null);
  await assert.rejects(assets.stringSources.select(track,{runId:group.runId,cacheKey:'../escape'}),/invalid/);
  await assets.stringSources.select(track,group);const first=await midi();assert.equal(first.program,48);assert((await assets.readMidi(track,'strings')).ok);
  await midi('bass');await midi('piano');
  const merge=require('../core/midi-merge.cjs').createMidiMerge({analysisRoot});
  await assets.stringSources.select(track,violin);
  assert.equal((await assets.readMidi(track,'strings')).error,'midi-string-source-stale','the stale window is what this covers');
  // Used to throw and take the whole merge with it: 'midi-string-source-stale' is only the strings spelling of
  // 'midi-stale', which plan() already tolerated — the stem was the only difference.
  const stale=await merge.plan(track);
  assert(stale.ok,'bass and piano are enough to merge: '+JSON.stringify(stale.error));
  assert.deepEqual(stale.parts.map(p=>p.stem),['bass','piano'],'and strings is not among them');
  assert.deepEqual(stale.skipped,[{stem:'strings',reason:'midi-string-source-stale'}],JSON.stringify(stale.skipped));
  // read() carries it too, which is what the panel shows before anything has been merged. A merge that quietly
  // drops a voice and reports success is the failure this whole change exists to prevent.
  const unmerged=await merge.read(track);
  assert(!unmerged.ok&&unmerged.error==='merge-missing',JSON.stringify(unmerged.error));
  assert.deepEqual(unmerged.skipped,stale.skipped,'the skip list survives read()\'s catch');
  const copy=await fs.readFile(path.join(__dirname,'..','i18n','runtime-messages.js'),'utf8');
  for(const reason of ['midi-missing','midi-empty','midi-stale','midi-string-source-stale'])
   assert(new RegExp(String.raw`'${reason}':\['[^']+','[^']+'\]`).test(copy),reason+' must read as a sentence in both locales');
  for(const key of ['skipped','skippedItem','skippedJoin'])
   assert.equal((copy.match(new RegExp('"runtime\.merge\.'+key+'"','g'))||[]).length,2,key+' in both locales');
  // Brackets and the list joiner are punctuation, and punctuation is language: the English sentence must not
  // be wrapped in full-width Chinese brackets.
  assert(/"runtime\.merge\.skippedItem": "\{stem\} \(\{reason\}\)"/.test(copy),'the English item uses ASCII brackets');
  const second=await midi();assert.equal(second.program,40);
  assert.deepEqual((await merge.plan(track)).skipped,[],'once this source has its own MIDI, nothing is skipped');
  await assets.stringSources.select(track,group);assert.equal((await assets.readMidi(track,'strings')).runId,first.runId,'Switching back restores source cache');
  await assert.rejects(assets.midi.validate({...first,program:40},track,'strings'),/source-stale/);
  const plan=await merge.plan(track);assert(plan.ok);assert.deepEqual(plan.parts.map(p=>p.stem),['bass','piano','strings']);assert.equal(plan.parts[2].sourceRunId,group.runId,'the strings part still carries the source it was made from');assert.deepEqual(plan.skipped,[]);
  const storage=createStorage({getRoot:()=>analysisRoot});const row=(await storage.scan()).rows.find(r=>r.runId===group.runId);assert.equal(row.dependencyCount,1);assert(row.blocked.includes('MIDI'));
  await assets.stringSources.select(track,null);assert(!(await assets.readMidi(track,'strings')).ok);
  // With bass and piano present the merge still goes ahead. What this line is really about is that strings is
  // not in it, and that clearing the source does not drop the dependency protection on the WAV it came from.
  const withoutStrings=await merge.plan(track);
  assert(withoutStrings.ok&&!withoutStrings.parts.some(p=>p.stem==='strings'),JSON.stringify(withoutStrings.parts.map(p=>p.stem)));
  assert.deepEqual(withoutStrings.skipped,[],'a source you deliberately cleared is not a part that was left out');
  assert.equal((await storage.scan()).rows.find(r=>r.runId===group.runId).dependencyCount,1,'Disabling inclusion must not lose dependency protection');
  await assets.stringSources.select(track,group);await fs.rename(path.join(directory,'refinement',group.runId,'target.wav'),path.join(directory,'refinement',group.runId,'missing.wav'));
  assert.equal(await assets.stringSources.current(track),null);assert((await assets.stringSources.list(track)).unavailable);assert(!(await assets.readMidi(track,'strings')).ok);
  console.log('String MIDI PASS: full-only sources, explicit inclusion, target programs, per-source cache restore, merge identity, skipped parts reported not fatal, deletion dependency and missing WAV');
 }finally{if(old===undefined)delete process.env.XLD_REFINE_ROFORMER_MODELS;else process.env.XLD_REFINE_ROFORMER_MODELS=old;await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
