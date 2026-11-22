'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {parse,barGrid,build,createStore}=require('../desktop/external-midi.cjs');
const chunk=(name,bytes)=>{const header=Buffer.alloc(8);header.write(name);header.writeUInt32BE(bytes.length,4);return Buffer.concat([header,Buffer.from(bytes)]);};
function song(format,...tracks) {
  return Buffer.concat([chunk('MThd',[0,format,0,tracks.length,0,96]),...tracks.map(bytes=>chunk('MTrk',[...bytes,0,255,47,0]))]);
}
const tempo=[0,255,81,3,7,161,32,0,255,88,4,3,2,24,8,
  0x82,32,255,81,3,15,66,64,0,255,88,4,2,2,24,8];
const notes=[0,192,24,0,144,60,100,96,60,0,0x81,64,60,90,96,60,0];
const input=song(1,tempo,notes), track={id:'a'.repeat(40),title:'Example'};
test('tempo across tracks, meter changes, running status and velocity-zero release',()=>{
  const parsed=parse(input);
  assert.deepEqual(parsed.parts[0].notes,[[0,.5,60,100],[1.5,1,60,90]]);
  assert.equal(parsed.parts[0].group,'guitar');
  const bars=barGrid(parsed,4,.125);
  assert.deepEqual(bars.beats,[.125,.625,1.125,1.625,2.625,3.625]);
  assert.deepEqual(bars.downbeats,[.125,1.625,3.625]);
  const model=build({midi:parsed,offsetMs:-250,grid:false,duration:4},track,'file:///song.flac').model;
  assert.deepEqual(model.lanes[0].notes,[[0,.25,60,100],[1.25,1,60,90]]);
  assert.equal(model.bars,undefined);
});
test('type zero, multiple channels, program changes within a held note and General MIDI drums',()=>{
  const one=song(0,[0,192,32,0,144,40,85,0,153,36,90,24,192,71,24,128,40,0,0,137,36,0,0,144,70,100,96,128,70,0]);
  const midi=parse(one);
  assert.deepEqual(midi.parts.map(x=>x.group),['bass','drums','winds']);
  const model=build({midi,offsetMs:0,grid:true,duration:2},track,'file:///song.wav').model;
  assert.deepEqual(model.lanes[1].hits,[[0,0,90]]);
  assert.equal(model.bars,undefined);
  assert.throws(()=>parse(song(2,notes)),/midi-format/);
  assert.throws(()=>parse(input.subarray(0,input.length-1)),/truncated/);
});
test('per-song atomic replacement, validation, persistence and restoring analysis',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'xml-midi-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const store=createStore(root), original=await store.action(track,{action:'import',name:'live.mid',bytes:input,duration:4});
  assert.equal(original.parts.length,1);
  await assert.rejects(store.action(track,{action:'import',bytes:Buffer.from('bad')}));assert.deepEqual(await store.action(track,{action:'read'}),original);
  const updated=await store.action(track,{action:'apply',revision:original.revision,offsetMs:125,groups:['strings'],grid:true});
  assert.equal(updated.parts[0].group,'strings');assert.equal(updated.offsetMs,125);
  const again=createStore(root);
  assert.deepEqual(await again.action(track,{action:'read'}),updated);
  await assert.rejects(again.action(track,{action:'restore',revision:original.revision}),/midi-changed/);
  assert.equal(await again.action({...track,id:'b'.repeat(40)},{action:'read'}),null);
  assert.equal(await again.action(track,{action:'restore',revision:updated.revision}),null);
  assert.equal(await again.read(track.id),null);
});
