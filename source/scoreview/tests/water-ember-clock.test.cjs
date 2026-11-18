'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {mockCanvas}=require('./helpers.cjs');
function rig(style,notes=[[1,12,48,96],[16,.4,52,90]],width=1280,displayNotes=notes){
  const buffers=[];
  function make(){
    const record=mockCanvas(1280,720),context=record.canvas.getContext('2d');
    for(const name of ['clearRect','translate','scale'])context[name]=(...args)=>record.calls.push({name,args});
    context.getImageData=()=>({data:new Uint8ClampedArray(4)});context.putImageData=()=>{};
    buffers.push(record);return record.canvas;
  }
  const target=make();target.clientWidth=width;target.ownerDocument={createElement:make};
  const lane={id:'bass',kind:'pitched',group:'bass',notes},box={lane,top:60,height:540};
  const model={track:{id:'clock',duration:Math.max(40,...notes.map(n=>n[0]+n[1]))},lanes:[lane]};
  const part={voice:'bow',set:{count:displayNotes.length,start:displayNotes.map(n=>n[0]),dur:displayNotes.map(n=>n[1]),pitch:displayNotes.map(n=>n[2]),vel:displayNotes.map(n=>n[3])}};
  const source={canvas:target,unit:1,top:0,view:{
    layoutSnapshot:()=>({needle:800*width/1280,pixelsPerSecond:140}),swellAt:()=>.5,
    materialFrame:time=>({frame:{time},geometry:{side:16,lanes:[box]},yAt:(_box,pitch)=>280-(pitch-48)*8,contourYAt:(_box,pitch)=>280-(pitch-48)*8,parts:()=>[part]})
  }};
  const env={XinScoreView:{canonicalOnsets:rows=>rows}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../score-surface.js'),'utf8'),env);
  const options={scoreStyle:style,fxDynamics:'off',hidden:[]};
  const view=env.XinScoreSurface.create(target,model,()=>0,options,()=>source);
  const ink=buffers[1];
  const draw=time=>{for(const buffer of buffers)buffer.calls.length=0;const stats=view.draw(time);
    const calls=ink.calls.filter(call=>/^(stroke|fill|fillRect|fillText|moveTo|lineTo|quadraticCurveTo|bezierCurveTo|ellipse)$/.test(call.name))
      .map(({name,args,strokeStyle,fillStyle,alpha,lineWidth})=>[name,args,
        name==='stroke'?strokeStyle:name.startsWith('fill')?fillStyle:null,alpha,lineWidth]);
    return {stats,calls:JSON.stringify(calls),ink:ink.calls};};
  draw(0);return {draw,view,options,buffers,part};
}
function paths(frame,name,predicate){
  const found=[];let points=[];
  for(const call of frame.ink){
    if(call.name==='beginPath')points=[];
    if(call.name==='moveTo'||call.name==='lineTo')points.push(call.args);
    if(call.name===name&&predicate(name==='fill'?call.fillStyle:call.strokeStyle))found.push(points);
  }
  return found;
}
const diffusion=frame=>paths(frame,'fill',style=>style?.stops?.some(([,color])=>color.startsWith('rgba(128,163,190,')));
const core=frame=>paths(frame,'stroke',style=>style?.stops?.some(([,color])=>color.startsWith('rgba(148,176,194,')));
const future=frame=>paths(frame,'stroke',style=>style==='rgba(148,176,194,.66)');

test('night-water broadens a single held note around its actual pitch and seeks deterministically',()=>{
  const {draw}=rig('water');
  const first=draw(4.5);
  const bands=diffusion(first);
  assert.equal(bands.length,first.stats.water.layers);
  const widest=bands[0], paired=widest.slice(0,widest.length/2);
  for(const [i,[x,y]] of paired.entries()){
    const match=widest.at(-1-i);
    assert.equal(match[0],x);
    assert.ok(Math.abs(y+match[1]-560)<1e-6,'each width straddles the original pitch');
  }
  assert.ok(core(first).every(points=>points.every(([x,y])=>x>=800-.43*140&&y===280)),'bright core has a short fade, then only diffusion');
  const profiles=first.stats.water.profiles;
  assert.ok(profiles[3].width>profiles[0].width*3);
  assert.ok(profiles[3].peak>.07&&profiles[3].core===0,'old diffusion remains visible before its edge fade');
  draw(11.3);draw(.12);assert.equal(draw(4.5).calls,first.calls,'seeking cannot leave accumulated history');
  const fresh=rig('water').draw(4.5);assert.equal(fresh.calls,first.calls,'direct export and stepped playback use identical paint');
});
test('night-water joins the incoming line to diffusion at the needle on the same pitch',()=>{
  const {draw}=rig('water',[[1,12,48,96]]),frame=draw(1.12);
  assert.deepEqual(core(frame)[0].at(-1),[800,280]);
  assert.deepEqual(future(frame)[0][0],[800,280]);
  assert.ok(diffusion(frame).every(points=>points.some(([x])=>x===800)));
});
test('old sustained dense chords sample visible history once across each width band',()=>{
  const notes=Array.from({length:24},(_,i)=>[0,400,36+i,85]);
  const count=frame=>diffusion(frame).reduce((total,points)=>total+points.length,0);
  const wide=rig('water',notes),narrow=rig('water',notes,640);
  const wideFrame=wide.draw(200),narrowFrame=narrow.draw(200);
  assert.ok(count(wideFrame)<24*5*140,'very old note heads do not expand the scan to the full note duration');
  assert.ok(count(narrowFrame)<count(wideFrame)*.6,'narrow views reduce sample count with their visible history');
  const canvasCount=wide.buffers.length;wide.draw(320);wide.draw(1.5);
  assert.equal(wide.buffers.length,canvasCount,'frames and seeks reuse their canvas surfaces');
});
test('ember ignites only canonical attacks near the needle and retains red coal history',()=>{
  const {draw}=rig('ember');
  assert.equal(draw(.5).stats.ember.burning,0,'future attacks do not ignite');
  assert.equal(draw(1.12).stats.ember.burning,1);
  assert.equal(draw(1.6).stats.ember.burning,0,'flame ends within narrow crossing band');
  const history=draw(4.5);assert.equal(history.stats.ember.burning,0,'sustain cannot create a new attack');
  const charcoal=history.ink.find(c=>c.name==='stroke'&&c.strokeStyle?.stops)?.strokeStyle;
  assert.ok(charcoal.stops.some(s=>s[1]==='rgba(119,48,37,.50)'),'middle history keeps readable dark red coal');
  assert.ok(history.stats.ember.coalSeconds>3.5);
  draw(16.12);assert.equal(draw(4.5).calls,history.calls,'ember cooling is seek stable');
});
test('night-water real repeated pitches open both separate and simplified future lines, without adding points',()=>{
  const notes=[[1,1,48,90],[2,1,48,90],[3,1,48,90],[1,3,55,90]];
  const merged=[[1,3,48,90],[1,3,55,90]];
  for(const display of [notes,merged]){
    const {draw}=rig('water',notes,1280,display),frame=draw(1.5);
    assert.equal(frame.stats.water.repeatedOpenings,2,'both original re-plucks survive simplification');
    const paths=[];let points=[];
    for(const call of frame.ink){
      if(call.name==='beginPath')points=[];
      if(call.name==='moveTo'||call.name==='lineTo')points.push(call.args);
      if(call.name==='stroke'&&call.strokeStyle==='rgba(148,176,194,.66)')paths.push(points);
    }
    const chord=paths.filter(points=>points.every(p=>p[1]===224));
    assert.equal(chord.length,1,'simultaneous other pitch remains continuous');
    const bass=paths.filter(points=>points.every(p=>p[1]===280));
    for(const time of [2,3]){
      const x=800+(time-1.5)*140;
      assert.ok(bass.every(points=>!points.some(p=>p[0]>x-1.7&&p[0]<x+.6)),'opening is tied exactly to the real repeated onset');
    }
    const nearby=draw(2.12);assert.equal(nearby.stats.water.repeatedOpenings,2);
    draw(8);assert.equal(draw(2.12).calls,nearby.calls,'near-needle release remains seek stable');
  }
});
test('night-water adds no fake re-plucks to held notes, F0 contours or real rests',()=>{
  assert.equal(rig('water',[[1,8,48,90]]).draw(2).stats.water.repeatedOpenings,0);
  assert.equal(rig('water',[[1,.5,48,90],[2,.5,48,90]]).draw(1.8).stats.water.repeatedOpenings,0);
  const contour=rig('water',[[1,1,48,90],[2,1,48,90]]);
  contour.part.contour={start:0,hop:.1,midi:Array(400).fill(48)};contour.options.showContour=true;
  assert.equal(contour.draw(1.8).stats.water.repeatedOpenings,0,'measured F0 remains a continuous contour');
});

test('night-water follows measured F0 ordinates and leaves the unvoiced gap open',()=>{
  const contour=rig('water',[[1,2,48,90]]);
  contour.part.contour={start:1,hop:.25,midi:[48,48.5,49,null,49,48.5,48]};
  contour.options.showContour=true;
  const ahead=future(contour.draw(1.25)).filter(points=>points.length);
  const expected=[[800,276],[835,272],[905,272],[940,276],[975,280]];
  assert.deepEqual(ahead.flat(),expected);
  assert.equal(ahead.length,2);
});
