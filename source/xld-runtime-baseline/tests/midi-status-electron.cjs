'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {app,BrowserWindow,shell,ipcMain}=require('electron');
const root=process.env.XLD_STATUS_TEST_ROOT;if(!root)throw Error('Isolated XLD_STATUS_TEST_ROOT required');
const fixture=JSON.parse(fs.readFileSync(path.join(root,'fixture.json')));
const profile=path.join(root,'status-profile-'+Date.now());fs.mkdirSync(profile);fs.copyFileSync(path.join(fixture.profile,'settings.json'),path.join(profile,'settings.json'));
const settings=JSON.parse(fs.readFileSync(path.join(profile,'settings.json')));settings.libraryRoot=path.dirname(path.dirname(fixture.track.filePath));fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify(settings));
process.env.XLD_TEST='1';process.env.PYTHONDONTWRITEBYTECODE='1';app.setPath('userData',profile);app.disableHardwareAcceleration();
let injectFailure=true,reads=0,requests=0;
const opened=[],checks=[],errors=[];
shell.openPath=async value=>{opened.push(value);return '';};
const handle=ipcMain.handle.bind(ipcMain);
ipcMain.handle=(channel,listener)=>handle(channel,async(event,payload)=>{
 if(channel==='assets:read')reads++;
 if(channel==='assets:run'){
  requests++;
  if(injectFailure)return {ok:false,error:'analysis-failed',detail:'MIDI 时间校验失败',task:{taskId:'test-failed-'+requests,trackId:payload.trackId,engine:payload.engine,status:'failed',progress:.92,phase:'failed',message:'MIDI 时间校验失败'}};
 }
 return listener(event,payload);
});
require('../desktop/main.cjs');
app.whenReady().then(async()=>{
 let win;
 try{
  for(let i=0;i<300;i++){win=BrowserWindow.getAllWindows()[0];if(win&&!win.webContents.isLoading())break;await new Promise(r=>setTimeout(r,50));}
  assert(win);win.webContents.setAudioMuted(true);
  win.webContents.on('console-message',event=>{if(event.level==='error'||event.level===3)errors.push(event.message);});
  const evaluate=code=>win.webContents.executeJavaScript(code);
  async function until(code){for(let i=0;i<450;i++){if(await evaluate(code))return;await new Promise(r=>setTimeout(r,100));}throw Error('Timeout: '+code);}
  async function refresh(){const previous=reads;await evaluate("document.querySelector('#derivedRefresh').click()");for(let i=0;i<100&&reads===previous;i++)await new Promise(r=>setTimeout(r,30));assert(reads>previous);await new Promise(r=>setTimeout(r,250));}
  const failure="document.querySelector('#derivedStatus').textContent.includes('生成失败：MIDI 时间校验失败')";
  const ready="!document.querySelector('#derivedTranscribe').disabled";
  await until('window.__xldAppReady===true');
  await evaluate("document.querySelector('#localeControl [data-locale=\"zh-CN\"]').click();[...document.querySelectorAll('.album-card')].find(card=>card.textContent.includes('Forever Howlong')).click()");
  await evaluate(`document.querySelector('[data-track-id="${fixture.track.id}"]').click()`);
  await until("document.querySelector('#derivedSelect').options.length===7");
  await evaluate("document.querySelector('#derivedMidiSelect').value='guitar';document.querySelector('#derivedMidiSelect').dispatchEvent(new Event('change'))");
  await until(ready+"&&document.querySelector('[data-midi-engine=\"guitar-gaps\"].cached')");
  const before=await evaluate(`window.XLD.readDerived(${JSON.stringify(fixture.track.id)})`);
  await evaluate("document.querySelector('#derivedForce').checked=true;document.querySelector('#derivedForce').dispatchEvent(new Event('change'));document.querySelector('#derivedTranscribe').click()");
  await until(failure+'&&'+ready);await refresh();assert(await evaluate(failure));
  await evaluate("window.dispatchEvent(new Event('focus'))");await new Promise(r=>setTimeout(r,350));assert(await evaluate(failure));
  const retained=await evaluate(`window.XLD.readDerived(${JSON.stringify(fixture.track.id)})`);
  assert.equal(retained.midi.guitar.runId,before.midi.guitar.runId);
  checks.push('Failed regeneration keeps the error after manual/focus refresh and preserves cached MIDI');
  await evaluate("document.querySelector('[data-midi-engine=\"basic-pitch\"]').click()");
  assert(!(await evaluate(failure)));assert(await evaluate("document.querySelector('#derivedMidi').disabled"));
  await evaluate("document.querySelector('#derivedTranscribe').click()");await until(failure+'&&'+ready);await refresh();assert(await evaluate(failure));
  await evaluate("document.querySelector('#derivedMidiSelect').value='piano';document.querySelector('#derivedMidiSelect').dispatchEvent(new Event('change'))");
  assert(!(await evaluate(failure)));
  await evaluate("document.querySelector('#derivedMidiSelect').value='guitar';document.querySelector('#derivedMidiSelect').dispatchEvent(new Event('change'))");assert(await evaluate(failure));
  checks.push('Missing-result failures remain explicit and are scoped to the selected instrument/model');
  await evaluate("document.querySelector('#localeControl [data-locale=\"en-US\"]').click()");
  await until("document.querySelector('#derivedStatus').textContent.includes('Failed: MIDI timing validation failed')");
  await evaluate("document.querySelector('#localeControl [data-locale=\"zh-CN\"]').click()");await until(failure);
  async function capture(name){win.setContentSize(1380,960);await new Promise(r=>setTimeout(r,350));await evaluate("document.querySelector('.derived-card').scrollIntoView({block:'start'})");await new Promise(r=>setTimeout(r,300));const rect=await evaluate("(()=>{const r=document.querySelector('.derived-card').getBoundingClientRect();return {x:Math.floor(r.x),y:Math.max(0,Math.floor(r.y)),width:Math.ceil(r.width),height:Math.ceil(r.height)}})()");fs.writeFileSync(path.join(root,name+'.png'),(await win.webContents.capturePage(rect)).toPNG());}
  await capture('status-failure');
  injectFailure=false;
  await evaluate("document.querySelector('[data-midi-engine=\"guitar-gaps\"]').click();document.querySelector('#derivedForce').checked=false;document.querySelector('#derivedForce').dispatchEvent(new Event('change'));window.__tasks=[];window.XLD.onAnalysisTask(t=>window.__tasks.push(t));document.querySelector('#derivedTranscribe').click()");
  await until(ready+"&&window.__tasks.some(t=>t.engine==='guitar-gaps'&&t.status==='complete')");await refresh();
  assert(!(await evaluate(failure)));assert(await evaluate("!document.querySelector('#derivedMidi').disabled"));
  assert(await evaluate("document.querySelector('#derivedStatus').textContent.includes('2915')"));
  await evaluate("document.querySelector('#derivedMidi').click()");for(let i=0;i<100&&!opened.length;i++)await new Promise(r=>setTimeout(r,30));
  assert.equal(opened[0],before.variants.guitar['guitar-gaps'].directory);
  await capture('status-success');
  checks.push('Successful retry clears the failure and exposes the verified full-song MIDI folder');
  assert.deepEqual(errors,[]);const report={pass:true,checks,errors,opened};fs.writeFileSync(path.join(root,'status-ui.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }catch(error){console.error(error);if(win){console.error(await win.webContents.executeJavaScript("document.querySelector('#derivedStatus')?.textContent"));fs.writeFileSync(path.join(root,'status-ui-failure.png'),(await win.webContents.capturePage()).toPNG());}process.exitCode=1;}
 finally{win?.destroy();app.exit(process.exitCode||0);}
});
