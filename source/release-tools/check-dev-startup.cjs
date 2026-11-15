'use strict';
const fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const {spawn}=require('node:child_process');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function freePort(){const server=net.createServer();await new Promise((r,j)=>server.once('error',j).listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));return port;}
async function connect(port,child,deadline){
 let lastError='',lastPages=[];
 while(Date.now()<deadline){
  if(child.exitCode!==null)throw Error('Executable exited before opening a window: '+child.exitCode);
  try{
   const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list',{signal:AbortSignal.timeout(1000)})).json();
   lastPages=pages.map(p=>({type:p.type,url:p.url}));
   const page=pages.find(p=>p.type==='page'&&p.url.includes('runtime-baseline/index.html'));
   if(page){
    const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{const timer=setTimeout(()=>j(Error('WebSocket handshake timed out')),3000);ws.onopen=()=>{clearTimeout(timer);r();};ws.onerror=e=>{clearTimeout(timer);j(Error('WebSocket handshake failed: '+(e.message||e.type)));};});
    let id=0;const pending=new Map();
    ws.onmessage=e=>{const m=JSON.parse(e.data),job=pending.get(m.id);if(!job)return;pending.delete(m.id);clearTimeout(job.timer);if(m.error)job.reject(Error(m.error.message));else job.resolve(m.result);};
    const call=(method,params={})=>new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>{pending.delete(key);reject(Error('CDP timeout '+method));},8000);pending.set(key,{resolve,reject,timer});ws.send(JSON.stringify({id:key,method,params}));});
    return {call,close:()=>{for(const job of pending.values()){clearTimeout(job.timer);job.reject(Error('connection closed'));}pending.clear();ws.close();}};
   }
  }catch(e){if(e.cause?.code==='EACCES')throw Error('Local window inspection is blocked by the execution environment (EACCES)');lastError=e.message;}await wait(100);
 }throw Error('No packaged window on '+port+'; last probe: '+lastError+'; pages: '+JSON.stringify(lastPages));
}
async function checkStartup({candidate,reportRoot,libraryRoot,analysisRoot}){
 for(const value of [candidate,reportRoot,libraryRoot,analysisRoot])if(!path.isAbsolute(value))throw Error('Startup paths must be absolute');
 // An acceptance run may write hand-off/state; require an explicitly isolated work/ analysis directory.
 const normalized=path.resolve(analysisRoot).split(path.sep).map(p=>p.toLowerCase());
 if(!normalized.includes('work'))throw Error('Startup analysis must be an isolated work/ fixture');
 const seed=JSON.parse(fs.readFileSync(path.join(candidate,'development-settings.json'),'utf8'));
 const version=JSON.parse(fs.readFileSync(path.join(candidate,'resources/app/package.json'),'utf8')).version;
 fs.mkdirSync(reportRoot,{recursive:true});
 const profiles=path.join(reportRoot,'profiles-'+Date.now());
 const shared=path.join(profiles,"Xin's Local Deck Beta/settings.json"),report={ok:false,version,profiles,seed,apps:[]};
 for(const name of ['XML','XLD']){
  const port=await freePort();let client,child,output='';const errors=[];
  try{
   const env={...process.env,XML_TEST:'1',XLD_TEST:'1',XIN_RELEASE_TEST_ROOT:profiles,XIN_RELEASE_TEST_LIBRARY_ROOT:libraryRoot,XIN_RELEASE_TEST_ANALYSIS_ROOT:analysisRoot};
   delete env.ELECTRON_RUN_AS_NODE;delete env.XIN_RELEASE_XLD_DEBUG_PORT;
   child=spawn(path.join(candidate,name+'.exe'),['--remote-debugging-port='+port,'--remote-debugging-address=127.0.0.1','--no-sandbox','--disable-gpu'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
   const log=v=>{output+=v;fs.writeFileSync(path.join(reportRoot,name+'-startup.log'),output);};
   child.stdout.on('data',log);child.stderr.on('data',log);child.on('error',e=>errors.push(e.message));
   const deadline=Date.now()+60000;client=await connect(port,child,deadline);
   const evaluate=async expression=>{const r=await client.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
   let ready=false;
   while(Date.now()<deadline){ready=await evaluate(name==='XML'?'Boolean(window.XinShell&&window.XinScoreSceneView&&document.getElementById("releaseHelp"))':'Boolean(window.__xldAppReady&&document.getElementById("releaseHelp"))');if(ready)break;await wait(150);}
   if(!ready)throw Error(name+' shell never became ready');
   const settings=JSON.parse(fs.readFileSync(shared,'utf8'));
   if(path.resolve(settings.libraryRoot)!==path.resolve(libraryRoot)||path.resolve(settings.analysisRoot)!==path.resolve(analysisRoot))throw Error('Unexpected shared folders');
   const expected=path.join(candidate,'resources/apps',name==='XML'?'fusion-runtime-baseline':'xld-runtime-baseline','index.html');
   if(name==='XLD')await evaluate('document.querySelector(".album-card")?.click()');
   const state=await evaluate('({url:location.href,title:document.title,help:document.getElementById("releaseHelp").textContent,score:!!window.XinScoreSceneView,layerButtons:[...document.querySelectorAll("#scoreLayersTrackButton,#scoreLayersAlbumButton")].filter(e=>e.getBoundingClientRect().width>0).length})');
   if(path.resolve(require('node:url').fileURLToPath(state.url))!==path.resolve(expected))throw Error('Loaded the wrong application entry');
   const releaseInfo=await evaluate('window.XinRelease.info()');
   if(releaseInfo.version!==version||!state.help.includes(version))throw Error('Release version missing from shell');
   if(name==='XLD'&&state.layerButtons!==2)throw Error('Score-layer buttons missing from XLD');
   if(name==='XML'){
    const roots=await evaluate('window.XinsMusicLabFusion.settings()');
    if(path.resolve(roots.settingsPath)!==path.resolve(shared))throw Error('XML did not use the shared settings');
   }
   await wait(600);if(child.exitCode!==null)throw Error('Executable did not stay running');
   const screenshot=await client.call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(reportRoot,name+'-startup.png'),Buffer.from(screenshot.data,'base64'));
   report.apps.push({name,pid:child.pid,ready,settings,state,ok:true});
   fs.writeFileSync(path.join(reportRoot,name+'-startup.log'),output);
   // Close only this test's own application, never an existing user instance.
   await Promise.race([client.call('Browser.close').catch(()=>{}),wait(800)]);
  }catch(e){report.apps.push({name,ok:false,error:e.stack,errors});throw e;}
  finally{client?.close();if(child&&child.exitCode===null)child.kill();fs.writeFileSync(path.join(reportRoot,'startup.json'),JSON.stringify(report,null,2));}
 }
 report.ok=true;fs.writeFileSync(path.join(reportRoot,'startup.json'),JSON.stringify(report,null,2));return report;
}
if(require.main===module){const [candidate,reportRoot,libraryRoot,analysisRoot]=process.argv.slice(2).map(p=>path.resolve(p));checkStartup({candidate,reportRoot,libraryRoot,analysisRoot}).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.stack);process.exitCode=1;});}
module.exports={checkStartup,connect,freePort};
