'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const [candidate,fixtureFile,out]=process.argv.slice(2);
const fixture=JSON.parse(fs.readFileSync(fixtureFile)),profiles=path.join(out,'profiles-'+Date.now());
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));const children=[];let client;
async function connect(port,match=null){
 for(let i=0;i<200;i++){
  try{const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();const page=pages.find(page=>page.type==='page' && (match?page.url===match:!page.url.includes(encodeURIComponent('使用说明'))));if(page){const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});let id=0;const pending=new Map();ws.onmessage=event=>{const message=JSON.parse(event.data);if(message.id){const job=pending.get(message.id);pending.delete(message.id);if(message.error)job.reject(Error(message.error.message));else job.resolve(message.result);}};return {close:()=>ws.close(),call:(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params}));})};}}
  catch(_){}await wait(100);
 }throw Error('No packaged window on '+port);
}
async function evaluate(code){const response=await client.call('Runtime.evaluate',{expression:code,awaitPromise:true,returnByValue:true});if(response.exceptionDetails)throw Error(JSON.stringify(response.exceptionDetails));return response.result.value;}
async function checkHelp(port,name){
 const version=JSON.parse(fs.readFileSync(path.join(candidate,'resources/app/package.json'))).version;
 await until('document.querySelector("#releaseHelp")');
 assert((await evaluate('document.querySelector("#releaseHelp").textContent')).includes(version));
 await evaluate('document.querySelector("#releaseHelp").click()');await wait(300);
 await evaluate('document.querySelector("#releaseHelp").click()');await wait(300);
 const guideUrl=require('node:url').pathToFileURL(path.join(candidate,'使用说明.html')).href;
 const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
 const guides=pages.filter(page=>page.url===guideUrl);assert.equal(guides.length,1,'Help window reused');
 const helper=await connect(port,guideUrl);
 const result=await helper.call('Runtime.evaluate',{expression:'({text:document.body.innerText,overflow:document.documentElement.scrollWidth>innerWidth})',returnByValue:true});
 assert(result.result.value.text.includes(version));assert(result.result.value.text.includes('drums'));assert.equal(result.result.value.overflow,false);
 const shot=await helper.call('Page.captureScreenshot');fs.writeFileSync(path.join(out,name+'-guide.png'),Buffer.from(shot.data,'base64'));helper.close();
 await client.call('Target.closeTarget',{targetId:guides[0].id});
 await evaluate('document.documentElement.lang="en-US"');await wait(100);assert((await evaluate('document.querySelector("#releaseHelp").textContent')).endsWith('Help'));
 await evaluate('document.documentElement.lang="zh-CN"');await wait(100);assert((await evaluate('document.querySelector("#releaseHelp").textContent')).endsWith('帮助'));
 // Actual F1 input invokes the same local guide without spawning duplicates.
 await evaluate('document.dispatchEvent(new KeyboardEvent("keydown",{key:"F1",bubbles:true,cancelable:true}))');await wait(300);
 const reopened=(await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(page=>page.url===guideUrl);assert(reopened,'F1 guide');
 await client.call('Target.closeTarget',{targetId:reopened.id});
}
async function until(code){for(let i=0;i<300;i++){if(await evaluate('Boolean('+code+')'))return;await wait(100);}throw Error('Timeout '+code);}
function launch(name,port){const child=spawn(path.join(candidate,name+'.exe'),['--remote-debugging-address=127.0.0.1','--remote-debugging-port='+port,'--disable-gpu'],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,XLD_TEST:'1',XML_TEST:'1',XIN_RELEASE_TEST_ROOT:profiles,XIN_RELEASE_XLD_DEBUG_PORT:'19381'}});children.push(child);let log='';child.stderr.on('data',data=>{log+=data;fs.writeFileSync(path.join(out,name+'-stderr.log'),log);});return child;}
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const xldProfile=path.join(profiles,"Xin's Local Deck Beta");fs.mkdirSync(xldProfile,{recursive:true});fs.copyFileSync(path.join(fixture.profile,'settings.json'),path.join(xldProfile,'settings.json'));
 try{
  launch('XLD',19381);client=await connect(19381);await until('window.__xldAppReady===true');
  assert.equal(require('node:url').fileURLToPath(await evaluate('location.href')),path.join(candidate,'resources/apps/xld-runtime-baseline/index.html'));
  await checkHelp(19381,'xld');
  await client.call('Emulation.setDeviceMetricsOverride',{width:1180,height:850,deviceScaleFactor:1,mobile:false});
  await evaluate("[...document.querySelectorAll('.album-card')].find(card=>card.textContent.includes('LAST WALTZ')).click()");
  await evaluate(`document.querySelector('[data-track-id="${fixture.track.id}"]').click();document.querySelector('[data-workspace-tab="midi"]').click()`);
  await until('!document.querySelector("#midiBatchRun").disabled');
  await evaluate('document.querySelector("#midiBatchRun").click()');
  await until('!document.querySelector("#midiBatchRun").disabled && document.querySelector("#midiMergeStatus").textContent.includes("'+(fixture.expectedMergeNoteCount || 4165)+'")');
  assert(await evaluate('!document.querySelector("#midiBatchFolder").disabled'),'Song directory ready after batch');
  await evaluate("document.querySelector('.midi-batch-card').scrollIntoView({block:'start'})");await wait(300);
  let shot=await client.call('Page.captureScreenshot');fs.writeFileSync(path.join(out,'xld-packaged.png'),Buffer.from(shot.data,'base64'));
  client.close();children[0].kill();await wait(500);
  launch('XML',19382);client=await connect(19382);
  await until('window.XinsMusicLabFusion && document.querySelector("#fusionStemSelect")');
  const entry=await evaluate('location.href');assert.equal(require('node:url').fileURLToPath(entry),path.join(candidate,'resources/apps/fusion-runtime-baseline/index.html'));
  await checkHelp(19382,'xml');
  await evaluate('window.XinsMusicLabFusion.scanLibrary()');
  const handoff=await evaluate(`window.XinsMusicLabFusion.analyzeInXld(${JSON.stringify(fixture.track.id)},'zh-CN')`);assert(handoff.ok,JSON.stringify(handoff));
  await wait(1000);
  shot=await client.call('Page.captureScreenshot');fs.writeFileSync(path.join(out,'xml-packaged.png'),Buffer.from(shot.data,'base64'));
  client.close();client=await connect(19381);await until('window.__xldAppReady===true && document.querySelector("#analysisTargetTitle").textContent==="Radioactive Spell Wave"');
  assert(!fs.existsSync(path.join(fixture.analysisRoot,'.xml-open-request.json')));
  await Promise.race([client.call('Browser.close').catch(()=>{}),wait(1000)]);
  fs.writeFileSync(path.join(out,'packaged-ui.json'),JSON.stringify({pass:true,entry,handoff,profiles,checks:['release version in both headers','offline help reused','F1 opens guide','help localization','minimum XLD window','packaged XLD boot','one-click cached MIDI and merge','packaged XML boot','same-bundle XLD spawn with selection']},null,2));
  console.log('Packaged apps: PASS');
 }finally{client?.close();for(const child of children)if(child.exitCode===null)child.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
