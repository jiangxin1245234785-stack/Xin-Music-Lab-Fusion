'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('Setup',Object.freeze({
 state:()=>ipcRenderer.invoke('setup:state'),pick:(id,key)=>ipcRenderer.invoke('setup:pick',{id,key}),
 probe:(id,values)=>ipcRenderer.invoke('setup:probe',{id,values}),save:(id,values)=>ipcRenderer.invoke('setup:save',{id,values}),
 official:(id,index)=>ipcRenderer.invoke('setup:official',{id,index}),install:()=>ipcRenderer.invoke('setup:install'),
 cancel:()=>ipcRenderer.invoke('setup:cancel'),export:()=>ipcRenderer.invoke('setup:export'),
 library:()=>ipcRenderer.invoke('library:choose'),output:()=>ipcRenderer.invoke('analysis:choose-root'),
 log:fn=>{const handler=(_event,text)=>fn(text);ipcRenderer.on('setup:log',handler);return ()=>ipcRenderer.removeListener('setup:log',handler);}
}));
