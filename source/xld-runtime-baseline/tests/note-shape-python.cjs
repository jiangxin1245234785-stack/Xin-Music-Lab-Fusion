'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process'),M=require('../midi-edit.js');
const root=process.env.XLD_SHAPE_TEST_ROOT;if(!root)throw Error('isolated XLD_SHAPE_TEST_ROOT required');
const fixture=require(path.join(root,'fixture.json')),script=path.join(__dirname,'../analysis-midi/revise.py');
fs.mkdirSync(root,{recursive:true});const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const call=args=>{const r=spawnSync(fixture.python,['-X','utf8',script,...args],{encoding:'utf8',windowsHide:true,timeout:120000});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);};
const source=path.join(root,'parent.mid');fs.copyFileSync(fixture.parent,source);const originalHash=hash(fixture.parent),before=call(['--inspect',source]);
let selected;
for(const instrument of before.instruments){
 const notes=instrument.notes.map((n,i)=>[n.start,n.end,n.pitch,n.velocity,instrument.index,i]),m=M.create(notes,{duration:10000,instrument:instrument.index});
 const byPitch=new Map();for(const n of notes){if(!byPitch.has(n[2]))byPitch.set(n[2],[]);byPitch.get(n[2]).push(n);}
 for(const group of byPitch.values()){group.sort((a,b)=>a[0]-b[0]);for(let i=1;i<group.length;i++){
  const a=group[i-1],b=group[i],gap=b[0]-a[1];if(gap<0||gap>.08||a[0]<5)continue;
  try{const proposal=m.previewJoin([M.key(a),M.key(b)]);selected={instrument,notes,m,proposal,gap};break;}catch{}
 }if(selected)break;}if(selected)break;
}
assert(selected,'real fixture has an adjacent same-pitch candidate');
const {instrument,notes,m,proposal,gap}=selected;
function write(model,name){
 const file=path.join(root,name+'.json'),out=path.join(root,name+'.mid');
 fs.writeFileSync(file,JSON.stringify({source,instrument:instrument.index,notes:model.notes().map(n=>({start:n[0],end:n[1],pitch:n[2],velocity:n[3]}))}));
 const result=call(['--job',file,'--output',out]),after=call(['--inspect',out]);
 assert.equal(after.instruments.length,before.instruments.length);
 for(const part of before.instruments){const got=after.instruments[part.index];assert.equal(got.controlChanges,part.controlChanges);assert.equal(got.pitchBends,part.pitchBends);
 if(part.index!==instrument.index)assert.deepEqual(got,part);}
 return {result,after:after.instruments[instrument.index],file:out};
}
m.commit(proposal);const joined=write(m,'joined');assert.equal(joined.after.noteCount,notes.length-1);
const target=proposal.notes[0];assert(joined.after.notes.some(n=>n.pitch===target[2]&&n.velocity===target[3]&&Math.abs(n.start-target[0])<.001&&Math.abs(n.end-target[1])<.001));
m.undo();assert.deepEqual(m.notes(),notes);
const split=m.previewSplit(proposal.ids[0],(notes.find(n=>M.key(n)===proposal.ids[0])[0]+notes.find(n=>M.key(n)===proposal.ids[0])[1])/2);
m.commit(split);const divided=write(m,'split');assert.equal(divided.after.noteCount,notes.length+1);
for(const expected of split.notes)assert(divided.after.notes.some(n=>n.pitch===expected[2]&&n.velocity===expected[3]&&Math.abs(n.start-expected[0])<.001&&Math.abs(n.end-expected[1])<.001),'touching split notes both survive actual MIDI reread');
assert.equal(hash(fixture.parent),originalHash);
const report={passed:true,parent:path.basename(fixture.parent),instrument:instrument.name,instrumentIndex:instrument.index,gap,join:proposal,split,joinedFile:joined.file,splitFile:divided.file,
 originalNotes:notes.length,joinedNotes:joined.after.noteCount,splitNotes:divided.after.noteCount,scope:'Explicit candidate selection for engineering round-trip only; repeated attacks versus fragmented sustain still requires listening.'};
fs.writeFileSync(path.join(root,'note-shape-python.json'),JSON.stringify(report,null,2));console.log('note shape Python: PASS '+JSON.stringify({instrument:instrument.name,notes:notes.length,joined:joined.after.noteCount,split:divided.after.noteCount,gap}));
