'use strict';
// One definition of which result engines exist. The ids used to be copy-pasted into three files, each copy quietly
// serving a different job — what can be run, what can be read, what can be deleted — so editing one of them did a
// different thing depending on which one you picked. This pins the registry's shape and pins the one remaining
// copy (app.js, a renderer script with no module system) against it, so a future divergence fails the chain.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const registry=require('../core/result-engines.cjs');
const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const service=fs.readFileSync(path.join(__dirname,'..','core','analysis-service.cjs'),'utf8');
const main=fs.readFileSync(path.join(__dirname,'..','desktop','main.cjs'),'utf8');

const literal=(text,name)=>{
 const match=new RegExp('const '+name+' = (\\[[^\\]]*\\]);').exec(text);
 assert(match,name+' literal not found');
 return JSON.parse(match[1].replace(/'/g,'"'));
};

// --- the registry itself ---------------------------------------------------------------------------------------
assert.deepEqual([...registry.MSAF_ENGINE_IDS],['msaf','msaf-sf','msaf-foote','msaf-cnmf']);
assert.deepEqual([...registry.AI_ENGINE_IDS],['songformer']);
assert.deepEqual([...registry.SECTION_ENGINE_IDS],[...registry.MSAF_ENGINE_IDS,...registry.AI_ENGINE_IDS]);
assert.deepEqual([...registry.RESULT_ENGINE_IDS],[...registry.SECTION_ENGINE_IDS,...registry.HARMONY_ENGINE_IDS]);
assert.equal(new Set(registry.RESULT_ENGINE_IDS).size,registry.RESULT_ENGINE_IDS.length,'ids are unique');
for(const name of ['MSAF_ENGINE_IDS','AI_ENGINE_IDS','HARMONY_ENGINE_IDS','SECTION_ENGINE_IDS','RESULT_ENGINE_IDS'])
 assert(Object.isFrozen(registry[name]),name+' is frozen');

// --- retirement is a flag, never a removal ----------------------------------------------------------------------
// This is the property the whole round rests on: a retired engine stops being offered, and nothing else changes.
// Its stored results stay readable, stay in music-lab.json, and above all stay DELETABLE — retiring a bad engine
// and then being unable to clear what it produced would be the exact opposite of the point.
for(const engine of Object.keys(registry.RETIRED_RESULT_ENGINES))
 assert(registry.RESULT_ENGINE_IDS.includes(engine),engine+' is retired but no longer registered: its results would become unreadable and undeletable');
for(const engine of registry.RESULT_ENGINE_IDS) {
 assert(registry.isResultEngineId(engine),engine+' must stay a known id whatever its retirement state');
 assert.equal(registry.isRetiredResultEngine(engine),Boolean(registry.RETIRED_RESULT_ENGINES[engine]));
}
assert.deepEqual(registry.offeredResultEngines(),registry.RESULT_ENGINE_IDS.filter(e=>!registry.isRetiredResultEngine(e)));
assert.equal(registry.isResultEngineId('../manual-tags'),false);
assert.equal(registry.isResultEngineId(''),false);
assert.equal(registry.retirementOf('nope'),null);
// A retirement entry has to say when and why, or the next reader cannot tell a decision from an accident.
for(const [engine,note] of Object.entries(registry.RETIRED_RESULT_ENGINES)) {
 assert(note&&typeof note.since==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(note.since),engine+' needs a retirement date');
 assert(note.reason&&note.reason.length>8,engine+' needs a reason a person can read');
}

// --- the two rewritten call sites take it from here -------------------------------------------------------------
for(const [name,text] of [['core/analysis-service.cjs',service],['desktop/main.cjs',main]]) {
 assert(/require\((?:'\.\/|'\.\.\/core\/)result-engines\.cjs'\)/.test(text),name+' must import the registry');
 assert(!/const MSAF_ENGINE_IDS = \[/.test(text),name+' must not keep its own copy of the ids');
}

// --- the renderer copy, which cannot require, must still agree ---------------------------------------------------
assert.deepEqual(literal(app,'MSAF_ENGINE_IDS'),[...registry.MSAF_ENGINE_IDS],'app.js drifted from the registry');
assert.deepEqual(literal(app,'AI_ENGINE_IDS'),[...registry.AI_ENGINE_IDS],'app.js drifted from the registry');
assert.deepEqual(literal(app,'HARMONY_ENGINE_IDS'),[...registry.HARMONY_ENGINE_IDS],'app.js drifted from the registry');
assert(app.includes("const PRIMARY_HARMONY_ENGINE = 'chord-chordmini'"),'the primary chord engine is the one the comparison chose');
assert(registry.HARMONY_ENGINE_IDS.includes('chord-chordmini'));

// --- every id the per-engine rate tables mention is a real id ----------------------------------------------------
for(const text of [service,main])
 for(const id of [...text.matchAll(/'((?:msaf|chord)[a-z0-9-]*|songformer)':\s*[\d.]+/g)].map(m=>m[1]))
  assert(registry.RESULT_ENGINE_IDS.includes(id),id+' appears in a rate table but is not a registered engine');

// --- retirement has to actually reach the two places that matter --------------------------------------------
// A flag nobody reads is not a retirement. These two are what make it real, and neither touches reading or deleting.
assert(/if \(!isStems && !isMidi && resultEngines\.isRetiredResultEngine\(engine\)\) return \{ ok: false, error: 'engine-retired' \};/.test(service),
 'the service must refuse to START a retired engine');
assert(/\.filter\(engine => !retired\(engine\?\.id\)\)/.test(main),'the offered engine list must drop retired ids');
// Reading and deleting must NOT consult it, or retiring a bad engine would strip the ability to clear its output.
assert(!/isRetired|offeredResultEngines/.test(fs.readFileSync(path.join(__dirname,'..','core','result-delete.cjs'),'utf8')),
 'deletion must not care whether an engine is retired');
assert(!/isRetired|offeredResultEngines/.test(fs.readFileSync(path.join(__dirname,'..','core','result-sweep.cjs'),'utf8')),
 "the sweep must list a retired engine's results, or they could never be cleared");
// Every error code the new paths can return has a sentence in both locales. The alternative is what the audit
// found elsewhere: an internal token printed verbatim into a Chinese interface.
const messages=fs.readFileSync(path.join(__dirname,'..','i18n','runtime-messages.js'),'utf8');
for(const code of ['engine-retired','result-delete-invalid','result-delete-too-many','result-delete-changed',
 'result-delete-not-trashed','result-delete-not-a-file','result-delete-name-invalid','result-delete-path-invalid',
 'result-delete-trash-unavailable','unknown-engine','unknown-track','analysis-busy'])
 assert(new RegExp(String.raw`'${code}':\['[^']+','[^']+'\]`).test(messages),code+' must read as a sentence in both locales, not as itself');

console.log('result engines: ok ('+registry.RESULT_ENGINE_IDS.length+' registered, '+Object.keys(registry.RETIRED_RESULT_ENGINES).length+' retired; retirement never removes an id)');
