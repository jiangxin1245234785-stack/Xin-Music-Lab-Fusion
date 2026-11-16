(function(root){
 'use strict';
 function create({bridge,getBusy,beforeClear,onChanged}){
  const $=id=>document.getElementById(id),dialog=$('storageDialog');let data=null,pending=false,selected=new Set(),message='',sequence=0,optimizingId=null;
  const en=()=>document.documentElement.lang==='en-US',t=(zh,english)=>en()?english:zh;
  const size=bytes=>bytes>=1024**3?(bytes/1024**3).toFixed(2)+' GiB':(bytes/1024**2).toFixed(1)+' MiB';
  const item=row=>({id:row.id,revision:row.revision});
  let targets=[];bridge.refinementEngines().then(models=>{targets=models.find(m=>m.id==='mega-53')?.targetDetails||[];render();}).catch(()=>{});
  // The stored lead / backing split (score-vocals) is named in words, not by its engine id.
  const engineName=row=>row.engine==='karaoke-lead'?t('主唱 / 和声分离','Lead / backing split'):row.engine;
  const name=row=>{if(row.engine==='karaoke-lead')return t('主唱 + 和声','Lead + backing');const target=targets.find(target=>target.id===row.target);return target?(en()?target.nameEn:target.name):row.target;};
  const rows=()=>{const q=$('storageSearch').value.trim().toLowerCase(),filter=$('storageFilter').value;return (data?.rows||[]).filter(row=>(filter==='all'||(filter==='kept'?row.kept:row.kind===filter))&&[row.track,row.album,row.engine,engineName(row),row.target,name(row)].join(' ').toLowerCase().includes(q));};
  const canSelect=row=>!row.kept&&!row.blocked;
  function render(){
   const busy=pending||getBusy()||data?.busy;
   for(const [id,zh,english] of [['storageManageButton','存储管理','Storage'],['storageTitle','存储管理','Storage'],['storageClose','关闭','Close'],['storageRefresh','刷新','Refresh'],['storageSelect','选择可清理项','Select cleanable'],['storageDeselect','取消选择','Deselect'],['storageClear','清理所选','Clean selected']])$(id).textContent=t(zh,english);
   $('storageSearch').placeholder=t('搜索歌曲、模型或目标','Search song, model or target');
   for(const option of $('storageFilter').options)option.textContent=({all:t('全部结果','All'),refinement:t('细分结果','Refinement'),stems:t('基础分轨','Base stems'),kept:t('已保留','Kept')})[option.value];
   for(const option of $('storageMode').options)option.textContent=option.value==='trash'?t('移至回收站','Recycle Bin'):t('永久删除 · 释放空间','Delete permanently');
   $('storageSummary').textContent=data?t('资料库 ','Library ')+size(data.bytes)+' · '+t('分轨音频 ','Stem audio ')+size(data.wavBytes)+' · '+data.rows.length+t(' 组音频',' audio results'):t('读取目录后显示体积','Scan to measure storage');
   $('storageRoot').textContent=data?.root||'';
   $('storageHelp').textContent=t('整组管理生成音频。已保留项不参与清理；有关联细分或 MIDI 的基础分轨受保护。批选跳过当前使用的基础分轨。回收站清空后才会释放空间；永久删除需再次确认。原曲、段落和人工标注不会删除；本面板不删除 MIDI，MIDI 版本在 MIDI 页管理。','Manage complete generated results. Kept results and base stems with refinement/MIDI dependencies are protected. Bulk selection skips active base stems. Recycle Bin must be emptied to free space; permanent deletion requires confirmation. Songs, sections and annotations stay intact; this panel never deletes MIDI — MIDI versions are managed in the MIDI tab.');
   $('storageStatus').textContent=message||(data?.warnings?.length?data.warnings.join('\n'):'');
   renderMissing(busy);
   $('storageRows').replaceChildren();
   for(const row of rows()){
    const line=document.createElement('div');line.className='storage-row';
    const check=document.createElement('input');check.type='checkbox';check.checked=selected.has(row.id);check.disabled=busy||!canSelect(row);check.setAttribute('aria-label',row.track+' '+engineName(row)+' '+name(row));check.onchange=()=>{check.checked?selected.add(row.id):selected.delete(row.id);render();};
    const copy=document.createElement('div'),title=document.createElement('strong'),detail=document.createElement('small'),status=document.createElement('small');title.textContent=row.track+' · '+size(row.bytes);
    detail.textContent=row.album+' · '+engineName(row)+' · '+(row.kind==='stems'?t('基础六轨','Six stems'):(name(row)+' · '+row.sourceStem+' · '+(row.scope==='full'?t('整曲','Full'):row.timeOrigin.toFixed(1)+'–'+(row.timeOrigin+row.duration).toFixed(1)+'s')))+' · '+new Date(row.modified).toLocaleDateString(en()?'en-US':'zh-CN');
    status.textContent=[row.kept?t('已保留','Kept'):'',row.active?t('当前使用','Active'):'',row.compact?t('精简存储','Compact storage'):'',row.optimizable?t('最多可减少 ','Up to ')+size(row.redundantBytes):'',row.followers?.length&&!row.blocked?t('连同只依赖它的 '+row.followers.length+' 个旧 MIDI 版本一起清','Clears with the '+row.followers.length+' old MIDI version(s) made only from it'):'',row.blocked].filter(Boolean).join(' · ');copy.append(title,detail,status);
    const actions=document.createElement('div');actions.className='storage-row-actions';
    const keep=document.createElement('button');keep.className='quiet-button';keep.textContent=row.kept?t('取消保留','Unkeep'):t('保留','Keep');keep.disabled=busy||row.blocked==='目录含链接或未知文件';keep.onclick=()=>act(()=>bridge.storageKeep({item:item(row),value:!row.kept}));
    const open=document.createElement('button');open.className='quiet-button';open.textContent=t('打开目录','Open folder');open.disabled=pending;open.onclick=async()=>{try{const reply=await bridge.storageReveal({item:item(row)});if(!reply.ok){message=reply.error;render();}}catch(error){message=String(error);render();}};
    if(row.optimizable&&bridge.storageOptimize){const optimize=document.createElement('button');optimize.className='quiet-button';optimize.dataset.storageOptimize=row.id;optimize.textContent=optimizingId===row.id?t('校验与优化中…','Verifying and optimizing…'):t('优化副本','Optimize copies');optimize.disabled=busy;optimize.title=t('校验后移除冗余副本，保留 MIDI。优化后需使用新版 XLD。','Verify and remove redundant copies, keeping MIDI. Requires this XLD version.');optimize.onclick=()=>{beforeClear();optimizingId=row.id;act(()=>bridge.storageOptimize({item:item(row),mode:$('storageMode').value}));};actions.append(optimize);}
    if(optimizingId===row.id){const cancel=document.createElement('button');cancel.className='quiet-button';cancel.textContent=t('取消优化','Cancel optimization');cancel.onclick=()=>bridge.storageCancelOptimize();actions.append(cancel);}
    actions.append(keep,open);line.append(check,copy,actions);$('storageRows').append(line);
   }
   const chosen=(data?.rows||[]).filter(row=>selected.has(row.id));$('storageSelected').textContent=chosen.length+t(' 项 · ',' selected · ')+size(chosen.reduce((sum,row)=>sum+row.bytes,0));
   $('storageClear').disabled=busy||!chosen.length;$('storageRefresh').disabled=pending;$('storageSelect').disabled=busy;$('storageDeselect').disabled=pending;$('storageMode').disabled=pending;
  }
  // Songs whose original audio is gone from where their analysis says (core/source-relink.cjs).
  let missing=[];
  function renderMissing(busy){
   const box=$('storageMissing');if(!box)return;box.hidden=!missing.length;if(!missing.length)return;
   $('storageMissingTitle').textContent=t('原音频找不到 · ','Original audio missing · ')+missing.length;
   $('storageMissingHelp').textContent=t('这些歌的分析都还在，只是原曲不在记录的位置，所以程序读不出来。音频挪了：指向它的新位置（要同一个文件，大小相同）；删了：把整套分析移到回收站。','The analysis of these songs is all there, but the original is not where it was recorded, so it cannot be read. If the audio moved, point to its new place (the same file, same size); if it is gone, move the whole analysis to the Recycle Bin.');
   const list=$('storageMissingRows');list.replaceChildren();
   for(const item of missing){
    const line=document.createElement('div');line.className='storage-row';
    const copy=document.createElement('div'),title=document.createElement('strong'),detail=document.createElement('small');
    title.textContent=item.title+' · '+size(item.bytes);detail.textContent=[item.artist,item.album].filter(Boolean).join(' · ')+' · '+item.source.path;copy.append(title,detail);
    const actions=document.createElement('div');actions.className='storage-row-actions';
    const relink=document.createElement('button');relink.className='quiet-button';relink.textContent=t('指向新位置…','Point to new place…');relink.disabled=busy;
    relink.onclick=()=>act(()=>bridge.storageRelinkSource(item.id));
    const discard=document.createElement('button');discard.className='quiet-button';discard.textContent=t('移到回收站','Recycle Bin');discard.disabled=busy;
    discard.onclick=()=>act(()=>bridge.storageDiscardSource(item.id));
    actions.append(relink,discard);line.append(copy,actions);list.append(line);
   }
  }
  async function refresh(){
   try{const reply=bridge.storageMissingSources?await bridge.storageMissingSources():null;missing=reply?.ok?reply.items:[];}catch(_){missing=[];}const token=++sequence;pending=true;render();try{const reply=await bridge.storageScan();if(token!==sequence)return;if(!reply.ok)throw Error(reply.error);data=reply;selected=new Set([...selected].filter(id=>data.rows.some(row=>row.id===id&&canSelect(row))));}catch(error){message=String(error);}finally{if(token===sequence){pending=false;render();}}}
  // The refusals of 指向新位置 / 移到回收站 in words (core/source-relink.cjs codes).
  const mib=bytes=>(Number(bytes)/1024/1024).toFixed(1)+' MiB';
  const RELINK={'relink-size-differs':r=>t('大小不一样，不是同一个文件：记录的是 '+mib(r.recorded)+'，选的是 '+mib(r.found)+'。','Not the same file: the size differs (recorded '+mib(r.recorded)+', chosen '+mib(r.found)+').'),
    'relink-outside-library':()=>t('这个文件不在曲库里，程序看不到它。先把它放进曲库的某个专辑文件夹，再指向它。','That file is not in the library, so the app cannot list it. Put it into an album folder of the library first.'),
    'relink-file-missing':()=>t('选的文件不见了。','The chosen file is gone.'),
    'relink-source-present':()=>t('原来的文件又在了，不用重新指向。','The original file is back; nothing to re-link.'),
    'relink-target-exists':()=>t('那个文件已经有一套分析了，没有动。','That file already has its own analysis; nothing changed.'),
    'relink-not-missing':()=>t('这首歌已经不在「原音频找不到」里了。','This song is no longer missing its audio.'),
    'relink-undone':r=>t('没有改成：改完核对没过，已经全部放回原样。','Not re-linked: the check afterwards failed, everything was put back.')+(r.why?' ('+r.why+')':''),
    'analysis-busy':()=>t('正在分析，等它完了再操作。','An analysis is running; try again when it is done.')};
  async function act(operation){if(pending||getBusy())return;pending=true;message='';render();try{const reply=await operation();if(!reply.ok){message=(RELINK[reply.error]&&RELINK[reply.error](reply))||reply.error||reply.errors?.map(e=>e.error).join('; ')||t('操作失败','Operation failed');}else if(reply.canceled){message=t('已取消','Cancelled');}else if(reply.deleted!==undefined||reply.optimized){message=(reply.mode==='trash'?t('已移至回收站，清空后释放 ','Moved to Recycle Bin; empty it to free '):t('已清理 ','Removed '))+size(reply.bytes);if(reply.retainedOriginal)message+=t(' · 输入未去重',' · Input copy retained');if(reply.pendingCleanup)message+=t(' · 部分副本保留，可重试：',' · Copies remain; retry: ')+(reply.errors||[]).join('; ');}await onChanged();}catch(error){message=String(error);}finally{pending=false;optimizingId=null;await refresh();}}
  $('storageManageButton').onclick=()=>{if(!dialog.open)dialog.showModal();message='';refresh();};$('storageClose').onclick=()=>dialog.close();
  $('storageRefresh').onclick=()=>{message='';refresh();};$('storageSearch').addEventListener('input',render);$('storageFilter').addEventListener('change',render);
  $('storageSelect').onclick=()=>{for(const row of rows())if(canSelect(row)&&!(row.kind==='stems'&&row.active))selected.add(row.id);render();};$('storageDeselect').onclick=()=>{selected.clear();render();};
  $('storageClear').onclick=()=>{if($('storageClear').disabled)return;const request={items:data.rows.filter(row=>selected.has(row.id)).map(item),mode:$('storageMode').value};beforeClear();act(()=>bridge.storageClear(request));};
  bridge.onAnalysisTask?.(()=>queueMicrotask(()=>{if(dialog.open&&!pending){data&&(data.busy=Boolean(getBusy()));render();}}));
  new MutationObserver(render).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});render();return {refresh};
 }
 root.XldStorageControls={create};
})(globalThis);
