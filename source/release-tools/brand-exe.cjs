'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const TOOL_SHA256='e2df7b664db830f159d0dc6b3da8a95442cca175b9577f2d19952646d37ac32f';
function brand({output,sourceRoot,version,rcedit}) {
 if(!rcedit || !path.isAbsolute(rcedit))throw Error('Set XIN_RCEDIT to the reviewed rcedit.exe build tool');
 if(crypto.createHash('sha256').update(fs.readFileSync(rcedit)).digest('hex')!==TOOL_SHA256)throw Error('Unreviewed rcedit build tool');
 const icons=path.join(output,'resources/branding');fs.mkdirSync(icons,{recursive:true});
 for(const [name,product,icon] of [
  ['XLD',"Xin's Local Deck",path.join(__dirname,'assets/xld.ico')],
  ['XML',"Xin's Music Lab",path.join(sourceRoot,'fusion-runtime-baseline/assets/xins-music-lab-icon.ico')]
 ]) {
  const args=[path.join(output,name+'.exe'),'--set-icon',icon,'--set-file-version',version.split('-')[0]+'.0','--set-product-version',version];
  for(const [key,value] of Object.entries({ProductName:product,FileDescription:product,OriginalFilename:name+'.exe',InternalName:name,CompanyName:'Xin',LegalCopyright:'',FileVersion:version,ProductVersion:version}))args.push('--set-version-string',key,value);
  const result=spawnSync(rcedit,args,{windowsHide:true,encoding:'utf8',timeout:30000});
  if(result.status!==0)throw Error('Branding '+name+' failed: '+(result.error?.message||result.stderr));
  fs.copyFileSync(icon,path.join(icons,name+'.ico'));
 }
 return {tool:'electron-winstaller 5.4.0 vendor/rcedit.exe',sha256:TOOL_SHA256};
}
module.exports={brand};
