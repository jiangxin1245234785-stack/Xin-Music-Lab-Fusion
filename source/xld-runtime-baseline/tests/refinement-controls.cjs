// Controller contract test with a minimal DOM; no browser or desktop automation.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
class Element{
 constructor(tag='div'){this.tagName=tag;this.value='';this.disabled=false;this.hidden=false;this.children=[];this.dataset={};this.attrs={};this.handlers={};this.textContent='';this.paused=true;this.currentTime=0;this.duration=824;}
 get options(){return this.children;}
 append(...items){this.children.push(...items);}
 replaceChildren(){this.children=[];}
 setAttribute(k,v){this.attrs[k]=v;}
 removeAttribute(k){delete this.attrs[k];if(k==='src')delete this.src;}
 addEventListener(name,fn){this.handlers[name]=fn;}
 dispatchEvent(event){this.handlers[event.type]?.(event);}
 pause(){this.paused=true;}
 load(){}
 async play(){this.paused=false;this.onloadedmetadata?.();this.handlers.play?.();}
}
const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
for(const [id,values] of [['refinementMode',['full','preview']],['refinementDevice',['auto','cuda','cpu']]])for(const value of values){const e=new Element('option');e.value=value;get(id).append(e);}
get('refinementStart').value='90';
const buttons=['original','target','residual'].map(name=>{const e=new Element('button');e.dataset.refinementAudio=name;return e;});
const document={getElementById:get,createElement:tag=>new Element(tag),documentElement:{lang:'zh-CN'},querySelectorAll:()=>buttons};
const storage=new Map(),localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
const context={document,localStorage,MutationObserver:class{observe(){}},Event:class{constructor(type){this.type=type;}}};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../refinement-controls.js'),'utf8'),context);
const models=require('../analysis-refine/profiles.json').map(p=>({...p,available:true,...(p.id==='mega-53'?{targetDetails:require('../analysis-refine/mega-targets.json')}:{})}));let hasStems=true;let selected={id:'song'},task=null,busy=false,runRequest=null,revealed=null,cancelled=null,resolveRun;
const replies=p=>({ok:true,runId:p.scope==='full'?'whole':'preview',timeOrigin:p.scope==='full'?0:p.start,duration:p.scope==='full'?824:30,kept:false,backend:{device:'cuda'},playback:{gain:.8},urls:{target:'safe-target.wav',original:'safe-other.wav',residual:'safe-residual.wav'}});
const reads=[],bridge={refinementEngines:async()=>models,readRefinement:async p=>{reads.push(p);return replies(p);},runRefinement:p=>{runRequest=p;busy=true;task={engine:p.engine,trackId:p.trackId,cancellable:true,taskId:'active'};return new Promise(resolve=>{resolveRun=resolve;});},cancelAnalysis:async id=>{cancelled=id;busy=false;resolveRun({ok:false,error:'analysis-cancelled',task:null});},keepRefinement:async p=>({...replies(p),kept:true}),revealRefinement:async p=>{revealed=p;return {ok:true};}};
const audio=new Element('audio'),controls=context.XldRefinementControls.create({bridge,getSelected:()=>selected,getCurrent:()=>selected,getDerived:()=>({trackId:selected?.id,result:{ok:hasStems,runId:hasStems?'parent':null,stems:hasStems?[{name:'other'},{name:'guitar'}]:[]}}),getTask:()=>task,getBusy:()=>busy,audio,rt:(k,p)=>k+JSON.stringify(p||{}),onTask:value=>{task=value;}});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 await flush();controls.update();await flush();assert.equal(reads.at(-1).engine,'mega-53');assert.equal(reads.at(-1).scope,'full');assert(get('refinementStartField').hidden);assert(!get('refinementFolder').disabled);
 await get('refinementFolder').onclick();assert.equal(revealed.scope,'full');
 const switchScope=value=>{get('refinementMode').value=value;get('refinementMode').dispatchEvent(new context.Event('change'));};
 switchScope('preview');await flush();assert.equal(reads.at(-1).scope,'preview');assert(!get('refinementStartField').hidden);
 const choose=id=>get('refinementModels').children.find(e=>e.dataset.refinementEngine===id).onclick();
 choose('bowed-strings-v2');await flush();assert(get('refinementMode').disabled);assert.equal(reads.at(-1).scope,'preview');
 choose('mega-53');await flush();assert(!get('refinementMode').disabled);switchScope('full');await flush();
 get('refinementStart').value='not-a-number';controls.update();assert(!get('refinementRun').disabled,'hidden preview start must not block whole track');
 const running=get('refinementRun').onclick();await flush();controls.update();assert.equal(runRequest.scope,'full');assert(get('refinementMode').disabled);assert(!get('refinementCancel').disabled);
 await get('refinementCancel').onclick();await running;assert.equal(cancelled,'active');assert(!get('refinementRun').disabled);assert(!get('refinementFolder').disabled,'existing result survives cancellation');
 await get('refinementKeep').onclick();assert(get('refinementKeep').disabled);
 get('refinementAudio').currentTime=120;buttons[1].onclick();await flush();assert.equal(get('refinementAudio').src,'safe-target.wav');assert.equal(get('refinementAudio').currentTime,120);assert(audio.paused);
 const select=async(id,value)=>{get(id).value=value;get(id).dispatchEvent(new context.Event('change'));await flush();};
 await select('refinementGroup','guitar');assert.equal(get('refinementTarget').options.length,10);
 await select('refinementTarget','electric-guitar');assert.equal(reads.at(-1).target,'electric-guitar');
 await select('refinementGroup','all');assert.equal(get('refinementTarget').options.length,53);
 await select('refinementSource','mix');hasStems=false;controls.update();await flush();assert(!get('refinementRun').disabled,'mix does not require six stems');assert.equal(reads.at(-1).sourceStem,'mix');
 await get('refinementFolder').onclick();assert.equal(revealed.sourceStem,'mix');
 choose('bowed-strings-v2');await flush();assert(get('refinementSource').disabled);assert(get('refinementRun').disabled,'other model requires other');
 choose('mega-53');await flush();assert.equal(get('refinementSource').value,'mix');assert(!get('refinementRun').disabled);
 await select('refinementSource','guitar');assert(get('refinementRun').disabled);hasStems=true;controls.update();await flush();assert(!get('refinementRun').disabled);assert.equal(reads.at(-1).sourceStem,'guitar');
 selected=null;controls.update();await flush();assert(get('refinementResult').hidden);assert(get('refinementAudio').paused);
 console.log('Refinement controller PASS: default/full/preview, model capabilities, safe audition, keep/folder, cancel and track clearing');
})().catch(error=>{console.error(error);process.exitCode=1;});
