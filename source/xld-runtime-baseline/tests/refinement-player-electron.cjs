'use strict';
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
app.disableHardwareAcceleration();
app.whenReady().then(async()=>{let w;try{
 w=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true}});await w.loadURL('about:blank');
 for(const name of ['wav-stream.js','refinement-player.js'])await w.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname,'..',name),'utf8'));
 const result=await w.webContents.executeJavaScript(`(async()=>{
  const context=new OfflineAudioContext(1,8000,8000),gain=context.createGain();
  const adapter={get currentTime(){return context.currentTime;},destination:context.destination,resume:async()=>{},createGain:()=>context.createGain(),createBuffer:(...a)=>context.createBuffer(...a),createBufferSource:()=>context.createBufferSource()};
  const player=XldRefinementPlayer.create({createContext:()=>adapter,readChunk:async()=>({ok:true,frames:32000,sampleRate:8000,channels:[new Float32Array(32000).fill(1.5)]})});
  player.set({track:{id:'test'},sourceAudio:{streamKey:'float'},start:1.25,end:1.75,sourceOffset:1.25,gain:.5});player.volume(.8);await player.play();
  const rendered=await context.startRendering(),samples=rendered.getChannelData(0);
  return {middle:samples[1600],after:samples[5000],peak:Math.max(...samples),diagnostics:player.diagnostics()};
 })()`);
 assert(Math.abs(result.middle-.6)<1e-6,'float 1.5 preserved until common gain, not clipped to 1.0');assert.equal(result.after,0,'no audio beyond selected segment');assert(result.peak<=.600001);assert(result.diagnostics.bytes<=64*1024*1024);console.log('Native WebAudio refinement PASS '+JSON.stringify(result));app.exit(0);
 }catch(e){console.error(e);app.exit(1);}finally{w?.destroy();}});
