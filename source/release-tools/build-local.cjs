'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function validateDevelopmentSettings(value){
 if(!value||typeof value.libraryRoot!=='string'||!path.isAbsolute(value.libraryRoot)||typeof value.analysisRoot!=='string'||!value.analysisRoot.trim())throw Error('Development seed requires absolute libraryRoot and nonempty analysisRoot');
 return {libraryRoot:value.libraryRoot,analysisRoot:value.analysisRoot};
}
function build({sourceRoot,electronRoot,output,configFile,rcedit=process.env.XIN_RCEDIT,developmentSettings=null}){
 const development=developmentSettings===null?null:validateDevelopmentSettings(developmentSettings);
 for(const [key,value] of Object.entries({sourceRoot,electronRoot,output,configFile}))if(!value || !path.isAbsolute(value))throw Error('Absolute path required: '+key);
 if(fs.existsSync(output))throw Error('Output must be a new directory: '+output);
 const runtime=require(path.join(sourceRoot,'shared-analysis/runtime-config.cjs'));
 const resolved=runtime.read(configFile),raw=JSON.parse(fs.readFileSync(configFile)),version=raw.releaseVersion;
 if(typeof version!=='string' || !/^\d+\.\d+\.\d+(?:-[a-z0-9.]+)?$/.test(version))throw Error('Explicit releaseVersion required');
 const shippedConfig=runtime.rebase(configFile,output);
 const interfaceOnly=raw.kind==='interface-only';
 const inspection=runtime.inspect(resolved);if(!interfaceOnly&&!inspection.ok)throw Error('Runtime paths missing: '+JSON.stringify(inspection.missing));
 if(!fs.existsSync(path.join(electronRoot,'electron.exe')))throw Error('Electron distribution missing');
 for(const name of ['xld-runtime-baseline','fusion-runtime-baseline','shared-analysis'])if(!fs.existsSync(path.join(sourceRoot,name)))throw Error('Source missing: '+name);
 fs.mkdirSync(output,{recursive:true});
 fs.cpSync(electronRoot,output,{recursive:true,filter:file=>!['default_app.asar'].includes(path.basename(file))});
 fs.renameSync(path.join(output,'electron.exe'),path.join(output,'XLD.exe'));
 fs.copyFileSync(path.join(output,'XLD.exe'),path.join(output,'XML.exe'));
 const branding=require('./brand-exe.cjs').brand({output,sourceRoot,version,rcedit});
 const apps=path.join(output,'resources/apps');
 const excluded=new Set(['node_modules','.git','__pycache__','tests','desktop-build','scripts','.venv','artifacts']);
 for(const name of ['xld-runtime-baseline','fusion-runtime-baseline','shared-analysis']){
  const from=path.join(sourceRoot,name);
  fs.cpSync(from,path.join(apps,name),{recursive:true,filter:file=>(!interfaceOnly||require('./interface-policy.cjs').includeAppFile(path.relative(from,file))) && !path.relative(from,file).split(path.sep).some(part=>excluded.has(part)) && !path.basename(file).startsWith('start-') && !path.basename(file).startsWith('setup_') && !['development-settings.json','runtime.local.json','.env','auth.json','credentials.json'].includes(path.basename(file))});
 }
 // The listening score is shared code that XML loads from beside itself (../scoreview). Only what runs is shipped:
 // the render core, the material renderers and their stage assets, the clock,
 // and the adapter with the files it reads. Its tests and development pages stay out.
 // adapter/cues.cjs makes the marks (the default since 2026-11-14); export/ is the score video export.
 const scoreFiles=['score-presentation.js','score-view.js','score-mood.js','score-telegraph.js','score-radar-lamps.js','score-radar.js','assets/fonts/NationalPark-SemiBold.ttf','assets/fonts/NationalPark-OFL.txt','assets/fonts/BarlowCondensed-Medium.ttf','assets/fonts/BarlowCondensed-SemiBold.ttf','assets/fonts/BarlowCondensed-OFL.txt','assets/fonts/CourierPrime-Regular.ttf','assets/fonts/CourierPrime-OFL.txt','assets/fonts/PermanentMarker-Regular.ttf','assets/fonts/PermanentMarker-LICENSE.txt','score-surface.js','score-mist.js','score-terrain.js','score-flag.js','score-variation.js','score-style.cjs','media-clock.js','section-names.json','adapter/track-model.cjs','adapter/captions.cjs','adapter/cues.cjs','adapter/roles.cjs','tools/chord_consensus.cjs',
  'assets/mood/theatre-paper-material.png','assets/mood/performers.png','assets/mood/pianist.png',
  // The radar look's materials (score-radar.js MATERIAL_FILES; the asset pack the user accepted on 2026-11-18).
  ...['plate-top','plate-left','plate-radar','plate-right','plate-keys','plate-teleprinter','paper-dial','paper-tape','screw-slot','screw-cross','screw-brass','glass-smudge'].map(name=>'assets/radar/'+name+'.png'),
  'export/export-main.cjs','export/export-page.html','export/export-preload.cjs','export/export-render.js','export/mp4-writer.js'];
 if(fs.existsSync(path.join(sourceRoot,'scoreview')))for(const file of scoreFiles){const to=path.join(apps,'scoreview',file);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(path.join(sourceRoot,'scoreview',file),to);}
 const appRoot=path.join(output,'resources/app');fs.mkdirSync(appRoot,{recursive:true});
 fs.copyFileSync(path.join(__dirname,'bootstrap.cjs'),path.join(appRoot,'bootstrap.cjs'));
 fs.copyFileSync(path.join(__dirname,'release-shell.cjs'),path.join(appRoot,'release-shell.cjs'));
 if(interfaceOnly)for(const name of ['setup-core.cjs','setup-install.cjs','setup-window.cjs','setup-preload.cjs','setup.html','setup.js','setup.css'])fs.copyFileSync(path.join(__dirname,name),path.join(appRoot,name));
 const diagnostics=path.join(output,'resources/diagnostics');fs.mkdirSync(diagnostics,{recursive:true});
 for(const name of ['check-runtime.cjs','diagnose.cjs'])fs.copyFileSync(path.join(__dirname,name),path.join(diagnostics,name));
 fs.writeFileSync(path.join(output,'检查环境.cmd'),fs.readFileSync(path.join(__dirname,'check-environment.cmd'),'utf8').replace(/\r?\n/g,'\r\n'));
 for(const name of ['release-ui.js','release-ui.css'])fs.copyFileSync(path.join(__dirname,name),path.join(apps,'shared-analysis',name));
 for(const name of ['xld-runtime-baseline','fusion-runtime-baseline']){
  const index=path.join(apps,name,'index.html');
  fs.writeFileSync(index,fs.readFileSync(index,'utf8').replace('</head>','<link rel="stylesheet" href="../shared-analysis/release-ui.css">\n</head>').replace('</body>','<script src="../shared-analysis/release-ui.js"></script>\n</body>'));
  const preload=path.join(apps,name,'desktop/preload.cjs');
  fs.appendFileSync(preload,"\ncontextBridge.exposeInMainWorld('XinRelease',Object.freeze({info:()=>ipcRenderer.invoke('release:info'),help:()=>ipcRenderer.invoke('release:help'),status:locale=>ipcRenderer.invoke('release:status',locale),setup:locale=>ipcRenderer.invoke('release:setup',locale)}));\n");
  if(interfaceOnly){const file=path.join(apps,name,'package.json'),pkg=JSON.parse(fs.readFileSync(file));if(pkg.author&&typeof pkg.author==='object')delete pkg.author.email;delete pkg.scripts;fs.writeFileSync(file,JSON.stringify(pkg,null,2));}
 }
 fs.writeFileSync(path.join(appRoot,'package.json'),JSON.stringify({name:'xin-music-suite',version,main:'bootstrap.cjs'}));
 fs.writeFileSync(path.join(output,'runtime.json'),JSON.stringify(shippedConfig,null,2));
 const template=fs.readFileSync(path.join(__dirname,interfaceOnly?'INTERFACE-README.md':raw.kind==='isolated-runtime'?'BUNDLE-README.md':'RELEASE-README.md'),'utf8');
 fs.writeFileSync(path.join(output,'README.md'),template.replaceAll('{{VERSION}}',version));
 fs.writeFileSync(path.join(output,'使用说明.html'),fs.readFileSync(path.join(__dirname,interfaceOnly?'INTERFACE-GUIDE.html':'USER-GUIDE.html'),'utf8').replaceAll('{{VERSION}}',version));
 if(interfaceOnly)fs.copyFileSync(path.join(__dirname,'MODEL-SETUP.md'),path.join(output,'MODEL-SETUP.md'));
 if(interfaceOnly){fs.copyFileSync(path.resolve(sourceRoot,'../LICENSE'),path.join(output,'PROJECT-LICENSE.txt'));fs.copyFileSync(path.join(__dirname,'DISTRIBUTION-NOTICES.md'),path.join(output,'THIRD_PARTY_NOTICES.md'));}
 // Seed before the manifest is scanned, so a development build can never rely on a manual copy.
 if(development)fs.writeFileSync(path.join(output,'development-settings.json'),JSON.stringify(development,null,2)+'\n');
 const files=[];function scan(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())scan(file);else files.push({path:path.relative(output,file).replaceAll('\\','/'),bytes:fs.statSync(file).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')});}}
 scan(output);fs.writeFileSync(path.join(output,'release-manifest.json'),JSON.stringify({version,kind:raw.kind||'local-external-runtime',branding,appVersions:Object.fromEntries(['xld-runtime-baseline','fusion-runtime-baseline'].map(name=>[name,JSON.parse(fs.readFileSync(path.join(sourceRoot,name,'package.json'))).version])),createdAt:new Date().toISOString(),files},null,2));
 return {output,files:files.length,bytes:files.reduce((sum,file)=>sum+file.bytes,0)};
}
if(require.main===module){const [sourceRoot,electronRoot,output,configFile]=process.argv.slice(2);console.log(JSON.stringify(build({sourceRoot,electronRoot,output,configFile}),null,2));}
module.exports={build,validateDevelopmentSettings};
