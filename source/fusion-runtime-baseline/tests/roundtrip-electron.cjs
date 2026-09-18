'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {app,BrowserWindow,ipcMain}=require('electron');
const root=process.env.XML_ROUNDTRIP_ROOT;if(!root)throw Error('Isolated XML_ROUNDTRIP_ROOT required');
const fixture=JSON.parse(fs.readFileSync(path.join(root,'fixture.json'))),track=fixture.tracks[0];
process.env.XML_TEST='1';app.setPath('userData',fixture.xmlProfile);app.setPath('appData',fixture.appData);
const manifestPath=path.join(fixture.directory,'music-lab.json'),stemPath=path.join(fixture.directory,'stems.json');
const originalManifest=fs.readFileSync(manifestPath,'utf8'),originalStems=fs.readFileSync(stemPath,'utf8');
const errors=[],checks=[];
// Exercise the real XML hand-off writer; keep this test from opening a user window.
const childProcess=require('node:child_process'),realSpawn=childProcess.spawn;let launches=0;
childProcess.spawn=(command,args,options)=>{
 if(args?.[0]==='/c' && String(args[1]).endsWith('start-dev.cmd')){launches++;return {unref(){}};}
 return realSpawn(command,args,options);
};
require('../desktop/main.cjs');
app.whenReady().then(async()=>{
 let win;
 try{
  for(let i=0;i<300;i++){win=BrowserWindow.getAllWindows()[0];if(win&&!win.webContents.isLoading())break;await new Promise(r=>setTimeout(r,50));}
  assert(win);win.webContents.setAudioMuted(true);
  win.webContents.on('console-message',event=>{if(event.level==='error'||event.level===3)errors.push(event.message);});
  const evaluate=code=>win.webContents.executeJavaScript(code);
  async function until(code){const end=Date.now()+45000;while(Date.now()<end){if(await evaluate(code))return;await new Promise(r=>setTimeout(r,100));}throw Error('Timeout '+code);}
  await until("document.querySelector('#fusionStemSelect').options.length===7");
  await evaluate("document.querySelector('#welcome')?.remove();document.querySelector('#fusionPanel').classList.add('is-open');document.querySelector('#fusionAudio').currentTime=35");
  await until("Math.abs(document.querySelector('#fusionAudio').currentTime-35)<.1");
  assert.equal(await evaluate("document.querySelector('#fusionAnalysisOptions').open"),false);
  assert(await evaluate("document.querySelector('#fusionOpenXldLab').textContent.includes('XLD')"));
  await evaluate("document.querySelector('#fusionOpenXldLab').click()");
  for(let i=0;i<50&&launches<1;i++)await new Promise(r=>setTimeout(r,50));assert.equal(launches,1);
  const request=JSON.parse(fs.readFileSync(path.join(fixture.analysisRoot,'.xml-open-request.json')));
  assert.equal(request.source,track.filePath);assert.equal(request.locale,'zh-CN');
  checks.push('Collapsed analysis controls and real XML hand-off request');
  function timeline(label){const value=JSON.parse(originalManifest);value.analyses[0].segments[0].label=label;fs.writeFileSync(manifestPath,JSON.stringify(value));}
  timeline('chorus');
  await evaluate("window.dispatchEvent(new Event('focus'))");
  await until("document.querySelector('#fusionSection').textContent==='chorus'");
  assert(await evaluate("document.querySelector('#fusionAudio').paused && Math.abs(document.querySelector('#fusionAudio').currentTime-35)<.1"));
  checks.push('Returning focus reloads timeline while preserving pause and 35 seconds');
  await evaluate("document.querySelector('#fusionStemSelect').value='bass';document.querySelector('#fusionStemSelect').dispatchEvent(new Event('change'))");
  await until("!document.querySelector('#fusionStemSelect').disabled && document.querySelector('#fusionAudio').src.endsWith('bass.wav')");
  await evaluate("document.querySelector('#fusionPlay').click()");await until("!document.querySelector('#fusionAudio').paused");
  timeline('verse');
  await evaluate("document.querySelector('#fusionResultsRefresh').click()");
  await until("document.querySelector('#fusionSection').textContent==='verse'");
  assert(await evaluate("!document.querySelector('#fusionAudio').paused && document.querySelector('#fusionAudio').src.endsWith('bass.wav') && document.querySelector('#fusionAudio').currentTime>=35"));
  checks.push('Manual update keeps the playing stem and position');
  await until("!document.querySelector('#fusionMidiReveal').disabled");
  const midiFile=path.join(fixture.directory,'midi','bass.json'),midiText=fs.readFileSync(midiFile,'utf8');
  try {
    fs.rmSync(midiFile);await evaluate("window.dispatchEvent(new Event('focus'))");
    await until("document.querySelector('#fusionMidiReveal').disabled");
  } finally {fs.writeFileSync(midiFile,midiText);}
  await evaluate("window.dispatchEvent(new Event('focus'))");await until("!document.querySelector('#fusionMidiReveal').disabled");
  checks.push('MIDI availability refreshes when returning from XLD');
  await evaluate("document.querySelector('#fusionPlay').click()");
  fs.writeFileSync(manifestPath,'{invalid');await evaluate("document.querySelector('#fusionResultsRefresh').click()");
  await until("document.querySelector('#fusionAnalysisStatus').textContent.includes('保留')");
  assert.equal(await evaluate("document.querySelector('#fusionSection').textContent"),'verse');timeline('verse');
  const stale=JSON.parse(originalStems);stale.source.mtimeMs+=10000;fs.writeFileSync(stemPath,JSON.stringify(stale));
  const position=await evaluate("document.querySelector('#fusionAudio').currentTime");await evaluate("window.dispatchEvent(new Event('focus'))");
  await until("document.querySelector('#fusionStemSelect').options.length===1 && !document.querySelector('#fusionStemSelect').disabled && document.querySelector('#fusionAudio').src.endsWith('.flac')");
  assert(await evaluate(`document.querySelector('#fusionAudio').paused && Math.abs(document.querySelector('#fusionAudio').currentTime-${position})<.1`));
  checks.push('Invalid timeline retains display; stale stems return to original at the same position');
  fs.writeFileSync(stemPath,originalStems);
  await evaluate("document.querySelector('#fusionResultsRefresh').click()");await until("document.querySelector('#fusionStemSelect').options.length===7");
  // Hold a refresh response, select another song, then release the old response.
  ipcMain.removeHandler('fusion:refresh-track');let release;
  ipcMain.handle('fusion:refresh-track',()=>new Promise(resolve=>{release=resolve;}));
  await evaluate("document.querySelector('#fusionResultsRefresh').click()");
  for(let i=0;i<50&&!release;i++)await new Promise(r=>setTimeout(r,20));assert(release);
  const other=fixture.tracks[1];
  await evaluate(`document.querySelector('[data-track-id="${other.id}"] .fusion-library-track__main').click()`);
  await until("document.querySelector('#fusionTrack').textContent==='Plein Soleil'");
  release({ok:true,manifest:fixture.manifest,sourcePath:track.filePath,identity:{trackId:track.id,sourcePath:track.filePath}});
  await new Promise(r=>setTimeout(r,150));assert.equal(await evaluate("document.querySelector('#fusionTrack').textContent"),'Plein Soleil');
  checks.push('Delayed refresh cannot overwrite the newly selected song');
  await evaluate(`document.querySelector('[data-track-id="${track.id}"] .fusion-library-track__main').click()`);
  await until("document.querySelector('#fusionStemSelect').options.length===7");
  await evaluate("document.querySelector('#fusionAnalysisCard').scrollIntoView({block:'center'})");await new Promise(r=>setTimeout(r,300));
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(root,'xml-roundtrip.png'),(await win.webContents.capturePage()).toPNG());
  fs.writeFileSync(path.join(root,'xml-roundtrip.json'),JSON.stringify({pass:true,checks,errors},null,2));console.log(JSON.stringify({pass:true,checks,errors}));
 }catch(error){console.error(error);console.error(errors);process.exitCode=1;}
 finally{fs.writeFileSync(manifestPath,originalManifest);fs.writeFileSync(stemPath,originalStems);childProcess.spawn=realSpawn;win?.destroy();app.exit(process.exitCode||0);}
});
