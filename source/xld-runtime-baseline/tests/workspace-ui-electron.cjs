'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {app,BrowserWindow,shell,ipcMain}=require('electron');
const root=process.env.XLD_WORKSPACE_TEST_ROOT;
if(!root)throw Error('Isolated XLD_WORKSPACE_TEST_ROOT required');
const fixture=JSON.parse(fs.readFileSync(path.join(root,'fixture.json')));
const profile=path.join(root,'workspace-profile-'+Date.now());fs.mkdirSync(profile);
fs.copyFileSync(path.join(fixture.profile,'settings.json'),path.join(profile,'settings.json'));
const backup=new Map(['manual-tags.json','music-lab.json'].map(name=>{const file=path.join(fixture.directory,name);return[file,fs.existsSync(file)?fs.readFileSync(file):null];}));
app.setPath('userData',profile);app.disableHardwareAcceleration();process.env.XLD_TEST='1';process.env.PYTHONDONTWRITEBYTECODE='1';
const opened=[],checks=[],errors=[],runs=[];shell.openPath=async value=>{opened.push(value);return '';};
let pending=null,task=null,win;
const handle=ipcMain.handle.bind(ipcMain);
ipcMain.handle=(channel,listener)=>handle(channel,async(event,payload)=>{
 if(channel==='analysis:run'){
  assert.equal(pending,null);runs.push(payload);task={taskId:'workspace-test-'+runs.length,trackId:payload.trackId,trackTitle:fixture.track.title,engine:payload.engine,engineName:payload.engine,status:'running',progress:.42,cancellable:true,message:'UI task fixture',elapsedSeconds:30};
  event.sender.send('analysis:task',task);return new Promise(resolve=>pending=resolve);
 }
 if(channel==='analysis:cancel'&&pending){assert.equal(payload.taskId,task.taskId);task={...task,status:'cancelled'};event.sender.send('analysis:task',task);pending({ok:false,error:'analysis-cancelled',task});pending=null;return {ok:true};}
 return listener(event,payload);
});
app.on('browser-window-created',(_event,window)=>window.webContents.on('console-message',event=>{if(event.level==='error'||event.level===3)errors.push(event.message);}));
require('../desktop/main.cjs');
app.whenReady().then(async()=>{
 try{
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  for(let i=0;i<300;i++){win=BrowserWindow.getAllWindows()[0];if(win&&!win.webContents.isLoading())break;await wait(50);}
  assert(win);win.webContents.setAudioMuted(true);
  const evaluate=code=>win.webContents.executeJavaScript(code);
  async function until(code){for(let i=0;i<500;i++){if(await evaluate('Boolean('+code+')'))return;await wait(100);}throw Error('Timeout: '+code);}
  async function click(selector){assert(await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});return e && !e.disabled && e.getClientRects().length>0})()`),'Clickable: '+selector);await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);}
  async function show(tab){await click('[data-workspace-tab="'+tab+'"]');assert.equal(await evaluate("document.querySelector('[data-workspace-tab][aria-selected=true]').dataset.workspaceTab"),tab);}
  async function capture(name){await wait(250);fs.writeFileSync(path.join(root,name+'.png'),(await win.webContents.capturePage()).toPNG());}
  const trackSelector='[data-track-id="'+fixture.track.id+'"]';
  await until('window.__xldAppReady===true');win.setContentSize(1580,960);await wait(300);
  await click('#localeControl [data-locale="zh-CN"]');
  assert.equal(await evaluate("document.querySelector('[data-workspace-tab][aria-selected=true]').dataset.workspaceTab"),'overview');
  assert(await evaluate("document.querySelector('#audioElement').paused && !document.querySelector('.library-panel').hidden"));
  await evaluate("[...document.querySelectorAll('.album-card')].find(card=>card.textContent.includes('LAST WALTZ')).click()");
  await click(trackSelector);await until("document.querySelector('#derivedSelect').options.length===7 && document.querySelector('#workspaceResults').textContent.includes('3 / 3')");
  assert(await evaluate("document.querySelector('#workspaceResults').textContent.includes('1 份分析结果') && document.querySelector('#workspaceResults').textContent.includes('4 份分析结果')"));
  checks.push('Default workspace; sidebar selection; real WEG section/chord/WAV/MIDI cache summaries');
  await click('[data-library-level="albums"]');await evaluate("document.querySelector('.album-card:not(.active)').click()");
  assert.equal(await evaluate("document.querySelector('#analysisTargetTitle').textContent"),fixture.track.title);
  await click('#workspaceLocate');assert(await evaluate(`document.querySelector(${JSON.stringify(trackSelector)}).classList.contains('selected')`));
  checks.push('Browsing another album preserves the work track; locate returns to its album');
  await capture('workspace-overview');
  await show('stems');assert(await evaluate("!document.querySelector('.derived-wav-block').hidden && document.querySelector('.derived-midi-block').hidden"));
  assert(await evaluate("document.querySelector('[data-stem-engine=\"bs-roformer-sw\"]').textContent.includes('默认')"));
  await evaluate("document.querySelector('#derivedSelect').value='guitar';document.querySelector('#derivedSelect').dispatchEvent(new Event('change'))");
  await click('#derivedAudition');await until("document.querySelector('#audioElement').readyState>=2 && !document.querySelector('#derivedAudition').disabled");
  await evaluate("document.querySelector('#audioElement').pause();document.querySelector('#audioElement').currentTime=100");
  await show('midi');await evaluate("document.querySelector('#derivedMidiSelect').value='guitar';document.querySelector('#derivedMidiSelect').dispatchEvent(new Event('change'))");assert(await evaluate("document.querySelector('.derived-wav-block').hidden && !document.querySelector('.derived-midi-block').hidden"));
  await click('#derivedMidi');
  assert(await evaluate("document.querySelector('#derivedStatus').textContent.includes('1633')"));
  await capture('workspace-midi');
  await show('stems');await click('#derivedWav');
  for(let i=0;i<100&&opened.length<2;i++)await wait(50);
  assert.equal(opened.length,2);assert(opened[0].includes('midi'));assert(opened[1].includes('stems'));
  assert(await evaluate("document.querySelector('#audioElement').paused && Math.abs(document.querySelector('#audioElement').currentTime-100)<1"));
  checks.push('WAV/MIDI tabs reuse one source; default/alternative models and real output folders; paused playhead survives navigation');
  await capture('workspace-stems');
  await show('section');await click('#workspaceModelOptions summary');await click('[data-engine-id="songformer"]');await click('#workspaceModelOptions summary');
  assert(await evaluate("document.querySelector('#segmentPanel').getClientRects().length>0 && document.querySelectorAll('#engineList .engine-card').length===5"));
  assert(await evaluate("document.querySelectorAll('#comparisonTimeline .comparison-row').length>=1"));
  await evaluate("document.querySelector('#tagStart').value='0:02';document.querySelector('#tagEnd').value='0:08';document.querySelector('#tagLabel').value='工作台验收';document.querySelector('#tagLabel').dispatchEvent(new Event('input'))");
  await click('#saveTagButton');await until("document.querySelector('#manualTagList').textContent.includes('工作台验收')");
  await show('overview');assert(await evaluate("document.querySelector('#workspaceOverviewHint').textContent.includes('1 条人工标签')"));
  await show('section');assert(await evaluate("document.querySelector('#analysisState').textContent.includes('1 项段落分析')"));await capture('workspace-sections');
  checks.push('All section engines, long-song range controls, shared timeline and separate manual annotations remain usable');
  await show('harmony');assert(await evaluate("document.querySelector('#manualTagPanel').classList.contains('hidden') && document.querySelectorAll('#engineList .engine-card').length===4"));
  await click('#workspaceModelOptions summary');await click('[data-engine-id="chord-cqt"]');await click('#workspaceModelOptions summary');await click('#analyzeButton');await until("document.querySelector('#taskPercent').textContent==='42%'");
  await show('midi');
  const other=await evaluate(`document.querySelector('.track-row:not([data-track-id="${fixture.track.id}"])').dataset.trackId`);
  await click('[data-track-id="'+other+'"]');
  await until("document.querySelector('#workspaceMidiEmpty').hidden===false");
  assert.notEqual(await evaluate("document.querySelector('#analysisTargetTitle').textContent"),fixture.track.title);
  assert.equal(await evaluate("document.querySelector('#nowTitle').textContent"),fixture.track.title);
  assert.equal(await evaluate("document.querySelector('#taskTitle').textContent"),fixture.track.title);
  await show('harmony');assert.equal(await evaluate("document.querySelectorAll('#engineList .engine-card.running').length"),0);
  await capture('workspace-task');
  await click('#cancelAnalysisButton');await until("document.querySelector('#taskKicker').textContent.includes('取消')");await wait(3000);
  assert(await evaluate("!document.querySelector('#taskCard').classList.contains('hidden')"));await click('#workspaceDismissTask');
  checks.push('Mock task stays visible across tabs and song selection; selected/playing/processing contexts separate; cancel and persistent terminal status work');
  await click(trackSelector);await until("document.querySelector('#derivedSelect').options.length===7");
  await show('overview');await evaluate("document.querySelector('#workspace-tab-overview').focus()");
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Right'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Right'});
  await until("document.querySelector('#workspace-tab-section').getAttribute('aria-selected')==='true'");
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Space'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Space'});await wait(150);
  assert(await evaluate("document.querySelector('#audioElement').paused"));
  await click('#localeControl [data-locale="en-US"]');await until("document.querySelector('#workspace-tab-section').textContent==='Sections'");
  await show('midi');await evaluate("document.querySelector('#derivedMidiSelect').value='guitar';document.querySelector('#derivedMidiSelect').dispatchEvent(new Event('change'))");
  await click('#fontIncreaseButton');await click('#fontIncreaseButton');win.setContentSize(1180,720);await wait(350);
  for(const tab of ['overview','section','harmony','stems','midi']){
   await show(tab);
   const layout=await evaluate("(()=>{const content=document.querySelector('#workspaceContent'),sidebar=document.querySelector('.workspace-library'),player=document.querySelector('.player-dock');return {bodyOverflow:document.body.scrollWidth>innerWidth,contentOverflow:content.scrollWidth>content.clientWidth+2,sidebarRight:sidebar.getBoundingClientRect().right,contentLeft:content.getBoundingClientRect().left,playerBottom:player.getBoundingClientRect().bottom,height:innerHeight}})()");
   assert(!layout.bodyOverflow&&!layout.contentOverflow,tab+' overflow '+JSON.stringify(layout));assert(layout.sidebarRight<=layout.contentLeft);assert(layout.playerBottom<=layout.height+1);
  }
  await capture('workspace-midi-small-en');
  checks.push('Keyboard tab navigation and Space respect focused controls; English and largest font fit at 1180 × 720');
  assert.deepEqual(await evaluate("(()=>{const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);return ids.filter((id,i)=>ids.indexOf(id)!==i)})()"),[]);
  await click('#localeControl [data-locale="zh-CN"]');await click('#fontDecreaseButton');await click('#fontDecreaseButton');
  await evaluate("location.reload()");await until('window.__xldAppReady===true');
  assert.equal(await evaluate("document.querySelector('#analysisTargetTitle').textContent"),fixture.track.title);
  assert(await evaluate("document.querySelector('#workspace-tab-overview').getAttribute('aria-selected')==='true' && document.querySelector('#audioElement').paused"));
  assert.equal(runs.length,1);assert.deepEqual(errors,[]);
  checks.push('Reload restores the work track into overview without autoplay or automatic analysis; no duplicate DOM IDs or renderer errors');
 }catch(error){process.exitCode=1;console.error(error,errors);if(win)fs.writeFileSync(path.join(root,'workspace-failure.png'),(await win.webContents.capturePage()).toPNG());}
 finally{
  for(const[file,data]of backup){if(data)fs.writeFileSync(file,data);else if(fs.existsSync(file))fs.unlinkSync(file);}
  if(!process.exitCode){fs.writeFileSync(path.join(root,'workspace-ui.json'),JSON.stringify({pass:true,checks,errors,opened,runs,profile},null,2));console.log(JSON.stringify({checks,errors,opened,runs}));}
  win?.destroy();app.exit(process.exitCode||0);
 }
});
