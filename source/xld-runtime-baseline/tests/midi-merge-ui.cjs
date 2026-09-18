'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {app,BrowserWindow,shell}=require('electron');
const root=process.env.XLD_MERGE_TEST_ROOT;if(!root)throw Error('Isolated XLD_MERGE_TEST_ROOT required');
const fixture=JSON.parse(fs.readFileSync(path.join(root,'fixture.json'))),profile=path.join(root,'merge-profile-'+Date.now());
fs.mkdirSync(profile);fs.copyFileSync(path.join(fixture.profile,'settings.json'),path.join(profile,'settings.json'));
app.setPath('userData',profile);app.disableHardwareAcceleration();process.env.XLD_TEST='1';process.env.PYTHONDONTWRITEBYTECODE='1';
const opened=[],errors=[];shell.openPath=async file=>{opened.push(file);return '';};
app.on('browser-window-created',(_e,w)=>w.webContents.on('console-message',event=>{if(event.level==='error'||event.level===3)errors.push(event.message);}));
require('../desktop/main.cjs');
app.whenReady().then(async()=>{
 let win;
 try{
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  for(let i=0;i<300;i++){win=BrowserWindow.getAllWindows()[0];if(win&&!win.webContents.isLoading())break;await wait(50);}
  const evaluate=code=>win.webContents.executeJavaScript(code);
  async function until(code){for(let i=0;i<500;i++){if(await evaluate('Boolean('+code+')'))return;await wait(100);}throw Error('Timeout: '+code);}
  async function click(id){assert(await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(id)});return e && !e.disabled && e.getClientRects().length})()`));await evaluate(`document.querySelector(${JSON.stringify(id)}).click()`);}
  await until('window.__xldAppReady===true');win.setContentSize(1380,920);await wait(300);
  await click('#localeControl [data-locale="zh-CN"]');
  await evaluate("[...document.querySelectorAll('.album-card')].find(card=>card.textContent.includes('LAST WALTZ')).click()");
  await click('[data-track-id="'+fixture.track.id+'"]');await click('[data-workspace-tab="midi"]');
  await until('!document.querySelector("#midiMergeRun").disabled');
  await click('#midiMergeRun');await until('document.querySelector("#midiMergeStatus").textContent.includes("4165") && !document.querySelector("#midiMergeOpen").disabled');
  assert.equal(await evaluate('document.querySelectorAll("#midiMergeParts .ready").length'),3);
  await click('#midiMergeOpen');await click('#midiMergeFolder');
  for(let i=0;i<100&&opened.length<2;i++)await wait(50);
  assert.equal(opened.length,2);assert.equal(path.basename(opened[0]),'merged.mid');assert.equal(path.dirname(opened[0]),opened[1]);
  await evaluate("document.querySelector('.midi-merge-card').scrollIntoView({block:'center'})");await wait(300);
  fs.writeFileSync(path.join(root,'midi-merge-ui.png'),(await win.webContents.capturePage()).toPNG());
  await click('#localeControl [data-locale="en-US"]');await until('document.querySelector("#midiMergeTitle").textContent==="MIDI merge"');
  assert(await evaluate('document.querySelector("#midiMergeStatus").textContent.includes("4165 notes")'));
  await evaluate(`document.querySelector('.track-row:not([data-track-id="${fixture.track.id}"])').click()`);
  await until('document.querySelector("#midiMergeRun").disabled && document.querySelector("#midiMergeOpen").disabled');
  assert(await evaluate('document.querySelector("#midiMergeStatus").textContent.includes("at least two")'));
  assert.deepEqual(errors,[]);
  const report={pass:true,opened,errors,checks:['active parts displayed','merge from UI','open MIDI and folder','language switch','unavailable song cannot reuse previous merge']};
  fs.writeFileSync(path.join(root,'merge-ui.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }catch(error){console.error(error,errors);if(win)fs.writeFileSync(path.join(root,'merge-ui-failure.png'),(await win.webContents.capturePage()).toPNG());process.exitCode=1;}
 finally{win?.destroy();app.exit(process.exitCode||0);}
});
