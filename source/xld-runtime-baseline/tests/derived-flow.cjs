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
let mergeGuard=()=>({ok:true});
const controls=context.XldDerivedControls.create({beforeMerge:(...args)=>mergeGuard(...args),bridge,audio:{currentTime:12,paused:true},getSelected:()=>selected,getCurrent:()=>current,queueFor:()=>[],playTrack:async(...args)=>{played.push(args);controls.onPlayback(args[0],args[4]);},rt,getBusy:()=>busy,onTask:v=>{task=v;},onBatchState:()=>{},onMidiActivated:()=>{activated++;},isBatchCancelled:()=>cancel});
let activated=0;
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
 // --- model versions: the list is a sibling of the engine cards, collapsed, and fetched only when opened --------
 const versionRuns=[
  {runId:'run-current-0001',engine:'basic-pitch',model:'basic-pitch-0.4.0-onnx',noteCount:42,createdAt:'2026-09-19T02:00:00.000Z',pointed:['active'],status:'current',active:true,kept:false},
  {runId:'run-older-00002',engine:'basic-pitch',model:'basic-pitch-0.3.0-onnx',noteCount:39,createdAt:'2026-09-18T02:00:00.000Z',pointed:[],status:'superseded',active:false,kept:true},
  {runId:'run-gone-000003',engine:'basic-pitch',model:'basic-pitch-0.3.0-onnx',noteCount:0,createdAt:'2026-09-17T02:00:00.000Z',pointed:[],status:'files-missing',active:false,kept:false}];
 const versionCalls=[];
 // A hand-edited revision belongs to no model, so the panel asks for revisions separately and always.
 const revisionRun={runId:'run-manual-00004',engine:'manual-revision',model:'manual-revision-v1',noteCount:7,createdAt:'2026-09-20T03:00:00.000Z',pointed:['midi/guitar/manual-revision.json'],status:'superseded',active:false,kept:false};
 bridge.listMidiRuns=async payload=>{versionCalls.push({call:'list',...payload});return {ok:true,runs:payload.engine==='manual-revision'?[revisionRun]:versionRuns};};
 bridge.activateMidiRun=async payload=>{versionCalls.push({call:'activate',...payload});return {ok:true,runId:payload.runId,matches:false};};
 bridge.keepMidiRun=async payload=>{versionCalls.push({call:'keep',...payload});return {ok:true};};
 const versionsBlock=get('derivedMidiVersionsBlock'),versionsList=get('derivedMidiVersions');
 controls.render();
 assert.equal(versionsList.children.length,0,'a collapsed version list draws nothing');
 assert.equal(versionCalls.length,0,'and costs no IPC on every render');
 versionsBlock.open=true;await versionsBlock.emit('toggle');await tick();await tick();
 // Two queries, not one: the selected model's runs, and the revisions that belong to no model. Without the
 // second the user's own edits would have no row, and therefore no way to switch back to them and no 保留 button.
 assert.deepEqual(versionCalls.map(c=>c.call),['list','list'],'opening it fetches the model runs and the revisions');
 assert.deepEqual(versionCalls.map(c=>c.engine),['basic-pitch','manual-revision']);
 for(const call of versionCalls)assert.equal(call.stem,'guitar');
 const versionRows=versionsList.children.filter(e=>String(e.className||'').startsWith('version-row'));
 assert.equal(versionRows.length,3,'a files-missing run is never an actionable row, but a revision is');
 // A revision is superseded forever, so the plain status word would call the user's own work 旧版本 and leave it
 // indistinguishable from an obsolete draft. It also carries no model, so no model name may be printed on it.
 const revisionRow=versionRows.find(e=>e.dataset.engine==='manual-revision');
 assert(revisionRow,'the revision has a row');
 assert(revisionRow.children[0].children.map(e=>e.textContent).includes('人工修订'),revisionRow.children[0].children.map(e=>e.textContent).join('|'));
 assert(!revisionRow.children[0].children.some(e=>e.textContent.includes('旧版本')),'and is not labelled as an old version');
 assert(!revisionRow.children[0].children.some(e=>e.textContent==='manual-revision-v1'),'nor with a model string');
 assert(!Object.fromEntries(revisionRow.children[1].children.map(e=>[e.dataset.versionAction,e])).switch.disabled,'it can be switched to');
 assert(versionsList.children.some(e=>e.textContent.includes('回收站')),'it collapses into one footer line instead');
 assert(versionsList.children.at(-1).textContent.includes('保留'),'the footer states the retention rule');
 const cells=row=>row.children[0].children.map(e=>e.textContent);
 const modelRows=versionRows.filter(e=>e.dataset.engine!=='manual-revision');
 assert(cells(modelRows[0]).includes('正在使用')&&cells(modelRows[0]).includes('当前版本'),cells(modelRows[0]).join('|'));
 assert(cells(modelRows[1]).includes('旧版本')&&cells(modelRows[1]).includes('已保留'),cells(modelRows[1]).join('|'));
 // The model string is what tells two versions apart; the uuid only ever appears in the tooltip.
 assert(cells(modelRows[1]).includes('basic-pitch-0.3.0-onnx'));
 assert(modelRows[1].title.startsWith('run-olde'),modelRows[1].title);
 const buttons=row=>Object.fromEntries(row.children[1].children.map(e=>[e.dataset.versionAction,e]));
 assert(buttons(modelRows[0]).switch.disabled,'the run already in use cannot be switched to');
 assert(buttons(modelRows[1]).delete.disabled,'a kept run must be unpinned before it can be deleted');
 assert.equal(buttons(modelRows[1]).keep.textContent,'取消保留');
 await buttons(modelRows[1]).switch.emit('click');await tick();await tick();
 assert.deepEqual(versionCalls.filter(c=>c.call==='activate'),[{call:'activate',trackId:selected.id,stem:'guitar',engine:'basic-pitch',runId:'run-older-00002'}]);
 assert.equal(activated,1,'switching redraws the timeline, which reads the active pointer');
 assert(versionsList.children.at(-1).textContent.includes('已切换到'),'and says so');
 await buttons(modelRows[1]).reveal.emit('click');
 assert.deepEqual(reveals.at(-1).slice(1),['midi','guitar','basic-pitch','run-older-00002'],'the folder button opens that version');
 versionCalls.length=0;versionsBlock.open=false;await versionsBlock.emit('toggle');await tick();
 assert.equal(versionsList.children.length,0,'closing it clears the list again');
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
 mergeGuard=()=>({ok:false,error:'merge-draft-pending'});
 calls.length=0;await get('midiMergeRun').emit('click');
 assert(!calls.some(c=>c.kind==='merge'),'ordinary merge waits for draft guard');
 assert(get('midiMergeStatus').textContent.includes('merge-draft-pending'));
 calls.length=0;await get('midiBatchRun').emit('click');
 assert(!calls.some(c=>c.kind==='merge'),'one-click final merge uses same guard');
 assert(get('midiBatchStatus').textContent.includes('merge-draft-pending'));
 let releaseGuard;mergeGuard=()=>new Promise(resolve=>{releaseGuard=resolve;});
 calls.length=0;const delayedMerge=get('midiMergeRun').emit('click');await tick();
 assert(!calls.some(c=>c.kind==='merge'),'pending draft persistence is awaited');
 releaseGuard({ok:true});await delayedMerge;assert(calls.some(c=>c.kind==='merge'));
 mergeGuard=()=>({ok:true});
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
 console.log('Derived flow PASS: independent MIDI target, audition, activation, empty notes, source-scoped tasks, batch reuse/cancel, force isolation, version list and switching, directories and bilingual UI');
})().catch(error=>{console.error(error);process.exitCode=1;});

