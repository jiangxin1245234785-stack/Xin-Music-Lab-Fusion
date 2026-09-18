'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {configure}=require('./configure-bundle.cjs'),{build}=require('./build-local.cjs');
function buildInterface({sourceRoot,electronRoot,output,version,rcedit}){
 if(!output||!path.isAbsolute(output))throw Error('Absolute output required');
 const base=path.join(output,'user-runtime'),scratch=fs.mkdtempSync(path.join(path.dirname(output),'.xin-interface-')),configFile=path.join(scratch,'runtime.json');
 try{
 const c=configure({runtimeRoot:path.join(base,'base'),configFile,releaseVersion:version,channel:'preview',refinementRoot:path.join(base,'audiosep'),refinementRoformerRoot:path.join(base,'refinement'),yourmt3Root:path.join(base,'yourmt3'),muscriptorRoot:path.join(base,'muscriptor'),muscriptorPython:path.join(base,'muscriptor/python.exe')});
 c.kind='interface-only';fs.writeFileSync(configFile,JSON.stringify(c,null,2));
 return build({sourceRoot,electronRoot,output,configFile,rcedit});
 }finally{if(fs.existsSync(configFile))fs.unlinkSync(configFile);fs.rmdirSync(scratch);}
}
if(require.main===module){const [sourceRoot,electronRoot,output,version,rcedit]=process.argv.slice(2);console.log(JSON.stringify(buildInterface({sourceRoot,electronRoot,output,version,rcedit})));}
module.exports={buildInterface};
