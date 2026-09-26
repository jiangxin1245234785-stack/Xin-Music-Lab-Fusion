'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createMidiDrafts}=require('../core/midi-drafts.cjs');
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'xld-draft-list-'));
 try{
  const run={duration:10,engine:'manual-revision',sourceRunId:'wav',source:{path:'source.wav',size:1,mtimeMs:2}};
  let status='current',active='one';
  const assets={directory:()=>root,midi:{read:async()=>({ok:true,runId:active}),readRun:async()=>({ok:!['files-missing','invalid'].includes(status),status,run,record:run})}};
  const d=createMidiDrafts({assets}),track={id:'t'},p={stem:'strings',runId:'one',instrument:0,notes:[[1,2,60,80,0,0]],sourceKey:JSON.stringify(['wav','source.wav',1,2])};
  await d.write(track,p);
  const state=async()=>(await d.list(track)).drafts[0].status;
  assert.equal(await state(),'current');active='two';assert.equal(await state(),'other-version');
  status='source-changed';assert.equal(await state(),'source-changed');
  status='files-missing';assert.equal(await state(),'missing');
  status='invalid';assert.equal(await state(),'invalid');
  status='current';active='one';run.source.mtimeMs=3;assert.equal(await state(),'source-changed');
  const raw=await d.read(track,p);assert.deepEqual(raw.draft.notes,p.notes,'listing never overwrites the draft');
  console.log('midi draft list: ok (active, other version, changed source, missing parent and corrupt record remain distinct)');
 }finally{await fs.rm(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
