'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{app,BrowserWindow,ipcMain,shell}=require('electron');
const root=process.env.XLD_STRINGS_TEST_ROOT;if(!root)throw Error('Isolated test root required');
const fixture=JSON.parse(fs.readFileSync(path.join(root,'fixture.json'))),profile=path.join(root,'strings-profile-'+Date.now());fs.mkdirSync(profile);fs.copyFileSync(path.join(fixture.profile,'settings.json'),path.join(profile,'settings.json'));
app.setPath('userData',profile);app.disableHardwareAcceleration();process.env.XLD_TEST='1';process.env.PYTHONDONTWRITEBYTECODE='1';
let onlyStrings=false;const calls=[],opened=[],errors=[],handle=ipcMain.handle.bind(ipcMain);
shell.openPath=async p=>{assert(fs.existsSync(p));opened.push(p);return '';};
ipcMain.handle=(channel,handler)=>handle(channel,async(event,payload)=>{
 if(channel==='assets:run'){assert.equal(payload.stem,'strings','UI test must not launch unrelated model inference');assert.equal(payload.force,false);calls.push(payload);}
 const value=await handler(event,payload);
 if(onlyStrings&&channel==='assets:read'){value.ok=false;value.stems=[];value.midiInputs={strings:value.midiInputs.strings};value.midi={strings:value.midi.strings};value.variants={strings:value.variants.strings};value.midiSourceKey='string-only-'+value.strings.active.runId;}
 return value;
});
app.on('browser-window-created',(_e,w)=>w.webContents.on('console-message',e=>{if(e.level===3||e.level==='error')errors.push(e.message);}));
require('../desktop/main.cjs');
app.whenReady().then(async()=>{
 let win;const wait=ms=>new Promise(r=>setTimeout(r,ms));
 try{
  for(let i=0;i<300;i++){win=BrowserWindow.getAllWindows()[0];if(win&&!win.webContents.isLoading())break;await wait(50);}
  const evaluate=code=>win.webContents.executeJavaScript(code);
  const until=async code=>{for(let i=0;i<400;i++){if(await evaluate('Boolean('+code+')'))return;await wait(50);}throw Error('Timeout '+code);};
  await until('window.__xldAppReady===true');win.setContentSize(1580,960);
  await evaluate("[...document.querySelectorAll('.album-card')].find(e=>e.textContent.includes('LAST WALTZ')).click()");
  await until(`document.querySelector('[data-track-id="${fixture.track.id}"]')`);
  await evaluate(`document.querySelector('[data-track-id="${fixture.track.id}"]').click();document.querySelector('[data-workspace-tab="midi"]').click()`);
  await until('document.querySelector("#midiStringsSource").options.length===2');
  const select=async(id,value)=>{await evaluate(`document.getElementById(${JSON.stringify(id)}).value=${JSON.stringify(value)};document.getElementById(${JSON.stringify(id)}).dispatchEvent(new Event('change'))`);};
  await select('midiStringsSource','');await until('!document.querySelector("#midiStringsSource").disabled && ![...document.querySelector("#derivedMidiSelect").options].some(o=>o.value==="strings")');
  await select('midiStringsSource',fixture.source.runId);await until('document.querySelector("#derivedMidiSelect").value==="strings" && !document.querySelector("#derivedTranscribe").disabled');
  assert((await evaluate('document.querySelector("#derivedModels").textContent')).includes('Basic Pitch'));
  assert((await evaluate('document.querySelector("#derivedStatus").textContent')).includes('3623'));
  await evaluate('document.querySelector("#derivedTranscribe").click()');await until('!document.querySelector("#derivedTranscribe").disabled && document.querySelector("#derivedStatus").textContent.includes("3623")');
  await evaluate('document.querySelector("#derivedMidi").click()');await until('!document.querySelector("#midiBatchFolder").disabled');
  for(let i=0;i<100&&!opened.length;i++)await wait(20);assert(opened.at(-1).includes(path.join('midi','strings')));
  await evaluate('document.querySelector("#midiStringsSource").scrollIntoView({block:"center"})');await wait(150);fs.writeFileSync(path.join(root,'strings-source-ui.png'),(await win.webContents.capturePage()).toPNG());
  const layouts=[];
  const capture=async(name,width,height,scale=1.2)=>{
   win.setContentSize(width,height);
   await evaluate('document.documentElement.style.setProperty("--font-scale",'+JSON.stringify(String(scale))+');document.querySelector("#workspaceContent").scrollTop=0');
   await wait(180);
   const data=await evaluate(`(()=>{
    const content=document.querySelector('#workspaceContent'),box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};
    const visible=e=>e.getClientRects().length>0;
    return {viewport:{width:innerWidth,height:innerHeight},content:box(content),header:box(document.querySelector('.analysis-target')),overflow:content.scrollWidth>content.clientWidth+1,
     single:box(document.querySelector('.midi-single-card')),song:box(document.querySelector('.midi-song-stack')),
     clipped:[...content.querySelectorAll('button,select,input')].filter(visible).filter(e=>{const r=e.getBoundingClientRect(),c=content.getBoundingClientRect();return r.right>c.right+1||r.left<c.left-1;}).map(e=>e.id||e.className),
     closedHelp:[...content.querySelectorAll('.compact-help')].filter(e=>!e.open).length,
     folder:box(document.querySelector('#midiBatchFolder')),statusHidden:!!document.querySelector('#derivedStatus').closest('details:not([open])')};})()`);
   assert.equal(data.overflow,false,name+' horizontal overflow');assert.deepEqual(data.clipped,[],name+' clipped controls');assert.equal(data.statusHidden,false);
   if(name==='midi-wide'){assert(data.song.x>data.single.x+data.single.width-1);assert(data.folder.bottom<data.content.bottom);assert(data.header.height<=85);}
   if(name==='midi-narrow')assert(data.song.y>data.single.y);
   layouts.push({name,...data});fs.writeFileSync(path.join(root,name+'.png'),(await win.webContents.capturePage()).toPNG());
  };
  await capture('midi-wide',1580,960);
  await capture('midi-narrow',1180,780);
  await capture('midi-large-type',1580,960,1.8);
  await evaluate('document.querySelector(".midi-single-card summary").click()');
  assert.equal(await evaluate('document.querySelector(".midi-single-card details").open'),true);
  await evaluate('document.querySelector(".midi-single-card summary").click();document.querySelector("[data-workspace-tab=stems]").click()');
  await capture('stems-wide',1580,960);
  await capture('stems-narrow',1180,780,1.8);
  await evaluate('document.querySelector("[data-workspace-tab=midi]").click()');
  fs.writeFileSync(path.join(root,'layout-checks.json'),JSON.stringify({passed:true,layouts},null,2));
  onlyStrings=true;await evaluate('document.querySelector("#derivedRefresh").click()');await until('document.querySelector("#derivedMidiSelect").options.length===1 && !document.querySelector("#midiBatchRun").disabled');
  await evaluate('document.querySelector("#midiBatchRun").click()');await until('!document.querySelector("#midiBatchRun").disabled && document.querySelector("#midiBatchStatus").textContent.includes("不足两个")');
  await evaluate('document.querySelector("#midiBatchFolder").click()');await wait(100);assert.equal(opened.at(-1),path.join(fixture.directory,'midi'));
  win.webContents.reload();await wait(200);await until('window.__xldAppReady===true');await evaluate('document.querySelector("[data-workspace-tab=midi]").click()');await until(`document.querySelector('#midiStringsSource').value===${JSON.stringify(fixture.source.runId)}`);
  await evaluate("document.querySelector('#localeControl [data-locale=\"en-US\"]').click()");await until('document.querySelector("#midiStringsLabel").textContent==="String source"');
  await capture('midi-english',1580,960);assert.equal(calls.length,2);assert.deepEqual(errors,[]);fs.writeFileSync(path.join(root,'string-ui.json'),JSON.stringify({passed:true,calls,opened,errors,checks:['real full-string cache activation','source exclusion and inclusion','source persists after reload','single MIDI folder','strings-only batch (base inputs omitted in IPC fixture)','empty merge guard','English labels']},null,2));console.log('String MIDI Electron PASS');
 }catch(error){console.error(error);if(win)fs.writeFileSync(path.join(root,'strings-ui-failure.png'),(await win.webContents.capturePage()).toPNG());process.exitCode=1;}
 finally{win?.destroy();app.exit(process.exitCode||0);}
});
