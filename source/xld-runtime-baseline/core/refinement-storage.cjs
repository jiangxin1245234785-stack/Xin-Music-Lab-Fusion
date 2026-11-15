'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {guarded}=require('./storage.cjs'),{header}=require('./mix-audio.cjs'),{writeAtomic}=require('./derived-assets.cjs');
const names=['original.wav','listen-original.wav','listen-target.wav','listen-residual.wav'];
const same=(a,b)=>a.size===b.size&&a.mtimeMs===b.mtimeMs;
async function exactRange(source,original,first,frames,check=()=>{}){
 // Byte comparison of two float WAVs; a FLAC stem (after the migration) is never byte-equal to a WAV slice.
 if(/\.flac$/i.test(source)||/\.flac$/i.test(original))return false;
 const a=await fs.open(source,'r');let b;
 try{b=await fs.open(original,'r');const ah=await header(a,(await a.stat()).size),bh=await header(b,(await b.stat()).size);
  if(ah.code!==3||bh.code!==3||ah.bits!==32||bh.bits!==32||ah.channels!==bh.channels||ah.sampleRate!==bh.sampleRate||bh.frames!==frames||first+frames>ah.frames)return false;
  const length=frames*ah.align,ab=Buffer.alloc(Math.min(length,1024*1024)),bb=Buffer.alloc(ab.length);
  for(let pos=0;pos<length;pos+=ab.length){check();const n=Math.min(ab.length,length-pos);
   const ar=await a.read(ab,0,n,ah.offset+first*ah.align+pos),br=await b.read(bb,0,n,bh.offset+pos);
   if(ar.bytesRead!==n||br.bytesRead!==n||!ab.subarray(0,n).equals(bb.subarray(0,n)))return false;
  }return true;
 }finally{await a.close();await b?.close();}
}
function createOptimizer({assets,trackForDirectory,trash,remove=file=>fs.unlink(file)}){
 const refinement=require('./refinement.cjs').createRefinement({assets});
 return async function optimize({root,row,mode='trash',check=()=>{},confirm=async()=>true}){
  if(!['trash','permanent'].includes(mode)||row.kind!=='refinement')throw Error('storage-options-invalid');
  const track=trackForDirectory(path.dirname(path.dirname(row.directory)));if(!track)throw Error('请先载入该曲目的曲库');
  const manifest=await guarded(root,row.manifest),text=await fs.readFile(manifest,'utf8'),saved=JSON.parse(text);
  const options={engine:saved.engine,scope:saved.scope||'preview',start:saved.timeOrigin,duration:saved.requestedDuration||30,sourceStem:saved.sourceStem,target:saved.target,device:saved.requestedDevice};
  const ctx=await refinement.context(track,options);if(path.resolve(manifest)!==path.join(ctx.directory,ctx.cacheKey+'.json')||saved.runId!==row.runId)throw Error('结果来源已变化，请先切回对应基础分轨');
  await refinement.validate(saved,ctx);check();
  const journalFile=path.join(ctx.directory,'storage-optimization',row.runId+'.json');
  let next=saved,candidates=[],journal;
  if(saved.schemaVersion===2){
   if(!saved.playback)throw Error('该旧结果缺少试听增益，请保留原样');
   const first=Math.round(saved.timeOrigin*saved.sampleRate),original=await guarded(root,path.join(ctx.directory,saved.files.original));
   const source=await guarded(root,ctx.input).catch(()=>null);
   const useReference=saved.sourceStem!=='mix'&&source&&await exactRange(source,original,first,saved.frames,check);
   next={...saved,schemaVersion:3,files:{...saved.files},playback:{mode:'dynamic',gain:saved.playback.gain,peaks:saved.playback.peaks}};
   if(useReference){delete next.files.original;next.originalSource={kind:'stem',runId:ctx.parentRunId,stem:ctx.sourceStem,startFrame:first,frames:saved.frames,size:ctx.size,mtimeMs:ctx.mtimeMs};}
   const files=[...(useReference?[saved.files.original]:[]),...Object.values(saved.playback.files).filter(file=>path.basename(file).startsWith('listen-'))];
   for(const relative of new Set(files)){const file=await guarded(root,path.join(ctx.directory,relative)),stat=await fs.stat(file);candidates.push({name:path.basename(file),size:stat.size,mtimeMs:stat.mtimeMs});}
   if(!candidates.length)return {ok:true,optimized:true,bytes:0,mode,retainedOriginal:!useReference};
   journal={schemaVersion:1,runId:row.runId,cacheKey:ctx.cacheKey,original:saved,candidates,at:new Date().toISOString()};
  }else{
   journal=JSON.parse(await fs.readFile(await guarded(root,journalFile),'utf8'));
   if(journal.runId!==row.runId||journal.cacheKey!==ctx.cacheKey||!Array.isArray(journal.candidates))throw Error('storage-journal-invalid');
   candidates=journal.candidates;
  }
  const live=[];
  for(const entry of candidates){if(!names.includes(entry.name)||!Number.isFinite(entry.size)||!Number.isFinite(entry.mtimeMs))throw Error('storage-journal-invalid');
   const file=path.join(row.directory,entry.name);let stat;try{stat=await fs.stat(await guarded(root,file));}catch(e){if(e.code==='ENOENT')continue;throw e;}
   if(!same(stat,entry))throw Error('副本已变化，请保留原样');live.push({...entry,file});
  }
  if(!await confirm({mode,bytes:live.reduce((sum,e)=>sum+e.size,0),rows:[row]}))return {ok:true,canceled:true};
  check();const fresh=await refinement.context(track,options);
  if(fresh.cacheKey!==ctx.cacheKey||await fs.readFile(manifest,'utf8')!==text)throw Error('来源或结果已变化，请刷新后重试');
  // Validate all surviving audio before committing metadata. Target/residual are never rewritten.
  await refinement.validate(next,ctx);
  for(const entry of live)if(!same(await fs.stat(await guarded(root,entry.file)),entry))throw Error('副本已变化，请保留原样');
  check();
  if(saved.schemaVersion===2){
   await fs.mkdir(path.dirname(journalFile),{recursive:true});await guarded(root,path.dirname(journalFile));
   await writeAtomic(journalFile,journal);check();await writeAtomic(manifest,next);
   const verified=await refinement.read(track,options);
   if(!verified.ok){await writeAtomic(manifest,saved);throw Error(verified.error);}
  }
  let bytes=0;const errors=[];
  for(const entry of live){try{check();await guarded(root,entry.file);if(!same(await fs.stat(entry.file),entry))throw Error('副本已变化');if(mode==='trash'){if(!trash)throw Error('回收站不可用');await trash(entry.file);}else await remove(entry.file);bytes+=entry.size;}catch(e){errors.push(e.message);break;}}
  return {ok:true,optimized:true,bytes,mode,errors,retainedOriginal:Boolean(next.files.original),pendingCleanup:errors.length>0};
 };
}
module.exports={createOptimizer,exactRange};
