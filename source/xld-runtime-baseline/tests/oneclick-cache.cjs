'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const {EventEmitter} = require('node:events');
const {PassThrough} = require('node:stream');
const {randomUUID,createHash} = require('node:crypto');
const {createDerivedAssets,profileFor,separationProfile} = require('../core/derived-assets.cjs');
const {createMidiMerge} = require('../core/midi-merge.cjs');
const mood = require('../core/mood-curve.cjs');
const identity = require('../core/score-identity.cjs');
const header = Buffer.from('4d546864000000060000000103c04d54726b0000000400ff2f00','hex');
const singleNote = Buffer.from('4d546864000000060000000103c04d54726b0000000f00c00000903c5a73803c0000ff2f00','hex');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

// The executable behind a cache miss is the only substituted component. The service performs
// its normal lookup, output validation, activation, version retention and subsequent reuse.
module.exports = async function checkCache() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'xld-plan-cache-'));
  const track = {id:'preview-fixture',title:'Fixture',artist:'Artist',album:'Album',number:1,filePath:path.join(root,'mix.wav')};
  const assets = createDerivedAssets({analysisRoot:root}), directory = assets.directory(track);
  const invocations = [], upgrades = [];
  const cpu = [process.env.XLD_MUSCRIPTOR_PYTHON,process.env.XLD_HIGHRES_PYTHON,
    path.resolve(__dirname,'../../../runtime/0.5.0/envs/highres',process.platform==='win32'?'python.exe':'bin/python')]
    .find(file=>file && require('node:fs').existsSync(file));
  async function write(file, value) {
    await fs.mkdir(path.dirname(file),{recursive:true});
    await fs.writeFile(file,Buffer.isBuffer(value) ? value : JSON.stringify(value));
  }
  async function separation(engine) {
    const profile = separationProfile(engine), runId = randomUUID();
    const stat = await fs.stat(track.filePath);
    const result = {schemaVersion:1,kind:'stems',trackId:track.id,runId,engine,model:profile.model,options:profile.options,
      backend:{checkpointSha256:profile.checkpoint?.sha256,configSha256:profile.config?.sha256},
      source:{path:track.filePath,size:stat.size,mtimeMs:stat.mtimeMs},stems:[]};
    for (const name of ['bass','piano','guitar','drums','other','vocals']) {
      const file = 'stems/'+runId+'/'+name+'.wav';
      const wav = Buffer.alloc(44+4410*8); wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);
      wav.writeUInt32LE(16,16);wav.writeUInt16LE(3,20);wav.writeUInt16LE(2,22);wav.writeUInt32LE(44100,24);
      wav.writeUInt32LE(44100*8,28);wav.writeUInt16LE(8,32);wav.writeUInt16LE(32,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
      await write(path.join(directory,file),wav);
      result.stems.push({name,file,frames:4410,sampleRate:44100,channels:2});
    }
    return result;
  }
  async function midi(stem,engine,runId,sourceRunId,input,old=false) {
    const model = profileFor(engine), stat = await fs.stat(input);
    const prefix = 'midi/'+stem+'/'+runId+'/', file = prefix+stem+'.mid', notesFile = prefix+'notes.json';
    const modelId = old ? model.model.replace(/-onetrack1$/,'') : model.model;
    await write(path.join(directory,file),singleNote);
    const notes = {schemaVersion:1,kind:'notes',trackId:track.id,stem,sourceRunId,engine,model:modelId,
      runId,timeOrigin:0,duration:.1,notes:[{start:0,end:.06,pitch:60,velocity:90}]};
    await write(path.join(directory,notesFile),notes);
    const options = {...model.options};
    if (old) { delete options.oneTrack; options.adapterVersion=1; }
    return {kind:'midi',schemaVersion:1,trackId:track.id,stem,engine,runId,sourceRunId,source:{path:input,size:stat.size,mtimeMs:stat.mtimeMs},
      model:modelId,options,digests:{midi:hash(singleNote),notes:hash(JSON.stringify(notes))},
      backend:{name:'muscriptor',version:options.codeRevision,checkpointSha256:model.checkpoint?.sha256,
        nativePrograms:[0],velocityMode:'stem-energy-relative',velocityReplaced:'constant-100'},
      timeOrigin:0,duration:.1,noteCount:1,tempoMode:'fixed-timebase',quantized:false,file,notesFile};
  }
  function spawn(_python,args,opts) {
    const arg = key => args[args.indexOf(key)+1];
    const stem = arg('--stem'), checking=args.includes('--check-onetrack'), upgrading=args.includes('--upgrade-onetrack');
    if (upgrading) upgrades.push(stem);
    if (!checking && !upgrading) invocations.push(stem);
    if (checking || upgrading) {
      assert.equal(opts.env.CUDA_VISIBLE_DEVICES,'');
      if (cpu) return require('node:child_process').spawn(cpu,args,opts);
    }
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough();
    setImmediate(async () => {
      try {
        if (checking) {
          const record = JSON.parse(await fs.readFile(arg('--check-onetrack'),'utf8'));
          const ok = Array.isArray(record.backend.nativePrograms);
          child.stdout.write(JSON.stringify({ok})); child.emit('close',ok?0:1);return;
        }
        const record = await midi(stem,arg('--engine'),arg('--run-id'),arg('--source-run-id'),arg('--input'));
        if (upgrading) {
          const donor=JSON.parse(await fs.readFile(arg('--upgrade-onetrack'),'utf8'));
          record.backend.oneTrackUpgrade={fromRunId:arg('--upgrade-from-run-id'),fromDigests:donor.digests};
        }
        await write(arg('--output'),record); child.emit('close',0);
      } catch (error) { child.emit('error',error); }
    });
    return child;
  }
  try {
    await fs.writeFile(track.filePath,'test mix');
    const source = require.resolve('../core/analysis-service.cjs'), realRequire = createRequire(source);
    const sandbox = {module:{exports:{}},JSON,__dirname:path.dirname(source),process:{...process,env:{...process.env,XLD_MUSCRIPTOR_PYTHON:process.execPath}},
      require:name => name==='child_process' ? {spawn} : realRequire(name)};
    vm.runInNewContext(await fs.readFile(source,'utf8'),sandbox);
    const service = sandbox.module.exports.createService({analysisRoot:root});
    const chosen = await separation('demucs-6s'), another = await separation('bs-roformer-sw');
    await assets.activateStems(track,chosen);
    await assets.setOtherRoute(track,'direct');
    const choices = {bass:'bass-muscriptor-medium',piano:'piano-muscriptor-medium',guitar:'muscriptor-medium'};
    const steps = [{id:'stems',kind:'stems',engine:chosen.engine},{id:'mood',kind:'mood'},
      ...Object.entries(choices).map(([stem,engine])=>({id:'midi:'+stem,kind:'midi',stem,engine})),{id:'merge',kind:'merge'}];
    const preview = () => service.previewOneClick(track,steps,{otherRoute:'direct',device:'auto'});
    const part = (stem,engine,old) => midi(stem,engine,randomUUID(),chosen.runId,path.join(directory,'stems',chosen.runId,stem+'.wav'),old);

    const empty = await preview();
    assert.equal(empty['midi:bass'].state,'pending'); assert.equal(empty.mood.state,'pending');
    const legacy = {};
    for (const [stem,engine] of Object.entries(choices)) {
      legacy[stem] = await part(stem,engine,true);
      await assets.midi.activate(track,legacy[stem]);
    }
    // A pointer-only installation from before run records still qualifies; inspection cannot backfill it.
    await fs.unlink(assets.midi.runRecordPath(track,'bass',legacy.bass.runId));
    const manualBeforeUpgrade = await part('piano','manual-revision',false);
    await assets.midi.activate(track,manualBeforeUpgrade);
    const stale = await preview();
    const {legacyIdentity}=require('../core/onetrack-upgrade.cjs');
    const old=legacy.bass,oldEngine=choices.bass;
    assert(legacyIdentity(old,oldEngine));
    assert(!legacyIdentity({...old,model:old.model+'-unregistered'},oldEngine));
    assert(!legacyIdentity({...old,options:{...old.options,cfg:2}},oldEngine));
    assert(!legacyIdentity({...old,backend:{...old.backend,checkpointSha256:'0'.repeat(64)}},oldEngine));
    assert(!legacyIdentity({...old,engine:'other-muscriptor-medium'},'other-muscriptor-medium'));
    const disabled=await service.previewOneClick(track,steps.map(step=>step.stem==='bass'?{...step,state:'unavailable',reason:{code:'engine-missing'}}:step),{otherRoute:'direct',device:'auto'});
    assert.equal(disabled['midi:bass'].state,'upgrade','missing model weights do not block a CPU upgrade');
    await assert.rejects(fs.stat(assets.midi.runRecordPath(track,'bass',legacy.bass.runId)),{code:'ENOENT'});
    const changedInputs = await service.previewOneClick(track,steps.map(step=>step.kind==='stems'?{...step,engine:another.engine}:step),{otherRoute:'direct',device:'auto'});
    assert.equal(changedInputs['midi:bass'].state,'rerun','new stems will not feed the same source identity');
    const interrupted=await service.run(track,choices.bass,{stem:'bass'},task=>{
      if(task?.status==='running') service.cancel();
    });
    assert.equal(interrupted.error,'analysis-cancelled');
    assert.equal((await assets.midi.read(track,'bass')).runId,old.runId,'an interrupted upgrade leaves the active old version alone');
    for (const [stem,engine] of Object.entries(choices)) {
      assert.deepEqual(stale['midi:'+stem],{state:'upgrade',reason:{code:'onetrack-upgrade'}});
      const ran = await service.run(track,engine,{stem});
      assert(ran.ok && !ran.cached && ran.upgraded,ran.detail);
      assert.equal(ran.upgradeFrom,legacy[stem].runId);
      assert.notEqual(ran.result.runId,ran.upgradeFrom);
      assert.equal(ran.result.matches,true);
      const kept = await assets.midi.readRun(track,stem,legacy[stem].runId);
      assert(kept.ok && !kept.matches,'the previous model version remains readable');
    }
    assert((await assets.midi.readRun(track,'piano',manualBeforeUpgrade.runId)).ok);
    assert.notEqual((await assets.midi.read(track,'piano')).runId,manualBeforeUpgrade.runId,'new generation activates the new model version and preserves the old revision');
    assert.deepEqual(upgrades,['bass','bass','piano','guitar']); assert.deepEqual(invocations,[]);

    const sourceInfo = await mood.inputs(track,directory);
    await write(path.join(directory,'mood-curve.json'),{kind:'mood-curve',schemaVersion:1,duration:.1,step:.5,
      formulaVersion:'mood-direct-1',scaleVersion:'mood-scale-1',engineVersion:1,loudnessMode:'half',identity:identity.expected('mood-curve'),
      source:sourceInfo,belowFlatnessGate:[],fast:[.1,.1],slow:[.1,.1],shape:{fast:[0,0],slow:[0,0]},
      components:{lufs:[0,0],band28Dbfs:[0,0],logFlatness:[0,0]}});
    const manual = await part('guitar','manual-revision',false);
    await assets.midi.activate(track,manual);
    const merge = createMidiMerge({analysisRoot:root});
    const merged = await merge.plan(track);
    await write(merged.file,header);
    await write(path.join(merged.directory,'merge.json'),{kind:'midi-merge',schemaVersion:1,fingerprint:merged.fingerprint,sha256:hash(header),noteCount:3});
    const alternative = await part('bass','bass-muscriptor-large',false);
    await assets.midi.activate(track,alternative);
    assert(!(await merge.read(track)).ok,'the active Large part has no merge');
    const beforeSwitch = await preview();
    assert.equal(beforeSwitch.merge.state,'existing','the selected Medium part and manual guitar have a cached merge');
    assert.equal((await assets.midi.read(track,'bass')).runId,alternative.runId,'preview leaves the active model alone');
    await assets.activateStems(track,another);
    assert.equal(await service.readMoodStatus(track),'stale','the curve belongs to the inactive separation');
    const inactive = await preview();
    assert(Object.values(inactive).every(r=>r.state==='existing'),JSON.stringify(inactive));
    assert.equal((await assets.readStems(track)).runId,another.runId,'preview leaves the active separation alone');
    assert((await service.run(track,chosen.engine)).cached);
    assert((await service.run(track,'mood-curve')).cached);
    for (const [stem,engine] of Object.entries(choices)) assert((await service.run(track,engine,{stem})).cached);
    assert.equal((await assets.midi.read(track,'guitar')).runId,manual.runId);
    assert((await service.run(track,'midi-merge')).cached);
    assert.deepEqual(invocations,[],'upgrading and subsequent cache hits never invoke inference');

    const alternateEngine = 'piano-muscriptor-large', bad = await part('piano',alternateEngine,true);
    delete bad.backend.nativePrograms;
    await assets.midi.activate(track,bad);
    const checkAlternate = () => service.previewOneClick(track,steps.map(step=>step.stem==='piano'?{...step,engine:alternateEngine}:step),{otherRoute:'direct',device:'auto'});
    assert.equal((await checkAlternate())['midi:piano'].state,'rerun','native group evidence must pass the same check as an upgrade');
    const ordinary = await service.run(track,alternateEngine,{stem:'piano'});
    assert(ordinary.ok && !ordinary.upgraded && !ordinary.cached);
    assert.deepEqual(invocations,['piano']);
    const forced = await service.run(track,choices.bass,{stem:'bass',force:true});
    assert(forced.ok && !forced.upgraded && !forced.cached,'explicit force still runs the model');
    assert.deepEqual(invocations,['piano','bass']);
  } finally {
    assert.equal(path.dirname(await fs.realpath(root)),await fs.realpath(os.tmpdir()));
    await fs.rm(root,{recursive:true,force:true});
  }
};
