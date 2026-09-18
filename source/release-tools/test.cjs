'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const runtime=require('../shared-analysis/runtime-config.cjs');
const {launch}=require('../fusion-runtime-baseline/desktop/launch-xld.cjs');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xin-release-'));
 try{
  const file=path.join(root,'runtime.json'),original=runtime.read(path.join(__dirname,'runtime.local.json'));
  fs.writeFileSync(file,JSON.stringify(original));assert(runtime.inspect(runtime.read(file)).ok);
  const env={XLD_MIDI_PYTHON:'wrong'};runtime.apply(file,env);assert.equal(env.XLD_MIDI_PYTHON,original.paths.XLD_MIDI_PYTHON);
  original.paths.XLD_MIDI_PYTHON='missing/python.exe';fs.writeFileSync(file,JSON.stringify(original));assert(!runtime.inspect(runtime.read(file)).ok);assert.equal(runtime.read(file).paths.XLD_MIDI_PYTHON,path.join(root,'missing/python.exe'));
  original.paths.PATH='bad';fs.writeFileSync(file,JSON.stringify(original));assert.throws(()=>runtime.read(file));
  assert.equal((await launch(path.join(root,'missing.exe'))).error,'xld-not-found');
  const target=path.join(root,'XLD with spaces.exe');fs.writeFileSync(target,'fixture');
  assert((await launch(target,(command,args,options)=>{assert.equal(command,target);assert.deepEqual(args,[]);assert(options.windowsHide);const child=new EventEmitter();child.unref=()=>{};process.nextTick(()=>child.emit('spawn'));return child;})).ok);
  assert.equal((await launch(target,()=>{const child=new EventEmitter();process.nextTick(()=>child.emit('error',Error('denied')));return child;})).error,'launch-failed');
  console.log('Release config and direct XLD launch: PASS');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
