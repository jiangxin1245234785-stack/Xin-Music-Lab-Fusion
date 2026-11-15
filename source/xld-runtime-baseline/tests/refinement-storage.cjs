'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {createDerivedAssets,MODEL,OPTIONS}=require('../core/derived-assets.cjs'),{createRefinement}=require('../core/refinement.cjs'),{createStorage}=require('../core/storage.cjs'),{createOptimizer}=require('../core/refinement-storage.cjs');
function wav(value,seconds=4){const frames=44100*seconds,b=Buffer.alloc(44+frames*8);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(3,20);b.writeUInt16LE(2,22);b.writeUInt32LE(44100,24);b.writeUInt32LE(352800,28);b.writeUInt16LE(8,32);b.writeUInt16LE(32,34);b.write('data',36);b.writeUInt32LE(frames*8,40);for(let i=0;i<frames*2;i++)b.writeFloatLE(value,44+i*4);return b;}
async function main(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'xld-storage-compact-')),analysisRoot=path.join(root,'analysis'),models=path.join(root,'models'),old=process.env.XLD_REFINE_ROFORMER_MODELS;
 try{
 await fs.mkdir(models);await fs.writeFile(path.join(models,'manifest.json'),'{}');process.env.XLD_REFINE_ROFORMER_MODELS=models;
 const track={id:'compact-test',artist:'测试',album:'带 空格',title:'song',filePath:path.join(root,'song.wav')};await fs.writeFile(track.filePath,wav(.4));
 const assets=createDerivedAssets({analysisRoot}),dir=assets.directory(track),sourceStat=await fs.stat(track.filePath),baseRun=crypto.randomUUID(),stems=[];
 await fs.mkdir(path.join(dir,'stems',baseRun),{recursive:true});
 for(const name of ['bass','piano','guitar','drums','vocals','other']){const file=`stems/${baseRun}/${name}.wav`;await fs.writeFile(path.join(dir,file),wav(1.5));stems.push({name,file,sampleRate:44100,frames:176400,channels:2});}
 await fs.writeFile(path.join(dir,'stems.json'),JSON.stringify({schemaVersion:1,kind:'stems',trackId:track.id,runId:baseRun,model:'htdemucs_6s',options:{shifts:1,overlap:.25},source:{path:track.filePath,size:sourceStat.size,mtimeMs:sourceStat.mtimeMs},stems}));
 const refine=createRefinement({assets});
 async function legacy({target='strings',scope='full',different=false,gain=.5}={}){
  const options={engine:'mega-53',scope,target,start:1.25,duration:30},ctx=await refine.context(track,options),runId=crypto.randomUUID(),folder=path.join(ctx.directory,runId);await fs.mkdir(folder,{recursive:true});const seconds=scope==='full'?4:2.75,files={},playFiles={};
  for(const [name,value]of Object.entries({original:different?1.25:1.5,target:.5,residual:1})){files[name]=runId+'/'+name+'.wav';await fs.writeFile(path.join(ctx.directory,files[name]),wav(value,seconds));playFiles[name]=gain<1?runId+'/listen-'+name+'.wav':files[name];if(gain<1)await fs.writeFile(path.join(ctx.directory,playFiles[name]),wav(value*gain,seconds));}
  const result={schemaVersion:2,kind:'refinement',scope,engine:'mega-53',runId,trackId:track.id,parentRunId:baseRun,cacheKey:ctx.cacheKey,target,requestedDevice:'auto',sourceStem:'other',timeOrigin:scope==='full'?0:1.25,duration:seconds,sampleRate:44100,frames:44100*seconds,channels:2,files,playback:{gain,peaks:{original:gain===1?.5:1.5,target:.5,residual:gain===1?.5:1},files:playFiles},reconstructionError:0};
  await fs.writeFile(path.join(ctx.directory,ctx.cacheKey+'.json'),JSON.stringify(result));return {ctx,result,folder,options};
 }
 const full=await legacy();await assets.stringSources.select(track,full.result);const input=await assets.midi.source(track,'strings'),stat=await fs.stat(input.path),midiRun=crypto.randomUUID(),prefix=`midi/strings/${midiRun}/`;
 await fs.mkdir(path.join(dir,prefix),{recursive:true});await fs.writeFile(path.join(dir,prefix+'strings.mid'),Buffer.from('4d546864000000060000000103c04d54726b0000000400ff2f00','hex'));await fs.writeFile(path.join(dir,prefix+'notes.json'),JSON.stringify({schemaVersion:1,kind:'notes',trackId:track.id,stem:'strings',sourceRunId:input.runId,timeOrigin:0,duration:4,notes:[{start:0,end:1,pitch:60,velocity:80}]}));
 await assets.midi.activate(track,{schemaVersion:1,kind:'midi',trackId:track.id,stem:'strings',runId:midiRun,sourceRunId:input.runId,source:{path:input.path,size:stat.size,mtimeMs:stat.mtimeMs},engine:'basic-pitch',model:MODEL,options:OPTIONS,timeOrigin:0,duration:4,noteCount:1,tempoMode:'fixed-timebase',quantized:false,file:prefix+'strings.mid',notesFile:prefix+'notes.json',sourceTarget:input.target,program:input.program});
 assert((await assets.readMidi(track,'strings')).ok);
 const preserved=new Map();for(const file of [input.path,path.join(full.folder,'residual.wav'),path.join(dir,prefix+'strings.mid'),path.join(dir,prefix+'notes.json')])preserved.set(file,{bytes:await fs.readFile(file),stat:await fs.stat(file)});
 let failTrash=false;const trashed=[],trash=async file=>{if(failTrash)throw Error('fixture-trash-failure');trashed.push(file);await fs.rename(file,path.join(root,crypto.randomUUID()+'.wav'));};
 const manager=createStorage({getRoot:()=>analysisRoot,optimizer:createOptimizer({assets,trackForDirectory:()=>track,trash})});
 const row=async item=>(await manager.scan()).rows.find(r=>r.runId===item.result.runId);
 const before=await row(full);assert(before.optimizable);assert.equal(before.dependencyCount,1);await manager.protect(before,true);
 let updated=await row(full);const outcome=await manager.optimize(updated,'trash',async()=>true);assert(outcome.optimized);assert.equal(trashed.length,4);assert.equal(outcome.bytes,4*wav(0).length);
 const compact=await refine.read(track,full.options);assert(compact.ok,compact.error);assert.equal(compact.schemaVersion,3);assert.equal(compact.originalSource.runId,baseRun);assert.equal(compact.auditions.target.gain,.5);assert.equal(compact.auditions.original.sourceOffset,0);assert(compact.kept);assert((await assets.readMidi(track,'strings')).ok,'MIDI binding survives');assert.equal((await assets.stringSources.current(track)).runId,full.result.runId);
 for(const [file,before]of preserved){assert((await fs.readFile(file)).equals(before.bytes));assert.equal((await fs.stat(file)).mtimeMs,before.stat.mtimeMs);}
 assert(!(await row(full)).optimizable);assert.equal((await row(full)).dependencyCount,1);
 const preview=await legacy({target:'violin',scope:'preview'});await manager.optimize(await row(preview),'permanent',async()=>true);const p=await refine.read(track,preview.options);assert(p.ok,p.error);assert.equal(p.auditions.original.sourceOffset,1.25);assert.equal(p.auditions.target.sourceOffset,0);assert.equal(p.frames,121275);
 const different=await legacy({target:'cello',different:true});await manager.optimize(await row(different),'trash',async()=>true);const d=await refine.read(track,different.options);assert(d.ok);assert(d.files.original);assert(!d.originalSource,'mismatched input retained');
 const retry=await legacy({target:'viola'});failTrash=true;const failed=await manager.optimize(await row(retry),'trash',async()=>true);assert(failed.pendingCleanup);assert((await refine.read(track,retry.options)).ok);failTrash=false;const resumed=await manager.optimize(await row(retry),'trash',async()=>true);assert(!resumed.pendingCleanup);assert.equal(resumed.bytes,4*wav(0).length);
 const cancel=await legacy({target:'double-bass'}),originalManifest=await fs.readFile(path.join(cancel.ctx.directory,cancel.ctx.cacheKey+'.json'));
 const declined=await manager.optimize(await row(cancel),'permanent',async()=>false);assert(declined.canceled);assert((await fs.readFile(path.join(cancel.ctx.directory,cancel.ctx.cacheKey+'.json'))).equals(originalManifest));
 await assert.rejects(manager.optimize(await row(cancel),'trash',async()=>{manager.cancelOptimize();return true;}),/已取消/);assert((await fs.readFile(path.join(cancel.ctx.directory,cancel.ctx.cacheKey+'.json'))).equals(originalManifest));
 const invalid={...compact,originalSource:{...compact.originalSource,runId:crypto.randomUUID()}};await assert.rejects(refine.validate(invalid,full.ctx),/source-stale/);
 console.log('Compact storage PASS: exact PCM, fractional source range, MIDI identity, kept/dependent results, mismatch retention, cancel and cleanup retry');
 }finally{if(old===undefined)delete process.env.XLD_REFINE_ROFORMER_MODELS;else process.env.XLD_REFINE_ROFORMER_MODELS=old;await fs.rm(root,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
