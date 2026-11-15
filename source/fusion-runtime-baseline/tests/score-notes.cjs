const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createStore,notesRoot}=require('../desktop/score-notes.cjs');
test('notes preserve edits/deletes in history and survive a new store; tracks stay separate',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'score-notes-'));try{
  const store=createStore(root),a=await store.save('song',{start:1,end:7,text:' 一句笔记 '},60);assert.equal(a.text,'一句笔记');
  await store.save('song',{id:a.id,start:2,end:8,text:'改过的'},60);assert.equal((await createStore(root).list('song'))[0].text,'改过的');assert.deepEqual(await store.list('other'),[]);
  await store.remove('song',a.id);assert.deepEqual(await store.list('song'),[]);assert.equal((await fs.readdir(path.join(root,'song/.history'))).length,2);
  await Promise.all(Array.from({length:20},(_,i)=>store.save('song',{start:i,end:i+1,text:'note '+i},60)));assert.equal((await store.list('song')).length,20);
  for(const item of [{start:-1,end:2,text:'x'},{start:1,end:80,text:'x'},{start:NaN,end:2,text:'x'},{start:1,end:1.00001,text:'x'},{start:1,end:2,text:''},{start:1,end:2,text:'x'.repeat(501)}])await assert.rejects(store.save('song',item,60));
  await assert.rejects(store.list('../outside'));await assert.rejects(store.remove('song','../../bad'));
 }finally{if(!path.basename(root).startsWith('score-notes-'))throw Error('unsafe cleanup');await fs.rm(root,{recursive:true,force:true});}
});
test('development releases share notes across versions, acceptance and normal apps remain isolated',()=>{
 const root=path.resolve('profiles');assert.equal(notesRoot(path.join(root,'XinMusicDevelopment/score.10'),root),notesRoot(path.join(root,'XinMusicDevelopment/score.11'),root));assert.equal(notesRoot(root,path.join(root,'XML')),path.join(root,'XML/Listening Notes'));
});

