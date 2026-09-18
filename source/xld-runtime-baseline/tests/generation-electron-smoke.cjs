'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {app,BrowserWindow,shell}=require('electron');
const root=process.env.XLD_OWNERSHIP_TEST_ROOT;
if(!root)throw Error('XLD_OWNERSHIP_TEST_ROOT is required; use an isolated test library');
process.env.XLD_TEST='1';app.setPath('userData',path.join(root,'test-profile'));app.disableHardwareAcceleration();
const errors=[],opened=[],checks=[];
shell.openPath=async value=>{opened.push(value);return '';};
require('../desktop/main.cjs');
app.whenReady().then(async()=>{
 let win;
 try {
  for(let i=0;i<200;i++){win=BrowserWindow.getAllWindows()[0];if(win&&!win.webContents.isLoading())break;await new Promise(r=>setTimeout(r,50));}
  assert(win);win.webContents.setAudioMuted(true);
  win.webContents.on('console-message',event=>{if(event.level==='error'||event.level===3)errors.push(event.message);});
  const evaluate=code=>win.webContents.executeJavaScript(code);
  async function until(code,seconds=180){const end=Date.now()+seconds*1000;while(Date.now()<end){if(await evaluate(code))return;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out: '+code);}
  function step(text){checks.push(text);console.log(text);}
  await until('window.__xldAppReady===true');
  const library=await evaluate('window.XLD.scanLibrary()');
  const tracks=library.albums.flatMap(album=>album.tracks);
  assert.equal(tracks.length,1);const track={...tracks[0],filePath:require('node:url').fileURLToPath(tracks[0].fileUrl)},id=JSON.stringify(track.id);
  await evaluate(`window.__events=[];window.XLD.onAnalysisTask(task=>window.__events.push(task));document.querySelector('.album-card').click();document.querySelector('[data-track-id="${track.id}"]').click();`);
  await until("!document.querySelector('#derivedSeparate').disabled");
  assert.equal(await evaluate("document.querySelector('#audioElement').getAttribute('src')"),null);
  assert(await evaluate("document.querySelector('#derivedTranscribe').disabled"));
  await evaluate(`window.XLD.saveAnnotation(${id},{start:0,end:5,label:'manual fixture',note:'keep'})`);
  const directory=require('../core/derived-assets.cjs').trackDirectory(track,path.join(root,'test-analysis'));
  const manualPath=path.join(directory,'manual-tags.json'),manual=fs.readFileSync(manualPath,'utf8');
  step('Ready: isolated 30-second real-audio fixture');
  await evaluate("document.querySelector('#derivedForce').checked=true;document.querySelector('#derivedSeparate').click()");
  await until("document.querySelector('#derivedSelect').options.length===7&&!document.querySelector('#derivedSeparate').disabled",240);
  let assets=await evaluate(`window.XLD.readDerived(${id})`);assert(assets.ok);assert.equal(assets.stems.length,6);
  await evaluate("document.querySelector('#derivedForce').checked=false");
  step('XLD UI generated six WAV files through its own core');
  const firstRun=assets.runId;
  const eventCount=await evaluate('window.__events.length');
  await evaluate("document.querySelector('#derivedSeparate').click()");
  await until(`window.__events.length>${eventCount}&&!document.querySelector('#derivedSeparate').disabled`);
  assets=await evaluate(`window.XLD.readDerived(${id})`);assert.equal(assets.runId,firstRun);
  step('Repeat separation reused the same run');
  await evaluate("document.querySelector('#derivedMidiSelect').value='bass';document.querySelector('#derivedMidiSelect').dispatchEvent(new Event('change'));document.querySelector('#derivedTranscribe').click()");
  await until("!document.querySelector('#derivedMidi').disabled&&!document.querySelector('#derivedTranscribe').disabled",240);
  assets=await evaluate(`window.XLD.readDerived(${id})`);assert(assets.midi.bass.ok);const midiRun=assets.midi.bass.runId;
  step('XLD UI generated bass MIDI ('+assets.midi.bass.noteCount+' notes)');
  await evaluate("document.querySelector('#derivedWav').click();document.querySelector('#derivedMidi').click()");
  for(let i=0;i<50&&opened.length<2;i++)await new Promise(r=>setTimeout(r,50));assert.equal(opened.length,2);
  await evaluate("document.querySelector('#derivedForce').checked=true;document.querySelector('#derivedTranscribe').click()");
  await until("window.__events.some(t=>t?.engine==='basic-pitch'&&t.status==='starting'&&t.taskId!=="+JSON.stringify(midiRun)+")");
  const busy=await evaluate(`window.XLD.runAnalysis(${id},'songformer',null,true)`);assert.equal(busy.error,'analysis-busy');
  await evaluate("document.querySelector('#cancelAnalysisButton').click()");
  await until("window.__events.at(-1)?.status==='cancelled'&&!document.querySelector('#derivedTranscribe').disabled");
  assets=await evaluate(`window.XLD.readDerived(${id})`);assert.equal(assets.midi.bass.runId,midiRun);
  await evaluate("document.querySelector('#derivedForce').checked=false;document.querySelector('#derivedTranscribe').click()");
  await until("window.__events.at(-1)?.status==='complete'&&!document.querySelector('#derivedTranscribe').disabled");
  step('MIDI/section mutual exclusion, shared cancel, old-result retention and retry passed');
  await evaluate(`window.__section=null;window.XLD.runAnalysis(${id},'songformer',null,true).then(value=>window.__section=value)`);
  await until('window.__section!==null',240);
  const section=await evaluate('window.__section');assert(section.ok,JSON.stringify(section));
  assert(section.result.segments.length>0);assert.equal(section.integrationWarning,null);
  step('Existing SongFormer section analysis and XML bridge export passed');
  await evaluate(`window.__harmony=null;window.XLD.runAnalysis(${id},'chord-cens',null,false,'hpss').then(value=>window.__harmony=value)`);
  await until('window.__harmony!==null',180);
  const harmony=await evaluate('window.__harmony');assert(harmony.ok,JSON.stringify(harmony));
  step('Existing CENS harmony analysis with HPSS passed');
  const xml=require('../../fusion-runtime-baseline/desktop/xld-analysis-service.cjs').createService({analysisRoot:path.join(root,'test-analysis')});
  const xmlStems=await xml.readStems(track),xmlMidi=await xml.readMidi(track,'bass');
  assets=await evaluate(`window.XLD.readDerived(${id})`);assert(xmlStems.ok,xmlStems.error);assert(xmlMidi.ok,xmlMidi.error);assert.deepEqual(xmlStems.stems,assets.stems);assert.equal(xmlMidi.directory,assets.midi.bass.directory);
  assert.equal(fs.readFileSync(manualPath,'utf8'),manual);assert.deepEqual(errors,[]);
  await evaluate("window.xinXldLocale.setLocale('en-US')");await until("document.querySelector('#derivedSeparate').textContent==='Separate'");
  await evaluate("window.xinXldLocale.setLocale('zh-CN');document.querySelector('.derived-card').scrollIntoView({block:'center'})");
  await new Promise(r=>setTimeout(r,300));
  fs.writeFileSync(path.join(root,'generation-ui.png'),(await win.webContents.capturePage()).toPNG());
  step('XML reads XLD outputs, manual tags unchanged, bilingual UI passed');
  fs.writeFileSync(path.join(root,'generation-ui.json'),JSON.stringify({pass:true,checks,track,directory,opened,errors,notes:assets.midi.bass.noteCount},null,2));
 }catch(error){console.error(error);console.error(errors);process.exitCode=1;}
 finally{win?.destroy();app.exit(process.exitCode||0);}
});
