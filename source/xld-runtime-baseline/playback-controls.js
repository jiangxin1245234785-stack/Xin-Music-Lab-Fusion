// R12: one owner for all existing players. Listening state never changes saved MIDI.
(function(root){
'use strict';
function create({sources,onChange,onClaim,volume=0.82}){
 let active='main',loop=null,epoch=0,switching=false,ticking=false,error='';
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 const source=()=>sources[active];
 const info=()=>({...source().info(),id:active,error,loop:loop&&{...loop}});
 function changed(){onChange?.(info());}
 function setVolume(value){volume=clamp(Number(value)||0,0,1);for(const s of Object.values(sources))s.volume(volume);changed();}
 function claim(id){
  if(!sources[id])return false;
  if(active===id)return true;
  if(switching)return active===id;
  if(active!==id){
   switching=true;active=id;epoch++;error='';
   onClaim?.(id);
   for(const [key,s]of Object.entries(sources))if(key!==id)s.stop();
   switching=false;
  }
  const range=source().info();
  if(!loop&&source().currentLoop?.())loop={...source().currentLoop(),trackId:range.trackId};
  if(loop&&(loop.trackId!==range.trackId||loop.start<(range.start||0)||loop.end>range.end))loop=null;
  source().loop?.(loop);source().volume(volume);changed();return true;
 }
 function pause(){epoch++;source().pause();changed();}
 async function play(){
  const ticket=++epoch;error='';
  try{const result=await source().play();if(ticket===epoch){if(result===false)error='failed';changed();}return result;}
  catch(e){if(ticket===epoch&&e?.name!=='AbortError'){error='failed';source().pause();changed();}return false;}
 }
 function toggle(){const s=source().info();return s.playing||s.loading?pause():play();}
 function seek(value){
  const s=source().info(),n=Number(value);if(!Number.isFinite(n)||!s.available)return false;
  if(n<(s.start||0)||n>s.end){source().pause();error='range';changed();return true;}
  error='';if(loop&&(n<loop.start||n>=loop.end)){loop.enabled=false;source().loop?.(loop);}
  source().seek(clamp(n,s.start||0,s.end));changed();return true;
 }
 function setLoop(start,end,enabled=true){
  const s=source().info();start=Number(start);end=Number(end);
  if(!s.available||!Number.isFinite(start+end)||start<(s.start||0)||end>s.end||end-start<.25){error='range';changed();return false;}
  loop={start,end,enabled,trackId:s.trackId};error='';
  source().loop?.(loop);
  if(enabled&&(s.time<start||s.time>=end))source().seek(start);
  changed();return true;
 }
 function enableLoop(enabled){if(loop){loop.enabled=Boolean(enabled);source().loop?.(loop);changed();}}
 function clearLoop(){loop=null;source().loop?.(null);changed();}
 function stop(){epoch++;loop=null;for(const s of Object.values(sources))s.stop();active='main';error='';changed();}
 function tick(){
  if(ticking||switching)return;ticking=true;
  try{
   const s=source().info();
   if(loop?.enabled&&s.trackId===loop.trackId&&s.playing&&!source().scheduledLoop&&s.time>=loop.end)source().seek(loop.start);
   changed();
  }finally{ticking=false;}
 }
 return {claim,info,play,pause,toggle,seek,setLoop,enableLoop,clearLoop,stop,tick,setVolume,
  loop:()=>loop&&{...loop},owner:()=>active,volume:()=>volume};
}
const api={create};if(typeof module==='object'&&module.exports)module.exports=api;root.XldPlaybackControls=api;
})(globalThis);
