'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url'),{EventEmitter}=require('node:events');
const {install}=require('./release-shell.cjs');
async function main(){
 const root=path.resolve(__dirname,'test-release'),handlers=new Map(),windows=[],messages=[];
 const app=new EventEmitter();let missing=[];
 class Window extends EventEmitter{
  constructor(options={}){super();this.options=options;this.webContents=new EventEmitter();this.webContents.getURL=()=>this.url||'';this.webContents.setWindowOpenHandler=fn=>this.openHandler=fn;windows.push(this);app.emit('browser-window-created',null,this);}
  loadFile(file){this.url=pathToFileURL(file).href;this.webContents.emit('did-finish-load');return Promise.resolve();}
  isDestroyed(){return false;}setTitle(title){this.title=title;}show(){}focus(){}close(){this.emit('closed');}
  setIcon(icon){this.icon=icon;}
  static fromWebContents(contents){return windows.find(w=>w.webContents===contents);}
 }
 install({root,isXml:false,version:'0.5.0-rc.4',electron:{app,BrowserWindow:Window,ipcMain:{handle:(key,fn)=>handlers.set(key,fn)},dialog:{showMessageBox:async(...args)=>messages.push(args.at(-1)),showErrorBox:()=>assert.fail('Unexpected guide load error')}},runtime:{read:()=>({}),inspect:()=>({ok:!missing.length,missing})}});
 const main=new Window();await main.loadFile(path.join(root,'resources/apps/xld-runtime-baseline/index.html'));
 const event={sender:main.webContents};
 assert.equal(main.icon,path.join(root,'resources/branding/XLD.ico'));
 assert.equal(handlers.get('release:info')(event).version,'0.5.0-rc.4');assert(main.title.includes('rc.4'));
 assert.throws(()=>handlers.get('release:info')({sender:{getURL:()=> 'https://example.com'}}));
 await handlers.get('release:help')(event);await handlers.get('release:help')(event);assert.equal(windows.length,2);
 assert(windows[1].url.endsWith('.html'));assert.equal(windows[1].options.webPreferences.nodeIntegration,false);assert.equal(windows[1].options.webPreferences.sandbox,true);
 let prevented=false;main.webContents.emit('before-input-event',{preventDefault:()=>prevented=true},{type:'keyDown',key:'F1'});assert(prevented);assert.equal(windows.length,2);
 await handlers.get('release:status')(event,'en-US');assert.equal(messages.at(-1).type,'info');assert(messages.at(-1).detail.includes('0.5.0-rc.4'));
 missing=[{key:'XLD_MIDI_PYTHON',path:'missing/python.exe'}];await handlers.get('release:status')(event,'zh-CN');assert.equal(messages.at(-1).type,'warning');assert(messages.at(-1).detail.includes('missing/python.exe'));
 console.log('Release shell: PASS (version, title, trusted IPC, F1, help reuse, path status, sandboxed guide)');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
