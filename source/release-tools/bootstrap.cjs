'use strict';
const fs=require('node:fs'),path=require('node:path');
const {app,dialog}=require('electron');
const root=path.resolve(__dirname,'../..');
const isXml=path.basename(process.execPath).toLowerCase()==='xml.exe';
app.setName(isXml?"Xin's Music Lab Fusion":"Xin's Local Deck Beta");
app.setAppUserModelId(isXml?'com.xin.musiclab':'com.xin.localdeck');
// Optional development seed gives this build its own profile and single-instance
// namespace, while keeping XML and XLD together. Existing releases are untouched.
const developmentSeed=path.join(root,'development-settings.json');
if(fs.existsSync(developmentSeed)&&!(process.env.XIN_RELEASE_TEST_ROOT&&process.env.XLD_TEST==='1'&&process.env.XML_TEST==='1')){
 const seed=JSON.parse(fs.readFileSync(developmentSeed,'utf8'));
 const profiles=path.join(app.getPath('appData'),'XinMusicDevelopment',app.getVersion());
 fs.mkdirSync(profiles,{recursive:true});app.setPath('appData',profiles);
 const profile=path.join(profiles,app.getName());fs.mkdirSync(profile,{recursive:true});app.setPath('userData',profile);
 if(!isXml&&!fs.existsSync(path.join(profile,'settings.json')))fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({libraryRoot:seed.libraryRoot,analysisRoot:path.resolve(root,seed.analysisRoot)}));
}
// Isolated acceptance runs must never touch the user's profile or hand-off files.
if(process.env.XIN_RELEASE_TEST_ROOT && process.env.XLD_TEST==='1' && process.env.XML_TEST==='1'){
 const profiles=path.resolve(process.env.XIN_RELEASE_TEST_ROOT);
 fs.mkdirSync(profiles,{recursive:true});app.setPath('appData',profiles);
 const profile=path.join(profiles,app.getName());fs.mkdirSync(profile,{recursive:true});app.setPath('userData',profile);
 if(!isXml && process.env.XIN_RELEASE_XLD_DEBUG_PORT)app.commandLine.appendSwitch('remote-debugging-port',process.env.XIN_RELEASE_XLD_DEBUG_PORT);
}
const apps=path.join(root,'resources/apps');
try{
 const runtime=require(path.join(apps,'shared-analysis/runtime-config.cjs'));
 const status=runtime.apply(path.join(root,'runtime.json'));
 require('./release-shell.cjs').install({root,isXml,version:app.getVersion(),electron:require('electron'),runtime});
 process.env.XLD_EXECUTABLE=path.join(root,'XLD.exe');
 if(!status.ok)app.whenReady().then(()=>dialog.showMessageBox({type:'warning',title:'音乐分析环境未就绪',message:'部分分析环境未找到，仍可浏览和播放。',detail:status.missing.map(item=>item.key+': '+item.path).join('\n')+'\n请检查发布目录的 runtime.json。'}));
 require(path.join(apps,isXml?'fusion-runtime-baseline':'xld-runtime-baseline','desktop/main.cjs'));
}catch(error){dialog.showErrorBox('无法启动',error.message+'\n请检查发布文件及 runtime.json。');app.quit();}
