'use strict';
// The second round of worn parts (work/score-depth-20261118/SPEC-PARTS.md, assets-gpt-2/HANDOFF.md): seven meter
// frames and toggle pairs bound to the channels A to G by channel id, the shared meter glass, the PPI bezel (which
// replaces the drawn rim and bevel, the ticks going on over it) and its glass, the nixie shell and glass. Each part
// that does not load leaves its own drawing in place.
const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const {runInNewContext} = require('node:vm');
const {mockCanvas, ScoreView, fullModel} = require('./helpers.cjs');
const Presentation = require('../score-presentation.js');
const Telegraph = require('../score-telegraph.js');

const read = name => readFileSync(join(__dirname, '..', name), 'utf8');
const song = fullModel();
const options = {scoreStyle: 'glass', presentationLayout: true, mergeTimbres: true, offsetSeconds: 0};
// assets-gpt-2/bench/maintained/channel-parts.json, as GPT handed it over.
const EXPECTED = [
  {channel: 'VOX', frame: 'meter-frame-a', up: 'toggle-up', down: 'toggle-down'},
  {channel: 'GUITAR', frame: 'meter-frame-b', up: 'toggle-up-b', down: 'toggle-down-b'},
  {channel: 'PIANO', frame: 'meter-frame-c', up: 'toggle-up-c', down: 'toggle-down-c'},
  {channel: 'STRINGS', frame: 'meter-frame-d', up: 'toggle-up-d', down: 'toggle-down-d'},
  {channel: 'WINDS', frame: 'meter-frame-e', up: 'toggle-up-e', down: 'toggle-down-e'},
  {channel: 'BASS', frame: 'meter-frame-f', up: 'toggle-up-f', down: 'toggle-down-f'},
  {channel: 'DRUMS', frame: 'meter-frame-g', up: 'toggle-up-g', down: 'toggle-down-g'}
];
const IDS = ['vocals', 'guitar', 'piano', 'strings', 'winds', 'bass', 'drums'];

// A radar of its own in a page-like context: images come from assets/radar/, those named in `fail` never decode.
async function page(fail = []) {
  class Image {
    decode() { return fail.some(f => this.src.endsWith('/' + f)) ? Promise.reject(new Error('missing')) : Promise.resolve(); }
  }
  const globals = {URL, Image, document: {currentScript: {src: 'https://test.invalid/score-radar.js'}}};
  runInNewContext(read('score-radar-lamps.js'), globals);
  runInNewContext(read('score-radar.js'), globals);
  await globals.XinScoreRadar.ready();
  return globals.XinScoreRadar;
}
function post(Radar, model) {
  const output = mockCanvas(1440, 900), layers = [];
  output.canvas.getContext().clearRect = () => {};
  const make = () => { const layer = mockCanvas(); layer.canvas.getContext().canvas = layer.canvas; layer.canvas.ownerDocument = doc; layers.push(layer); return layer.canvas; };
  const doc = {createElement: make};
  output.canvas.ownerDocument = doc;
  const globals = {URL, document: {currentScript: {src: 'https://test.invalid/score-mood.js'}},
    Image: class {decode() {return Promise.resolve();}}, XinScoreView: ScoreView, XinScorePresentation: Presentation,
    XinScoreRadar: Radar, XinScoreTelegraph: Telegraph};
  runInNewContext(read('score-mood.js'), globals);
  const view = globals.XinScoreMood.create(output.canvas, model, () => 0, options);
  const calls = () => layers.flatMap(l => l.calls);
  return {view, layers, calls, reset: () => layers.forEach(l => l.reset())};
}
const all = () => {
  const beats = Array.from({length: 129}, (_, i) => i / 2), downbeats = beats.filter((_, i) => i % 4 === 0);
  return {...song, track: {...song.track, duration: 64}, bars: {bpm: 120, beatsPerBar: 4, beats, downbeats, steady: true},
    lanes: IDS.map(group => ({id: group, kind: 'pitched', group, notes: [[1, 30, group === 'bass' ? 40 : 64, 100]]}))};
};
const file = call => call.name === 'drawImage' && call.args[0] && typeof call.args[0].src === 'string' ? call.args[0].src.split('/').pop() : null;
const images = (calls, name) => calls.filter(c => file(c) === name);

test('batch 5 is registered: 26 files, each in assets/radar, the seven channels on frames and toggles A to G (VOX without -a)', async () => {
  const Radar = await page();
  const files = Object.values(Radar.MATERIAL_FILES);
  assert.equal(files.length, 43);
  for (const row of EXPECTED) for (const name of [row.frame, row.up, row.down]) assert.ok(files.includes(name + '.png'), name);
  for (const name of ['meter-glass', 'ppi-bezel', 'ppi-glass', 'nixie-shell', 'nixie-glass']) assert.ok(files.includes(name + '.png'), name);
  assert.equal(Radar.materials().length, 43, 'all of them decode here');
  EXPECTED.forEach((row, i) => {
    const parts = Radar.CHANNEL_PARTS[IDS[i]];
    assert.equal(Radar.MATERIAL_FILES[parts.frame], row.frame + '.png', row.channel);
    assert.equal(Radar.MATERIAL_FILES[parts.up], row.up + '.png', row.channel);
    assert.equal(Radar.MATERIAL_FILES[parts.down], row.down + '.png', row.channel);
  });
});

