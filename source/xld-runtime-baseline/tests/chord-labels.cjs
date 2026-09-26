'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../timeline-controls.js'),'utf8'),context);
const {chordTones,chordParts}=context.window.XldTimelineControls;
const cases={
 C9:[0,2,4,7,10],Cmaj9:[0,2,4,7,11],Cm7b5:[0,3,6,10],C7b9:[0,1,4,7,10],
 C:[0,4,7],Cm:[0,3,7],C6:[0,4,7,9],Cm6:[0,3,7,9],CmM7:[0,3,7,11],
 Cdim7:[0,3,6,9],Chdim7:[0,3,6,10],Csus2:[0,2,7],Csus4:[0,5,7],Caug:[0,4,8],
 Cm9:[0,2,3,7,10],C7sharp9:[0,3,4,7,10],'C:(1,b3,5)':[0,3,7],
 'C:maj7(*5,9)':[0,2,4,11],'C7/E':[0,4,7,10],'C:7/3':[0,4,7,10],
 'Dbmaj7':[0,1,5,8],'Bbmin7':[1,5,8,10],Cadd9:[0,2,4,7]
};
for(const [label,expected]of Object.entries(cases))assert.deepEqual([...chordTones(label.replace('sharp','#'))].sort((a,b)=>a-b),expected,label);
for(const label of ['N','X','Cunknown','Cmaj9garbage','C7b9garbage','C(garbage)','C/garbage','H7','C7/3/5']){
 assert.equal(chordTones(label),null,label);assert.equal(chordParts(label),null,label+' parts');
}
const runner=fs.readFileSync(path.join(__dirname,'../analysis-harmony/harmony_runner.py'),'utf8');
const suffixes=runner.slice(runner.indexOf('_QUAL_SUFFIX ='),runner.indexOf('def mirex_to_label'));
for(const [,suffix]of suffixes.matchAll(/": "([^"]*)"/g))assert(chordTones('C'+suffix),'current engine suffix '+suffix);
console.log('chord labels: PASS (actual engine suffixes, extended/altered/Harte labels and unknown refusal)');
