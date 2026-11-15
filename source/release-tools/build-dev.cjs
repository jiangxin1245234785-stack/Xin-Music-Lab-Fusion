'use strict';
const fs=require('node:fs'),path=require('node:path');
const {build,validateDevelopmentSettings}=require('./build-local.cjs');
const {verify}=require('./verify.cjs');
const {checkStartup}=require('./check-dev-startup.cjs');
function replaceVersion(file,key,version){
 const raw=fs.readFileSync(file,'utf8'),value=JSON.parse(raw)[key];
 const pattern=new RegExp('("'+key+'"\\s*:\\s*)"[^"\\r\\n]*"');
 if(!pattern.test(raw))throw Error('Missing '+key+' in '+file);
 fs.writeFileSync(file,raw.replace(pattern,(_,prefix)=>prefix+JSON.stringify(version)));
 return ()=>{const current=fs.readFileSync(file,'utf8');if(JSON.parse(current)[key]===version)fs.writeFileSync(file,current.replace(pattern,(_,prefix)=>prefix+JSON.stringify(value)));};
}
function activate(project,version){
 const bundle=path.join(project,'releases',version);
 for(const app of ['XML','XLD'])if(!fs.existsSync(path.join(bundle,app+'.exe')))throw Error('Missing '+app+' executable');
 for(const app of ['XML','XLD']){
  const script=['@echo off','setlocal','set "XIN_CURRENT_RELEASE="','if not exist "%~dp0releases\\current-release.cmd" exit /b 1','call "%~dp0releases\\current-release.cmd"','if not defined XIN_CURRENT_RELEASE exit /b 1',`if not exist "%~dp0releases\\%XIN_CURRENT_RELEASE%\\${app}.exe" (`, '  echo The current development release is missing.', '  exit /b 1',')',`start "" "%~dp0releases\\%XIN_CURRENT_RELEASE%\\${app}.exe"`,''].join('\r\n');
  fs.writeFileSync(path.join(project,'启动'+app+'.cmd'),script);
 }
 // This is the one pointer both entry points read; switch it only after checks pass.
 const pointer=path.join(project,'releases/current-release.cmd'),next='@set "XIN_CURRENT_RELEASE='+version+'"\r\n';
 if(fs.existsSync(pointer)){
  if(fs.readFileSync(pointer,'utf8')===next)return;
  fs.copyFileSync(pointer,path.join(project,'releases/previous-release.cmd'));
 }
 const temp=pointer+'.'+process.pid+'.tmp';
 try{fs.writeFileSync(temp,next);fs.renameSync(temp,pointer);}finally{fs.rmSync(temp,{force:true});}
}
async function buildDevelopment(options,deps={}){
 const {sourceRoot,electronRoot,configFile,seedFile,rcedit,skipStartup=false,activateEntry=false,startupLibrary,startupAnalysis}=options;
 const project=path.resolve(sourceRoot,'..'),pkgFile=path.join(sourceRoot,'fusion-runtime-baseline/package.json');
 const version=options.version||JSON.parse(fs.readFileSync(pkgFile)).version.replace(/\.([0-9]+)$/,(_,n)=>'.'+(Number(n)+1));
 if(!/^\d+\.\d+\.\d+-dev\.[a-z0-9.]+$/.test(version))throw Error('Explicit development version required');
 if(skipStartup&&activateEntry)throw Error('Cannot activate an untested build');
 if(!skipStartup&&(!startupLibrary||!startupAnalysis))throw Error('Exe checks require isolated --startup-library and --startup-analysis');
 const output=options.output||path.join(project,'releases',version),reportFile=options.reportFile||path.join(project,'work','build-'+version,'report.json');
 if(fs.existsSync(output))throw Error('Output must be new: '+output);
 const seed=validateDevelopmentSettings(JSON.parse(fs.readFileSync(seedFile,'utf8')));
 fs.mkdirSync(path.dirname(reportFile),{recursive:true});
 const report={version,output,seedFile,checks:[],ok:false};const restore=[];
 try{
  restore.push(replaceVersion(pkgFile,'version',version));
  restore.push(replaceVersion(configFile,'releaseVersion',version));
  report.build=(deps.build||build)({sourceRoot,electronRoot,output,configFile,rcedit,developmentSettings:seed});
  let checked=(deps.verify||verify)(output);
  if(!checked.manifest.files.some(f=>f.path==='development-settings.json'))throw Error('Development seed not covered by manifest');
  if(checked.version!==version)throw Error('Manifest version mismatch');
  report.checks.push('development seed included in manifest','all '+checked.files+' file hashes verified');
  if(!skipStartup){
   report.startup=await (deps.checkStartup||checkStartup)({candidate:output,reportRoot:path.join(path.dirname(reportFile),'startup'),libraryRoot:startupLibrary,analysisRoot:startupAnalysis});
   if(!report.startup.ok)throw Error('Executable startup verification failed');
   report.checks.push('actual XML.exe and XLD.exe start on a fresh shared profile');
  }else report.startup={skipped:true};
  // Startup must not change any shipped files.
  checked=(deps.verify||verify)(output);report.checks.push('shipped hashes unchanged after startup');
  if(activateEntry){(deps.activate||activate)(project,version);report.checks.push('both root launchers share the verified release pointer');}
  report.ok=true;return report;
 }catch(error){for(const undo of restore.reverse())undo();report.error=error.stack;throw error;}
 finally{fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');}
}
function parse(argv){
 const flags={};for(let i=0;i<argv.length;i++){const key=argv[i];if(!key.startsWith('--'))throw Error('Unexpected argument '+key);if(['--skip-startup','--activate'].includes(key))flags[key]=true;else{if(!argv[i+1]||argv[i+1].startsWith('--'))throw Error('Missing value '+key);flags[key]=argv[++i];}}
 const project=path.resolve(__dirname,'../..');const absolute=(key,fallback)=>path.resolve(flags[key]||fallback);
 for(const key of ['--electron','--config','--seed'])if(!flags[key])throw Error('Required '+key);
 return {sourceRoot:absolute('--source',path.join(project,'source')),electronRoot:absolute('--electron'),configFile:absolute('--config'),seedFile:absolute('--seed'),rcedit:flags['--rcedit']||process.env.XIN_RCEDIT,version:flags['--version'],output:flags['--output']&&absolute('--output'),reportFile:flags['--report']&&absolute('--report'),skipStartup:Boolean(flags['--skip-startup']),activateEntry:Boolean(flags['--activate']),startupLibrary:flags['--startup-library']&&absolute('--startup-library'),startupAnalysis:flags['--startup-analysis']&&absolute('--startup-analysis')};
}
if(require.main===module)buildDevelopment(parse(process.argv.slice(2))).then(result=>console.log(JSON.stringify(result,null,2))).catch(e=>{console.error(e.stack);process.exitCode=1;});
module.exports={buildDevelopment,activate,replaceVersion,parse};
