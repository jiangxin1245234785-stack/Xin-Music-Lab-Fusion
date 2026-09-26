'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {run,probe}=require('./setup-core.cjs');
const UV_URL='https://github.com/astral-sh/uv/releases/download/0.6.17/uv-x86_64-pc-windows-msvc.zip';
const UV_SHA='32882cf98f646cafca003e7a7c471b7ff4ba977b681c9fa3b12cf908ba64af82';
async function installMidi(root,parent,{signal,onLog=()=>{},execute=run,download=fetch}={}){
 if(process.platform!=='win32'||process.arch!=='x64')throw Error('Windows x64 required');
 if(!path.isAbsolute(parent)||!fs.statSync(parent).isDirectory())throw Error('Select an existing directory');
 const disk=fs.statfsSync(parent);if(Number(disk.bavail)*Number(disk.bsize)<1024**3)throw Error('At least 1 GB free space is required');
 // A fresh owned folder keeps failed installs from altering imported or previously working environments.
 const owned=fs.mkdtempSync(path.join(parent,'xin-midi-')),uvDir=path.join(owned,'tools');fs.mkdirSync(uvDir);
 fs.writeFileSync(path.join(owned,'xin-managed.json'),JSON.stringify({schemaVersion:1,recipe:'midi-1',createdAt:new Date().toISOString()}));
 const env={...process.env,UV_PYTHON_INSTALL_DIR:path.join(owned,'python'),UV_CACHE_DIR:path.join(owned,'cache'),UV_NO_PROGRESS:'1',UV_NO_CONFIG:'1',UV_PYTHON_PREFERENCE:'only-managed',PYTHONUTF8:'1'};
 for(const key of ['PYTHONPATH','PYTHONHOME','VIRTUAL_ENV','UV_INDEX','UV_DEFAULT_INDEX','UV_INDEX_URL','UV_EXTRA_INDEX_URL','PIP_INDEX_URL','PIP_EXTRA_INDEX_URL'])delete env[key];
 const args={env,signal,onLog,timeout:15*60*1000};
 try{
  onLog('Downloading verified installer / 正在获取已校验安装器\n');
  const response=await download(UV_URL,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(120000)]):AbortSignal.timeout(120000)});
  if(!response.ok)throw Error('Installer download failed: HTTP '+response.status);
  const chunks=[];let length=0;for await(const b of response.body){length+=b.length;if(length>40*1024*1024)throw Error('Installer exceeds expected size');chunks.push(Buffer.from(b));}
  const data=Buffer.concat(chunks);if(crypto.createHash('sha256').update(data).digest('hex')!==UV_SHA)throw Error('Installer checksum mismatch');
  const archive=path.join(owned,'uv.zip');fs.writeFileSync(archive,data);
  const powershell=path.join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
  const unpack=await execute(powershell,['-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop'; [void][System.Reflection.Assembly]::LoadWithPartialName('System.IO.Compression.FileSystem'); [System.IO.Compression.ZipFile]::ExtractToDirectory($env:XIN_SETUP_ARCHIVE,$env:XIN_SETUP_TOOLS)"],{...args,env:{...env,XIN_SETUP_ARCHIVE:archive,XIN_SETUP_TOOLS:uvDir}});
  if(unpack.code!==0)throw Error(unpack.err||'Cannot unpack installer');
  const uv=path.join(uvDir,'uv.exe');if(!fs.existsSync(uv))throw Error('Installer missing after extraction');
  onLog('Installing managed Python 3.12.10 / 正在准备独立 Python\n');
  const venv=path.join(owned,'env'),create=await execute(uv,['venv','--python','3.12.10','--python-preference','only-managed',venv],args);
  if(create.code!==0)throw Error(create.err||'Python installation failed');
  const python=path.join(venv,'Scripts/python.exe');
  onLog('Installing MIDI dependencies / 正在安装 MIDI 保存与导出依赖\n');
  const packages=['numpy==2.2.4','pretty-midi==0.2.11','mido==1.3.3','six==1.17.0','packaging==24.2','importlib-resources==7.1.0'];
  const installed=await execute(uv,['pip','install','--python',python,'--index-url','https://pypi.org/simple',...packages],args);
  if(installed.code!==0)throw Error(installed.err||'MIDI dependencies failed');
  const values={XLD_MIDI_PYTHON:python},report=await probe(root,'midi',values,{signal,execute});
  if(!report.ok)throw Error(report.error||'MIDI roundtrip failed');
  fs.writeFileSync(path.join(owned,'installed.json'),JSON.stringify({recipe:'midi-1',pythonVersion:'3.12.10',packages,probe:report},null,2));
  onLog('MIDI roundtrip passed / MIDI 读写验证通过\n');
  return {values,report,owned};
 }catch(error){fs.writeFileSync(path.join(owned,'installation-status.json'),JSON.stringify({complete:false,cancelled:!!signal?.aborted}));throw error;}
}
module.exports={installMidi,UV_URL,UV_SHA};
