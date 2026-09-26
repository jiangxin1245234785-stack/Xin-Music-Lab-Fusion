// View-only ordering and folding; canonical MIDI lanes never move or merge.
(function(root){
'use strict';
const unique=a=>[...new Set((Array.isArray(a)?a:[]).filter(x=>typeof x==='string'))];
function ordered(items,ids,key=x=>x.id){const rank=new Map(unique(ids).map((id,i)=>[id,i]));return items.slice().sort((a,b)=>(rank.get(key(a))??Infinity)-(rank.get(key(b))??Infinity));}
function moved(ids,from,to,after=false){if(from===to||!ids.includes(from)||!ids.includes(to))return ids.slice();const out=ids.filter(id=>id!==from);out.splice(out.indexOf(to)+(after?1:0),0,from);return out;}
function create(saved){
 let state={order:[],children:{},collapsed:{}};
 if(saved&&typeof saved==='object'){state.order=unique(saved.order);for(const [k,v] of Object.entries(saved.children||{}))state.children[k]=unique(v);for(const [k,v] of Object.entries(saved.collapsed||{}))if(typeof v==='boolean')state.collapsed[k]=v;}
 return {snapshot:()=>JSON.parse(JSON.stringify(state)),ordered:(items,key)=>ordered(items,state.order,key),
   children:(stem,items)=>ordered(items,state.children[stem],x=>x.laneId),
   collapsed:stem=>state.collapsed[stem]!==false,fold:(stem,value)=>{state.collapsed[stem]=Boolean(value);},
   move:(ids,from,to,after,parent=null)=>{const next=moved(ids,from,to,after);if(parent)state.children[parent]=next;else state.order=next;return next;}
 };
}
const api={create,ordered,moved};if(typeof module==='object'&&module.exports)module.exports=api;root.XldTrackLayout=api;
})(globalThis);
