'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const Variation = require('../score-variation.js');

function model(overrides) {
  // The second pass has a shorter beat, and durations are deliberately unequal.
  return {
    track: {id:'track-one'},
    sections: [[1,10,'副歌 1','detector','chorus'],
      [11,15,'主歌','detector','verse'], [20,24.8,'副歌 2','detector','chorus']],
    bars: {beats: [...Array.from({length:20},(_,i)=>i), ...Array.from({length:22},(_,i)=>20+i*.8)]},
    ...overrides
  };
}
const close = (actual,expected,limit=1e-7) => assert.ok(Math.abs(actual-expected)<=limit,`${actual} ≠ ${expected}`);

test('default same-family pair maps elapsed beat phase both ways and handles jumps', () => {
  const actual = Variation.create(model());
  assert.equal(actual.pair.a.label,'副歌 1');
  assert.equal(actual.pair.b.label,'副歌 2');
  assert.equal(actual.state(2.5).basis,'beat');
  close(actual.alternateTime(2.5),21.2);
  close(actual.alternateTime(actual.alternateTime(2.5)),2.5);
  assert.equal(actual.state(8).reason,'outside-common');
  assert.equal(actual.state(8).alternateTime,null);
  assert.equal(actual.state(11).reason,'outside');
  assert.equal(actual.state(20.3).active,'b');
  assert.equal(actual.state(24.8).active,null);
  assert.equal(actual.setPair(actual.pair.a.id,actual.pair.a.id),false);
  assert.equal(actual.setPair(actual.pair.b.id,actual.sections[1].id),true);
  assert.equal(actual.state(13).active,'b');
  assert.equal(actual.state(2.5).active,null);
  assert.equal(Variation.create(model({sections:[]})).state(2.5).reason,'pick-pair');
});

test('gaps cannot be crossed and measured beats after them still correspond', () => {
  const fixture = model({
    sections: [[1,11,'Verse 1'],[14,24,'Verse 2']],
    bars: {beats:Array.from({length:27},(_,i)=>i).filter(beat=>beat!==17)}
  });
  const actual = Variation.create(fixture);
  close(actual.alternateTime(2.25),15.25);
  assert.equal(actual.state(4.25).reason,'missing-beats');
  assert.equal(actual.state(17.25).reason,'missing-beats');
  close(actual.alternateTime(18.5),5.5);
  close(actual.alternateTime(5.5),18.5);
  assert.equal(Variation.create(model({bars:{beats:[0]}})).state(2.5).reason,'missing-beats');
});

test('consistent exact lines move the in-section beat anchor, and changed or stale lyrics reset it', () => {
  const actual = Variation.create(model());
  const lines = [
    {time:2.2,text:'Some lyrics, at the start.'},
    {time:4.2,text:'Here is the repeated phrase.'},
    {time:21.76,text:'Some lyrics at the start'},
    {time:23.36,text:'Here is the repeated phrase'}
  ];
  actual.setLyrics({trackId:'track-one',lines,offset:0});
  const before = actual.state(2.2);
  assert.equal(before.basis,'lyric');
  assert.equal(before.anchorCount,2);
  close(before.alternateTime,21.76);
  close(actual.alternateTime(21.76),2.2);
  assert.equal(actual.state(20.1).reason,'outside-common');
  actual.setLyrics({trackId:'second-track',lines,offset:0});
  assert.equal(actual.state(2.2).basis,'beat');
  const other = Variation.create(model({track:{id:'second-track'}}));
  assert.deepEqual(other.state(2.2),actual.state(2.2));
  assert.equal(other.state(2.2).anchorCount,0);
});

test('ambiguous repeated lines and insufficient measured stem coverage are ignored', () => {
  const lines = [3,5,22,24,25,27].map((time,i) => ({time,text:i%2?'The second phrase':'The first phrase'}));
  const timed = model({sections:[[1,10,'A'],[20,29,'B']],bars:{beats:Array.from({length:35},(_,i)=>i)}});
  const actual = Variation.create(timed);
  actual.setLyrics({lines});
  assert.equal(actual.state(3).basis,'beat');
  const levels = {hop:1,groups:{strings:Array(20).fill(-32).concat(Array(14).fill(-21)),
    bass:Array(20).fill(-18).concat([-36])}};
  const measured = Variation.create({...timed,levels}).state(3).dynamic;
  assert.equal(measured.group,'strings');
  close(measured.delta,11);
  assert.equal(measured.scope,'common-beats');
});

