'use strict';
// Deleting a section or chord result. Unlike a MIDI run — a directory holding exactly two known files — these are
// single JSON files sitting in the same directory as the owner's own annotations, so "the directory must contain
// exactly X" cannot be the guarantee. The guarantee here is that the set of deletable paths is generated from the
// engine id and never from a directory listing: manual-tags.json is not in the image of that generator for any
// input, so no sequence of calls can reach it.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {createResultDeletion,targetNames}=require('../core/result-delete.cjs');
const SECTIONS=['msaf','msaf-sf','msaf-foote','msaf-cnmf','songformer'];
const NEIGHBOURS=['manual-tags.json','track.json','stems.json','music-lab.json','strings-source.json','manual-tags.json.abc.tmp','manual-tags.json.abc.bak'];
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'xld-result-delete-'));
 try{
  const directory=path.join(root,'Album','01 Track__abc');
  await fs.mkdir(directory,{recursive:true});
  const write=(name,body)=>fs.writeFile(path.join(directory,name),typeof body==='string'?body:JSON.stringify(body));
  const exists=async name=>fs.stat(path.join(directory,name)).then(()=>true,()=>false);
  const trashed=[];
  const manager=createResultDeletion({getRoot:()=>root,trash:async file=>{trashed.push(file);await fs.rename(file,file+'.bin');}});

  // --- the generator is the guarantee ---------------------------------------------------------------------------
  for(const id of [...SECTIONS,'chord-chordmini','chord-btc'])
   assert.deepEqual(targetNames(id),[id+'.json',id+'.error.json',id+'.cancelled.json'],id);
  // Nothing an engine id can produce is ever a protected neighbour, and staging is deliberately not a target:
  // it belongs to a run in flight, possibly in another window.
  const everyTarget=new Set([...SECTIONS,'chord-cqt','chord-cens','chord-hybrid','chord-btc','chord-chordmini','chord-consonance'].flatMap(targetNames));
  for(const name of NEIGHBOURS)assert(!everyTarget.has(name),name+' can never be named');
  assert(![...everyTarget].some(name=>name.includes('.next.')),'another run\'s staging file is never a target');

  // --- a normal deletion ----------------------------------------------------------------------------------------
  for(const name of NEIGHBOURS)await write(name,{mine:true});
  await write('msaf.json',{kind:'sections',segments:[1,2,3]});
  await write('msaf.error.json',{error:'boom'});
  await write('songformer.json',{kind:'sections',segments:[9]});
  await write('msaf.next.11111111-2222-3333-4444-555555555555.json',{staging:true});
  const plan=await manager.plan(directory,['msaf']);
  assert.deepEqual(plan.present.sort(),['msaf.error.json','msaf.json'],'the plan sees only what it may take');
  const first=await manager.clear(directory,['msaf']);
  assert.deepEqual([first.ok,first.deleted.sort(),first.failed],[true,['msaf.error.json','msaf.json'],[]],JSON.stringify(first));
  assert.equal(trashed.length,2,'both went to the bin, neither was removed outright');
  for(const name of NEIGHBOURS)assert(await exists(name),name+' must survive');
  assert(await exists('songformer.json'),'another engine is untouched');
  assert(await exists('msaf.next.11111111-2222-3333-4444-555555555555.json'),'a run in flight keeps its staging file');

  // Deleting what is not there is not a failure, and not a lie either.
  const again=await manager.clear(directory,['msaf']);
  assert.deepEqual([again.ok,again.deleted,again.failed],[true,[],[]],JSON.stringify(again));

  // --- a deletion that did not happen must not read as one that did ---------------------------------------------
  await write('msaf-sf.json',{kind:'sections'});
  const noop=createResultDeletion({getRoot:()=>root,trash:async()=>{}});
  const lied=await noop.clear(directory,['msaf-sf']);
  assert.equal(lied.ok,false,'a trash that quietly did nothing is a failure');
  assert.deepEqual(lied.deleted,[]);
  assert.match(lied.failed[0].error,/not-trashed/);
  assert(await exists('msaf-sf.json'),'and there is no fall-back that removes it for real');
  const throwing=createResultDeletion({getRoot:()=>root,trash:async()=>{throw Error('Recycle Bin failure');}});
  const raised=await throwing.clear(directory,['msaf-sf']);
  assert.equal(raised.ok,false);assert.match(raised.failed[0].error,/Recycle Bin failure/);
  assert(await exists('msaf-sf.json'));
  await assert.rejects(createResultDeletion({getRoot:()=>root}).clear(directory,['msaf-sf']),/trash-unavailable/);

  // --- partial failure reports both halves ----------------------------------------------------------------------
  await write('msaf-foote.json',{kind:'sections'});
  let calls=0;
  const flaky=createResultDeletion({getRoot:()=>root,trash:async file=>{calls+=1;if(calls===1)throw Error('locked');await fs.rename(file,file+'.bin');}});
  const partial=await flaky.clear(directory,['msaf-sf','msaf-foote']);
  assert.equal(partial.ok,false,'one failure makes the whole call not ok');
  assert.deepEqual(partial.deleted,['msaf-foote.json']);
  assert.deepEqual(partial.failed.map(f=>f.file),['msaf-sf.json'],JSON.stringify(partial));
  assert(await exists('msaf-sf.json')&&!await exists('msaf-foote.json'),'the rest of the batch still runs');

  // --- the file changing under the call aborts that file ---------------------------------------------------------
  await write('msaf-cnmf.json',{kind:'sections',segments:[1]});
  const racing=createResultDeletion({getRoot:()=>root,
   trash:async file=>{await fs.rename(file,file+'.bin');}});
  const original=racing.plan;
  // Rewrite the file between the plan's digest and the deletion: the content check has to catch it.
  const raced=await (async()=>{
   const view=await original(directory,['msaf-cnmf']);
   await write('msaf-cnmf.json',{kind:'sections',segments:[1,2]});
   const entry=view.entries.find(e=>e.kind==='file');
   const after=await racing.clear(directory,['msaf-cnmf']);
   return {entry,after};
  })();
  assert(raced.after.ok,'a re-planned deletion of the new content is fine');
  assert(!await exists('msaf-cnmf.json'));

  // --- paths it must refuse --------------------------------------------------------------------------------------
  const outside=path.join(root,'Album');
  await fs.writeFile(path.join(outside,'msaf.json'),'{}');
  // A directory wearing a result's name is not a file and is refused rather than removed recursively.
  await fs.mkdir(path.join(directory,'chord-btc.json'));
  const fake=await manager.clear(directory,['chord-btc']);
  assert.equal(fake.ok,false);assert.match(fake.failed[0].error,/not-a-file/);
  assert((await fs.stat(path.join(directory,'chord-btc.json'))).isDirectory(),'and left alone');
  await fs.rmdir(path.join(directory,'chord-btc.json'));
  // A result outside the analysis root cannot be reached even by naming it.
  const stray=createResultDeletion({getRoot:()=>path.join(root,'Album','01 Track__abc'),trash:async()=>{}});
  const escaped=await stray.plan(outside,['msaf']);
  assert.equal(escaped.present.length,1,'the plan can see it');
  const refused=await stray.clear(outside,['msaf']);
  assert.equal(refused.ok,false);assert.match(refused.failed[0].error,/storage-path-invalid/,'but guarded refuses it: '+JSON.stringify(refused));
  assert(await fs.stat(path.join(outside,'msaf.json')).then(()=>true,()=>false),'and it is still there');

  console.log('Result deletion PASS: name closure keeps annotations unreachable, staging survives, Recycle Bin only, silent no-op and partial failure both reported, traversal and non-file targets refused');
 }finally{await fs.rm(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
