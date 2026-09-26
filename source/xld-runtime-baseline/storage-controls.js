(function(root){
 'use strict';
 function create({bridge,getBusy,beforeClear,onChanged}){
  const $=id=>document.getElementById(id),dialog=$('storageDialog');let data=null,pending=false,selected=new Set(),message='',sequence=0;
  const en=()=>document.documentElement.lang==='en-US',t=(zh,english)=>en()?english:zh;
  const size=bytes=>bytes>=1024**3?(bytes/1024**3).toFixed(2)+' GiB':(bytes/1024**2).toFixed(1)+' MiB';
  const item=row=>({id:row.id,revision:row.revision});
  let targets=[];bridge.refinementEngines().then(models=>{targets=models.find(m=>m.id==='mega-53')?.targetDetails||[];render();}).catch(()=>{});
  const name=row=>{const target=targets.find(target=>target.id===row.target);return target?(en()?target.nameEn:target.name):row.target;};
  const rows=()=>{const q=$('storageSearch').value.trim().toLowerCase(),filter=$('storageFilter').value;return (data?.rows||[]).filter(row=>(filter==='all'||(filter==='kept'?row.kept:row.kind===filter))&&[row.track,row.album,row.engine,row.target,name(row)].join(' ').toLowerCase().includes(q));};
  const canSelect=row=>!row.kept&&!row.blocked;
  function render(){
   const busy=pending||getBusy()||data?.busy;
   for(const [id,zh,english] of [['storageManageButton','存储管理','Storage'],['storageTitle','存储管理','Storage'],['storageClose','关闭','Close'],['storageRefresh','刷新','Refresh'],['storageSelect','选择可清理项','Select cleanable'],['storageDeselect','取消选择','Deselect'],['storageClear','清理所选','Clean selected']])$(id).textContent=t(zh,english);
   $('storageSearch').placeholder=t('搜索歌曲、模型或目标','Search song, model or target');
   for(const option of $('storageFilter').options)option.textContent=({all:t('全部结果','All'),refinement:t('细分结果','Refinement'),stems:t('基础分轨','Base stems'),kept:t('已保留','Kept')})[option.value];
   for(const option of $('storageMode').options)option.textContent=option.value==='trash'?t('移至回收站','Recycle Bin'):t('永久删除 · 释放空间','Delete permanently');
   $('storageSummary').textContent=data?t('资料库 ','Library ')+size(data.bytes)+' · WAV '+size(data.wavBytes)+' · '+data.rows.length+t(' 组音频',' audio results'):t('读取目录后显示体积','Scan to measure storage');
   $('storageRoot').textContent=data?.root||'';
   $('storageHelp').textContent=t('整组管理生成音频。已保留项不参与清理；有关联细分或 MIDI 的基础分轨受保护。批选跳过当前使用的基础分轨。回收站清空后才会释放空间；永久删除需再次确认。原曲、段落和人工标注不会删除；本面板不删除 MIDI，MIDI 版本在 MIDI 页管理。','Manage complete generated results. Kept results and base stems with refinement/MIDI dependencies are protected. Bulk selection skips active base stems. Recycle Bin must be emptied to free space; permanent deletion requires confirmation. Songs, sections and annotations stay intact; this panel never deletes MIDI — MIDI versions are managed in the MIDI tab.');
   $('storageStatus').textContent=message||(data?.warnings?.length?data.warnings.join('\n'):'');
   $('storageRows').replaceChildren();
   for(const row of rows()){
    const line=document.createElement('div');line.className='storage-row';
    const check=document.createElement('input');check.type='checkbox';check.checked=selected.has(row.id);check.disabled=busy||!canSelect(row);check.setAttribute('aria-label',row.track+' '+row.engine+' '+name(row));check.onchange=()=>{check.checked?selected.add(row.id):selected.delete(row.id);render();};
    const copy=document.createElement('div'),title=document.createElement('strong'),detail=document.createElement('small'),status=document.createElement('small');title.textContent=row.track+' · '+size(row.bytes);
    detail.textContent=row.album+' · '+row.engine+' · '+(row.kind==='stems'?t('基础六轨','Six stems'):(name(row)+' · '+row.sourceStem+' · '+(row.scope==='full'?t('整曲','Full'):row.timeOrigin.toFixed(1)+'–'+(row.timeOrigin+row.duration).toFixed(1)+'s')))+' · '+new Date(row.modified).toLocaleDateString(en()?'en-US':'zh-CN');
    status.textContent=[row.kept?t('已保留','Kept'):'',row.active?t('当前使用','Active'):'',row.blocked].filter(Boolean).join(' · ');copy.append(title,detail,status);
    const actions=document.createElement('div');actions.className='storage-row-actions';
    const keep=document.createElement('button');keep.className='quiet-button';keep.textContent=row.kept?t('取消保留','Unkeep'):t('保留','Keep');keep.disabled=busy||row.blocked==='目录含链接或未知文件';keep.onclick=()=>act(()=>bridge.storageKeep({item:item(row),value:!row.kept}));
    const open=document.createElement('button');open.className='quiet-button';open.textContent=t('打开目录','Open folder');open.disabled=pending;open.onclick=async()=>{try{const reply=await bridge.storageReveal({item:item(row)});if(!reply.ok){message=reply.error;render();}}catch(error){message=String(error);render();}};
    actions.append(keep,open);line.append(check,copy,actions);$('storageRows').append(line);
   }
   const chosen=(data?.rows||[]).filter(row=>selected.has(row.id));$('storageSelected').textContent=chosen.length+t(' 项 · ',' selected · ')+size(chosen.reduce((sum,row)=>sum+row.bytes,0));
   $('storageClear').disabled=busy||!chosen.length;$('storageRefresh').disabled=pending;$('storageSelect').disabled=busy;$('storageDeselect').disabled=pending;$('storageMode').disabled=pending;
  }
  async function refresh(){const token=++sequence;pending=true;render();try{const reply=await bridge.storageScan();if(token!==sequence)return;if(!reply.ok)throw Error(reply.error);data=reply;selected=new Set([...selected].filter(id=>data.rows.some(row=>row.id===id&&canSelect(row))));}catch(error){message=String(error);}finally{if(token===sequence){pending=false;render();}}}
  async function act(operation){if(pending||getBusy())return;pending=true;message='';render();try{const reply=await operation();if(!reply.ok){message=reply.error||reply.errors?.map(e=>e.error).join('; ')||t('操作失败','Operation failed');}else if(reply.deleted!==undefined){message=reply.canceled?t('已取消','Cancelled'):reply.mode==='trash'?t('已移至回收站，清空后释放 ','Moved to Recycle Bin; empty it to free ')+size(reply.bytes):t('已清理 ','Removed ')+size(reply.bytes);}await onChanged();}catch(error){message=String(error);}finally{pending=false;await refresh();}}
  $('storageManageButton').onclick=()=>{if(!dialog.open)dialog.showModal();message='';refresh();};$('storageClose').onclick=()=>dialog.close();
  $('storageRefresh').onclick=()=>{message='';refresh();};$('storageSearch').addEventListener('input',render);$('storageFilter').addEventListener('change',render);
  $('storageSelect').onclick=()=>{for(const row of rows())if(canSelect(row)&&!(row.kind==='stems'&&row.active))selected.add(row.id);render();};$('storageDeselect').onclick=()=>{selected.clear();render();};
  $('storageClear').onclick=()=>{if($('storageClear').disabled)return;const request={items:data.rows.filter(row=>selected.has(row.id)).map(item),mode:$('storageMode').value};beforeClear();act(()=>bridge.storageClear(request));};
  bridge.onAnalysisTask?.(()=>queueMicrotask(()=>{if(dialog.open&&!pending){data&&(data.busy=Boolean(getBusy()));render();}}));
  new MutationObserver(render).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});render();return {refresh};
 }
 root.XldStorageControls={create};
})(globalThis);
