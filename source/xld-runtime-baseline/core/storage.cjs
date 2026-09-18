'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const marker='.xld-keep.json';
const json=async file=>{try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT'||error instanceof SyntaxError)return null;throw error;}};
function within(root,file){const relative=path.relative(root,file);return relative&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);}
async function guarded(root,file){
 root=path.resolve(root);file=path.resolve(file);if(!within(root,file))throw Error('storage-path-invalid');
 let current=root;for(const part of ['',...path.relative(root,file).split(path.sep)]){if(part)current=path.join(current,part);const stat=await fs.lstat(current);if(stat.isSymbolicLink())throw Error('storage-link-rejected');}
 const realRoot=await fs.realpath(root),real=await fs.realpath(file);if(!within(realRoot,real))throw Error('storage-path-invalid');return file;
}
function createStorage({getRoot,isBusy=()=>false,trash,remove=directory=>fs.rm(directory,{recursive:true}),onChanged=()=>{}}){
 let mutating=false;
 async function scan(){
  const root=path.resolve(getRoot()),files=new Map(),directories=[],warnings=[];let bytes=0,wavBytes=0;
  try{const stat=await fs.lstat(root);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('storage-root-invalid');}catch(error){if(error.code==='ENOENT')return {root,bytes:0,wavBytes:0,rows:[],warnings:[],busy:isBusy()||mutating};throw error;}
  async function walk(directory,depth){
   if(depth>12){warnings.push('扫描层级过深：'+path.relative(root,directory));return;}
   for(const item of await fs.readdir(directory,{withFileTypes:true})){
    const file=path.join(directory,item.name),relative=path.relative(root,file),stat=await fs.lstat(file);
    if(stat.isSymbolicLink()){warnings.push('跳过链接：'+relative);files.set(file,{link:true,size:0,mtimeMs:stat.mtimeMs});continue;}
    if(stat.isDirectory()){directories.push(file);await walk(file,depth+1);}else if(stat.isFile()){files.set(file,{size:stat.size,mtimeMs:stat.mtimeMs});bytes+=stat.size;if(/\.wav$/i.test(item.name))wavBytes+=stat.size;}
   }
  }
  await walk(root,0);
  const records=[];
  for(const [file,stat] of files){
   const parts=path.relative(root,file).split(path.sep);
   if(stat.link||stat.size>2*1024*1024||!file.endsWith('.json')||path.basename(file)==='notes.json')continue;
   if(parts.length<3||!(['stems','refinement','midi'].includes(parts[2])||parts[2]==='stems.json'))continue;
   const value=await json(file);if(value)records.push({file,value,track:path.join(root,...parts.slice(0,2))});
  }
  const rows=[];
  for(const directory of directories){
   const parts=path.relative(root,directory).split(path.sep);if(parts.length!==4||!['stems','refinement'].includes(parts[2])||!uuid.test(parts[3]))continue;
   const track=path.join(root,...parts.slice(0,2)),runId=parts[3],kind=parts[2],children=[...files].filter(([p])=>within(directory,p));
   if(!children.length)continue;
   const record=records.find(r=>r.track===track&&r.value.runId===runId&&r.value.kind===(kind==='stems'?'stems':'refinement'));
   const data=record?.value||{},keepRecords=records.filter(r=>r.track===track&&path.dirname(r.file)===path.join(track,'refinement','kept')&&r.value.runId===runId);
   const known=kind==='stems'?/^(bass|piano|guitar|drums|vocals|other)\.wav$/:/^(?:(?:listen-)?(?:original|target|residual|strings))\.wav$/;
   const unknown=children.some(([file,stat])=>stat.link||path.dirname(file)!==directory||!(known.test(path.basename(file))||['README.txt',marker].includes(path.basename(file))));
   const rowBytes=children.reduce((sum,[,stat])=>sum+stat.size,0),kept=files.has(path.join(directory,marker))||keepRecords.length>0;
   const dependencies=records.filter(r=>r.track===track&&((kind==='stems'&&r.value.kind==='refinement'&&r.value.parentRunId===runId&&directories.includes(path.join(track,'refinement',r.value.runId)))||(r.value.kind==='midi'&&r.value.sourceRunId===runId&&typeof r.value.file==='string'&&files.has(path.resolve(track,r.value.file)))));
   const dependencyCount=new Set(dependencies.map(r=>r.value.kind+':'+r.value.runId)).size;
   const active=kind==='stems'&&records.some(r=>r.file===path.join(track,'stems.json')&&r.value.runId===runId);
   const id=hash(root+'\0'+path.relative(root,directory));
   rows.push({id,revision:hash(JSON.stringify(children.map(([p,s])=>[p,s.size,s.mtimeMs,s.link||false]).sort())),directory,track:parts[1].replace(/__[a-f0-9]+$/,''),album:parts[0],kind,runId,engine:data.engine||data.model||'旧输出',target:data.target||'',sourceStem:data.sourceStem||'',scope:data.scope||'preview',timeOrigin:data.timeOrigin||0,duration:data.duration||0,bytes:rowBytes,files:children.length,modified:Math.max(...children.map(([,s])=>s.mtimeMs)),kept,active,dependencyCount,blocked:unknown?'目录含链接或未知文件':dependencyCount?'仍被 '+dependencyCount+' 项细分 / MIDI 使用':'',keepRecords:keepRecords.map(r=>r.file)});
  }
  rows.sort((a,b)=>b.bytes-a.bytes);return {root,bytes,wavBytes,rows,warnings,busy:isBusy()||mutating};
 }
 async function select(items,{allowBlocked=false,allowKept=false}={}){
  if(!Array.isArray(items)||!items.length||items.length>1000||new Set(items.map(i=>i.id)).size!==items.length)throw Error('storage-selection-invalid');
  const snapshot=await scan(),rows=items.map(item=>{const row=snapshot.rows.find(r=>r.id===item.id);if(!row||row.revision!==item.revision)throw Error('文件已变化，请刷新列表后重试');if(!allowBlocked&&row.blocked)throw Error(row.blocked);if(!allowKept&&row.kept)throw Error('请先取消保留标记');return row;});
  for(const row of rows)await guarded(snapshot.root,row.directory);return {root:snapshot.root,rows};
 }
 async function lock(action){if(mutating||isBusy())throw Error('请等待分析或文件操作完成');mutating=true;try{return await action();}finally{mutating=false;}}
 async function protect(item,value){return lock(async()=>{
  const {root,rows:[row]}=await select([item],{allowBlocked:true,allowKept:true});
  if(row.blocked==='目录含链接或未知文件')throw Error(row.blocked);
  const file=path.join(row.directory,marker);
  if(value)await fs.writeFile(file,JSON.stringify({runId:row.runId,keptAt:new Date().toISOString()}),{flag:'w'});
  else{await fs.rm(file,{force:true});for(const keep of row.keepRecords){await guarded(root,keep);await fs.rm(keep);}}
  onChanged();return {ok:true};
 });}
 async function clear(items,mode,confirm){return lock(async()=>{
  if(!['trash','permanent'].includes(mode))throw Error('storage-mode-invalid');
  const plan=await select(items),bytes=plan.rows.reduce((sum,r)=>sum+r.bytes,0);
  if(!await confirm({mode,bytes,rows:plan.rows}))return {ok:true,canceled:true};
  // Confirmation may remain open while another process changes this directory.
  const fresh=await select(items);if(path.resolve(getRoot())!==fresh.root||fresh.root!==plan.root||isBusy())throw Error('资料库或任务状态已变化，请刷新后重试');
  let deleted=0,removedBytes=0;const errors=[];
  for(const row of fresh.rows){try{
   await guarded(fresh.root,row.directory);
   const current=[];for(const name of await fs.readdir(row.directory)){const file=path.join(row.directory,name),stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw Error('目录内容已变化');current.push([file,stat.size,stat.mtimeMs,false]);}
   if(hash(JSON.stringify(current.sort()))!==row.revision)throw Error('文件已变化，请刷新后重试');
   if(mode==='trash'){if(!trash)throw Error('回收站不可用');await trash(row.directory);}else await remove(row.directory);deleted++;removedBytes+=row.bytes;
  }catch(error){errors.push({id:row.id,error:error.message});}}
  onChanged();return {ok:errors.length===0,deleted,bytes:removedBytes,mode,errors};
 });}
 async function reveal(item){const {rows:[row]}=await select([item],{allowBlocked:true,allowKept:true});return row.directory;}
 return {scan,protect,clear,reveal,busy:()=>mutating};
}
module.exports={createStorage,guarded};
