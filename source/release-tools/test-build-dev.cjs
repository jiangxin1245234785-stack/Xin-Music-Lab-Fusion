'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),vm=require('node:vm');
const {buildDevelopment,activate,replaceVersion}=require('./build-dev.cjs');
const {validateDevelopmentSettings}=require('./build-local.cjs');
const {verify}=require('./verify.cjs');
async function fixture(run){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xin-build-dev-'));
 try{
  const sourceRoot=path.join(root,'source'),pkg=path.join(sourceRoot,'fusion-runtime-baseline/package.json'),configFile=path.join(root,'runtime.json'),seedFile=path.join(root,'seed.json');
  fs.mkdirSync(path.dirname(pkg),{recursive:true});fs.writeFileSync(pkg,JSON.stringify({version:'0.5.0-dev.score.6',keep:'other-session'}));fs.writeFileSync(configFile,JSON.stringify({releaseVersion:'0.5.0-dev.score.6',paths:{preserve:true}}));
  fs.writeFileSync(seedFile,JSON.stringify({libraryRoot:path.join(root,'music'),analysisRoot:'../../analysis'}));
  const options={sourceRoot,electronRoot:root,configFile,seedFile,version:'0.5.0-dev.score.7',startupLibrary:root,startupAnalysis:path.join(root,'work/analysis'),reportFile:path.join(root,'report/report.json')};
  const builder=({output,developmentSettings})=>{
   fs.mkdirSync(output,{recursive:true});for(const name of ['XML.exe','XLD.exe'])fs.writeFileSync(path.join(output,name),'fixture');
   fs.writeFileSync(path.join(output,'development-settings.json'),JSON.stringify(developmentSettings));
   const files=fs.readdirSync(output).map(name=>{const data=fs.readFileSync(path.join(output,name));return {path:name,bytes:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex')};});
   fs.writeFileSync(path.join(output,'release-manifest.json'),JSON.stringify({version:options.version,files}));return {output};
  };
  await run({root,pkg,options,builder});
 }finally{if(!path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(root).startsWith('xin-build-dev-'))throw Error('Unsafe test cleanup');fs.rmSync(root,{recursive:true,force:true});}
}
test('seed rejects missing/relative library paths',()=>{
 assert.throws(()=>validateDevelopmentSettings({libraryRoot:'relative',analysisRoot:'analysis'}));
 assert.throws(()=>validateDevelopmentSettings({libraryRoot:path.resolve('music'),analysisRoot:''}));
});
test('build validates every hash and startup before activating a shared launcher',()=>fixture(async({root,pkg,options,builder})=>{
 let boots=0;const result=await buildDevelopment({...options,activateEntry:true},{build:builder,checkStartup:async()=>{boots++;return {ok:true};}});
 assert(result.ok);assert.equal(boots,1);assert.equal(JSON.parse(fs.readFileSync(pkg)).version,options.version);
 for(const name of ['XML','XLD']){const launcher=fs.readFileSync(path.join(root,'启动'+name+'.cmd'),'utf8');assert(launcher.includes('current-release.cmd'));assert(!launcher.includes(options.version));}
 assert(fs.readFileSync(path.join(root,'releases/current-release.cmd'),'utf8').includes(options.version));
 const output=path.join(root,'releases',options.version);fs.appendFileSync(path.join(output,'development-settings.json'),' ');assert.throws(()=>verify(output),/differs/);
}));
test('failed executable gate restores version fields and never activates',()=>fixture(async({root,pkg,options,builder})=>{
 await assert.rejects(buildDevelopment({...options,activateEntry:true},{build:builder,checkStartup:async()=>{throw Error('startup failed');}}),/startup failed/);
 assert.equal(JSON.parse(fs.readFileSync(pkg)).version,'0.5.0-dev.score.6');assert.equal(JSON.parse(fs.readFileSync(pkg)).keep,'other-session');
 assert.equal(JSON.parse(fs.readFileSync(options.configFile)).releaseVersion,'0.5.0-dev.score.6');assert(!fs.existsSync(path.join(root,'releases/current-release.cmd')));
 assert.equal(JSON.parse(fs.readFileSync(options.reportFile)).ok,false);
}));

test('switching keeps the last version pointer, and activating it again preserves rollback',()=>fixture(async({root,options,builder})=>{
 builder({output:path.join(root,'releases',options.version),developmentSettings:{}});
 const current=path.join(root,'releases/current-release.cmd'),previous=path.join(root,'releases/previous-release.cmd');
 const old='@set "XIN_CURRENT_RELEASE=0.5.0-dev.score.6"\r\n';fs.writeFileSync(current,old);
 activate(root,options.version);assert.equal(fs.readFileSync(previous,'utf8'),old);assert(fs.readFileSync(current,'utf8').includes(options.version));
 activate(root,options.version);assert.equal(fs.readFileSync(previous,'utf8'),old);assert(!fs.readdirSync(path.dirname(current)).some(f=>f.endsWith('.tmp')));
}));
test('missing manifest seed fails before startup',()=>fixture(async({options,builder})=>{
 let started=false;
 await assert.rejects(buildDevelopment(options,{build:args=>{builder(args);const file=path.join(args.output,'release-manifest.json'),m=JSON.parse(fs.readFileSync(file));m.files=m.files.filter(f=>f.path!=='development-settings.json');fs.writeFileSync(file,JSON.stringify(m));},checkStartup:async()=>{started=true;return{ok:true};}}),/seed not covered/);
 assert.equal(started,false);
}));
test('skip-startup cannot update the launchers',()=>fixture(async({options,builder})=>{
 await assert.rejects(buildDevelopment({...options,skipStartup:true,activateEntry:true},{build:builder}),/Cannot activate/);
}));
test('rollback preserves independent edits to package metadata',()=>fixture(async({pkg})=>{
 const undo=replaceVersion(pkg,'version','0.5.0-dev.score.7');const current=JSON.parse(fs.readFileSync(pkg));current.keep='new independent edit';fs.writeFileSync(pkg,JSON.stringify(current));undo();assert.equal(JSON.parse(fs.readFileSync(pkg)).keep,current.keep);
}));
test('both app-first orders seed shared settings; isolated acceptance uses the same path',()=>fixture(async({root})=>{
 const source=fs.readFileSync(path.join(__dirname,'bootstrap.cjs'),'utf8');
 for(const first of ['XML','XLD'])for(const acceptance of [false,true]){
  const directory=path.join(root,'boot-'+first+'-'+acceptance),appRoot=path.join(directory,'resources/app'),paths={appData:path.join(directory,'appData')};
  fs.mkdirSync(appRoot,{recursive:true});fs.writeFileSync(path.join(directory,'development-settings.json'),JSON.stringify({libraryRoot:path.join(root,'music'),analysisRoot:'analysis'}));fs.writeFileSync(path.join(directory,'runtime.json'),'{}');
  const app={setName(n){this.name=n;},getName(){return this.name;},getVersion:()=> '0.5.0-dev.score.7',setAppUserModelId(){},getPath:k=>paths[k],setPath:(k,v)=>paths[k]=v,quit:()=>assert.fail('unexpected quit')};
  const env=acceptance?{XLD_TEST:'1',XML_TEST:'1',XIN_RELEASE_TEST_ROOT:path.join(directory,'isolated'),XIN_RELEASE_TEST_ANALYSIS_ROOT:path.join(directory,'work/analysis')}:{};
  const run=()=>vm.runInNewContext(source,{require:n=>n==='node:fs'?fs:n==='node:path'?path:n==='electron'?{app,dialog:{showErrorBox:(_,msg)=>assert.fail(msg)}}:n.endsWith('runtime-config.cjs')?{apply:()=>({ok:true})}:n==='./release-shell.cjs'?{install(){}}:n.endsWith('main.cjs')?{}:assert.fail(n),process:{execPath:path.join(directory,first+'.exe'),env},__dirname:appRoot});
  run();const file=path.join(paths.appData,"Xin's Local Deck Beta/settings.json"),settings=JSON.parse(fs.readFileSync(file));
  assert.equal(settings.analysisRoot,acceptance?env.XIN_RELEASE_TEST_ANALYSIS_ROOT:path.join(directory,'analysis'));
  fs.writeFileSync(file,JSON.stringify({libraryRoot:'user-picked',analysisRoot:'keep-this'}));
  // Re-run in an independent app shell at the same base AppData, as the other app would start.
  paths.appData=path.join(directory,'appData');run();assert.equal(JSON.parse(fs.readFileSync(file)).analysisRoot,'keep-this');
 }
}));