function recorder() {
  const batches = [];
  let path, alpha, dash, label = [];
  const ctx = {save(){},restore(){},rect(){},clip(){},stroke(){batches.push({path:[...path],alpha,dash});},
    beginPath(){path=[];},moveTo(x,y){path.push([x,y]);},lineTo(x,y){path.push([x,y]);},
    setLineDash(value){dash=value;},set globalAlpha(value){alpha=value;},fillRect(){},
    measureText(s){return {width:s.length * 6};},fillText(s){label.push(s);}};
  return {ctx,batches,label};
}

function frameAt(time, width, density, unit = 1, top = 0) {
  const lanes = Array.from({length:density},(_,i)=>({top:i*15+64,bottom:i*15+75,height:11,
    lane:{id:'part-'+i,group:'piano',kind:'pitched'}}));
  const start = Float64Array.from({length:650},(_,i)=>20+(i * .011));
  const noteSet = {count:start.length,start,dur:Float64Array.from(start,()=>.18),
    pitch:Float64Array.from(start,(_,i)=>60+i%8),vel:Uint8Array.from(start,(_,i)=>67+i%60)};
  const geometry = {side:12,info:{top:16,bottom:50},lanes};
  return {time,width:width*unit,height:480*unit,pixelsPerSecond:width*unit/16,needle:width*.44*unit,
    geometry,unit,top,parts:()=>[{set:noteSet,voice:'bow'}],yAt:(box,pitch)=>box.bottom-3-(pitch-60)};
}

test('only aligned lanes receive thin companion strokes, with exact scaling and room under heavy density', () => {
  const actual = Variation.create(model());
  for (const [style,width,unit,top] of [['starry',1280,1,0],['paper',420,1.5,12]]) {
    const frame = frameAt(3,width,26,unit,top);
    const rendered = recorder();
    const status = actual.draw(rendered.ctx,frame,{style,lang:'en-US'});
    assert.equal(status.active,'a');
    assert.equal(status.reference,'b');
    assert.ok(status.marks > 100 && status.marks <= 26*46);
    assert.ok(status.trimmed > 1000);
    assert.ok(rendered.batches.some(batch=>batch.dash.length>0));
    assert.ok(rendered.batches.some(batch=>!batch.dash.length));
    assert.ok(rendered.batches.every(batch=>batch.alpha<=.42));
    assert.ok(rendered.batches.every(batch=>batch.path.every(([x,y]) =>
      x >= 0 && x <= frame.width && y >= top+unit*64 && y < top+unit*(25*15+75))));
    const empty = recorder();
    assert.equal(actual.draw(empty.ctx,{...frame,time:12},{style}).marks,0);
    assert.deepEqual(empty.batches,[]);
    assert.deepEqual(empty.label,[]);
  }
});

test('measured A/B energy uses one gutter and quiet floors are visually subdued', () => {
  const levels = {hop:1,groups:{piano:Array(20).fill(-100.7).concat([-24,-28,-20,-18,-21,-17,-23,-20])}};
  const actual = Variation.create(model({levels}));
  const frame = frameAt(3,1152,1);
  frame.geometry.bar = {top:86};
  const rendered = recorder();
  const state = actual.draw(rendered.ctx,frame,{style:'starry'});
  assert.equal(state.energy.group,'piano');
  assert.equal(state.energy.lane,'part-0');
  assert.ok(state.energy.marks >= 8);
  assert.equal(state.energy.narrow,false);
  const energy = rendered.batches.filter(batch=>batch.path[0][1]>frame.geometry.lanes[0].bottom);
  assert.equal(energy.length,2);
  assert.ok(energy.some(batch=>batch.dash.length && batch.alpha<.4));
  assert.ok(energy.some(batch=>!batch.dash.length && batch.alpha>.8));
  assert.ok(energy.every(batch=>batch.path.every(([,y])=>y<frame.geometry.bar.top)));
  assert.equal(actual.draw(recorder().ctx,{...frame,time:9},{style:'starry'}).energy,undefined);
  assert.equal(Variation.create(model()).draw(recorder().ctx,frame,{style:'starry'}).energy,undefined);
});
