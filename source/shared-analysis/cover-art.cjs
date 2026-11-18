'use strict';
// Shared, read-only library artwork discovery. IPC carries file URLs, never image/audio bytes.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {pathToFileURL} = require('node:url');
const COVER_NAMES = ['cover.jpg', 'cover.jpeg', 'cover.png', 'folder.jpg', 'folder.png', 'front.jpg', 'front.png'];
const MAX_IMAGE_BYTES = 16 * 1024 * 1024;
const imageName = name => /\.(?:jpe?g|png|webp)$/i.test(name);
const frontName = name => /(?:^|[\s_.()[\]-])front(?:$|[\s_.()[\]-])/i.test(path.parse(name).name);
const rearName = name => /(?:^|[\s_.()[\]-])(?:back|rear|booklet|disc|tray)(?:$|[\s_.()[\]-])/i.test(path.parse(name).name);
function pictureExtension(bytes) {
  if(bytes.length>=3 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255)return '.jpg';
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return '.png';
  if(bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP')return '.webp';
  return null;
}
async function folderCandidates(folder, entries) {
  entries ||= await fs.readdir(folder, {withFileTypes: true});
  const files = entries.filter(e => e.isFile() && imageName(e.name));
  const byName = new Map(files.map(e => [e.name.toLowerCase(), e.name]));
  const candidates = COVER_NAMES.map(n => byName.get(n)).filter(Boolean).map(n => path.join(folder, n));
  candidates.push(...files.filter(e => frontName(e.name) && !rearName(e.name)).sort((a,b)=>a.name.localeCompare(b.name)).map(e=>path.join(folder,e.name)));
  for (const entry of entries.filter(e => e.isDirectory() && /^(?:artworks?|scans?)$/i.test(e.name)).sort((a,b)=>a.name.localeCompare(b.name))) {
    const sub = path.join(folder, entry.name);
    const children = await fs.readdir(sub, {withFileTypes:true}).catch(()=>[]);
    candidates.push(...children.filter(e=>e.isFile() && imageName(e.name) && frontName(e.name) && !rearName(e.name)).sort((a,b)=>a.name.localeCompare(b.name)).map(e=>path.join(sub,e.name)));
  }
  // An unlabelled image is safe only when it is the sole picture in this album directory.
  if (files.length === 1 && !rearName(files[0].name)) candidates.push(path.join(folder, files[0].name));
  return [...new Set(candidates)];
}
async function readAt(handle, offset, length) {
  const buffer = Buffer.alloc(length);
  const {bytesRead} = await handle.read(buffer, 0, length, offset);
  return buffer.subarray(0, bytesRead);
}
const synchsafe = b => ((b[0]&127)*2097152)+((b[1]&127)*16384)+((b[2]&127)*128)+(b[3]&127);
async function* embeddedPictures(handle, ext, fileSize) {
  const head = await readAt(handle, 0, 10);
  if (ext === '.flac' && head.toString('ascii',0,4) === 'fLaC') {
    let p = 4;
    for (let guard=0; guard<256 && p+4<=fileSize; guard++) {
      const h = await readAt(handle,p,4); if(h.length!==4) break;
      const len=h.readUIntBE(1,3), end=p+4+len; if(end>fileSize) break;
      if ((h[0]&127)===6 && len<=MAX_IMAGE_BYTES+65536) {
        const b=await readAt(handle,p+4,len);
        try {
          if(b.readUInt32BE(0)===3) {
            let q=4; const mimeLen=b.readUInt32BE(q); q+=4+mimeLen;
            const descLen=b.readUInt32BE(q); q+=4+descLen+16;
            const size=b.readUInt32BE(q); q+=4;
            if(size>0 && size<=MAX_IMAGE_BYTES && q+size<=b.length) yield b.subarray(q,q+size);
          }
        } catch (_) {}
      }
      p=end; if(h[0]&128) break;
    }
  } else if (ext === '.mp3' && head.toString('ascii',0,3)==='ID3' && head[3]>=2 && head[3]<=4) {
    const version=head[3], end=Math.min(fileSize,10+synchsafe(head.subarray(6,10)));
    // Unsupported unsynchronisation/compression is skipped rather than displaying corrupt data.
    if(head[5]&128 || version===2 && head[5]&64) return;
    let p=10;
    if(version>=3 && head[5]&64) {
      const x=await readAt(handle,p,4); if(x.length!==4)return;
      p+=version===4?synchsafe(x):4+x.readUInt32BE(0);
    }
    for(let guard=0;guard<4096 && p+(version===2?6:10)<=end;guard++) {
      const h=await readAt(handle,p,version===2?6:10), id=h.toString('ascii',0,version===2?3:4);
      const size=version===2?h.readUIntBE(3,3):version===4?synchsafe(h.subarray(4,8)):h.readUInt32BE(4);
      p+=h.length; if(!/^[A-Z0-9]+$/.test(id)||!size||p+size>end)break;
      if((id==='APIC'||id==='PIC') && size<=MAX_IMAGE_BYTES+65536 && (version===2 || !(h[9] & (version===4?79:224)))) {
        const b=await readAt(handle,p,size); let q=version===2?4:b.indexOf(0,1)+1;
        if(q>0 && b[q++]===3) {
          const encoding=b[0];
          if(encoding===1||encoding===2) { while(q+1<b.length && (b[q]||b[q+1]))q+=2; q+=2; }
          else { const zero=b.indexOf(0,q); q=zero<0?b.length:zero+1; }
          if(q<b.length && b.length-q<=MAX_IMAGE_BYTES)yield b.subarray(q);
        }
      }
      p+=size;
    }
  }
}
function createCoverResolver({cacheRoot, nativeImage}) {
  // Bound metadata-only memoization; no image buffers or native decoded images are retained.
  const valid = new Map(), pending = new Map();
  function remember(map,key,value){if(map.size>=2048)map.delete(map.keys().next().value);map.set(key,value);return value;}
  async function usable(file) {
    try {
      const stat=await fs.stat(file); if(!stat.isFile()||!stat.size)return false;
      const key=`${file}\0${stat.size}\0${stat.mtimeMs}`;
      if(valid.has(key))return valid.get(key);
      return remember(valid,key,!nativeImage.createFromPath(file).isEmpty());
    } catch(_){return false;}
  }
  async function folder(folder, entries){
    for(const file of await folderCandidates(folder,entries).catch(()=>[]))if(await usable(file))return pathToFileURL(file).href;
    return null;
  }
  async function embedded(file, stat){
    if(!['.flac','.mp3'].includes(path.extname(file).toLowerCase()))return null;
    let handle;
    try {
      stat ||= await fs.stat(file);
      const key=crypto.createHash('sha256').update(`${path.resolve(file)}\0${stat.size}\0${stat.mtimeMs}`).digest('hex');
      if(pending.has(key)) {
        const cached=pending.get(key);
        if(!cached)return null;
        if(await usable(cached))return pathToFileURL(cached).href;
        pending.delete(key);
      }
      // Tiny track/stat references point at content-addressed originals shared across both apps/tracks.
      const reference=path.join(cacheRoot,`${key}.json`);
      const name=await fs.readFile(reference,'utf8').catch(()=>null);
      if(name && /^[a-f0-9]{64}\.(?:jpg|png|webp)$/.test(name)) {
        const cached=path.join(cacheRoot,name);
        if(await usable(cached)){remember(pending,key,cached);return pathToFileURL(cached).href;}
      }
      handle=await fs.open(file,'r');
      for await(const bytes of embeddedPictures(handle,path.extname(file).toLowerCase(),stat.size)) {
        const extension=pictureExtension(bytes); if(!extension)continue;
        const image=nativeImage.createFromBuffer(bytes); if(image.isEmpty())continue;
        await fs.mkdir(cacheRoot,{recursive:true});
        const target=path.join(cacheRoot,crypto.createHash('sha256').update(bytes).digest('hex')+extension);
        if(!await usable(target))await atomicWrite(target,bytes);
        await atomicWrite(reference,path.basename(target));
        remember(pending,key,target);
        return pathToFileURL(target).href;
      }
      return remember(pending,key,null);
    }catch(_){return null;}finally{if(handle)await handle.close().catch(()=>{});}
  }
  return {folder,embedded};
}
async function atomicWrite(target,bytes) {
  const temporary=`${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary,bytes,{flag:'wx'});
    await fs.rename(temporary,target);
  } finally {await fs.unlink(temporary).catch(()=>{});}
}
module.exports={createCoverResolver,folderCandidates,embeddedPictures,COVER_NAMES,MAX_IMAGE_BYTES};
