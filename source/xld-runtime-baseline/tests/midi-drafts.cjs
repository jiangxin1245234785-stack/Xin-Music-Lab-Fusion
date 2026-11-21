'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createMidiDrafts}=require('../core/midi-drafts.cjs');
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'xld-drafts-'));
 try{
 const assets={directory:()=>root,midi:{readRun:async()=>({ok:true,run:{duration:10}})}},d=createMidiDrafts({assets});
 const t={id:'a'},p={stem:'strings',runId:'parent',instrument:3,sourceKey:'source',notes:[[1,2,60,80,3,0]]};
 assert((await d.write(t,p)).ok);assert.deepEqual((await d.read(t,p)).draft.notes,p.notes);
 assert.equal((await d.read(t,{...p,runId:'other'})).draft,null);
 assert.equal((await d.write(t,{...p,runId:'../../escape'})).ok,false);
 assert.equal((await d.write(t,{...p,notes:[[1,2,60,80,0,0]]})).ok,false);
 assert.deepEqual(await fs.readdir(path.join(root,'midi','strings')),['drafts']);
 assert((await d.write(t,{...p,notes:null})).ok);assert.equal((await d.read(t,p)).draft,null);
 // Registered stems support drafts, and names outside the registry are refused.
 const singlePart={...p,instrument:0,notes:[[1,2,60,80,0,0]]};
 for(const stem of ['vocals','other']) {
   const draft={...singlePart,stem};
   assert((await d.write(t,draft)).ok);
   assert.deepEqual((await d.read(t,draft)).draft.notes,draft.notes);
 }
 assert.equal((await d.write(t,{...singlePart,stem:'unknown-stem'})).ok,false);
 console.log('midi drafts: ok (run identity, contained paths, invalid notes and stems refused, vocals and other drafts, no active pointer writes)');
 }finally{await fs.rm(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
