'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {readLatestTrack,readMoodCurve}=require('../desktop/refresh-track.cjs');
const {trackDirectory}=require('../../xld-runtime-baseline/core/derived-assets.cjs');
const {validateManifest}=require('../xld-timeline-provider-adapter.js');
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'xml-refresh-test-'));
 const track={id:'test',filePath:path.join(root,'song.wav'),artist:'Artist',album:'Album',title:'Song',number:1};
 const manifest={schemaVersion:2,contract:'xld.music-lab/2',timing:{unit:'seconds',origin:0,duration:20},track:{id:track.id,source:track.filePath},analyses:[],harmony:[],manualTags:[]};
 const directory=trackDirectory(track,root),file=path.join(directory,'music-lab.json');
 try{
  assert.equal((await readLatestTrack(track,[root],validateManifest)).manifest,null);
  await fs.mkdir(directory,{recursive:true});await fs.writeFile(file,JSON.stringify(manifest));
  assert.equal((await readLatestTrack(track,[root],validateManifest)).ok,true);
  const changed={...manifest,manualTags:[{id:'manual-1',start:0,end:10,label:'new'}]};await fs.writeFile(file,JSON.stringify(changed));
  assert.equal((await readLatestTrack({...track,manifest},[root],validateManifest)).manifest.manualTags[0].label,'new');
  await fs.writeFile(file,JSON.stringify({...manifest,track:{id:'wrong',source:track.filePath}}));
  assert.equal((await readLatestTrack(track,[root],validateManifest)).ok,false);
  await fs.writeFile(file,'{invalid');assert.equal((await readLatestTrack(track,[root],validateManifest)).error,'invalid-json');
  await fs.rm(file);assert.equal((await readLatestTrack(track,[root],validateManifest)).manifest,null);
  const mood = {kind: 'mood-curve', schemaVersion: 1, engineVersion: 1, formulaVersion: 'mood-direct-1', scaleVersion: 'mood-scale-1',
    loudnessMode: 'mix', duration: .5, step: .5, belowFlatnessGate: [], fast: [0, .5], slow: [.25, .5],
    shape: {fast: [0, .5], slow: [.25, .5]}, components: {lufs: [-25, -15], band28Dbfs: [-32, -23], logFlatness: [-4, -3]}};
  const moodFile = path.join(directory, 'mood-curve.json');
  assert.equal(await readMoodCurve(track, root, file), null);
  await fs.writeFile(moodFile, JSON.stringify(mood));
  assert.deepEqual(await readMoodCurve(track, path.join(root, 'another root'), file), mood, 'use the resolved analysis directory');
  assert.deepEqual(await readMoodCurve(track, root, ''), mood, 'read mood-only analysis even before a bridge manifest exists');
  const partialFast = {...mood, fast: [null, .5]};
  await fs.writeFile(moodFile, JSON.stringify(partialFast));
  assert.deepEqual(await readMoodCurve(track, root, file), partialFast, 'the slow line can drive weather when fast is locally unavailable');
  for (const patch of [{engineVersion: 2}, {formulaVersion: 'mood-direct-2'}, {scaleVersion: 'mood-scale-2'}, {schemaVersion: 2}, {slow: [1.2, 0]}, {slow: [.1, null]}, {fast: []}]) {
    await fs.writeFile(moodFile, JSON.stringify({...mood, ...patch}));
    assert.equal(await readMoodCurve(track, root, file), null);
  }
  await fs.writeFile(moodFile, '{invalid');
  assert.equal(await readMoodCurve(track, root, file), null);
  console.log('XML refresh: PASS (fresh disk read, identity, deletion, mood directory, validation and version checks)');
 }finally{if(path.dirname(path.resolve(root))===path.resolve(os.tmpdir())&&path.basename(root).startsWith('xml-refresh-test-'))await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
