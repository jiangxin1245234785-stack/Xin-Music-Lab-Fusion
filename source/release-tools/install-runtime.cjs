'use strict';
const fs=require('node:fs'),path=require('node:path');
const {hash}=require('./hash-runtime.cjs');
const [source,target]=process.argv.slice(2);
if(!source || !target || !path.isAbsolute(source) || !path.isAbsolute(target) || fs.existsSync(target))throw Error('New absolute runtime target required');
const manifest=JSON.parse(fs.readFileSync(path.join(source,'runtime-manifest.json')));
function inside(root,relative){const file=path.resolve(root,relative),rel=path.relative(root,file);if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw Error('Unsafe manifest path');return file;}
let count=0;
for(const item of manifest.files){
 const from=inside(source,item.path),to=inside(target,item.path);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);
 if(hash(to)!==item.sha256)throw Error('Runtime hash mismatch: '+item.path);
 if(++count%10000===0)console.log('Verified '+count+' files');
}
fs.copyFileSync(path.join(source,'runtime-manifest.json'),path.join(target,'runtime-manifest.json'));
console.log(JSON.stringify({ok:true,target,files:count}));
