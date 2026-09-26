'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {writeRequest,consumeRequest}=require('../core/open-request.cjs');
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'xld-open-test-'));
 try{
  assert.equal(await consumeRequest(root),null);
  await writeRequest(root,{source:'first',locale:'zh-CN'});
  await writeRequest(root,{source:'second',locale:'en-US'});
  const values=await Promise.all([consumeRequest(root),consumeRequest(root)]);
  assert.equal(values.filter(Boolean).length,1);assert.equal(values.find(Boolean).source,'second');assert.equal(values.find(Boolean).locale,'en-US');
  for(let round=0;round<30;round++){
    await writeRequest(root,{source:'stress-'+round});
    const claimed=await Promise.all(Array.from({length:8},()=>consumeRequest(root)));
    assert.equal(claimed.filter(Boolean).length,1,'one consumer per request, round '+round);
    assert.equal(claimed.find(Boolean).source,'stress-'+round);
  }
  await writeRequest(root,{source:'old'});const old=consumeRequest(root);await writeRequest(root,{source:'new'});
  assert.equal((await old).source,'old');assert.equal((await consumeRequest(root)).source,'new');
  await fs.writeFile(path.join(root,'.xml-open-request.json'),'{bad');assert.equal(await consumeRequest(root),null);
  assert.deepEqual(await fs.readdir(root),[]);
  console.log('XLD open request: PASS (atomic replacement, one consumer, new request preserved, invalid input)');
 }finally{if(path.dirname(path.resolve(root))===path.resolve(os.tmpdir())&&path.basename(root).startsWith('xld-open-test-'))await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
