// Compact refinement audition reuses the bounded PCM scheduler. Raw floats never enter a clipped media decoder.
(function(root){
'use strict';
function create({readChunk,onChange=()=>{},createContext=()=>new root.AudioContext(),createStream=options=>root.XldWavStream.create(options)}){
 let ctx,bus,stream,value=null,position=0,origin=0,from=0,playing=false,loading=false,epoch=0,master=1,loop=null,error='';
 const offset=()=>value?.sourceOffset||0;
 function time(){if(!playing)return position;const elapsed=Math.max(0,ctx.currentTime-origin),end=loop?.enabled?loop.end:value.end;let t=from+elapsed;if(loop?.enabled&&t>=end)t=loop.start+(t-end)%(end-loop.start);return Math.min(t,end);}
 function pause(){position=time();epoch++;playing=false;loading=false;stream?.stop();onChange();}
 function set(next){pause();value=next;loop=null;position=next.start;error='';volume(master);}
 function volume(v){master=v;if(bus)bus.gain.value=master*(value?.gain??1);}
 async function play(){
  if(!value)return false;pause();const ticket=++epoch;loading=true;error='';onChange();
  try{
   if(!ctx){ctx=createContext();bus=ctx.createGain();bus.connect(ctx.destination);stream=createStream({context:ctx,readChunk:(key,index)=>readChunk(value.track.id,key,index),onFailure:reason=>{error=reason;pause();}});}
   volume(master);await ctx.resume();if(ticket!==epoch)return false;
   const start=loop?.enabled?loop.start:value.start,end=loop?.enabled?loop.end:value.end;
   if(position<start||position>=end)position=start;from=position;
   const prepared=await stream.prepare([{sourceAudio:value.sourceAudio,destination:bus}],from-value.start+offset(),end-value.start+offset(),Boolean(loop?.enabled),start-value.start+offset());
   if(!prepared||ticket!==epoch)return false;
   origin=ctx.currentTime+.025;stream.start(origin);loading=false;playing=true;onChange();return true;
  }catch(e){if(ticket===epoch){error=e.message;pause();}return false;}
 }
 function seek(t){const resume=playing||loading;pause();position=Math.max(value.start,Math.min(value.end,t));if(resume)void play();else onChange();}
 function setLoop(next){const resume=playing||loading;pause();loop=next&&{...next};if(resume)void play();}
 function tick(){if(!playing)return;if(!loop?.enabled&&time()>=value.end){position=value.end;pause();return;}void stream.tick();}
 function clear(){pause();value=null;stream?.clear();}
 return {set,play,pause,stop:pause,seek,volume,loop:setLoop,tick,clear,info:()=>({playing,loading,time:time(),error}),diagnostics:()=>stream?.diagnostics()};
}
const api={create};if(typeof module==='object'&&module.exports)module.exports=api;root.XldRefinementPlayer=api;
})(globalThis);
