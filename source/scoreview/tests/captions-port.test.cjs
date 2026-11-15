'use strict';
// The captions in XML are made by adapter/captions.cjs; stage one's were made by
// tools/make_captions.py and passed gate four. The two must say the same thing.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {captions, SPACING} = require('../adapter/captions.cjs');
const {modelFrom} = require('../adapter/track-model.cjs');
const {ScoreView, mockCanvas} = require('./helpers.cjs');

const REPO = path.join(__dirname, '..', '..', '..');
const DATA = path.join(REPO, 'work', 'scoreview-20261110', 'data');
const page = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'audition', 'page.json'), 'utf8'));

for (const pilot of ['qilixiang', 'meguri']) {
  const folder = path.join(DATA, pilot);
  const ready = fs.existsSync(path.join(folder, 'bundle.json')) && fs.existsSync(path.join(folder, 'captions.json'))
    && !fs.existsSync(path.join(folder, 'captions.manual.json'));
  test(`${pilot}: the same lines, at the same times, as the Python rules that passed gate four`, {skip: !ready}, () => {
    const model = JSON.parse(fs.readFileSync(path.join(folder, 'bundle.json'), 'utf8'));
    const before = JSON.parse(fs.readFileSync(path.join(folder, 'captions.json'), 'utf8')).captions;
    const now = captions(model, (page.songs[pilot] || {}).hidden || []);
    assert.ok(before.length > 0);
    assert.deepEqual(now.map(line => line[2]), before.map(line => line[2]));
    // Python rounds halves to even: a hundredth of a second apart at most.
    now.forEach((line, i) => assert.ok(Math.abs(line[0] - before[i][0]) < 0.011 && Math.abs(line[1] - before[i][1]) < 0.011, `${i}`));
  });
}

const note = (start, end, pitch) => ({start, end, pitch, velocity: 100});
const run = (from, to, pitch) => Array.from({length: (to - from) * 2}, (_, i) => note(from + i / 2, from + i / 2 + 0.4, pitch));

test('a track read through the adapter gets captions that the core shows, one at a time and never crowded', () => {
  // The rule sentences (the adapter's default is the marks since 2026-11-14; cues.test.cjs holds those).
  const built = modelFrom({track: {id: 'x', title: 't'}, audioUrl: 'file:///a', duration: 80, captionStyle: 'sentence', manifest: {
    analyses: [{engine: {id: 'songformer'}, segments: [{start: 0, end: 30, label: 'intro'}, {start: 30, end: 80, label: 'verse'}]}]},
    stems: {guitar: {notes: run(0, 80, 52)}, bass: {notes: run(30, 60, 36)}, vocals: {notes: run(40, 80, 60)}}});
  assert.equal(built.health.captions.ok, true);
  const lines = built.model.captions;
  assert.ok(lines.some(line => line[2].includes('进入主歌')) && lines.some(line => line[2].includes('人声进来了')) && lines.some(line => line[2].includes('贝斯退出')), JSON.stringify(lines));
  lines.forEach((line, i) => {
    assert.ok(line[1] > line[0] && line[3] === 'rule');
    if (i) assert.ok(line[0] - lines[i - 1][0] >= SPACING && line[0] >= lines[i - 1][1], '两条字幕不应当挤在一起');
  });
  const surface = mockCanvas();
  const view = ScoreView.create(surface.canvas, built.model, () => 0, {});
  assert.equal(view.layers().captions, true);
  assert.equal(view.draw(lines[0][0] + 1).caption, lines[0][2]);
});

test('nothing to say, or nothing to read, makes no captions and throws nothing', () => {
  for (const empty of [null, {}, {track: {duration: 0}, lanes: []}, {track: {duration: 10}}]) assert.deepEqual(captions(empty), []);
  const still = modelFrom({track: {id: 'x'}, audioUrl: 'file:///a', stems: {piano: {notes: run(0, 20, 60)}}});
  assert.ok(!('captions' in still.model));
  assert.equal(still.health.captions.ok, false);
});

test('short holes keep a part sounding in a section caption, and letter-only sections say nothing',()=>{
 const base={track:{duration:40},lanes:[{id:'guitar',label:'吉他',notes:[[0,10,60,100],[15,25,60,100]]}]};
 const withName=captions({...base,sections:[[11,40,'桥段','manual']]});
 assert(withName.some(c=>c[0]===11&&c[2].includes('只有吉他')),JSON.stringify(withName));
 const letters=captions({track:{duration:40},lanes:[{id:'guitar',label:'吉他',notes:[[0,40,60,100]]}],sections:[[10,40,'A','msaf']]});
 assert.deepEqual(letters,[],'A is a structural label without a verified semantic name');
});
