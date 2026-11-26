'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const {isDeepStrictEqual} = require('node:util');
const identity = require('./score-identity.cjs');
const {valid} = require('../../shared-analysis/mood-curve.js');
const ENGINE = 'mood-curve';

async function fileStamp(file) {
  const stat = await fs.stat(file, {bigint:true});
  if (!stat.isFile()) throw Error('mood-input-not-file');
  return {size:Number(stat.size),mtimeNs:String(stat.mtimeNs)};
}
async function optionalJson(file) {
  try { return JSON.parse(await fs.readFile(file,'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
async function inputs(track,directory,manifest) {
  const file = path.resolve(track.filePath);
  const source = {trackId:track.id,mix:{file,...await fileStamp(file)},stemRunId:null,stems:[]};
  if (manifest === undefined) manifest = await optionalJson(path.join(directory,'stems.json'));
  if (!manifest || manifest.trackId !== track.id) return source;
  if (typeof manifest.runId !== 'string' || !/^[\w-]+$/.test(manifest.runId) || !Array.isArray(manifest.stems) || !manifest.stems.length)
    throw Error('mood-invalid-stem-manifest');
  source.stemRunId = manifest.runId;
  const parent = path.join(directory,'stems',manifest.runId);
  const realDirectory = await fs.realpath(directory);
  const names = new Set();
  for (const stem of manifest.stems) {
    if (typeof stem?.file !== 'string' || !/^[a-z][a-z0-9_-]*$/i.test(stem.name || '') || names.has(stem.name)) throw Error('mood-invalid-stem');
    const resolved = path.resolve(directory,stem.file), gain = stem.gain ?? 1;
    if (path.dirname(resolved) !== parent || !['.flac','.wav'].includes(path.extname(resolved).toLowerCase()) ||
        !Number.isFinite(gain) || path.isAbsolute(stem.file) ||
        await fs.realpath(resolved) !== path.join(realDirectory,'stems',manifest.runId,path.basename(resolved))) throw Error('mood-invalid-stem');
    names.add(stem.name);
    source.stems.push({name:stem.name,file:path.relative(directory,resolved).split(path.sep).join('/'),gain,...await fileStamp(resolved)});
  }
  source.stems.sort((a,b)=>a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  return source;
}
function matches(record,source) {
  return valid(record) && record.engineVersion === 1 && record.formulaVersion === 'mood-direct-1' && record.scaleVersion === 'mood-scale-1' &&
    isDeepStrictEqual(record.identity,identity.expected(ENGINE)) && isDeepStrictEqual(record.source,source) &&
    record.loudnessMode === (source.stems.some(s=>s.name!=='vocals')?'half':'mix');
}
async function status(track,directory,manifest) {
  let record;
  try { record = await optionalJson(path.join(directory,ENGINE+'.json')); }
  catch { return 'stale'; }
  if (!record) return 'missing';
  try { return matches(record,await inputs(track,directory,manifest)) ? 'current' : 'stale'; }
  catch { return 'stale'; }
}
module.exports = {ENGINE,inputs,matches,status};
