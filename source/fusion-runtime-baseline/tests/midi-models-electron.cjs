'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {app,BrowserWindow,shell}=require('electron');
const root=process.env.XLD_MODELS_TEST_ROOT;if(!root)throw Error('Isolated XLD_MODELS_TEST_ROOT required');
const fixture=JSON.parse(fs.readFileSync(path.join(root,'fixture.json')));
process.env.XML_TEST='1';app.setPath('userData',fixture.xmlProfile);app.setPath('appData',fixture.appData);
const core=require('../desktop/xld-analysis-service.cjs').createService({analysisRoot:fixture.analysisRoot});
const opened=[];shell.openPath=async value=>{opened.push(value);return '';};
require('../desktop/main.cjs');
app.whenReady().then(async()=>{
 let win;
 try{
  for(let i=0;i<300;i++){win=BrowserWindow.getAllWindows()[0];if(win&&!win.webContents.isLoading())break;await new Promise(r=>setTimeout(r,50));}
  assert(win);win.webContents.setAudioMuted(true);const evaluate=code=>win.webContents.executeJavaScript(code);
  async function until(code){const end=Date.now()+45000;while(Date.now()<end){if(await evaluate(code))return;await new Promise(r=>setTimeout(r,100));}throw Error('Timeout: '+code);}
  await until("document.querySelector('#fusionStemSelect').options.length===7");
  const result=await core.run(fixture.track,'guitar-gaps',{stem:'guitar'});assert(result.cached);
  await evaluate("document.querySelector('#welcome')?.remove();document.querySelector('#fusionPanel').classList.add('is-open');document.querySelector('#fusionStemSelect').value='guitar';document.querySelector('#fusionStemSelect').dispatchEvent(new Event('change'))");
  await until("!document.querySelector('#fusionStemSelect').disabled && !document.querySelector('#fusionMidiReveal').disabled");
  await evaluate("document.querySelector('#fusionAudio').currentTime=12;document.querySelector('#fusionMidiReveal').click()");
  for(let i=0;i<100&&!opened.length;i++)await new Promise(r=>setTimeout(r,40));assert.equal(opened.at(-1),result.result.directory);
  await core.run(fixture.track,'basic-pitch',{stem:'guitar'});
  await evaluate("document.querySelector('#fusionResultsRefresh').click()");await new Promise(r=>setTimeout(r,400));
  await evaluate("document.querySelector('#fusionMidiReveal').click()");
  for(let i=0;i<100&&opened.length<2;i++)await new Promise(r=>setTimeout(r,40));assert.equal(opened.at(-1),(await core.readMidi(fixture.track,'guitar','basic-pitch')).directory);
  assert(await evaluate("document.querySelector('#fusionAudio').paused && Math.abs(document.querySelector('#fusionAudio').currentTime-12)<.1"));
  const report={pass:true,checks:['XML displays and opens GAPS MIDI','XML refresh follows selected current model','Playback position and paused state retained']};
  fs.writeFileSync(path.join(root,'xml-models-ui.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }catch(error){console.error(error);process.exitCode=1;}
 finally{win?.destroy();app.exit(process.exitCode||0);}
});
