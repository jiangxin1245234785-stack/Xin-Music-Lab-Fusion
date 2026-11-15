'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function verify(root){
root=path.resolve(root);const manifest=JSON.parse(fs.readFileSync(path.join(root,'release-manifest.json')));
const seen=new Set();
for(const item of manifest.files){
 const file=path.resolve(root,item.path),relative=path.relative(root,file);
 if(!relative || relative.startsWith('..') || path.isAbsolute(relative))throw Error('Unsafe manifest path');
 const hash=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 if(seen.has(item.path))throw Error('Duplicate manifest entry: '+item.path);seen.add(item.path);
 if(hash!==item.sha256||fs.statSync(file).size!==item.bytes)throw Error('Release file differs: '+item.path);
}
return {version:manifest.version,files:manifest.files.length,manifest};
}
if(require.main===module){const result=verify(process.argv[2]);console.log('Release hashes: PASS ('+result.files+' files)');}
module.exports={verify};
