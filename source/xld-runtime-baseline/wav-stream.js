// Bounded PCM playback on the same AudioContext clock as MIDI. No HTMLMediaElement drift.
(function(root){
'use strict';
const BLOCK=4,HORIZON=8,LIMIT=64*1024*1024;
function create({context,readChunk,onFailure}){
 const cache=new Map(),pending=new Map();let bytes=0,epoch=0,session=null;
 let metrics={reads:0,cacheHits:0,peakBytes:0,underruns:0,scheduled:0};
 async function buffer(source,index){
  const sourceKey=source.streamKey||source.key,key=sourceKey+':'+index;
  if(cache.has(key)){const b=cache.get(key);cache.delete(key);cache.set(key,b);metrics.cacheHits++;return b;}
  if(pending.has(key))return pending.get(key);
  const p=(async()=>{
   const r=await readChunk(sourceKey,index);if(!r?.ok)throw Error(r?.error||'wav-read');
   const b=context.createBuffer(r.channels.length,r.frames,r.sampleRate);
   r.channels.forEach((c,i)=>b.getChannelData(i).set(c));
   metrics.reads++;const size=b.length*b.numberOfChannels*4;
   while(bytes+size>LIMIT&&cache.size){const oldest=cache.keys().next().value,old=cache.get(oldest);bytes-=old.length*old.numberOfChannels*4;cache.delete(oldest);}
   cache.set(key,b);bytes+=size;metrics.peakBytes=Math.max(metrics.peakBytes,bytes);return b;
  })();pending.set(key,p);try{return await p;}finally{pending.delete(key);}
 }
 function stop(){
  epoch++;const s=session;session=null;if(!s)return;s.stopped=true;
  for(const g of s.gains){const p=g.gain;if(p.cancelAndHoldAtTime)p.cancelAndHoldAtTime(context.currentTime);else{p.cancelScheduledValues(context.currentTime);p.setValueAtTime(p.value,context.currentTime);}p.linearRampToValueAtTime(0,context.currentTime+.015);}
  for(const v of s.voices){try{v.stop(context.currentTime+.015);}catch{}}
  if(!s.voices.length)for(const g of s.gains)g.disconnect();
 }
 async function prepare(sources,from,end,repeating,loopStart){
  stop();const generation=epoch;
  const gains=[];sources=sources.map(source=>{
   if(!context.createGain)return source;
   const gain=context.createGain();gain.gain.value=0;gain.connect(source.destination);gains.push(gain);return {...source,destination:gain};
  });
  const s={sources,gains,from,end,repeating,loopStart,origin:null,elapsed:0,position:from,voices:[],busy:false,prepared:[]};session=s;
  async function first(){
   for(let elapsed=0,position=from;elapsed<HORIZON;){
    if(position>=end-1e-7){if(!repeating)break;position=loopStart;}
    const index=Math.floor((position+1e-8)/BLOCK),length=Math.min(BLOCK*(index+1),end)-position;
    if(!(length>0))throw Error('wav-range');
    const buffers=await Promise.all(sources.map(l=>buffer(l.sourceAudio,index)));
    if(generation!==epoch)return false;
    s.prepared.push({elapsed,position,length,buffers});elapsed+=length;position+=length;
    s.elapsed=elapsed;s.position=position;
   }return true;
  }
  return first();
 }
 function schedule(s,part){
  const at=s.origin+part.elapsed;
  if(at<context.currentTime-.002){metrics.underruns++;throw Error('wav-underrun');}
  part.buffers.forEach((b,i)=>{
   const node=context.createBufferSource();node.buffer=b;node.connect(s.sources[i].destination);
   node.start(at,Math.max(0,part.position-Math.floor((part.position+1e-8)/BLOCK)*BLOCK),part.length);node.stop(at+part.length);
   s.voices.push(node);metrics.scheduled++;
   node.onended=()=>{node.disconnect();const index=s.voices.indexOf(node);if(index>=0)s.voices.splice(index,1);if(s.stopped&&!s.voices.length)for(const g of s.gains)g.disconnect();};
  });
 }
 function start(origin){if(!session)return;session.origin=origin;for(const g of session.gains){g.gain.setValueAtTime(0,origin);g.gain.linearRampToValueAtTime(1,origin+.015);}for(const part of session.prepared)schedule(session,part);session.prepared=[];}
 async function tick(){
  const s=session,generation=epoch;if(!s||s.origin===null||s.busy)return;
  s.busy=true;
  try{while(s.origin+s.elapsed<context.currentTime+HORIZON){
   if(s.position>=s.end-1e-7){if(!s.repeating)break;s.position=s.loopStart;}
   const index=Math.floor((s.position+1e-8)/BLOCK),length=Math.min(BLOCK*(index+1),s.end)-s.position;
   if(!(length>0))throw Error('wav-range');
   const buffers=await Promise.all(s.sources.map(l=>buffer(l.sourceAudio,index)));
   if(generation!==epoch)return;
   schedule(s,{elapsed:s.elapsed,position:s.position,length,buffers});s.elapsed+=length;s.position+=length;
  }}catch(error){if(generation===epoch){stop();onFailure(error.message);}}
  finally{s.busy=false;}
 }
 function clear(){stop();cache.clear();bytes=0;}
 return {prepare,start,tick,stop,clear,diagnostics:()=>({...metrics,bytes,uniqueSources:session?.sources.length||0,queued:session?.voices.length||0})};
}
const api={create,BLOCK,HORIZON,LIMIT};if(typeof module==='object'&&module.exports)module.exports=api;root.XldWavStream=api;
})(globalThis);
