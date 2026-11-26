'use strict';
const {createHash} = require('node:crypto');
const {identityOf,profileFor} = require('./derived-assets.cjs');

// Complete source/destination identities of the six models changed in 4c6b20d
// (model, checkpoint, engine and every option). The other stem first shipped with oneTrack.
const pairs = Object.freeze({
  'muscriptor-medium':['7f141daf56b7658192f49876540dd07d1eaad8d72dfcc55183600cc48aa2c1f0','fa1fb8e891e651d1b6682252d551a54f4bdb2feab2d294ddccdc4da2ffd555d7'],
  'muscriptor-large':['5ab1fc2aa90df6c0dd2ad344fb84760383de8c56ccc0ea1a2ba63086598b16c0','bf4e3ababefbb5937e72c269e541eeb06895f766959115ffe450f24242eafa88'],
  'piano-muscriptor-medium':['b2ad297a7aafeea091552b1593424c02b93536377e987157d31e9745123f9198','bfd98fcf57dfe79d88c9d629d78285f9659ec12f453a047549522d5ca5e7d2ad'],
  'piano-muscriptor-large':['b867298fad9bc3c6912448225e7b7657196f8264d87097c1d2f6057946836105','d0ce170cb7f37f71d88ee35cbaf97a22b0b9806c6e4daa5683ef74e7ba762fd6'],
  'bass-muscriptor-medium':['99b5785c576b0cb80e1e43e7a00759fbb300255fae3aeecd5211813146008265','258e24f0c032adc0fb956b5b2da728a001782fd8acc5e47d338368a201ffa193'],
  'bass-muscriptor-large':['7d0a75d892e5573513426820cd28072c8d3fa341dea8091485b2b2c14321da9a','1a440bf7503ba2ce6577f9aa9572f16771b2d02ab5909552cc5bc230a30335d9']
});
function legacyIdentity(record,engine) {
  const pair = pairs[engine];
  return Boolean(pair && record && identityOf(profileFor(engine))===pair[1] && identityOf(record)===pair[0]);
}

function createProbe({python,runner,spawn}) {
  const checked = new Map();
  async function check(executable,args) {
    return new Promise((resolve,reject) => {
      const child = spawn(executable,args,{windowsHide:true,env:{...process.env,CUDA_VISIBLE_DEVICES:'',PYTHONDONTWRITEBYTECODE:'1',PYTHONIOENCODING:'utf-8'}});
      let out='', err='';
      child.stdout.on('data',buffer=>{out=(out+buffer).slice(-4096);});
      child.stderr.on('data',buffer=>{err=(err+buffer).slice(-1024);});
      child.once('error',reject);
      child.once('close',code=>{
        let result;
        try { result=JSON.parse(out.trim().split(/\r?\n/).at(-1)); } catch {}
        if (result?.ok===true && code===0) resolve(true);
        else if (result?.ok===false) resolve(false);
        else reject(Error(err || 'onetrack-check-failed'));
      });
    });
  }
  return async function find(track,midi,stem,engine,directory,preferredRunId) {
    const pair = pairs[engine];
    if (!pair || identityOf(profileFor(engine)) !== pair[1]) return null;
    const executable = python();
    if (!executable) return null;
    const source = await midi.source(track,stem).catch(()=>null);
    if (!source) return null;
    const {runs} = await midi.collectRuns(track,stem,engine);
    const candidates = [...runs.values()].filter(({raw}) => raw.sourceRunId === source.runId && legacyIdentity(raw,engine) &&
      /^[a-f0-9]{64}$/.test(raw.digests?.notes || '') && /^[a-f0-9]{64}$/.test(raw.digests?.midi || ''));
    candidates.sort((a,b)=>Number(b.raw.runId===preferredRunId)-Number(a.raw.runId===preferredRunId) ||
      String(b.raw.createdAt||'').localeCompare(String(a.raw.createdAt||'')));
    for (const {raw,recordFile} of candidates) {
      // This verifies the source path, timestamp, duration, size and both payload digests each
      // time, including when the Python reconstruction check for these exact bytes is cached.
      try { await midi.verify(raw,track,stem,{source,engine}); } catch { continue; }
      const args = ['--track-directory',directory,'--upgrade-from-run-id',raw.runId];
      const key = createHash('sha256').update(JSON.stringify([raw,recordFile,executable])).digest('hex');
      if (!checked.has(key)) {
        if (checked.size >= 128) checked.delete(checked.keys().next().value);
        checked.set(key,check(executable,['-B',runner(engine),'--check-onetrack',recordFile,...args,'--track-id',track.id,
          '--engine',engine,'--stem',stem,'--source-run-id',source.runId,'--input',source.path]).catch(error=>{checked.delete(key);throw error;}));
      }
      if (await checked.get(key)) return {runId:raw.runId,digests:raw.digests,recordFile,python:executable,args};
    }
    return null;
  };
}
module.exports = {createProbe,legacyIdentity};
