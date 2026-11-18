'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {ScoreView,mockCanvas,BENCH}=require('./helpers.cjs');
const program=fs.readFileSync(path.join(__dirname,'../score-surface.js'),'utf8');
function model(notes,group='guitar'){
  return {contract:'xin.score-view/1',track:{id:'attacks',duration:30},audio:{},
    lanes:[{id:group,kind:'pitched',group,label:group,notes}],bars:{bpm:120}};
}
function paperFixture(data,extra={}){
  const buffers=[];
  const doc={createElement(){const b=mockCanvas(1920,1080),c=b.canvas.getContext('2d');
    c.clearRect=()=>{};c.getImageData=()=>({data:[]});c.putImageData=()=>{};
    b.canvas.ownerDocument=doc;buffers.push(b);return b.canvas;}};
  const target=doc.createElement('canvas'),core=mockCanvas(1280,720);
  core.canvas.getContext('2d').clearRect=()=>{};
  const opts={...BENCH,quietText:true,scoreStyle:'paper',showBackdrop:false,...extra};
  const view=ScoreView.create(core.canvas,data,()=>0,opts);
  const env={XinScoreView:ScoreView};vm.runInNewContext(program,env);
  const material=env.XinScoreSurface.create(target,data,()=>0,opts,()=>({view,canvas:core.canvas,unit:1.5,top:12}));
  return {at(t){for(const b of buffers)b.reset();const stats=material.draw(t);return {stats,ink:buffers[buffers.length-1]};}};
}
test('coincident guitar and piano heads retain distinct hue, aspect and attack face',()=>{
  const data=model([[5,.4,60,100]]);data.lanes.push({...model([[5,.4,60,100]],'piano').lanes[0]});
  const b=mockCanvas(),v=ScoreView.create(b.canvas,data,()=>0,{...BENCH,meteorMotion:true,quietText:true});
  v.draw(5.1);const heads=b.calls.filter(c=>c.name==='ellipse');
  assert.equal(heads.length,2);assert.equal(heads[0].args[0],heads[1].args[0]);
  const guitar=heads.find(c=>c.args[2]/c.args[3]>2),piano=heads.find(c=>c.args[2]/c.args[3]<1.5);
  assert.ok(guitar&&piano);assert.notEqual(guitar.fillStyle,piano.fillStyle);
  assert.ok(b.calls.some(c=>c.name==='rect'&&Math.abs(c.args[2]/c.args[3]-.78/2.1)<1e-8));
});
test('paper retains actual repeated attacks on either side of the needle after simplification and merging',()=>{
  for(const simplify of [false,true])for(const mergeTimbres of [false,true]){
    const data=model([[5,.25,60,90],[5.25,.25,60,90],[5.5,.5,60,90],[5.25,.3,64,88]]);
    data.lanes.push({...data.lanes[0],id:'guitar/other',notes:[[5.25,.25,60,80]]});
    const p=paperFixture(data,{simplify,mergeTimbres});
    for(const t of [5.15,5.4,5.7,5.4]){
      const {stats,ink}=p.at(t);assert.equal(stats.paper.repeatedTouches,2);
      assert.equal(stats.paper.onsetTouches,mergeTimbres?4:5,'merged unisons collapse once; chord pitches do not');
      const marks=ink.calls.filter(c=>c.name==='ellipse');
      assert.ok(marks.length>=4);assert.ok(new Set(marks.map(c=>c.args[1])).size>=2,'chord pitches stay separate');
      assert.ok(ink.strokes().length>=3,'real attacks split the ink path');
    }
  }
});
test('a sustained paper note has no artificial repeat seams and frame reconstruction is stable',()=>{
  const p=paperFixture(model([[5,3,60,90]]));
  const first=p.at(6);assert.equal(first.stats.paper.repeatedTouches,0);assert.equal(first.stats.paper.onsetTouches,1);
  assert.equal(first.ink.strokes().length,1);
  // The initial transform carries last frame's unused fill style in the mock;
  // compare every paint command after the mask's drawing state is reset.
  const geometry=JSON.stringify(first.ink.calls.slice(1));p.at(7);
  assert.equal(JSON.stringify(p.at(6).ink.calls.slice(1)),geometry);
});
