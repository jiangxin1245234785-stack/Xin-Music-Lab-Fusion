'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {app,BrowserWindow,ipcMain,shell}=require('electron');
const root=process.env.XLD_BATCH_TEST_ROOT;if(!root)throw Error('Isolated XLD_BATCH_TEST_ROOT required');
const fixture=JSON.parse(fs.readFileSync(path.join(root,'fixture.json'))),profile=path.join(root,'batch-profile-'+Date.now());
fs.mkdirSync(profile);fs.copyFileSync(path.join(fixture.profile,'settings.json'),path.join(profile,'settings.json'));
app.setPath('userData',profile);app.disableHardwareAcceleration();process.env.XLD_TEST='1';process.env.PYTHONDONTWRITEBYTECODE='1';
let mode='real',release;
const opened=[];shell.openPath=async directory=>{assert(fs.statSync(directory).isDirectory());opened.push(directory);return '';};
const calls=[],errors=[],handle=ipcMain.handle.bind(ipcMain);
ipcMain.handle=(channel,handler)=>handle(channel,async(event,payload)=>{
 if(channel==='assets:run'||channel==='assets:merge-midi'){
  calls.push({channel,...payload});
  if(mode==='fail' && payload?.stem==='piano')return {ok:false,error:'analysis-failed',detail:'Test failure'};
  if(mode==='hold')return await new Promise(resolve=>{release=()=>resolve({ok:true,cached:true});});
 }
 const response=await handler(event,payload);
 if(mode==='empty' && channel==='assets:read' && response?.ok) {
   response.merged={ok:false,error:'merge-needs-parts'};
   for(const [stem,midi] of Object.entries(response.midi||{}))if(stem!=='bass' && midi.ok)midi.noteCount=0;
 }
 return response;
});
app.on('browser-window-created',(_e,w)=>w.webContents.on('console-message',event=>{if(event.level==='error'||event.level===3)errors.push(event.message);}));
require('../desktop/main.cjs');
app.whenReady().then(async()=>{
 let win;
 try{
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  for(let i=0;i<300;i++){win=BrowserWindow.getAllWindows()[0];if(win&&!win.webContents.isLoading())break;await wait(50);}
  const evaluate=code=>win.webContents.executeJavaScript(code);
  async function until(code){for(let i=0;i<500;i++){if(await evaluate('Boolean('+code+')'))return;await wait(100);}throw Error('Timeout: '+code);}
  async function click(id){assert(await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(id)});return e && !e.disabled && e.getClientRects().length})()`),id);await evaluate(`document.querySelector(${JSON.stringify(id)}).click()`);}
  await until('window.__xldAppReady===true');win.setContentSize(1380,920);
  await click('#localeControl [data-locale="zh-CN"]');
  await evaluate("[...document.querySelectorAll('.album-card')].find(card=>card.textContent.includes('LAST WALTZ')).click()");
  await click('[data-track-id="'+fixture.track.id+'"]');await click('[data-workspace-tab="midi"]');
  await until('!document.querySelector("#midiBatchRun").disabled');
  const selection=await evaluate('document.querySelector("#derivedSelect").value');
  await click('#midiBatchRun');
  await until('document.querySelector("#midiBatchStatus").textContent.includes("已就绪") && !document.querySelector("#midiBatchRun").disabled');
  assert.deepEqual(calls.map(call=>call.stem||'merge'),['bass','piano','guitar','drums','merge']);
  assert(calls.every(call=>call.trackId===fixture.track.id));assert(calls.slice(0,4).every(call=>call.force===false));
  assert.equal(await evaluate('document.querySelector("#derivedSelect").value'),selection);
  assert(await evaluate('document.querySelector("#midiMergeStatus").textContent.includes("4")'));
  assert.equal(selection,'original');
  await click('#midiBatchFolder');await click('#derivedMidi');
  for(let i=0;i<100 && opened.length<2;i++)await wait(50);
  assert.equal(opened.at(-2),path.join(fixture.directory,'midi'),'Batch folder is song-wide');assert(opened.at(-1).includes(path.join('midi','bass')),'Single-part folder follows independent MIDI target');
  await evaluate("document.querySelector('#derivedMidiSelect').value='guitar';document.querySelector('#derivedMidiSelect').dispatchEvent(new Event('change'))");
  await click('[data-midi-engine="basic-pitch"]');await click('#midiBatchFolder');
  await evaluate("document.querySelector('#derivedMidiSelect').value='drums';document.querySelector('#derivedMidiSelect').dispatchEvent(new Event('change'))");
  await until('document.querySelector("[data-midi-engine=drums-adtof]")');
  await click('#derivedMidi');
  for(let i=0;i<100 && opened.length<4;i++)await wait(50);
  assert(opened.at(-1).includes(path.join('midi','drums')),'Drum selection opens scoped result');
  await evaluate("document.querySelector('#derivedMidiSelect').value='guitar';document.querySelector('#derivedMidiSelect').dispatchEvent(new Event('change'))");
  await click('[data-midi-engine="guitar-gaps"]');
  await evaluate("document.querySelector('#derivedSelect').value='original';document.querySelector('#derivedSelect').dispatchEvent(new Event('change'))");
  const successCalls=calls.slice();
  await evaluate("document.querySelector('.midi-batch-card').scrollIntoView({block:'start'})");await wait(300);
  fs.writeFileSync(path.join(root,'midi-batch-ui.png'),(await win.webContents.capturePage()).toPNG());
  await evaluate("document.querySelector('#derivedMidiSelect').scrollIntoView({block:'center'})");await wait(150);
  fs.writeFileSync(path.join(root,'midi-part-ui.png'),(await win.webContents.capturePage()).toPNG());
  win.setContentSize(1000,800);await wait(150);
  assert(await evaluate("(()=>{const ids=['derivedMidiSelect','derivedMidiAudition','derivedModels'];return ids.every(id=>{const r=document.getElementById(id).getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth;});})()"),'Part controls fit a smaller window');
  fs.writeFileSync(path.join(root,'midi-part-small.png'),(await win.webContents.capturePage()).toPNG());win.setContentSize(1380,920);
  mode='fail';calls.length=0;await click('#midiBatchRun');
  await until('document.querySelector("#midiBatchStatus").textContent.includes("已停止") && !document.querySelector("#midiBatchRun").disabled');
  assert.deepEqual(calls.map(call=>call.stem||'merge'),['bass','piano']);
  await click('#midiBatchFolder');
  mode='hold';calls.length=0;await click('#midiBatchRun');
  for(let i=0;i<100&&!release;i++)await wait(50);assert(release);
  await click('#cancelAnalysisButton');release();
  await until('document.querySelector("#midiBatchStatus").textContent.includes("已取消") && !document.querySelector("#midiBatchRun").disabled');
  assert.equal(calls.length,1);await click('#midiBatchFolder');
  mode='empty';calls.length=0;await click('#midiBatchRun');
  await until('document.querySelector("#midiBatchStatus").textContent.includes("不足两个") && !document.querySelector("#midiBatchRun").disabled');
  assert.equal(calls.length,4);assert(calls.every(c=>c.channel==='assets:run'));
  await click('#midiBatchFolder');
  mode='real';win.webContents.reload();await wait(300);
  await until('window.__xldAppReady===true');
  await click('[data-workspace-tab="midi"]');
  await until('!document.querySelector("#midiBatchFolder").disabled');
  await click('#midiBatchFolder');
  await click('#localeControl [data-locale="en-US"]');await until('document.querySelector("#midiBatchTitle").textContent==="One-click MIDI"');
  await evaluate(`document.querySelector('.track-row:not([data-track-id="${fixture.track.id}"])').click()`);
  await until('document.querySelector("#midiBatchRun").disabled && document.querySelector("#midiBatchStatus").textContent.includes("WAV stems first")');
  assert(await evaluate('document.querySelector("#midiBatchFolder").disabled && document.querySelector("#derivedMidi").disabled'),'No outputs disables folders');
  assert.deepEqual(errors,[]);
  const report={pass:true,calls:successCalls,opened,errors,checks:['real cached bass/piano/guitar/drums and four-part merge','fixed track and unchanged audition part','failure stops remaining work','cancel stops queue','localization','song without WAV disabled']};
  fs.writeFileSync(path.join(root,'batch-ui.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }catch(error){console.error(error,errors);if(win)fs.writeFileSync(path.join(root,'batch-ui-failure.png'),(await win.webContents.capturePage()).toPNG());process.exitCode=1;}
 finally{win?.destroy();app.exit(process.exitCode||0);}
});
