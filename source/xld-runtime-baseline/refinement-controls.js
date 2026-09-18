(function(root){
 'use strict';
 function create({bridge,getSelected,getCurrent,getDerived,getTask,getBusy,audio,rt,onTask}) {
  const $=id=>document.getElementById(id),text=(key,params)=>rt('runtime.refinement.'+key,params);
  const player=$('refinementAudio'),start=$('refinementStart'),targetSelect=$('refinementTarget'),deviceSelect=$('refinementDevice'),scopeSelect=$('refinementMode'),sourceSelect=$('refinementSource'),groupSelect=$('refinementGroup');
  let engine=localStorage.getItem('xld.refinement.v3.engine')||'mega-53',target='strings',models=[],result=null,identity='',sequence=0,pending=false,loading=false,message=null;
  deviceSelect.value=localStorage.getItem('xld.refinement.device')||'auto';if(!deviceSelect.value)deviceSelect.value='auto';
  scopeSelect.value=localStorage.getItem('xld.refinement.scope')||'full';if(!scopeSelect.value)scopeSelect.value='full';
  let sourceStem=localStorage.getItem('xld.refinement.source')||'other',group='strings';
  const sources=['mix','other','guitar','piano','bass','drums','vocals'];
  if(!sources.includes(sourceStem))sourceStem='other';
  const sourceName=()=>engine==='mega-53'?sourceStem:'other';
  const readySource=()=>Boolean(getSelected()&&(sourceName()==='mix'||source()?.ok&&source().stems?.some(stem=>stem.name===sourceName())));
  const label=item=>document.documentElement.lang==='en-US'?item.nameEn:item.name;
  const details=()=>models.find(model=>model.id===engine)?.targetDetails||[];
  const targetName=()=>{const item=details().find(item=>item.id===target);return item?label(item):text('target.'+target);};
  const scope=()=>engine==='mega-53'?scopeSelect.value:'preview';
  const payload=()=>({trackId:getSelected()?.id,engine,target,sourceStem:sourceName(),scope:scope(),device:deviceSelect.value,start:Number(start.value),duration:30});
  const source=()=>getDerived()?.trackId===getSelected()?.id?getDerived()?.result:null;
  const route=()=>JSON.stringify([getSelected()?.id,sourceName(),sourceName()==='mix'?null:source()?.runId,engine,target,deviceSelect.value,scope(),scope()==='full'?0:start.value]);
  const refining=task=>models.some(model=>model.id===task?.engine);
  function stop(){player.pause();player.removeAttribute('src');player.load();for(const button of document.querySelectorAll('[data-refinement-audio]'))button.setAttribute('aria-pressed','false');}
  function render(){
   for(const [id,key] of Object.entries({refinementTitle:'title',refinementScope:'scope',refinementHint:'hint',refinementStartLabel:'start',refinementUseTime:'useTime',refinementCancel:'cancel',refinementFolder:'folder'}))$(id).textContent=text(key);
   const busy=pending||getBusy(),task=getTask(),isRefining=refining(task),full=scope()==='full';
   $('refinementModeLabel').textContent=text('modeLabel');for(const option of scopeSelect.options){option.textContent=text('mode.'+option.value);option.disabled=option.value==='full'&&engine!=='mega-53';}
   scopeSelect.value=scope();scopeSelect.disabled=busy||engine!=='mega-53';
   $('refinementRun').textContent=text(full?'runFull':'run');
   $('refinementHint').textContent=text(full?'fullHint':'hint');
   $('refinementStartField').hidden=full;$('refinementUseTime').hidden=full;
   $('refinementTargetLabel').textContent=text('targetLabel');$('refinementDeviceLabel').textContent=text('deviceLabel');
   $('refinementSourceLabel').textContent=text('sourceLabel');$('refinementGroupLabel').textContent=text('groupLabel');
   sourceSelect.replaceChildren();for(const name of (engine==='mega-53'?sources:['other'])){const option=document.createElement('option');option.value=name;option.textContent=text('source.'+name);sourceSelect.append(option);}sourceSelect.value=sourceName();sourceSelect.disabled=busy||engine!=='mega-53';
   const catalog=details(),groups=['all',...new Set(catalog.map(item=>item.group))];
   if(!groups.includes(group))group='all';
   groupSelect.replaceChildren();for(const name of groups){const option=document.createElement('option');option.value=name;const count=catalog.filter(item=>name==='all'||item.group===name).length;option.textContent=text('group.'+name)+(count?' · '+count:'');groupSelect.append(option);}groupSelect.value=group;groupSelect.disabled=busy||!catalog.length;
   const supported=catalog.length?catalog.filter(item=>group==='all'||item.group===group).map(item=>item.id):models.find(model=>model.id===engine)?.targets||['strings'];
   if(!supported.includes(target))target=supported[0];
   $('refinementScope').textContent=text('source.'+sourceName())+' → '+targetName();
   targetSelect.replaceChildren();for(const name of supported){const option=document.createElement('option');option.value=name;option.textContent=catalog.find(item=>item.id===name)?label(catalog.find(item=>item.id===name)):text('target.'+name);targetSelect.append(option);}targetSelect.value=target;
   targetSelect.disabled=busy||!models.length;deviceSelect.disabled=busy;
   for(const option of deviceSelect.options)option.textContent=text('device.'+option.value);
   $('refinementModels').setAttribute('aria-label',text('presets'));$('refinementModels').replaceChildren();
   for(const model of models){
    const card=document.createElement('button');card.type='button';card.dataset.refinementEngine=model.id;card.className='engine-card'+(engine===model.id?' selected':'')+(model.available?' available':' unavailable');card.disabled=busy||!model.available;card.setAttribute('aria-pressed',String(engine===model.id));
    const radio=document.createElement('span');radio.className='engine-radio';const copy=document.createElement('span');copy.className='engine-copy';
    const title=document.createElement('strong');title.textContent=document.documentElement.lang==='en-US'?model.nameEn:model.name;
    const detail=document.createElement('span');detail.textContent=text(model.available?'presetReady':'modelMissing');copy.append(title,detail);
    const badge=document.createElement('span');badge.className='engine-badge';badge.textContent=rt(model.default?'runtime.assets.modelDefault':'runtime.assets.modelAlternative');card.append(radio,copy,badge);
    card.onclick=()=>{engine=model.id;if(!model.targets.includes(target))target=model.targets[0];group=details().find(item=>item.id===target)?.group||'all';localStorage.setItem('xld.refinement.v3.engine',engine);scopeSelect.value=engine==='mega-53'?(localStorage.getItem('xld.refinement.scope')||'full'):'preview';message=null;stop();refresh();};$('refinementModels').append(card);
   }
   start.disabled=busy||full;const timeAvailable=Boolean(getSelected()&&getCurrent()?.id===getSelected()?.id);
   $('refinementUseTime').disabled=busy||!timeAvailable;
   $('refinementRun').disabled=busy||loading||!readySource()||!models.find(model=>model.id===engine)?.available||(!full&&(!Number.isFinite(Number(start.value))||Number(start.value)<0));
   $('refinementCancel').hidden=!isRefining;$('refinementCancel').disabled=!task?.cancellable||task?.status==='cancelling';
   $('refinementResult').hidden=!result?.ok;
   $('refinementKeep').disabled=busy||!result?.ok||result.kept;$('refinementKeep').textContent=text(result?.kept?'kept':'keep');
   $('refinementFolder').disabled=!result?.ok;
   for(const button of document.querySelectorAll('[data-refinement-audio]'))button.textContent=button.dataset.refinementAudio==='target'?targetName():text(button.dataset.refinementAudio);
   $('refinementStatus').textContent=isRefining&&task.trackId===getSelected()?.id?text('working',{percent:Math.round((task.progress||0)*100)})+' · '+(task.message||''):message?text(message.key,{error:message.error}):!getSelected()?text('choose'):!readySource()?text('needsStems'):loading?text('loading'):result?.ok?text(result.kept?'keptStatus':'ready',{start:result.timeOrigin.toFixed(1),end:(result.timeOrigin+result.duration).toFixed(1)}):result?.error&&result.error!=='尚未生成当前范围的结果'?text('failed',{error:result.error}):text(full?'pendingFull':'pending');
   const backend=result?.backend;
   $('refinementOutputHint').textContent=result?.ok?(result.playback?.gain<1?text('safePlayback',{db:(20*Math.log10(result.playback.gain)).toFixed(1)}):text('rawPlayback')):'';
   $('refinementExecution').textContent=backend?text('execution',{device:backend.device==='cuda'?'GPU':'CPU',seconds:backend.elapsedSeconds??'—',memory:backend.peakAllocatedMiB??'—',chunk:backend.chunkSeconds??'—'})+(backend.retries?.length?' · '+text('fallbackUsed'):''):text('deviceHint');
  }
  async function refresh(){
   const token=++sequence,key=route();result=null;loading=true;stop();render();
   if(!getSelected()||!readySource()){loading=false;render();return;}
   try{const value=await bridge.readRefinement(payload());if(token===sequence&&key===route())result=value;}
   catch(error){if(token===sequence)message={key:'failed',error:String(error)};}
   finally{if(token===sequence){loading=false;render();}}
  }
  function update(){
   const next=JSON.stringify([getSelected()?.id,source()?.runId]);
   if(next!==identity){const oldTrack=JSON.parse(identity||'[]')[0];identity=next;message=null;
    if(oldTrack!==getSelected()?.id)start.value=localStorage.getItem('xld.refinement.start.'+getSelected()?.id)||'0';
    refresh();
   }else render();
  }
  start.addEventListener('change',()=>{localStorage.setItem('xld.refinement.start.'+getSelected()?.id,start.value);message=null;refresh();});
  scopeSelect.addEventListener('change',()=>{localStorage.setItem('xld.refinement.scope',scopeSelect.value);message=null;refresh();});
  sourceSelect.addEventListener('change',()=>{sourceStem=sourceSelect.value;localStorage.setItem('xld.refinement.source',sourceStem);message=null;refresh();});
  groupSelect.addEventListener('change',()=>{group=groupSelect.value;const candidates=details().filter(item=>group==='all'||item.group===group);if(!candidates.some(item=>item.id===target))target=candidates[0]?.id||'strings';message=null;refresh();});
  targetSelect.addEventListener('change',()=>{target=targetSelect.value;message=null;refresh();});
  deviceSelect.addEventListener('change',()=>{localStorage.setItem('xld.refinement.device',deviceSelect.value);message=null;refresh();});
  $('refinementUseTime').onclick=()=>{start.value=String(Math.floor(audio.currentTime||0));start.dispatchEvent(new Event('change'));};
  $('refinementRun').onclick=async()=>{
   if(pending||getBusy()||$('refinementRun').disabled)return;
   const request=payload(),key=route();pending=true;message=null;stop();render();let response;
   try{response=await bridge.runRefinement(request);}catch(error){response={ok:false,error:String(error)};}
   finally{pending=false;}
   onTask(response.task||null);
   if(key===route()){message=response.ok?null:{key:response.error==='analysis-cancelled'?'cancelled':'failed',error:response.detail||response.error};await refresh();}else render();
  };
  $('refinementCancel').onclick=async()=>{const task=getTask();if(refining(task))await bridge.cancelAnalysis(task.taskId);};
  $('refinementKeep').onclick=async()=>{
   const key=route(),request={...payload(),runId:result?.runId};if(!result?.ok||getBusy())return;
   try{const reply=await bridge.keepRefinement(request);if(key===route()){if(reply.ok)result=reply;else message={key:'failed',error:reply.error};render();}}
   catch(error){if(key===route()){message={key:'failed',error:String(error)};render();}}
  };
  $('refinementFolder').onclick=async()=>{const key=route();const reply=await bridge.revealRefinement(payload()).catch(error=>({ok:false,error:String(error)}));if(!reply.ok&&key===route()){message={key:'failed',error:reply.error};render();}};
  for(const button of document.querySelectorAll('[data-refinement-audio]'))button.onclick=()=>{
   if(!result?.ok)return;const name=button.dataset.refinementAudio,current=player.currentTime||0;audio.pause();
   player.onloadedmetadata=()=>{player.currentTime=Math.min(current,Math.max(0,player.duration-.01));};player.src=result.urls[name];player.play().catch(()=>{message={key:'playFailed'};render();});
   for(const candidate of document.querySelectorAll('[data-refinement-audio]'))candidate.setAttribute('aria-pressed',String(candidate===button));
  };
  audio.addEventListener('play',()=>player.pause());player.addEventListener('play',()=>audio.pause());
  new MutationObserver(render).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  bridge.refinementEngines().then(value=>{models=value;if(!models.some(model=>model.id===engine))engine=models.find(model=>model.default)?.id||models[0]?.id;if(engine!=='mega-53')scopeSelect.value='preview';group=details().find(item=>item.id===target)?.group||'all';render();refresh();}).catch(()=>{message={key:'failed',error:text('modelMissing')};render();});
  render();return {update,refresh};
 }
 root.XldRefinementControls={create};
})(globalThis);
