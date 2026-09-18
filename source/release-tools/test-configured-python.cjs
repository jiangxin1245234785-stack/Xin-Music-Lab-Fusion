'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const keys=['XLD_MIDI_PYTHON','XLD_HIGHRES_PYTHON','XLD_ROFORMER_PYTHON','XLD_YOURMT3_PYTHON','XLD_MUSCRIPTOR_PYTHON','XLD_AI_PYTHON','XLD_PYTHON','XLD_HARMONY_PYTHON','XLD_CHORDS_PYTHON'];
const before=Object.fromEntries(keys.map(k=>[k,process.env[k]])),exists=fs.existsSync,spawn=cp.spawn;let legacyChecks=0;
fs.existsSync=p=>{if(String(p).includes('UNINSTALLED'))return false;if(String(p).includes('D:')){legacyChecks++;return true;}return exists(p);};cp.spawn=()=>assert.fail('Missing configured Python must not spawn a legacy interpreter');
for(const k of keys)process.env[k]='Z:/UNINSTALLED/python.exe';
(async()=>{try{const service=require('../xld-runtime-baseline/core/analysis-service.cjs').createService();const rows=[...await service.midiEngines(),...await service.separationEngines()];assert(rows.length);assert(rows.every(r=>!r.available));assert.equal(legacyChecks,0);console.log('Configured Python: explicit missing paths never fall back to developer installations PASS');}finally{fs.existsSync=exists;cp.spawn=spawn;for(const k of keys){if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k];}}})().catch(e=>{console.error(e);process.exitCode=1;});
