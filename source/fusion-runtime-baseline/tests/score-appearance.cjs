'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const names = ['releaseFocus','spacedLanes','softCover','balancedLanes','attackWeight','weakNoteHints'];
const expected = {original:[false,false,false,false,false,false], clear:[true,true,true,true,false,false], detail:[true,true,true,true,true,true]};
const storageKey = 'xin-score-appearance';
const source = fs.readFileSync(path.join(root,'score-scene.js'),'utf8');

function page(storage = new Map()) {
  const elements = new Map(), covers = [], images = [], options = {};
  function element() {
    const events = new Map();
    return {style:{}, dataset:{}, classList:{add(){},contains(){return false;}}, addEventListener:(t,f)=>events.set(t,f),
      change(value){this.value=value;events.get('change')();}, append(){}, appendChild(){}, querySelectorAll:()=>[],
      getContext:()=>({}), options:[], clientWidth:800, clientHeight:400};
  }
  for(const name of ['scoreAppearance','scoreEffects','scoreSimplify']) elements.set(name,element());
  const stage=element(); let observe;
  const host = {localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},
    document:{documentElement:{lang:'zh-CN'}, getElementById:k=>elements.get(k), querySelector:()=>null, createElement:element},
    Image:class {constructor(){images.push(this);}}, CustomEvent:class{}, dispatchEvent(){}, addEventListener(){},removeEventListener(){},
    MutationObserver:class {constructor(f){observe=f;}observe(){}disconnect(){}}, setTimeout(){}, requestAnimationFrame:()=>0,cancelAnimationFrame(){},
    performance:{now:()=>0}, XinMediaClock:{create:()=>({now:()=>0,destroy(){}})},
    XinScoreView:{create(_canvas,_model,_clock,initial){Object.assign(options,initial);return {setOptions:o=>Object.assign(options,o),
        setModel(){},setCover:im=>covers.push(im),options:()=>({...options}),lanes:()=>[],layers:()=>({}),lastFrame:()=>({})};}}};
  vm.runInNewContext(source,host);
  const scene=host.XinScoreScene.create({stage,canvas:element(),audio:element(),bridge:{scoreModel:async id=>({ok:true,model:{track:{duration:50},
    lanes:[],cover:id==='none'?null:{src:id},audio:{}}})}});
  return {scene,storage,options,images,covers,stage,select:(id,val)=>elements.get(id).change(val),
    current:()=>elements.get('scoreAppearance').value, read:()=>names.map(k=>options[k]),
    effect:val=>{stage.dataset.effect=val;observe();}};
}

test('new device, previous settings, invalid preference and stored styles',async()=>{
  for(const [raw,want] of [[null,'clear'],['legacy','clear'],...Object.keys(expected).map(n=>[n,n])]){
    const storage=new Map([['xin-score-effects','ink'],['xin-score-reading','{"mergeTimbres":false,"simplify":true}']]);
    if(raw!==null)storage.set(storageKey,raw);
    const p=page(storage);assert.equal(p.current(),want);await p.scene.load('a');
    assert.deepEqual(p.read(),expected[want]);assert.equal(p.options.fxPreset,'ink');assert.equal(p.options.mergeTimbres,false);
    assert.equal(p.options.quietText,true);assert.equal(p.options.drumNotation,true);
  }
});

test('style switches clear prior flags and leave cover, lighting, source and device preference consistent',async()=>{
  const p=page();await p.scene.load('a');
  p.select('scoreEffects','keys');
  const old=p.images.at(-1);await p.scene.load('b'); const current=p.images.at(-1);
  old.onload();assert.ok(!p.covers.includes(old));current.onload();assert.equal(p.covers.at(-1),current);
  for(const name of ['detail','clear','detail','original','detail']){
    p.select('scoreAppearance',name);assert.equal(p.scene.status().appearance,name);assert.deepEqual(p.read(),expected[name]);
    assert.equal(p.storage.get(storageKey),name);assert.equal(p.options.fxPreset,'keys');assert.equal(p.covers.at(-1),current);
  }
  p.select('scoreAppearance','invalid');assert.equal(p.scene.status().appearance,'detail');assert.equal(p.storage.get(storageKey),'detail');
  p.effect('score');p.effect('spectrum');p.effect('score');assert.deepEqual(p.read(),expected.detail);
  await p.scene.load('none');current.onload();assert.equal(p.covers.at(-1),null);
  const next=page(p.storage);await next.scene.load('a');assert.deepEqual(next.read(),expected.detail);assert.equal(next.options.fxPreset,'keys');
});

test('all three styles are in the score reading drawer and have complete labels in both languages',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),i18n=fs.readFileSync(path.join(root,'i18n/catalogs.js'),'utf8');
  const select=html.match(/<select id="scoreAppearance">([\s\S]*?)<\/select>/)[1];
  assert.ok(html.indexOf('data-i18n="score.options"')<html.indexOf(select)&&html.indexOf(select)<html.indexOf('id="scoreMergeTimbres"'));
  for(const [name,en,zh] of [['Original','Original','原版'],['Clear','Clear','清晰'],['Detail','Detailed','细读']]){
    assert.ok(select.includes(`value="${name.toLowerCase()}" data-i18n="score.appearance${name}"`));
    for(const label of [en,zh])assert.ok(i18n.includes(`'score.appearance${name}': '${label}'`));
  }
});
