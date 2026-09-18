'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {trackDirectory}=require('../../xld-runtime-baseline/core/derived-assets.cjs');
async function readLatestTrack(indexed, roots, validate) {
  const candidates=roots.flatMap(root=>[trackDirectory(indexed,root),trackDirectory(indexed,root,true)])
    .map(directory=>path.join(directory,'music-lab.json'));
  if(indexed.bridgePath)candidates.push(indexed.bridgePath);
  const seen=new Set();
  for(const filePath of candidates){
    const key=path.resolve(filePath).toLowerCase();if(seen.has(key))continue;seen.add(key);
    let text;
    try{text=await fs.readFile(filePath,'utf8');}catch(error){if(error.code==='ENOENT')continue;return {ok:false,error:'read-failed'};}
    let manifest;try{manifest=JSON.parse(text);}catch(_){return {ok:false,error:'invalid-json'};}
    const checked=validate(manifest,{trackId:indexed.id,sourcePath:indexed.filePath});
    if(!checked.ok)return checked;
    return {ok:true,manifest,filePath};
  }
  return {ok:true,manifest:null,filePath:''};
}
module.exports={readLatestTrack};
