'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(process.argv[2]),manifest=JSON.parse(fs.readFileSync(path.join(root,'release-manifest.json')));
for(const item of manifest.files){
 const file=path.resolve(root,item.path),relative=path.relative(root,file);
 if(!relative || relative.startsWith('..') || path.isAbsolute(relative))throw Error('Unsafe manifest path');
 const hash=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 if(hash!==item.sha256)throw Error('Release file differs: '+item.path);
}
console.log('Release hashes: PASS ('+manifest.files.length+' files)');
