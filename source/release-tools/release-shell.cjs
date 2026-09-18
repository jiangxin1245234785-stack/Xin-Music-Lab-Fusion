'use strict';
const path=require('node:path'),{fileURLToPath}=require('node:url');
function install({root,isXml,version,electron,runtime,interfaceOnly=false}) {
  const {app,BrowserWindow,ipcMain,dialog}=electron;
  const product=isXml?"Xin’s Music Lab":"Xin’s Local Deck";
  const entry=path.join(root,'resources/apps',isXml?'fusion-runtime-baseline':'xld-runtime-baseline','index.html');
  const guide=path.join(root,'使用说明.html');
  let helpWindow=null;
  const isMain=contents=>{try{return path.resolve(fileURLToPath(contents.getURL()))===path.resolve(entry);}catch(_){return false;}};
  function openHelp(parent) {
    if(helpWindow && !helpWindow.isDestroyed()) {if(process.env.XLD_TEST!=='1' && process.env.XML_TEST!=='1'){helpWindow.show();helpWindow.focus();}return;}
    helpWindow=new BrowserWindow({parent,width:860,height:760,minWidth:640,minHeight:480,show:false,
      backgroundColor:'#10121a',autoHideMenuBar:true,title:`${product} · ${version} · 使用帮助`,
      webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,
        offscreen:process.env.XLD_TEST==='1'||process.env.XML_TEST==='1',backgroundThrottling:false}});
    helpWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    helpWindow.webContents.on('will-navigate',event=>event.preventDefault());
    helpWindow.once('ready-to-show',()=>{if(process.env.XLD_TEST!=='1' && process.env.XML_TEST!=='1')helpWindow?.show();});
    helpWindow.once('closed',()=>{helpWindow=null;});
    helpWindow.loadFile(guide).catch(error=>{helpWindow?.close();dialog.showErrorBox('无法打开使用说明',error.message);});
  }
  const guard=(event)=>{if(!isMain(event.sender))throw Error('release-action-unavailable');};
  ipcMain.handle('release:info',(event)=>{guard(event);return {version,product,interfaceOnly};});
  ipcMain.handle('release:help',(event)=>{guard(event);openHelp(BrowserWindow.fromWebContents(event.sender));return {ok:true};});
  ipcMain.handle('release:status',async(event,locale)=>{
    guard(event);const english=locale==='en-US';let status;
    try{status=runtime.inspect(runtime.read(path.join(root,'runtime.json')));}catch(error){status={ok:false,missing:[{key:'runtime.json',path:error.message}]};}
    const message=status.ok?(english?'Runtime paths are available.':'运行环境路径可访问。'):(english?'Some runtime paths are missing.':'部分运行环境路径缺失。');
    const detail=[`${product} ${version}`,root,...status.missing.map(item=>`${item.key}: ${item.path}`),
      english?'Model readiness is shown in the workspace.':'具体模型是否可用，请查看工作台模型卡片。'].join('\n');
    await dialog.showMessageBox(BrowserWindow.fromWebContents(event.sender),{type:status.ok?'info':'warning',title:english?'Version and environment':'版本与环境',message,detail,buttons:[english?'Close':'关闭']});
    return {ok:status.ok};
  });
  app.on('browser-window-created',(_event,win)=>{
    win.setIcon(path.join(root,'resources/branding',isXml?'XML.ico':'XLD.ico'));
    win.webContents.on('did-finish-load',()=>{if(isMain(win.webContents))win.setTitle(`${product} · ${version}`);});
    win.on('page-title-updated',event=>{if(isMain(win.webContents)){event.preventDefault();win.setTitle(`${product} · ${version}`);}});
    win.webContents.on('before-input-event',(event,input)=>{if(isMain(win.webContents)&&input.type==='keyDown'&&input.key==='F1'){event.preventDefault();openHelp(win);}});
  });
}
module.exports={install};
