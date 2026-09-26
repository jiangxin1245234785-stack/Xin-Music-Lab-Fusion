(function(root) {
  'use strict';
  function create({bridge, audio, getSelected, getCurrent, queueFor, playTrack, rt, onPlaybackChange, getBusy, onTask, onChange, onBatchState, onMidiActivated, onMidiListen, getPlaybackPosition, beforeMerge, isBatchCancelled, localizeError=value=>value}) {
    const select=document.getElementById('derivedSelect'), audition=document.getElementById('derivedAudition');
    const refreshButton=document.getElementById('derivedRefresh'), wavButton=document.getElementById('derivedWav');
    const midiButton=document.getElementById('derivedMidi'), status=document.getElementById('derivedStatus');
    const separate=document.getElementById('derivedSeparate'), transcribe=document.getElementById('derivedTranscribe');
    const force=document.getElementById('derivedForce'), deleteMidiButton=document.getElementById('derivedDeleteMidi');
    let deletionMessage=null;
    const midiSelect=document.getElementById('derivedMidiSelect'), midiAudition=document.getElementById('derivedMidiAudition');
    const forceByView={stems:false,midi:false};
    const midiStem=()=>midiSelect.value;
    const inSourceScope=record=>record && record.trackId===getSelected()?.id && record.sourceRunId===sourceKey();
    const midiFor=(stem,engine)=>result?.variants?.[stem]?.[engine] || (result?.midi?.[stem]?.engine===engine || (engine==='basic-pitch' && result?.midi?.[stem]?.model==='basic-pitch-0.4.0-onnx')?result?.midi?.[stem]:null);
    const activeMidi=(stem,midi)=>midi?.ok && result?.midi?.[stem]?.ok && result.midi[stem].runId===midi.runId;
    // Kept in step with MANUAL_ENGINE in core/derived-assets.cjs; a renderer cannot require it, so
    // tests/midi-revision-record.cjs pins the two together rather than trusting them to stay equal.
    const MANUAL_ENGINE='manual-revision';
    // The record actually in use for a stem, whatever produced it. Every model-shaped lookup in this file goes
    // through the selected MODEL, so a hand-edited revision is invisible to all of them — which is why the panel
    // used to describe a stem the user had just edited as having no result.
    const activeRecord=(stem=midiStem())=>result?.midi?.[stem]?.ok?result.midi[stem]:null;
    const manualActive=(stem=midiStem())=>activeRecord(stem)?.engine===MANUAL_ENGINE;
    const sourceName=()=>(stemModels||[]).find(model=>model.id===result?.engine)?.name || result?.engine || result?.model || '—';
    const mergeRun=document.getElementById('midiMergeRun'), mergeOpen=document.getElementById('midiMergeOpen'), mergeFolder=document.getElementById('midiMergeFolder');
    let mergeMessage=null;
    const inputFor=stem=>result?.midiInputs?.[stem] || (result?.ok && result?.stems?.some(item=>item.name===stem)?{runId:result.runId,audioUrl:result.stems.find(item=>item.name===stem).audioUrl}:null);
    const supportedParts=()=>['bass','piano','guitar','drums','strings'].filter(stem=>(models||[]).some(model=>model.stems.includes(stem)) && (stem!=='strings'||inputFor(stem)));
    const sourceKey=()=>result?.midiSourceKey || result?.runId;
    const auditionStems=()=>[...(result?.stems||[]),...(result?.strings?.active?[{name:'strings',audioUrl:result.strings.active.audioUrl}]:[])];
    const stringsSelect=document.getElementById('midiStringsSource');
    let stringsMessage=null;
    const stringLabel=source=>rt('runtime.assets.stringSourceLabel',{target:rt('runtime.assets.stringTarget.'+source.target),input:source.sourceStem,seconds:Math.round(source.duration),id:source.runId.slice(0,8)});
    function renderStrings(busy){
      document.getElementById('midiStringsLabel').textContent=rt('runtime.assets.stringsLabel');
      stringsSelect.replaceChildren(new Option(rt('runtime.assets.stringsNone'),''));
      for(const item of result?.strings?.choices||[])stringsSelect.add(new Option(stringLabel(item),item.runId));
      if(result?.strings?.unavailable){const missing=new Option(rt('runtime.assets.stringsMissingOption'),'missing');missing.disabled=true;stringsSelect.add(missing);}
      stringsSelect.value=result?.strings?.active?.runId||(result?.strings?.unavailable?'missing':'');stringsSelect.disabled=busy||!getSelected()||(!result?.strings?.choices?.length&&!result?.strings?.unavailable);
      document.getElementById('midiStringsHint').hidden=Boolean(!stringsMessage && !result?.strings?.unavailable && result?.strings?.choices?.length);
      document.getElementById('midiStringsHint').textContent=stringsMessage || rt(result?.strings?.unavailable?'runtime.assets.stringsStale':result?.strings?.choices?.length?'runtime.assets.stringsHint':'runtime.assets.stringsNeedsSource');
    }
    const hasMidi=()=>Object.values(result?.midi||{}).some(m=>m?.ok) || Object.values(result?.variants||{}).some(v=>Object.values(v).some(m=>m?.ok));
    const mergeText=(key,params)=>rt('runtime.merge.'+key,params);
    async function requestMerge(track){
      const latest=await bridge.readDerived(track.id);
      const parts=Object.entries(latest?.midi||{}).filter(([,m])=>m?.ok&&m.noteCount>0).map(([stem,m])=>({stem,runId:m.runId}));
      const prepared=await beforeMerge?.(track.id,parts);
      if(prepared?.ok===false)return prepared;
      return bridge.mergeMidi(track.id);
    }
    function renderMerge(busy) {
      for(const [id,key] of [['midiMergeTitle','title'],['midiMergeBadge','badge'],['midiMergeHint','hint'],['midiMergeRun','run'],['midiMergeOpen','open'],['midiMergeFolder','folder']]) document.getElementById(id).textContent=mergeText(key);
      const parts=supportedParts().filter(stem=>result?.midi?.[stem]?.ok && result.midi[stem].noteCount>0);
      const list=document.getElementById('midiMergeParts');list.replaceChildren();
      for(const stem of supportedParts()) {
        const item=document.createElement('span'), midi=result?.midi?.[stem];
        item.className=parts.includes(stem)?'ready':'';
        item.textContent=parts.includes(stem)?stem+' · '+((models||[]).find(model=>model.id===midi.engine)?.name || midi.engine || midi.model):stem+' · '+mergeText(midi?.ok && midi.noteCount===0?'empty':'missing');
        list.append(item);
      }
      mergeRun.disabled=busy || parts.length<2;
      mergeOpen.disabled=mergeFolder.disabled=!result?.merged?.ok;
      // A skipped part is appended to whatever the line already says, including "merged". A merge that succeeded
      // without a voice is the case this exists for, so the notice must survive the success message.
      const left=(result?.merged?.skipped||[]).map(item=>mergeText('skippedItem',{stem:item.stem,reason:localizeError(item.reason)})).join(mergeText('skippedJoin'));
      const leftOut=left?' · '+mergeText('skipped',{list:left}):'';
      document.getElementById('midiMergeStatus').textContent=(inSourceScope(mergeMessage) ? mergeText(mergeMessage.key,{error:mergeMessage.error})
        : result?.merged?.ok ? mergeText('ready',{parts:result.merged.parts.length,notes:result.merged.noteCount})
        : !getSelected()?mergeText('choose'):result?.merged?.error?.startsWith('merge-draft-')?localizeError(result.merged.error):parts.length<2?mergeText('needsParts'):mergeText('pending'))+leftOut;
    }

    const stemModelsElement=document.getElementById('derivedStemModels');
    let stemModels=null, stemModelsPromise=null, stemChoice=localStorage.getItem('xld.stems.model');
    const modelsElement=document.getElementById('derivedModels');
    let models=null, modelsPromise=null, pending=false;
    const failures=new Map();
    const failureKey=(id,kind,stem,engine,sourceRunId=inputFor(stem)?.runId)=>JSON.stringify([id,kind,kind==='midi'?stem:null,engine,kind==='midi'?sourceRunId:null]);
    function selectedFailure() {
      const id=getSelected()?.id;
      return view==='midi' ? failures.get(failureKey(id,'midi',midiStem(),selectedModel()?.id))
        : failures.get(failureKey(id,'stems',null,selectedStemModel()?.id));
    }
    let choices={};
    try {choices=JSON.parse(localStorage.getItem('xld.midi.models')||'{}');} catch(_) {}
    try {if(localStorage.getItem('xld.midi.guitar-default')!=='muscriptor-tiers-v2'){
      if(!['muscriptor-medium','muscriptor-large'].includes(choices.guitar))delete choices.guitar;
      localStorage.setItem('xld.midi.models',JSON.stringify(choices));localStorage.setItem('xld.midi.guitar-default','muscriptor-tiers-v2');
    }}catch(_){}
    // One-time upgrade: adopt the new strings default, then respect later choices.
    try {if(localStorage.getItem('xld.midi.strings-default')!=='muscriptor-large-v2'){
      if(['basic-pitch','yourmt3-plus'].includes(choices.strings))delete choices.strings;
      localStorage.setItem('xld.midi.models',JSON.stringify(choices));localStorage.setItem('xld.midi.strings-default','muscriptor-large-v2');
    }}catch(_){}
    // One-time upgrade (drums.2): the 7-class DrumSep engine becomes the drum default after the user's listening
    // verdict. Only a stored choice of the old default is dropped; anything the user picked on purpose is kept.
    try {if(localStorage.getItem('xld.midi.drums-default')!=='adtof-stems-v1'){
      if(choices.drums==='drums-adtof')delete choices.drums;
      localStorage.setItem('xld.midi.models',JSON.stringify(choices));localStorage.setItem('xld.midi.drums-default','adtof-stems-v1');
    }}catch(_){}
    // One-time upgrade (piano.2): Transkun V2 becomes the piano default after the user's BCNR listening test; explicit later choices are kept.
    try {if(localStorage.getItem('xld.midi.piano-default')!=='transkun-v2'){
      if(choices.piano==='piano-highres')delete choices.piano;
      localStorage.setItem('xld.midi.models',JSON.stringify(choices));localStorage.setItem('xld.midi.piano-default','transkun-v2');
    }}catch(_){}
    function candidates(stem=midiStem()) {return (models||[]).filter(model=>model.stems.includes(stem)).sort((a,b)=>Number(b.defaultFor===stem)-Number(a.defaultFor===stem));}
    function defaultModel(stem=midiStem()) {const list=candidates(stem);return list.find(model=>model.defaultFor===stem && model.available)||list.find(model=>model.id==='basic-pitch' && model.available)||list.find(model=>model.available)||list[0];}
    function selectedModel(stem=midiStem()) {return candidates(stem).find(model=>model.id===choices[stem])||defaultModel(stem);}
    const selectedMidi=()=>midiFor(midiStem(),selectedModel()?.id);
    const batchButton=document.getElementById('midiBatchRun'), batchFolder=document.getElementById('midiBatchFolder');
    const batchText=(key,params)=>rt('runtime.midiBatch.'+key,params);
    let batchReport=null;
    function batchModels() {return supportedParts().filter(stem=>inputFor(stem)).map(stem=>({stem,model:selectedModel(stem)}));}
    function renderBatch(busy) {
      document.getElementById('midiBatchTitle').textContent=batchText('title');
      batchButton.textContent=batchText('run');
      batchFolder.textContent=batchText('folder');
      batchFolder.disabled=!hasMidi();
      document.getElementById('midiBatchHint').textContent=batchText('hint');
      const plan=batchModels();
      const unavailable=plan.some(({stem,model})=>!inputFor(stem) || !model || (!model.available && (force.checked || !midiFor(stem,model.id)?.ok || midiFor(stem,model.id)?.matches===false)));
      batchButton.disabled=busy || !plan.length || unavailable;
      const list=document.getElementById('midiBatchPlan');list.replaceChildren();
      for(const {stem,model} of plan){
        const item=document.createElement('span'), cached=midiFor(stem,model?.id);
        const state=cached?.ok&&cached.matches!==false&&!force.checked?'reuse':!model?.available?'unavailable':force.checked?'regenerate':'generate';
        item.className=state==='reuse'?'ready':'';
        item.textContent=stem+' · '+(manualActive(stem)?rt('runtime.assets.runStatus.manual')+' · ':'')+(model?.name || '—')+' · '+batchText(state,{count:cached?.noteCount||0});list.append(item);
      }
      document.getElementById('midiBatchStatus').textContent=inSourceScope(batchReport) ? batchText(batchReport.key,batchReport)
        : !getSelected()?batchText('choose'):!plan.length?batchText('needsStems'):unavailable?batchText('unavailableHint'):force.checked?batchText('force',{count:plan.length}):batchText('ready');
    }
    function loadModels() {
      if(models)return Promise.resolve(models);
      if(!modelsPromise)modelsPromise=(bridge.midiEngines?.() || Promise.resolve([{id:'basic-pitch',name:'Basic Pitch',stems:['bass','piano','guitar'],available:true}]))
        .then(value=>{models=Array.isArray(value)?value:[];return models;}).catch(()=>{models=[];return models;}).finally(()=>{modelsPromise=null;});
      return modelsPromise;
    }
    function defaultStemModel() {return (stemModels||[]).find(model=>model.default && model.available)||(stemModels||[]).find(model=>model.available)||(stemModels||[])[0];}
    function selectedStemModel() {return (stemModels||[]).find(model=>model.id===stemChoice)||defaultStemModel();}
    const selectedStems=()=>result?.stemVariants?.[selectedStemModel()?.id];
    function loadStemModels() {
      if(stemModels)return Promise.resolve(stemModels);
      if(!stemModelsPromise)stemModelsPromise=(bridge.separationEngines?.()||Promise.resolve([{id:'demucs-6s',name:'Demucs 6s',default:true,available:true}]))
        .then(value=>{stemModels=Array.isArray(value)?value:[];return stemModels;}).catch(()=>{stemModels=[];return stemModels;}).finally(()=>{stemModelsPromise=null;});
      return stemModelsPromise;
    }
    function renderStemModels(busy) {
      stemModelsElement.replaceChildren();
      stemModelsElement.setAttribute('aria-label',rt('runtime.assets.stemModels'));
      for(const model of stemModels||[]) {
        const cached=result?.stemVariants?.[model.id], selected=selectedStemModel()?.id===model.id;
        const active=cached?.ok && result?.ok && cached.runId===result.runId;
        const card=document.createElement('button');card.type='button';card.dataset.stemEngine=model.id;
        card.className='engine-card'+(model.available?' available':' unavailable')+(selected?' selected':'')+(cached?.ok?' cached':'');
        card.disabled=busy||(!model.available&&!cached?.ok);card.setAttribute('aria-pressed',String(selected));
        const radio=document.createElement('span');radio.className='engine-radio';
        const copy=document.createElement('span');copy.className='engine-copy';
        const title=document.createElement('strong');title.textContent=model.name;
        const detail=document.createElement('span');detail.textContent=rt(active?'runtime.assets.stemActive':cached?.ok?'runtime.assets.stemCached':model.available?'runtime.assets.modelReady':'runtime.assets.modelMissing');
        copy.append(title,detail);
        const badge=document.createElement('span');badge.className='engine-badge';badge.textContent=rt(model.id===defaultStemModel()?.id?'runtime.assets.modelDefault':'runtime.assets.modelAlternative');
        card.append(radio,copy,badge);
        card.addEventListener('click',()=>{stemChoice=model.id;try{localStorage.setItem('xld.stems.model',stemChoice);}catch(_){}message=null;render();});
        stemModelsElement.append(card);
      }
      document.getElementById('derivedWavScope').textContent='6 stems';
      const activeName=sourceName();
      document.getElementById('derivedWavHint').textContent=activeName&&result?.ok?rt('runtime.assets.stemSource',{model:activeName}):rt('runtime.assets.stemHint');
    }
    function renderModels(busy) {
      modelsElement.replaceChildren();
      modelsElement.setAttribute('aria-label',rt('runtime.assets.models'));
      const selected=selectedModel(), preferred=defaultModel();
      for(const model of candidates().sort((a,b)=>Number(b.id===preferred?.id)-Number(a.id===preferred?.id))) {
        const cached=midiFor(midiStem(),model.id), active=activeMidi(midiStem(),cached);
        const card=document.createElement('button');card.type='button';card.dataset.midiEngine=model.id;
        card.className='engine-card'+(model.available?' available':' unavailable')+(selected?.id===model.id?' selected':'')+(cached?.ok?' cached':'');
        card.disabled=busy || (!model.available && !cached?.ok);card.setAttribute('aria-pressed',String(selected?.id===model.id));
        const radio=document.createElement('span');radio.className='engine-radio';
        const copy=document.createElement('span');copy.className='engine-copy';
        const title=document.createElement('strong');
        const guitar=midiStem()==='guitar' && ['muscriptor-medium','muscriptor-large'].includes(model.id);
        const trial=/^(strings|drums)-muscriptor-/.test(model.id),size=model.id.endsWith('-large')?'large':'medium';
        title.textContent=guitar?rt('runtime.assets.guitarUse.'+model.id):trial?rt('runtime.assets.'+(midiStem()==='strings'?'stringsUse.':'muscriptorTrial.')+size):model.name;
        if(guitar||trial){const name=document.createElement('span');name.className='model-engine-name';name.textContent=model.name;copy.append(title,name);}else copy.append(title);
        card.title=guitar?rt('runtime.assets.guitarHint.'+model.id):trial?rt('runtime.assets.muscriptorHint.'+midiStem()):model.name;
        const status=document.createElement('span');status.textContent=cached?.ok?rt(active?(cached.matches===false?'runtime.assets.modelActiveSuperseded':'runtime.assets.modelActive'):cached.noteCount===0?'runtime.assets.modelEmpty':cached.matches===false?'runtime.assets.modelSuperseded':'runtime.assets.modelCached',{count:cached.noteCount}):rt(model.available?'runtime.assets.modelReady':'runtime.assets.modelMissing');
        copy.append(status);
        const badge=document.createElement('span');badge.className='engine-badge';badge.textContent=rt(model.id===preferred?.id?'runtime.assets.modelDefault':'runtime.assets.modelAlternative');
        card.append(radio,copy,badge);
        card.addEventListener('click',()=>{choices[midiStem()]=model.id;try{localStorage.setItem('xld.midi.models',JSON.stringify(choices));}catch(_){}message=null;versionMessage=null;render();});
        modelsElement.append(card);
      }
      document.getElementById('derivedMidiScope').textContent=manualActive()?rt('runtime.assets.runStatus.manual'):selected?rt('runtime.assets.modelScope',{stem:midiStem()}):'';
      document.getElementById('derivedMidiHint').textContent=!candidates().length?rt('runtime.assets.modelChoose'):
        !models?rt('runtime.assets.modelLoading'):/^(strings|drums)-muscriptor-/.test(selectedModel()?.id||'')?rt('runtime.assets.muscriptorHint.'+midiStem()):selectedModel()?.id==='piano-transkun'?rt('runtime.assets.transkunHint'):selectedModel()?.id==='drums-adtof-stems'?rt('runtime.assets.drumStemsHint'):rt(midiStem()==='strings'?(selectedModel()?.id==='yourmt3-plus'?'runtime.assets.yourmt3Hint':'runtime.assets.stringsModelHint'):midiStem()==='guitar'?'runtime.assets.guitarHint.'+selectedModel()?.id:midiStem()==='drums'?'runtime.assets.drumHint':'runtime.assets.modelHint');
    }
    // Which runs exist is scoped exactly like the rest of this panel: track, source, stem, engine. Values are
    // {state:'loading'|'ready'|'error', runs}. render() only ever reads it; the fetch writes it and re-renders once.
    const versionsBlock=document.getElementById('derivedMidiVersionsBlock'), versionsList=document.getElementById('derivedMidiVersions');
    const versionCache=new Map();let versionMessage=null;
    const versionKey=()=>[getSelected()?.id,sourceKey(),midiStem(),selectedModel()?.id].join('|');
    const pill=(className,text)=>{const node=document.createElement('span');node.className=className;node.textContent=text;return node;};
    const stamp=value=>{const date=new Date(value||0);return value&&Number.isFinite(date.getTime())?date.toLocaleString():'\u2014';};
    function renderVersions(busy) {
      document.getElementById('derivedMidiVersionsSummary').textContent=rt('runtime.assets.runVersions');
      const track=getSelected(),engine=selectedModel()?.id,key=versionKey();
      versionsBlock.hidden=!track||!engine||!bridge.listMidiRuns;
      if(versionsBlock.hidden){versionsList.replaceChildren();return;}
      // Fetch on open, not on every render: listRuns re-verifies every run's files.
      if(!versionCache.has(key)&&versionsBlock.open){versionCache.set(key,{state:'loading',runs:[]});loadVersions(track,midiStem(),engine,key);}
      versionsList.replaceChildren();
      if(!versionsBlock.open)return;
      const state=versionCache.get(key);
      if(!state||state.state==='loading'){versionsList.append(pill('derived-hint',rt('runtime.assets.runLoading')));return;}
      if(state.state==='error'){versionsList.append(pill('derived-hint',rt('runtime.assets.runFailed',{error:localizeError(state.error)})));return;}
      // 'files-missing' runs are the deliberate Recycle-Bin residue: one footer line, never an actionable row.
      const rows=state.runs.filter(run=>run.status!=='files-missing'),recycled=state.runs.length-rows.length;
      if(!rows.length)versionsList.append(pill('derived-hint',rt('runtime.assets.runNone')));
      const sourceChanged=rows.some(run=>run.status==='source-changed');
      for(const run of rows) {
        const row=document.createElement('div');row.className='version-row'+(run.active?' active':'');
        const manual=run.engine===MANUAL_ENGINE;
        row.dataset.runId=run.runId;row.dataset.engine=run.engine||'';
        row.title=run.runId.slice(0,8)+' \u00b7 '+(manual?rt('runtime.assets.runStatus.manual'):(run.model||engine));
        const copy=document.createElement('div');copy.className='version-copy';
        if(run.active)copy.append(pill('version-pill',rt('runtime.assets.runActive')));
        copy.append(pill('version-label',rt('runtime.assets.runLabel',{time:stamp(run.createdAt),count:run.noteCount??0})));
        // The model string is the actual version discriminator; a uuid tells nobody anything. A revision has no
        // model, and printing its placeholder string would only suggest one made it.
        if(run.model&&!manual)copy.append(pill('model-engine-name',run.model));
        // A revision is superseded forever \u2014 no model version will ever match it \u2014 so the plain status word would
        // read \u300c\u65e7\u7248\u672c\u300d permanently and be indistinguishable from an obsolete draft.
        copy.append(pill('version-state',rt('runtime.assets.runStatus.'+(manual?'manual':run.status==='source-changed'?'sourceChanged':run.status==='invalid'?'invalid':run.status))));
        if(manual&&['source-changed','invalid'].includes(run.status))copy.append(pill('version-state',rt('runtime.assets.runStatus.'+(run.status==='source-changed'?'sourceChanged':'invalid'))));
        if(run.kept)copy.append(pill('version-pill kept',rt('runtime.assets.runKept')));
        const actions=document.createElement('div');actions.className='version-actions';
        const switchable=!busy&&!run.active&&['current','superseded'].includes(run.status);
        for(const [name,label,enabled,handler] of [
          ['switch',rt('runtime.assets.runSwitch'),switchable,()=>switchVersion(run)],
          ['keep',rt(run.kept?'runtime.assets.runUnkeep':'runtime.assets.runKeep'),!busy,()=>keepVersion(run)],
          // Unpin before deleting, mirroring how kept storage rows behave.
          ['delete',rt('runtime.assets.runDelete'),!busy&&!run.kept&&Boolean(bridge.deleteMidi),()=>deleteVersion(run)],
          ['reveal',rt('runtime.assets.runReveal'),true,()=>revealVersion(run)]]) {
          const button=document.createElement('button');button.type='button';button.className='quiet-button';button.dataset.versionAction=name;
          button.textContent=label;button.disabled=!enabled;button.addEventListener('click',handler);actions.append(button);
        }
        row.append(copy,actions);versionsList.append(row);
      }
      if(recycled>0)versionsList.append(pill('derived-hint',rt('runtime.assets.runTrashedFooter',{count:recycled})));
      versionsList.append(pill('derived-hint',rt(sourceChanged?'runtime.assets.runSourceChangedHint':'runtime.assets.runRecycledHint')));
      if(versionMessage)versionsList.append(pill('derived-hint',versionMessage));
    }
    async function loadVersions(track,stem,engine,key) {
      const ask=async engineId=>{try{const value=await bridge.listMidiRuns({trackId:track.id,stem,engine:engineId});
        return value?.ok?{ok:true,runs:value.runs||[]}:{ok:false,error:value?.error||'request-failed'};}catch(error){return {ok:false,error:String(error)};}};
      // Hand-edited revisions are fetched every time, whatever model is selected. The panel is keyed on the
      // selected model, and a revision belongs to no model — so without this second, unconditional query the
      // user's own edits would have no row at all, and therefore no way to switch back to them and, worse, no
      // 保留 button. Work you cannot see is work you cannot pin.
      const [model,manual]=await Promise.all([ask(engine),ask(MANUAL_ENGINE)]);
      versionCache.set(key,model.ok?{state:'ready',runs:[...(manual.runs||[]),...model.runs],manualError:manual.ok?null:manual.error}
        :{state:'error',error:model.error,runs:[]});
      if(versionKey()===key)render();
    }
    async function switchVersion(run) {
      const track=getSelected();if(!track||pending||getBusy())return;
      const stem=midiStem();
      pending=true;versionMessage=null;render();
      let response;try{response=await bridge.activateMidiRun({trackId:track.id,stem,engine:run.engine,runId:run.runId});}catch(error){response={ok:false,error:String(error)};}
      // 'xld.midi.models' is the per-stem MODEL preference. A revision is not a model: selectedModel() discards an
      // unknown id and falls back to the default, so writing it here would make the panel refuse to stay where the
      // user put it — permanently, and across restarts.
      if(response?.ok&&run.engine!==MANUAL_ENGINE){choices[stem]=run.engine;try{localStorage.setItem('xld.midi.models',JSON.stringify(choices));}catch(_){}}
      versionCache.clear();
      try{await refresh();}finally{pending=false;}
      versionMessage=response?.ok?rt('runtime.assets.runSwitched',{time:stamp(run.createdAt),count:run.noteCount??0})
        :rt('runtime.assets.runSwitchFailed',{error:localizeError(response?.error||'request-failed')});
      // The timeline note lane is built from the active pointer, so a switch has to redraw it.
      if(response?.ok)onMidiActivated?.();
      render();
    }
    async function keepVersion(run) {
      const track=getSelected();if(!track||pending||getBusy())return;
      pending=true;versionMessage=null;render();
      try{await bridge.keepMidiRun({trackId:track.id,stem:midiStem(),runId:run.runId,value:!run.kept});}catch(_){}
      versionCache.clear();
      try{await refresh();}finally{pending=false;}
      render();
    }
    async function deleteVersion(run) {
      const track=getSelected();if(!track||pending||getBusy()||!bridge.deleteMidi)return;
      const stem=midiStem();
      pending=true;versionMessage=null;render();
      let response;try{response=await bridge.deleteMidi({trackId:track.id,stem,engine:run.engine,runId:run.runId});}catch(error){response={ok:false,error:String(error)};}
      if(response?.activated&&response.activated!==MANUAL_ENGINE){choices[stem]=response.activated;try{localStorage.setItem('xld.midi.models',JSON.stringify(choices));}catch(_){}}
      versionCache.clear();
      try{await refresh();}finally{pending=false;}
      if(response?.deleted)onMidiActivated?.();
      if(!response?.canceled)versionMessage=rt(response?.deleted?'runtime.assets.deleteMidiDone':'runtime.assets.deleteMidiFailed',
        {error:localizeError(response?.error||'request-failed')});
      render();
    }
    async function revealVersion(run) {
      const track=getSelected();if(!track)return;
      const response=await bridge.revealDerived(track.id,'midi',midiStem(),run.engine,run.runId).catch(()=>null);
      if(!response?.ok){message='runtime.assets.folderFailed';render();}
    }
    let trackId=null, result=null, sequence=0, switching=false, playback=null, message=null;
    const item=()=>auditionStems().find(stem=>stem.name===select.value);
    const url=()=>select.value==='original'?getSelected()?.fileUrl:item()?.audioUrl;
    let view = 'stems';
    function render() {
      document.getElementById('derivedHeading').textContent=rt('runtime.assets.heading');
      select.setAttribute('aria-label',rt('runtime.assets.select'));
      if(select.options[0]) select.options[0].textContent=rt('runtime.assets.original');
      audition.textContent=rt('runtime.assets.audition'); refreshButton.textContent=rt('runtime.assets.refresh');
      wavButton.textContent=rt('runtime.assets.wav'); midiButton.textContent=rt('runtime.assets.midi');
      separate.textContent=rt(selectedStems()?.ok&&!force.checked?'runtime.assets.useStems':'runtime.assets.separate'); transcribe.textContent=rt(selectedMidi()?.ok&&selectedMidi().matches!==false&&!force.checked?'runtime.assets.useMidi':'runtime.assets.transcribe');
      document.getElementById('derivedWavHeading').textContent=rt('runtime.assets.wavHeading');
      document.getElementById('derivedMidiHeading').textContent=rt('runtime.assets.midiHeading');
      document.getElementById('derivedForceLabel').textContent=rt(view==='midi'?'runtime.assets.forceMidi':'runtime.assets.forceStems');
      document.getElementById('derivedMidiSelectLabel').textContent=rt('runtime.assets.midiSelect');
      midiSelect.setAttribute('aria-label',rt('runtime.assets.midiSelect'));
      midiAudition.textContent=rt('runtime.transport.listenWav');
      const midiListen=document.getElementById('derivedMidiListen');if(midiListen){midiListen.textContent=rt('runtime.transport.listenMidi');midiListen.title=rt('runtime.transport.currentMidi');midiListen.disabled=!result?.midi?.[midiStem()]?.ok || !result.midi[midiStem()].noteCount || switching;}
      document.getElementById('derivedMidiSource').textContent=result?.ok?rt('runtime.assets.midiSource',{model:sourceName()}):rt(inputFor('strings')?'runtime.assets.stringsOnly':'runtime.midiBatch.needsStems');
      document.getElementById('refinementMidiBoundary').textContent=rt('runtime.assets.refinementBoundary');
      const busy=pending || getBusy();
      separate.disabled=!getSelected() || !selectedStemModel() || (!selectedStemModel().available && (!selectedStems()?.ok || force.checked)) || busy;
      transcribe.disabled=!inputFor(midiStem()) || !selectedModel() || (!selectedModel().available && (!selectedMidi()?.ok || selectedMidi().matches===false || force.checked)) || busy;
      force.disabled=busy;
      midiSelect.disabled=!midiSelect.options.length || busy;
      midiAudition.disabled=!inputFor(midiStem()) || switching;
      select.disabled=!getSelected() || switching;
      audition.disabled=!getSelected() || !url() || switching;
      refreshButton.disabled=!getSelected() || switching;
      wavButton.disabled=!result?.ok;
      midiButton.disabled=!hasMidi();
      deleteMidiButton.textContent=rt('runtime.assets.deleteMidi');
      deleteMidiButton.disabled=busy||!selectedMidi()?.ok||!bridge.deleteMidi;
      midiButton.textContent=rt(selectedMidi()?.ok?'runtime.assets.partMidi':'runtime.assets.midi');
      renderStemModels(busy); renderModels(busy); renderVersions(busy); renderMerge(busy); renderBatch(busy); renderStrings(busy);
      const failure=selectedFailure();
      if(deletionMessage && inSourceScope(deletionMessage) && deletionMessage.stem===midiStem() && deletionMessage.engine===selectedModel()?.id) status.textContent=rt(deletionMessage.key,deletionMessage);
      else if(failure) status.textContent=rt('runtime.assets.failedDetail',{model:failure.model || rt('runtime.assets.separate'),error:localizeError(failure.detail)});
      else if(message) status.textContent=rt(message);
      else if(!getSelected()) status.textContent=rt('runtime.assets.choose');
      else if(!result) status.textContent=rt('runtime.workspace.loading');
      else if(result?.error==='read-failed') status.textContent=rt('runtime.workspace.readFailed');
      else if(!result?.ok && !(view==='midi' && inputFor(midiStem()))) status.textContent=rt(result?.error==='stems-stale'?'runtime.assets.stale':'runtime.assets.missing');
      else {
        const midi=selectedMidi(),model=view==='midi'?selectedModel():null;
        // Before the model lookup, because the model lookup cannot see this. A revision is permanently
        // matches:false, so the line below would have called the user's own edit 「来自旧模型版本」 and told them to
        // press 生成 MIDI to replace it — the one sentence in the app that recruits the user into destroying it.
        if(view==='midi'&&manualActive()) status.textContent=rt('runtime.assets.manualActiveResult',{count:activeRecord()?.noteCount||0});
        else status.textContent=model ? rt(midi?.ok?(midi.noteCount===0?'runtime.assets.modelEmptyResult':midi.matches===false?'runtime.assets.modelSupersededResult':activeMidi(midiStem(),midi)?'runtime.assets.modelActiveResult':'runtime.assets.modelSavedResult'):'runtime.assets.modelNoResult',{model:model.name,count:midi?.noteCount||0}) : rt('runtime.assets.ready');
      }
      onChange?.();
    }
    function reset() {
      sequence++; trackId=getSelected()?.id || null; result=null; message=null; mergeMessage=null; batchReport=null; stringsMessage=null;
      forceByView.stems=forceByView.midi=force.checked=false; midiSelect.replaceChildren(); versionCache.clear(); versionMessage=null;
      select.replaceChildren(new Option(rt('runtime.assets.original'),'original')); render();
    }
    async function refresh() {
      const track=getSelected();
      if(!track) {reset();return;}
      if(track.id!==trackId) reset();
      const request=++sequence;
      const [response]=await Promise.all([bridge.readDerived(track.id).catch(()=>({ok:false,error:'read-failed',stems:[]})),loadModels(),loadStemModels()]);
      if(request!==sequence || track.id!==getSelected()?.id) return;
      const choice=select.value, midiChoice=midiStem(), previousSource=sourceKey(), previousRun=selectedMidi()?.runId;
      trackId=track.id; result=response; message=null;
      if(previousSource!==sourceKey()){mergeMessage=null;batchReport=null;versionCache.clear();versionMessage=null;}
      // A run, a batch or a task completion changes which versions exist without moving the source key.
      if(previousRun!==selectedMidi()?.runId){versionCache.clear();versionMessage=null;}
      for(const [key,failure] of failures) {
        if(failure.trackId!==track.id || (failure.kind==='midi' && failure.sourceRunId!==inputFor(failure.stem)?.runId)) continue;
        const updated=failure.kind==='stems'?result?.stemVariants?.[failure.engine]:result?.variants?.[failure.stem]?.[failure.engine];
        if(updated?.ok && updated.runId!==failure.previousRunId) failures.delete(key);
      }
      select.replaceChildren(new Option(rt('runtime.assets.original'),'original'));
      for(const name of ['bass','piano','guitar','drums','vocals','other','strings']) {
        if(auditionStems().some(stem=>stem.name===name)) select.add(new Option(name,name));
      }
      if([...select.options].some(option=>option.value===choice)) select.value=choice;
      midiSelect.replaceChildren();
      for(const stem of supportedParts()) if(inputFor(stem)) midiSelect.add(new Option(stem,stem));
      if([...midiSelect.options].some(option=>option.value===midiChoice)) midiSelect.value=midiChoice;
      // Keep the current instrument and playhead when activating a different WAV result.
      if(getCurrent()?.id===track.id && playback?.trackId===track.id && playback.stem!=='original' &&
          !auditionStems().some(stem=>stem.audioUrl===playback.url)) {
        select.value=auditionStems().some(stem=>stem.name===playback.stem)?playback.stem:'original'; await switchAudio(false);
        message='runtime.assets.changed';
      }
      render();
    }
    async function switchAudio(forcePlay, sourceOverride) {
      const track=getSelected(), source=sourceOverride || url();
      if(!track || !source || switching) return;
      const same=getCurrent()?.id===track.id;
      if(!forcePlay && !same) {render();return;}
      const start=getPlaybackPosition?.(track.id) ?? (same ? Number(audio.currentTime)||0 : 0);
      const shouldPlay=forcePlay || (same && !audio.paused);
      switching=true; message=null; render();
      try {await playTrack(track,queueFor(track),shouldPlay,start,source);}
      catch(_) {message='runtime.assets.playFailed';}
      finally {switching=false;render();}
    }
    function onPlayback(track, source) {
      const stem=track.id===trackId?auditionStems().find(stem=>stem.audioUrl===source)?.name:null;
      playback={trackId:track.id,stem:stem||'original',url:source};
      if(getSelected()?.id===track.id) select.value=playback.stem;
      render(); onPlaybackChange?.();
    }
    select.addEventListener('change',()=>{message=null;render();switchAudio(false);});
    audition.addEventListener('click',()=>switchAudio(true));
    midiSelect.addEventListener('change',()=>{message=null;versionMessage=null;render();});
    midiAudition.addEventListener('click',()=>switchAudio(true,inputFor(midiStem())?.audioUrl));
    document.getElementById('derivedMidiListen')?.addEventListener('click',()=>onMidiListen?.(midiStem()));
    refreshButton.addEventListener('click',()=>{models=null;stemModels=null;refresh();});
    stringsSelect.addEventListener('change',async()=>{
      const track=getSelected(),value=(result?.strings?.choices||[]).find(item=>item.runId===stringsSelect.value);
      if(!track||pending||getBusy())return;
      pending=true;stringsMessage=null;render();
      let response;try{response=await bridge.selectStringsSource(track.id,value?{runId:value.runId,cacheKey:value.cacheKey}:null);}catch(error){response={ok:false,error:String(error)};}
      try{await refresh();}finally{pending=false;}
      if(getSelected()?.id===track.id){stringsMessage=response?.ok?null:rt('runtime.assets.stringsSelectFailed',{error:localizeError(response?.error||'request-failed')});if(response?.ok&&value&&inputFor('strings'))midiSelect.value='strings';}
      render();
    });
    versionsBlock.addEventListener('toggle',()=>render());
    force.addEventListener('change',()=>{forceByView[view]=force.checked;render();});
    deleteMidiButton.addEventListener('click',async()=>{
      const track=getSelected(),stem=midiStem(),engine=selectedModel()?.id,midi=selectedMidi(),sourceRunId=sourceKey();
      if(!track||pending||getBusy()||!midi?.ok||!bridge.deleteMidi)return;
      pending=true;deletionMessage=null;message=null;render();
      let response;try{response=await bridge.deleteMidi({trackId:track.id,stem,engine,runId:midi.runId});}catch(error){response={ok:false,error:String(error)};}
      versionCache.clear();versionMessage=null;
      if(response?.deleted){failures.delete(failureKey(track.id,'midi',stem,engine));batchReport=null;mergeMessage=null;
        if(response.activated&&response.activated!==MANUAL_ENGINE){choices[stem]=response.activated;try{localStorage.setItem('xld.midi.models',JSON.stringify(choices));}catch(_){}}
      }
      try{await refresh();}finally{pending=false;}
      if(getSelected()?.id===track.id && sourceKey()===sourceRunId && !response?.canceled){
        deletionMessage={trackId:track.id,sourceRunId,stem,engine:selectedModel(stem)?.id,
          key:!response?.ok?'runtime.assets.deleteMidiFailed':response.activationError?'runtime.assets.deleteMidiActivationFailed':response.activated?'runtime.assets.deleteMidiActivated':'runtime.assets.deleteMidiDone',
          model:(models||[]).find(m=>m.id===response?.activated)?.name,error:localizeError(response?.activationError||response?.error||'request-failed')};
      }
      render();
    });
    async function reveal(kind) {
      const track=getSelected(); if(!track) return;
      const response=await bridge.revealDerived(track.id,kind,kind==='midi'?midiStem():select.value,kind==='midi'?selectedModel()?.id:null).catch(()=>null);
      if(!response?.ok) {await refresh();message='runtime.assets.folderFailed';render();}
    }
    wavButton.addEventListener('click',()=>reveal('stems'));
    midiButton.addEventListener('click',()=>reveal(selectedMidi()?.ok?'midi':'midi-all'));
    batchFolder.addEventListener('click',()=>reveal('midi-all'));
    async function generate(kind) {
      const track=getSelected();
      if (!track || pending || getBusy()) return;
      const stem=midiStem();
      if (kind==='midi' && (!inputFor(stem) || !candidates(stem).length)) return;
      pending=true; message=null;deletionMessage=null;
      const engine=kind==='stems'?selectedStemModel()?.id:selectedModel()?.id;
      if(!engine){pending=false;render();return;}
      const sourceRunId=inputFor(stem)?.runId, key=failureKey(track.id,kind,stem,engine,sourceRunId), model=kind==='stems'?selectedStemModel()?.name:selectedModel()?.name;
      const previousRunId=(kind==='stems'?selectedStems():selectedMidi())?.runId;
      failures.delete(key);
      onTask({trackId:track.id,trackTitle:track.title,engine,engineName:kind==='stems'?selectedStemModel().name:selectedModel().name+' · '+stem,status:'starting',progress:0});
      render();
      let response;
      try { response=await bridge.runDerived(track.id,kind,stem,force.checked,engine); }
      catch (_) { response={ok:false,error:'request-failed'}; }
      onTask(response.task || null);
      if(!response.ok && !['analysis-cancelled','analysis-busy'].includes(response.error)) {
        failures.set(key,{trackId:track.id,kind,stem,engine,model,previousRunId,sourceRunId,
          detail:response.detail || response.task?.message || response.error});
      }
      try {await refresh();} finally {pending=false;}
      if (getSelected()?.id===track.id && (kind==='stems' || inputFor(stem)?.runId===sourceRunId)) {
        message=response.ok ? (kind==='midi'?null:response.cached?'runtime.assets.cached':'runtime.assets.generated')
          : response.error==='analysis-cancelled'?'runtime.assets.cancelled'
          : response.error==='analysis-busy'?'runtime.assets.busy'
          : response.error==='runtime-missing'?'runtime.assets.runtimeMissing':'runtime.assets.generateFailed';
      }
      render();
    }
    batchButton.addEventListener('click',async()=>{
      const track=getSelected();if(!track || pending || getBusy() || batchButton.disabled)return;
      const sourceRunId=sourceKey(), regenerate=force.checked;
      const plan=batchModels().map(({stem,model})=>Object.freeze({stem,engine:model.id,name:model.name,kind:'midi',sourceRunId:inputFor(stem)?.runId}));
      plan.push(Object.freeze({kind:'merge',engine:'midi-merge',name:mergeText('title')}));
      let mergeSkipped=false;
      const total=plan.length;
      pending=true;batchReport={trackId:track.id,sourceRunId,key:'working',step:1,total};
      onBatchState({running:true,index:0,total,reset:true});render();
      let outcome;
      try {
        outcome=await root.XldMidiBatch.run({plan,sourceRunId,
          readSource:async()=>{const value=await bridge.readDerived(track.id);return {ok:Boolean(value?.ok||Object.keys(value?.midiInputs||{}).length),runId:value?.midiSourceKey||value?.runId};},cancelled:()=>isBatchCancelled(),
          onStep:(index,total,step)=>{
            batchReport={trackId:track.id,sourceRunId,key:'working',step:index,total};
            onBatchState({running:true,index,total});
            onTask({trackId:track.id,trackTitle:track.title,engine:step.engine,engineName:step.name+(step.stem?' · '+step.stem:''),status:'starting',progress:0});render();
          },
          runStep:async step=>{
            if(step.kind==='merge') {
              const latest=await bridge.readDerived(track.id);
              if(!(latest?.ok||Object.keys(latest?.midiInputs||{}).length) || (latest.midiSourceKey||latest.runId)!==sourceRunId)return {ok:false,error:'midi-batch-source-changed'};
              if(Object.values(latest.midi||{}).filter(m=>m?.ok && m.noteCount>0).length<2) {
                mergeSkipped=true;return {ok:true,skipped:true};
              }
            }
            const response=step.kind==='merge'?await requestMerge(track):await bridge.runDerived(track.id,'midi',step.stem,regenerate,step.engine);
            if(response.task)onTask(response.task);
            if(response.ok && step.stem) {failures.delete(failureKey(track.id,'midi',step.stem,step.engine,step.sourceRunId));await refresh();}
            return response;
          }
        });
      }catch(error){outcome={ok:false,error:'request-failed',detail:String(error),completed:[]};}
      finally {
        try {await refresh();} finally {pending=false;}
        onBatchState({running:false,index:0,total:0});
        const key=outcome.ok?(mergeSkipped?'doneNoMerge':'done'):outcome.error==='analysis-cancelled'?'cancelled':outcome.error==='midi-batch-source-changed'?'sourceChanged':'failed';
        batchReport={trackId:track.id,sourceRunId,key,error:localizeError(outcome.detail || outcome.error || ''),count:outcome.completed?.length || 0,total,parts:plan.length-1};
        onTask({trackId:track.id,trackTitle:track.title,engine:'midi-batch',engineName:batchText('title'),status:outcome.ok?'complete':outcome.error==='analysis-cancelled'?'cancelled':'failed',progress:outcome.ok?1:(outcome.completed?.length || 0)/total,message:batchText(key,batchReport)});
        render();
      }
    });
    mergeRun.addEventListener('click',async()=>{
      const track=getSelected();if(!track || pending || getBusy())return;
      const sourceRunId=sourceKey();
      pending=true;mergeMessage={trackId:track.id,sourceRunId,key:'working'};
      onTask({trackId:track.id,trackTitle:track.title,engine:'midi-merge',engineName:mergeText('title'),status:'starting',progress:0});render();
      let response;
      try {response=await requestMerge(track);}catch(error){response={ok:false,error:String(error)};}
      onTask(response.task || null);
      try {await refresh();} finally {pending=false;}
      if(getSelected()?.id===track.id)mergeMessage=response.ok?null:{trackId:track.id,sourceRunId,key:response.error==='analysis-cancelled'?'cancelled':'failed',error:localizeError(response.detail || response.error)};
      render();
    });
    for(const [button,folder] of [[mergeOpen,false],[mergeFolder,true]])button.addEventListener('click',async()=>{
      const track=getSelected();if(!track)return;
      const sourceRunId=sourceKey();
      const response=await bridge.openMergedMidi(track.id,folder).catch(()=>({ok:false}));
      if(!response.ok && getSelected()?.id===track.id){mergeMessage={trackId:track.id,sourceRunId,key:'openFailed'};render();}
    });
    separate.addEventListener('click',()=>generate('stems'));
    transcribe.addEventListener('click',()=>generate('midi'));
    root.addEventListener('focus',()=>{if(!switching) refresh();});
    return {reset,refresh,render,onPlayback,
      setView: value => {if(value!==view){forceByView[view]=force.checked;view=value;force.checked=forceByView[view]||false;message=null;}render();},
      snapshot: () => ({trackId, result, pending, failure:selectedFailure()}),
      playingStem: track => playback?.trackId===track?.id && playback.stem!=='original'?playback.stem:null};
  }
  root.XldDerivedControls={create};
})(globalThis);
