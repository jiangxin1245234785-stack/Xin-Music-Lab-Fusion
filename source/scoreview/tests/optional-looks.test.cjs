'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {ScoreView,mockCanvas,fullModel}=require('./helpers.cjs');
const keys=['releaseFocus','spacedLanes','softCover','attackWeight','weakNoteHints','balancedLanes'];
const patch=(value)=>Object.fromEntries(keys.map(key=>[key,value]));

test('each optional appearance accepts only booleans and remains local to one view',()=>{
  const normal=ScoreView.create(mockCanvas().canvas,fullModel(),()=>10);
  const changed=ScoreView.create(mockCanvas().canvas,fullModel(),()=>10);
  for(const key of keys){
    assert.equal(ScoreView.DEFAULTS[key],false,key);assert.equal(normal.options()[key],false,key);
    changed.setOptions({[key]:true});changed.setOptions({[key]:'false'});
    assert.equal(changed.options()[key],true,key);assert.equal(normal.options()[key],false,key);
    changed.setOptions({[key]:false});assert.equal(changed.options()[key],false,key);
  }
  normal.destroy();changed.destroy();
});

test('switching all looks off restores pitched notes, drum hits and their original positions',()=>{
  const model=fullModel(),source=JSON.stringify(model);
  const make=()=>{const surface=mockCanvas(946,368);const view=ScoreView.create(surface.canvas,model,()=>10,
    {quietText:true,drumNotation:true,showShapes:true,shapeSet:'spindle',mergeTimbres:false});
    return {surface,view};};
  const normal=make(),changed=make();
  const eventCounts=f=>[f.time,f.lanes,f.notes,f.hits,f.active,f.chord,f.section];
  normal.view.draw(9);changed.view.draw(9);
  changed.view.setOptions(patch(true));
  for(const start of [9.05,10.03,11.81,10.03]){
    const original=normal.view.draw(start),on=changed.view.draw(start);
    assert.deepEqual(eventCounts(on),eventCounts(original),String(start));
  }
  assert.ok(changed.surface.calls.some(command=>command.name==='clip'),'row clipping actually reached the canvas');
  changed.view.setOptions(patch(false));
  for(const start of [10.03,11.81]){
    normal.surface.reset();changed.surface.reset();
    assert.deepEqual(changed.view.draw(start),normal.view.draw(start));
    // The mock attaches its own function to each gradient; only its stops and coordinates are paint state.
    assert.equal(JSON.stringify(changed.surface.calls),JSON.stringify(normal.surface.calls));
  }
  assert.equal(JSON.stringify(model),source,'raw model changed when switching appearance');
  normal.view.destroy();changed.view.destroy();
});

test('weak piano hints preserve every note and require measured local piano energy',()=>{
  const model=fullModel();
  model.lanes=[{id:'piano',kind:'pitched',label:'Piano',group:'piano',
    notes:[[5,.06,60,24],[6,.06,62,24],[7,.4,64,88]]}];
  const piano=Array(600).fill(-28);piano.fill(-86,48,54);
  model.levels={hop:.1,groups:{piano}};
  const view=ScoreView.create(mockCanvas().canvas,model,()=>6,{simplify:false,weakNoteHints:true});
  const frame=view.draw(6);
  assert.equal(frame.notes,3);assert.equal(frame.weakNotes,1);
  view.setOptions({weakNoteHints:false});
  assert.equal(view.draw(6).weakNotes,undefined);
  view.setModel({...model,levels:{hop:.1,groups:{strings:piano}}});view.setOptions({weakNoteHints:true});
  const missing=view.draw(6);assert.equal(missing.notes,3);assert.equal(missing.weakNotes,undefined);
  view.destroy();
});

test('the soft cover follows a reused Image element, a repainted canvas and clearing the cover',()=>{
  const saved=globalThis.OffscreenCanvas;
  globalThis.OffscreenCanvas=class {
    constructor(width,height){this.width=width;this.height=height;}
    getContext(){return {filter:'none',drawImage(){},getImageData:()=>({data:new Uint8ClampedArray(64*64*4)})};}
  };
  const surface=mockCanvas(),view=ScoreView.create(surface.canvas,fullModel(),()=>10,{softCover:true});
  function picture(){surface.reset();view.draw(10);return surface.calls.find(call=>call.name==='drawImage')?.args[0];}
  try {
    const image={width:60,height:60,currentSrc:'local:first'};
    view.setCover(image);const first=picture();assert.ok(first&&first!==image);
    view.setOptions({softCover:false});assert.equal(picture(),image);
    view.setOptions({softCover:true});assert.equal(picture(),first);
    image.currentSrc='local:second';view.setCover(image);assert.notEqual(picture(),first);
    const mutable={width:60,height:60};view.setCover(mutable);const previous=picture();
    view.setCover(mutable);assert.notEqual(picture(),previous);
    view.setCover(null);assert.equal(picture(),undefined);
  } finally {
    view.destroy();
    if(saved===undefined)delete globalThis.OffscreenCanvas;else globalThis.OffscreenCanvas=saved;
  }
});
