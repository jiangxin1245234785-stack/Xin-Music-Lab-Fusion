'use strict';
// Exact-file deletion only. The renderer never supplies paths. Preview tokens bind a complete disk snapshot.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const canonical=p=>path.resolve(p).toLowerCase();
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&canonical(a)===canonical(b);
const within=(root,file)=>{const r=path.relative(path.resolve(root),path.resolve(file));return !!r&&!r.startsWith('..'+path.sep)&&r!=='..'&&!path.isAbsolute(r);};
async function safeStat(file){
 file=path.resolve(file);const parsed=path.parse(file);let p=parsed.root;
 for(const part of file.slice(parsed.root.length).split(path.sep).filter(Boolean)){p=path.join(p,part);let s;try{s=await fs.lstat(p);}catch(e){if(e.code==='ENOENT')return null;throw e;}if(s.isSymbolicLink())throw Error('track-remove-link-rejected: '+p);}
 return fs.lstat(file);
}
async function read(file){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT'||e instanceof SyntaxError)return null;throw e;}}
const stamp=s=>[s.size,s.mtimeMs,s.ino,s.dev,s.nlink];
const JOURNAL='.xld-track-removal.json';
const AUDIO=/\.(wav|flac|mp3|m4a|aac|ogg|opus|aiff?|wma|pcm|npy|npz)$/i;
function createTrackRemoval({getTrack,getTracks=()=>[],getRoot,getLibraryRoot,getLegacyRoot=()=>null,cacheDir=path.join(os.tmpdir(),'xin-stem-cache'),coverCacheDir=null,analysisLock=null,suspendDecode=()=>()=>{},isBusy=()=>false,removeFile=file=>fs.unlink(file),onChanged=()=>{}}){
 let mutating=false;const plans=new Map(),approvals=new Map();
 async function collect(trackId){
  const track=getTrack(String(trackId||''));if(!track||!path.isAbsolute(track.filePath||''))throw Error('unknown-track');
  const root=path.resolve(getRoot()),library=path.resolve(getLibraryRoot()),source=path.resolve(track.filePath),blocked=[],warnings=[],files=[],directories=[];
  if(!within(library,source))blocked.push('原曲不在当前音乐库内');
  if([...getTracks()].some(t=>t.id!==track.id&&same(t.filePath,source)))blocked.push('原曲仍被其他曲目引用');
  async function add(file,kind,owner){const s=await safeStat(file);if(!s)return;if(!s.isFile())throw Error('track-remove-not-file: '+file);files.push({path:file,kind,owner,bytes:s.size,reclaimableBytes:s.nlink>1?0:s.size,stamp:stamp(s)});if(s.nlink>1)warnings.push('硬链接仅删除本路径，不计入预计释放空间：'+file);}
  try{await add(source,'original',library);}catch(e){blocked.push(e.message);}
  if(track.stat){const f=files.find(f=>f.kind==='original');if(f&&(f.bytes!==track.stat.size||f.stamp[1]!==track.stat.mtimeMs))blocked.push('原曲已变化，请重新扫描音乐库');}
  if(!files.some(f=>f.kind==='original'))warnings.push('原曲路径已不存在');
  const roots=[root,getLegacyRoot()].filter(Boolean).map(p=>path.resolve(p));
  const candidates=new Set();
  for(const base of new Set(roots)){
   try{const s=await safeStat(base);if(!s)continue;if(!s.isDirectory())throw Error('analysis-root-invalid');
    // Existing XLD storage layout: album / track. Do not descend through any link.
    for(const a of await fs.readdir(base,{withFileTypes:true})){
     const ap=path.join(base,a.name);if(a.isSymbolicLink())continue;if(!a.isDirectory())continue;await safeStat(ap);
     if(base!==root&&a.name===track.id)candidates.add(ap);
     if(base===root)for(const b of await fs.readdir(ap,{withFileTypes:true}))if(b.isDirectory()&&!b.isSymbolicLink())candidates.add(path.join(ap,b.name));
    }
   }catch(e){blocked.push(e.message);}
  }
  const owned=[];
  for(const directory of candidates){
   try{
    await safeStat(directory);await safeStat(path.join(directory,'track.json'));await safeStat(path.join(directory,'stems.json'));await safeStat(path.join(directory,'music-lab.json'));await safeStat(path.join(directory,JOURNAL));
    const meta=await read(path.join(directory,'track.json')),stems=await read(path.join(directory,'stems.json')),bridge=await read(path.join(directory,'music-lab.json')),journal=await read(path.join(directory,JOURNAL));
    const records=[meta,stems,bridge?.track&&{trackId:bridge.track.id,source:bridge.track.source},journal?.kind==='track-removal'?journal:null].filter(Boolean),matches=records.some(v=>v.trackId===track.id&&same(typeof v.source==='string'?v.source:v.source?.path,source));
    if(!matches){if(path.basename(directory).endsWith('__'+track.id.slice(0,10))||path.basename(directory)===track.id)blocked.push('发现同ID历史目录但无法核实归属，请先检查：'+directory);continue;}
    if(records.some(v=>(v.trackId&&v.trackId!==track.id)||(v.source&&!same(typeof v.source==='string'?v.source:v.source?.path,source)))){blocked.push('分析目录归属冲突：'+directory);continue;}
    if(within(directory,source)||within(library,directory)||within(directory,library)||same(directory,library)||[...getTracks()].some(t=>t.id!==track.id&&(same(t.filePath,directory)||within(directory,t.filePath)))){blocked.push('分析目录与音乐库重叠');continue;}
    owned.push(directory);
    async function walk(d){directories.push(d);for(const entry of await fs.readdir(d,{withFileTypes:true})){
     const file=path.join(d,entry.name),s=await safeStat(file);if(!s)throw Error('文件扫描时已变化');if(s.isDirectory())await walk(file);else{
      if(/\.json$/i.test(file)&&s.size<50e6){const v=await read(file);if(v?.trackId&&v.trackId!==track.id)throw Error('分析结果被其他曲目引用：'+file);}
      await add(file,AUDIO.test(file)?'audio':'small',directory);
     }
    }}await walk(directory);
   }catch(e){blocked.push(e.message);}
  }
  // Decode cache has no broad ownership index. Its filename is a hash of the exact source path and signature.
  for(const f of files.slice())if(/\.flac$/i.test(f.path)){
   const key=hash(JSON.stringify([canonical(f.path),f.bytes,Math.round(f.stamp[1])])),cached=path.join(cacheDir,key+'.wav');
   try{await add(cached,'audio',cacheDir);}catch(e){blocked.push(e.message);}
  }
  const original=files.find(f=>f.kind==='original');
  if(coverCacheDir&&original){
   try{
    const key=hash(path.resolve(source)+'\0'+original.bytes+'\0'+original.stamp[1]);
    // References are track/stat-owned. Content-addressed image blobs are shared across XLD/XML;
    // no shared write lock proves their final reference, so never enumerate, delete, or count them here.
    await add(path.join(coverCacheDir,key+'.json'),'audio',coverCacheDir);
   }catch(e){blocked.push(e.message);}
  }
  if(!owned.length)warnings.push('未发现可验证属于本曲的分析目录；未识别的历史结果不会被删除');
  const unique=[...new Map(files.map(f=>[canonical(f.path),f])).values()].sort((a,b)=>a.path.localeCompare(b.path));
  const token=hash(JSON.stringify([track.id,source,root,library,unique,owned,blocked]));
  const group=kind=>{const rows=unique.filter(f=>f.kind===kind);return {bytes:rows.reduce((n,f)=>n+f.reclaimableBytes,0),logicalBytes:rows.reduce((n,f)=>n+f.bytes,0),files:rows.length};};
  const lockRoots=[...new Set([root,...roots.filter(base=>owned.some(directory=>within(base,directory)))])].sort();
  let holder=null;if(analysisLock)for(const base of lockRoots){holder=await analysisLock.holder(base);if(holder)break;}
  return {ok:true,trackId:track.id,title:track.title,token,original:{...group('original'),path:source},audio:group('audio'),small:group('small'),totalBytes:unique.reduce((n,f)=>n+f.reclaimableBytes,0),retainedPaths:owned,smallNames:unique.filter(f=>f.kind==='small').map(f=>path.relative(f.owner,f.path)),retainable:true,blocked,warnings,busy:!!holder||isBusy()||mutating,holder,_files:unique,_directories:directories.sort((a,b)=>b.length-a.length),_roots:owned,_lockRoots:lockRoots};
 }
 const publicPlan=p=>Object.fromEntries(Object.entries(p).filter(([k])=>!k.startsWith('_')));
 async function plan(trackId){const p=await collect(trackId);plans.set(p.token,{trackId:p.trackId,at:Date.now()});while(plans.size>30)plans.delete(plans.keys().next().value);return publicPlan(p);}
 async function confirmSelection({trackId,token,keepSmall}={},confirm=async()=>true){
  if(typeof keepSmall!=='boolean')throw Error('track-remove-options-invalid');if(mutating||isBusy())throw Error('analysis-busy');
  const known=plans.get(token);if(!known||known.trackId!==trackId||Date.now()-known.at>15*60e3)throw Error('删除预览已过期，请重新打开');
  let p=await collect(trackId);if(p.token!==token)throw Error('文件已变化，请重新预览');if(p.blocked.length)throw Error(p.blocked.join('\n'));if(p.busy)throw Error('analysis-busy');
  if(!await confirm({...publicPlan(p),keepSmall}))return {ok:true,confirmed:false,canceled:true};
  p=await collect(trackId);if(p.token!==token||p.busy)throw Error('文件或任务状态已变化，请重新预览');
  approvals.set(token,{trackId,keepSmall,at:Date.now()});while(approvals.size>30)approvals.delete(approvals.keys().next().value);return {ok:true,confirmed:true};
 }
 async function execute({trackId,token,keepSmall}={},confirm=async()=>true){
  if(typeof keepSmall!=='boolean')throw Error('track-remove-options-invalid');if(mutating||isBusy())throw Error('analysis-busy');
  const known=plans.get(token);if(!known||known.trackId!==trackId||Date.now()-known.at>15*60e3)throw Error('删除预览已过期，请重新打开');
  mutating=true;const locks=[];let resumeDecode=null;
  try{
   let p=await collect(trackId);if(p.token!==token)throw Error('文件已变化，请重新预览');if(p.blocked.length)throw Error(p.blocked.join('\n'));
   if(analysisLock)for(const base of p._lockRoots){await safeStat(base);const lock=await analysisLock.acquire(base,{task:'track-removal',song:p.title});if(!lock.ok)throw Error('analysis-locked: '+(lock.holder?.program||'XML/XLD'));locks.push(lock);}
   const approval=approvals.get(token);approvals.delete(token);
   const confirmed=approval&&approval.trackId===trackId&&approval.keepSmall===keepSmall&&Date.now()-approval.at<60000;
   if(!confirmed&&!await confirm({...publicPlan(p),keepSmall}))return {ok:true,canceled:true};
   p=await collect(trackId);if(p.token!==token||isBusy())throw Error('文件或任务状态已变化，请重新预览');
   resumeDecode=suspendDecode(p._files.map(f=>f.path));
   const selected=p._files.filter(f=>!keepSmall||f.kind!=='small'),errors=[];let deletedBytes=0,deletedFiles=0,sourceDeleted=false;
   const journalBody=JSON.stringify({schemaVersion:1,kind:'track-removal',trackId,source:p.original.path});
   // Durable ownership survives failures, process exits, and removal of old metadata markers.
   async function ensureJournal(directory){
    const file=path.join(directory,JOURNAL);
    try{await fs.writeFile(file,journalBody,{flag:'wx'});}catch(error){
     if(error.code!=='EEXIST')throw error;const st=await safeStat(file),value=st?.isFile()?await read(file):null;
     if(!value||value.kind!=='track-removal'||value.trackId!==trackId||!same(value.source,p.original.path))throw Error('删除日志归属冲突：'+file);
    }
   }
   if(!keepSmall)for(const directory of p._roots)await ensureJournal(directory);
   const unlinked=new Map();
   async function remove(f){const st=await safeStat(f.path);if(!st){if(f.kind==='original')sourceDeleted=true;return;}const key=f.stamp[3]+':'+f.stamp[2],expected=f.stamp.slice();expected[4]-=unlinked.get(key)||0;if(JSON.stringify(stamp(st))!==JSON.stringify(expected))throw Error('文件已变化');await removeFile(f.path);unlinked.set(key,(unlinked.get(key)||0)+1);deletedBytes+=f.reclaimableBytes;deletedFiles++;if(f.kind==='original')sourceDeleted=true;}
   const ownership=f=>p._roots.some(d=>same(path.dirname(f.path),d))&&['track.json','stems.json','music-lab.json',JOURNAL].includes(path.basename(f.path));
   const payload=selected.filter(f=>f.kind!=='original'&&!ownership(f)).sort((a,b)=>{const external=f=>!p._roots.some(d=>same(d,f.owner));return Number(external(b))-Number(external(a))||(Number(/\.json$/i.test(a.path))-Number(/\.json$/i.test(b.path)));}),markers=selected.filter(f=>ownership(f)&&path.basename(f.path)!==JOURNAL);
   try{
    for(const f of payload)await remove(f);
    if(!keepSmall){
     for(const f of markers)await remove(f);
     for(const d of p._directories.filter(d=>!p._roots.some(root=>same(root,d)))){await safeStat(d);await fs.rmdir(d);}
     for(const d of p._roots){
      const remaining=await fs.readdir(d);if(remaining.some(name=>name!==JOURNAL))throw Error('分析目录仍有未清理文件：'+d);
      await safeStat(path.join(d,JOURNAL));await fs.unlink(path.join(d,JOURNAL));
      try{await fs.rmdir(d);}catch(error){await ensureJournal(d).catch(()=>{});throw error;}
     }
    }
    // Never unlink the original until all selected payload and directory cleanup has completed.
    for(const f of selected.filter(f=>f.kind==='original'))await remove(f);
   }catch(error){errors.push({path:error.path||'',error:error.message});}
   if(!p.original.files)sourceDeleted=true;
   await onChanged({trackId,sourceDeleted,keepSmall});plans.delete(token);
   return {ok:errors.length===0,trackId,sourceDeleted,deletedBytes,deletedFiles,retainedBytes:keepSmall?p.small.logicalBytes:0,retainedPaths:keepSmall?p._roots:[],warnings:p.warnings,errors};
  }finally{try{resumeDecode?.();for(const lock of locks.reverse())await lock.release();}finally{mutating=false;}}
 }
 return {plan,confirmSelection,execute,busy:()=>mutating};
}
module.exports={createTrackRemoval,safeStat};
