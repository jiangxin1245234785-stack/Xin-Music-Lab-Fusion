'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {app,BrowserWindow,shell}=require('electron');
const root=process.env.XLD_SEPARATION_TEST_ROOT;if(!root)throw Error('Isolated root required');
const fixture=JSON.parse(fs.readFileSync(path.join(root,'fixture.json'))),profile=path.join(root,'xml-separation-profile-'+Date.now()),appData=path.join(root,'xml-separation-appdata');
fs.mkdirSync(profile,{recursive:true});fs.mkdirSync(path.join(appData,"Xin's Local Deck Beta"),{recursive:true});fs.copyFileSync(path.join(fixture.profile,'settings.json'),path.join(appData,"Xin's Local Deck Beta/settings.json"));
process.env.XML_TEST='1';app.setPath('userData',profile);app.setPath('appData',appData);
const core=require('../desktop/xld-analysis-service.cjs').createService({analysisRoot:fixture.analysisRoot});
const opened=[];shell.openPath=async value=>{opened.push(value);return '';};
require('../desktop/main.cjs');
app.whenReady().then(async()=>{
 let win;
 try{
  for(let i=0;i<300;i++){win=BrowserWindow.getAllWindows()[0];if(win&&!win.webContents.isLoading())break;await new Promise(r=>setTimeout(r,50));}
  assert(win);win.webContents.setAudioMuted(true);const evaluate=s=>win.webContents.executeJavaScript(s);
  async function until(code){for(let i=0;i<600;i++){if(await evaluate('Boolean('+code+')'))return;await new Promise(r=>setTimeout(r,100));}throw Error('Timeout: '+code);}
  await until("window.XinsMusicLabFusion&&document.querySelector('#fusionStemSelect')");
  await evaluate(`localStorage.setItem('xins-fusion-last-track',${JSON.stringify(fixture.track.id)});localStorage.setItem('xins-fusion-source-mode','internal')`);win.webContents.reload();
  await new Promise(r=>setTimeout(r,1000));await until("document.querySelector('#fusionStemSelect')?.options.length===7");
  await evaluate("document.querySelector('#welcome')?.remove();document.querySelector('#fusionPanel').classList.add('is-open');document.querySelector('#fusionStemSelect').value='guitar';document.querySelector('#fusionStemSelect').dispatchEvent(new Event('change'))");
  await until("!document.querySelector('#fusionStemSelect').disabled&&!document.querySelector('#fusionMidiReveal').disabled");
  const roformer=await core.readMidi(fixture.track,'guitar');assert.equal(roformer.noteCount,1633);
  await evaluate("document.querySelector('#fusionAudio').pause();document.querySelector('#fusionAudio').currentTime=123;document.querySelector('#fusionMidiReveal').click()");
  for(let i=0;i<50&&!opened.length;i++)await new Promise(r=>setTimeout(r,50));assert.equal(opened[0],roformer.directory);
  assert((await core.run(fixture.track,'demucs-6s')).cached);
  await evaluate("document.querySelector('#fusionResultsRefresh').click()");await until("document.querySelector('#fusionStemSelect').value==='original'&&!document.querySelector('#fusionStemSelect').disabled");
  assert(await evaluate("Math.abs(document.querySelector('#fusionAudio').currentTime-123)<.1&&document.querySelector('#fusionAudio').paused"));
  await evaluate("document.querySelector('#fusionStemSelect').value='guitar';document.querySelector('#fusionStemSelect').dispatchEvent(new Event('change'))");await until("!document.querySelector('#fusionStemSelect').disabled&&!document.querySelector('#fusionMidiReveal').disabled");
  const legacy=await core.readMidi(fixture.track,'guitar');assert.notEqual(legacy.sourceRunId,roformer.sourceRunId);
  const reused=await evaluate(`window.XinsMusicLabFusion.runSeparation(${JSON.stringify(fixture.track.id)},false)`);assert(reused.cached);assert.equal(reused.result.engine,'demucs-6s');
  assert((await core.run(fixture.track,'bs-roformer-sw')).cached);
  await evaluate("document.querySelector('#fusionResultsRefresh').click()");await until("document.querySelector('#fusionStemSelect').value==='original'&&!document.querySelector('#fusionStemSelect').disabled");
  await evaluate("document.querySelector('#fusionStemSelect').value='guitar';document.querySelector('#fusionStemSelect').dispatchEvent(new Event('change'))");await until("!document.querySelector('#fusionMidiReveal').disabled&&!document.querySelector('#fusionStemSelect').disabled");
  const midi=await evaluate(`window.XinsMusicLabFusion.runMidi(${JSON.stringify(fixture.track.id)},'guitar',false)`);assert(midi.cached);assert.equal(midi.result.runId,roformer.runId);assert.equal(midi.result.engine,'guitar-gaps');
  const report={pass:true,checks:['XML reads RoFormer and opens its MIDI','Refresh after source change retains time and pause','Legacy MIDI restores with Demucs','Convenience actions reuse the current WAV/MIDI model','Returning to RoFormer restores its MIDI']};fs.writeFileSync(path.join(root,'xml-separation-ui.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }catch(error){console.error(error);if(win)console.error(await win.webContents.executeJavaScript("document.querySelector('#fusionStemStatus')?.textContent"));process.exitCode=1;}
 finally{await core.run(fixture.track,'bs-roformer-sw');win?.destroy();app.exit(process.exitCode||0);}
});
