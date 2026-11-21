'use strict';
// W3: XML takes the winds part. The score adapter makes winds lanes (one per instrument, in the winds group, between
// strings and bass); a song without winds MIDI gets no winds lane; the audition list, the stem selector and the
// loudness layer all know winds.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {modelFrom} = require('../../scoreview/adapter/track-model.cjs');

const note = (start, pitch) => ({start, end: start + 0.5, pitch, velocity: 90});
const stems = withWinds => ({
  strings: {notes: [note(1, 60), note(2, 62)], engine: 'strings-muscriptor-large', runId: 's1'},
  bass: {notes: [note(1, 40)], engine: 'bass-muscriptor-large', runId: 'b1'},
  winds: withWinds ? {
    notes: [note(1, 70), note(3, 72), note(5, 65)], engine: 'winds-muscriptor-large', runId: 'w1',
    instruments: [{index: 0, name: 'clarinet', program: 71, notes: [note(1, 70), note(3, 72)]},
                  {index: 1, name: 'flutes', program: 73, notes: [note(5, 65)]}]
  } : {error: 'midi-missing'}
});

const result = modelFrom({stems: stems(true), track: {id: 't', title: 'x'}, duration: 10});
assert.ok(result.ok, JSON.stringify(result.health));
const lanes = result.model.lanes;
const winds = lanes.filter(lane => lane.group === 'winds');
assert.deepEqual(winds.map(lane => lane.label), ['单簧管', '长笛'], 'one winds lane per instrument, named in Chinese');
assert.ok(winds.every(lane => lane.groupLabel === '管乐'), 'the winds group is called 管乐');
assert.ok(winds.every(lane => lane.meta.engine === 'winds-muscriptor-large'), 'the model travels with each winds lane (for the lane tooltip)');
const order = [...new Set(lanes.map(lane => lane.group))];
assert.ok(order.indexOf('strings') < order.indexOf('winds') && order.indexOf('winds') < order.indexOf('bass'), 'winds sit between strings and bass: ' + order);
assert.equal(result.health.lanes.winds.instruments, 2);

const none = modelFrom({stems: stems(false), track: {id: 't', title: 'x'}, duration: 10});
assert.ok(none.ok);
assert.ok(!none.model.lanes.some(lane => lane.group === 'winds'), 'no winds MIDI, no winds lane');
assert.equal(none.health.lanes.winds.ok, false);

const read = rel => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
assert.match(read('stem-controls.js'), /'strings','winds'\]/, 'the stem selector lists winds');
assert.match(read('desktop/score-dynamics.cjs'), /for\(const stem of \[[^\]]*'winds'[^\]]*\]\)/, 'the loudness layer covers winds');
assert.match(read('desktop/main.cjs'), /for\(const name of \['strings','winds'\]\)\s*\{\s*if \(!midiStemAllowed\(name, otherRoute\)\) continue;\s*const midi=await xldAnalysis\.readMidi\(track,name\)/, 'audition offers the dug-out winds audio on the split route');
console.log('winds score: PASS (winds lanes per instrument in the 管乐 group between strings and bass, model on each lane, none without winds MIDI, audition / selector / loudness lists)');
