(function(root){
'use strict';
const copy={zh:{open:'删除这首歌…',title:'永久删除这首歌',loading:'正在统计本曲文件…',intro:'将永久删除下方原曲文件和所选结果，不进入回收站，无法撤销。',original:'原曲文件',audio:'分轨、试听及其他音频 / 曲库缓存',small:'MIDI、分析数据及人工标注等小结果',all:'全部删除',keep:'保留小结果，删除原曲及音频',retain:'保留时歌曲仍会移出曲库；小结果留在以下分析目录，可在资源管理器查看：',none:'无',cancel:'取消',confirm:'永久删除所选内容',working:'正在删除，请稍候…',saved:'将保留',free:'预计释放',failed:'未完成删除：',done:'已删除。预计释放',retained:'保留',blocked:'当前不能删除：',busy:'当前分析或音频缓存正在处理，将自动重新统计…',stale:'曲目已切换，请重新打开删除计划。',files:'个文件',unknown:'无法获取删除计划',error:'删除遇到问题，请重新统计后重试。',missing:'原曲已经缺失；仍可清理这首歌的结果。'},en:{open:'Delete this song…',title:'Permanently delete this song',loading:'Measuring this song’s files…',intro:'The source file below and selected results will be permanently deleted. This bypasses the Recycle Bin and cannot be undone.',original:'Original source file',audio:'Stems, previews, other audio / library caches',small:'MIDI, analysis data and manual annotations',all:'Delete everything',keep:'Keep small results; delete source and audio',retain:'The song leaves the library even if kept. Find the small results in these analysis folders using File Explorer:',none:'None',cancel:'Cancel',confirm:'Permanently delete selected files',working:'Deleting, please wait…',saved:'Will keep',free:'Estimated space released',failed:'Deletion incomplete: ',done:'Deleted. Estimated space released',retained:'Kept',blocked:'Cannot delete now: ',busy:'Analysis or audio cache is busy. Retrying automatically…',stale:'The selected song changed. Open a new deletion plan.',files:'files',unknown:'Could not prepare deletion plan',error:'Deletion encountered a problem. Prepare a new plan to retry.',missing:'The source is already missing; its results can still be removed.'}};
function create({bridge,getSelected,getBusy,onExecuting,beforeExecute,onChanged,onCancelled}){
 const button=document.getElementById('removeTrackButton'),dialog=document.getElementById('trackRemovalDialog');
 if(!button||!dialog)return null;
 const el=id=>document.getElementById('trackRemoval'+id);
 let target=null,plan=null,epoch=0,loading=false,executing=false,message='',outcome=false,retryTimer=null;
 function stopRetry(){if(retryTimer!==null){clearTimeout(retryTimer);retryTimer=null;}}
 const t=key=>(copy[String(root.xinXldLocale?.getLocale?.()||document.documentElement.lang).startsWith('en')?'en':'zh'][key]);
 const bytes=n=>{n=Number(n)||0;const units=['B','KiB','MiB','GiB'];let i=0;while(n>=1024&&i<3){n/=1024;i++;}return `${n.toFixed(i?2:0)} ${units[i]}`;};
 const amount=group=>`${bytes(group?.bytes)} · ${group?.files||0} ${t('files')}`;
 const issues=items=>(items||[]).map(value=>typeof value==='string'?value:[value.path,value.error||String(value)].filter(Boolean).join(': ')).join('\n');
 function render(){
  button.textContent=t('open');button.disabled=Boolean(getBusy?.())||executing||!getSelected();
  el('Title').textContent=t('title');el('Cancel').textContent=t('cancel');el('Cancel').disabled=executing;
  el('Confirm').textContent=executing?t('working'):t('confirm');
  el('Confirm').disabled=loading||executing||!plan||outcome||Boolean(getBusy?.())||Boolean(plan.blocked?.length)||plan.busy;
  el('Name').textContent=target?`${target.title} · ${target.artist||''}`:'';
  el('Intro').textContent=t('intro');el('AllLabel').textContent=t('all');el('KeepLabel').textContent=t('keep');
  el('Keep').disabled=loading||executing||!plan?.retainable;el('All').disabled=loading||executing;
  el('Details').hidden=!plan;
  for(const [id,key]of [['Original','original'],['Audio','audio'],['Small','small']])el(id).textContent=`${t(key)}: ${amount(plan?.[key])}`;
  el('Path').textContent=plan?.original?.path||'';
  el('RetainTitle').textContent=t('retain');
  el('RetainFiles').textContent=[...(plan?.smallNames||[]),'',...(plan?.retainedPaths||[])].join('\n').trim()||t('none');
  el('Retain').hidden=!el('Keep').checked;
  el('Estimate').textContent=plan?`${t('free')}: ${bytes((plan.totalBytes||0)-(el('Keep').checked?(plan.small?.bytes||0):0))} · ${t('saved')}: ${bytes(el('Keep').checked?plan.small?.bytes:0)}`:'';
  if(plan?.retainable&&plan.small?.files){
   const small=Number(plan.small.bytes)||0,total=Number(plan.totalBytes)||0,ratio=total?100*small/total:0;
   el('Estimate').textContent+='\n'+(document.documentElement.lang.startsWith('en')?`Keeping small results uses ${ratio.toFixed(2)}% of the total; still releases approximately ${bytes(total-small)}.`:`小结果占总量 ${ratio.toFixed(2)}%；选择保留后仍预计释放 ${bytes(total-small)}。`);
  }
  el('Status').textContent=message||(loading?t('loading'):plan?.blocked?.length?t('blocked')+issues(plan.blocked):plan?.busy?t('busy'):issues(plan?.warnings));
 }
 function close(){if(executing)return;stopRetry();epoch++;loading=false;plan=null;target=null;dialog.close();render();}
 async function refreshPlan(ticket){
  if(ticket!==epoch||!dialog.open||executing)return;
  if(getSelected()?.id!==target?.id){plan=null;message=t('stale');loading=false;render();return;}
  try{const result=await bridge.planTrackRemoval(target.id);if(ticket!==epoch||!dialog.open||executing)return;if(getSelected()?.id!==target?.id){plan=null;message=t('stale');return;}if(!result?.ok){plan=null;message=result?.error||t('unknown');return;}plan=result;}
  catch(error){if(ticket===epoch)message=error.message||t('unknown');}
  finally{if(ticket===epoch&&!executing){loading=false;render();if(dialog.open&&plan?.busy&&getSelected()?.id===target?.id)retryTimer=setTimeout(()=>{retryTimer=null;refreshPlan(ticket);},700);}}
 }
 async function open(){
  if(executing||getBusy?.()||!getSelected())return;
  stopRetry();target={...getSelected()};plan=null;message='';outcome=false;loading=true;el('All').checked=true;el('Keep').checked=false;
  const ticket=++epoch;dialog.showModal();render();
  await refreshPlan(ticket);
 }
 async function execute(){
  if(!plan||executing||getBusy?.()||plan.blocked?.length||plan.busy)return;
  if(getSelected()?.id!==target.id){plan=null;message=t('stale');render();return;}
  stopRetry();const trackId=target.id,token=plan.token,keepSmall=el('Keep').checked;
  executing=true;onExecuting?.(true);render();
  try{
   const confirmation=await bridge.confirmTrackRemoval({trackId,token,keepSmall});
   if(confirmation?.canceled||confirmation?.cancelled||confirmation?.confirmed===false){message='';plan=null;return;}
   if(!confirmation?.ok){plan=null;message=t('failed')+(confirmation?.error||t('error'));return;}
   await beforeExecute?.(trackId);
   const result=await bridge.executeTrackRemoval({trackId,token,keepSmall});
   if(result?.canceled||result?.cancelled){message='';plan=null;await onCancelled?.();return;}
   outcome=true;plan=null;
   await onChanged?.(trackId,result||{});
   message=result?.ok?`${t('done')} ${bytes(result.deletedBytes)} · ${t('retained')} ${bytes(result.retainedBytes)}`:t('failed')+(issues(result?.errors)||result?.error||t('error'));
   if(result?.retainedPaths?.length)message+='\n'+t('retain')+'\n'+result.retainedPaths.join('\n');
  }catch(error){plan=null;message=t('failed')+(error.message||t('error'));await onChanged?.(trackId,{});}
  finally{executing=false;onExecuting?.(false);render();}
 }
 button.addEventListener('click',open);el('Cancel').addEventListener('click',close);el('Confirm').addEventListener('click',execute);
 el('Keep').addEventListener('change',render);el('All').addEventListener('change',render);
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 root.xinXldLocale?.subscribe?.(render,false);render();
 return {render,open,isExecuting:()=>executing};
}
root.XldTrackRemovalControls={create};
})(globalThis);
