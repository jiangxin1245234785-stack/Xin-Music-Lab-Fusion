'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
class Element {
 constructor(tag='div'){this.tagName=tag;this.children=[];this.handlers={};this.dataset={};this.attrs={};this.disabled=false;this.checked=false;this._value='';this.textContent='';}
 get options(){return this.children;}
 get value(){return this._value;}
 set value(v){this._value=v;}
 append(...items){this.children.push(...items);}
 add(item){this.children.push(item);if(this.children.length===1)this._value=item.value;}
 replaceChildren(...items){this.children=items;if(this.tagName==='select')this._value=items[0]?.value||'';}
 setAttribute(k,v){this.attrs[k]=v;}
 addEventListener(name,fn){this.handlers[name]=fn;}
 async emit(name){if(name==='click' && this.disabled)throw Error('Disabled: '+this.id);return this.handlers[name]?.({target:this,type:name});}
}
const elements=new Map();
const get=id=>{if(!elements.has(id)){const e=new Element(id.endsWith('Select')?'select':'div');e.id=id;elements.set(id,e);}return elements.get(id);};
const context={document:{getElementById:get,createElement:tag=>new Element(tag)},localStorage:{getItem:()=>null,setItem:()=>{}},addEventListener:()=>{},Option:function(text,value){const e=new Element('option');e.textContent=text;e.value=value;return e;}};
vm.createContext(context);
for(const name of ['midi-batch.js','derived-controls.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',name),'utf8'),context);
const messages=require('../i18n/runtime-messages.js');
let locale='zh-CN';const rt=(key,params)=>messages.translateRuntime(locale,key,params);
const models=[{id:'basic-pitch',name:'Basic Pitch',stems:['bass','piano','guitar','strings'],available:true},...['bass','piano','guitar','drums'].map(stem=>({id:stem+'-model',name:stem+' model',stems:[stem],defaultFor:stem,available:true}))];
const stemModels=[{id:'roformer',name:'RoFormer',available:true,default:true},{id:'demucs',name:'Demucs',available:true}];
const makeMidi=(stem,engine,count=10)=>({ok:true,runId:stem+'-'+engine,engine,model:engine,noteCount:count});
function makeSource(runId='source-a'){
 const r={ok:true,runId,engine:runId==='source-a'?'roformer':'demucs',stems:['bass','piano','guitar','drums','other','vocals'].map(name=>({name,audioUrl:runId+'/'+name+'.wav'})),midi:{},variants:{},stemVariants:{},merged:{ok:false}};
 r.stemVariants[r.engine]={ok:true,runId};
 for(const stem of ['bass','piano','guitar','drums']){const m=makeMidi(stem,stem+'-model',stem==='drums'?0:10);r.midi[stem]=m;r.variants[stem]={[m.engine]:m};}
 r.variants.guitar['basic-pitch']=makeMidi('guitar','basic-pitch',7);
 r.variants.bass['basic-pitch']={...makeMidi('bass','basic-pitch',5),matches:false}; // Readable result of an earlier model version.
 return r;
}
let result=makeSource(),selected={id:'song-a',title:'Song A',fileUrl:'original.wav'},current=selected,busy=false,cancel=false,mode='success',resolveRun,holdRead=false,resolveRead;
const calls=[],reveals=[],played=[];let task;
const bridge={midiEngines:async()=>models,separationEngines:async()=>stemModels,readDerived:async()=>holdRead?new Promise(resolve=>{resolveRead=resolve;}):structuredClone(result),
 revealDerived:async(...args)=>{reveals.push(args);return {ok:true};},openMergedMidi:async()=>({ok:true}),
 async runDerived(trackId,kind,stem,force,engine){
  calls.push({trackId,kind,stem,force,engine});
  if(mode==='hold')return new Promise(resolve=>resolveRun=resolve);
  if(mode==='fail')return {ok:false,error:'analysis-failed',detail:'Fixture transcription failed'};
  if(kind==='midi'){const midi=result.variants[stem]?.[engine]||makeMidi(stem,engine);result.midi[stem]=midi;(result.variants[stem]??={})[engine]=midi;}
  return {ok:true,cached:!force};
 },
 async mergeMidi(trackId){calls.push({trackId,kind:'merge'});result.merged={ok:true,noteCount:30,parts:['bass','piano','guitar']};return {ok:true};}
};
const controls=context.XldDerivedControls.create({bridge,audio:{currentTime:12,paused:true},getSelected:()=>selected,getCurrent:()=>current,queueFor:()=>[],playTrack:async(...args)=>{played.push(args);controls.onPlayback(args[0],args[4]);},rt,getBusy:()=>busy,onTask:v=>{task=v;},onBatchState:()=>{},isBatchCancelled:()=>cancel});
const choose=async(id,value)=>{get(id).value=value;await get(id).emit('change');};
const selectModel=async id=>{const e=get('derivedModels').children.find(e=>e.dataset.midiEngine===id);assert(e,id);await e.emit('click');};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 await controls.refresh();controls.setView('midi');
 assert.equal(get('derivedSelect').value,'original');assert.equal(get('derivedMidiSelect').value,'bass');
 assert.deepEqual(get('derivedMidiSelect').options.map(o=>o.value),['bass','piano','guitar','drums']);
 assert(get('derivedMidiSource').textContent.includes('RoFormer'));assert(get('midiStringsLabel').textContent.includes('弦乐')); // Optional strings now have their own compact source field.
 assert(get('derivedModels').children.find(e=>e.dataset.midiEngine==='basic-pitch').children[1].children.some(e=>e.textContent.includes('旧模型版本')),'An earlier model version is labelled on its card');
 await selectModel('basic-pitch');assert(get('derivedStatus').textContent.includes('旧模型版本'));assert.equal(get('derivedTranscribe').textContent,rt('runtime.assets.transcribe'),'An earlier version is not offered as "use this MIDI"');
 assert(get('midiBatchPlan').children.find(e=>e.textContent.startsWith('bass')).textContent.includes('待生成'),'One-click does not reuse an earlier model version');
 await selectModel('bass-model');assert(get('midiBatchPlan').children.find(e=>e.textContent.startsWith('bass')).textContent.includes('复用'));
 await choose('derivedMidiSelect','guitar');assert.equal(played.length,0,'Choosing a transcription target does not start audio');
 controls.onPlayback(selected,'original.wav');assert.equal(get('derivedMidiSelect').value,'guitar','Original playback must not clear MIDI target');
 await choose('derivedSelect','other');await tick();assert.equal(get('derivedMidiSelect').value,'guitar');
 await get('derivedMidiAudition').emit('click');assert.equal(played.at(-1)[4],'source-a/guitar.wav');assert.equal(played.at(-1)[3],12);
 await selectModel('basic-pitch');assert.equal(result.midi.guitar.engine,'guitar-model','Preview card must not activate MIDI');
 assert(get('derivedStatus').textContent.includes('已保存'));assert(get('midiMergeParts').children.some(e=>e.textContent.includes('guitar model')));
 await get('derivedTranscribe').emit('click');assert.equal(calls.at(-1).stem,'guitar');assert.equal(result.midi.guitar.engine,'basic-pitch');
 controls.render();assert(get('derivedModels').children.find(e=>e.dataset.midiEngine==='basic-pitch').children[1].children.some(e=>e.textContent.includes('当前用于融合')));
 await get('derivedMidi').emit('click');assert.equal(reveals.at(-1)[1],'midi');assert.equal(reveals.at(-1)[2],'guitar');assert.equal(reveals.at(-1)[3],'basic-pitch');
 await choose('derivedMidiSelect','drums');assert(get('derivedStatus').textContent.includes('未检出音符'));assert(!get('derivedMidi').disabled);
 assert(get('midiMergeParts').children.find(e=>e.textContent.startsWith('drums')).textContent.includes('无音符'));
 await get('midiBatchFolder').emit('click');assert.equal(reveals.at(-1)[1],'midi-all');
 get('derivedForce').checked=true;await get('derivedForce').emit('change');assert(get('derivedForceLabel').textContent.includes('MIDI'));
 controls.setView('stems');assert(!get('derivedForce').checked,'MIDI force must not force expensive WAV generation');
 controls.setView('midi');assert(get('derivedForce').checked);get('derivedForce').checked=false;await get('derivedForce').emit('change');
 calls.length=0;await get('midiBatchRun').emit('click');assert.deepEqual(calls.map(x=>x.stem||'merge'),['bass','piano','guitar','drums','merge']);
 assert(calls.slice(0,4).every(c=>!c.force));assert(get('midiBatchStatus').textContent.includes('已就绪'));
 assert(get('midiBatchPlan').children.every(e=>e.textContent.includes('复用')));
 result=makeSource('source-b');result.variants={};result.midi={};await controls.refresh();
 assert(!get('midiBatchStatus').textContent.includes('已就绪'),'Completion must not follow a different WAV source');
 assert(get('midiBatchPlan').children.every(e=>e.textContent.includes('待生成')));assert(get('derivedMidiSource').textContent.includes('Demucs'));
 await choose('derivedMidiSelect','guitar');mode='fail';await get('derivedTranscribe').emit('click');assert(get('derivedStatus').textContent.includes('Fixture transcription failed'));
 result=makeSource();await controls.refresh();assert(!get('derivedStatus').textContent.includes('Fixture transcription failed'),'Failure must be source-specific');
 result=makeSource('source-b');result.variants={};result.midi={};await controls.refresh();assert(get('derivedStatus').textContent.includes('Fixture transcription failed'),'Returning to failed source retains explanation');
 mode='success';await get('derivedTranscribe').emit('click');assert(!get('derivedStatus').textContent.includes('Fixture transcription failed'));
 mode='hold';const generating=get('derivedTranscribe').emit('click');await tick();assert(get('derivedMidiSelect').disabled);result=makeSource();await controls.refresh();resolveRun({ok:false,error:'analysis-failed',detail:'Late failure from source b'});await generating;
 assert(!get('derivedStatus').textContent.includes('Late failure'),'Late result must not contaminate new source');
 mode='success';cancel=true;calls.length=0;await get('midiBatchRun').emit('click');assert.equal(calls.length,0);assert(get('midiBatchStatus').textContent.includes('取消'));assert(!get('midiBatchFolder').disabled);cancel=false;
 mode='hold';const finishing=get('derivedTranscribe').emit('click');await tick();holdRead=true;resolveRun({ok:true,cached:true});await tick();
 assert(get('derivedTranscribe').disabled,'Do not enable generation until the completed result has been read back');assert(controls.snapshot().pending);
 holdRead=false;resolveRead(structuredClone(result));await finishing;assert(!controls.snapshot().pending);mode='success';
 selected={id:'song-b',title:'Song B',fileUrl:'original-b.wav'};current=selected;result={ok:false,stems:[]};await controls.refresh();
 assert(get('derivedTranscribe').disabled);assert(get('midiBatchRun').disabled);assert(get('derivedMidiSelect').disabled);assert(!get('derivedForce').checked);
 result=makeSource();await controls.refresh();locale='en-US';controls.render();assert(get('derivedMidiSource').textContent.includes('Source:'));assert(get('derivedMidiSelectLabel').textContent.includes('Part'));
 assert(![...elements.values()].some(e=>e.textContent.includes('runtime.')),'No untranslated runtime keys');
 const strings={runId:'string-source-a',cacheKey:'a'.repeat(64),target:'strings',sourceStem:'other',duration:824,audioUrl:'strings-a.wav'};
 result=makeSource();result.strings={choices:[strings],active:null};
 bridge.selectStringsSource=async(_track,value)=>{result.strings.active=value?strings:null;result.midiInputs={...Object.fromEntries(result.stems.map(s=>[s.name,{runId:result.runId,audioUrl:s.audioUrl}])),...(value?{strings}:{})};result.midiSourceKey=JSON.stringify([result.runId,value?.runId||null]);return {ok:true};};
 await controls.refresh();assert(!get('derivedMidiSelect').options.some(o=>o.value==='strings'),'String part requires explicit inclusion');
 await choose('midiStringsSource',strings.runId);assert.equal(get('derivedMidiSelect').value,'strings');assert(!get('derivedTranscribe').disabled);
 await get('derivedMidiAudition').emit('click');assert.equal(played.at(-1)[4],strings.audioUrl);
 calls.length=0;await get('derivedTranscribe').emit('click');assert.equal(calls.at(-1).stem,'strings');assert.equal(calls.at(-1).engine,'basic-pitch');
 calls.length=0;await get('midiBatchRun').emit('click');assert.deepEqual(calls.map(c=>c.stem||'merge'),['bass','piano','guitar','drums','strings','merge']);
 result.ok=false;result.stems=[];result.midiInputs={strings};result.midi={strings:makeMidi('strings','basic-pitch')};result.variants={strings:{'basic-pitch':result.midi.strings}};result.midiSourceKey='strings-only';await controls.refresh();
 calls.length=0;assert(!get('midiBatchRun').disabled);await get('midiBatchRun').emit('click');assert.deepEqual(calls.map(c=>c.stem),['strings']);assert(get('midiBatchStatus').textContent.includes('Fewer than two'));
 result.strings={choices:[],active:null,unavailable:true};result.midiInputs={};await controls.refresh();assert(!get('midiStringsSource').disabled,'A stale source can be cleared');
 await choose('midiStringsSource','');assert.equal(result.strings.active,null);
 console.log('Derived flow PASS: independent MIDI target, audition, activation, empty notes, source-scoped tasks, batch reuse/cancel, force isolation, directories and bilingual UI');
})().catch(error=>{console.error(error);process.exitCode=1;});

