'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {app,BrowserWindow}=require('electron');
const {surveyShell}=require('./helpers/shell-survey.cjs');
const project=path.resolve(__dirname,'../../..');
const output=path.resolve(process.env.XML_SHELL_RESULT_DIR||path.join(project,'work/score-stability-20261111/matrix'));
const settingsFile=path.resolve(process.env.XML_SHELL_SETTINGS||path.join(project,"work/scoreview-20261110/xml-fixture/appdata/Xin's Local Deck Beta/settings.json"));
const settings=JSON.parse(fs.readFileSync(settingsFile,'utf8'));
const allowed=path.resolve(project,'work')+path.sep;
if(!path.resolve(settings.analysisRoot).startsWith(allowed))throw Error('Matrix requires isolated analysis under work/');
fs.mkdirSync(output,{recursive:true});
const profile=path.join(output,'profile-'+Date.now());
fs.mkdirSync(path.join(profile,"Xin's Local Deck Beta"),{recursive:true});
fs.writeFileSync(path.join(profile,"Xin's Local Deck Beta/settings.json"),JSON.stringify(settings));
app.setPath('appData',profile);app.setPath('userData',path.join(profile,'XML'));
process.env.XML_TEST='1';app.disableHardwareAcceleration();
require(process.env.SCOREVIEW_XML_MAIN||path.join(__dirname,'../desktop/main.cjs'));
const wait=ms=>new Promise(r=>setTimeout(r,ms)),report={scenarios:[],errors:[],settings};
app.whenReady().then(async()=>{
 let win;const watchdog=setTimeout(()=>{console.error('matrix timeout');app.exit(1);},180000);
 try{
  for(let i=0;i<300;i++){win=BrowserWindow.getAllWindows()[0];if(win&&!win.webContents.isLoading())break;await wait(50);}
  const js=s=>win.webContents.executeJavaScript(s,true);
  const until=async s=>{for(let i=0;i<300;i++){if(await js('Boolean('+s+')'))return;await wait(50);}throw Error('timeout '+s);};
  win.webContents.on('console-message',e=>{if(e.level===3||e.level==='error')report.errors.push(e.message);});
  await until('window.XinShell&&window.xinMusicLabLocale&&window.XinScoreSceneView');
  const actual=await js('window.XinsMusicLabFusion.settings()');assert.equal(path.resolve(actual.settingsPath),path.join(profile,"Xin's Local Deck Beta/settings.json"));
  const tracks=(await js('window.XinsMusicLabFusion.scanLibrary()')).tracks;
  const song=tracks.find(t=>t.title==='MEGURI');assert(song,'MEGURI fixture');
  // Let the initial restore finish, then select through the real library. Setting last-track
  // while the initial async load was still pending could be overwritten before a reload.
  await until('window.XinScoreSceneView.status().trackId&&window.XinScoreSceneView.status().status!=="loading"');
  await js(`(()=>{const input=document.getElementById('fusionLibrarySearch');input.value='MEGURI';input.dispatchEvent(new Event('input'));document.querySelector('[data-track-id="${song.id}"] button').click();})()`);
  await until(`window.XinScoreSceneView?.status().trackId===${JSON.stringify(song.id)}&&window.XinScoreSceneView?.status().status==='ready'`);
  await js('document.getElementById("fusionAudio").muted=true');
  await js('window.SmokeResonanceGlitch.set({enabled:false})');
  win.webContents.debugger.attach('1.3');
  const sizes=process.env.XML_SHELL_QUICK==='1'?[[1280,720]]:[[1280,720],[1427,817],[1920,1080]];
  for(const locale of ['zh-CN','en-US'])for(const [width,height]of sizes)for(const scale of [1,1.2,1.4,1.6]){
   await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
   await js(`(async()=>{await window.xinMusicLabLocale.setLocale(${JSON.stringify(locale)});for(let i=0;i<10;i++){const v=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale'));if(Math.abs(v-${scale})<.01)break;document.getElementById(v>${scale}?'uiScaleDown':'uiScaleUp').click();}})()`);
   assert.equal(await js('document.documentElement.lang'),locale);
   assert.equal(await js('parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ui-scale"))'),scale);
   // The words name the setting only; the state is the switch's own (aria-checked follows aria-pressed).
   assert.equal(await js('document.getElementById("glitchPowerButton").textContent'),locale==='en-US'?'Visual effects':'画面特效');
   assert.equal(await js('document.getElementById("glitchPowerButton").getAttribute("aria-checked")'),await js('document.getElementById("glitchPowerButton").getAttribute("aria-pressed")'));
   const scenario={locale,width,height,scale,states:[]};
   for(const layer of ['main','library','settings','score']){
    await js(`(()=>{document.getElementById('fusionClose').click();window.XinShell.setSettings(false);document.querySelector('.scene-button[data-effect="${layer==='score'?'score':'spectrum'}"]').click();${layer==='library'?"document.getElementById('fusionButton').click();":''}${layer==='settings'?'window.XinShell.setSettings(true);':''}})()`);
    await wait(310);
    await js(`(async()=>{for(let i=0;i<50;i++){const l=document.getElementById('fusionPanel'),s=document.getElementById('xlSettings');const open=e=>e.classList.contains('is-open')&&Number(getComputedStyle(e).opacity)>.99;const closed=e=>!e.classList.contains('is-open')&&Number(getComputedStyle(e).opacity)<.01;if(${layer==='library'?'open(l)&&closed(s)':layer==='settings'?'open(s)&&closed(l)':'closed(l)&&closed(s)'})return;await new Promise(r=>setTimeout(r,75));}throw Error('drawer transition did not settle for ${layer}');})()`);
    const result=await js('('+surveyShell.toString()+')('+JSON.stringify(layer)+')');
    scenario.states.push(result);
    if(layer==='settings'||layer==='library'){
      // Expand the real optional controls too; closed details must never appear as false failures.
      await js(`document.querySelectorAll('${layer==='library'?'#fusionPanel':'#xlSettings'} details').forEach(e=>e.open=true)`);
      scenario.states.push(await js('('+surveyShell.toString()+')('+JSON.stringify(layer)+')'));
      if(width===1280&&scale===1.6){const image=await win.webContents.debugger.sendCommand('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,`${locale}-${layer}-expanded-160.png`),Buffer.from(image.data,'base64'));}
      await js(`document.querySelectorAll('${layer==='library'?'#fusionPanel':'#xlSettings'} details').forEach(e=>e.open=false)`);
    }
   }
   const screenshot=await win.webContents.debugger.sendCommand('Page.captureScreenshot',{format:'png'});
   fs.writeFileSync(path.join(output,`${locale}-${width}x${height}-${Math.round(scale*100)}.png`),Buffer.from(screenshot.data,'base64'));
   report.scenarios.push(scenario);
   console.log(JSON.stringify({locale,width,height,scale,unreachable:scenario.states.flatMap(s=>s.unreachable),clipped:scenario.states.flatMap(s=>s.clipped)}));
  }
  report.ok=report.errors.length===0&&report.scenarios.every(s=>s.states.every(r=>!r.unreachable.length&&!r.clipped.length&&!r.overlays.length&&r.rootScroll.every(v=>v===0)&&r.viewport[0]===s.width&&r.viewport[1]===s.height));
  assert(report.ok,'shell layout matrix failed; see report.json');
 }catch(e){report.error=e.stack;report.ok=false;if(win)report.lastState=await win.webContents.executeJavaScript('({track:document.getElementById("fusionTrack")?.textContent,scene:window.XinScoreSceneView?.status()})').catch(()=>null);console.error(e.stack);}
 finally{fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));clearTimeout(watchdog);app.exit(report.ok?0:1);}
});
