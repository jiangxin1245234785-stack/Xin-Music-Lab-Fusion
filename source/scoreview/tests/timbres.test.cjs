const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {modelFrom,readStems}=require('../adapter/track-model.cjs'),{ScoreView,mockCanvas}=require('./helpers.cjs');
const note=p=>({start:0,end:1,pitch:p,velocity:100});
test('same-program instruments keep separate identities while merged view keeps every note',()=>{
 const notes=[note(60),note(64)],result=modelFrom({stems:{strings:{notes,engine:'manual-revision',runId:'user',instruments:[{index:0,name:'A',program:40,notes:[notes[0]]},{index:1,name:'B',program:40,notes:[notes[1]]}]}}});
 assert(result.ok);assert.deepEqual(result.model.lanes.map(l=>l.id),['strings/0','strings/1']);assert(result.model.lanes.every(l=>l.meta.runId==='user'));
 const view=ScoreView.create(mockCanvas().canvas,result.model,()=>0,{});assert.equal(view.lanes().length,1);assert.equal(view.lanes()[0].count,2);view.setOptions({mergeTimbres:false});assert.equal(view.lanes().length,2);
});
test('invalid instrument accounting falls back to one complete lane',()=>{
 const r=modelFrom({stems:{guitar:{notes:[note(60),note(64)],instruments:[{index:0,notes:[note(60)]}]}}});
 assert.equal(r.model.lanes.length,1);assert.equal(r.model.lanes[0].notes.length,2);
});

test('multiple incomplete instrument parts cannot silently discard notes from the stem',()=>{
 const notes=[note(60),note(64),note(67)],r=modelFrom({stems:{guitar:{notes,instruments:[{index:0,notes:[notes[0]]},{index:1,notes:[notes[1]]}]}}});
 assert(r.ok);assert.equal(r.model.lanes.length,1);assert.deepEqual(r.model.lanes[0].notes.map(n=>n[2]),[60,64,67]);
});
test('reader segments the actual MIDI and refuses mismatched boundaries',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'score-timbre-'));
 const chunk=(name,bytes)=>{const b=Buffer.from(bytes),h=Buffer.alloc(8);h.write(name);h.writeUInt32BE(b.length,4);return Buffer.concat([h,b]);};
 try{
  const header=chunk('MThd',[0,1,0,2,1,224]);
  const part=(pitch,program)=>chunk('MTrk',[0,0xc0,program,0,0x90,pitch,100,120,0x80,pitch,0,0,255,47,0]);
  fs.writeFileSync(path.join(dir,'strings.mid'),Buffer.concat([header,part(60,40),part(64,42)]));fs.writeFileSync(path.join(dir,'notes.json'),JSON.stringify({notes:[note(60),note(64)]}));
  const load=()=>readStems(async stem=>stem==='strings'?{ok:true,directory:dir,file:'strings.mid',notesFile:'notes.json',engine:'manual-revision',runId:'user'}:{ok:false});
  const r=await load();assert.deepEqual(r.strings.instruments.map(p=>[p.program,p.notes[0].pitch]),[[40,60],[42,64]]);
  fs.writeFileSync(path.join(dir,'notes.json'),JSON.stringify({notes:[note(60)]}));const bad=await load();assert.equal(bad.strings.instruments,undefined);assert.equal(bad.strings.instrumentError,'midi-read-count-mismatch');assert.equal(bad.strings.notes.length,1);
 }finally{if(!path.basename(dir).startsWith('score-timbre-'))throw Error('Unsafe cleanup');fs.rmSync(dir,{recursive:true,force:true});}
});
