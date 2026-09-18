'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
if(process.argv[2]==='--hash-only'){require('./hash-runtime.cjs').write(process.argv[3]);process.exit(0);}
const [output,configFile,base312,base310]=process.argv.slice(2);
if(![output,configFile,base312,base310].every(item=>item&&path.isAbsolute(item)))throw Error('Four absolute paths required');
if(fs.existsSync(output))throw Error('Output already exists');
const config=JSON.parse(fs.readFileSync(configFile)),p=config.paths,removed=[];
fs.mkdirSync(output,{recursive:true});
function copy(source,target,filter=()=>true){fs.cpSync(source,target,{recursive:true,dereference:true,filter:file=>!file.split(path.sep).includes('__pycache__')&&!file.endsWith('.pyc')&&filter(file)});}
for(const [tag,base] of [['312',base312],['310',base310]]){
 const dest=path.join(output,'python'+tag);fs.mkdirSync(dest,{recursive:true});
 copy(path.join(base,'Lib'),path.join(dest,'Lib'),file=>!file.split(path.sep).includes('site-packages'));
 copy(path.join(base,'DLLs'),path.join(dest,'DLLs'));
 copy(path.join(base,'LICENSE.txt'),path.join(dest,'LICENSE.txt'));
}
const specs=[['msaf','312',p.XLD_PYTHON],['ai','312',p.XLD_AI_PYTHON],['basic','310',p.XLD_MIDI_PYTHON],['highres','312',p.XLD_HIGHRES_PYTHON],['roformer','312',p.XLD_ROFORMER_PYTHON]];
for(const [name,tag,python] of specs){
 console.log('Copy environment: '+name);
 const base=tag==='312'?base312:base310,env=path.join(output,'envs',name);fs.mkdirSync(env,{recursive:true});
 for(const item of fs.readdirSync(base).filter(file=>/^(python(w)?\.exe|python\d*\.dll|vcruntime.*\.dll)$/.test(file)))copy(path.join(base,item),path.join(env,item));
 const source=path.resolve(python,'../../Lib/site-packages');
 copy(source,path.join(env,'Lib/site-packages'),file=>{
  if(file.endsWith('.pth')){
   const text=fs.readFileSync(file,'utf8');
   if(text.split(/\r?\n/).some(line=>/^[A-Za-z]:[\\/]/.test(line.trim()))){removed.push({environment:name,file:path.basename(file),content:text});return false;}
  }return true;
 });
 const paths=['.','../../python'+tag+'/Lib','../../python'+tag+'/DLLs','Lib/site-packages'];
 if(['highres','roformer'].includes(name))paths.push('../ai/Lib/site-packages');
 fs.writeFileSync(path.join(env,'python'+tag+'._pth'),paths.concat('import site','').join('\n'));
}
console.log('Copy analysis scripts and weights');
for(const name of ['analysis','analysis-ai','analysis-harmony'])copy(path.join(p.XLD_RUNTIME_ROOT,name),path.join(output,'scripts',name),file=>!file.split(path.sep).some(part=>['.venv','torch-home'].includes(part)));
copy(p.XLD_HIGHRES_MODELS,path.join(output,'models/highres'));
copy(p.XLD_ROFORMER_MODELS,path.join(output,'models/roformer'));
copy(p.XLD_SEPARATION_TORCH_HOME,path.join(output,'models/demucs'));
copy(p.TORCH_HOME,path.join(output,'models/torch'));
for(const name of ['models--ASLP-lab--SongFormer','models--facebook--wav2vec2-conformer-rope-large-960h-ft'])copy(path.join(p.HF_HOME,'hub',name),path.join(output,'models/huggingface/hub',name),file=>!file.split(path.sep).includes('blobs'));
console.log('Hash runtime files');require('./hash-runtime.cjs').write(output,removed);
