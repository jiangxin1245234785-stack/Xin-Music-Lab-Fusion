'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {includeAppFile}=require('./interface-policy.cjs');
for(const f of ['a/model.safetensors','a/MODEL.PTH','a/weights/data.json','analysis-midi/vendor/adtof_pytorch/model.py','.env.local','settings.json','sample.wav','model.onnx'])assert(!includeAppFile(f),f);
for(const f of ['analysis-midi/runner.py','analysis-midi/models.json','app.js','assets/icon.ico','LICENSE'])assert(includeAppFile(f),f);
for(const f of ['vendor','vendor/glitch-generator','vendor/butterchurn-2.6.7.min.js','vendor/butterchurn-presets-2.4.7.min.js','vendor/LICENSE-butterchurn.txt','vendor/LICENSE-butterchurn-presets.txt','vendor/glitch-generator/6.6.1-integration-v.3/browser/index.js'])assert(includeAppFile(f),f);
for(const f of ['analysis-midi/vendor','analysis-refine/vendor/models/base.py','vendor/unknown.js','vendor/glitch-generator/6.5.1-integration-iii.1/browser/index.js','vendor/glitch-generator/6.6.1-integration-v.3/token.json'])assert(!includeAppFile(f),f);
const code=fs.readFileSync(path.join(__dirname,'bootstrap.cjs'),'utf8');
async function boot(kind){let main=false,warnings=0;const config={kind},app={setName(){},setAppUserModelId(){},getVersion:()=> 'test',whenReady:()=>Promise.resolve()};
const fakeFs={readFileSync:()=>JSON.stringify(config),existsSync:()=>false};
vm.runInNewContext(code,{__dirname:path.join(__dirname,'fixture/resources/app'),process:{execPath:'XLD.exe',env:{}},require:n=>n==='node:fs'?fakeFs:n==='node:path'?path:n==='electron'?{app,dialog:{showMessageBox:()=>warnings++,showErrorBox:()=>assert.fail('Startup error')}}:n.endsWith('runtime-config.cjs')?{apply:()=>({ok:false,missing:[{key:'XLD_PYTHON',path:'not-installed'}]})}:n==='./release-shell.cjs'?{install:options=>assert.equal(options.interfaceOnly,kind==='interface-only')}:n.endsWith('main.cjs')?(main=true,{}):assert.fail(n)});
await Promise.resolve();assert(main);return warnings;}
(async()=>{assert.equal(await boot('interface-only'),0);assert.equal(await boot('isolated-runtime'),1);console.log('Interface: weight/vendor/private-file exclusions; missing runtime boots without warning; legacy warning retained PASS');})().catch(e=>{console.error(e);process.exitCode=1;});
