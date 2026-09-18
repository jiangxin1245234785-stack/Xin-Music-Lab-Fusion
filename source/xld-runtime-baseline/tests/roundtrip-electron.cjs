'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {app,BrowserWindow}=require('electron');
const {writeRequest}=require('../core/open-request.cjs');
const root=process.env.XLD_ROUNDTRIP_ROOT;if(!root)throw Error('Isolated XLD_ROUNDTRIP_ROOT required');
const fixture=JSON.parse(fs.readFileSync(path.join(root,'fixture.json')));
process.env.XLD_TEST='1';process.env.XLD_SINGLE_INSTANCE_TEST='1';app.setPath('userData',fixture.xldProfile);app.disableHardwareAcceleration();
require('../desktop/main.cjs');
if(process.env.XLD_ROUNDTRIP_SECONDARY!=='1')app.whenReady().then(async()=>{
 let win,child;
 try{
  for(let i=0;i<300;i++){win=BrowserWindow.getAllWindows()[0];if(win&&!win.webContents.isLoading())break;await new Promise(r=>setTimeout(r,50));}
  assert(win);win.webContents.setAudioMuted(true);const evaluate=code=>win.webContents.executeJavaScript(code);
  async function until(code){const end=Date.now()+45000;while(Date.now()<end){if(await evaluate(code))return;await new Promise(r=>setTimeout(r,100));}throw Error('Timeout '+code);}
  await until('window.__xldAppReady===true');
  await writeRequest(fixture.analysisRoot,{source:fixture.tracks[0].filePath,locale:'zh-CN'});
  await evaluate("window.dispatchEvent(new Event('focus'))");await until("document.querySelector('#analysisTargetTitle').textContent==='LAST WALTZ'");
  await evaluate("document.querySelector('#derivedAudition').click()");await until("!document.querySelector('#audioElement').paused");
  await evaluate("document.querySelector('#audioElement').pause();document.querySelector('#audioElement').currentTime=35");
  await writeRequest(fixture.analysisRoot,{source:fixture.tracks[1].filePath,locale:'en-US'});
  child=spawn(process.execPath,[__filename],{windowsHide:true,stdio:'pipe',env:{...process.env,XLD_ROUNDTRIP_SECONDARY:'1'}});
  let childError='';child.stderr.on('data',chunk=>childError+=chunk);
  const exit=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Second XLD did not exit')),15000);child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);resolve(code);});});
  assert.equal(exit,0,childError);
  await until("document.querySelector('#analysisTargetTitle').textContent==='Plein Soleil'");
  assert.equal(BrowserWindow.getAllWindows().length,1);
  assert(await evaluate("document.querySelector('#nowTitle').textContent==='LAST WALTZ' && document.querySelector('#audioElement').paused && Math.abs(document.querySelector('#audioElement').currentTime-35)<.1"));
  await until("document.documentElement.lang==='en-US'");
  assert.equal(fs.existsSync(path.join(fixture.analysisRoot,'.xml-open-request.json')),false);
  const report={pass:true,checks:['Existing XLD receives XML selection','Second launch exits and reuses the existing window','Selection preserves current audio and 35-second paused position','Locale follows hand-off','Request consumed once']};
  fs.writeFileSync(path.join(root,'xld-roundtrip.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }catch(error){console.error(error);process.exitCode=1;}
 finally{if(child && child.exitCode===null)child.kill();win?.destroy();app.exit(process.exitCode||0);}
});
