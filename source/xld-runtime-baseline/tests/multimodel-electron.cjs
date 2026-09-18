'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {app,BrowserWindow,shell}=require('electron');
const root=process.env.XLD_MODELS_TEST_ROOT;if(!root)throw Error('Isolated XLD_MODELS_TEST_ROOT required');
const fixture=JSON.parse(fs.readFileSync(path.join(root,'fixture.json')));
const testProfile=path.join(root,'ui-profile-'+Date.now());fs.mkdirSync(testProfile);fs.copyFileSync(path.join(fixture.profile,'settings.json'),path.join(testProfile,'settings.json'));
process.env.XLD_TEST='1';process.env.PYTHONDONTWRITEBYTECODE='1';app.setPath('userData',testProfile);app.disableHardwareAcceleration();
const opened=[],errors=[],checks=[];shell.openPath=async value=>{opened.push(value);return '';};
require('../desktop/main.cjs');
app.whenReady().then(async()=>{
 let win;
 try{
  for(let i=0;i<300;i++){win=BrowserWindow.getAllWindows()[0];if(win&&!win.webContents.isLoading())break;await new Promise(r=>setTimeout(r,50));}
  assert(win);win.webContents.setAudioMuted(true);
  win.webContents.on('console-message',event=>{if(event.level==='error'||event.level===3)errors.push(event.message);});
  const evaluate=code=>win.webContents.executeJavaScript(code);
  async function until(code,seconds=45){const end=Date.now()+seconds*1000;while(Date.now()<end){if(await evaluate(code))return;await new Promise(r=>setTimeout(r,100));}throw Error('Timeout: '+code);}
  await until('window.__xldAppReady===true');
  await evaluate("localStorage.removeItem('xld.midi.models');document.querySelector('#localeControl [data-locale=\"zh-CN\"]').click();document.querySelector('.album-card').click()");
  await evaluate(`document.querySelector('[data-track-id="${fixture.track.id}"]').click()`);
  await until("document.querySelector('#derivedSelect').options.length===7");
  await evaluate("document.querySelector('#derivedMidiSelect').value='guitar';document.querySelector('#derivedMidiSelect').dispatchEvent(new Event('change'))");
  await until("document.querySelectorAll('[data-midi-engine]').length===2&&!document.querySelector('#derivedTranscribe').disabled");
  assert.equal(await evaluate("document.querySelector('[data-midi-engine].selected').dataset.midiEngine"),'guitar-gaps');
  assert(await evaluate("document.querySelector('[data-midi-engine=\"guitar-gaps\"] .engine-badge').textContent==='默认'"));
  assert(await evaluate("document.querySelector('[data-midi-engine=\"basic-pitch\"] .engine-badge').textContent==='备选'"));
  checks.push('Guitar default and Basic Pitch alternative use existing engine cards');
  await evaluate("document.querySelector('#derivedAudition').click()");await until("!document.querySelector('#audioElement').paused");
  await evaluate("document.querySelector('#audioElement').pause();document.querySelector('#audioElement').currentTime=12;document.querySelector('[data-midi-engine=\"basic-pitch\"]').click();document.querySelector('#derivedMidi').click()");
  for(let i=0;i<50&&!opened.length;i++)await new Promise(r=>setTimeout(r,40));
  assert(opened[0].includes('guitar'));const first=await evaluate(`window.XLD.readDerived(${JSON.stringify(fixture.track.id)})`);assert.equal(opened[0],first.variants.guitar['basic-pitch'].directory);
  assert(await evaluate("document.querySelector('#audioElement').paused && Math.abs(document.querySelector('#audioElement').currentTime-12)<.1"));
  await evaluate("window.__modelTasks=[];window.XLD.onAnalysisTask(t=>window.__modelTasks.push(t));document.querySelector('#derivedTranscribe').click()");
  await until("!document.querySelector('#derivedTranscribe').disabled && window.__modelTasks.some(t=>t?.engine==='basic-pitch'&&t.status==='complete')");
  const active=await evaluate(`window.XLD.readDerived(${JSON.stringify(fixture.track.id)})`);assert.equal(active.midi.guitar.engine,'basic-pitch');assert(active.variants.guitar['guitar-gaps'].ok);
  checks.push('Selected-model folder and cached activation work without changing WAV playback');
  await evaluate("document.querySelector('#derivedMidiSelect').value='piano';document.querySelector('#derivedMidiSelect').dispatchEvent(new Event('change'))");
  await until("document.querySelector('[data-midi-engine=\"piano-highres\"].selected')");
  await evaluate("document.querySelector('#derivedMidiSelect').value='bass';document.querySelector('#derivedMidiSelect').dispatchEvent(new Event('change'))");
  await until("document.querySelector('[data-midi-engine=\"bass-highres\"].selected')");
  await evaluate("document.querySelector('#derivedMidiSelect').value='guitar';document.querySelector('#derivedMidiSelect').dispatchEvent(new Event('change'))");
  assert.equal(await evaluate("document.querySelector('[data-midi-engine].selected').dataset.midiEngine"),'basic-pitch');
  checks.push('Per-instrument defaults and remembered alternatives');
  async function capture(name,width,locale,scale){
    win.setContentSize(width,960);await evaluate(`document.querySelector('#localeControl [data-locale="${locale}"]').click();document.documentElement.style.setProperty('--font-scale',${JSON.stringify(String(scale))});document.querySelector('.derived-card').scrollIntoView({block:'start'});`);
    await until(`document.documentElement.lang===${JSON.stringify(locale)}`);await new Promise(r=>setTimeout(r,250));
    const layout=await evaluate(`(()=>{const card=document.querySelector('.derived-card');return {width:card.clientWidth,scroll:card.scrollWidth,invalid:[...card.querySelectorAll('button,select')].filter(x=>x.offsetParent&&x.scrollWidth>x.clientWidth+2).map(x=>x.id||x.dataset.midiEngine),rect:(()=>{const r=card.getBoundingClientRect();return {x:Math.floor(r.x),y:Math.max(0,Math.floor(r.y)),width:Math.ceil(r.width),height:Math.ceil(r.height)}})()};})()`);
    assert(layout.scroll<=layout.width+2,JSON.stringify(layout));assert.deepEqual(layout.invalid,[],JSON.stringify(layout));
    fs.writeFileSync(path.join(root,name+'.png'),(await win.webContents.capturePage(layout.rect)).toPNG());
  }
  await capture('models-ui-zh',1580,'zh-CN',1.2);
  await capture('models-ui-en',1180,'en-US',1.2);
  await capture('models-ui-large',1180,'zh-CN',1.8);
  checks.push('Chinese, English and enlarged text layouts without overflowing controls');
  assert.deepEqual(errors,[]);const report={pass:true,checks,errors,opened};fs.writeFileSync(path.join(root,'models-ui.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }catch(error){console.error(error);if(win){console.error(await win.webContents.executeJavaScript("JSON.stringify({status:document.querySelector('#derivedStatus')?.textContent,disabled:document.querySelector('#derivedTranscribe')?.disabled,model:document.querySelector('[data-midi-engine].selected')?.dataset.midiEngine})"));fs.writeFileSync(path.join(root,'models-ui-failure.png'),(await win.webContents.capturePage()).toPNG());}process.exitCode=1;}
 finally{win?.destroy();app.exit(process.exitCode||0);}
});
