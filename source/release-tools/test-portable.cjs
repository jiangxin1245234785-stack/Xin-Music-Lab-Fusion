'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),vm=require('node:vm');
const runtime=require('../shared-analysis/runtime-config.cjs');
const {configure}=require('./configure-bundle.cjs');
const {defaultUserPaths}=require('../shared-analysis/user-paths.cjs');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'xin-portable-'));
const safe=p=>{assert(path.resolve(p).startsWith(path.resolve(temp)+path.sep));return p;};
try{
 const original=safe(path.join(temp,'原位置 with spaces')),moved=safe(path.join(temp,'搬迁后的工具'));
 const base=path.join(original,'runtime/0.5.0'),addons=path.join(original,'runtime/addons'),configFile=path.join(original,'build/runtime.json'),app=path.join(original,'program');
 for(const name of ['yourmt3-v1','muscriptor-v1','audiosep-v1','refine-roformer-v1'])fs.mkdirSync(path.join(addons,name),{recursive:true});
 fs.writeFileSync(path.join(addons,'yourmt3-v1/python.exe'),'fixture');
 const raw=configure({runtimeRoot:base,configFile,releaseVersion:'0.5.0-preview.test',channel:'preview'});
 assert.equal(Object.keys(raw.paths).length,21);assert.equal(raw.channel,'preview');
 let absolute=runtime.read(configFile);
 for(const [key,p]of Object.entries(absolute.paths)){if(key.endsWith('_PYTHON')){fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,'fixture');}else fs.mkdirSync(p,{recursive:true});}
 assert(runtime.inspect(absolute).ok);
 assert.equal(absolute.paths.XLD_MUSCRIPTOR_PYTHON,absolute.paths.XLD_YOURMT3_PYTHON);
 // Legacy absolute configs remain readable, but builds always emit relative ones.
 const legacy=path.join(original,'legacy.json');fs.writeFileSync(legacy,JSON.stringify({...raw,paths:absolute.paths}));
 fs.mkdirSync(app,{recursive:true});const deployed=path.join(app,'runtime.json');fs.writeFileSync(deployed,JSON.stringify(runtime.rebase(legacy,app)));
 const emitted=JSON.parse(fs.readFileSync(deployed));assert(Object.values(emitted.paths).every(p=>!path.isAbsolute(p)));assert.equal(emitted.channel,'preview');
 assert.deepEqual(runtime.read(deployed).paths,absolute.paths);
 const cwd=process.cwd();try{process.chdir(temp);assert.deepEqual(runtime.read(deployed).paths,absolute.paths);}finally{process.chdir(cwd);}
 if(process.platform==='win32'){const foreign=path.parse(temp).root.toUpperCase().startsWith('Z:')?'Y:/program':'Z:/program';assert.throws(()=>runtime.rebase(legacy,foreign),/different volume/);}
 safe(original);safe(moved);fs.renameSync(original,moved);
 const after=runtime.read(path.join(moved,'program/runtime.json'));assert(runtime.inspect(after).ok);
 for(const p of Object.values(after.paths))assert(p.startsWith(moved+path.sep),'Every resolved path moved');
 assert.equal(after.paths.XLD_MUSCRIPTOR_PYTHON,after.paths.XLD_YOURMT3_PYTHON);
 const defaults=defaultUserPaths({getPath:key=>path.join(temp,key)});assert.equal(defaults.libraryRoot,path.join(temp,'music'));assert.equal(defaults.analysisRoot,path.join(temp,'documents/Xin Music Lab/Analysis'));
 // Preview profile ignores personal seed; explicit acceptance override wins.
 const bootstrap=fs.readFileSync(path.join(__dirname,'bootstrap.cjs'),'utf8');
 function boot({channel,acceptance=false}){
  const root=path.join(temp,'boot-'+(channel||'legacy')+(acceptance?'-test':''));fs.mkdirSync(path.join(root,'resources/app'),{recursive:true});
  fs.writeFileSync(path.join(root,'runtime.json'),JSON.stringify({channel}));fs.writeFileSync(path.join(root,'development-settings.json'),JSON.stringify({libraryRoot:'D:/PRIVATE_MUSIC',analysisRoot:'D:/PRIVATE_RESULTS'}));
  const dirs={appData:path.join(root,'profiles')};const appMock={setName:n=>appMock.name=n,getName:()=>appMock.name,getVersion:()=> '0.5.0-preview.test',setAppUserModelId(){},getPath:k=>dirs[k],setPath:(k,v)=>{dirs[k]=v;},whenReady:()=>Promise.resolve(),quit:()=>assert.fail('Unexpected quit')};
  const env=acceptance?{XLD_TEST:'1',XML_TEST:'1',XIN_RELEASE_TEST_ROOT:path.join(root,'isolated')}:{};
  vm.runInNewContext(bootstrap,{require:n=>n==='node:fs'?fs:n==='node:path'?path:n==='electron'?{app:appMock,dialog:{showErrorBox:(_title,message)=>assert.fail(message)}}:n.endsWith('runtime-config.cjs')?{apply:()=>({ok:true})}:n==='./release-shell.cjs'?{install(){}}:n.endsWith('main.cjs')?{}:assert.fail(n),process:{execPath:path.join(root,'XLD.exe'),env},__dirname:path.join(root,'resources/app')});
  return dirs;
 }
 const preview=boot({channel:'preview'});assert(preview.appData.endsWith('XinMusicPreview'));assert(!fs.existsSync(path.join(preview.userData,'settings.json')));
 const testing=boot({channel:'preview',acceptance:true});assert(testing.appData.endsWith('isolated'));
 const legacyProfile=boot({});assert(legacyProfile.appData.includes('XinMusicDevelopment'));assert(fs.existsSync(path.join(legacyProfile.userData,'settings.json')));
 console.log('Portable paths: PASS (legacy config, full addons, shared Python, cwd, relocation, cross-volume refusal, fresh preview and existing development profiles)');
}finally{safe(temp+path.sep+'guard');if(!path.basename(temp).startsWith('xin-portable-'))throw Error('Unsafe cleanup');fs.rmSync(temp,{recursive:true,force:true});}
