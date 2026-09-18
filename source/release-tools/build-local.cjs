'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function build({sourceRoot,electronRoot,output,configFile,rcedit=process.env.XIN_RCEDIT}){
 for(const [key,value] of Object.entries({sourceRoot,electronRoot,output,configFile}))if(!value || !path.isAbsolute(value))throw Error('Absolute path required: '+key);
 if(fs.existsSync(output))throw Error('Output must be a new directory: '+output);
 const runtime=require(path.join(sourceRoot,'shared-analysis/runtime-config.cjs'));
 const resolved=runtime.read(configFile),raw=JSON.parse(fs.readFileSync(configFile)),version=raw.releaseVersion;
 if(typeof version!=='string' || !/^\d+\.\d+\.\d+(?:-[a-z0-9.]+)?$/.test(version))throw Error('Explicit releaseVersion required');
 const inspection=runtime.inspect(resolved);if(!inspection.ok)throw Error('Runtime paths missing: '+JSON.stringify(inspection.missing));
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
  fs.cpSync(from,path.join(apps,name),{recursive:true,filter:file=>!path.relative(from,file).split(path.sep).some(part=>excluded.has(part)) && !path.basename(file).startsWith('start-') && !path.basename(file).startsWith('setup_')});
 }
 const appRoot=path.join(output,'resources/app');fs.mkdirSync(appRoot,{recursive:true});
 fs.copyFileSync(path.join(__dirname,'bootstrap.cjs'),path.join(appRoot,'bootstrap.cjs'));
 fs.copyFileSync(path.join(__dirname,'release-shell.cjs'),path.join(appRoot,'release-shell.cjs'));
 const diagnostics=path.join(output,'resources/diagnostics');fs.mkdirSync(diagnostics,{recursive:true});
 for(const name of ['check-runtime.cjs','diagnose.cjs'])fs.copyFileSync(path.join(__dirname,name),path.join(diagnostics,name));
 fs.writeFileSync(path.join(output,'检查环境.cmd'),fs.readFileSync(path.join(__dirname,'check-environment.cmd'),'utf8').replace(/\r?\n/g,'\r\n'));
 for(const name of ['release-ui.js','release-ui.css'])fs.copyFileSync(path.join(__dirname,name),path.join(apps,'shared-analysis',name));
 for(const name of ['xld-runtime-baseline','fusion-runtime-baseline']){
  const index=path.join(apps,name,'index.html');
  fs.writeFileSync(index,fs.readFileSync(index,'utf8').replace('</head>','<link rel="stylesheet" href="../shared-analysis/release-ui.css">\n</head>').replace('</body>','<script src="../shared-analysis/release-ui.js"></script>\n</body>'));
  const preload=path.join(apps,name,'desktop/preload.cjs');
  fs.appendFileSync(preload,"\ncontextBridge.exposeInMainWorld('XinRelease',Object.freeze({info:()=>ipcRenderer.invoke('release:info'),help:()=>ipcRenderer.invoke('release:help'),status:locale=>ipcRenderer.invoke('release:status',locale)}));\n");
 }
 fs.writeFileSync(path.join(appRoot,'package.json'),JSON.stringify({name:'xin-music-suite',version,main:'bootstrap.cjs'}));
 fs.writeFileSync(path.join(output,'runtime.json'),JSON.stringify({...raw,paths:Object.fromEntries(Object.entries(raw.paths).map(([key,value])=>[key,path.isAbsolute(value)?value:path.relative(output,resolved.paths[key]).replaceAll('\\','/')]))},null,2));
 const template=fs.readFileSync(path.join(__dirname,raw.kind==='isolated-runtime'?'BUNDLE-README.md':'RELEASE-README.md'),'utf8');
 fs.writeFileSync(path.join(output,'README.md'),template.replaceAll('{{VERSION}}',version));
 fs.writeFileSync(path.join(output,'使用说明.html'),fs.readFileSync(path.join(__dirname,'USER-GUIDE.html'),'utf8').replaceAll('{{VERSION}}',version));
 const files=[];function scan(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())scan(file);else files.push({path:path.relative(output,file).replaceAll('\\','/'),bytes:fs.statSync(file).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')});}}
 scan(output);fs.writeFileSync(path.join(output,'release-manifest.json'),JSON.stringify({version,kind:raw.kind||'local-external-runtime',branding,appVersions:Object.fromEntries(['xld-runtime-baseline','fusion-runtime-baseline'].map(name=>[name,JSON.parse(fs.readFileSync(path.join(sourceRoot,name,'package.json'))).version])),createdAt:new Date().toISOString(),files},null,2));
 return {output,files:files.length,bytes:files.reduce((sum,file)=>sum+file.bytes,0)};
}
if(require.main===module){const [sourceRoot,electronRoot,output,configFile]=process.argv.slice(2);console.log(JSON.stringify(build({sourceRoot,electronRoot,output,configFile}),null,2));}
module.exports={build};
