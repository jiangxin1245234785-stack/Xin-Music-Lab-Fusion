'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {app,BrowserWindow,shell,ipcMain}=require('electron');
const root=process.env.XLD_SEPARATION_TEST_ROOT;if(!root)throw Error('Isolated XLD_SEPARATION_TEST_ROOT required');
const fixture=JSON.parse(fs.readFileSync(path.join(root,'fixture.json'))),profile=path.join(root,'separation-profile-'+Date.now());
fs.mkdirSync(profile);fs.copyFileSync(path.join(fixture.profile,'settings.json'),path.join(profile,'settings.json'));
app.setPath('userData',profile);process.env.XLD_TEST='1';process.env.PYTHONDONTWRITEBYTECODE='1';app.disableHardwareAcceleration();
const opened=[],checks=[],errors=[];shell.openPath=async value=>{opened.push(value);return '';};
let fail=false;const handle=ipcMain.handle.bind(ipcMain);
ipcMain.handle=(channel,listener)=>handle(channel,async(event,payload)=>{
 if(channel==='assets:run'&&fail)return {ok:false,error:'analysis-failed',detail:'测试失败保留缓存'};
 return listener(event,payload);
});
require('../desktop/main.cjs');
app.whenReady().then(async()=>{
 let win;
 try{
  for(let i=0;i<300;i++){win=BrowserWindow.getAllWindows()[0];if(win&&!win.webContents.isLoading())break;await new Promise(r=>setTimeout(r,50));}
  assert(win);win.webContents.setAudioMuted(true);win.webContents.on('console-message',event=>{if(event.level==='error'||event.level===3)errors.push(event.message);});
  const evaluate=code=>win.webContents.executeJavaScript(code);
  async function until(code){for(let i=0;i<500;i++){if(await evaluate(code))return;await new Promise(r=>setTimeout(r,100));}throw Error('Timeout: '+code);}
  const read=()=>evaluate(`window.XLD.readDerived(${JSON.stringify(fixture.track.id)})`);
  await until('window.__xldAppReady===true');
  await evaluate("document.querySelector('#localeControl [data-locale=\"zh-CN\"]').click();[...document.querySelectorAll('.album-card')].find(card=>card.textContent.includes('LAST WALTZ')).click()");
  await evaluate(`document.querySelector('[data-track-id="${fixture.track.id}"]').click()`);
  await evaluate("document.querySelector('[data-workspace-tab=\"stems\"]').click()");
  await until("document.querySelectorAll('[data-stem-engine]').length===2&&!document.querySelector('#derivedSeparate').disabled&&document.querySelector('#derivedSelect').options.length===7");
  assert(await evaluate("document.querySelector('[data-stem-engine=\"bs-roformer-sw\"].selected').textContent.includes('默认')"));
  const before=await read();assert.equal(before.engine,'bs-roformer-sw');
  await evaluate("document.querySelector('[data-stem-engine=\"demucs-6s\"]').click()");
  assert.equal((await read()).engine,'bs-roformer-sw','Card selection alone does not activate');
  await evaluate("document.querySelector('#derivedSelect').value='guitar';document.querySelector('#derivedSelect').dispatchEvent(new Event('change'));document.querySelector('#derivedAudition').click()");
  await until("document.querySelector('#audioElement').readyState>=2&&!document.querySelector('#derivedAudition').disabled");
  await evaluate("document.querySelector('#audioElement').pause();document.querySelector('#audioElement').currentTime=123;document.querySelector('#derivedSeparate').click()");
  await until("document.querySelector('#derivedWavHint').textContent.includes('Demucs')&&!document.querySelector('#derivedSeparate').disabled");
  const demucs=await read();assert.equal(demucs.engine,'demucs-6s');assert(demucs.midi.guitar.ok);
  await until(`document.querySelector('#audioElement').src===${JSON.stringify(demucs.stems.find(s=>s.name==='guitar').audioUrl)}`);
  assert(Math.abs(await evaluate("document.querySelector('#audioElement').currentTime")-123)<1);
  assert(await evaluate("document.querySelector('#audioElement').paused"));
  assert.equal(await evaluate("document.querySelector('#derivedSelect').value"),'guitar');
  checks.push('Default/alternate menu; selecting a card is reversible; activation preserves instrument, playhead and pause state');
  await evaluate("document.querySelector('#derivedWav').click();document.querySelector('[data-stem-engine=\"bs-roformer-sw\"]').click();document.querySelector('#derivedSeparate').click()");
  await until("document.querySelector('#derivedWavHint').textContent.includes('BS-RoFormer')&&!document.querySelector('#derivedSeparate').disabled");
  const restored=await read();assert.equal(restored.midi.guitar.runId,before.midi.guitar.runId);assert.equal(restored.midi.guitar.sourceRunId,restored.runId);
  assert.equal(opened[0],demucs.directory);assert(await evaluate("!document.querySelector('#derivedMidi').disabled"));
  checks.push('Switching back restores the correct MIDI and WAV folder without another inference');
  fail=true;await evaluate("document.querySelector('#derivedForce').checked=true;document.querySelector('#derivedForce').dispatchEvent(new Event('change'));document.querySelector('#derivedSeparate').click()");
  await until("document.querySelector('#derivedStatus').textContent.includes('测试失败保留缓存')&&!document.querySelector('#derivedSeparate').disabled");
  await evaluate("document.querySelector('#derivedRefresh').click()");await new Promise(r=>setTimeout(r,400));assert(await evaluate("document.querySelector('#derivedStatus').textContent.includes('测试失败保留缓存')"));assert.equal((await read()).runId,restored.runId);
  fail=false;await evaluate("document.querySelector('#derivedForce').checked=false;document.querySelector('#derivedForce').dispatchEvent(new Event('change'));document.querySelector('#derivedSeparate').click()");
  await until("!document.querySelector('#derivedStatus').textContent.includes('测试失败保留缓存')&&!document.querySelector('#derivedSeparate').disabled");
  checks.push('Failure remains visible after refresh; retry retains valid assets');
  for(const [width,height,name] of [[1380,1060,'separation-wide'],[960,900,'separation-narrow']]){
   win.setContentSize(width,height);await new Promise(r=>setTimeout(r,400));await evaluate("document.querySelector('.derived-card').scrollIntoView({block:'start'})");await new Promise(r=>setTimeout(r,300));
   const layout=await evaluate("(()=>{const card=document.querySelector('.derived-card'),r=card.getBoundingClientRect();return {overflow:card.scrollWidth>card.clientWidth+1,rect:{x:Math.floor(r.x),y:Math.max(0,Math.floor(r.y)),width:Math.ceil(r.width),height:Math.ceil(r.height)}}})()");assert(!layout.overflow);
   fs.writeFileSync(path.join(root,name+'.png'),(await win.webContents.capturePage(layout.rect)).toPNG());
  }
  await evaluate("document.querySelector('#localeControl [data-locale=\"en-US\"]').click()");await until("document.querySelector('#derivedWavHint').textContent.includes('Playback & MIDI source')");
  assert.deepEqual(errors,[]);const report={pass:true,checks,errors,opened};fs.writeFileSync(path.join(root,'separation-ui.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }catch(error){console.error(error);if(win){console.error(await win.webContents.executeJavaScript("document.querySelector('.derived-card')?.innerText"));fs.writeFileSync(path.join(root,'separation-ui-failure.png'),(await win.webContents.capturePage()).toPNG());}process.exitCode=1;}
 finally{win?.destroy();app.exit(process.exitCode||0);}
});
