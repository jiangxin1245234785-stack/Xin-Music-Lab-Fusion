'use strict';
// fusion.js sectionSignals: the section under the playhead is looked up by its tidied name (from XLD's
// core/sections.cjs), falling back to its label. Runs the real block between the markers in fusion.js.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'fusion.js'), 'utf8');
const start = source.indexOf('// --- section signals (start) ---'), end = source.indexOf('// --- section signals (end) ---');
assert.ok(start > 0 && end > start, 'the section signals block is marked in fusion.js');
const sandbox = {};
vm.runInNewContext(`${source.slice(start, end)}\nthis.sectionSignals = sectionSignals; this.SECTION_SIGNALS = SECTION_SIGNALS;`, sandbox);
const {sectionSignals, SECTION_SIGNALS: S} = sandbox;

// Names first, numbers ignored, both languages.
assert.equal(sectionSignals({name: '副歌 3', label: 'chorus'}), S.climax);
assert.equal(sectionSignals({name: 'Verse 2', label: 'verse'}), S.plain);
assert.equal(sectionSignals({name: '引子', label: 'intro'}), S.quiet);
assert.equal(sectionSignals({name: '桥段', label: 'bridge'}), S.build);
// A mid-song intro is shown as an interlude, and its signals follow the name, not the raw label.
assert.equal(sectionSignals({name: '间奏 1', label: 'intro'}), S.other);
assert.equal(sectionSignals({name: 'Interlude', label: 'inst'}), S.other);
// Without a name (manual tags, clustering engines): the label, as a whole word.
assert.equal(sectionSignals({label: 'chorus'}), S.climax);
assert.equal(sectionSignals({label: '高潮'}), S.climax);
assert.equal(sectionSignals({label: 'silence'}), S.drop);
assert.equal(sectionSignals({label: 'inst'}), S.other, 'SongFormer inst stays where it always was');
assert.equal(sectionSignals({label: 'A'}), S.other);
assert.equal(sectionSignals({label: '这里是副歌前的铺垫'}), S.other, 'no more substring guessing');
assert.equal(sectionSignals('Chorus'), S.climax);
assert.equal(sectionSignals(null), S.other);

// An old bridge manifest (no `name`), as XML's main process hands it over after namedManifest.
const {namedManifest} = require('../../xld-runtime-baseline/core/sections.cjs');
const song = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'xld-runtime-baseline', 'tests', 'fixtures', 'sections-songs.json'), 'utf8')).songs.MEGURI;
const manifest = namedManifest({timing: {duration: song.duration}, analyses: [{engine: {id: 'songformer'}, segments: song.segments.map(s => ({...s}))}]});
const at = time => manifest.analyses[0].segments.find(s => s.start <= time && time < s.end);
assert.equal(at(95).label, 'intro', 'the 1:30 seam piece is labelled intro');
assert.equal(at(95).name, '间奏 1');
assert.equal(sectionSignals(at(95)), S.other, 'and drives like an interlude, not like an intro');
assert.equal(sectionSignals(at(5)), S.quiet, 'the real intro stays quiet');
assert.equal(sectionSignals(at(170)), S.climax);
assert.ok(source.includes('sectionSignals(structure.segment)'), 'callers pass the segment, so the name is seen');
console.log('XML section signals: PASS (names first, whole words, old manifests named in memory)');
