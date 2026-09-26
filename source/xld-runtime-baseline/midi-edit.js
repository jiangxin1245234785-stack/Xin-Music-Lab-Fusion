// Pure MIDI draft operations. Seconds stay unquantized; note identity never depends on sorting.
(function(root){
'use strict';
const copy=notes=>notes.map(n=>n.slice()),key=n=>n[4]+':'+n[5];
function validate(notes,duration,instrument){
 if(!notes.length)throw Error('empty');
 const ids=new Set();
 for(const n of notes){
  if(n.length!==6 || !n.every(Number.isFinite) || n[0]<0 || n[1]<=n[0] || n[1]>duration+1e-7 ||
    !Number.isInteger(n[2]) || n[2]<0 || n[2]>127 || !Number.isInteger(n[3]) || n[3]<1 || n[3]>127 ||
    n[4]!==instrument || !Number.isSafeInteger(n[5]) || n[5]<0 || ids.has(key(n)))throw Error('invalid');
  ids.add(key(n));
 }
}
function create(base,{duration,instrument,restored=null,minDuration=.005}){
 const original=copy(base),undo=[],redo=[];
 let notes=restored?copy(restored):copy(base),serial=Math.max(-1,...notes.map(n=>n[5]),...base.map(n=>n[5]))+1;
 validate(notes,duration,instrument);
 
 let revision=0;
 const minimum=Math.max(.005,Number(minDuration)||0);
 function picked(ids,count){
  const keys=[...new Set(ids)],list=notes.filter(n=>keys.includes(key(n))).sort((a,b)=>a[0]-b[0]||a[5]-b[5]);
  if(list.length!==keys.length||list.length<count)throw Error('join-count');
  return list;
 }
 function previewJoin(ids){
  const chosen=picked(ids,2),first=chosen[0],selected=new Set(chosen.map(key));
  if(chosen.some(n=>n[2]!==first[2]))throw Error('join-pitch');
  const same=notes.filter(n=>n[2]===first[2]).sort((a,b)=>a[0]-b[0]||a[5]-b[5]);
  const indices=chosen.map(n=>same.findIndex(p=>key(p)===key(n)));
  if(indices.at(-1)-indices[0]+1!==chosen.length)throw Error('join-neighbor');
  const end=Math.max(...chosen.map(n=>n[1])),start=first[0];
  if(same.some(n=>!selected.has(key(n))&&n[0]<end&&n[1]>start))throw Error('join-overlap');
  const result=[start,end,first[2],first[3],first[4],first[5]];
  return {kind:'join',revision,ids:chosen.map(key),notes:[result],keys:[key(result)],count:chosen.length,start,end,pitch:first[2],velocity:first[3]};
 }
 function previewSplit(id,at){
  const first=notes.find(n=>key(n)===id);
  if(!first)throw Error('split-one');
  if(!Number.isFinite(at)||at<=first[0]||at>=first[1])throw Error('split-inside');
  if(at-first[0]<minimum-1e-10||first[1]-at<minimum-1e-10)throw Error('split-short');
  // Splitting cannot make a pre-existing same-pitch overlap safe to serialize.
  if(notes.some(n=>key(n)!==id&&n[2]===first[2]&&n[0]<first[1]&&n[1]>first[0]))throw Error('join-overlap');
  const left=[first[0],at,...first.slice(2)],right=[at,first[1],first[2],first[3],instrument,serial];
  return {kind:'split',revision,ids:[id],at,notes:[left,right],keys:[key(left),key(right)],count:1,start:first[0],end:first[1],pitch:first[2],velocity:first[3]};
 }
 function commit(proposal){
  if(proposal?.revision!==revision)throw Error('shape-stale');
  const next=proposal.kind==='join'?previewJoin(proposal.ids):proposal.kind==='split'?previewSplit(proposal.ids[0],proposal.at):null;
  if(!next)throw Error('shape-stale');
  const remove=new Set(next.ids),updated=notes.filter(n=>!remove.has(key(n))).map(n=>n.slice()).concat(copy(next.notes));
  if(!changed(updated))return false;
  if(next.kind==='split')serial++;
  return next.keys;
 }

 const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const sorted=n=>n.sort((a,b)=>a[0]-b[0] || a[5]-b[5]);
 const changed=next=>{
  validate(next,duration,instrument);sorted(next);
  if(equal(notes,next))return false;
  undo.push(notes);if(undo.length>100)undo.shift();redo.length=0;notes=next;revision++;return true;
 };
 function transform(ids,{time=0,pitch=0,start=0,end=0}){
  const selected=notes.filter(n=>ids.includes(key(n)));if(!selected.length)return false;
  // Clamp the whole group as one, so intervals and timing relationships do not collapse at the edges.
  time=Math.max(-Math.min(...selected.map(n=>n[0])),Math.min(time,duration-Math.max(...selected.map(n=>n[1]))));
  pitch=Math.max(-Math.min(...selected.map(n=>n[2])),Math.min(Math.round(pitch),127-Math.max(...selected.map(n=>n[2]))));
  start=Math.max(-Math.min(...selected.map(n=>n[0])),Math.min(start,Math.min(...selected.map(n=>n[1]-n[0]-.005))));
  end=Math.max(-Math.min(...selected.map(n=>n[1]-n[0]-.005)),Math.min(end,duration-Math.max(...selected.map(n=>n[1]))));
  return changed(notes.map(n=>ids.includes(key(n))?[n[0]+time+start,n[1]+time+end,n[2]+pitch,n[3],n[4],n[5]]:n.slice()));
 }
 return {
  notes:()=>copy(notes),dirty:()=>!equal(notes,original),canUndo:()=>undo.length>0,canRedo:()=>redo.length>0,
  transform,previewJoin,previewSplit,commit,revision:()=>revision,minimum:()=>minimum,
  set:(id,values)=>changed(notes.map(n=>key(n)===id?[...values,n[4],n[5]]:n.slice())),
  add:(time,pitch)=>{const start=Math.max(0,Math.min(duration-.005,time));const n=[start,Math.min(duration,start+.25),Math.round(pitch),90,instrument,serial++];changed([...copy(notes),n]);return key(n);},
  remove:ids=>changed(notes.filter(n=>!ids.includes(key(n))).map(n=>n.slice())),
  undo:()=>{if(!undo.length)return false;redo.push(notes);notes=undo.pop();revision++;return true;},
  redo:()=>{if(!redo.length)return false;undo.push(notes);notes=redo.pop();revision++;return true;},
  reset:()=>changed(copy(original))
 };
}
const api={create,validate,key};if(typeof module==='object'&&module.exports)module.exports=api;root.XldMidiEdit=api;
})(globalThis);
