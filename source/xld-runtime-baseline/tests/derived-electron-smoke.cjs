'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {app,BrowserWindow,shell}=require('electron');
const fixture=JSON.parse(fs.readFileSync(process.env.XLD_DERIVED_FIXTURE));
const output=process.env.XLD_DERIVED_OUTPUT;
const opened=[],errors=[];
process.env.XLD_TEST='1';
app.setPath('userData',fixture.userData);
app.disableHardwareAcceleration();
shell.openPath=async directory=>{opened.push(directory);return '';};
const manualPath=path.join(fixture.directory,'manual-tags.json'),manualBefore=fs.readFileSync(manualPath,'utf8');
require('../desktop/main.cjs');
app.whenReady().then(async()=>{
 let win;
 try {
  for(let i=0;i<200;i++) {win=BrowserWindow.getAllWindows()[0];if(win&&!win.webContents.isLoading())break;await new Promise(r=>setTimeout(r,50));}
  assert(win);win.webContents.setAudioMuted(true);
  win.webContents.on('console-message',event=>{if(event.level==='error'||event.level===3)errors.push(event.message);});
  const evaluate=code=>win.webContents.executeJavaScript(code);
  async function until(code) {
   const deadline=Date.now()+45000;
   while(Date.now()<deadline){if(await evaluate(code))return;await new Promise(r=>setTimeout(r,100));}
   throw new Error('Timed out: '+code);
  }
  async function selectTrack() {
   await evaluate(`(() => { [...document.querySelectorAll('.album-card')].find(n=>n.textContent.includes('LAST WALTZ')).click(); document.querySelector('[data-track-id="${fixture.track.id}"]').click(); })()`);
   await until("document.querySelector('#derivedSelect').options.length===7");
  }
  await until('window.__xldAppReady===true');
  assert(await evaluate("document.querySelector('#taskCard').contains(document.querySelector('#cancelAnalysisButton'))"),'All analysis types use the same task area');
  assert(await evaluate("Boolean(document.querySelector('.derived-card').compareDocumentPosition(document.querySelector('.lab-switcher')) & Node.DOCUMENT_POSITION_FOLLOWING)"),'Stems belong outside the section/harmony workbench');
  await selectTrack();
  assert.equal(await evaluate("document.querySelector('#audioElement').getAttribute('src')"),null,'Selecting a track must not start playback');
  const fromXld=await evaluate(`window.XLD.readDerived(${JSON.stringify(fixture.track.id)})`);
  const xml=require('../../fusion-runtime-baseline/desktop/xld-analysis-service.cjs').createService({analysisRoot:fixture.root});
  const fromXml=await xml.readStems(fixture.track);
  assert.deepEqual(fromXld.stems,fromXml.stems);
  assert.equal(fromXld.midi.bass.directory,(await xml.readMidi(fixture.track,'bass')).directory);
  assert.equal(await evaluate("document.querySelectorAll('.comparison-row').length>=1"),true);
  await evaluate("document.querySelector('#derivedSelect').value='bass';document.querySelector('#derivedSelect').dispatchEvent(new Event('change'));");
  assert.equal(await evaluate("document.querySelector('#audioElement').getAttribute('src')"),null);
  await evaluate("document.querySelector('#derivedAudition').click()");
  await until("document.querySelector('#audioElement').src.endsWith('bass.wav')&&!document.querySelector('#audioElement').paused&&!document.querySelector('#derivedSelect').disabled");
  await evaluate("document.querySelector('#audioElement').pause();document.querySelector('#audioElement').currentTime=35;");
  await evaluate("document.querySelector('#derivedSelect').value='piano';document.querySelector('#derivedSelect').dispatchEvent(new Event('change'));");
  await until("document.querySelector('#audioElement').src.endsWith('piano.wav')&&!document.querySelector('#derivedSelect').disabled&&Math.abs(document.querySelector('#audioElement').currentTime-35)<0.1");
  assert(await evaluate("document.querySelector('#audioElement').paused"));
  assert.match(await evaluate("document.querySelector('#nowArtist').textContent"),/piano/);
  await evaluate("document.querySelector('#derivedWav').click();document.querySelector('#derivedMidi').click();");
  for(let i=0;i<30&&opened.length<2;i++)await new Promise(r=>setTimeout(r,50));
  assert.equal(opened.length,2);assert(opened.some(value=>value.includes(path.join('midi','piano'))));
  // Returning from XML after its results changed must stop using the old stem.
  const stemPath=path.join(fixture.directory,'stems.json'),original=fs.readFileSync(stemPath,'utf8');
  const stale=JSON.parse(original);stale.source.mtimeMs+=10000;
  try {
   fs.writeFileSync(stemPath,JSON.stringify(stale));
   await evaluate("window.dispatchEvent(new Event('focus'))");
   await until("document.querySelector('#derivedSelect').options.length===1&&document.querySelector('#audioElement').src.endsWith('.flac')&&!document.querySelector('#derivedSelect').disabled");
   assert(await evaluate("document.querySelector('#audioElement').paused"));
  } finally {fs.writeFileSync(stemPath,original);}
  await evaluate("document.querySelector('#derivedRefresh').click()");
  await until("document.querySelector('#derivedSelect').options.length===7");
  await evaluate(`document.querySelector('.track-row[data-track-id]:not([data-track-id="${fixture.track.id}"])').click()`);
  await until("document.querySelector('#derivedSelect').options.length===1&&document.querySelector('#derivedWav').disabled");
  assert.match(await evaluate("document.querySelector('#nowTitle').textContent"),/LAST WALTZ/);
  await evaluate("document.querySelector('#derivedAudition').click()");
  await until("document.querySelector('#nowTitle').textContent!=='LAST WALTZ'&&!document.querySelector('#audioElement').paused");
  assert(await evaluate("document.querySelector('#audioElement').src.endsWith('.flac')"));
  await evaluate("document.querySelector('#audioElement').pause()");
  await new Promise(resolve=>{win.webContents.once('did-finish-load',resolve);win.webContents.reload();});
  await until('window.__xldAppReady===true');await selectTrack();
  await evaluate("document.querySelector('#derivedSelect').value='guitar';document.querySelector('#derivedSelect').dispatchEvent(new Event('change'));");
  await until("!document.querySelector('#derivedMidi').disabled");
  await evaluate("window.xinXldLocale.setLocale('en-US')");
  await until("document.querySelector('#derivedHeading').textContent==='Stems & MIDI'");
  await evaluate("window.xinXldLocale.setLocale('zh-CN');document.querySelector('.derived-card').scrollIntoView({block:'center'});");
  await new Promise(r=>setTimeout(r,300));
  fs.writeFileSync(output+'.png',(await win.webContents.capturePage()).toPNG());
  assert.equal(fs.readFileSync(manualPath,'utf8'),manualBefore);
  assert.deepEqual(errors,[]);
  const report={pass:true,checks:['XML/XLD read identical WAV and MIDI locations','single click stays silent','bass playback','piano switch preserves 35s and pause','folder actions','stale result returns to original','next selected song uses original','reload finds cached MIDI','locale switch','timeline and manual tags preserved'],opened,errors};
  fs.writeFileSync(output+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 } catch(error){console.error(error);console.error(errors);process.exitCode=1;}
 finally{win?.destroy();app.exit(process.exitCode||0);}
});
