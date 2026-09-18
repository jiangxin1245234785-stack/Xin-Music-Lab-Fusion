'use strict';
const fs=require('node:fs'),{spawn}=require('node:child_process');
function launch(executable,spawnProcess=spawn){
 if(!executable || !fs.existsSync(executable))return Promise.resolve({ok:false,error:'xld-not-found'});
 return new Promise(resolve=>{
  try{
   const child=spawnProcess(executable,[],{detached:true,windowsHide:true,stdio:'ignore'});
   child.once('error',error=>resolve({ok:false,error:'launch-failed',detail:error.message}));
   child.once('spawn',()=>{child.unref();resolve({ok:true});});
  }catch(error){resolve({ok:false,error:'launch-failed',detail:error.message});}
 });
}
module.exports={launch};
