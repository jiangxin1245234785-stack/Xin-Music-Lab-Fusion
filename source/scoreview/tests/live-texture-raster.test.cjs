'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {mockCanvas,fullModel}=require('./helpers.cjs');
const program=fs.readFileSync(process.env.SCOREVIEW_CORE||path.join(__dirname,'../score-view.js'),'utf8');
function fixture(db){
  const model=fullModel();
  model.lanes.push({id:'texture',label:'其它',kind:'texture',group:'other',level:{hop:1,db:Array.from({length:60},(_,i)=>db+i%4)}});
  return model;
}
function rig(){
  const rasters=[];
  class BufferCanvas {
    constructor(w,h){
      this.width=w;this.height=h;this.record=mockCanvas(w,h);this.clears=[];
      this.context=this.record.canvas.getContext('2d');
      this.context.clearRect=(...args)=>this.clears.push(args);
      rasters.push(this);
    }
    getContext(type,opts){assert.equal(type,'2d');assert.equal(opts.willReadFrequently,true);return this.context;}
  }
  const env={OffscreenCanvas:BufferCanvas,devicePixelRatio:1.5};
  vm.runInNewContext(program,env);
  return {api:env.XinScoreView,rasters,env,BufferCanvas};
}

test('live band reuses a small aligned backing store, while defaults and disabling keep the direct path',()=>{
  const {api,rasters,env,BufferCanvas}=rig(),surface=mockCanvas(1132,647);
  assert.equal(api.DEFAULTS.liveTextureRaster,false);
  const opts={showTexture:true,drumNotation:true},view=api.create(surface.canvas,fixture(-23),()=>0,opts);
  view.draw(15);surface.reset();
  const oldStats=JSON.stringify(view.draw(15)),oldCalls=JSON.stringify(surface.calls);
  assert.equal(rasters.length,0);
  view.setOptions({liveTextureRaster:true});
  for(const t of [15,15.1,15.2]){
    surface.reset(); const stats=view.draw(t);
    if(t===15)assert.equal(JSON.stringify(stats),oldStats);
    const [blit]=surface.calls.filter(c=>c.name==='drawImage'&&c.args[0] instanceof BufferCanvas);
    assert.ok(blit);assert.equal(blit.args[2]%8,0);
    assert.equal(blit.args[0].width,surface.canvas.width);
    assert.ok(blit.args[0].height<surface.canvas.height/8);
    assert.equal(rasters.length,1);
  }
  assert.equal(rasters[0].clears.length,3);
  view.setOptions({liveTextureRaster:false});surface.reset();
  assert.equal(JSON.stringify(view.draw(15)),oldStats);
  assert.equal(JSON.stringify(surface.calls),oldCalls);
  view.setOptions({liveTextureRaster:true});surface.canvas.clientWidth=950;view.draw(15);
  assert.equal(rasters.length,2);env.devicePixelRatio=2;view.draw(15);assert.equal(rasters.length,3);
  view.setModel(fixture(-85));view.draw(15);assert.equal(rasters.length,3,'silent model needs no buffer');
  view.setModel(fixture(-14));view.draw(15);assert.equal(rasters.length,4);
  const other=api.create(mockCanvas(800,400).canvas,fixture(-24),()=>0,{...opts,liveTextureRaster:true});
  other.draw(15);assert.equal(rasters.length,5,'another view owns its own buffer');
});

test('XML enables live raster only on its listening view, leaving both export paths on the core default',()=>{
  const source=path.resolve(__dirname,'../..');
  const scene=fs.readFileSync(path.join(source,'fusion-runtime-baseline/score-scene.js'),'utf8');
  assert.equal((scene.match(/\bliveTextureRaster\s*:\s*true\b/g)||[]).length,1);
  for(const file of ['scoreview/export/export-main.cjs','scoreview/export/export-render.js','fusion-runtime-baseline/score-export-controls.js','fusion-runtime-baseline/desktop/score-export-ipc.cjs']){
    assert.doesNotMatch(fs.readFileSync(path.join(source,file),'utf8'),/\bliveTextureRaster\b/);
  }
});