test('each channel draws its own frame, the shared glass and its own toggle; a solo flips the others to their down picture', async () => {
  const Radar = await page();
  const {view, calls, reset} = post(Radar, all());
  const first = view.draw(4);
  const drawn = calls();
  EXPECTED.forEach((row, i) => {
    const y = 163 + 85 * i;
    const frames = images(drawn, row.frame + '.png');
    assert.equal(frames.length, 1, row.frame + ' once, into the cached over layer');
    assert.deepEqual(frames[0].args.slice(1), [30.5, y - 3.5, 171, 81]);
    const up = images(drawn, row.up + '.png');
    assert.equal(up.length, 1, row.channel + ' is IN');
    assert.deepEqual(up[0].args.slice(1), [246, y + 12, 24, 50]);
    assert.equal(images(drawn, row.down + '.png').length, 0);
    assert.equal(first.motion.toggles[IDS[i]], Radar.CHANNEL_PARTS[IDS[i]].up);
  });
  assert.equal(images(drawn, 'meter-glass.png').length, 7);
  assert.deepEqual(JSON.parse(JSON.stringify(first.motion.levers.map(l => [l.channel, l.up]))), IDS.map(id => [id, true]), 'out.levers as before');
  // Solo GUITAR: the other six go to OUT, their toggles to the down picture; GUITAR stays up.
  view.setOptions({...options, focusGroup: 'guitar'});
  reset();
  const solo = view.draw(4), live = calls();
  EXPECTED.forEach((row, i) => {
    const on = IDS[i] === 'guitar';
    assert.equal(images(live, (on ? row.up : row.down) + '.png').length, 1, row.channel);
    assert.equal(images(live, (on ? row.down : row.up) + '.png').length, 0, row.channel);
    assert.equal(solo.motion.levers[i].up, on);
  });
  assert.equal(images(live, EXPECTED[0].frame + '.png').length, 0, 'the frames are hardware: not drawn again');
});

test('the PPI bezel replaces the drawn rim and bevel, the ticks go on after it; its glass sits under the mouth\'s shadow', async () => {
  const Radar = await page();
  const {view, layers} = post(Radar, all());
  view.draw(4);
  const base = layers.find(l => l.calls.some(c => file(c) === 'ppi-bezel.png')).calls;
  const at = base.findIndex(c => file(c) === 'ppi-bezel.png');
  assert.deepEqual(base[at].args.slice(1), [361, 125, 600, 600]);
  const firstTick = base.findIndex(c => c.name === 'stroke' && c.strokeStyle === '#e4dfc8');
  assert.ok(firstTick > at, 'the ticks are drawn over the bezel');
  assert.ok(!base.slice(0, firstTick).some(c => c.name === 'stroke' && c.strokeStyle === '#4a4c42'), 'no drawn rim under the bezel');
  const over = layers.find(l => l.calls.some(c => file(c) === 'ppi-glass.png')).calls;
  assert.deepEqual(over.find(c => file(c) === 'ppi-glass.png').args.slice(1), [391, 155, 540, 540]);
});

test('nixie: a shell over each unlit digit cell in the base, a glass over each lit one; separators only advance', async () => {
  const Radar = await page();
  const {view, calls} = post(Radar, all());
  view.draw(4);
  const drawn = calls();
  // 888 + 888·8 + 88:88 = 3 + 4 + 4 digit cells.
  assert.equal(images(drawn, 'nixie-shell.png').length, 11);
  assert.equal(images(drawn, 'nixie-glass.png').length, 11);
  for (const c of images(drawn, 'nixie-shell.png')) { assert.equal(c.args[3], 21 * 28 / 30); assert.equal(c.args[4], 42); }
});

test('a part that does not load leaves its own drawing: no error, the rest still use theirs', async () => {
  const Radar = await page(['toggle-down-c.png', 'meter-frame-b.png', 'ppi-bezel.png', 'nixie-glass.png']);
  assert.equal(Radar.materials().length, 39);
  const {view, calls, reset} = post(Radar, all());
  view.setOptions({...options, focusGroup: 'guitar'});
  const frame = view.draw(4), drawn = calls();
  // PIANO is down and its down picture is missing: the drawn lever (the ivory ball) instead of either picture.
  assert.equal(images(drawn, 'toggle-up-c.png').length, 0);
  assert.equal(frame.motion.toggles.piano, undefined);
  assert.ok(drawn.some(c => c.name === 'fill' && c.fillStyle === '#d6d4c8'), 'the drawn ball');
  assert.equal(frame.motion.toggles.drums, 'toggleDownG', 'the others keep their pictures');
  // GUITAR's frame is missing: the old frame's shadow box, no glass on that face; the others framed.
  assert.equal(images(drawn, 'meter-glass.png').length, 6);
  // The bezel is missing: the drawn rim and bevel are back.
  assert.ok(drawn.some(c => c.name === 'stroke' && c.strokeStyle === '#4a4c42' && c.lineWidth === 2), 'the drawn rim');
  assert.equal(images(drawn, 'nixie-glass.png').length, 0);
  assert.ok(images(drawn, 'nixie-shell.png').length > 0);
  reset();
  assert.doesNotThrow(() => view.draw(5));
});
