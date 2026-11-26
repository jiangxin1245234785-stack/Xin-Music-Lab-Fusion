'use strict';
// 车窗地貌's hand-painted materials (batch 7): the table in score-terrain-assets.js names every shipped file, the files are
// there with the hashes the table records, the set stays under 8 MB, and where pictures cannot load (Node) the look
// draws with its own code.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const Assets = require('../score-terrain-assets.js');
const terrain = require('../score-terrain.js');
const DIR = path.join(__dirname, '..', 'assets', 'terrain');

test('the table covers GPT\'s whole set, every file is there with its hash, under 8 MB', () => {
  assert.equal(Assets.TABLE.length, 101);
  const keys = new Set(Assets.TABLE.map(t => t.key));
  assert.equal(keys.size, 101, 'no key twice');
  for (const kind of ['roadside/pole-a', 'roadside/windpump-wheel-a', 'roadside/bird-f', 'station/station-sign-c', 'station/crossing-signal-lit-r-b',
    'station/town-depot-b', 'carriage/curtain-left-a', 'carriage/led-bezel-b', 'ground-sky/plain-tile-a', 'ground-sky/rail-strip-a',
    'overlay/range-texture-d', 'overlay/haze-strip-b']) assert.ok(keys.has(kind), kind);
  let total = 0;
  for (const t of Assets.TABLE) {
    const bytes = fs.readFileSync(path.join(DIR, t.file));
    assert.equal(bytes.length, t.bytes, t.file);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), t.sha256, t.file);
    assert.ok(t.k > 0 && t.k <= 1, 'never upscaled: ' + t.file);
    assert.ok(Array.isArray(t.anchor) && Array.isArray(t.bbox), t.file);
    total += bytes.length;
  }
  assert.ok(total <= 8 * 1024 * 1024, 'the set is ' + total + ' bytes');
  const onDisk = [];
  const walk = d => { for (const e of fs.readdirSync(d, {withFileTypes: true})) e.isDirectory() ? walk(path.join(d, e.name)) : onDisk.push(path.relative(DIR, path.join(d, e.name)).split(path.sep).join('/')); };
  walk(DIR);
  assert.deepEqual(onDisk.sort(), Assets.TABLE.map(t => t.file).sort(), 'nothing on disk outside the table');
});

test('no pictures (Node): never ready, the look draws with code', async () => {
  assert.equal(await Assets.ready(), false);
  assert.equal(Assets.isReady(), false);
  assert.equal(Assets.get('roadside/pole-a'), null);
  assert.equal(await terrain.ready(), false);
  const ctx = new Proxy({}, {get: (t, k) => k in t ? t[k] : k === 'canvas' ? {width: 800, height: 450} : k === 'measureText' ? () => ({width: 10}) : k === 'getTransform' ? undefined : () => ({addColorStop() {}}), set: (t, k, v) => { t[k] = v; return true; }});
  const song = {track: {duration: 60, title: 't', artist: 'a'}, lanes: [{group: 'bass', notes: [[1, 20, 40, 90]]}], sections: []};
  const S = terrain.draw(ctx, {song, w: 800, h: 450, time: 10});
  assert.equal(S.art, 'code');
});

test('the painted wheel makes a continuous full turn around each tower’s measured hub', () => {
  const {wheelAngle, wheelPlace} = terrain._internal;
  const tau = 2 * Math.PI, step = 1 / 60;
  for (const i of [0, 1, 25]) {
    const positive = n => (n + tau) % tau;
    let turn = 0;
    for (let f = 0; f < 360; f++) {
      const t = 70 + f * step, advance = positive(wheelAngle(t + step, i) - wheelAngle(t, i));
      assert.ok(Math.abs(advance - tau / 360) < 1e-10, 'each frame advances one degree, even through zero');
      turn += advance;
    }
    assert.ok(Math.abs(turn - tau) < 1e-10);
    const phase = wheelAngle(70, i);
    assert.ok(Math.abs(phase - wheelAngle(71, i)) > .9, 'rotation preserves the asymmetrical paint over a full circle');
    wheelAngle(99, i);
    assert.equal(wheelAngle(70, i), phase);
  }
  const rotor = Assets.TABLE.find(a => a.key === 'roadside/windpump-wheel-a');
  assert.deepEqual(rotor.anchor, [260, 260]);
  for (const [variant, letter, hub] of [[0, 'a', [191, 192]], [1, 'b', [203, 94]], [2, 'c', [205, 290]]]) {
    const tower = Assets.TABLE.find(a => a.key === 'roadside/windpump-' + letter);
    const {dx, dy, size} = wheelPlace(tower, 65, 96, variant);
    const f = 9 * 65 * (.9 + .2 * 96 / 127) / 938;
    assert.ok(size > 0 && size < 413 * f + 1);
    assert.equal(dx, (hub[0] - tower.anchor[0]) * f);
    assert.equal(dy, (hub[1] - tower.anchor[1]) * f);
  }
});
