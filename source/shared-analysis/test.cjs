'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createDerivedAssets,trackDirectory}=require('./derived-assets.cjs');
async function main() {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'xld-shared-reader-'));
 try {
  const source=path.join(root,'song.wav');await fs.writeFile(source,'source');const stat=await fs.stat(source);
  const track={id:'same-track',filePath:source,number:7,title:'Tag title',artist:'Tag artist',album:'Tag album',pathNumber:1,pathTitle:'Disk title',pathArtist:'Disk artist',pathAlbum:'Disk album'};
  const legacy=trackDirectory(track,root,true),canonical=trackDirectory(track,root);
  const runId=randomUUID(),stems=[];
  for(const name of ['bass','piano','guitar','drums','vocals','other']) {
   const file=`stems/${runId}/${name}.wav`,target=path.join(legacy,file);
   await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,Buffer.alloc(80));
   stems.push({name,file,sampleRate:44100,channels:2,frames:10});
  }
  const manifest={schemaVersion:1,kind:'stems',trackId:track.id,runId,model:'htdemucs_6s',options:{shifts:1,overlap:.25},source:{path:source,size:stat.size,mtimeMs:stat.mtimeMs},stems};
  await fs.writeFile(path.join(legacy,'stems.json'),JSON.stringify(manifest));
  const xml=createDerivedAssets({analysisRoot:()=>root}),xld=createDerivedAssets({analysisRoot:root});
  assert.equal(xld.directory(track),legacy,'Existing results made with display names remain discoverable');
  assert.deepEqual(await xml.readStems(track),await xld.readStems(track));
  assert((await xml.readStems(track)).ok);
  assert.equal((await xld.readMidi(track,'bass')).ok,false);
  // MIDI records from before version metadata, and records of an earlier model version, read the same in both apps.
  const {PROFILES}=require('./derived-assets.cjs');
  const midiRun=async(tweak={})=>{const profile=PROFILES.find(p=>p.id==='bass-highres'),id=randomUUID(),prefix=`midi/bass/${id}/`,wav=await fs.stat(path.join(legacy,stems[0].file)),duration=stems[0].frames/stems[0].sampleRate;
   await fs.mkdir(path.join(legacy,prefix),{recursive:true});await fs.writeFile(path.join(legacy,prefix+'bass.mid'),Buffer.from('4d546864000000060000000103c04d54726b0000000400ff2f00','hex'));
   await fs.writeFile(path.join(legacy,prefix+'notes.json'),JSON.stringify({schemaVersion:1,kind:'notes',trackId:track.id,stem:'bass',sourceRunId:runId,timeOrigin:0,duration,notes:[]}));
   return {schemaVersion:1,kind:'midi',trackId:track.id,stem:'bass',runId:id,sourceRunId:runId,source:{path:path.join(legacy,stems[0].file),size:wav.size,mtimeMs:wav.mtimeMs},engine:'bass-highres',model:profile.model,options:profile.options,backend:{checkpointSha256:profile.checkpoint.sha256},timeOrigin:0,duration,noteCount:0,tempoMode:'fixed-timebase',quantized:false,file:prefix+'bass.mid',notesFile:prefix+'notes.json',...tweak};};
  await fs.writeFile(path.join(legacy,'midi','bass.json'),JSON.stringify(await midiRun()));
  assert.deepEqual(await xml.readMidi(track,'bass'),await xld.readMidi(track,'bass'));
  assert.equal((await xld.readMidi(track,'bass')).matches,true,'a record without version fields reads as the current version');
  await fs.writeFile(path.join(legacy,'midi','bass.json'),JSON.stringify(await midiRun({backend:{checkpointSha256:'f'.repeat(64)}})));
  for(const app of [xml,xld]){const earlier=await app.readMidi(track,'bass');assert.equal(earlier.ok,true);assert.equal(earlier.matches,false,'an earlier model version stays readable in both apps');}
  await fs.rename(path.dirname(legacy),path.join(root,'legacy-album'));
  assert.equal(xld.directory(track),canonical,'New results use path metadata, not display tags');
  assert.equal((await xld.readStems(track)).error,'stems-missing');
  const old=path.join(root,'legacy-album',path.basename(legacy));
  await fs.mkdir(path.dirname(canonical),{recursive:true});await fs.rename(old,canonical);
  const changedDisplay={...track,title:'Another tag',artist:'Another artist',album:'Another album',number:99};
  assert((await xld.readStems(changedDisplay)).ok,'Display-tag changes must not change the asset location');
  await fs.mkdir(legacy,{recursive:true});await fs.writeFile(path.join(legacy,'stems.json'),JSON.stringify(manifest));
  assert.equal(xml.directory({...track,bridgePath:path.join(legacy,'music-lab.json')}),canonical,'Both apps prefer the canonical result when old and new directories coexist');
  manifest.source.mtimeMs+=5000;await fs.writeFile(path.join(canonical,'stems.json'),JSON.stringify(manifest));
  assert.equal((await xml.readStems(track)).error,'stems-stale');
  manifest.source.mtimeMs=stat.mtimeMs;manifest.stems[0].file='../outside.wav';await fs.writeFile(path.join(canonical,'stems.json'),JSON.stringify(manifest));
  assert.equal((await xld.readStems(track)).ok,false);
  console.log('shared-analysis: PASS (same reader, legacy directory, stable path identity, missing/stale result, invalid asset path, legacy and earlier-version MIDI)');
 } finally {
  if(path.dirname(path.resolve(root))===path.resolve(os.tmpdir())&&path.basename(root).startsWith('xld-shared-reader-'))await fs.rm(root,{recursive:true,force:true});
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
