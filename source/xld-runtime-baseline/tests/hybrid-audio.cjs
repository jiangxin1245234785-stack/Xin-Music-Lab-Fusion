'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{pathToFileURL}=require('node:url');
const {createAudioReader,createCatalog}=require('../core/mix-audio.cjs');
const {create:streamer,LIMIT}=require('../wav-stream.js');
async function main(){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'xld-mix-'));
 const make=async(name,value,seconds=12)=>{
  const frames=8000*seconds,b=Buffer.alloc(44+frames*4);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(3,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(4,32);b.writeUInt16LE(32,34);b.write('data',36);b.writeUInt32LE(frames*4,40);for(let i=0;i<frames;i++)b.writeFloatLE(value,44+i*4);const file=path.join(dir,name+'.wav');await fs.writeFile(file,b);return file;
 };
 try{
 const other=await make('other',.6),target=await make('target',.2),residual=await make('residual',.4),guitar=await make('guitar',.1);
 const reader=createAudioReader(),track={id:'track'},a=await reader.register(other,track.id);
 assert.equal(a.duration,12);assert.equal(a.waveform.length,256);
 const chunk=await reader.chunk({trackId:'track',key:a.key,index:2});assert.equal(chunk.frames,32000);assert(Math.abs(chunk.channels[0][0]-.6)<1e-6);
 await assert.rejects(reader.chunk({trackId:'other',key:a.key,index:0}),/source-unavailable/);
 await assert.rejects(reader.chunk({trackId:'track',key:a.key,index:3}),/wav-range/);
 const base={ok:true,runId:'base',engine:'base',stems:[{name:'other',audioUrl:pathToFileURL(other).href,frames:96000,sampleRate:8000},{name:'guitar',audioUrl:pathToFileURL(guitar).href,frames:96000,sampleRate:8000}]};
 const manifest={scope:'full',engine:'mega-53',sourceStem:'other',target:'strings',requestedDevice:'cpu'},key='a'.repeat(64);
 await fs.mkdir(path.join(dir,'refinement'));await fs.writeFile(path.join(dir,'refinement',key+'.json'),JSON.stringify(manifest));
 // The refinement service normally guards paths; this fixture injects its validated result.
 const result={ok:true,...manifest,cacheKey:key,runId:'refine',parentRunId:'base',timeOrigin:0,reconstructionError:0,duration:12,files:{target:'../target.wav',residual:'../residual.wav'}};
 const assets={directory:()=>dir,readStems:async()=>base,stringSources:{current:async()=>({runId:'refine'})}};
 const catalog=createCatalog({assets,reader,refinement:{read:async()=>result}});
 const midi=[{stem:'strings',sourceRunId:'refine',notes:[[0,1,60,80]],matches:false,engine:'manual-revision',sourceAudio:{key:'saved-editor-source-identity'}},{stem:'guitar',sourceRunId:'base',notes:[[0,1,64,80]],matches:true}];
 const selected=await catalog.read(track,midi);assert.deepEqual(selected.lanes.map(l=>l.stem),['guitar','strings','other / residual']);
 assert.equal(selected.lanes[1].notes.length,1);assert.equal(selected.lanes[1].sourceAudio.key,'saved-editor-source-identity');assert.notEqual(selected.lanes[1].sourceAudio.streamKey,selected.lanes[1].sourceAudio.key);assert(selected.lanes[2].wavOnly);
 const plain=await catalog.read(track,midi,{});assert.deepEqual(plain.lanes.map(l=>l.stem),['other','guitar']);
 await assert.rejects(catalog.read(track,midi,{other:'bogus'}),/source-unavailable/);
 const secondKey='b'.repeat(64);await fs.writeFile(path.join(dir,'refinement',secondKey+'.json'),JSON.stringify({...manifest,sourceStem:'mix'}));
 const whole=createCatalog({assets,reader,refinement:{read:async(_t,o)=>o.sourceStem==='mix'?{...result,sourceStem:'mix',runId:'whole',cacheKey:secondKey,parentRunId:null}:result}});
 await assert.rejects(whole.read(track,midi,{other:'refine',mix:'whole'}),/parent-overlap/);
 assert.deepEqual((await whole.read(track,midi,{mix:'whole'})).lanes.map(l=>l.stem),['mix / strings','mix / residual']);
 // One shared clock, wrap at fractional boundaries, bounded cache after traversing a long song.
 const nodes=[],ctx={currentTime:0,createBuffer:(n,length,sampleRate)=>({length,numberOfChannels:n,sampleRate,getChannelData:()=>new Float32Array(length)}),
 createBufferSource:()=>{const node={connect(){},disconnect(){},start(at,offset,length){this.at=at;this.offset=offset;this.length=length;},stop(){}};nodes.push(node);return node;}};
 let failure=null;const stream=streamer({context:ctx,readChunk:async(key,index)=>({ok:true,sampleRate:44100,frames:176400,channels:[new Float32Array(176400),new Float32Array(176400)]}),onFailure:e=>failure=e});
 const sources=[{sourceAudio:{key:'a'},destination:{}},{sourceAudio:{key:'b'},destination:{}}];
 assert(await stream.prepare(sources,3.8,5.1,true,3.8));stream.start(.06);
 assert.equal(nodes[0].at,nodes[1].at);assert(Math.abs(nodes[0].length-.2)<1e-7);
 assert.equal(stream.diagnostics().reads,4,'loop chunks reused, two unique sources');
 for(let i=0;i<100;i++){ctx.currentTime+=.1;await stream.tick();}
 assert.equal(failure,null);assert.equal(stream.diagnostics().underruns,0);
 stream.stop();ctx.currentTime=0;await stream.prepare(sources,0,600,false,0);stream.start(.06);
 for(let i=0;i<580;i++){ctx.currentTime=i;await stream.tick();}
 assert(stream.diagnostics().bytes<=LIMIT);assert.equal(failure,null);
 ctx.currentTime=620;await stream.tick(); // end already scheduled, no late looping
 stream.stop();ctx.currentTime=0;await stream.prepare(sources,0,600,false,0);stream.start(.06);ctx.currentTime=20;await stream.tick();assert.equal(failure,'wav-underrun');
 stream.clear();assert.equal(stream.diagnostics().bytes,0);
 // Pending loads cannot start after stop.
 let release;const late=streamer({context:ctx,readChunk:()=>new Promise(r=>release=r),onFailure:()=>{}});
 const loading=late.prepare([sources[0]],0,12,false,0);late.stop();release({ok:true,sampleRate:8000,frames:32000,channels:[new Float32Array(32000)]});assert.equal(await loading,false);
 const stat=await fs.stat(other);await fs.utimes(other,stat.atime,new Date(stat.mtimeMs+2000));await assert.rejects(reader.chunk({trackId:'track',key:a.key,index:0}),/source-changed/);
 console.log('hybrid audio: PASS (PCM, stale identity, complementary replacement, no overlap, shared clock, fractional loops, cancellation, bounded long-song cache, underrun stops)');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
