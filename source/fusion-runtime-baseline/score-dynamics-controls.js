(function(root){
 'use strict';
 const doc=root.document,bridge=root.XinsMusicLabFusion,input=doc.getElementById('scoreDynamicsEnabled');
 if(!input||!bridge?.scoreDynamics)return;
 const tools=doc.getElementById('scoreDynamicsTools'),status=doc.getElementById('scoreDynamicsStatus'),run=doc.getElementById('scoreDynamicsRun'),cancel=doc.getElementById('scoreDynamicsCancel');
 const KEY='xin-score-dynamics-enabled',i18n=root.XinMusicLabDynamicUi,say=(key,fallback,params={})=>i18n?.t(key,params,fallback)||fallback;
 try{input.checked=root.localStorage.getItem(KEY)==='true';}catch(_){}
 let track='',health=null,task=null,pending=false,loading=false;
 const enabled=()=>input.checked,busy=()=>task&&['preparing','running','cancelling'].includes(task.status);
 function render(){
  const working=busy();tools.hidden=!enabled()&&!working;
  run.disabled=!enabled()||!track||working||pending||loading;cancel.hidden=!working;cancel.disabled=pending||task?.status==='cancelling';
  run.textContent=health?.state==='ready'?say('dynamics.regenerate','重新生成'):say('dynamics.generate','生成力度副本');
  if(working){status.textContent=task.status==='preparing'?say('dynamics.preparing','正在核对来源…'):task.status==='cancelling'?say('dynamics.cancelling','正在取消，之前的副本会保留…'):say('dynamics.progress','正在生成 {title} · {done}/{total}',{title:task.title,done:task.completed,total:task.total});return;}
  if(!enabled()){status.textContent=say('dynamics.original','使用原值');return;}
  if(!track){status.textContent=say('dynamics.choose','先选一首有转谱结果的歌。');return;}
  if(loading){status.textContent=say('dynamics.reading','正在读取谱面…');return;}
  if(task?.trackId===track&&task.status==='failed'){status.textContent=say('dynamics.failed','这次生成未完成，仍使用可用副本或原值。');return;}
  if(task?.trackId===track&&task.status==='canceled'){status.textContent=say('dynamics.canceled','已取消；之前的副本和原值都保留。');return;}
  if(health?.state==='ready'&&health.applied?.length){status.textContent=say('dynamics.ready','已使用 {count} 个声部的力度副本',{count:health.applied.length});return;}
  status.textContent=health?.state==='unneeded'?say('dynamics.unneeded','当前没有可处理的恒定力度声部。'):health?.state==='unavailable'?say('dynamics.unavailable','副本暂不可用，仍显示原值；可以重新生成。'):say('dynamics.missing','还没有匹配的副本，先生成一次。');
 }
 function refresh(){root.dispatchEvent(new root.CustomEvent('xin-score-dynamics-change'));}
 function receive(next){if(!next)return;const terminal=next.id!==task?.id||next.status!==task?.status;task=next;render();if(terminal&&['complete','cached'].includes(next.status)&&next.trackId===track&&enabled())refresh();}
 input.addEventListener('change',()=>{try{root.localStorage.setItem(KEY,String(enabled()));}catch(_){}health=null;loading=Boolean(track);render();refresh();});
 run.addEventListener('click',async()=>{if(run.disabled)return;const id=track;pending=true;render();try{const result=await bridge.scoreDynamics({action:'run',trackId:id,force:health?.state==='ready'});if(result.ok)receive(result.task);else{task={trackId:id,status:'failed',error:result.error};}}catch(error){task={trackId:id,status:'failed',error:String(error)};}finally{pending=false;render();}});
 cancel.addEventListener('click',async()=>{if(!busy()||pending)return;pending=true;render();try{const result=await bridge.scoreDynamics({action:'cancel',taskId:task.id});if(result.ok)receive(result.task);}catch(error){task={...task,status:'failed',error:String(error)};}finally{pending=false;render();}});
 root.addEventListener('xin-score-track',e=>{const id=e.detail?.trackId||'';if(id!==track)health=null;track=id;loading=Boolean(track);render();});
 root.addEventListener('xin-score-ready',e=>{if(e.detail?.trackId!==track)return;health=e.detail.dynamics;loading=false;render();});
 const unsubscribe=bridge.onScoreDynamicsTask?.(receive);const unsubscribeLocale=i18n?.subscribe(render);
 bridge.scoreDynamics({action:'task'}).then(result=>{if(result.ok)receive(result.task);}).catch(()=>{});
 root.addEventListener('beforeunload',()=>{unsubscribe?.();unsubscribeLocale?.();},{once:true});
 root.XinScoreDynamicsControls=Object.freeze({enabled,status:()=>({track,health,task,loading,pending})});render();
})(globalThis);
