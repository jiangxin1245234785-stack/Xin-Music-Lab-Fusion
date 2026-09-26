// Compact MIDI editor; model files remain immutable. Drafts and undo history are separate.
(function(root){
'use strict';
function create({bridge,timeline,rt,onEdited,onSaved,onPreview}){
 const $=id=>document.getElementById(id),M=root.XldMidiEdit,sessions=new Map();
 let enabled=false,busy=false,message='',pending=Promise.resolve(),currentTrack=null;
 let draftRows=[],draftError=false,draftRequest=0,outputMessage='';
 const viewLane=()=>timeline.laneFor(timeline.focus());
 const lane=()=>timeline.editLane?timeline.editLane():viewLane();
 const instrument=l=>l?.instrument?.index ?? l?.notes?.[0]?.[4];
 const scope=(l,t=currentTrack)=>JSON.stringify([t,l.stem,l.runId,instrument(l)]);
 const session=l=>l?sessions.get(scope(l)):null;
 const active=()=>Boolean(enabled&&timeline.noteSelecting()&&viewLane()?.editable);
 const say=(key,args)=>{message=rt('runtime.edit.'+key,args);render();};
 const identity=l=>({trackId:currentTrack,stem:l.stem,runId:l.runId,instrument:instrument(l),sourceKey:l.sourceAudio?.key||null});

 
 let shape=null;
 const shapeErrors=new Set(['join-count','join-pitch','join-neighbor','join-overlap','split-one','split-inside','split-short','shape-stale']);
 function clearShape(){shape=null;timeline.invalidatePreview?.();}
 function shapeValid(){
  const l=lane();return Boolean(shape&&l&&active()&&shape.scope===scope(l)&&session(l)?.model===shape.model&&
    shape.proposal.revision===shape.model.revision()&&JSON.stringify([...selected()].sort())===JSON.stringify([...shape.proposal.ids].sort()));
 }
 function preview(){return shapeValid()?{laneId:timeline.focus(),notes:shape.proposal.notes.map(n=>n.slice())}:null;}
 function showShapeError(error,s){say(shapeErrors.has(error.message)?error.message:'invalid',{ms:((s?.model.minimum()||.005)*1000).toFixed(2)});}
 function propose(kind){
  if(!active()||busy)return;clearShape();const s=ensure();if(!s)return;
  try{
   let proposal;
   if(kind==='join')proposal=s.model.previewJoin(selected());
   else {
    if(selected().length!==1)throw Error('split-one');
    const text=$('midiEditSplitAt')?.value?.trim()||'';
    const at=text?Number(text):timeline.playheadTime?.();
    proposal=s.model.previewSplit(selected()[0],at);
   }
   shape={scope:scope(lane()),model:s.model,proposal};message='';onPreview?.();timeline.invalidatePreview?.();render();
  }catch(error){showShapeError(error,s);}
 }
 function applyShape(){
  if(!shapeValid()){clearShape();say('shape-stale');return;}
  const s=session(lane()),proposal=shape.proposal;clearShape();
  try{const keys=s.model.commit(proposal);if(keys!==false)apply(s,keys);}
  catch(error){showShapeError(error,s);}
 }
 function renderShape(){
  if(shape&&!shapeValid())clearShape();
  const box=$('midiEditShapePreview');if(!box)return;
  box.hidden=!shape;
  const chosen=selected();
  for(const [id,label]of [['midiEditJoin','join'],['midiEditSplit','split'],['midiEditShapeApply','shapeApply'],['midiEditShapeCancel','shapeCancel']]){
   const b=$(id);if(b)b.textContent=rt('runtime.edit.'+label);
  }
  $('midiEditJoin').disabled=busy||!lane()||chosen.length<2;
  $('midiEditSplit').disabled=busy||chosen.length!==1;
  const at=$('midiEditSplitAt');at.disabled=busy||chosen.length!==1;
  at.placeholder=rt('runtime.edit.splitCursor');at.title=rt('runtime.edit.splitTimeHint');at.setAttribute('aria-label',rt('runtime.edit.splitTimeHint'));
  $('midiEditShapeApply').disabled=busy||!shape;
  if(shape){
   const p=shape.proposal;
   $('midiEditShapeSummary').textContent=rt('runtime.edit.'+(p.kind==='join'?'joinPreview':'splitPreview'),{
    count:p.count,pitch:p.pitch,velocity:p.velocity,start:p.start.toFixed(3),end:p.end.toFixed(3),at:p.at?.toFixed(3)});
   $('midiEditShapeHint').textContent=rt('runtime.edit.'+(p.kind==='join'?'joinHint':'splitHint'));
  }
 }

 const hasDraft=l=>Boolean(l&&([...sessions.values()].some(s=>s.meta.trackId===currentTrack&&s.meta.stem===l.stem&&s.meta.runId===l.runId&&s.model.dirty())
   ||draftRows.some(d=>d.stem===l.stem&&d.runId===l.runId&&d.status==='current')));
 async function refreshDrafts(){
  const track=currentTrack,request=++draftRequest;
  if(!track){draftRows=[];draftError=false;render();return;}
  let result;try{result=await bridge.listMidiDrafts(track);}catch(_){result={ok:false};}
  if(request!==draftRequest||track!==currentTrack)return;
  draftError=!result?.ok;draftRows=result?.ok?result.drafts||[]:[];
  render();
 }
 function renderDrafts(){
  const box=$('midiDrafts');if(!box)return;
  box.hidden=!draftRows.length&&!draftError;
  $('midiDraftSummary').textContent=rt('runtime.edit.drafts',{count:draftRows.length});
  const list=$('midiDraftList');list.replaceChildren();
  if(draftError){list.textContent=rt('runtime.edit.readFailed');return;}
  for(const item of draftRows){
   const row=document.createElement('div');row.className='midi-draft-row';row.dataset.runId=item.runId;row.dataset.draftStatus=item.status;
   const label=document.createElement('span');
   label.textContent=rt('runtime.edit.draftItem',{stem:item.stem,instrument:item.instrument+1,count:item.noteCount})+' · '+rt('runtime.edit.draftState.'+item.status);
   if(item.updatedAt)label.title=new Date(item.updatedAt).toLocaleString();
   const button=document.createElement('button');button.type='button';button.className='quiet-button';
   button.textContent=rt('runtime.edit.returnDraft');button.disabled=busy||!['current','other-version'].includes(item.status);
   button.addEventListener('click',()=>returnDraft(item));
   row.append(label,button);list.append(row);
  }
  if(draftRows.some(d=>['source-changed','missing','invalid'].includes(d.status))){
   const note=document.createElement('small');note.textContent=rt('runtime.edit.draftSourceHint');list.append(note);
  }
 }
 async function returnDraft(item){
  if(busy||!currentTrack)return;
  busy=true;render();const track=currentTrack;
  try{
   await pending;
   if([...sessions.values()].some(s=>s.meta.trackId===track&&s.persistError)){outputMessage=rt('runtime.edit.persistFailed');return;}
   const r=await bridge.activateMidiRun({trackId:track,stem:item.stem,runId:item.runId,engine:item.engine});
   if(!r?.ok){outputMessage=rt('runtime.edit.draftSourceHint');await refreshDrafts();return;}
   if(track!==currentTrack)return;
   await timeline.refresh();await onSaved?.();
   const id=timeline.laneFor(item.stem+'#'+item.instrument)?item.stem+'#'+item.instrument:item.stem;
   timeline.setFocus(id);enabled=true;timeline.setNoteSelecting(true);outputMessage='';
  }catch(_){outputMessage=rt('runtime.edit.readFailed');}
  finally{busy=false;render();}
 }
 async function prepareMerge(trackId,parts){
  await pending;
  const related=s=>s.meta.trackId===trackId&&parts.some(p=>p.stem===s.meta.stem&&p.runId===s.meta.runId);
  if([...sessions.values()].some(s=>related(s)&&(s.persistError||s.persisting)))return {ok:false,error:'merge-draft-write-failed'};
  if([...sessions.values()].some(s=>related(s)&&s.model.dirty()))return {ok:false,error:'merge-draft-pending'};
  return {ok:true};
 }
 async function exportMidi(){
  const l=lane();if(busy||!l)return;
  if(hasDraft(l)){outputMessage=rt('runtime.edit.exportDraft');render();return;}
  busy=true;outputMessage='';render();const track=currentTrack;
  try{
   await pending;
   const r=await bridge.exportMidi({trackId:track,stem:l.stem,runId:l.runId});
   if(track!==currentTrack)return;
   outputMessage=r?.cancelled?rt('runtime.edit.exportCancelled'):r?.ok?rt('runtime.edit.exported',{path:r.path})
     :rt('runtime.edit.'+(r?.error==='export-draft-pending'?'exportDraft':r?.error==='export-version-changed'?'exportChanged':r?.error==='export-protected'?'exportProtected':'exportFailed'));
  }catch(_){if(track===currentTrack)outputMessage=rt('runtime.edit.exportFailed');}
  finally{busy=false;render();}
 }

 const selected=()=>timeline.selection().notes.map(n=>n.instrumentIndex+':'+n.noteIndex);
 const conflict=l=>[...sessions.values()].some(s=>s.meta.trackId===currentTrack&&s.meta.stem===l.stem&&s.meta.runId===l.runId&&s.meta.instrument!==instrument(l)&&s.model.dirty());
 function ensure(){
  const l=lane();
  if(!l&&viewLane()?.grouped){say('oneInstrument');return null;}
  if(busy||!l?.editable||!l.notes.length)return null;
  if(conflict(l)){say('otherDraft');return null;}
  let s=session(l);
  if(!s){s={meta:identity(l),model:M.create(l.notes,{duration:l.duration,instrument:instrument(l),minDuration:l.minNoteDuration})};sessions.set(scope(l),s);}
  return s;
 }
 function persist(s){
  const payload={...s.meta,notes:s.model.dirty()?s.model.notes():null};
  const writeVersion=s.writeVersion=(s.writeVersion||0)+1;
  s.persisting=true;s.persistError=false;
  pending=pending.catch(()=>{}).then(()=>bridge.writeMidiDraft(payload)).then(r=>{
   if(s.writeVersion===writeVersion){s.persisting=false;s.persistError=!r?.ok;if(r?.ok)refreshDrafts();}render();return r;
  }).catch(()=>{if(s.writeVersion===writeVersion){s.persisting=false;s.persistError=true;}render();});
  return pending;
 }
 function apply(s,keys=selected()){
  clearShape();
  timeline.replaceNotes(lane().laneId,s.model.notes(),keys,s.model.dirty());
  onEdited?.();
  message='';persist(s);render();
 }
 function change(fn,keys){
  clearShape();
  const s=ensure();if(!s)return;
  try{if(fn(s.model)!==false)apply(s,keys);}catch(e){say(e.message==='empty'?'empty':'invalid');}
 }
 async function hydrate(lanes,trackId){
  await pending;
  const loaded=await Promise.all(lanes.map(async l=>{
   if(!l.editable||!l.notes.length)return l;
   const id=scope(l,trackId);let s=sessions.get(id);
   if(s&&s.meta.sourceKey!==(l.sourceAudio?.key||null))s=null;
   if(!s){
    const meta={trackId,stem:l.stem,runId:l.runId,instrument:instrument(l),sourceKey:l.sourceAudio?.key||null};
    let r;try{r=await bridge.readMidiDraft(meta);}catch(_){r={ok:false};}
    if(!r?.ok){message=rt('runtime.edit.readFailed');return l;}
    if(r.draft&&r.draft.sourceKey===meta.sourceKey){
     try{s={meta,model:M.create(l.notes,{duration:l.duration,instrument:instrument(l),restored:r.draft.notes,minDuration:l.minNoteDuration})};sessions.set(id,s);}
     catch(_){message=rt('runtime.edit.readFailed');}
    }
   }
   return s?.model.dirty()?{...l,notes:s.model.notes().sort((a,b)=>a[0]-b[0]),noteCount:s.model.notes().length,isDraft:true}:l;
  }));
  if(currentTrack===trackId)await refreshDrafts();
  return loaded;
 }
 function render(){
  const l=lane(),s=session(l),chosen=timeline.selection().notes,open=active(),ready=Boolean(viewLane()?.editable&&viewLane()?.notes.length);
  const toggle=$('midiEditToggle');if(!toggle)return;
  const exportButton=$('midiExport');
  if(exportButton){
   exportButton.textContent=rt('runtime.edit.export');exportButton.disabled=busy||!l?.runId||hasDraft(l)||draftError;
   exportButton.title=rt(hasDraft(l)?'runtime.edit.exportDraft':'runtime.edit.exportScope',{stem:l?.stem||'',count:l?.instruments?.length||1});
   $('midiOutputStatus').textContent=outputMessage;
  }
  renderDrafts();
  toggle.textContent=rt('runtime.edit.mode');toggle.disabled=!ready||busy;toggle.setAttribute('aria-pressed',String(open));
  $('midiEditBar').hidden=!open;
  renderShape();
  const labels={midiEditDelete:'delete',midiEditUndo:'undo',midiEditRedo:'redo',midiEditSave:'save',midiEditReset:'reset',midiEditApply:'apply',
   midiEditPitchLabel:'pitch',midiEditStartLabel:'start',midiEditEndLabel:'end',midiEditVelocityLabel:'velocity'};
  for(const [id,key]of Object.entries(labels))$(id).textContent=rt('runtime.edit.'+key);
  $('midiEditDelete').disabled=busy||!l||!chosen.length;
  $('midiEditUndo').disabled=busy||!s?.model.canUndo();
  $('midiEditRedo').disabled=busy||!s?.model.canRedo();
  $('midiEditSave').disabled=busy||!s?.model.dirty();
  $('midiEditReset').disabled=busy||!s?.model.dirty();
  $('midiEditApply').disabled=busy||chosen.length!==1;
  for(const [id,field]of [['midiEditPitch','pitch'],['midiEditStart','start'],['midiEditEnd','end'],['midiEditVelocity','velocity']]){
   const input=$(id);input.disabled=busy||chosen.length!==1;
   if(document.activeElement!==input)input.value=chosen.length===1?Number(chosen[0][field].toFixed(6)):'';
   input.placeholder=chosen.length>1?'—':'';
  }
  $('midiEditStatus').textContent=(!l&&viewLane()?.grouped?rt('runtime.edit.oneInstrument'):'') || message || rt('runtime.edit.'+(busy?'saving':s?.persistError?'persistFailed':s?.persisting?'persisting':s?.model.dirty()?'draft':'clean'));
  $('midiEditHint').textContent=rt('runtime.edit.hint');
 }
 async function save(){
  const l=lane(),s=session(l);if(busy||!s?.model.dirty())return;
  clearShape();busy=true;message='';render();
  const track=currentTrack,keys=scope(l);
  try{
   await pending;
   const notes=s.model.notes().map(n=>({start:n[0],end:n[1],pitch:n[2],velocity:n[3]}));
   const r=await bridge.saveMidiRevision({trackId:track,stem:s.meta.stem,parentRunId:s.meta.runId,instrument:s.meta.instrument,notes});
   if(!r?.ok){say('error.'+(ERRORS.has(r?.error)?r.error:'generic'));return;}
   // Only clear the draft after the new version is durable and active.
   const cleared=await bridge.writeMidiDraft({...s.meta,notes:null});
   sessions.delete(keys);
   message=rt('runtime.edit.'+(cleared?.ok?'saved':'savedDraftRemains'));
   if(currentTrack===track){await timeline.refresh();if(timeline.focus()===l.laneId||viewLane()?.grouped&&viewLane()?.stem===l.stem)timeline.setNoteSelecting(true);await onSaved?.();}
  }catch(_){say('error.generic');}
  finally{busy=false;render();}
 }
 function bind(){
  $('midiEditJoin')?.addEventListener('click',()=>propose('join'));
  $('midiEditSplit')?.addEventListener('click',()=>propose('split'));
  $('midiEditShapeApply')?.addEventListener('click',applyShape);
  $('midiEditShapeCancel')?.addEventListener('click',()=>{clearShape();render();});
  $('midiEditSplitAt')?.addEventListener('input',()=>{clearShape();render();});
  $('midiExport')?.addEventListener('click',exportMidi);
  $('midiEditToggle')?.addEventListener('click',()=>{enabled=!active();timeline.setNoteSelecting(enabled);message='';render();});
  $('midiEditDelete')?.addEventListener('click',()=>change(m=>m.remove(selected()),[]));
  $('midiEditUndo')?.addEventListener('click',()=>change(m=>m.undo(),[]));
  $('midiEditRedo')?.addEventListener('click',()=>change(m=>m.redo(),[]));
  $('midiEditReset')?.addEventListener('click',()=>change(m=>m.reset(),[]));
  $('midiEditSave')?.addEventListener('click',save);
  $('midiEditApply')?.addEventListener('click',()=>{
   if(selected().length!==1)return;
   const inputs=['midiEditStart','midiEditEnd','midiEditPitch','midiEditVelocity'].map(id=>$(id).value);
   if(inputs.some(v=>!v.trim())){say('invalid');return;}
   change(m=>m.set(selected()[0],inputs.map(Number)));
  });
  window.addEventListener('keydown',event=>{
   if(!active()||busy||$('workspaceTimeline')?.hidden||/INPUT|TEXTAREA|SELECT/.test(event.target?.tagName)||event.target?.isContentEditable)return;
   const mod=event.ctrlKey||event.metaKey;
   if(mod&&event.key.toLowerCase()==='z'){event.preventDefault();change(m=>event.shiftKey?m.redo():m.undo(),[]);}
   else if(mod&&event.key.toLowerCase()==='y'){event.preventDefault();change(m=>m.redo(),[]);}
   else if(mod&&event.key.toLowerCase()==='s'){event.preventDefault();save();}
   else if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();change(m=>m.remove(selected()),[]);}
  });
  render();
 }
 function attach(body,l,{point,rect,layout,total,cancelGesture}){
  let gesture=null,ghosts=[];
  const hit=p=>l.notes.map(n=>({n,r:rect(n)})).reverse().find(({r})=>p.x>=r.x&&p.x<=r.x+r.width&&p.y>=r.y&&p.y<=r.y+r.height);
  const cancel=()=>{
   if(gesture)try{body.releasePointerCapture(gesture.id);}catch(_){}
   gesture=null;cancelGesture(null);for(const node of ghosts)node.remove();ghosts=[];
  };
  const pitchAt=p=>layout.kind==='keys'?layout.keys[Math.max(0,Math.min(layout.keys.length-1,Math.floor(p.y/18)))]:Math.max(0,Math.min(127,layout.high-Math.floor(p.y/18)));
  body.addEventListener('pointerdown',e=>{
   if(!active()||timeline.focus()!==l.laneId||e.button!==0||e.shiftKey||e.ctrlKey||e.metaKey)return;
   if(busy){e.preventDefault();return;}
   const p=point(e),h=hit(p);if(!h)return;
   e.preventDefault();
   const id=M.key(h.n);if(!selected().includes(id))timeline.selectKeys([id]);
   const s=ensure();if(!s)return;
   gesture={id:e.pointerId,p,keys:selected(),mode:h.r.width>12?(p.x-h.r.x<6?'start':h.r.x+h.r.width-p.x<6?'end':'move'):'move',moved:false};
   cancelGesture(cancel);
   try{body.setPointerCapture(e.pointerId);}catch(_){}
  });
  body.addEventListener('pointermove',e=>{
   if(!gesture||gesture.id!==e.pointerId)return;
   const p=point(e),dx=p.x-gesture.p.x,dy=p.y-gesture.p.y;
   if(Math.hypot(dx,dy)>=4)gesture.moved=true;
   if(!gesture.moved)return;
   if(!ghosts.length)for(const n of l.notes.filter(n=>gesture.keys.includes(M.key(n)))){
    const node=document.createElement('i');node.className='tl-edit-ghost';node.note=n;body.append(node);ghosts.push(node);
   }
   for(const node of ghosts){
    const r=rect(node.note),mode=gesture.mode,shift=mode==='move'?Math.round(dy/18)*18:0;
    Object.assign(node.style,{left:(r.x+(mode==='end'?0:dx))+'px',top:(r.y+shift-(point(e).y-(e.clientY-body.getBoundingClientRect().top)))+'px',
     width:Math.max(1,r.width+(mode==='start'?-dx:mode==='end'?dx:0))+'px',height:r.height+'px'});
   }
  });
  body.addEventListener('pointerup',e=>{
   if(!gesture||gesture.id!==e.pointerId)return;
   const g=gesture,p=point(e),dt=(p.x-g.p.x)/body.getBoundingClientRect().width*total;
   cancel();
   if(!g.moved)return;
   const dp=layout.kind==='keys'?pitchAt(p)-pitchAt(g.p):-Math.round((p.y-g.p.y)/18);
   change(m=>m.transform(g.keys,g.mode==='move'?{time:dt,pitch:dp}:g.mode==='start'?{start:dt}:{end:dt}),g.keys);
  });
  body.addEventListener('pointercancel',cancel);
  body.addEventListener('dblclick',e=>{
   if(!active()||busy||e.shiftKey||e.ctrlKey||e.metaKey)return;
   const p=point(e);if(hit(p))return;e.preventDefault();
   const s=ensure();if(!s)return;
   try{const id=s.model.add(p.x/body.getBoundingClientRect().width*total,pitchAt(p));apply(s,[id]);}
   catch(_){say('invalid');}
  });
 }
 const ERRORS=new Set(['revision-overlapping-notes','revision-note-shorter-than-one-tick','revision-no-change','revision-runtime-missing','midi-source-changed','midi-stale','analysis-busy']);
 return {preview,propose,applyShape,prepareMerge,setTrack:id=>{if(currentTrack!==id){clearShape();if($('midiEditSplitAt'))$('midiEditSplitAt').value='';draftRows=[];draftError=false;outputMessage='';message='';draftRequest++;}currentTrack=id;},refreshDrafts,exportMidi,hydrate,render,bind,attach,save,active,busy:()=>busy,dirty:()=>Boolean(session(lane())?.model.dirty()),flush:()=>pending};
}
root.XldMidiEditorControls={create};
})(globalThis);
