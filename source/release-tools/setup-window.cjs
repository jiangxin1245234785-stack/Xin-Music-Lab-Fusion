'use strict';
const fs=require('node:fs'),path=require('node:path'),{fileURLToPath}=require('node:url');
const core=require('./setup-core.cjs');
function install({root,electron,runtime,isXml=false}){
 const {BrowserWindow,ipcMain,dialog,shell,app}=electron,entry=path.join(__dirname,'setup.html');let window=null,controller=null,last=null;
 const checked=new Map(),reports=new Map();
 const identity=(id,values)=>JSON.stringify([id,core.groupFor(id).keys.map(k=>values[k])]);
 const guard=e=>{if(!window||e.sender!==window.webContents||path.resolve(fileURLToPath(e.sender.getURL()))!==path.resolve(entry)||e.senderFrame&&e.senderFrame!==e.sender.mainFrame)throw Error('Setup action unavailable');};
 const handle=(name,fn)=>ipcMain.handle(name,async(e,p)=>{guard(e);try{return await fn(p);}catch(error){return {ok:false,error:core.redact(error.message)};}});
 const log=text=>{if(window&&!window.isDestroyed())window.webContents.send('setup:log',core.redact(text));};
 function open(parent,locale='zh-CN'){
  if(window&&!window.isDestroyed()){window.show();window.focus();return;}
  window=new BrowserWindow({parent,width:920,height:760,minWidth:720,minHeight:580,show:false,backgroundColor:'#10121a',autoHideMenuBar:true,title:'Xin Music · Setup / 配置',webPreferences:{preload:path.join(__dirname,'setup-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,offscreen:process.env.XLD_TEST==='1'||process.env.XML_TEST==='1',backgroundThrottling:false}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',e=>e.preventDefault());
  window.once('ready-to-show',()=>{if(process.env.XLD_TEST!=='1'&&process.env.XML_TEST!=='1')window?.show();});
  window.on('close',e=>{if(controller){e.preventDefault();log('请先取消或等待当前操作完成 / Cancel or finish the current operation first.\n');}});
  window.once('closed',()=>{window=null;});window.loadFile(entry,{query:{lang:locale.startsWith('en')?'en':'zh'}}).catch(e=>dialog.showErrorBox('Setup',e.message));
 }
 handle('setup:state',()=>{const config=runtime.read(path.join(root,'runtime.json'));return {ok:true,groups:core.groups,paths:config.paths,isXml,version:app.getVersion()};});
 handle('setup:pick',async({id,key})=>{if(!core.groupFor(id).keys.includes(key))throw Error('Unknown field');const python=key.endsWith('_PYTHON'),r=await dialog.showOpenDialog(window,{properties:python?['openFile']:['openDirectory'],...(python?{filters:[{name:'Python',extensions:['exe']}]}:{})});return {ok:true,path:r.canceled?null:r.filePaths[0]};});
 handle('setup:probe',async({id,values})=>{if(controller)throw Error('An operation is already running');controller=new AbortController();try{const report=await core.probe(root,id,values,{signal:controller.signal});last=report;reports.set(id,report);checked.delete(identity(id,values));if(report.ok)checked.set(identity(id,values),true);return report;}finally{controller=null;}});
 handle('setup:save',({id,values})=>{if(controller)throw Error('An operation is already running');if(!checked.has(identity(id,values)))throw Error('Check these paths before saving');return core.save(root,id,values);});
 handle('setup:official',async({id,index})=>{const url=core.groupFor(id).links[index];if(!url)throw Error('Unknown official link');await shell.openExternal(url);return {ok:true};});
 handle('setup:cancel',()=>{controller?.abort();return {ok:true};});
 handle('setup:install',async()=>{
  if(controller)throw Error('An operation is already running');
  const choice=await dialog.showMessageBox(window,{type:'question',message:'安装 MIDI 保存与导出环境 / Install MIDI save & export environment',detail:'从 Astral / PyPI 下载 Python 和 MIDI 依赖，预留 1 GB 空间。不下载 AI 模型、不改系统 Python。\nDownloads Python and MIDI dependencies from Astral / PyPI. Reserve 1 GB. No AI weights or system Python changes.',buttons:['取消 / Cancel','继续 / Continue'],defaultId:0,cancelId:0});if(choice.response!==1)return {ok:false,cancelled:true};
  const picked=await dialog.showOpenDialog(window,{properties:['openDirectory','createDirectory'],title:'选择运行环境存储目录 / Choose environment storage'});if(picked.canceled)return {ok:false,cancelled:true};
  controller=new AbortController();try{const result=await require('./setup-install.cjs').installMidi(root,picked.filePaths[0],{signal:controller.signal,onLog:log});
   last=result.report;reports.set('midi',result.report);checked.set(identity('midi',result.values),true);return {ok:true,values:result.values,report:result.report};
  }finally{controller=null;}
 });
 handle('setup:export',async()=>{const r=await dialog.showSaveDialog(window,{defaultPath:'XinMusic-diagnostics.json',filters:[{name:'JSON',extensions:['json']}]});if(r.canceled)return {ok:false,cancelled:true};
  const report={version:app.getVersion(),platform:process.platform,arch:process.arch,scope:'configuration-and-availability; not full audio inference',backends:Object.fromEntries(reports)};
  fs.writeFileSync(r.filePath,JSON.stringify(report,(_key,value)=>typeof value==='string'?core.redact(value):value,2));return {ok:true};});
 app.on('before-quit',()=>{controller?.abort();controller=null;});
 return {open};
}
module.exports={install};
