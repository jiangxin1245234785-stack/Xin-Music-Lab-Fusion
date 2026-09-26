'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {fileURLToPath,pathToFileURL}=require('node:url');
const BLOCK_SECONDS=4;
async function header(handle,size){
 const head=Buffer.alloc(12);await handle.read(head,0,12,0);
 if(head.toString('ascii',0,4)!=='RIFF'||head.toString('ascii',8,12)!=='WAVE')throw Error('wav-format');
 let fmt=null,data=null;
 for(let pos=12;pos+8<=size;){
  const h=Buffer.alloc(8);await handle.read(h,0,8,pos);const n=h.readUInt32LE(4),tag=h.toString('ascii',0,4);
  if(pos+8+n>size)throw Error('wav-truncated');
  if(tag==='fmt '){if(n<16||n>4096)throw Error('wav-format');const b=Buffer.alloc(n);await handle.read(b,0,n,pos+8);
   let code=b.readUInt16LE(0);if(code===65534&&n>=40)code=b.readUInt16LE(24);
   fmt={code,channels:b.readUInt16LE(2),sampleRate:b.readUInt32LE(4),align:b.readUInt16LE(12),bits:b.readUInt16LE(14)};
  }
  if(tag==='data')data={offset:pos+8,bytes:n};
  if(fmt&&data)break;pos+=8+n+(n%2);
 }
 if(!fmt||!data||![1,2].includes(fmt.channels)||fmt.sampleRate<8000||fmt.sampleRate>192000||
 !((fmt.code===3&&fmt.bits===32)||(fmt.code===1&&[16,24,32].includes(fmt.bits)))||
 fmt.align!==fmt.channels*fmt.bits/8||data.bytes%fmt.align)throw Error('wav-format');
 return {...fmt,...data,frames:data.bytes/fmt.align,duration:data.bytes/fmt.align/fmt.sampleRate};
}
function sample(b,at,h){let v=h.code===3?b.readFloatLE(at):h.bits===16?b.readInt16LE(at)/32768:h.bits===24?b.readIntLE(at,3)/8388608:b.readInt32LE(at)/2147483648;return Number.isFinite(v)?v:0;}
function createAudioReader(){
 const entries=new Map(),cache=new Map();
 async function register(file,trackId){
  const stat=await fs.stat(file),key=crypto.createHash('sha256').update(JSON.stringify([file,stat.size,stat.mtimeMs])).digest('hex');
  if(cache.has(key)){entries.set(key,{...cache.get(key),trackId});return cache.get(key).public;}
  const f=await fs.open(file,'r');
  try{const h=await header(f,stat.size),waveform=[];
   // A sampled overview, not a peak envelope: bounded IO even on a ten-minute song.
   for(let i=0;i<256;i++){const start=Math.min(Math.floor(i*h.frames/256),Math.max(0,h.frames-256)),frames=Math.min(256,h.frames-start);
    const b=Buffer.alloc(frames*h.align);await f.read(b,0,b.length,h.offset+start*h.align);
    let peak=0;for(let j=0;j<b.length;j+=h.bits/8)peak=Math.max(peak,Math.abs(sample(b,j,h)));waveform.push(Math.min(1,peak));
   }
   const item={file,size:stat.size,mtime:stat.mtimeMs,h,trackId,public:{key,streamKey:key,url:pathToFileURL(file).href,stream:true,duration:h.duration,sampleRate:h.sampleRate,channels:h.channels,waveform}};
   if(cache.size>=64)cache.delete(cache.keys().next().value);cache.set(key,item);entries.set(key,item);
   // Only retain source authorization for a bounded number of recently visited tracks.
   if(entries.size>256)entries.delete(entries.keys().next().value);
   return item.public;
  }finally{await f.close();}
 }
 async function chunk({trackId,key,index}){
  const e=entries.get(key);if(!e||e.trackId!==trackId||!Number.isSafeInteger(index)||index<0)throw Error('wav-source-unavailable');
  const s=await fs.stat(e.file);if(s.size!==e.size||Math.abs(s.mtimeMs-e.mtime)>1)throw Error('wav-source-changed');
  const h=e.h,start=index*BLOCK_SECONDS*h.sampleRate,frames=Math.min(BLOCK_SECONDS*h.sampleRate,h.frames-start);
  if(frames<=0)throw Error('wav-range');
  const f=await fs.open(e.file,'r');try{
   const b=Buffer.alloc(frames*h.align);const result=await f.read(b,0,b.length,h.offset+start*h.align);if(result.bytesRead!==b.length)throw Error('wav-truncated');
   const channels=Array.from({length:h.channels},()=>new Float32Array(frames));
   for(let i=0;i<frames;i++)for(let c=0;c<h.channels;c++)channels[c][i]=sample(b,i*h.align+c*h.bits/8,h);
   return {ok:true,index,sampleRate:h.sampleRate,frames,channels};
  }finally{await f.close();}
 }
 return {register,chunk};
}
// Only validated complements are offered. No user-provided paths cross the playback IPC boundary.
function createCatalog({assets,refinement,reader}){
 async function read(track,midi,selection=null){
  const base=await assets.readStems(track),directory=assets.directory(track),groups=[],warnings=[];
  const folder=path.join(directory,'refinement');
  const names=await fs.readdir(folder).catch(()=>[]);
  for(const name of names){
   if(!/^[a-f0-9]{64}\.json$/.test(name))continue;
   try{
    const saved=JSON.parse(await fs.readFile(path.join(folder,name),'utf8'));
    if(saved.scope!=='full'||saved.engine!=='mega-53')continue;
    const r=await refinement.read(track,{engine:saved.engine,scope:'full',sourceStem:saved.sourceStem,target:saved.target,device:saved.requestedDevice});
    if(!r.ok||r.cacheKey!==name.slice(0,-5)){warnings.push({parent:saved.sourceStem,target:saved.target,error:r.error||'source-changed'});continue;}
    if(r.timeOrigin!==0||r.reconstructionError>1e-5)throw Error('mix-timebase');
    groups.push({id:r.runId,parent:r.sourceStem,target:r.target,createdAt:r.createdAt,record:r});
   }catch(error){warnings.push({error:error.message});}
  }
  groups.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  let selected=selection;
  if(selected===null){selected={};const strings=await assets.stringSources.current(track);const g=groups.find(g=>g.id===strings?.runId);if(g)selected[g.parent]=g.id;}
  if(!selected||typeof selected!=='object'||Array.isArray(selected))throw Error('mix-selection-invalid');
  const chosen=[];
  for(const [parent,id] of Object.entries(selected)){if(!id)continue;const g=groups.find(g=>g.parent===parent&&g.id===id);if(!g)throw Error('mix-source-unavailable');chosen.push(g);}
  if(chosen.some(g=>g.parent==='mix')&&chosen.length>1)throw Error('mix-parent-overlap');
  const lanes=[],added=new Set();
  async function add(stem,file,engineName,runId,expected,midiStem=stem){
   const sourceAudio=await reader.register(file,track.id);
   if(Math.abs(sourceAudio.duration-expected)>1/sourceAudio.sampleRate+.00001)throw Error('mix-timebase');
   if(added.has(sourceAudio.key))throw Error('mix-duplicate-source');added.add(sourceAudio.key);
   const m=midi.find(l=>l.stem===midiStem&&l.sourceRunId===runId);
   // Preserve the editor's persisted source identity. PCM cache identity is separate.
   lanes.push(m?{...m,sourceAudio:{...sourceAudio,key:m.sourceAudio?.key||sourceAudio.key},duration:sourceAudio.duration}:{stem,engineName,noteCount:0,notes:[],instruments:[],editable:false,wavOnly:true,duration:sourceAudio.duration,sourceAudio});
  }
  if(!chosen.some(g=>g.parent==='mix')&&base.ok){
   for(const stem of base.stems)if(!chosen.some(g=>g.parent===stem.name))await add(stem.name,fileURLToPath(stem.audioUrl),base.engine,base.runId,stem.frames/stem.sampleRate);
  }
  for(const g of chosen){
   const r=g.record;
   if(g.parent!=='mix'&&(!base.ok||r.parentRunId!==base.runId))throw Error('mix-source-unavailable');
   const targetMidi=midi.find(l=>l.stem==='strings'&&l.sourceRunId===r.runId);
   const stem=targetMidi?'strings':g.parent+' / '+g.target;
   // Raw complementary files share unity gain. The common output limiter handles peaks.
   // Independently normalized "listen-" files must never be substituted into this graph.
   await add(stem,path.join(folder,r.files.target),'Mega · '+g.target,r.runId,r.duration,targetMidi?'strings':null);
   await add(g.parent+' / residual',path.join(folder,r.files.residual),'Mega · residual',r.runId,r.duration,null);
  }
  // With no separation, valid MIDI is still useful; do not invent complementary WAVs.
  if(!base.ok&&!chosen.length)for(const l of midi)lanes.push({...l,sourceAudio:null});
  const duration=Math.max(0,...lanes.map(l=>l.duration));
  if(lanes.some(l=>Math.abs(l.duration-duration)>.025))throw Error('mix-timebase');
  return {lanes,mixCatalog:{groups:groups.map(({record,...g})=>g),selected:Object.fromEntries(chosen.map(g=>[g.parent,g.id])),warnings}};
 }
 return {read};
}
module.exports={createAudioReader,createCatalog,header,BLOCK_SECONDS};
