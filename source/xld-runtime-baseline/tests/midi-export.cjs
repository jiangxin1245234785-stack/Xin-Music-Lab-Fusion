'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createMidiExport}=require('../core/midi-export.cjs');
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'xld-export-')),analysis=path.join(root,'analysis'),out=path.join(root,'exports');
 try{
  await fs.mkdir(analysis);await fs.mkdir(out);
  const source=path.join(analysis,'source.mid'),bytes=Buffer.from('MThd\0\0\0\u0006原始多乐器CC和弯音字节');
  await fs.writeFile(source,bytes);
  let active='parent';const assets={directory:()=>analysis,readMidi:async()=>({ok:true,runId:active,file:'source.mid'})};
  const e=createMidiExport({assets,protectedRoots:()=>[analysis]}),track={title:'曲名: /测试?'};
  const prepared=await e.prepare(track,{stem:'strings',runId:'parent'});assert(prepared.ok);
  assert(!/[/:?]/.test(prepared.filename));
  const dest=path.join(out,'弦乐.mid');assert((await e.write(prepared,dest)).ok);assert.deepEqual(await fs.readFile(dest),bytes);
  await fs.writeFile(dest,'previous');assert((await e.write(prepared,dest)).ok);assert.deepEqual(await fs.readFile(dest),bytes);
  assert.equal((await e.write(prepared,source)).error,'export-protected');
  assert.equal((await e.write(prepared,path.join(analysis,'another.mid'))).error,'export-protected');
  const linked=path.join(out,'linked.mid');await fs.link(source,linked);
  assert.equal((await e.write(prepared,linked)).error,'export-protected');assert.deepEqual(await fs.readFile(source),bytes);
  assert.equal((await e.write(prepared,path.join(out,'wrong.wav'))).error,'export-extension');
  const folder=path.join(out,'folder.mid');await fs.mkdir(folder);
  assert.equal((await e.write(prepared,folder)).error,'export-protected');
  assert.equal((await e.write(prepared,path.join(root,'missing','file.mid'))).error,'export-write-failed');
  active='new-run';assert.equal((await e.prepare(track,{stem:'strings',runId:'parent'})).error,'export-version-changed');
  assert(!(await fs.readdir(out)).some(n=>n.endsWith('.tmp')));
  console.log('midi export: ok (exact bytes, selected run, Unicode paths, overwrite, originals/protected folders/hardlinks, failure cleanup)');
 }finally{await fs.rm(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
