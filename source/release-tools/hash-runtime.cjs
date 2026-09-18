'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function hash(file){const digest=crypto.createHash('sha256'),buffer=Buffer.alloc(8*1024*1024),fd=fs.openSync(file,'r');try{let read;while((read=fs.readSync(fd,buffer,0,buffer.length,null)))digest.update(buffer.subarray(0,read));}finally{fs.closeSync(fd);}return digest.digest('hex');}
function write(root,removed=[]){
 const files=[];function scan(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(file===path.join(root,'cache') || file===path.join(root,'models/huggingface/modules') || entry.name==='__pycache__')continue;if(entry.isDirectory())scan(file);else if(file!==path.join(root,'runtime-manifest.json'))files.push({path:path.relative(root,file).replaceAll('\\','/'),bytes:fs.statSync(file).size,sha256:hash(file)});}}scan(root);
 const manifest={schemaVersion:1,createdAt:new Date().toISOString(),removedAbsolutePth:removed,files};fs.writeFileSync(path.join(root,'runtime-manifest.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify({root,files:files.length,gib:files.reduce((n,f)=>n+f.bytes,0)/1024**3}));return manifest;
}
module.exports={hash,write};
if(require.main===module)write(process.argv[2]);
